"""화면 강조 위치: 여러 문장짜리 근거 청크 안에서 주장과 맞닿은 구간만 비교해 달라진 단어를 찾는다(window=True)."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import unittest
from pathlib import Path

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core.ai.factcheck.assertion import find_explicit_value_conflicts, find_near_copy_differences, find_support_spans  # noqa: E402

CHUNK = ('현행법은 무주택 세대주의 월세액을 공제한다. 이에 공제율이 적용되는 대상에 청년을 명시하며 '
         '공제대상 월세액의 한도를 확대함으로써 주거비 부담을 완화하려는 것임. 의안 번호는 21532 이다.')
CLAIM = '이에 공제율이 적용되는 대상에 노인을 명시하며 공제대상 월세액의 한도를 확대함으로써 주거비 부담을 완화하려는 것임.'


class SupportSpanTests(unittest.TestCase):
    TABLE = ('주식소각 결정 1. 소각할 주식의 종류와 수 보통주식(주) 627,546 종류주식(주) - '
             '2. 발행주식총수 보통주식(주) 29,676,475 - 3. 1주당 가액(원) 500 '
             '4. 소각예정금액(원) 1,999,987,622 5. 소각을 위한 자기주식 취득 예정기간 시작일 - 종료일 - '
             '6. 소각할 주식의 취득방법 기취득 자기주식 7. 소각 예정일 2026-09-07 '
             '8. 자기주식 취득 위탁 투자중개업자 -')

    def marked(self, claim, evidence=None):
        evidence = self.TABLE if evidence is None else evidence
        return [evidence[s['evidence_start']:s['evidence_end']] for s in find_support_spans(claim, evidence)]

    def test_amount_in_table_selects_field_and_value(self):
        self.assertEqual(self.marked('소각 예정 금액은 약 20억원 규모다.'), ['소각예정금액(원) 1,999,987,622'])

    def test_date_in_table_does_not_mark_acquisition_period(self):
        self.assertEqual(self.marked('소각 예정일은 오는 9월 7일이다.'), ['소각 예정일 2026-09-07'])

    def test_same_number_in_korean_units_finds_correct_table_item(self):
        self.assertEqual(self.marked('보통주 62만7546주를 소각한다.'), ['소각할 주식의 종류와 수 보통주식(주) 627,546 종류주식(주) -'])

    def test_only_matching_sentence_is_marked(self):
        self.assertEqual(self.marked('소각 대상은 기취득 자기주식 전량이다.',
                                     '다른 공시 내용입니다. 소각 대상은 기취득 자기주식 전량이다. 소각 예정일은 내일이다.'),
                         ['소각 대상은 기취득 자기주식 전량이다.'])

    def test_unrelated_and_ambiguous_evidence_is_not_painted(self):
        self.assertEqual(self.marked('청소년 축제를 개최한다.'), [])
        self.assertEqual(self.marked('소각 예정 금액은 약 20억원 규모다.',
                                     '소각예정금액 10억원. 소각예정금액 30억원.'), [])


class SpanTests(unittest.TestCase):
    def test_window_finds_changed_word_in_long_chunk(self):
        self.assertEqual(find_near_copy_differences(CLAIM, CHUNK), [])  # 판정 경로(기본값)는 그대로: 청크 전체와는 안 맞음
        spans = find_near_copy_differences(CLAIM, CHUNK, window=True)
        self.assertEqual([s['claim_text'] for s in spans], ['노인을'])
        self.assertEqual(CLAIM[spans[0]['claim_start']:spans[0]['claim_end']], '노인을')

    def test_window_ignores_unrelated_sentence(self):
        self.assertEqual(find_near_copy_differences('부여군은 백제문화제를 연다.', CHUNK, window=True), [])


LAW = ("현행법은 무주택 세대주로서 총급여액이 8천 만원 이하면서 종합소득금액이 7천만원 이하인 근로자의 월세액을 공제한다. "
       "이에 총급여액 요건을 9천 만원 이하로, 종합소득금액 기준을 8천만원 이하로 상향하고, 17%의 공제율이 적용되는 대상에 "
       "청년을 명시하며 공제대상 월세액의 한도를 1천500만원으로 확대함.")
REWRITE = ("개정안은 총급여 기준을 9천만원 이하로, 종합소득 기준을 8천만원 이하로 각각 올리고, 19% 공제율을 적용받는 대상에 "
           "청년을 명문화하며, 월세 한도를 1천500만원까지 늘린다.")


class ValueConflictTests(unittest.TestCase):
    def pairs(self, claim):
        return [(c["claim_text"], c["evidence_text"]) for c in find_explicit_value_conflicts(claim, LAW)]

    def test_rewritten_sentence_marks_only_the_wrong_value(self):
        self.assertEqual(self.pairs(REWRITE), [("19%", "17%")])  # 맞는 9천만원은 칠하지 않는다

    def test_same_value_elsewhere_in_source_does_not_hide_the_error(self):
        # 7천만원은 근거의 현행법 설명에도 있지만, 문맥이 가장 비슷한 자리(총급여 요건)는 9천만원
        self.assertEqual(self.pairs(REWRITE.replace("9천만원", "7천만원").replace("19%", "17%")), [("7천만원", "9천 만원")])

    def test_mixed_korean_numerals_are_one_value(self):
        self.assertEqual(self.pairs("월세액의 한도를 2천만원으로 확대함."), [("2천만원", "1천500만원")])
        self.assertEqual(self.pairs("월세액의 한도를 1천500만원으로 확대함."), [])


if __name__ == '__main__':
    unittest.main()
