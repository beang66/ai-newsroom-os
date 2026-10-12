"""긴 문장 안 제출 대상의 오류: 관계 분해, 판정 합치기, 대응 위치 회귀 검사."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'app'))
from core.ai.factcheck.assertion import recipient_assertions
from core.ai.factcheck.semantic_provider import SemanticJudgement
from core.ai.factcheck.service import _judge_qwen_candidates

CLAIM = ('등록을 신청하는 사업자는 국토교통부령인 「물류창고업 등록에 관한 규칙」과 '
         '국토교통부고시인 「물류창고업 화재안전 관리계획서 작성지침」에 따라 '
         '화재안전 관리계획서를 마련해 관할 소방서장에게 제출해야 한다.')
EVIDENCE = ('현행법은 물류창고업 등록에 관한 사항을 규정하고 있으며, 물류창고업을 등록하려는 자는 '
            '관련 규칙과 지침에 따라 화재안전 관리계획서를 작성하여 지방자치단체장 등에 게 제출하도록 규정하고 있음.')


class Provider:
    def __init__(self, status='CONFLICT'):
        self.status = status
        self.calls = []

    def judge(self, claim, evidence):
        self.calls.append(claim)
        return SemanticJudgement(self.status if len(claim) < 100 else 'SUPPORTED', '시험 판정', 0.99)


class RecipientTests(unittest.TestCase):
    def decide(self, provider, claim=CLAIM, evidence=EVIDENCE):
        return _judge_qwen_candidates(provider, claim, {}, [{'text': evidence, 'material_id': 'm1'}])

    def test_long_supported_sentence_is_checked_for_recipient_conflict(self):
        provider = Provider()
        out = self.decide(provider)
        self.assertEqual(out['status'], 'CONFLICT')
        self.assertEqual(provider.calls[1], '화재안전 관리계획서를 관할 소방서장에게 제출해야 한다.')
        span = out['conflict_spans'][0]
        self.assertEqual(CLAIM[span['claim_start']:span['claim_end']], '관할 소방서장')
        self.assertEqual(EVIDENCE[span['evidence_start']:span['evidence_end']], '지방자치단체장')

    def test_matching_relation_is_not_overridden_by_name_rules(self):
        self.assertEqual(self.decide(Provider('SUPPORTED'))['status'], 'SUPPORTED')

    def test_uncertain_relation_requests_review_instead_of_conflict(self):
        self.assertEqual(self.decide(Provider('EVIDENCE_GAP'))['status'], 'REVIEW')

    def test_short_sentence_is_not_judged_twice(self):
        provider = Provider('SUPPORTED')
        self.decide(provider, '화재안전 관리계획서를 지방자치단체장에게 제출한다.')
        self.assertEqual(len(provider.calls), 1)

    def test_negation_is_kept_in_atomic_claim(self):
        atom = recipient_assertions(CLAIM.replace('제출해야 한다.', '제출하지 않는다.'))[0]
        self.assertTrue(atom['text'].endswith('제출하지 않는다.'))

    def test_pronoun_without_object_is_not_rewritten_as_a_fact(self):
        self.assertEqual(recipient_assertions('이를 관할 소방서장에게 제출해야 한다.'), [])


if __name__ == '__main__':
    unittest.main()
