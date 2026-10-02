"""우리 백엔드(Render 배포용) — AI·사진 프록시. **표준 라이브러리만** 쓴다.

앱(코어)에는 운영키가 없다(ARCHITECTURE.md). 이 서비스가 키를 보관하고 대신 호출하며,
앱이 보낸 **사용자 JWT**를 Supabase 로 검증한다.

환경변수
    PORT (=Render 주입)   기본 8765
    HOST                  기본 0.0.0.0
    OPENAI_API_KEY        필수
    UNSPLASH_ACCESS_KEY   사진 검색
    SUPABASE_URL          JWT 검증용 (https://<ref>.supabase.co)
    SUPABASE_ANON_KEY     JWT 검증용 apikey
    AUTH_REQUIRED         기본 true. false 는 개발 전용(토큰 없이 허용)
    OPENAI_BASE_URL       기본 https://api.openai.com/v1 (시험용 대체 가능)
    UNSPLASH_BASE_URL     기본 https://api.unsplash.com
    RATE_LIMIT_PER_MIN    기본 120 (사용자별)

앱 계약
    GET  /ai/health
    POST /ai/responses | /ai/images/generations      (본문·응답을 그대로 중계)
    GET  /unsplash/search/photos | /unsplash/photos/<id> | /unsplash/download/<...> | /unsplash/absolute?url=

무저장: 요청·응답 본문을 로그나 디스크에 남기지 않는다(경로·상태·사용자만).
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OPENAI_BASE = (os.environ.get('OPENAI_BASE_URL') or 'https://api.openai.com/v1').rstrip('/')
UNSPLASH_BASE = (os.environ.get('UNSPLASH_BASE_URL') or 'https://api.unsplash.com').rstrip('/')
SUPABASE_URL = (os.environ.get('SUPABASE_URL') or '').rstrip('/')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', '')
AUTH_REQUIRED = os.environ.get('AUTH_REQUIRED', 'true').lower() != 'false'
ALLOWED_AI = {'responses', 'images/generations'}
RATE_LIMIT = int(os.environ.get('RATE_LIMIT_PER_MIN', '120'))
TIMEOUT = 210

_LOCK = threading.Lock()
_HITS: dict[str, list[float]] = {}


def rate_ok(user: str) -> bool:
    now = time.time()
    with _LOCK:
        hits = [t for t in _HITS.get(user, []) if now - t < 60]
        if len(hits) >= RATE_LIMIT:
            _HITS[user] = hits
            return False
        hits.append(now)
        _HITS[user] = hits
    return True


def verify_user(token: str):
    """Supabase 에 토큰을 물어 신원을 확인한다(무상태). 실패하면 None."""
    if not token or not SUPABASE_URL:
        return None
    request = urllib.request.Request(
        SUPABASE_URL + '/auth/v1/user',
        headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.load(response)
        return data if isinstance(data, dict) else None
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError):
        return None


def forward(url: str, body, headers: dict, method: str = 'GET'):
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.status, response.headers.get_content_type(), response.read()
    except urllib.error.HTTPError as error:
        mime = error.headers.get_content_type() if error.headers else 'application/json'
        return error.code, mime, error.read()
    except (urllib.error.URLError, TimeoutError):
        return 504, 'application/json', json.dumps({'error': '업스트림에 연결하지 못했습니다.'}).encode()


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *args):
        pass  # 본문·토큰을 남기지 않는다

    def _send(self, status, payload, mime='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _json(self, status, payload):
        self._send(status, json.dumps(payload, ensure_ascii=False).encode())

    def _body(self):
        size = int(self.headers.get('Content-Length', '0'))
        return self.rfile.read(size) if size > 0 else b''

    def _user_id(self):
        header = self.headers.get('Authorization', '')
        token = header[7:] if header.lower().startswith('bearer ') else ''
        if not AUTH_REQUIRED:
            return 'dev'
        user = verify_user(token)
        return (user or {}).get('id') or None

    def _guard(self):
        """통과하면 사용자 id, 아니면 응답을 이미 보내고 None."""
        user = self._user_id()
        if user is None:
            self._json(401, {'error': '로그인이 필요합니다.'})
            return None
        if not rate_ok(user):
            self._json(429, {'error': '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'})
            return None
        return user

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path)
        if path.path == '/ai/health':
            return self._json(200, {
                'ok': True,
                'service': 'ainewsroom-proxy',
                'authRequired': AUTH_REQUIRED,
                'openai': bool(os.environ.get('OPENAI_API_KEY')),
                'unsplash': bool(os.environ.get('UNSPLASH_ACCESS_KEY')),
            })
        if self._guard() is None:
            return
        if path.path == '/unsplash/absolute':
            target = (urllib.parse.parse_qs(path.query).get('url') or [''])[0]
            if urllib.parse.urlsplit(target).hostname != 'api.unsplash.com':
                return self._json(400, {'error': '허용되지 않은 사진 주소입니다.'})
            status, mime, raw = forward(target, None, {'Accept': 'application/json', 'User-Agent': 'AINewsroomProxy/1.0'})
            return self._send(status, raw, mime)
        if path.path.startswith('/unsplash/'):
            target = UNSPLASH_BASE + path.path[len('/unsplash'):] + (('?' + path.query) if path.query else '')
            status, mime, raw = forward(target, None, {
                'Authorization': 'Client-ID ' + os.environ.get('UNSPLASH_ACCESS_KEY', ''),
                'Accept-Version': 'v1',
                'User-Agent': 'AINewsroomProxy/1.0',
            })
            return self._send(status, raw, mime)
        self._json(404, {'error': '지원하지 않는 경로입니다.'})

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        if not path.startswith('/ai/'):
            return self._json(404, {'error': '지원하지 않는 경로입니다.'})
        sub = path[len('/ai/'):]
        if sub not in ALLOWED_AI:
            return self._json(404, {'error': '지원하지 않는 AI 경로입니다.'})
        if self._guard() is None:
            return
        body = self._body()
        if len(body) > 40_000_000:
            return self._json(413, {'error': '요청이 너무 큽니다.'})
        status, mime, raw = forward(
            OPENAI_BASE + '/' + sub,
            body,
            {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + os.environ.get('OPENAI_API_KEY', ''),
            },
            method='POST',
        )
        self._send(status, raw, mime)


def main():
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', '8765'))
    print(f'프록시 시작: http://{host}:{port} (authRequired={AUTH_REQUIRED})', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == '__main__':
    main()
