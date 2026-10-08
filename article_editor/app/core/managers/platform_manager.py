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
import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path

from ..errors import RequestError
from ..storage import get_snapshot

# Node 프로세스에 넘기지 않는 값(외부 AI 호출은 코어가 대신한다)
_WITHHELD_ENV = ("OPENAI_API_KEY", "GEMINI_API_KEY", "AI_PROVIDER", "OPENAI_MODEL", "GEMINI_MODEL")


class PlatformManager:
    def __init__(self):
        self._timeout = 210

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
        return snapshot["id"], {"title": snapshot["title"], "content": snapshot["body_text"]}

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
