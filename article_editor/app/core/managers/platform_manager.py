"""Platform generator adapter.

FormatConverter의 실제 생성 로직은 platform-generator에만 둔다.
App Core는 Node 구현을 모르도록 이 매니저를 통해 결과만 전달한다.

통신은 stdin/stdout 줄 단위 JSON이다. 코어가 첫 줄에 작업을 보내면 Node 는 외부 AI 가 필요할 때
{"type":"ai","id":N,"request":{OpenAI Responses 요청}} 줄을 내보내고, 코어가 기존 AI 경로(`ai.client.openai_call`,
AI_BACKEND=remote 면 백엔드 프록시)로 호출해 {"type":"ai_result","id":N,"ok":true,"response":{...}} 줄로 돌려준다.
Node 프로세스에는 OpenAI/Gemini 키를 넘기지 않는다.
"""
from __future__ import annotations

import json
import hashlib
import os
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path

from .. import media_assets, vault
from ..errors import RequestError
from ..storage import get_snapshot

# Node 프로세스에 넘기지 않는 값(외부 AI 호출은 코어가 대신한다)
_WITHHELD_ENV = ("OPENAI_API_KEY", "GEMINI_API_KEY", "AI_PROVIDER", "OPENAI_MODEL", "GEMINI_MODEL")


class PlatformManager:
    @staticmethod
    def _render_origin_key(asset_id, article_id, snapshot_id, render_key):
        origin=json.dumps([article_id,snapshot_id,render_key],ensure_ascii=False,separators=(',',':'))
        return 'platform_render:'+asset_id+':'+hashlib.sha256(origin.encode('utf-8')).hexdigest()

    def __init__(self):
        self._timeout = 210
        self._sns = None
        self._sns_lock = threading.RLock()

    def close(self):
        with self._sns_lock:
            if self._sns:
                self._sns.close()
                self._sns = None

    def sns(self, data):
        if not self._sns_lock.acquire(blocking=False):
            raise RequestError('이전 SNS 작업이 진행 중입니다.', 409)
        try:
            return self._sns_operation(data)
        finally:
            self._sns_lock.release()

    def _sns_operation(self, data):
        platform, action = data.get('platform'), data.get('action')
        if platform not in ('instagram', 'threads') or action not in ('connect', 'status', 'prepare', 'close'):
            raise RequestError('지원하지 않는 SNS 작업입니다.')
        payload = data.get('payload') or {}
        if not isinstance(payload, dict): raise RequestError('SNS 입력을 확인해 주세요.')
        if action == 'prepare':
            article_id, snapshot_id = data.get('articleId'), data.get('snapshotId')
            if not isinstance(article_id, str) or not article_id: raise RequestError('SNS 원고의 기사 ID가 필요합니다.')
            if snapshot_id:
                _, frozen = self._from_snapshot(data)
                if frozen['article_id'] != article_id: raise RequestError('SNS 원고와 고정본의 기사가 다릅니다.', 409)
            assets = payload.get('assets', [])
            if not isinstance(assets, list) or len(assets) > 10: raise RequestError('첨부할 카드 0~10장을 확인해 주세요.')
            files=[]
            for index, item in enumerate(assets):
                if not isinstance(item, dict): raise RequestError('카드 이미지 정보를 확인해 주세요.')
                with vault.connect() as db:
                    key=self._render_origin_key(str(item.get('id')),article_id,snapshot_id,item.get('key'))
                    row=db.execute('SELECT value FROM app_meta WHERE key=?', (key,)).fetchone()
                origin=json.loads(row[0]) if row else None
                if not origin or origin.get('article_id')!=article_id or origin.get('snapshot_id')!=snapshot_id or origin.get('render_key')!=item.get('key'):
                    raise RequestError('%s번 카드가 다른 기사·고정본의 이미지이거나 최신성을 확인할 수 없습니다. 다시 렌더해 주세요.' % (index+1), 409)
                raw,mime=media_assets.media_asset_file(item['id'])
                if mime!='image/jpeg':raise RequestError('SNS 첨부는 렌더한 JPG를 사용해 주세요.')
                import base64
                files.append({'order':index+1,'mime':mime,'name':'card_%02d.jpg'%(index+1),'data_url':'data:image/jpeg;base64,'+base64.b64encode(raw).decode('ascii')})
            payload={**payload,'assets':files}
        if self._sns is None:
            from .sns_service import SnsService
            self._sns=SnsService(self)
        result=self._sns.call(platform, action, payload)
        if action=='close':
            statuses=[self._sns.call(name,'status',{}) for name in ('instagram','threads')]
            if all(status.get('reason')=='browser_closed' for status in statuses):self.close()
        return result

    @staticmethod
    def _generator_dir() -> Path:
        override = os.environ.get("PLATFORM_GENERATOR_DIR", "").strip()
        if override:
            return Path(override).expanduser().resolve()
        if getattr(sys, "frozen", False):
            exe_dir = Path(sys.executable).resolve().parent
            bundle = Path(getattr(sys, "_MEIPASS", exe_dir))
            for root in (bundle, exe_dir):
                if (root / "platform-generator" / "core-adapter.js").is_file():
                    return root / "platform-generator"
            return bundle / "platform-generator"
        # article_editor/app/core/managers -> repository root
        return Path(__file__).resolve().parents[4] / "platform-generator"

    @staticmethod
    def _node_executable() -> str | None:
        if getattr(sys, "frozen", False):
            exe_dir = Path(sys.executable).resolve().parent
            bundle = Path(getattr(sys, "_MEIPASS", exe_dir))
            for root in (exe_dir, bundle):
                node = root / "node" / "node.exe"
                if node.is_file():
                    return str(node)
        return shutil.which("node")

    @staticmethod
    def _ai(request):
        """Node 가 요청한 OpenAI Responses 호출 하나를 코어의 AI 경로로 보낸다(모델은 코어 설정을 따른다)."""
        from .. import config
        from ..ai.client import openai_call

        if not isinstance(request, dict):
            raise RequestError("AI 요청 형식이 올바르지 않습니다.", 400)
        return openai_call("responses", {**request, "model": config.TEXT_MODEL, "store": False})

    def _answer(self, proc, message):
        try:
            reply = {"type": "ai_result", "id": message.get("id"), "ok": True, "response": self._ai(message.get("request"))}
        except RequestError as error:
            reply = {"type": "ai_result", "id": message.get("id"), "ok": False, "error": str(error), "status": error.status}
        except Exception:
            reply = {"type": "ai_result", "id": message.get("id"), "ok": False, "error": "AI 요청을 처리하지 못했습니다.", "status": 502}
        proc.stdin.write(json.dumps(reply, ensure_ascii=False) + "\n")
        proc.stdin.flush()

    def _call(self, payload: dict):
        node = self._node_executable()
        if not node:
            raise RequestError("플랫폼 변환 엔진을 실행할 Node.js를 찾지 못했습니다.", 503)

        root = self._generator_dir()
        adapter = root / "core-adapter.js"
        if not adapter.is_file():
            raise RequestError("platform-generator 어댑터를 찾지 못했습니다.", 503)

        env = {key: value for key, value in os.environ.items() if key not in _WITHHELD_ENV}
        env["PLATFORM_AI_BRIDGE"] = "core"
        try:
            proc = subprocess.Popen(
                [node, str(adapter)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                cwd=str(root),
                env=env,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except OSError:
            raise RequestError("플랫폼 변환 엔진을 시작하지 못했습니다.", 503)

        timed_out = threading.Event()

        def expire():
            timed_out.set()
            proc.kill()

        timer = threading.Timer(self._timeout, expire)
        timer.daemon = True  # 생성 중에 앱을 닫아도 타이머 때문에 프로세스가 남지 않게
        timer.start()
        response = None
        try:
            try:
                proc.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
                proc.stdin.flush()
                for line in proc.stdout:
                    try:
                        message = json.loads(line)
                    except json.JSONDecodeError:
                        continue  # Node 가 흘린 로그 줄은 건너뛴다
                    if not isinstance(message, dict):
                        continue
                    if message.get("type") == "ai":
                        self._answer(proc, message)
                    elif "ok" in message:
                        response = message
                        break
            except (BrokenPipeError, OSError, ValueError):
                pass  # 프로세스가 먼저 끝났거나 시간이 지나 종료됨 — 아래에서 판정
        finally:
            timer.cancel()
            try:
                proc.stdin.close()
            except OSError:
                pass
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
            proc.stdout.close()

        if timed_out.is_set():
            raise RequestError("플랫폼 원고 생성 시간이 초과되었습니다.", 504)
        if response is None:
            raise RequestError("플랫폼 변환 엔진의 응답을 읽지 못했습니다.", 502)
        if not response.get("ok"):
            status = int(response.get("status") or 502)
            if status < 400 or status > 599:
                status = 502
            raise RequestError(str(response.get("error") or "플랫폼 변환에 실패했습니다."), status)
        return response.get("result")

    @staticmethod
    def _from_snapshot(data: dict):
        """snapshotId 가 있으면 그 고정본(제목·본문)을 입력으로 쓴다. → (snapshot_id | None, 고정본 기사 | None)"""
        snapshot_id = data.get("snapshotId")
        if snapshot_id is None:
            return None, None
        snapshot = get_snapshot(snapshot_id)  # 형식 오류 400, 없으면 404
        return snapshot["id"], {"article_id": snapshot["article_id"], "title": snapshot["title"], "content": snapshot["body_text"]}

    def keywords(self, data: dict):
        snapshot_id, snapshot_article = self._from_snapshot(data)
        if snapshot_article:
            return {**self._call({"action": "keywords", "article": snapshot_article}), "snapshotId": snapshot_id}
        article = data.get("article")
        if not isinstance(article, dict):
            raise RequestError("기사 정보가 필요합니다.")
        title = article.get("title")
        content = article.get("content")
        if not isinstance(title, str) or not isinstance(content, str) or not title.strip() or not content.strip():
            raise RequestError("기사 제목과 본문을 먼저 작성해 주세요.")
        return self._call({"action": "keywords", "article": {"title": title, "content": content}})

    def generate(self, data: dict):
        platform = data.get("platform")
        payload = data.get("payload")
        if platform not in ("instagram", "threads", "blog", "card_news"):
            raise RequestError("지원하지 않는 플랫폼입니다.")
        if not isinstance(payload, dict):
            raise RequestError("플랫폼 생성 입력이 필요합니다.")
        snapshot_id, snapshot_article = self._from_snapshot(data)
        if snapshot_article:  # 고정본이 있으면 화면이 보낸 기사 대신 고정본의 제목·본문으로 만든다(같은 입력이면 재현 가능)
            result = self._call({"action": "generate", "platform": platform, "payload": {**payload, "article": snapshot_article}})
            return {**result, "snapshotId": snapshot_id} if isinstance(result, dict) else result
        return self._call({"action": "generate", "platform": platform, "payload": payload})

    @staticmethod
    def _check_origin(draft, article, snapshot_id):
        if not isinstance(draft, dict):
            raise RequestError("검수할 원고가 필요합니다.")
        if draft.get("article_id") and draft["article_id"] != article.get("article_id"):
            raise RequestError("원고와 기준 기사가 다릅니다. 해당 기사의 원고를 사용해 주세요.", 409)
        if draft.get("snapshot_id") and draft["snapshot_id"] != snapshot_id:
            raise RequestError("원고와 기준 고정본이 다릅니다.", 409)

    def validate(self, data: dict):
        """플랫폼 변환 왜곡·요구사항 검수. 취재자료 기반 기사 팩트체크와 별개다."""
        payload = data.get("payload")
        if not isinstance(payload, dict):
            raise RequestError("검수 입력이 필요합니다.")
        snapshot_id, frozen = self._from_snapshot(data)
        article = frozen or payload.get("article")
        if not isinstance(article, dict):
            raise RequestError("검수 기준 기사가 필요합니다.")
        self._check_origin(payload.get("draft"), article, snapshot_id)
        result = self._call({"action": "validate", "payload": {**payload, "article": article}})
        return {**result, **({"snapshotId": snapshot_id} if snapshot_id else {})}

    def render(self, data: dict):
        """카드뉴스 카드 하나를 이미지로 그려 암호화 저장소에 MediaAsset 으로 등록한다. → {cardId, asset[, snapshotId]}
        data: {payload: {card_id, template, content:{keyword, headline, body}, image?:{url, photographer}}, snapshotId?}
        결과는 파일(output/)이나 localhost 주소로 남기지 않는다 — Node 는 이미지 바이트만 돌려주고 코어가 vault 에 넣는다.
        생성 이미지는 generated=true 로 표시되고 asset.local_uri(/api/media-assets/<id>/file)로 화면에 보여 준다."""
        payload = data.get("payload")
        if not isinstance(payload, dict) or not isinstance(payload.get("card_id"), str) or not payload["card_id"].strip():
            raise RequestError("카드 정보(payload.card_id)가 필요합니다.")
        snapshot_id, frozen = self._from_snapshot(data)
        if frozen and payload.get("article_id") and payload["article_id"] != frozen["article_id"]:
            raise RequestError("카드와 렌더 기준 고정본의 기사가 다릅니다.", 409)
        result = self._call({"action": "render", "payload": payload})
        image = result.get("data") if isinstance(result, dict) else None
        if not isinstance(image, str) or result.get("mime_type") != "image/jpeg":
            raise RequestError("카드 이미지를 만들지 못했습니다.", 502)
        card_id = payload["card_id"].strip()
        headline = (payload.get("content") or {}).get("headline") if isinstance(payload.get("content"), dict) else ""
        asset = media_assets.register_media_asset({
            "kind": "image", "mime_type": "image/jpeg", "generated": True,
            "filename": re.sub(r"[^0-9A-Za-z가-힣._-]", "_", card_id)[:200] + ".jpg",
            "caption": headline.strip()[:2000] if isinstance(headline, str) else "",
            "data": "data:image/jpeg;base64," + image,
        })
        origin={'article_id':frozen['article_id'] if frozen else payload.get('article_id'), 'snapshot_id':snapshot_id, 'render_key':payload.get('render_key')}
        with vault.connect() as db:
            key=self._render_origin_key(asset['id'],origin['article_id'],snapshot_id,origin['render_key'])
            db.execute('INSERT OR REPLACE INTO app_meta(key,value) VALUES (?,?)', (key,json.dumps(origin)))
        return {"cardId": card_id, "asset": asset, **({"snapshotId": snapshot_id} if snapshot_id else {})}

    def publish(self, data: dict):
        """검증된 사용자 세션으로 백엔드의 CMS 어댑터를 호출한다. 성공 응답 전에는 발행 상태를 만들지 않는다."""
        article = data.get("article")
        if not isinstance(article, dict):
            raise RequestError("발행할 기사 정보가 필요합니다.")
        title, content = article.get("title"), article.get("content")
        if not isinstance(title, str) or not title.strip() or len(title) > 500:
            raise RequestError("기사 제목을 확인해 주세요.")
        if not isinstance(content, str) or not content.strip() or len(content) > 2_000_000:
            raise RequestError("기사 본문을 확인해 주세요.")
        from .. import backend_proxy
        photos = [{k: photo.get(k, "") for k in ("caption", "source", "provider", "sourceUrl")}
                  for photo in article.get("photos", []) if isinstance(photo, dict)]
        result = backend_proxy.post("/cms/publish", {"article": {
            "id": article.get("articleId"), "title": title.strip(), "subtitle": article.get("subtitle") or "",
            "content": content, "photos": photos,
        }}, timeout=60)
        if not isinstance(result, dict):
            raise RequestError("CMS 응답 형식을 확인할 수 없습니다.", 502)
        if result.get("error") or result.get("success") is False or result.get("published") is False:
            raise RequestError(str(result.get("error") or "CMS가 발행 요청을 거절했습니다."), 502)
        if not (result.get("published") is True or result.get("id")):
            raise RequestError("CMS 응답에 발행 성공 신호가 없습니다.", 502)
        return {**result, "published": True}
