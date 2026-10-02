"""AI 호출 경로 선택 — `AI_BACKEND` 한 값으로 개발(local)과 배포(backend)를 가른다.

    AI_BACKEND=local   로컬 .env 키로 외부 API 직접 호출 (개발 전용, 배포본 금지)
    AI_BACKEND=remote  우리 백엔드 프록시 경유 (배포 기본, 앱에는 JWT만)

기본값은 `local` 이다(지금 동작 유지). 선택은 호출 시점에 하므로 테스트에서 바꿔 끼울 수 있다.
"""
from __future__ import annotations

from ... import backend_proxy
from . import backend, local


def call(path: str, payload: dict) -> dict:
    return backend.call(path, payload) if backend_proxy.enabled() else local.call(path, payload)
