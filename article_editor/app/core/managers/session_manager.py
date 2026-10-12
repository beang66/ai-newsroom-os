"""Session Manager — 로그인·토큰 보관·갱신 (doc §4).

토큰은 코어 안(`core/auth.py`)에만 있고 프론트는 상태만 본다(보안 모델 §7-2).
로그인은 Supabase Auth 를 쓴다. 백엔드(Render)는 이 토큰을 Bearer 로 검증한다.

공용 테스트 계정 자동 로그인(개발 실행 전용): .env 의 TEST_ACCOUNT_EMAIL/PASSWORD 로 로그인한다.
켜기/끄기는 이 PC 의 앱 데이터(settings.json)에 남고, 기본값은 .env 의 AUTO_LOGIN(없으면 켜짐).
배포본(exe)에서는 계정이 있어도 쓰지 않는다 — 사용자는 자기 계정으로 로그인한다.
"""
from __future__ import annotations

import json
import sys

from app_paths import APP_DATA

from .. import auth, config
from ..errors import RequestError
from ..integrations import supabase

SETTINGS = APP_DATA / 'settings.json'


def _settings() -> dict:
    try:
        return json.loads(SETTINGS.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


class SessionManager:
    # ---- 공용 테스트 계정 ----
    @staticmethod
    def auto_login_available() -> bool:
        return not getattr(sys, 'frozen', False) and bool(config.TEST_ACCOUNT_EMAIL and config.TEST_ACCOUNT_PASSWORD)

    def auto_login_enabled(self) -> bool:
        return self.auto_login_available() and bool(_settings().get('auto_login', config.AUTO_LOGIN_DEFAULT))

    def set_auto_login(self, payload):
        """payload: {enabled: bool} — 켜면 바로 공용 계정으로 로그인, 끄면 공용 계정 세션이면 로그아웃."""
        enabled = (payload or {}).get('enabled')
        if not isinstance(enabled, bool):
            raise RequestError('enabled 는 true/false 여야 합니다.')
        if not self.auto_login_available():
            raise RequestError('공용 테스트 계정이 설정되지 않았어요(.env 의 TEST_ACCOUNT_EMAIL·TEST_ACCOUNT_PASSWORD, 개발 실행 전용).', 400)
        APP_DATA.mkdir(parents=True, exist_ok=True)
        SETTINGS.write_text(json.dumps({**_settings(), 'auto_login': enabled}, ensure_ascii=False), encoding='utf-8')
        if enabled and not auth.current_token():
            self._auto_sign_in()
        elif not enabled and auth.status().get('email') == config.TEST_ACCOUNT_EMAIL:
            self.sign_out()
        return self.status()

    def _auto_sign_in(self) -> None:
        self._store(supabase.sign_in(config.TEST_ACCOUNT_EMAIL, config.TEST_ACCOUNT_PASSWORD), config.TEST_ACCOUNT_EMAIL)

    def status(self):
        """프론트에 줄 정보 — 토큰·비밀번호는 절대 포함하지 않는다. 자동 로그인이 켜져 있으면 여기서 로그인해 둔다."""
        error = ''
        if self.auto_login_enabled() and not auth.current_token():
            try:
                self._auto_sign_in()
            except RequestError as e:
                error = e.message
        state = auth.status()
        state['supabase'] = supabase.configured()
        state['backend'] = bool(config.AI_BACKEND_URL)
        state['autoLogin'] = {'available': self.auto_login_available(), 'enabled': self.auto_login_enabled(),
                              'email': config.TEST_ACCOUNT_EMAIL if self.auto_login_available() else '', 'error': error}
        return state

    # ---- 로그인 ----
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
        """백엔드/Supabase 호출에 쓸 토큰. 만료가 임박하면 갱신하고, 갱신이 안 되면 자동 로그인(켜져 있을 때)."""
        token = auth.current_token()
        if token and auth.expires_in() > 60:
            return token
        refresh = auth.refresh_token()
        if refresh:
            try:
                self._store(supabase.refresh(refresh), '')
                return auth.current_token()
            except RequestError:
                auth.clear()
        if self.auto_login_enabled():
            try:
                self._auto_sign_in()
                return auth.current_token()
            except RequestError:
                return ''
        return token  # 만료됐고 갱신도 안 되면 '' (호출부가 401 처리)

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
