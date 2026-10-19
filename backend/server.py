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
    ALLOWED_EMAILS        쓸 수 있는 계정(쉼표 구분, '@donga.com' 처럼 도메인도 가능). 비우면 로그인한 모든 계정
    CMS_ALLOWED_EMAILS    CMS 송고를 할 수 있는 계정(같은 형식). 비우면 아무도 송고할 수 없다
    OPENAI_BASE_URL       기본 https://api.openai.com/v1 (시험용 대체 가능)
    UNSPLASH_BASE_URL     기본 https://api.unsplash.com
    RATE_LIMIT_PER_MIN    기본 120 (사용자별)
    CF_ACCOUNT_ID         임베딩(Cloudflare Workers AI) 계정 id
    CF_API_TOKEN          임베딩용 Workers AI 토큰
    CF_BASE_URL           기본 https://api.cloudflare.com/client/v4 (시험용 대체 가능)
    CMS_PUBLISH_URL       실제 CMS 수신 API(HTTPS)
    CMS_BEARER_TOKEN      CMS 서버 인증 토큰
    CLOVA_SPEECH_SECRET_KEY / CLOVA_SPEECH_INVOKE_URL   녹취 전사(NAVER CLOVA Speech) — 키는 이 서버에만 둔다(PC 에 두지 않는다)
    CLOVA_RATE_PER_MIN    기본 5 — 전사는 호출마다 요금이 나가므로 사용자별로 따로, 더 엄격하게 제한한다
    CLOVA_MAX_CONCURRENT  기본 2 — 동시에 변환하는 녹음 수(무료 플랜 메모리 512MB 보호)
    BACKUP_MASTER_KEY     기사 서버 백업의 마스터 키(32자 이상 무작위, 절대 바꾸거나 잃어버리지 말 것 — 바뀌면 기존 백업을 풀 수 없다)

앱 계약
    GET  /ai/health
    POST /ai/responses | /ai/images/generations      (본문·응답을 그대로 중계)
    POST /ai/audio/transcriptions                    (녹음 전사, multipart 본문 그대로 중계)
    POST /ai/audio/clova?filename=...                (녹음 원본 바이트 → CLOVA Speech 장문 인식·화자 분리. 옵션은 서버가 고정, 40MB 이하)
    POST /ai/embeddings                              (Cloudflare Workers AI qwen3-embedding-0.6b 로 본문 그대로 중계)
    POST /cms/publish                                (CMS_PUBLISH_URL 로 기사 송고)
    POST /ai/backup-key                              (로그인한 사용자의 기사 백업 키: 마스터 키에서 사용자별로 파생, 무저장)
    POST /ai/share-key {shareId, token?}             (기사 공유본의 키: Supabase article_share_role 로 권한을 확인한 뒤 공유마다 파생)
    GET  /s/<링크 토큰>                               (공유 링크 안내 페이지 — 앱에 붙여 넣는 방법만 보여 준다. 로그인·DB 조회 없음)
    GET  /unsplash/search/photos | /unsplash/photos/<id> | /unsplash/download/<...> | /unsplash/absolute?url=

무저장: 요청·응답 본문을 로그나 디스크에 남기지 않는다(경로·상태·사용자만).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import http.client
import json
import os
import re
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
ALLOWED_AI = {'responses', 'images/generations', 'audio/transcriptions', 'embeddings'}
CF_BASE = (os.environ.get('CF_BASE_URL') or 'https://api.cloudflare.com/client/v4').rstrip('/')
CF_EMBEDDING_MODEL = '@cf/qwen/qwen3-embedding-0.6b'  # 모델은 서버가 고정한다 — 앱이 다른 모델을 고르지 못하게
RATE_LIMIT = int(os.environ.get('RATE_LIMIT_PER_MIN', '120'))
TIMEOUT = 210
CLOVA_MAX_AUDIO = 40_000_000
CLOVA_RATE_PER_MIN = int(os.environ.get('CLOVA_RATE_PER_MIN', '5'))
_CLOVA_SLOTS = threading.BoundedSemaphore(max(1, int(os.environ.get('CLOVA_MAX_CONCURRENT', '2'))))
_CLOVA_HITS: dict[str, list[float]] = {}
# 앱이 보내는 옵션은 받지 않는다 — 결과를 다른 주소로 보내는 callback 같은 옵션을 끼워 넣지 못하게 서버가 고정한다
CLOVA_PARAMS = {'language': 'ko-KR', 'completion': 'sync', 'wordAlignment': True, 'fullText': True,
                'diarization': {'enable': True}, 'sed': {'enable': True}}
MAX_BODY = 40_000_000  # 가장 큰 경로(전사·이미지) 한도. 아래 경로는 더 작게 자른다
BODY_LIMITS = {'/cms/publish': 10_000_000, '/ai/embeddings': 2_000_000, '/ai/share-key': 10_000}
SHARE_ID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
SHARE_TOKEN = re.compile(r'[0-9a-f]{64}')
SHARE_PAGE = '''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>AI Newsroom 기사 공유</title>
<style>body{margin:0;font-family:Pretendard,system-ui,sans-serif;background:#FAF8F5;color:#23211F}main{max-width:520px;margin:12vh auto;padding:0 16px}
h1{font-size:20px}ol{line-height:1.9;padding-left:20px}code{display:block;margin-top:16px;padding:12px;border-radius:12px;background:#EFECE6;word-break:break-all;font-size:12px}</style>
</head><body><main><h1>AI Newsroom 기사 공유 링크</h1><ol><li>AI Newsroom 앱을 열고 로그인합니다.</li>
<li>보관함 → <b>공유받은 항목</b>을 누릅니다.</li><li>이 페이지 주소를 <b>링크로 받기</b> 칸에 붙여 넣습니다.</li></ol>
<p>기사 내용은 이 페이지에 표시되지 않습니다. 공유한 사람이 허락한 계정만 앱에서 열 수 있습니다.</p><code>{link}</code></main></body></html>'''

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


def clova_rate_ok(user: str) -> bool:
    now = time.time()
    with _LOCK:
        hits = [t for t in _CLOVA_HITS.get(user, []) if now - t < 60]
        if len(hits) >= CLOVA_RATE_PER_MIN:
            _CLOVA_HITS[user] = hits
            return False
        hits.append(now)
        _CLOVA_HITS[user] = hits
    return True


def clova_multipart(filename: str, mime: str, audio: bytes) -> tuple[bytes, str]:
    boundary = '----NewsroomClova' + os.urandom(8).hex()
    head = (f'--{boundary}\r\nContent-Disposition: form-data; name="params"\r\nContent-Type: application/json\r\n\r\n'
            f'{json.dumps(CLOVA_PARAMS)}\r\n--{boundary}\r\n'
            f'Content-Disposition: form-data; name="media"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n').encode()
    return head + audio + f'\r\n--{boundary}--\r\n'.encode(), f'multipart/form-data; boundary={boundary}'


_VERIFIED: dict[str, tuple[float, dict]] = {}
VERIFY_TTL = 60  # 같은 토큰을 매 요청마다 Supabase 에 묻지 않는다(임베딩처럼 요청이 잦은 경로). 폐기된 토큰은 최대 60초 더 통한다


def verify_user(token: str):
    """Supabase 에 토큰을 물어 신원을 확인한다(60초 캐시). 실패하면 None."""
    if not token or not SUPABASE_URL:
        return None
    hit = _VERIFIED.get(token)
    if hit and hit[0] > time.time():
        return hit[1]
    user = _verify_remote(token)
    if user:
        if len(_VERIFIED) > 500:
            _VERIFIED.clear()
        _VERIFIED[token] = (time.time() + VERIFY_TTL, user)
    return user


def _verify_remote(token: str):
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


def share_role(token: str, share_id: str, link_token: str):
    """이 사용자(토큰)가 공유에서 가진 권한 — Supabase 함수가 RLS 밖에서 확인한다. owner|importer|viewer|None"""
    body = json.dumps({'p_share': share_id, 'p_token': link_token or None}).encode()
    request = urllib.request.Request(
        SUPABASE_URL + '/rest/v1/rpc/article_share_role', data=body, method='POST',
        headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            role = json.load(response)
        return role if role in ('owner', 'importer', 'viewer') else None
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError):
        return None


def email_allowed(email: str, entries: str) -> bool:
    """entries: 'a@x.com, @donga.com' — 정확한 주소 또는 '@도메인'."""
    email = (email or '').strip().lower()
    for entry in (e.strip().lower() for e in entries.split(',')):
        if entry and email and (email == entry or (entry.startswith('@') and email.endswith(entry))):
            return True
    return False


def forward(url: str, body, headers: dict, method: str = 'GET'):
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.status, response.headers.get_content_type(), response.read()
    except urllib.error.HTTPError as error:
        mime = error.headers.get_content_type() if error.headers else 'application/json'
        return error.code, mime, error.read()
    except (OSError, http.client.HTTPException):  # 응답을 읽는 중 끊겨도(IncompleteRead 등) JSON 으로 답한다
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
        # 연결을 재사용하지 않는다. 본문을 읽지 않고 응답한 경우(401/404 등) 남은 본문 바이트가
        # 다음 요청으로 파싱되어 501/400 이 나는 문제를 막는다(Render 프록시가 연결을 재사용한다).
        self.send_header('Connection', 'close')
        self.close_connection = True
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _json(self, status, payload):
        self._send(status, json.dumps(payload, ensure_ascii=False).encode())

    def _size(self):
        try:
            return int(self.headers.get('Content-Length') or 0)
        except ValueError:
            return MAX_BODY + 1

    def _user(self):
        header = self.headers.get('Authorization', '')
        token = header[7:] if header.lower().startswith('bearer ') else ''
        if not AUTH_REQUIRED:
            return {'id': 'dev'}
        user = verify_user(token) or {}
        return user if user.get('id') else None

    def _guard(self, cms=False):
        """통과하면 사용자 id, 아니면 응답을 이미 보내고 None."""
        user = self._user()
        if user is None:
            self._json(401, {'error': '로그인이 필요합니다.'})
            return None
        allowed = os.environ.get('ALLOWED_EMAILS', '').strip()
        if AUTH_REQUIRED and ((allowed and not email_allowed(user.get('email'), allowed))
                              or (cms and not email_allowed(user.get('email'), os.environ.get('CMS_ALLOWED_EMAILS', '')))):
            self._json(403, {'error': '이 계정은 이 기능을 쓸 수 없습니다. 관리자에게 문의해 주세요.'})
            return None
        user = user['id']
        if not rate_ok(user):
            self._json(429, {'error': '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'})
            return None
        return user

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path)
        if path.path.startswith('/s/'):
            link_token = path.path[3:]
            if not SHARE_TOKEN.fullmatch(link_token):
                return self._json(404, {'error': '지원하지 않는 경로입니다.'})
            link = 'https://' + (self.headers.get('Host') or '') + path.path
            return self._send(200, SHARE_PAGE.replace('{link}', link).encode(), 'text/html; charset=utf-8')
        if path.path == '/ai/health':
            return self._json(200, {
                'ok': True,
                'service': 'ainewsroom-proxy',
                'authRequired': AUTH_REQUIRED,
                'openai': bool(os.environ.get('OPENAI_API_KEY')),
                'unsplash': bool(os.environ.get('UNSPLASH_ACCESS_KEY')),
                'embeddings': bool(os.environ.get('CF_ACCOUNT_ID') and os.environ.get('CF_API_TOKEN')),
                'backupKey': len(os.environ.get('BACKUP_MASTER_KEY', '')) >= 32,
                'clova': bool(os.environ.get('CLOVA_SPEECH_SECRET_KEY') and os.environ.get('CLOVA_SPEECH_INVOKE_URL')),
            })
        if self._guard() is None:
            return
        if path.path == '/unsplash/absolute':
            target = (urllib.parse.parse_qs(path.query).get('url') or [''])[0]
            parsed = urllib.parse.urlsplit(target)
            if parsed.scheme != 'https' or parsed.hostname != 'api.unsplash.com':  # http 면 키가 평문으로 나간다
                return self._json(400, {'error': '허용되지 않은 사진 주소입니다.'})
            status, mime, raw = forward(target, None, {
                'Authorization': 'Client-ID ' + os.environ.get('UNSPLASH_ACCESS_KEY', ''),  # 키 없이는 Unsplash 가 401 로 거절한다
                'Accept-Version': 'v1',
                'Accept': 'application/json',
                'User-Agent': 'AINewsroomProxy/1.0',
            })
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

    def _clova(self, user, audio):
        """녹음 원본 → CLOVA Speech. 키·옵션은 서버가 정하고, 사용자별 횟수와 동시 처리 수를 제한한다(요금·메모리 보호)."""
        key = os.environ.get('CLOVA_SPEECH_SECRET_KEY', '').strip()
        invoke = os.environ.get('CLOVA_SPEECH_INVOKE_URL', '').strip().rstrip('/')
        host = urllib.parse.urlsplit(invoke)
        if not key or not host.hostname or (host.scheme != 'https' and host.hostname not in ('127.0.0.1', 'localhost')):
            return self._json(503, {'error': 'CLOVA 연동 키가 서버에 설정되지 않았습니다.'})
        if not audio or len(audio) > CLOVA_MAX_AUDIO:
            return self._json(413, {'error': '녹음 파일은 40MB 이하만 변환할 수 있어요.'})
        mime = (self.headers.get('Content-Type') or '').split(';')[0].strip().lower()
        if not (mime.startswith(('audio/', 'video/')) or mime == 'application/octet-stream'):
            return self._json(415, {'error': '녹음 파일 형식을 확인해 주세요.'})
        if not clova_rate_ok(user):
            return self._json(429, {'error': '음성 변환 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'})
        if not _CLOVA_SLOTS.acquire(blocking=False):
            return self._json(429, {'error': '다른 녹음을 변환하는 중이에요. 잠시 후 다시 시도해 주세요.'})
        try:
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            name = re.sub(r'[^0-9A-Za-z가-힣._ -]', '_', (query.get('filename') or ['audio'])[0])[:120] or 'audio'
            body, content_type = clova_multipart(name, mime, audio)
            status, out_mime, raw = forward(invoke + '/recognizer/upload', body,
                                            {'X-CLOVASPEECH-API-KEY': key, 'Content-Type': content_type}, method='POST')
        finally:
            _CLOVA_SLOTS.release()
        return self._send(status, raw, out_mime)

    def _share_key(self, body):
        """공유본 키 = HMAC-SHA256(마스터, 'article-share:' + 공유 id). 권한(소유자·초대·링크)이 있을 때만 준다."""
        master = os.environ.get('BACKUP_MASTER_KEY', '')
        if len(master) < 32:
            return self._json(503, {'error': '공유 키가 서버에 설정되지 않았습니다.'})
        try:
            data = json.loads(body or b'{}')
        except ValueError:
            data = None
        share_id = data.get('shareId') if isinstance(data, dict) else None
        link_token = data.get('token') if isinstance(data, dict) else None
        if not isinstance(share_id, str) or not SHARE_ID.fullmatch(share_id) or (
                link_token is not None and (not isinstance(link_token, str) or not SHARE_TOKEN.fullmatch(link_token))):
            return self._json(400, {'error': '공유 정보를 확인해 주세요.'})
        header = self.headers.get('Authorization', '')
        if share_role(header[7:] if header.lower().startswith('bearer ') else '', share_id, link_token) is None:
            return self._json(403, {'error': '이 공유를 열 권한이 없어요.'})
        key = hmac.new(master.encode(), b'article-share:' + share_id.encode(), hashlib.sha256).digest()
        return self._json(200, {'key': base64.b64encode(key).decode('ascii')})

    def do_POST(self):
        # 크기와 로그인을 본문보다 먼저 본다 — 로그인 안 한 요청이 큰 본문으로 메모리(무료 플랜 512MB)를 채우지 못하게.
        # 읽지 않은 본문이 다음 요청을 오염시키지 않는 것은 모든 응답의 Connection: close 가 맡는다.
        path = urllib.parse.urlsplit(self.path).path
        size = self._size()
        if size > BODY_LIMITS.get(path, MAX_BODY):
            return self._json(413, {'error': '요청이 너무 큽니다.'})
        user = self._guard(cms=path == '/cms/publish')
        if user is None:
            return
        body = self.rfile.read(size) if size > 0 else b''
        if path == '/cms/publish':
            target = os.environ.get('CMS_PUBLISH_URL', '').strip()
            token = os.environ.get('CMS_BEARER_TOKEN', '').strip()
            parsed = urllib.parse.urlsplit(target)
            if not parsed.hostname or (parsed.scheme != 'https' and parsed.hostname not in ('127.0.0.1', 'localhost')):
                return self._json(503, {'error': 'CMS_PUBLISH_URL이 설정되지 않았습니다.'})
            headers = {'Content-Type': 'application/json'}
            if token:
                headers['Authorization'] = 'Bearer ' + token
            status, mime, raw = forward(target, body, headers, method='POST')
            return self._send(status, raw, mime)
        if path == '/ai/audio/clova':
            return self._clova(user, body)
        if path == '/ai/backup-key':
            master = os.environ.get('BACKUP_MASTER_KEY', '')
            if len(master) < 32:
                return self._json(503, {'error': '백업 키가 서버에 설정되지 않았습니다.'})
            # 사용자별 키 = HMAC-SHA256(마스터, 'article-backup:' + 사용자 id). 마스터는 서버 밖으로 나가지 않는다.
            key = hmac.new(master.encode(), b'article-backup:' + user.encode(), hashlib.sha256).digest()
            return self._json(200, {'key': base64.b64encode(key).decode('ascii')})
        if path == '/ai/share-key':
            return self._share_key(body)
        if not path.startswith('/ai/'):
            return self._json(404, {'error': '지원하지 않는 경로입니다.'})
        sub = path[len('/ai/'):]
        if sub not in ALLOWED_AI:
            return self._json(404, {'error': '지원하지 않는 AI 경로입니다.'})
        if sub == 'embeddings':
            account = os.environ.get('CF_ACCOUNT_ID', '')
            status, mime, raw = forward(
                f'{CF_BASE}/accounts/{account}/ai/run/{CF_EMBEDDING_MODEL}', body,
                {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + os.environ.get('CF_API_TOKEN', '')},
                method='POST')
            return self._send(status, raw, mime)
        status, mime, raw = forward(
            OPENAI_BASE + '/' + sub,
            body,
            {
                # 전사는 multipart 라 앱이 보낸 Content-Type(boundary 포함)을 그대로 넘긴다
                'Content-Type': self.headers.get('Content-Type') or 'application/json',
                'Authorization': 'Bearer ' + os.environ.get('OPENAI_API_KEY', ''),
            },
            method='POST',
        )
        self._send(status, raw, mime)


    def _not_allowed(self):
        # 지원하지 않는 메서드도 JSON 404 로 답한다(기본 501 HTML 은 본문을 남겨 연결을 오염시킬 수 있다).
        self._json(404, {'error': '지원하지 않는 경로입니다.'})

    do_PUT = do_PATCH = do_DELETE = do_OPTIONS = _not_allowed


def main():
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', '8765'))
    print(f'프록시 시작: http://{host}:{port} (authRequired={AUTH_REQUIRED})', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == '__main__':
    main()
