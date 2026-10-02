"""개발용 AI 경로 — 로컬 `.env` 키로 외부 API(OpenAI)를 직접 호출한다.

배포본에서는 쓰지 않는다(`AI_BACKEND=local` 은 개발 전용, ARCHITECTURE.md).
키를 읽는 곳을 이 파일 하나로 격리해 둔다.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from ...errors import RequestError

TIMEOUT = 210


def call(path: str, payload, content_type: str = 'application/json') -> dict:
    key = os.environ.get('OPENAI_API_KEY', '')
    if not key:
        raise RequestError('서버의 .env에 OPENAI_API_KEY를 설정해 주세요.', 503)
    request = urllib.request.Request(
        'https://api.openai.com/v1/' + path,
        data=payload if isinstance(payload, bytes) else json.dumps(payload).encode(),
        headers={'Content-Type': content_type, 'Authorization': 'Bearer ' + key},
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        messages = {
            401: 'API 키를 확인해 주세요.',
            403: '이 모델을 사용할 권한이 없습니다. OpenAI 계정과 모델 설정을 확인해 주세요.',
            429: 'API 사용 한도 또는 요청 한도에 도달했어요. 결제·사용량을 확인해 주세요.',
        }
        raise RequestError(
            messages.get(error.code, 'OpenAI 요청이 실패했습니다. 모델 설정을 확인한 뒤 다시 시도해 주세요.'),
            502,
        ) from None
    except (TimeoutError, urllib.error.URLError):
        raise RequestError('OpenAI에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.', 504) from None
