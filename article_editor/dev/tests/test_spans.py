"""화면 강조 위치: 여러 문장짜리 근거 청크 안에서 주장과 맞닿은 구간만 비교해 달라진 단어를 찾는다(window=True)."""
import sys
import unittest
from pathlib import Path

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core.ai.factcheck.assertion import find_explicit_value_conflicts, find_near_copy_differences  # noqa: E402

CHUNK = ('현행법은 무주택 세대주의 월세액을 공제한다. 이에 공제율이 적용되는 대상에 청년을 명시하며 '
         '공제대상 월세액의 한도를 확대함으로써 주거비 부담을 완화하려는 것임. 의안 번호는 21532 이다.')
CLAIM = '이에 공제율이 적용되는 대상에 노인을 명시하며 공제대상 월세액의 한도를 확대함으로써 주거비 부담을 완화하려는 것임.'


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
