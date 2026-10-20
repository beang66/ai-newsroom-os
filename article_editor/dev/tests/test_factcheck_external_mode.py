"""로컬 팩트체크 끔: 모든 문장을 외부 모델이 판정하고, 판정 기록은 로컬 판정과 따로 쓴다."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import env_isolation  # noqa: F401  (core 보다 먼저)
import vault_fixture  # noqa: F401
from core import factcheck_memo
from core.ai.factcheck import external, service
from core.managers import ai_manager, session_manager, settings_manager


class ExternalModeTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.file = Path(temp.name) / 'settings.json'
        for module in (session_manager, settings_manager):
            patcher = mock.patch.object(module, 'SETTINGS', self.file)
            patcher.start()
            self.addCleanup(patcher.stop)

    def set_local(self, value):
        settings_manager.SettingsManager().update({'localAi': value})

    def test_setting_default_is_openai_validates_and_changes_memo_version(self):
        self.assertFalse(settings_manager.local_ai())
        external_version = factcheck_memo.model_version()
        self.set_local(True)
        self.assertTrue(settings_manager.local_ai())
        self.assertTrue(external_version.startswith(factcheck_memo.model_version() + '+external:'))
        self.assertIn(external.JUDGE_VERSION, external_version)  # 판정 모델·지시가 바뀌면 기록을 다시 쓰지 않는다
        with self.assertRaises(Exception):
            settings_manager.SettingsManager().update({'localAi': 'no'})

    def test_status_does_not_need_judge_model_when_external(self):
        self.set_local(False)
        with mock.patch('core.ai.factcheck.paths.JUDGE_DIR', Path(tempfile.gettempdir()) / 'no-such-judge'), \
                mock.patch('core.ai.factcheck.retrieval.create_encoder') as encoder:
            encoder.return_value.available.return_value = True
            status = ai_manager.AIManager().factcheck_status()
        self.assertEqual(status['mode'], 'external')
        self.assertFalse(status['models']['judge'])
        self.assertTrue(status['ready'])

    def test_external_pass_maps_verdicts_and_spans(self):
        chunks = [{'text': '매출은 20억원이다.', 'material_title': '자료A', 'material_id': 'a'}]
        nodes = [{'id': 'n1', 'type': 'TEXT', 'text': '매출은 30억원이다.'}, {'id': 'n2', 'type': 'TEXT', 'text': '대표는 김씨다.'}]
        reply = {'results': [
            {'id': 'n1', 'verdict': 'CONFLICT', 'reason': '수치가 다름', 'wrong_text': '30억원', 'evidence_text': '20억원'},
            {'id': 'n2', 'verdict': 'NOT_ENOUGH_INFO', 'reason': '확인 불가', 'wrong_text': '', 'evidence_text': ''}]}
        with mock.patch.object(service, '_retrieve_qwen_candidates', return_value=chunks), \
                mock.patch.object(service, '_direct_span_match', return_value=None), \
                mock.patch.object(external, 'judge', return_value=reply) as judge:
            done = service._external_pass(nodes, chunks, [], {})
        self.assertEqual(len(judge.call_args[0][0]['items']), 2, '문장 둘을 한 번에 보낸다')
        conflict = done['n1'][1]
        self.assertEqual((conflict['status'], conflict['provider']), ('CONFLICT', 'external'))
        self.assertEqual((conflict['conflict_spans'][0]['claim_text'], conflict['conflict_spans'][0]['evidence_text']), ('30억원', '20억원'))
        self.assertEqual(done['n2'][1]['status'], 'EVIDENCE_GAP')

    def test_external_sends_top_five_evidence_only(self):
        chunks = [{'text': f'근거 문단 {i}', 'material_title': '자료A', 'material_id': 'a'} for i in range(8)]
        nodes = [{'id': 'n1', 'type': 'TEXT', 'text': '매출은 30억원이다.'}]
        reply = {'results': [{'id': 'n1', 'verdict': 'NOT_ENOUGH_INFO', 'reason': '확인 불가', 'wrong_text': '', 'evidence_text': ''}]}
        with mock.patch.object(service, '_retrieve_qwen_candidates', return_value=chunks),                 mock.patch.object(service, '_direct_span_match', return_value=None),                 mock.patch.object(external, 'judge', return_value=reply) as judge:
            service._external_pass(nodes, chunks, [], {})
        self.assertEqual(len(judge.call_args[0][0]['items'][0]['evidence']), 5, '문장마다 근거 상위 5개만 보낸다')

    def test_external_prompt_has_five_evidence_blocks(self):
        item = {'id': 'n1', 'claim': '매출은 30억원이다.', 'evidence': [f'근거 {i}' for i in range(8)]}
        with mock.patch.object(external, 'structured_call', return_value={'results': []}) as call:
            external.judge({'items': [item]})
        prompt = call.call_args[0][3]
        self.assertIn('[근거 5]', prompt)
        self.assertNotIn('[근거 6]', prompt)

    def test_final_prompt_allows_retry_evidence(self):
        item = {'id': 'n1', 'claim': '매출은 30억원이다.', 'evidence': [f'근거 {i}' for i in range(9)]}
        with mock.patch.object(external, 'structured_call', return_value={'results': []}) as call:
            external.judge({'items': [item], 'final': True})
        self.assertIn('[근거 8]', call.call_args[0][3])
        self.assertNotIn('[근거 9]', call.call_args[0][3])

    def test_request_triggers_one_research_and_final_judgement(self):
        top = [{'text': f'근거 문단 {i}', 'material_title': '자료A', 'material_id': 'a'} for i in range(5)]
        found = top[:2] + [{'text': '수출기업 9월 지수 95.7', 'material_title': '자료A', 'material_id': 'a'}]
        nodes = [{'id': 'n1', 'type': 'TEXT', 'text': '내수기업 지수는 수출기업보다 3.7 높았다.'}]
        first = {'results': [{'id': 'n1', 'verdict': 'NOT_ENOUGH_INFO', 'reason': '값 없음', 'wrong_text': '',
                              'evidence_text': '', 'request': ['수출기업 9월 지수']}]}
        final = {'results': [{'id': 'n1', 'verdict': 'SUPPORTED', 'reason': '99.4-95.7', 'wrong_text': '',
                              'evidence_text': '95.7', 'request': []}]}
        calls = []
        retrieve = lambda claim, node, chunks, **kw: calls.append((claim, kw)) or (found if kw.get('query_vector') is not None else top)
        with mock.patch.object(service, '_retrieve_qwen_candidates', side_effect=retrieve), \
                mock.patch.object(service, '_direct_span_match', return_value=None), \
                mock.patch('core.ai.factcheck.retrieval.get_vector_cache') as cache, \
                mock.patch.object(external, 'judge', side_effect=[first, final]) as judge:
            cache.return_value.encoder.encode.return_value = [[0.0]]
            done = service._external_pass(nodes, top, [], {})
        self.assertEqual(judge.call_count, 2, '요청은 한 번만 재검색·재판정')
        again = judge.call_args[0][0]
        self.assertTrue(again['final'])
        self.assertEqual(again['items'][0]['evidence'][-1], '수출기업 9월 지수 95.7', '안 보낸 근거만 붙인다')
        self.assertEqual(len(again['items'][0]['evidence']), 6)
        self.assertEqual(calls[1][0], '수출기업 9월 지수', '요청문으로 검색')
        self.assertEqual(cache.return_value.encode.call_count, 0, '요청문 벡터는 캐시에 저장하지 않는다')
        self.assertEqual(done['n1'][1]['status'], 'SUPPORTED')
        self.assertEqual(done['n1'][1]['evidence']['text'], '수출기업 9월 지수 95.7')

    def test_click_recheck_researches_materials_and_remembers_final(self):
        item = {'id': '0', 'claim': '내수기업 지수는 수출기업보다 3.7 높았다.', 'evidence': ['내수기업 9월 99.4'], 'titles': ['자료A']}
        first = {'results': [{'id': '0', 'verdict': 'NOT_ENOUGH_INFO', 'reason': '값 없음', 'wrong_text': '',
                              'evidence_text': '', 'request': ['수출기업 9월 지수']}]}
        final = {'results': [{'id': '0', 'verdict': 'SUPPORTED', 'reason': '99.4-95.7', 'wrong_text': '',
                              'evidence_text': '95.7', 'request': []}]}
        found = [{'text': '수출기업 9월 95.7', 'material_title': '자료A', 'material_id': 'a'}]
        with mock.patch.object(service, '_material_chunks', return_value=found),                 mock.patch.object(service, '_retrieve_qwen_candidates', return_value=found) as retrieve,                 mock.patch('core.ai.factcheck.retrieval.get_vector_cache') as cache,                 mock.patch.object(external, 'judge', side_effect=[first, final]) as judge:
            cache.return_value.encoder.encode.return_value = [[0.0]]
            out = ai_manager.AIManager().factcheck_external({'items': [item], 'materials': [{'id': 'a', 'title': '자료A', 'content': '…'}]})
            again = ai_manager.AIManager().factcheck_external({'items': [item], 'cachedOnly': True})
        self.assertEqual(judge.call_count, 2)
        self.assertEqual(judge.call_args[0][0]['items'][0]['evidence'], ['내수기업 9월 99.4', '수출기업 9월 95.7'])
        self.assertEqual(retrieve.call_args[0][0], '수출기업 9월 지수')
        self.assertEqual((out['results'][0]['id'], out['results'][0]['verdict']), ('0', 'SUPPORTED'))
        self.assertEqual(again['results'][0]['verdict'], 'SUPPORTED', '마지막 판정을 기억한다')

    def test_judge_uses_factcheck_model(self):
        item = {'id': 'n1', 'claim': '매출은 30억원이다.', 'evidence': ['매출 20억원']}
        with mock.patch.object(external, 'structured_call', return_value={'results': []}) as call:
            external.judge({'items': [item]})
        self.assertEqual(call.call_args.kwargs['model'], external.FACTCHECK_MODEL)

    def test_review_workspace_end_to_end_without_local_judge(self):
        materials = [{'id': 'a', 'title': '자료A', 'content': '2025년 매출은 20억원이다. 대표는 박씨다.'}]
        nodes = [{'id': 'n1', 'type': 'TEXT', 'text': '2025년 매출은 30억원이다.'}]
        reply = {'results': [{'id': 'n1', 'verdict': 'CONFLICT', 'reason': '수치가 다름', 'wrong_text': '30억원', 'evidence_text': '20억원'}]}
        with mock.patch.object(service, '_get_provider', side_effect=AssertionError('로컬 판정기를 불러오면 안 된다')),                 mock.patch('core.ai.factcheck.retrieval.get_vector_cache', side_effect=RuntimeError('네트워크 없이')),                 mock.patch.object(service, '_retrieve_qwen_candidates', side_effect=lambda claim, node, chunks, **kw: chunks[:3]),                 mock.patch.object(external, 'judge', return_value=reply):
            result = service.review_workspace(nodes, materials, external=True)
        self.assertEqual(result['results'][0]['status'], 'CONFLICT')
        self.assertEqual(result['results'][0]['provider'], 'external')
        self.assertEqual(result['node_statuses']['n1'], 'unverified')


if __name__ == '__main__':
    unittest.main()
