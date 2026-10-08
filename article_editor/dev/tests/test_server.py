"""Core API/behaviour tests.

Rewritten to target the modularized core package (frontend/core separation).
Behaviour and assertions are preserved from the original single-file suite.

실행 코드는 app/ 아래에 있으므로 여기서 sys.path 를 채운다 (dev/tests → ../../app).
"""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
from pathlib import Path

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

import unittest, threading, urllib.request, urllib.error, json, os, re, tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

import core.api as api
import core.ai.client as ai_client
import core.auth as auth
import core.config as core_config
import core.ai.router as ai_router
import core.integrations.unsplash as unsplash
import core.storage as storage
from vault_fixture import use_temp_vault


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
        # 새 프론트는 Vite 빌드 결과(해시 파일명)를 코어가 그대로 서빙한다.
        status, raw, headers = self.request('/')
        self.assertEqual(status, 200)
        self.assertIn('html', headers['Content-Type'])
        self.assertIn(b'id="root"', raw)
        html = raw.decode('utf-8', 'replace')
        assets = re.findall(r'(?:src|href)="(?:\./)?(assets/[^"]+)"', html)
        self.assertTrue(assets, 'index.html 에 빌드 자산 링크가 있어야 합니다(web/ 에서 npm run build)')
        for path in assets:
            status, body, headers = self.request('/' + path)
            self.assertEqual(status, 200, path)
            self.assertGreater(len(body), 100, path)

    def test_traversal(self):
        self.assertEqual(self.request('/assets/../server.py')[0], 404)

    def test_origin_protection(self):
        self.assertEqual(self.request('/api/assist', {'kind': 'flow', 'body': 'a' * 90}, 'https://other.example')[0], 403)

    def test_missing_unsplash_key(self):
        with patch.dict(os.environ, {'UNSPLASH_ACCESS_KEY': ''}), patch.object(core_config, 'AI_BACKEND', 'local'):  # 'local' 로 고정: 기본값(remote)이면 실제 백엔드로 나간다
            self.assertEqual(self.request('/api/unsplash/search?q=test')[0], 503)

    def test_search_validates_empty_query(self):
        self.assertEqual(self.request('/api/unsplash/search?q=')[0], 400)

    def test_missing_openai_key(self):
        with patch.dict(os.environ, {'OPENAI_API_KEY': '', 'USE_LOCAL_MODELS': 'false'}), patch.object(core_config, 'AI_BACKEND', 'local'):
            self.assertEqual(self.request('/api/assist', {'kind': 'metadata', 'requested': 'headline', 'body': '가' * 100})[0], 503)

    def test_structured_schemas(self):
        def call(path, payload):
            schema = payload['text']['format']['schema']
            self.assertEqual(schema['type'], 'object')
            self.assertFalse(schema['additionalProperties'])
            field = schema['required'][0]
            self.assertIn(field, schema['properties'])
            # su4228 v30: 부제는 최종 교열(subtitle_N 문자열)을 한 번 더 거치므로, 스키마가 요구하는 모양대로 채워 돌려준다
            answer = {key: ('부제 문구' if spec['type'] == 'string' else ['후보가', '후보나', '후보다']) for key, spec in schema['properties'].items()}
            return {'output': [{'content': [{'type': 'output_text', 'text': json.dumps(answer, ensure_ascii=False)}]}]}
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

    def test_platform_keywords_route_uses_core_manager(self):
        expected = {'candidates': [{'keyword': '핵심', 'reason': '중요', 'source_evidence': ['본문']}]}
        with patch.object(api.CORE.platform, 'keywords', return_value=expected) as call:
            status, raw, _ = self.request('/api/platform/keywords', {'article': {'title': '제목', 'content': '본문'}})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw), expected)
        call.assert_called_once()

    def test_platform_generate_route_uses_core_manager(self):
        expected = {'success': True, 'draft': {'platform': 'threads', 'opening': '초안'}}
        body = {'platform': 'threads', 'payload': {'article': {'title': '제목', 'content': '본문'}, 'selected_keywords': ['핵심']}}
        with patch.object(api.CORE.platform, 'generate', return_value=expected) as call:
            status, raw, _ = self.request('/api/platform/generate', body)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw), expected)
        call.assert_called_once_with(body)

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
        use_temp_vault(self)
        draft = {'schemaVersion': 3, 'title': '원고', 'bodyHtml': '<p>내용</p>', 'confirmed': {'headline': True, 'subheadline': False}}
        status, raw, _ = self.request('/api/articles/save', {'draft': draft})
        self.assertEqual(status, 200)
        result = json.loads(raw)
        identifier = result['articleId']
        self.assertEqual(result['revisionNo'], 1)
        draft.update(articleId=identifier, title='수정 원고')
        self.assertEqual(json.loads(self.request('/api/articles/save', {'draft': draft})[1])['revisionNo'], 2)
        self.assertEqual(json.loads(self.request('/api/articles/save', {'draft': draft})[1])['revisionNo'], 2)  # 같은 내용은 이력 유지
        self.assertEqual(json.loads(self.request('/api/articles/latest')[1])['draft']['title'], '수정 원고')
        draft['articleId'] = '../../outside'
        self.assertEqual(self.request('/api/articles/save', {'draft': draft})[0], 400)

    def test_source_and_read_model_routes(self):
        use_temp_vault(self)
        sid, _ = storage.save_source('보고서.txt', b'raw', '본문')
        aid = json.loads(self.request('/api/articles/save', {'draft': {'bodyHtml': '<p>x</p>', 'title': '쓰는 기사', 'sources': [{'id': sid, 'name': '보고서.txt'}]}})[1])['articleId']
        listing = json.loads(self.request('/api/sources')[1])
        self.assertEqual([(i['id'], i['usedBy'][0]['articleId']) for i in listing['sources']], [(sid, aid)])
        self.assertEqual(json.loads(self.request('/api/sources/' + sid)[1])['name'], '보고서.txt')
        self.assertEqual(self.request('/api/sources/' + 'f' * 32)[0], 404)
        status, raw, _ = self.request('/api/sources/%s/delete' % sid, {})
        warning = json.loads(raw)
        self.assertEqual((status, warning['code'], warning['details']['usedBy'][0]['articleId']), (409, 'SOURCE_IN_USE', aid))
        self.assertEqual(self.request('/api/sources/%s/delete' % sid, {}, origin='http://evil.example')[0], 403)
        graph = json.loads(self.request('/api/knowledge-map')[1])
        self.assertEqual([e['relation'] for e in graph['edges']], ['uses_source'])
        self.assertEqual(len(json.loads(self.request('/api/articles')[1])['articles']), 1)
        self.assertEqual(json.loads(self.request('/api/sources/%s/delete' % sid, {'force': True})[1])['deleted'], True)
        self.assertEqual(json.loads(self.request('/api/knowledge-map')[1])['edges'], [])

    def test_media_asset_routes(self):
        import base64
        use_temp_vault(self)
        raw = b'\x89PNG\r\n\x1a\nroute-bytes'
        body = {'kind': 'image', 'mime_type': 'image/png', 'data': 'data:image/png;base64,' + base64.b64encode(raw).decode(), 'caption': '경로 시험'}
        status, payload, _ = self.request('/api/media-assets', body)
        asset = json.loads(payload)
        self.assertEqual((status, asset['caption'], asset['byte_size']), (200, '경로 시험', len(raw)))
        self.assertEqual(json.loads(self.request('/api/media-assets/' + asset['id'])[1])['id'], asset['id'])
        status, file_bytes, headers = self.request('/api/media-assets/%s/file' % asset['id'])
        self.assertEqual((status, file_bytes, headers['Content-Type']), (200, raw, 'image/png'))
        self.assertEqual(self.request('/api/media-assets/00000000-0000-4000-8000-000000000000')[0], 404)
        self.assertEqual(self.request('/api/media-assets', dict(body, kind='video'))[0], 400)
        self.assertEqual(self.request('/api/media-assets', body, origin='http://evil.example')[0], 403)

    def test_revision_history_routes(self):
        use_temp_vault(self)
        first = json.loads(self.request('/api/articles/save', {'draft': {'bodyHtml': '<p>1</p>', 'content': '첫 본문', 'title': '제목1'}})[1])['articleId']
        self.request('/api/articles/save', {'draft': {'articleId': first, 'bodyHtml': '<p>2</p>', 'content': '둘째 본문', 'title': '제목2'}})
        listing = json.loads(self.request('/api/articles/%s/revisions' % first)[1])
        self.assertEqual([r['revisionNo'] for r in listing['revisions']], [2, 1])
        status, raw, _ = self.request('/api/articles/%s/revisions/1' % first)
        self.assertEqual((status, json.loads(raw)['content']), (200, '첫 본문'))
        self.assertEqual(self.request('/api/articles/%s/revisions/9' % first)[0], 404)
        restored = json.loads(self.request('/api/articles/%s/revisions/1/restore' % first, {})[1])
        self.assertEqual((restored['revisionNo'], restored['draft']['title']), (3, '제목1'))
        self.assertEqual(json.loads(self.request('/api/articles/latest')[1])['draft']['title'], '제목1')
        self.assertEqual(self.request('/api/articles/%s/revisions/1/restore' % first, {}, origin='http://evil.example')[0], 403)
        self.assertEqual(self.request('/api/articles/not-an-id/revisions')[0], 404)

    def test_snapshot_routes_and_revision_conflict(self):
        use_temp_vault(self)
        aid = json.loads(self.request('/api/articles/save', {'draft': {'bodyHtml': '<p>1</p>', 'title': '제목1'}, 'expectedRevisionNo': 0})[1])['articleId']
        status, raw, _ = self.request('/api/articles/save', {'draft': {'articleId': aid, 'bodyHtml': '<p>낡음</p>', 'title': 'x'}, 'expectedRevisionNo': 0})
        self.assertEqual((status, json.loads(raw)['code']), (409, 'REVISION_CONFLICT'))
        self.assertIn('error', json.loads(raw))  # 화면이 읽는 문자열 키는 그대로
        self.request('/api/articles/save', {'draft': {'articleId': aid, 'bodyHtml': '<p>2</p>', 'title': '제목2'}, 'expectedRevisionNo': 1})
        status, raw, _ = self.request('/api/articles/%s/snapshots' % aid, {})
        snap = json.loads(raw)
        self.assertEqual((status, snap['revision_no'], snap['body_html']), (200, 2, '<p>2</p>'))
        first_rev = json.loads(self.request('/api/articles/%s/revisions' % aid)[1])['revisions'][-1]['id']
        older = json.loads(self.request('/api/articles/%s/snapshots' % aid, {'revisionId': first_rev})[1])
        self.assertEqual(older['title'], '제목1')
        listing = json.loads(self.request('/api/articles/%s/snapshots' % aid)[1])['snapshots']
        self.assertEqual(sorted(s['id'] for s in listing), sorted([snap['id'], older['id']]))
        self.assertEqual(json.loads(self.request('/api/snapshots/%s' % snap['id'])[1]), snap)
        status, raw, _ = self.request('/api/snapshots/00000000-0000-4000-8000-000000000000')
        self.assertEqual((status, json.loads(raw)['code']), (404, 'NOT_FOUND'))
        status, raw, _ = self.request('/api/articles/%s/snapshots' % aid, {'revisionId': '00000000-0000-4000-8000-000000000000'})
        self.assertEqual((status, json.loads(raw)['code']), (404, 'NOT_FOUND'))
        self.assertEqual(self.request('/api/articles/%s/snapshots' % aid, {}, origin='http://evil.example')[0], 403)
        self.assertNotIn('code', json.loads(self.request('/api/articles/%s/revisions/9' % aid)[1]))  # 기존 오류 경로는 그대로

    def test_job_routes(self):
        import uuid
        from core import jobs
        use_temp_vault(self)
        ref = lambda: {'resource_type': 'source', 'resource_id': str(uuid.uuid4())}
        queued, running = jobs.create_job('verification', ref())['id'], jobs.create_job('transcription', ref())['id']
        jobs.set_running(running)
        status, raw, _ = self.request('/api/jobs/%s' % queued)
        self.assertEqual((status, json.loads(raw)['status'], json.loads(raw)['type']), (200, 'queued', 'verification'))
        self.assertEqual(self.request('/api/jobs/%s/cancel' % queued, {}, origin='http://evil.example')[0], 403)
        self.assertEqual(json.loads(self.request('/api/jobs/%s' % queued)[1])['status'], 'queued')
        status, raw, _ = self.request('/api/jobs/%s/cancel' % queued, {})
        self.assertEqual((status, json.loads(raw)['status']), (200, 'cancelled'))
        status, raw, _ = self.request('/api/jobs/%s/cancel' % queued, {})
        self.assertEqual(status, 409)
        self.assertEqual(set(json.loads(raw)), {'error'})
        self.assertEqual(json.loads(self.request('/api/jobs/%s/cancel' % running, {})[1])['status'], 'running')
        self.assertTrue(jobs.is_cancel_requested(running))
        missing = str(uuid.uuid4())
        self.assertEqual(self.request('/api/jobs/%s' % missing)[0], 404)
        self.assertEqual(self.request('/api/jobs/%s/cancel' % missing, {})[0], 404)
        self.assertEqual(self.request('/api/jobs/not-a-uuid')[0], 404)

    def test_latest_article_photo_refs_and_media_bytes(self):
        import base64
        use_temp_vault(self)
        raw = b'\x89PNG\r\n\x1a\nphoto-bytes'
        url = 'data:image/png;base64,' + base64.b64encode(raw).decode()
        self.request('/api/articles/save', {'draft': {'bodyHtml': '<p>x</p>', 'title': '사진 기사', 'photos': [{'id': 'p1', 'data': url, 'original': url}]}})
        self.assertEqual(json.loads(self.request('/api/articles/latest')[1])['draft']['photos'][0]['data'], url)  # 기본: 예전처럼 data URL
        photo = json.loads(self.request('/api/articles/latest?photos=ref')[1])['draft']['photos'][0]
        self.assertTrue(photo['data'].startswith('media:') and photo['original'] == photo['data'])
        status, body, headers = self.request('/api/media/' + photo['data'][len('media:'):])
        self.assertEqual((status, body, headers['Content-Type']), (200, raw, 'image/png'))
        status, raw_err, _ = self.request('/api/media/' + '0' * 32)
        self.assertEqual((status, json.loads(raw_err)['code']), (404, 'NOT_FOUND'))
        self.assertEqual(self.request('/api/media/not-an-id')[0], 404)

    def test_latest_article_storage_error_is_a_json_error(self):
        def broken(**_):
            raise storage.RequestError('암호화 저장소를 열 수 없습니다.', 500)
        with patch.object(api.CORE.storage, 'latest_article', broken):
            status, raw, _ = self.request('/api/articles/latest')
        self.assertEqual((status, json.loads(raw)), (500, {'error': '암호화 저장소를 열 수 없습니다.'}))

    def test_latest_article_reopens_newest_with_source_text(self):
        use_temp_vault(self)
        self.assertEqual(json.loads(self.request("/api/articles/latest")[1]), {"draft": None})
        source_id, _ = storage.save_source("자료.txt", "원문".encode(), "원문")
        self.request("/api/articles/save", {"draft": {"bodyHtml": "<p>옛</p>", "title": "옛 원고"}})
        self.request("/api/articles/save", {"draft": {"bodyHtml": "<p>새</p>", "content": "새", "title": "새 원고",
                                                      "sources": [{"id": source_id, "name": "자료.txt"}]}})
        draft = json.loads(self.request("/api/articles/latest")[1])["draft"]
        self.assertEqual((draft["title"], draft["content"], draft["sources"][0]["text"]), ("새 원고", "새", "원문"))

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

    # TODO(debt: DEBT-005): 업로드가 만든 색인 워커 종료 후 임시 vault를 정리하도록 fixture 보완 필요.
    def test_materials_extract(self):
        import base64
        use_temp_vault(self)
        status, raw, _ = self.request('/api/materials/extract', {'filename': '자료.txt', 'data': base64.b64encode('보도자료 본문'.encode()).decode()})
        out = json.loads(raw)
        self.assertEqual((status, out['text']), (200, '보도자료 본문'))
        self.assertEqual(storage.source_file(out['sourceId'])[0].decode(), '보도자료 본문')  # 원본 보관
        self.assertEqual(self.request('/api/materials/extract', {'filename': 'x.exe', 'data': 'eA=='})[0], 415)

    def test_sources_open(self):
        import base64
        opened = []
        use_temp_vault(self)
        with patch.object(storage.os, 'startfile', opened.append, create=True), patch.object(storage.sys, 'platform', 'win32'):
            raw = self.request('/api/materials/extract', {'filename': '원본.txt', 'data': base64.b64encode('본문'.encode()).decode()})[1]
            source_id = json.loads(raw)['sourceId']
            self.assertEqual(self.request('/api/sources/open', {'sourceId': source_id})[0], 200)
            self.assertEqual([Path(p).name for p in opened], ['원본.txt'])
            status, body, headers = self.request(f'/api/sources/{source_id}/file')  # 앱 안 뷰어용 원본
            self.assertEqual((status, body.decode()), (200, '본문'))
            self.assertEqual(self.request('/api/sources/../file')[0], 404)
            self.assertEqual(self.request('/api/sources/open', {'sourceId': '../etc'})[0], 400)
            self.assertEqual(self.request('/api/sources/open', {'sourceId': '0' * 16})[0], 404)

    def test_models_status_endpoint(self):
        status, raw, _ = self.request('/api/models')
        self.assertEqual(status, 200)
        payload = json.loads(raw)
        self.assertTrue(payload['models'])
        self.assertFalse(payload['busy'])
        self.assertIn('dir', payload)

    def test_models_install_without_source_is_rejected(self):
        # 원본 주소(base)가 없는 모델은 동기 검증에서 503. 지금 매니페스트는 모두 base 가 있으므로
        # 테스트 안에서만 base 를 비운다(실제 다운로드가 시작되지 않게).
        real_entry = api.CORE.models.entry
        with patch.object(api.CORE.models, 'entry', lambda model_id='': {**real_entry(model_id), 'base': ''}):
            status, raw, _ = self.request('/api/models/install', {'modelId': 'factcheck-judge-0.6b-v3'})
        self.assertEqual(status, 503)
        self.assertIn('원본 주소', json.loads(raw)['error'])

    def test_models_install_unknown_id(self):
        self.assertEqual(self.request('/api/models/install', {'modelId': 'nope'})[0], 404)


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


class SupabaseSessionTests(ApiTestCase):
    """로그인(Supabase Auth) → 코어가 토큰 보관 → 백엔드 호출에 그 토큰을 쓴다.

    프론트는 토큰을 받지 않는다(상태만). 앱은 anon 키로 로그인하고, 이후 호출은 JWT로 한다.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.seen = []
        seen = cls.seen

        class Stub(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _send(self, payload, status=200):
                body = json.dumps(payload).encode() if payload is not None else b''
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                if body:
                    self.wfile.write(body)

            def do_GET(self):
                seen.append(('GET', self.path, self.headers.get('Authorization'), None))
                if self.path.startswith('/auth/v1/health'):
                    self._send({'version': 'test'})
                elif self.path.startswith('/rest/v1/projects'):
                    self._send([{'id': 'p1', 'name': '테스트 프로젝트'}])
                else:
                    self._send({'ok': True})

            def do_POST(self):
                size = int(self.headers.get('Content-Length', '0'))
                raw = self.rfile.read(size) if size else b''
                payload = json.loads(raw) if raw else {}
                seen.append(('POST', self.path, self.headers.get('Authorization'), payload))
                if self.path.startswith('/auth/v1/token'):
                    self._send(
                        {
                            'access_token': 'jwt-from-supabase',
                            'refresh_token': 'refresh-1',
                            'expires_in': 3600,
                            'user': {'id': 'u-1', 'email': payload.get('email', 'user@example.com')},
                        }
                    )
                elif self.path.startswith('/auth/v1/logout'):
                    self._send(None, status=204)
                elif self.path == '/ai/responses':
                    text = json.dumps({'headline_candidates': ['제목 하나', '제목 둘', '제목 셋']}, ensure_ascii=False)
                    self._send({'output': [{'content': [{'type': 'output_text', 'text': text}]}]})
                else:
                    self._send({'ok': True})

        cls.stub = ThreadingHTTPServer(('127.0.0.1', 0), Stub)
        threading.Thread(target=cls.stub.serve_forever, daemon=True).start()
        cls.stub_url = 'http://127.0.0.1:' + str(cls.stub.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.stub.shutdown()
        cls.stub.server_close()
        super().tearDownClass()

    def setUp(self):
        auth.clear()
        self.addCleanup(auth.clear)

    def remote(self, token=''):
        return patch.multiple(
            core_config,
            AI_BACKEND='remote',
            AI_BACKEND_URL=self.stub_url,
            APP_TOKEN=token,
            SUPABASE_URL=self.stub_url,
            SUPABASE_ANON_KEY='anon-test',
        )

    def test_status_without_login(self):
        with self.remote():
            status, raw, _ = self.request('/api/session')
        self.assertEqual(status, 200)
        state = json.loads(raw)
        self.assertFalse(state['signedIn'])
        self.assertTrue(state['supabase'])

    def test_sign_in_returns_state_without_token(self):
        with self.remote():
            status, raw, _ = self.request('/api/session', {'email': 'writer@example.com', 'password': 'pw-123456'})
        self.assertEqual(status, 200)
        state = json.loads(raw)
        self.assertTrue(state['signedIn'])
        self.assertEqual(state['email'], 'writer@example.com')
        self.assertNotIn('token', json.dumps(state).lower().replace('signedin', ''))
        path = [item for item in self.seen if item[1].startswith('/auth/v1/token')][-1][1]
        self.assertIn('grant_type=password', path)

    def test_backend_call_uses_user_token(self):
        with self.remote():
            self.request('/api/session', {'email': 'writer@example.com', 'password': 'pw-123456'})
            status, raw, _ = self.request(
                '/api/assist', {'kind': 'metadata', 'requested': 'headline', 'body': '가' * 100}
            )
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)['headline_candidates'][0], '제목 하나')
        method, path, authorization, _ = self.seen[-1]
        self.assertEqual((method, path), ('POST', '/ai/responses'))
        self.assertEqual(authorization, 'Bearer jwt-from-supabase')

    def test_sign_out_clears_token(self):
        with self.remote():
            self.request('/api/session', {'email': 'writer@example.com', 'password': 'pw-123456'})
            status, raw, _ = self.request('/api/session/signout', {})
            self.assertEqual(status, 200)
            self.assertFalse(json.loads(raw)['signedIn'])
        self.assertEqual(auth.current_token(), '')

    def test_sign_in_validates_input(self):
        with self.remote():
            self.assertEqual(self.request('/api/session', {'email': 'nope', 'password': 'pw-123456'})[0], 400)
            self.assertEqual(self.request('/api/session', {'email': 'a@b.c', 'password': '123'})[0], 400)


if __name__ == '__main__':
    unittest.main()
