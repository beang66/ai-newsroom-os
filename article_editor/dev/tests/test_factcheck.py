"""팩트체크·의미 청킹 계약 테스트 (factcheck.status / factcheck.run / semantic.parse).

모델이 없어도 도는 계약 검사 + 모델이 설치돼 있을 때만 도는 실제 판정 검사.
모델 설치: ModelManager.install(model_id=..., source=<폴더>) — docs/LOCAL_MODELS.md
"""
import json
import unittest

from test_server import ApiTestCase

MATERIAL = {'id': 'm1', 'title': '부여군 청소년 선발대회 개최', 'date': '2026-10-01', 'speaker': '부여군',
            'content': '부여군은 오는 10일 군청 대강당에서 청소년 리더 선발대회를 개최한다. 참가자격은 관내 중학생이며 '
                       '선착순 50명을 모집한다. 다만 기상 악화 시 행사는 온라인으로 전환될 수 있다.'}


class FactcheckContractTests(ApiTestCase):
    def test_status_shape(self):
        status, raw, _ = self.request('/api/factcheck/status')
        self.assertEqual(status, 200)
        data = json.loads(raw)
        self.assertEqual(set(data), {'ready', 'models', 'runtime'})
        self.assertEqual(set(data['models']), {'judge', 'embedding', 'boundary'})

    def test_run_validates_input(self):
        for body in ({'nodes': [], 'materials': []}, {'nodes': 'x', 'materials': []},
                     {'nodes': [{'id': 'n1', 'text': 'a' * 5000}], 'materials': []}):
            status, raw, _ = self.request('/api/factcheck/run', body)
            self.assertEqual(status, 400, raw)

    def test_parse_splits_and_keeps_limitation(self):
        status, raw, _ = self.request('/api/semantic/parse', {'text': MATERIAL['content']})
        self.assertEqual(status, 200, raw)
        units = json.loads(raw)['units']
        self.assertTrue(units and all(u['text'] for u in units))
        # '다만' 제한문은 앞 문장과 떨어지지 않는다 (규칙 경계, 모델 없이도 성립)
        self.assertTrue(any('개최한다' in u['text'] and '다만' in u['text'] for u in units)
                        or any(u['text'].startswith('참가자격') and '다만' in u['text'] for u in units))

    def test_parse_rejects_bad_source(self):
        status, _, _ = self.request('/api/semantic/parse', {'text': '본문', 'source': 'x'})
        self.assertEqual(status, 400)


class FactcheckModelTests(ApiTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        status, raw, _ = cls.request(cls, '/api/factcheck/status')
        if not json.loads(raw)['ready']:
            cls.tearDownClass()
            raise unittest.SkipTest('팩트체크 모델/런타임 미설치')

    def test_supported_claim(self):
        body = {'nodes': [{'id': 'n1', 'type': 'FACT', 'text': '부여군은 10일 청소년 리더 선발대회를 연다.',
                           'linkedSourceIds': ['m1']}], 'materials': [MATERIAL]}
        status, raw, _ = self.request('/api/factcheck/run', body)
        self.assertEqual(status, 200, raw)
        data = json.loads(raw)
        self.assertTrue(data['success'])
        self.assertEqual(data['results'][0]['status'], 'SUPPORTED')
        self.assertEqual(data['node_statuses']['n1'], 'verified')


if __name__ == '__main__':
    unittest.main()
