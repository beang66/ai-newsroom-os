"""문장 분리: 마침표가 있는 보도자료는 그대로, 마침표 없는 개조식 줄글은 불릿·명사형 종결(함·임·음·됨)에서 나뉜다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'app'))
from core.ai.factcheck.semantic_chunker_v3 import HARD_LIMIT, packed_units, split_sentences  # noqa: E402

PRESS = ('교육지원청은 11일 학부모 100명을 초대해 설명회를 열었다. 참석자들은 “만족스럽다.”고 말했다. '
         '일을 하다 보니 시간이 부족했다. 결과가 중요하다 보니 서둘렀다. 다음 행사는 12월 2일에 열린다.')


class SentenceSplit(unittest.TestCase):
    def test_press_text_with_periods_is_unchanged(self):
        self.assertEqual(split_sentences(PRESS), [
            '교육지원청은 11일 학부모 100명을 초대해 설명회를 열었다.', '참석자들은 “만족스럽다.”고 말했다.',
            '일을 하다 보니 시간이 부족했다.', '결과가 중요하다 보니 서둘렀다.', '다음 행사는 12월 2일에 열린다.'])

    def test_gaejosik_text_splits_at_bullets_and_noun_endings(self):
        t = ('ㅇ 전산업 생산은 3.6% 증가한 가운데 서비스업이 3.2%, 제조업이 1.0% 증가함 ㅇ 소매판매는 감소 -0.9% 하락함 '
             '- 서비스업 중 보건업(6.1%→6.2%)은 증가 □ 기타 농산물 ○ 특용작물 : 느타리버섯(10.6%) 등이 상승하여 전년대비 3.1% 상승')
        parts = split_sentences(t)
        self.assertEqual(len(parts), 4)
        self.assertTrue(parts[0].endswith('증가함') and parts[1].startswith('ㅇ 소매판매') and parts[2].startswith('- 서비스업'))
        self.assertTrue(parts[3].startswith('□ 기타 농산물 ○ 특용작물'))  # 짧은 제목은 다음 문장에 붙는다

    def test_no_split_on_comma_or_spacing_glitch(self):
        t = '서비스업이 3.2%, 제조업이 1.0%, 건설업이 -2.1% 증가한 가운데 소매판매는 감소한 것으로 나타났음에도 불구하고 전체 생산은 늘어남 이 로 인해 정책 효과가 있었음'
        self.assertEqual(len(split_sentences(t)), 1)  # 쉼표에서는 자르지 않고, 다음 낱말이 조사('이')면 경계가 아니다

    def test_packed_chunks_respect_hard_limit(self):
        t = ' '.join(f'ㅇ 항목{n}의 값은 {n}00으로 전년보다 {n}.5% 증가한 것으로 집계됨' for n in range(60))
        chunks = [u.text for u in packed_units(t).units]
        self.assertGreater(len(chunks), 3)
        self.assertTrue(all(len(c) <= HARD_LIMIT for c in chunks))
        self.assertTrue(all(c.endswith('집계됨') for c in chunks))  # 문장 끝에서만 끊긴다


if __name__ == '__main__':
    unittest.main()
