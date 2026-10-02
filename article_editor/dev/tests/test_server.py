"""Core API/behaviour tests.

Rewritten to target the modularized core package (frontend/core separation).
Behaviour and assertions are preserved from the original single-file suite.

실행 코드는 app/ 아래에 있으므로 여기서 sys.path 를 채운다 (dev/tests → ../../app).
"""
import sys
from pathlib import Path

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

import unittest, threading, urllib.request, urllib.error, json, os, tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

import core.api as api
import core.ai.client as ai_client
import core.config as core_config
import core.ai.router as ai_router
import core.integrations.unsplash as unsplash
import core.storage as storage


class ApiTestCase(unittest.TestCase):
    """앱 서버를 띄우고 HTTP로 호출하는 공통 헬퍼."""

    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), api.Handler)
        api.PORT = cls.http.server_port
        cls.base = 'http://127.0.0.1:' + str(api.PORT)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()

    def request(self, path, body=None, origin=None):
        headers = {'Origin': origin or self.base}
        if body is not None:
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, r.read(), r.headers
        except urllib.error.HTTPError as e:
            return e.code, e.read(), e.headers

class ServerTests(ApiTestCase):
    def test_static_assets(self):
        for path, mime in [('/', 'text/html'), ('/assets/article-workspace.js', 'javascript'), ('/assets/donga-fonts.css', 'text/css'), ('/src/api/client.js', 'javascript')]:
            status, raw, h = self.request(path)
            self.assertEqual(status, 200)
            self.assertIn(mime, h['Content-Type'])
            self.assertGreater(len(raw), 100)

    def test_traversal(self):
        self.assertEqual(self.request('/assets/../server.py')[0], 404)

    def test_origin_protection(self):
        self.assertEqual(self.request('/api/assist', {'kind': 'flow', 'body': 'a' * 90}, 'https://other.example')[0], 403)

    def test_missing_unsplash_key(self):
        with patch.dict(os.environ, {'UNSPLASH_ACCESS_KEY': ''}):
            self.assertEqual(self.request('/api/unsplash/search?q=test')[0], 503)

    def test_search_validates_empty_query(self):
        self.assertEqual(self.request('/api/unsplash/search?q=')[0], 400)

    def test_missing_openai_key(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': '', 'USE_LOCAL_MODELS': 'false'}):
            self.assertEqual(self.request('/api/assist', {'kind': 'metadata', 'requested': 'headline', 'body': '가' * 100})[0], 503)

    def test_structured_schemas(self):
        def call(path, payload):
            schema = payload['text']['format']['schema']
            self.assertEqual(schema['type'], 'object')
            self.assertFalse(schema['additionalProperties'])
            field = schema['required'][0]
            self.assertIn(field, schema['properties'])
            return {'output': [{'content': [{'type': 'output_text', 'text': json.dumps({field: ['후보1', '후보2', '후보3']})}]}]}
        with patch.dict(os.environ, {'USE_LOCAL_MODELS': 'false'}), patch.object(ai_client, 'openai_call', side_effect=call):
            for kind, requested in [('metadata', 'headline'), ('metadata', 'subheadline'), ('photo_keywords', '')]:
                status, raw, _ = self.request('/api/assist', {'kind': kind, 'requested': requested, 'body': '가' * 100})
                self.assertEqual(status, 200)
                self.assertTrue(json.loads(raw))

    def test_photo_proxy_rejects_external_host(self):
        with patch.object(api, 'selected_unsplash', return_value={'urls': {'full': 'https://evil.example/file'}}):
            self.assertEqual(self.request('/api/unsplash/photo/123')[0], 502)

    def test_search_proxy(self):
        with patch.object(api, 'unsplash_get', return_value={'results': []}):
            self.assertEqual(json.loads(self.request('/api/unsplash/search?q=forest')[1]), {'photos': [], 'page': 1, 'totalPages': 0, 'total': 0})

    def test_search_pagination(self):
        with patch.object(api, 'unsplash_get', return_value={'results': [{'id': 'four'}], 'total_pages': 3, 'total': 7}) as call:
            status, raw, _ = self.request('/api/unsplash/search?q=forest&page=2')
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(raw)['totalPages'], 3)
            self.assertIn('page=2', call.call_args.args[0])
            self.assertIn('per_page=3', call.call_args.args[0])
        for page in ['zero', '0', '-1', '10001']:
            self.assertEqual(self.request('/api/unsplash/search?q=forest&page=' + page)[0], 400)

    def test_local_file_save_and_update(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(storage, 'ROOT', Path(temp)):
            draft = {'schemaVersion': 3, 'title': '원고', 'bodyHtml': '<p>내용</p>', 'confirmed': {'headline': True, 'subheadline': False}}
            status, raw, _ = self.request('/api/articles/save', {'draft': draft})
            self.assertEqual(status, 200)
            result = json.loads(raw)
            identifier = result['articleId']
            target = Path(temp) / '.article-workspace' / 'articles' / result['fileName']
            self.assertTrue(target.exists())
            self.assertEqual(json.loads(target.read_text(encoding='utf-8'))['title'], '원고')
            draft.update(articleId=identifier, title='수정 원고')
            self.assertEqual(self.request('/api/articles/save', {'draft': draft})[0], 200)
            self.assertEqual(len(list(target.parent.glob('*.json'))), 1)
            self.assertEqual(json.loads(target.read_text(encoding='utf-8'))['title'], '수정 원고')
            draft['articleId'] = '../../outside'
            self.assertEqual(self.request('/api/articles/save', {'draft': draft})[0], 400)

    def test_summary_model_schema(self):
        def summarize(name, prompt, schema, text):
            self.assertEqual(schema['properties']['paragraphs']['minItems'], 3)
            self.assertEqual(schema['properties']['paragraphs']['maxItems'], 5)
            self.assertIn('20~50자', prompt)
            return {'paragraphs': ['첫 핵심', '둘째 핵심', '셋째 핵심'], 'advice': ''}
        with patch.dict(os.environ, {'FLOW_SUMMARY_PROVIDER': 'openai'}), patch.object(ai_router, 'structured_call', side_effect=summarize):
            self.assertEqual(len(ai_router.assist({'kind': 'flow', 'body': '기사 내용 ' * 30})['paragraphs']), 3)

    def test_kobart_summary_drafts(self):
        with patch.dict(os.environ, {'FLOW_SUMMARY_PROVIDER': 'kobart'}), patch.object(ai_router, 'generate_subtitle_drafts', return_value=[['모델 요약']]) as model, patch.object(ai_router, 'structured_call', return_value={'paragraphs': ['하나', '둘', '셋'], 'advice': ''}):
            ai_router.assist({'kind': 'flow', 'body': '첫 문단입니다. 둘째 문단입니다. 셋째 문단입니다.'})
            self.assertTrue(model.called)

    def test_unsplash_download_tracking(self):
        photo = {'links': {'download_location': 'https://api.unsplash.com/photos/test/download?ixid=abc'}}
        with patch.object(unsplash, 'unsplash_get', side_effect=[photo, {'url': 'https://images.unsplash.com/example'}]) as call:
            self.assertEqual(unsplash.selected_unsplash('test'), photo)
            self.assertEqual(call.call_args_list[1].args[0], photo['links']['download_location'])

    def test_short_body(self):
        self.assertEqual(self.request('/api/assist', {'kind': 'metadata', 'body': '짧음'})[0], 400)


class BackendProxyTests(ApiTestCase):
    """AI_BACKEND=remote 일 때 우리 백엔드 프록시로 나가는지 확인한다(스텁 백엔드).

    배포본은 앱에 운영키가 없고, 우리 백엔드를 통해서만 외부 AI/사진에 접근한다.
    (앱 서버·요청 헬퍼는 ServerTests 것을 그대로 쓰고, 스텁 백엔드만 추가로 띄운다.)
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.seen = []
        seen = cls.seen
        photo = {
            'id': 'p1',
            'alt_description': 'alt',
            'urls': {'full': 'https://images.unsplash.com/a.jpg', 'small': 'https://images.unsplash.com/a-s.jpg'},
            'user': {'name': 'N', 'links': {'html': 'https://unsplash.com/@n'}},
            # 상대 경로로 두면 원격 모드에서 /unsplash/download/p1 로 중계된다
            'links': {'html': 'https://unsplash.com/@n', 'download_location': '/download/p1'},
        }

        class Stub(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _send(self, payload):
                body = json.dumps(payload).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self):
                size = int(self.headers.get('Content-Length', '0'))
                payload = json.loads(self.rfile.read(size) or b'{}')
                seen.append(('POST', self.path, self.headers.get('Authorization'), payload))
                if self.path == '/ai/responses':
                    text = json.dumps({'headline_candidates': ['제목 하나', '제목 둘', '제목 셋']}, ensure_ascii=False)
                    self._send({'output': [{'content': [{'type': 'output_text', 'text': text}]}]})
                else:
                    self._send({'data': [{'b64_json': 'AAAA'}]})

            def do_GET(self):
                seen.append(('GET', self.path, self.headers.get('Authorization'), None))
                if '/search/photos' in self.path:
                    self._send({'results': [photo], 'total': 1, 'total_pages': 1})
                else:
                    self._send(dict(photo))

        cls.stub = ThreadingHTTPServer(('127.0.0.1', 0), Stub)
        threading.Thread(target=cls.stub.serve_forever, daemon=True).start()
        cls.stub_url = 'http://127.0.0.1:' + str(cls.stub.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.stub.shutdown()
        cls.stub.server_close()
        super().tearDownClass()

    def remote(self):
        return patch.multiple(
            core_config, AI_BACKEND='remote', AI_BACKEND_URL=self.stub_url, APP_TOKEN='test-token'
        )

    def test_assist_uses_backend_with_jwt(self):
        with self.remote():
            status, raw, _ = self.request(
                '/api/assist', {'kind': 'metadata', 'requested': 'headline', 'body': '가' * 100}
            )
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(raw)['headline_candidates'][0], '제목 하나')
        method, path, auth, payload = self.seen[-1]
        self.assertEqual((method, path), ('POST', '/ai/responses'))
        self.assertEqual(auth, 'Bearer test-token')
        self.assertNotIn('OPENAI_API_KEY', json.dumps(payload))

    def test_photo_search_uses_backend(self):
        with self.remote():
            status, raw, _ = self.request('/api/unsplash/search?q=test')
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(raw)['photos'][0]['id'], 'p1')
        method, path, auth, _ = self.seen[-1]
        self.assertEqual(method, 'GET')
        self.assertTrue(path.startswith('/unsplash/search/photos'))
        self.assertEqual(auth, 'Bearer test-token')

    def test_photo_track_uses_backend(self):
        with self.remote():
            status, raw, _ = self.request('/api/unsplash/photo/p1/track')
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(raw), {'tracked': True})
        self.assertEqual(self.seen[-1][1], '/unsplash/download/p1')

    def test_missing_backend_url_is_reported(self):
        with patch.multiple(core_config, AI_BACKEND='remote', AI_BACKEND_URL='', APP_TOKEN=''):
            status, raw, _ = self.request('/api/assist', {'kind': 'flow', 'body': '가' * 100})
        self.assertEqual(status, 503)
        self.assertIn('AI_BACKEND_URL', json.loads(raw)['error'])


if __name__ == '__main__':
    unittest.main()
