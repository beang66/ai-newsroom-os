# su4228 v30 (origin/feature/su4228-article-workspace, 6dc497f) 시험을 그대로 가져옴. 달라진 점: `import server` → `import su_server as server`(우리 코어 모듈로 이어 주는 층).
import unittest
import su_server as server
class EditorialSubtitle(unittest.TestCase):
    def test_noun_stack_rejected(self):
        self.assertIn('조사 없는 명사 나열',server.subtitle_style_violations('단어 선택 미세 변경으로 글 질 유지하며 흔적 남김'))
        self.assertEqual(server.subtitle_style_violations('단어 선택을 조금 바꿔 눈에 보이지 않는 흔적 표시'),[])
    def test_multiple_experiments_in_one_line(self):
        text='글 단어 10% 바꾸면 탐지율 92%에서 66%로 줄고 25% 바꾸면 17%까지 감소'
        self.assertIn('한 줄에 여러 실험 비교 나열',server.subtitle_style_violations(text))
        self.assertEqual(server.subtitle_style_violations('단어 10% 바꾸자 탐지율 92%→66%'),[])
