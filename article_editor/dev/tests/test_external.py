"""외부 재판정(임시): 숫자 표기 정규화·관련 근거 신호, 그리고 OpenAI 로 무엇을 보내는지(가짜 호출로 확인)."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import unittest
from pathlib import Path
from unittest import mock

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core.ai.factcheck import external  # noqa: E402
from core.ai.factcheck.assertion import shares_value, to_number  # noqa: E402
from core.errors import RequestError  # noqa: E402


class NumberTests(unittest.TestCase):
    def test_same_value_different_notation(self):
        self.assertEqual(to_number('62만7546주'), to_number('627,546'))
        self.assertEqual(to_number('1천500만원'), 15_000_000)
        self.assertEqual(to_number('3억 2천만원'), 320_000_000)
        self.assertIsNone(to_number('2026년'))

    def test_related_evidence_signal(self):
        self.assertTrue(shares_value('젝시믹스는 보통주 62만7546주를 소각한다.', '보통주식(주) 627,546 종류주식(주) -'))
        self.assertFalse(shares_value('2026년 행사를 연다.', '2026 년도 계획'))  # 연도·작은 수는 신호로 쓰지 않는다


class ExternalTests(unittest.TestCase):
    def test_sends_only_claim_and_given_evidence(self):
        seen = {}

        def fake(name, instructions, schema, content):
            seen.update(content=content, schema=schema)
            return {'results': [{'id': '0', 'verdict': 'CONFLICT', 'reason': 'r', 'wrong_text': '72만', 'evidence_text': '627,546'}]}

        with mock.patch.object(external, 'structured_call', fake):
            out = external.judge({'items': [{'id': '0', 'claim': '보통주 72만주를 소각한다.',
                                             'evidence': ['보통주식(주) 627,546'], 'titles': ['[젝시믹스]주식소각결정']}]})
        self.assertEqual(out['results'][0]['verdict'], 'CONFLICT')
        self.assertIn('기사 문장: 보통주 72만주를 소각한다.', seen['content'])
        self.assertIn('[근거 1 — [젝시믹스]주식소각결정] 보통주식(주) 627,546', seen['content'])
        self.assertEqual(seen['schema']['properties']['results']['items']['properties']['verdict']['enum'],
                         ['SUPPORTED', 'CONFLICT', 'NOT_ENOUGH_INFO'])

    def test_rejects_bad_input(self):
        for bad in ({}, {'items': []}, {'items': [{'id': '0', 'claim': '', 'evidence': ['x']}]},
                    {'items': [{'id': '0', 'claim': '문장', 'evidence': []}]}):
            with self.assertRaises(RequestError):
                external.judge(bad)


if __name__ == '__main__':
    unittest.main()
