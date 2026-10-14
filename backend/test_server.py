"""우리 백엔드(Render) 프록시 계약 테스트 — 스텁 업스트림으로 중계·인증·한도를 확인한다.

    python backend/test_server.py

실제 키 없이 돈다: 업스트림(OpenAI·Unsplash·Supabase)을 로컬 스텁으로 바꿔 끼운다.
"""
from __future__ import annotations

import importlib.util
import json
import os
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
SEEN: list[tuple] = []


class Stub(BaseHTTPRequestHandler):
    """가짜 업스트림 — 받은 경로와 헤더를 기록한다."""

    def log_message(self, *args):
        pass

    def _send(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        SEEN.append(('GET', self.path, self.headers.get('Authorization')))
        if self.path.startswith('/auth/v1/user'):
            if self.headers.get('Authorization') == 'Bearer good-token':
                return self._send({'id': 'u-1', 'email': 'writer@example.com'})
            return self._send({'error': 'invalid token'}, status=401)
        self._send({'results': [{'id': 'p1'}], 'total': 1, 'total_pages': 1})

    def do_POST(self):
        size = int(self.headers.get('Content-Length', '0'))
        raw = self.rfile.read(size) if size else b'{}'
        SEEN.append(('POST', self.path, self.headers.get('Authorization')))
        if self.path.endswith('/audio/transcriptions'):  # multipart — 본문이 그대로 왔는지만 돌려준다
            return self._send({'contentType': self.headers.get('Content-Type'), 'raw': raw.decode('latin-1')})
        self._send({'path': self.path, 'echo': json.loads(raw or b'{}')})


def start_stub() -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(('127.0.0.1', 0), Stub)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def load_proxy(upstream_base: str):
    """환경변수를 채운 뒤 프록시 모듈을 로드한다(모듈이 import 시점에 env 를 읽는다)."""
    os.environ.update(
        {
            'OPENAI_BASE_URL': upstream_base + '/openai/v1',
            'UNSPLASH_BASE_URL': upstream_base + '/unsplash',
            'SUPABASE_URL': upstream_base,
            'SUPABASE_ANON_KEY': 'anon-test',
            'OPENAI_API_KEY': 'test-openai-key',
            'UNSPLASH_ACCESS_KEY': 'test-unsplash-key',
            'CF_BASE_URL': upstream_base + '/cf',
            'CF_ACCOUNT_ID': 'acct1',
            'CF_API_TOKEN': 'test-cf-token',
            'AUTH_REQUIRED': 'true',
            'RATE_LIMIT_PER_MIN': '1000',
            'CMS_PUBLISH_URL': upstream_base + '/cms-target',
            'CMS_BEARER_TOKEN': 'cms-secret',
            'BACKUP_MASTER_KEY': 'test-master-key-0123456789abcdef0123456789',
        }
    )
    spec = importlib.util.spec_from_file_location('backend_server', BACKEND / 'server.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream = start_stub()
        cls.proxy_module = load_proxy('http://127.0.0.1:' + str(cls.upstream.server_port))
        cls.proxy = ThreadingHTTPServer(('127.0.0.1', 0), cls.proxy_module.Handler)
        threading.Thread(target=cls.proxy.serve_forever, daemon=True).start()
        cls.base = 'http://127.0.0.1:' + str(cls.proxy.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.proxy.shutdown()
        cls.proxy.server_close()
        cls.upstream.shutdown()
        cls.upstream.server_close()

    def call(self, path, body=None, token=None):
        headers = {}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        data = None
        if body is not None:
            headers['Content-Type'] = 'application/json'
            data = json.dumps(body).encode()
        request = urllib.request.Request(self.base + path, data=data, headers=headers)
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def test_health(self):
        status, payload = self.call('/ai/health')
        self.assertEqual(status, 200)
        self.assertTrue(payload['ok'])
        self.assertTrue(payload['openai'] and payload['unsplash'])
        self.assertTrue(payload['authRequired'])

    def test_ai_requires_token(self):
        self.assertEqual(self.call('/ai/responses', {'model': 'x'})[0], 401)

    def test_ai_rejects_unknown_path(self):
        self.assertEqual(self.call('/ai/secret', {'model': 'x'}, token='good-token')[0], 404)

    def test_ai_rejects_bad_token(self):
        self.assertEqual(self.call('/ai/responses', {'model': 'x'}, token='bad-token')[0], 401)

    def test_ai_forwards_with_server_key(self):
        status, payload = self.call('/ai/responses', {'model': 'gpt-test'}, token='good-token')
        self.assertEqual(status, 200)
        self.assertEqual(payload['echo'], {'model': 'gpt-test'})
        method, path, authorization = SEEN[-1]
        self.assertEqual((method, path), ('POST', '/openai/v1/responses'))
        self.assertEqual(authorization, 'Bearer test-openai-key')

    def test_embeddings_forwards_with_server_token_and_fixed_model(self):
        status, payload = self.call('/ai/embeddings', {'text': ['a']}, token='good-token')
        self.assertEqual(status, 200)
        method, path, authorization = SEEN[-1]
        self.assertEqual((method, path), ('POST', '/cf/accounts/acct1/ai/run/@cf/qwen/qwen3-embedding-0.6b'))
        self.assertEqual(authorization, 'Bearer test-cf-token')
        self.assertEqual(self.call('/ai/embeddings', {'text': ['a']})[0], 401)

    def test_backup_key_is_per_user_stable_and_needs_login(self):
        import base64
        import hashlib
        import hmac
        self.assertEqual(self.call('/ai/backup-key', {})[0], 401)
        status, payload = self.call('/ai/backup-key', {}, token='good-token')
        self.assertEqual(status, 200)
        expected = hmac.new(b'test-master-key-0123456789abcdef0123456789', b'article-backup:u-1', hashlib.sha256).digest()
        self.assertEqual(base64.b64decode(payload['key']), expected, '마스터 키에서 사용자 id 로 파생한 키')
        self.assertEqual(self.call('/ai/backup-key', {}, token='good-token')[1]['key'], payload['key'], '같은 사용자는 늘 같은 키')
        self.assertNotIn('test-master-key', json.dumps(payload), '마스터 키는 응답에 없다')
        self.assertTrue(self.call('/ai/health')[1]['backupKey'])

    def test_backup_key_unavailable_without_master_key(self):
        saved = os.environ.pop('BACKUP_MASTER_KEY')
        try:
            self.assertEqual(self.call('/ai/backup-key', {}, token='good-token')[0], 503)
            self.assertFalse(self.call('/ai/health')[1]['backupKey'])
        finally:
            os.environ['BACKUP_MASTER_KEY'] = saved

    def test_verified_token_is_cached_for_a_minute(self):
        self.call('/ai/embeddings', {'text': ['a']}, token='good-token')
        before = sum(1 for m, path, _ in SEEN if path.startswith('/auth/v1/user'))
        self.call('/ai/embeddings', {'text': ['b']}, token='good-token')
        after = sum(1 for m, path, _ in SEEN if path.startswith('/auth/v1/user'))
        self.assertEqual(before, after)  # 두 번째 요청은 Supabase 에 다시 묻지 않는다
        self.assertEqual(self.call('/ai/embeddings', {'text': ['b']}, token='bad-token')[0], 401)  # 나쁜 토큰은 캐시되지 않는다

    def test_transcription_forwards_multipart_as_is(self):
        body = b'--b1\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--b1--\r\n'
        request = urllib.request.Request(self.base + '/ai/audio/transcriptions', data=body, headers={
            'Authorization': 'Bearer good-token', 'Content-Type': 'multipart/form-data; boundary=b1'})
        with urllib.request.urlopen(request) as response:
            payload = json.load(response)
        self.assertEqual(payload['contentType'], 'multipart/form-data; boundary=b1')
        self.assertEqual(payload['raw'].encode('latin-1'), body)
        self.assertEqual(SEEN[-1][1:], ('/openai/v1/audio/transcriptions', 'Bearer test-openai-key'))

    def test_cms_publish_requires_user_and_uses_server_token(self):
        self.assertEqual(self.call('/cms/publish', {'article': {'title': 'x'}})[0], 401)
        status, payload = self.call('/cms/publish', {'article': {'title': 'x'}}, token='good-token')
        self.assertEqual((status, payload['path']), (200, '/cms-target'))
        self.assertEqual(SEEN[-1], ('POST', '/cms-target', 'Bearer cms-secret'))

    def test_unsplash_search_forwards(self):
        status, payload = self.call('/unsplash/search/photos?query=sea&per_page=3', token='good-token')
        self.assertEqual(status, 200)
        self.assertEqual(payload['total'], 1)
        method, path, authorization = SEEN[-1]
        self.assertEqual((method, path), ('GET', '/unsplash/search/photos?query=sea&per_page=3'))
        self.assertEqual(authorization, 'Client-ID test-unsplash-key')

    def test_unsplash_absolute_host_guard(self):
        self.assertEqual(
            self.call('/unsplash/absolute?url=https://evil.example/a.jpg', token='good-token')[0], 400
        )

    def test_unauthorized_post_closes_connection(self):
        """401 로 답할 때 연결을 닫아야 한다 — 남은 본문이 다음 요청으로 파싱되면 501/400 이 난다."""
        import socket

        body = b'{"model": "x"}'
        with socket.create_connection(('127.0.0.1', self.proxy.server_port), timeout=5) as sock:
            sock.sendall(
                b'POST /ai/responses HTTP/1.1\r\n'
                b'Host: 127.0.0.1\r\n'
                b'Content-Type: application/json\r\n'
                b'Connection: keep-alive\r\n'
                b'Content-Length: %d\r\n\r\n%s' % (len(body), body)
            )
            head = b''
            while b'\r\n\r\n' not in head:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                head += chunk
            self.assertIn(b'401', head.split(b'\r\n')[0])
            self.assertIn(b'Connection: close', head)
            sock.settimeout(3)
            try:
                while sock.recv(4096):
                    pass  # 응답 본문을 다 읽으면 EOF(b'')로 끝나야 한다
            except TimeoutError:
                self.fail('서버가 연결을 닫지 않았습니다(남은 본문이 다음 요청을 오염시킬 수 있음)')

    def test_oversized_post_is_refused_before_reading_the_body(self):
        """로그인 전에는 큰 본문을 읽지 않는다 — 헤더만 보내도 바로 413 이어야 한다(메모리 고갈 방지)."""
        import socket

        with socket.create_connection(('127.0.0.1', self.proxy.server_port), timeout=5) as sock:
            sock.sendall(
                b'POST /ai/responses HTTP/1.1\r\n'
                b'Host: 127.0.0.1\r\n'
                b'Content-Type: application/json\r\n'
                b'Content-Length: 500000000\r\n\r\n'
            )
            self.assertIn(b'413', sock.recv(4096).split(b'\r\n')[0])

    def test_unknown_method_is_json_404(self):
        request = urllib.request.Request(
            self.base + '/ai/responses', data=b'{}', method='PUT', headers={'Content-Type': 'application/json'}
        )
        try:
            with urllib.request.urlopen(request) as response:
                status, payload = response.status, json.load(response)
        except urllib.error.HTTPError as error:
            status, payload = error.code, json.load(error)
        self.assertEqual(status, 404)
        self.assertIn('error', payload)

    def test_auth_can_be_disabled_for_dev(self):
        original = self.proxy_module.AUTH_REQUIRED
        self.proxy_module.AUTH_REQUIRED = False
        self.addCleanup(setattr, self.proxy_module, 'AUTH_REQUIRED', original)
        status, payload = self.call('/ai/responses', {'model': 'gpt-test'})
        self.assertEqual(status, 200)
        self.assertEqual(payload['path'], '/openai/v1/responses')


if __name__ == '__main__':
    unittest.main(verbosity=2)
