"""Session Manager — 로그인·토큰 보관·갱신 (doc §4).

토큰은 코어 안(`core/auth.py`)에만 있고 프론트는 상태만 본다(보안 모델 §7-2).
로그인은 Supabase Auth 를 쓴다. 백엔드(Render)는 이 토큰을 Bearer 로 검증한다.

공용 테스트 계정 자동 로그인(개발 실행 전용): .env 의 TEST_ACCOUNT_EMAIL/PASSWORD 로 로그인한다.
켜기/끄기는 이 PC 의 앱 데이터(settings.json)에 남고, 기본값은 .env 의 AUTO_LOGIN(없으면 켜짐).
배포본(exe)에서는 계정이 있어도 쓰지 않는다 — 사용자는 자기 계정으로 로그인한다.
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from pathlib import Path

from app_paths import APP_DATA

from .. import auth, config, saved_login, vault
from ..errors import RequestError
from ..integrations import supabase

# AI_NEWSROOM_SETTINGS: 시험이 사용자의 실제 설정(예: 로컬 팩트체크를 끈 것)을 읽거나 바꾸지 않게 파일 위치를 바꿀 수 있다
SETTINGS = Path(os.environ.get('AI_NEWSROOM_SETTINGS') or APP_DATA / 'settings.json')


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
        if not auth.status()['signedIn']:
            self._restore_saved()
        state = auth.status()
        state['keepLogin'] = saved_login.load() is not None
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
        self._store(result, email.strip(), remember=bool((payload or {}).get('remember')))
        return self.status()

    def sign_up(self, payload):
        """회원가입. 이메일 확인이 꺼져 있으면 바로 로그인된 상태로, 켜져 있으면 확인 메일 안내({needsConfirmation: True})."""
        email = (payload or {}).get('email', '')
        password = (payload or {}).get('password', '')
        if not isinstance(email, str) or '@' not in email or len(email) > 200:
            raise RequestError('이메일을 확인해 주세요.')
        if not isinstance(password, str) or not 8 <= len(password) <= 200:
            raise RequestError('비밀번호는 8자 이상으로 입력해 주세요.')
        result = supabase.sign_up(email.strip(), password)
        if result.get('access_token'):
            self._store(result, email.strip(), remember=bool((payload or {}).get('remember')))
            return {**self.status(), 'needsConfirmation': False}
        user = result.get('user') or result
        if not user.get('id'):
            raise RequestError('가입 응답을 확인하지 못했어요.', 502)
        if user.get('identities') == []:  # 이메일 확인이 켜져 있을 때 Supabase 가 이미 가입된 주소를 알리는 방식
            raise RequestError('이미 가입된 이메일이에요. 로그인해 주세요.')
        return {**self.status(), 'needsConfirmation': True}

    def sign_out(self):
        token = auth.current_token()
        if token:
            try:
                supabase.sign_out(token)
            except RequestError:
                pass  # 이미 만료된 토큰이어도 로컬 상태는 지운다
        auth.clear()
        saved_login.clear()  # 로그아웃하면 로그인 유지도 끝낸다
        # 팩트체크 검색 색인(자료 글을 들고 있다)을 메모리에서 비운다. 팩트체크를 쓴 적이 없으면 불러오지 않는다(numpy 등)
        retrieval = sys.modules.get(__package__.rsplit('.', 1)[0] + '.ai.factcheck.retrieval')
        if retrieval is not None:
            retrieval.clear_shared_indexes()
        return self.status()

    def set_keep_login(self, payload):
        """payload: {enabled: bool} — 켜면 지금 로그인한 계정의 갱신 토큰을 이 PC 에 저장, 끄면 지운다."""
        enabled = (payload or {}).get('enabled')
        if not isinstance(enabled, bool):
            raise RequestError('enabled 는 true/false 여야 합니다.')
        if enabled:
            if not auth.status()['signedIn'] or not auth.refresh_token():
                raise RequestError('로그인한 상태에서만 로그인 유지를 켤 수 있어요.', 401, code='AUTH_REQUIRED')
            self._remember()
        else:
            saved_login.clear()
        return self.status()

    def token(self) -> str:
        """백엔드/Supabase 호출에 쓸 토큰. 만료가 임박하면 갱신하고, 갱신이 안 되면 자동 로그인(켜져 있을 때)."""
        token = auth.current_token()
        if token and auth.expires_in() > 60:
            return token
        refresh = auth.refresh_token()
        if refresh:
            try:
                self._store(supabase.refresh(refresh), '', prepare=False)
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

    @staticmethod
    def _remember() -> None:
        state = auth.status()
        try:
            saved_login.save(auth.refresh_token(), state.get('email') or '', state.get('userId') or '')
        except Exception:
            pass  # 자격 증명 저장소를 못 쓰면 이번 실행에서만 로그인된다

    _restore_at = 0.0

    def _restore_saved(self) -> None:
        """저장된 갱신 토큰으로 로그인 상태를 되살린다(앱을 열 때). 토큰이 거절되면 지우고, 네트워크 문제면 남겨 두고 30초 뒤 다시 시도한다."""
        saved = saved_login.load()
        if not saved or time.time() - self._restore_at < 30:
            return
        self._restore_at = time.time()
        try:
            result = supabase.refresh(saved['refresh'])
        except RequestError as e:
            if e.status in (400, 401, 403):
                saved_login.clear()
            return
        try:
            self._store(result, saved.get('email', ''), remember=True)
        except RequestError:
            saved_login.clear()

    @staticmethod
    def _after_login(user_id: str) -> None:
        """로그인할 때 그 계정의 저장소를 준비한다: 계정 도입 전 저장소 이전(처음 로그인한 계정이 받는다), 예전 평문 가져오기,
        중단된 작업 정리, 휴지통 비우기(30일). 실패해도 로그인은 막지 않는다."""
        try:  # Supabase 의 사용자 id 는 UUID 다. 아니면(시험의 가짜 계정 등) 저장소를 건드리지 않는다 — 실제 자료를 엉뚱한 계정에 넘기지 않으려는 안전장치
            uuid.UUID(user_id)
        except (ValueError, AttributeError, TypeError):
            return
        try:
            from .. import jobs, storage
            vault.adopt_legacy(user_id)
            moved = storage.import_legacy_files()
            storage.pack_existing_photos()
            storage.import_legacy_embedding_cache()
            jobs.recover_interrupted_jobs()
            from .platform_manager import PlatformManager
            PlatformManager().resume_runs()
            purged = storage.purge_trash()  # 휴지통에서 30일 지난 기사 영구 삭제 + 쓰지 않는 사진 정리
            if purged:
                print(f'휴지통 영구 삭제: {len(purged)}건', flush=True)
            if moved['articles'] or moved['sources'] or moved['failed']:
                print(f'예전 저장물 가져오기: {moved}', flush=True)
        except Exception as error:
            print(f'저장소 준비 중 문제: {error}', flush=True)

    def _store(self, result: dict, email: str, prepare: bool = True, remember=None) -> None:
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
        if remember is True:
            self._remember()
        elif remember is False:
            saved_login.clear()
        elif saved_login.load():  # 토큰 갱신: 갱신 토큰이 바뀌었으니 저장해 둔 것도 새 것으로
            self._remember()
        if prepare:  # 토큰 갱신에서는 저장소 준비를 다시 하지 않는다
            self._after_login(user.get('id', ''))
