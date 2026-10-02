"""Render(백엔드) · Supabase(Auth/DB) 연결 진단 — 값을 출력하지 않고 도달성만 본다.

    python dev/checks/backend_check.py

읽는 값(.env 또는 OS 환경변수):
    AI_BACKEND / AI_BACKEND_URL / APP_TOKEN      우리 백엔드(Render) 연결
    SUPABASE_URL / SUPABASE_ANON_KEY             Supabase Auth/DB
    SUPABASE_CHECK_EMAIL / SUPABASE_CHECK_PASSWORD   (선택) 실제 로그인 시험

확인 항목
    1) 설정 여부(URL·키가 채워졌는지, 값은 절대 출력하지 않는다)
    2) Supabase Auth /auth/v1/health 도달성
    3) 우리 백엔드 /ai/health 도달성(없으면 /health 로 재시도)
    4) (선택) 로그인 시험 → 토큰 길이와 만료만 표시

종료 코드: 0 = 필수 설정과 도달성 통과, 1 = 실패
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

APP_DIR = Path(__file__).resolve().parents[2] / 'app'
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from core import backend_proxy, config  # noqa: E402
from core.errors import RequestError  # noqa: E402
from core.integrations import supabase  # noqa: E402
from core.managers.session_manager import SessionManager  # noqa: E402
from app_paths import ENV_DIRS  # noqa: E402

results: list[tuple[bool, str]] = []


def env_path() -> str:
    """코어가 실제로 읽은 .env (가까운 파일 우선)."""
    for folder in ENV_DIRS:
        path = folder / '.env'
        if path.is_file():
            return str(path)
    return '(없음 — OS 환경변수만 사용)'


def check(ok: bool, label: str, detail: str = '') -> None:
    results.append((ok, label))
    print(f'{"PASS" if ok else "FAIL"}  {label}{("  " + detail) if detail else ""}')


def host_of(url: str) -> str:
    return urlsplit(url).hostname or '(형식 확인 필요)'


def main() -> int:
    print('=== 설정 ===')
    print(f'.env            : {env_path()}')
    print(f'AI_BACKEND      : {config.AI_BACKEND}')
    print(f'AI_BACKEND_URL  : {host_of(config.AI_BACKEND_URL) if config.AI_BACKEND_URL else "없음(채워 주세요)"}')
    print(f'APP_TOKEN       : {"설정됨" if config.APP_TOKEN else "없음"}')
    print(f'SUPABASE_URL    : {host_of(config.SUPABASE_URL) if config.SUPABASE_URL else "없음(채워 주세요)"}')
    print(f'SUPABASE_ANON_KEY: {"설정됨" if config.SUPABASE_ANON_KEY else "없음(채워 주세요)"}')
    print()

    print('=== 도달성 ===')
    if supabase.configured():
        try:
            supabase.auth_health()
            check(True, 'Supabase Auth /auth/v1/health')
        except RequestError as error:
            check(False, 'Supabase Auth /auth/v1/health', error.message)
    else:
        check(False, 'Supabase 설정', 'SUPABASE_URL / SUPABASE_ANON_KEY 를 .env 에 넣어 주세요')

    if config.AI_BACKEND_URL:
        reached = False
        for path in ('/ai/health', '/health'):
            try:
                backend_proxy.get(path, timeout=10)
                check(True, f'백엔드 {path}')
                reached = True
                break
            except RequestError as error:
                if '404' in error.message or error.status == 502:
                    continue
                check(False, f'백엔드 {path}', error.message)
                reached = True
                break
        if not reached:
            check(False, '백엔드 상태 엔드포인트', 'GET /ai/health 또는 /health 를 백엔드에 추가해 주세요')
    else:
        check(False, '백엔드 설정', 'AI_BACKEND_URL(Render 주소)을 .env 에 넣어 주세요')

    email = os.environ.get('SUPABASE_CHECK_EMAIL', '')
    password = os.environ.get('SUPABASE_CHECK_PASSWORD', '')
    print()
    print('=== 로그인 시험 (선택) ===')
    if email and password:
        session = SessionManager()
        try:
            state = session.sign_in({'email': email, 'password': password})
            check(bool(state.get('signedIn')), 'Supabase 로그인', f'만료 {state.get("expiresIn")}초')
            state = session.sign_out()
            check(not state.get('signedIn'), '로그아웃')
        except RequestError as error:
            check(False, 'Supabase 로그인', error.message)
    else:
        print('SUPABASE_CHECK_EMAIL / SUPABASE_CHECK_PASSWORD 가 없어 건너뜁니다.')

    failed = [label for ok, label in results if not ok]
    print()
    print(f'--- {len(results) - len(failed)}/{len(results)} 통과 ---')
    return 0 if results and not failed else 1


if __name__ == '__main__':
    raise SystemExit(main())
