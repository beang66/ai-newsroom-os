"""Platform generator adapter.

FormatConverter의 실제 생성 로직은 platform-generator에만 둔다.
App Core는 Node 구현을 모르도록 이 매니저를 통해 결과만 전달한다.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

from ..errors import RequestError


class PlatformManager:
    def __init__(self):
        self._timeout = 210

    @staticmethod
    def _generator_dir() -> Path:
        override = os.environ.get("PLATFORM_GENERATOR_DIR", "").strip()
        if override:
            return Path(override).expanduser().resolve()
        # article_editor/app/core/managers -> repository root
        return Path(__file__).resolve().parents[4] / "platform-generator"

    def _call(self, payload: dict):
        node = shutil.which("node")
        if not node:
            raise RequestError("플랫폼 변환 엔진을 실행할 Node.js를 찾지 못했습니다.", 503)

        root = self._generator_dir()
        adapter = root / "core-adapter.js"
        if not adapter.is_file():
            raise RequestError("platform-generator 어댑터를 찾지 못했습니다.", 503)

        try:
            completed = subprocess.run(
                [node, str(adapter)],
                input=json.dumps(payload, ensure_ascii=False),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                cwd=str(root),
                timeout=self._timeout,
                check=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except subprocess.TimeoutExpired:
            raise RequestError("플랫폼 원고 생성 시간이 초과되었습니다.", 504)
        except OSError:
            raise RequestError("플랫폼 변환 엔진을 시작하지 못했습니다.", 503)

        try:
            response = json.loads((completed.stdout or "").strip())
        except json.JSONDecodeError:
            raise RequestError("플랫폼 변환 엔진의 응답을 읽지 못했습니다.", 502)

        if not response.get("ok"):
            status = int(response.get("status") or 502)
            if status < 400 or status > 599:
                status = 502
            raise RequestError(str(response.get("error") or "플랫폼 변환에 실패했습니다."), status)
        return response.get("result")

    def keywords(self, data: dict):
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
        return self._call({"action": "generate", "platform": platform, "payload": payload})
