"""팩트체크 기록(core/factcheck_memo.py + AIManager): 이미 판정한 (문장, 자료)는 다시 돌리지 않고 기록을 쓴다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402
from core import factcheck_memo as memo  # noqa: E402
from core.errors import RequestError  # noqa: E402
from core.managers.ai_manager import AIManager  # noqa: E402

MATERIALS = [{'id': 'm1', 'title': '자료', 'content': '시 예산은 10억원이다.'}]


def node(i, text, **extra):
    return {'id': f's{i}', 'type': 'TEXT', 'text': text, **extra}


class FakeService:
    """review_workspace 대역 — 호출된 문장 id 를 기록한다."""

    def __init__(self):
        self.calls = []

    def review_workspace(self, nodes, materials):
        self.calls.append([n['id'] for n in nodes])
        results = [{'node_id': n['id'], 'claim': n['text'], 'status': 'SUPPORTED' if '맞' in n['text'] else 'EVIDENCE_GAP',
                    'evidence': {'text': '근거'}} for n in nodes]
        return {'success': True, 'engine': 'fake', 'model': 'm', 'counts': {}, 'results': results,
                'node_statuses': {r['node_id']: 'verified' if r['status'] == 'SUPPORTED' else 'unverified' for r in results},
                'critiques': [{'id': f'local-gap-{r["node_id"]}', 'category': 'source', 'nodeId': r['node_id']}
                              for r in results if r['status'] == 'EVIDENCE_GAP']}


class MemoTests(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)
        self.service = FakeService()
        module = types.ModuleType('core.ai.factcheck.service')
        module.review_workspace = self.service.review_workspace
        for patcher in (mock.patch.dict(sys.modules, {'core.ai.factcheck.service': module}),
                        mock.patch.object(memo, 'model_version', lambda: 'm1')):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.ready = {'ready': True}
        self.manager = AIManager()
        self.manager.factcheck_status = lambda: self.ready

    def run_check(self, nodes, materials=MATERIALS):
        return self.manager.factcheck_run({'nodes': nodes, 'materials': materials})

    def test_second_run_uses_record_and_restamps_ids(self):
        first = self.run_check([node(1, '맞는 문장입니다.'), node(2, '근거 없는 문장입니다.')])
        again = self.run_check([node(7, '맞는 문장입니다.'), node(8, '근거 없는 문장입니다.')])  # 다시 열었을 때(id 가 달라짐)
        self.assertEqual(self.service.calls, [['s1', 's2']])  # 두 번째는 모델을 부르지 않았다
        self.assertEqual([r['node_id'] for r in again['results']], ['s7', 's8'])
        self.assertEqual([r['status'] for r in again['results']], [r['status'] for r in first['results']])
        self.assertEqual((again['cached'], again['node_statuses']), (2, {'s7': 'verified', 's8': 'unverified'}))
        self.assertEqual([(c['id'], c['nodeId']) for c in again['critiques']], [('local-gap-s8', 's8')])
        self.assertEqual(again['counts'], {'SUPPORTED': 1, 'EVIDENCE_GAP': 1})

    def test_only_edited_sentence_is_rejudged(self):
        self.run_check([node(1, '맞는 문장입니다.'), node(2, '둘째 문장입니다.')])
        out = self.run_check([node(1, '맞는 문장입니다.'), node(2, '고친 둘째 문장입니다.')])
        self.assertEqual(self.service.calls[-1], ['s2'])
        self.assertEqual([r['node_id'] for r in out['results']], ['s1', 's2'])

    def test_supported_evidence_location_is_added_to_old_cached_result(self):
        n = node(1, '소각 예정 금액은 약 20억원 규모다.')
        quote = '공시 내용. 소각예정금액(원) 1,999,987,622. 기타 안내.'
        key = memo.node_key(n, memo.fingerprint(MATERIALS), 'm1')
        old = {'node_id': 'old', 'claim': n['text'], 'status': 'SUPPORTED', 'evidence': {'text': quote}}
        memo.put_many({key: memo.pack_node(old, 'verified', None)})
        result = self.run_check([n])['results'][0]
        span = result['support_spans'][0]
        self.assertEqual(quote[span['evidence_start']:span['evidence_end']], '소각예정금액(원) 1,999,987,622.')
        self.assertEqual(self.service.calls, [])

    def test_changed_materials_or_model_rejudge_everything(self):
        nodes = [node(1, '맞는 문장입니다.')]
        self.run_check(nodes)
        self.run_check(nodes, [dict(MATERIALS[0], content='시 예산은 20억원이다.')])
        with mock.patch.object(memo, 'model_version', lambda: 'm2'):
            self.run_check(nodes)
        self.assertEqual(len(self.service.calls), 3)

    def test_cached_results_do_not_need_models_but_new_sentences_do(self):
        self.run_check([node(1, '맞는 문장입니다.')])
        self.ready = {'ready': False}
        self.assertEqual(len(self.run_check([node(1, '맞는 문장입니다.')])['results']), 1)
        with self.assertRaises(RequestError) as caught:
            self.run_check([node(1, '맞는 문장입니다.'), node(2, '새 문장입니다.')])
        self.assertEqual(caught.exception.status, 503)

    def test_external_recheck_is_remembered(self):
        calls = []
        module = types.ModuleType('core.ai.factcheck.external')
        module.judge = lambda payload: calls.append(payload) or {
            'results': [{'id': i['id'], 'verdict': 'CONFLICT', 'reason': '이유'} for i in payload['items']]}
        with mock.patch.dict(sys.modules, {'core.ai.factcheck.external': module}):
            item = {'id': '0', 'claim': '문장', 'evidence': ['근거'], 'titles': ['자료']}
            first = self.manager.factcheck_external({'items': [item]})
            again = self.manager.factcheck_external({'items': [dict(item, id='5')]})
        self.assertEqual(len(calls), 1)
        self.assertEqual((first['results'][0]['verdict'], again['results'][0]['id'], again['results'][0]['verdict']),
                         ('CONFLICT', '5', 'CONFLICT'))

    def test_cached_only_never_calls_openai(self):
        calls = []
        module = types.ModuleType('core.ai.factcheck.external')
        module.judge = lambda payload: calls.append(payload) or {
            'results': [{'id': i['id'], 'verdict': 'CONFLICT', 'reason': '이유'} for i in payload['items']]}
        with mock.patch.dict(sys.modules, {'core.ai.factcheck.external': module}):
            known = {'id': '0', 'claim': '이미 재검토한 문장', 'evidence': ['근거'], 'titles': ['자료']}
            unknown = {'id': '1', 'claim': '재검토한 적 없는 문장', 'evidence': ['근거'], 'titles': ['자료']}
            self.manager.factcheck_external({'items': [known]})  # 사용자가 하이라이트를 눌러 재검토함
            self.assertEqual(len(calls), 1)
            out = self.manager.factcheck_external({'items': [dict(known, id='9'), unknown], 'cachedOnly': True})  # 다시 열었을 때
            none = self.manager.factcheck_external({'items': [unknown], 'cachedOnly': True})
        self.assertEqual(len(calls), 1)  # OpenAI 는 더 호출되지 않았다
        self.assertEqual([(r['id'], r['verdict']) for r in out['results']], [('9', 'CONFLICT')])  # 저장된 것만, 없는 문장은 빠진다
        self.assertEqual(none['results'], [])


if __name__ == '__main__':
    unittest.main()
