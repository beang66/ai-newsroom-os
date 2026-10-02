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
            'AUTH_REQUIRED': 'true',
            'RATE_LIMIT_PER_MIN': '1000',
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

    def test_auth_can_be_disabled_for_dev(self):
        original = self.proxy_module.AUTH_REQUIRED
        self.proxy_module.AUTH_REQUIRED = False
        self.addCleanup(setattr, self.proxy_module, 'AUTH_REQUIRED', original)
        status, payload = self.call('/ai/responses', {'model': 'gpt-test'})
        self.assertEqual(status, 200)
        self.assertEqual(payload['path'], '/openai/v1/responses')


if __name__ == '__main__':
    unittest.main(verbosity=2)
