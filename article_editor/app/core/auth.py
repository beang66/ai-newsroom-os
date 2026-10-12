"""현재 사용자 토큰 보관소 — 코어 안에서만 통용되는 짧은 상태.

프론트(웹뷰)는 토큰을 **모른다**(보안 모델 §7-2). 코어가 로그인으로 받은 토큰을 여기 두고,
백엔드 프록시(`backend_proxy`)와 Supabase 클라이언트가 Bearer 로 붙인다.

메모리에만 둔다(재시작하면 다시 로그인). 디스크 저장은 '앱 잠금'(보안 P1)과 함께 결정한다.
"""
from __future__ import annotations

import threading
import time

_LOCK = threading.Lock()
_STATE: dict = {
    'token': '',        # access token (JWT)
    'refresh': '',      # refresh token
    'expires_at': 0.0,  # epoch seconds
    'email': '',
    'user_id': '',
}


def current_token() -> str:
    with _LOCK:
        token = _STATE['token']
    if token and _STATE['expires_at'] and _STATE['expires_at'] < time.time():
        return ''  # 만료된 토큰은 쓰지 않는다(갱신은 SessionManager 가 담당)
    return token


def refresh_token() -> str:
    with _LOCK:
        return _STATE['refresh']


def expires_in() -> int:
    with _LOCK:
        return max(0, int(_STATE['expires_at'] - time.time())) if _STATE['expires_at'] else 0


def set_session(access: str, refresh: str = '', expires_in_seconds: int = 0, **identity) -> None:
    with _LOCK:
        _STATE.update(
            token=access or '',
            refresh=refresh or _STATE['refresh'],
            expires_at=(time.time() + int(expires_in_seconds)) if expires_in_seconds else 0.0,
            email=identity.get('email', _STATE['email']),
            user_id=identity.get('user_id', _STATE['user_id']),
        )


def clear() -> None:
    with _LOCK:
        _STATE.update(token='', refresh='', expires_at=0.0)


def status() -> dict:
    """프론트에 보여 줄 정보만 — **토큰은 절대 넣지 않는다**. """
    with _LOCK:
        state = dict(_STATE)
    return {
        'signedIn': bool(state['token']) and (not state['expires_at'] or state['expires_at'] > time.time()),
        'email': state['email'] or None,
        'userId': state['user_id'] or None,
        'expiresIn': expires_in(),
    }
