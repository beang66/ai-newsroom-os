"""Supabase 클라이언트 — 의존성 없이 REST 로만 쓴다 (Auth + PostgREST + Storage 기본).

접근 경계(ARCHITECTURE.md):
    앱 → Supabase 직접 : 일반 사용자 범위(프로젝트 목록·메타·공유) — **사용자 JWT + RLS**
    앱 → 우리 백엔드    : service_role 작업·외부 LLM·결제·webhook·운영키

앱은 `SUPABASE_ANON_KEY`(공개 전제) + 사용자 JWT 만 쓴다. `service_role` 키는 쓰지 않는다.

    POST {url}/auth/v1/signup
    POST {url}/auth/v1/token?grant_type=password
    POST {url}/auth/v1/token?grant_type=refresh_token
    POST {url}/auth/v1/logout
    GET  {url}/auth/v1/health
    GET  {url}/rest/v1/<table>?select=..&<filter>
    POST {url}/rest/v1/<table>            (Prefer: resolution=merge-duplicates)
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

from .. import config
from ..errors import RequestError

TIMEOUT = 20
STORAGE_TIMEOUT = 180  # 큰 파일(최대 50MB)을 올리고 내려받는 데 걸리는 시간


def configured() -> bool:
    return bool(config.SUPABASE_URL and config.SUPABASE_ANON_KEY)


def _base() -> str:
    if not configured():
        raise RequestError('Supabase 주소/키(SUPABASE_URL, SUPABASE_ANON_KEY)가 설정되어 있지 않습니다.', 503)
    base = config.SUPABASE_URL
    if not base.startswith(('http://', 'https://')):
        raise RequestError(
            'SUPABASE_URL 은 REST 주소(https://<ref>.supabase.co)여야 합니다. '
            'DB 접속 문자열(postgresql://…)은 앱에 두지 말고 백엔드(Render)에만 두세요.',
            503,
        )
    return base


def _headers(access_token: str = '', extra: dict | None = None) -> dict:
    headers = {
        'apikey': config.SUPABASE_ANON_KEY,
        'Accept': 'application/json',
        'User-Agent': 'ArticleWorkspace/3.0',
    }
    if access_token:
        headers['Authorization'] = 'Bearer ' + access_token
    if extra:
        headers.update(extra)
    return headers


def _call(request: urllib.request.Request, expect_json: bool = True, timeout: int = TIMEOUT):
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return json.loads(raw) if (expect_json and raw) else None
    except urllib.error.HTTPError as error:
        _call_error(error)
    except (TimeoutError, urllib.error.URLError):
        raise RequestError('Supabase에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.', 504) from None


def _call_error(error: urllib.error.HTTPError):
    body = {}
    try:
        body = json.loads(error.read() or b'{}')
    except (ValueError, TypeError):
        body = {}
    message = body.get('error_description') or body.get('msg') or body.get('message') or body.get('error')
    if error.code == 401:
        raise RequestError(_korean(message) or '로그인이 필요합니다. 다시 로그인해 주세요.', 401) from None
    if error.code == 403:
        raise RequestError(_korean(message) or '이 데이터에 접근할 권한이 없습니다.', 403) from None
    if error.code == 413:
        raise RequestError('파일이 서버 한도를 넘었어요.', 413, code='TRANSFER_TOO_LARGE') from None
    if error.code in (400, 422):  # 가입·로그인 입력 오류(이미 가입, 약한 비밀번호 등)는 사용자 오류로 돌려준다
        raise RequestError(_korean(message) or '입력을 확인해 주세요.', 400) from None
    if error.code == 429:
        raise RequestError(_korean(message) or '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', 502) from None
    raise RequestError(_korean(message) or 'Supabase 요청이 실패했습니다.', 502) from None


def _korean(message):
    """Supabase Auth 의 대표 영어 메시지만 한국어로(나머지는 그대로)."""
    text = (message or '').lower()
    if 'rate limit' in text:
        return '인증 메일을 너무 많이 보내서 잠시 막혔어요. 잠시 뒤(약 1시간)에 다시 시도하거나 관리자에게 알려 주세요.'
    if 'bucket not found' in text:
        return '이전용 저장 공간이 아직 만들어지지 않았어요. 관리자에게 알려 주세요(Supabase 설정 필요).'
    if 'row-level security' in text or 'new row violates' in text:
        return '이전 파일을 저장할 권한이 없어요. 관리자에게 알려 주세요(Supabase 접근 규칙 필요).'
    if 'invalid login credentials' in text:
        return '이메일 또는 비밀번호를 확인해 주세요.'
    if 'already registered' in text or 'already been registered' in text:
        return '이미 가입된 이메일이에요. 로그인해 주세요.'
    if 'password' in text and ('least' in text or 'weak' in text or 'short' in text):
        return '비밀번호가 너무 약하거나 짧아요. 더 길게 입력해 주세요.'
    if 'valid email' in text or 'invalid email' in text or 'email address' in text and 'invalid' in text:
        return '이메일 형식을 확인해 주세요.'
    return message


def auth_health() -> bool:
    """Supabase Auth 도달성 확인(로그인 없이)."""
    request = urllib.request.Request(_base() + '/auth/v1/health', headers=_headers())
    _call(request)
    return True


def sign_up(email: str, password: str) -> dict:
    """이메일/비밀번호 가입. 이메일 확인이 꺼져 있으면 세션({access_token,...})을, 켜져 있으면 user 만 돌려준다."""
    payload = json.dumps({'email': email, 'password': password}).encode()
    request = urllib.request.Request(
        _base() + '/auth/v1/signup',
        data=payload,
        headers=_headers(extra={'Content-Type': 'application/json'}),
        method='POST',
    )
    return _call(request) or {}


def sign_in(email: str, password: str) -> dict:
    """이메일/비밀번호 로그인 → {access_token, refresh_token, expires_in, user}"""
    payload = json.dumps({'email': email, 'password': password}).encode()
    request = urllib.request.Request(
        _base() + '/auth/v1/token?grant_type=password',
        data=payload,
        headers=_headers(extra={'Content-Type': 'application/json'}),
        method='POST',
    )
    return _call(request) or {}


def refresh(refresh_token: str) -> dict:
    payload = json.dumps({'refresh_token': refresh_token}).encode()
    request = urllib.request.Request(
        _base() + '/auth/v1/token?grant_type=refresh_token',
        data=payload,
        headers=_headers(extra={'Content-Type': 'application/json'}),
        method='POST',
    )
    return _call(request) or {}


def sign_out(access_token: str) -> None:
    request = urllib.request.Request(
        _base() + '/auth/v1/logout', data=b'', headers=_headers(access_token), method='POST'
    )
    _call(request, expect_json=False)


def _storage_url(bucket: str, path: str, kind: str = '') -> str:
    return _base() + '/storage/v1/object/' + (kind + '/' if kind else '') + urllib.parse.quote(bucket) + '/' + urllib.parse.quote(path, safe='/')


def storage_upload(bucket: str, path: str, data: bytes, access_token: str) -> None:
    """파일 올리기(같은 경로면 덮어쓴다). 사용자 JWT + RLS — 계정 폴더 밖에는 쓸 수 없다."""
    request = urllib.request.Request(
        _storage_url(bucket, path), data=data, method='POST',
        headers=_headers(access_token, {'Content-Type': 'application/octet-stream', 'x-upsert': 'true'}))
    _call(request, expect_json=False, timeout=STORAGE_TIMEOUT)


def storage_download(bucket: str, path: str, access_token: str) -> bytes | None:
    """파일 받기. 없으면 None."""
    request = urllib.request.Request(_storage_url(bucket, path, 'authenticated'), headers=_headers(access_token))
    try:
        with urllib.request.urlopen(request, timeout=STORAGE_TIMEOUT) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        if error.code in (400, 404):  # Supabase Storage 는 없는 객체를 400(Object not found)로도 답한다
            return None
        _call_error(error)
    except (TimeoutError, urllib.error.URLError):
        raise RequestError('Supabase에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.', 504) from None


def storage_delete(bucket: str, path: str, access_token: str) -> None:
    request = urllib.request.Request(_storage_url(bucket, path), method='DELETE', headers=_headers(access_token))
    _call(request, expect_json=False, timeout=STORAGE_TIMEOUT)


def storage_list(bucket: str, folder: str, access_token: str) -> list:
    """폴더 안의 파일 이름 목록(최대 1000)."""
    request = urllib.request.Request(
        _base() + '/storage/v1/object/list/' + urllib.parse.quote(bucket),
        data=json.dumps({'prefix': folder, 'limit': 1000, 'offset': 0}).encode(), method='POST',
        headers=_headers(access_token, {'Content-Type': 'application/json'}))
    return [row['name'] for row in (_call(request) or []) if row.get('name') and row.get('id')]  # id 없는 항목은 하위 폴더


def storage_info(bucket: str, path: str, access_token: str) -> dict | None:
    """파일 정보 {bytes, updatedAt}. 없으면 None."""
    folder, _, name = path.rpartition('/')
    request = urllib.request.Request(
        _base() + '/storage/v1/object/list/' + urllib.parse.quote(bucket),
        data=json.dumps({'prefix': folder, 'search': name, 'limit': 5}).encode(), method='POST',
        headers=_headers(access_token, {'Content-Type': 'application/json'}))
    for row in _call(request) or []:
        if row.get('name') == name:
            return {'bytes': int((row.get('metadata') or {}).get('size') or 0), 'updatedAt': row.get('updated_at') or row.get('created_at') or ''}
    return None


def select(table: str, params: dict | None = None, access_token: str = '') -> list:
    url = _base() + '/rest/v1/' + urllib.parse.quote(table)
    if params:
        url += '?' + urllib.parse.urlencode(params, doseq=True)
    return _call(urllib.request.Request(url, headers=_headers(access_token))) or []


def upsert(table: str, rows, access_token: str = '', on_conflict: str = '') -> list:
    url = _base() + '/rest/v1/' + urllib.parse.quote(table)
    if on_conflict:
        url += '?on_conflict=' + urllib.parse.quote(on_conflict)
    request = urllib.request.Request(
        url,
        data=json.dumps(rows).encode(),
        headers=_headers(
            access_token,
            {
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=representation',
            },
        ),
        method='POST',
    )
    return _call(request) or []


def _write(method: str, table: str, params: dict | None, body, access_token: str) -> list:
    url = _base() + '/rest/v1/' + urllib.parse.quote(table)
    if params:
        url += '?' + urllib.parse.urlencode(params, doseq=True)
    request = urllib.request.Request(
        url, data=None if body is None else json.dumps(body).encode(), method=method,
        headers=_headers(access_token, {'Content-Type': 'application/json', 'Prefer': 'return=representation'}))
    return _call(request) or []


def insert(table: str, rows, access_token: str = '') -> list:
    return _write('POST', table, None, rows, access_token)


def update(table: str, filters: dict, row: dict, access_token: str = '') -> list:
    """filters 예: {'id': 'eq.<uuid>'} — 비우면 거절한다(표 전체를 바꾸지 않게)."""
    if not filters:
        raise RequestError('수정할 행을 지정해 주세요.')
    return _write('PATCH', table, filters, row, access_token)


def delete(table: str, filters: dict, access_token: str = '') -> list:
    if not filters:
        raise RequestError('지울 행을 지정해 주세요.')
    return _write('DELETE', table, filters, None, access_token)


def rpc(name: str, args: dict | None = None, access_token: str = ''):
    """데이터베이스 함수 호출(POST /rest/v1/rpc/<name>) → 함수의 결과(JSON)."""
    request = urllib.request.Request(
        _base() + '/rest/v1/rpc/' + urllib.parse.quote(name), data=json.dumps(args or {}).encode(), method='POST',
        headers=_headers(access_token, {'Content-Type': 'application/json'}))
    return _call(request)
