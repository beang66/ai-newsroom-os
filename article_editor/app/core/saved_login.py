"""이 PC 에 저장해 두는 로그인 유지 정보 — 갱신 토큰(refresh token)만, Windows 자격 증명 관리자에 둔다.

비밀번호와 액세스 토큰은 저장하지 않는다. 기기 키(vault)와 같은 곳(OS 자격 증명 저장소)이라 이 PC 의 같은 Windows 사용자만 읽는다.
갱신 토큰은 쓸 때마다 새 것으로 바뀌므로(회전) 갱신할 때마다 다시 저장한다. 저장소를 못 쓰면 조용히 '저장 안 됨'으로 취급한다.
"""
import json
import os

import keyring

SERVICE = (os.environ.get('AI_NEWSROOM_KEY_SERVICE') or 'AI Newsroom') + ' (login)'
ACCOUNT = 'refresh-token'


def save(refresh, email, user_id):
    keyring.set_password(SERVICE, ACCOUNT, json.dumps({'refresh': refresh, 'email': email, 'userId': user_id}))


def load():
    """→ {refresh, email, userId} | None"""
    try:
        raw = keyring.get_password(SERVICE, ACCOUNT)
        saved = json.loads(raw) if raw else None
        return saved if isinstance(saved, dict) and saved.get('refresh') else None
    except Exception:
        return None


def clear():
    try:
        keyring.delete_password(SERVICE, ACCOUNT)
    except Exception:
        pass
