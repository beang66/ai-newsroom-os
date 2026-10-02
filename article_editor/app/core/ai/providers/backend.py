"""배포용 AI 경로 — 우리 백엔드 프록시만 호출한다(앱에 운영키 없음).

응답 모양은 OpenAI와 동일하게 유지한다(백엔드가 그대로 중계/변환).
"""
from __future__ import annotations

from ... import backend_proxy


def call(path: str, payload, content_type: str = 'application/json') -> dict:
    return backend_proxy.post('/ai/' + path, payload, content_type=content_type)
