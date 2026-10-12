"""Render(백엔드) · Supabase(Auth/DB) 연결 진단 — 값을 출력하지 않고 도달성만 본다.

    python dev/checks/backend_check.py                 # .env 의 AI_BACKEND_URL 사용
    python dev/checks/backend_check.py --url https://<서비스>.onrender.com
    python dev/checks/backend_check.py --strict        # 계약(/ai/*) 미구현이면 실패 처리

읽는 값(.env 또는 OS 환경변수):
    AI_BACKEND / AI_BACKEND_URL / APP_TOKEN      우리 백엔드(Render) 연결
    SUPABASE_URL / SUPABASE_ANON_KEY             Supabase Auth/DB
    SUPABASE_CHECK_EMAIL / SUPABASE_CHECK_PASSWORD   (선택) 실제 로그인 시험

확인 항목
    1) 설정 여부(URL·키가 채워졌는지, 값은 절대 출력하지 않는다)
    2) Supabase Auth /auth/v1/health 도달성
    3) 백엔드 도달성 + **계약(/ai/*) 준비 여부를 구분**해서 알린다
       - /ai/health 200  → 계약 준비됨(앱 바로 사용 가능)
       - /api/health 200 → 웹앱형 Express. 도달은 되지만 /ai/* 는 아직 없음(docs/BACKEND_CONTRACT.md)
       - /health 200     → 다른 형태(로컬 모델 서버 등)
    4) (선택) 로그인 시험 → 토큰 길이와 만료만 표시

종료 코드: 0 = 필수 설정과 도달성 통과, 1 = 실패(--strict 면 계약 미구현도 실패)
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


def probe(base: str, path: str, token: str = '') -> tuple[int, dict]:
    """실제 상태 코드를 보기 위해 직접 찍는다(진단 전용). 자세한 판정을 위해 502로 뭉개지 않는다.

    → (상태 코드, 본문). 연결 자체가 안 되면 (0, {}).
    """
    import json as _json
    import urllib.error
    import urllib.request

    headers = {'Accept': 'application/json', 'User-Agent': 'ArticleWorkspace/3.0-check'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(base.rstrip('/') + path, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            raw = response.read(2048)
            try:
                return response.status, _json.loads(raw) or {}
            except ValueError:
                return response.status, {}
    except urllib.error.HTTPError as error:
        return error.code, {}
    except Exception:
        return 0, {}


def main(argv: list[str]) -> int:
    strict = '--strict' in argv
    override = ''
    if '--url' in argv:
        index = argv.index('--url')
        if index + 1 < len(argv):
            override = argv[index + 1].strip()
    base = (override or config.AI_BACKEND_URL or '').rstrip('/')

    print('=== 설정 ===')
    print(f'.env            : {env_path()}')
    print(f'AI_BACKEND      : {config.AI_BACKEND}')
    if base:
        print(f'AI_BACKEND_URL  : {host_of(base)}' + ('  (--url 로 지정)' if override else ''))
    else:
        print('AI_BACKEND_URL  : 없음(채워 주세요)')
    print(f'APP_TOKEN       : {"설정됨" if config.APP_TOKEN else "없음"}')
    print(f'SUPABASE_URL    : {host_of(config.SUPABASE_URL) if config.SUPABASE_URL else "없음(채워 주세요)"}')
    print(f'SUPABASE_ANON_KEY: {"설정됨" if config.SUPABASE_ANON_KEY else "없음(채워 주세요)"}')
    print()

    print('=== 도달성 ===')
    if config.SUPABASE_URL and not config.SUPABASE_URL.startswith(('http://', 'https://')):
        check(
            False,
            'SUPABASE_URL 형식',
            'REST 주소(https://<ref>.supabase.co)를 넣어 주세요. DB 접속 문자열은 백엔드(Render)에만',
        )
    elif supabase.configured():
        try:
            supabase.auth_health()
            check(True, 'Supabase Auth /auth/v1/health')
        except RequestError as error:
            check(False, 'Supabase Auth /auth/v1/health', error.message)
    else:
        check(False, 'Supabase 설정', 'SUPABASE_URL / SUPABASE_ANON_KEY 를 .env 에 넣어 주세요')

    contract_ready = False
    if base:
        reachable = False
        for path in ('/ai/health', '/api/health', '/health'):
            status, body = probe(base, path, config.APP_TOKEN)
            if status == 200 and path == '/ai/health':
                contract_ready = True
                check(True, '백엔드 /ai/health', '계약(/ai/*) 준비됨 - 앱이 바로 사용할 수 있습니다')
                original_base = config.AI_BACKEND_URL
                config.AI_BACKEND_URL = base  # --url 로 준 주소로 코어 클라이언트도 시험
                try:
                    backend_proxy.get('/ai/health', timeout=10)
                    check(True, '앱 클라이언트 경로', '코어(backend_proxy)가 같은 주소를 정상 호출')
                except RequestError as error:
                    check(False, '앱 클라이언트 경로', error.message)
                finally:
                    config.AI_BACKEND_URL = original_base
                reachable = True
                break
            if status == 200 and path == '/api/health':
                check(
                    True,
                    '백엔드 /api/health',
                    "도달함(웹앱형 Express, status=%s) - /ai/* 는 아직 없음" % (body.get('status') or '?'),
                )
                reachable = True
                break
            if status == 200:
                check(True, '백엔드 /health', '도달함(다른 형태) - /ai/* 계약 확인 필요')
                reachable = True
                break
            if status in (401, 403):
                check(False, '백엔드 ' + path, '인증이 필요하다고 응답(%d). 토큰/설정을 확인해 주세요' % status)
                reachable = True
                break
            if status == 0:
                check(False, '백엔드 도달', '응답이 없습니다. 주소·서비스 상태(휴면/재배포)를 확인해 주세요')
                reachable = True
                break
        if not reachable:
            check(False, '백엔드 상태 엔드포인트', 'GET /ai/health 또는 /api/health 를 백엔드에 두세요')
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
    if contract_ready:
        print('백엔드 계약(/ai/*) : 준비됨 - 앱이 원격 AI·사진 기능을 쓸 수 있습니다.')
    else:
        print('백엔드 계약(/ai/*) : 아직 없음 - 백엔드 전면수정 전까지 원격 AI·사진은 동작하지 않습니다.')
        print('                     계약서: docs/BACKEND_CONTRACT.md · 임시 브리지: backend/express/ai-proxy.ts')
        if strict:
            failed.append('백엔드 계약(/ai/*) 미구현')
    print(f'--- 통과 {len(results) - len([1 for ok, _ in results if not ok])}/{len(results)} · 실패 {len(failed)} ---')
    return 0 if results and not failed else 1


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
