"""IPC 브리지가 HTTP 와 같은 요청에 같은 응답을 주는지 비교한다(같은 임시 저장소, 같은 Handler)."""
import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from vault_fixture import use_temp_vault

_APP = Path(__file__).resolve().parents[2] / 'app'
for p in (str(_APP), str(_APP / 'desktop')):
    if p not in sys.path:
        sys.path.insert(0, p)


class IpcBridgeTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)
        from core import bootstrap
        from desktop.ipc_bridge import Bridge
        self.bridge = Bridge()
        self.httpd = bootstrap.create_server(0)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(lambda: (self.httpd.shutdown(), self.httpd.server_close()))
        self.port = self.httpd.server_address[1]

    def http(self, path, payload=None):
        url = f'http://127.0.0.1:{self.port}{path}'
        data = json.dumps(payload).encode() if payload is not None else None
        headers = {'Content-Type': 'application/json', 'Origin': f'http://127.0.0.1:{self.port}'} if data else {}
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers)) as r:
                return {'status': r.status, 'body': json.loads(r.read())}
        except urllib.error.HTTPError as e:
            return {'status': e.code, 'body': json.loads(e.read())}

    def same(self, path, payload=None):
        a, b = self.http(path, payload), self.bridge.core(path, payload)
        self.assertEqual(a, b, path)
        return b

    def test_get_and_post_match_http(self):
        self.assertEqual(self.same('/api/articles/latest')['status'], 200)
        self.same('/api/articles')  # 목록
        self.same('/api/sources')
        self.same('/api/jobs/00000000-0000-4000-8000-000000000000')  # 404 오류 본문도 같다
        self.same('/api/no-such-route')  # 404
        self.same('/api/articles/save', {'draft': 'not-an-object'})  # 검증 오류도 같다

    def test_save_then_read_round_trip(self):
        draft = {'title': 'IPC 시험', 'bodyHtml': '<p>안녕</p>'}
        r = self.bridge.core('/api/articles/save', {'draft': draft})
        self.assertEqual(r['status'], 200, r)
        article_id = r['body']['articleId']
        self.assertEqual(self.bridge.core('/api/articles/' + article_id)['status'], 200)
        self.assertEqual(self.http('/api/articles/' + article_id)['body'], self.bridge.core('/api/articles/' + article_id)['body'])

    def test_bytes_error_raises(self):
        with self.assertRaises(RuntimeError):
            self.bridge.coreBytes('/api/media/' + 'a' * 32)


if __name__ == '__main__':
    unittest.main()
