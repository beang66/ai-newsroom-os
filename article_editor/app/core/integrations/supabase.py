"""Supabase 클라이언트 — 의존성 없이 REST 로만 쓴다 (Auth + PostgREST + Storage 기본).

접근 경계(ARCHITECTURE.md):
    앱 → Supabase 직접 : 일반 사용자 범위(프로젝트 목록·메타·공유) — **사용자 JWT + RLS**
    앱 → 우리 백엔드    : service_role 작업·외부 LLM·결제·webhook·운영키

앱은 `SUPABASE_ANON_KEY`(공개 전제) + 사용자 JWT 만 쓴다. `service_role` 키는 쓰지 않는다.

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


def _call(request: urllib.request.Request, expect_json: bool = True):
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            raw = response.read()
            return json.loads(raw) if (expect_json and raw) else None
    except urllib.error.HTTPError as error:
        body = {}
        try:
            body = json.loads(error.read() or b'{}')
        except (ValueError, TypeError):
            body = {}
        message = body.get('error_description') or body.get('msg') or body.get('message') or body.get('error')
        if error.code == 401:
            raise RequestError(message or '로그인이 필요합니다. 다시 로그인해 주세요.', 401) from None
        if error.code == 403:
            raise RequestError(message or '이 데이터에 접근할 권한이 없습니다.', 403) from None
        if error.code == 429:
            raise RequestError(message or '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', 502) from None
        raise RequestError(message or 'Supabase 요청이 실패했습니다.', 502) from None
    except (TimeoutError, urllib.error.URLError):
        raise RequestError('Supabase에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.', 504) from None


def auth_health() -> bool:
    """Supabase Auth 도달성 확인(로그인 없이)."""
    request = urllib.request.Request(_base() + '/auth/v1/health', headers=_headers())
    _call(request)
    return True


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
