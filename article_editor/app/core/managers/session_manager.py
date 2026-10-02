"""Session Manager — 로그인·토큰 보관·갱신 (doc §4).

토큰은 코어 안(`core/auth.py`)에만 있고 프론트는 상태만 본다(보안 모델 §7-2).
로그인은 Supabase Auth 를 쓴다. 백엔드(Render)는 이 토큰을 Bearer 로 검증한다.
"""
from __future__ import annotations

from .. import auth, config
from ..errors import RequestError
from ..integrations import supabase


class SessionManager:
    def status(self):
        """프론트에 줄 정보 — 토큰은 절대 포함하지 않는다."""
        state = auth.status()
        state['supabase'] = supabase.configured()
        state['backend'] = bool(config.AI_BACKEND_URL)
        return state

    def sign_in(self, payload):
        email = (payload or {}).get('email', '')
        password = (payload or {}).get('password', '')
        if not isinstance(email, str) or '@' not in email or len(email) > 200:
            raise RequestError('이메일을 확인해 주세요.')
        if not isinstance(password, str) or not 6 <= len(password) <= 200:
            raise RequestError('비밀번호를 확인해 주세요.')
        result = supabase.sign_in(email.strip(), password)
        self._store(result, email.strip())
        return self.status()

    def sign_out(self):
        token = auth.current_token()
        if token:
            try:
                supabase.sign_out(token)
            except RequestError:
                pass  # 이미 만료된 토큰이어도 로컬 상태는 지운다
        auth.clear()
        return self.status()

    def token(self) -> str:
        """백엔드/Supabase 호출에 쓸 토큰. 만료가 임박하면 자동 갱신한다."""
        token = auth.current_token()
        if token and auth.expires_in() > 60:
            return token
        refresh = auth.refresh_token()
        if not refresh:
            return token  # 만료됐고 refresh 도 없으면 '' (호출부가 401 처리)
        try:
            result = supabase.refresh(refresh)
        except RequestError:
            auth.clear()
            return ''
        self._store(result, '')
        return auth.current_token()

    def _store(self, result: dict, email: str) -> None:
        access = result.get('access_token', '')
        if not access:
            raise RequestError('로그인 응답을 확인하지 못했어요.', 502)
        user = result.get('user') or {}
        auth.set_session(
            access,
            result.get('refresh_token', ''),
            result.get('expires_in', 0) or 0,
            email=email or user.get('email', ''),
            user_id=user.get('id', ''),
        )
