"""우리 백엔드 프록시 호출 — 앱(코어)에는 운영키가 없다 (ARCHITECTURE.md 하드 규칙).

`AI_BACKEND=remote` 일 때만 쓴다. 로컬 키 대신 **사용자 토큰(JWT)** 만 붙인다.

경로 규약(백엔드와 합의): 원래 대상 경로를 뒤에 그대로 붙인다.
    POST {AI_BACKEND_URL}/ai/responses              ← OpenAI Responses 프록시
    POST {AI_BACKEND_URL}/ai/images/generations     ← 이미지 생성 프록시
    GET  {AI_BACKEND_URL}/unsplash/search/photos?query=..&page=..
    GET  {AI_BACKEND_URL}/unsplash/absolute?url=..  ← 다운로드 추적(절대 URL)

백엔드는 **OpenAI/Unsplash 와 같은 응답 모양**을 그대로 돌려준다(코어는 파싱을 바꾸지 않는다).
토큰은 세션 관리가 붙기 전까지 APP_TOKEN 환경변수로 주입한다(개발·시험용).
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

from . import config
from .errors import RequestError

TIMEOUT = 210


def enabled() -> bool:
    """백엔드 프록시를 쓸지 여부(config 값을 호출 시점에 읽는다 → 테스트에서 패치 가능)."""
    return (config.AI_BACKEND or 'local').strip().lower() == 'remote'


def token() -> str:
    return config.APP_TOKEN or ''


def _base() -> str:
    base = (config.AI_BACKEND_URL or '').rstrip('/')
    if not base:
        raise RequestError(
            '백엔드 주소(AI_BACKEND_URL)가 설정되어 있지 않습니다. .env를 확인해 주세요.', 503
        )
    return base


def _headers() -> dict:
    headers = {'Accept': 'application/json', 'User-Agent': 'ArticleWorkspace/3.0'}
    if token():
        headers['Authorization'] = 'Bearer ' + token()
    return headers


def _fail(error: urllib.error.HTTPError):
    messages = {
        401: '백엔드 인증이 필요합니다. 다시 로그인해 주세요.',
        403: '이 작업을 수행할 권한이 없습니다.',
        429: '사용 한도 또는 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.',
    }
    raise RequestError(
        messages.get(error.code, '백엔드 요청이 실패했습니다. 잠시 후 다시 시도해 주세요.'), 502
    ) from None


def post(path: str, payload: dict, timeout: int = TIMEOUT) -> dict:
    request = urllib.request.Request(
        _base() + path,
        data=json.dumps(payload).encode(),
        headers=dict(_headers(), **{'Content-Type': 'application/json'}),
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        _fail(error)
    except (TimeoutError, urllib.error.URLError):
        raise RequestError('백엔드에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.', 504) from None


def get(path: str, query: dict | None = None, timeout: int = 30) -> dict:
    url = _base() + path
    if query:
        url += ('&' if '?' in url else '?') + urllib.parse.urlencode(query)
    request = urllib.request.Request(url, headers=_headers())
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        _fail(error)
    except (TimeoutError, urllib.error.URLError):
        raise RequestError('백엔드에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.', 504) from None
