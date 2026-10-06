"""화면 강조 위치: 여러 문장짜리 근거 청크 안에서 주장과 맞닿은 구간만 비교해 달라진 단어를 찾는다(window=True)."""
import sys
import unittest
from pathlib import Path

_APP = Path(__file__).resolve().parents[2] / 'app'
if str(_APP) not in sys.path:
    sys.path.insert(0, str(_APP))

from core.ai.factcheck.assertion import find_near_copy_differences  # noqa: E402

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


if __name__ == '__main__':
    unittest.main()
