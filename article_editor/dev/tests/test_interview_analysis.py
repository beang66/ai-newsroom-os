# 2026-10-15: AI 인터뷰 분석을 독립 STT 서버(4000)에서 코어 assist(kind=interview_analysis)로 옮겼다.
# 코어는 Render 중계 서버를 거쳐 로그인한 사용자 토큰으로 호출하므로 PC 에 OpenAI 키가 필요 없다.
# 긴 녹취는 나눠 읽고 합친다 — 사용자에게는 같은 한 번의 요약이다(안내 문구 없음).
import unittest
from unittest.mock import patch

import su_server  # noqa: F401  — .env 격리 + app 경로 등록
from core.ai import router
from core.errors import RequestError

GOOD = {'summary': ' 요약입니다. ', 'keyPoints': ['핵심 하나', ' ', '핵심 둘'], 'keywords': ['키워드', 3, ' ']}


class InterviewAnalysis(unittest.TestCase):
    def test_short_interview_is_one_call_with_clean_result(self):
        with patch.object(router, 'structured_call', return_value=GOOD) as call:
            result = router.assist({'kind': 'interview_analysis', 'body': '기자: 질문입니다. 취재원: 답변입니다. ' * 5})
        self.assertEqual(result, {'summary': '요약입니다.', 'keyPoints': ['핵심 하나', '핵심 둘'], 'keywords': ['키워드']})  # 빈 항목·글자 아닌 값은 뺀다
        self.assertEqual(call.call_count, 1)
        self.assertEqual(call.call_args.args[0], 'interview_analysis')

    def test_chunks_cover_the_whole_text_and_stay_within_the_limit(self):
        sentences = ['%d번째 문장입니다.' % i for i in range(5000)]
        text = ' '.join(sentences)
        chunks = router._interview_chunks(text)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(0 < len(chunk) <= router.INTERVIEW_CHUNK_CHARS for chunk in chunks))
        self.assertEqual(''.join(chunks), text)  # 한 글자도 빠지거나 겹치지 않는다
        # 문장 중간에서 자르지 않는다(마침표 뒤에서 끊긴다)
        self.assertTrue(all(chunk.rstrip().endswith('.') for chunk in chunks))

    def test_text_without_punctuation_is_cut_by_length(self):
        text = '가' * (router.INTERVIEW_CHUNK_CHARS * 2 + 10)
        chunks = router._interview_chunks(text)
        self.assertEqual(''.join(chunks), text)
        self.assertTrue(all(len(chunk) <= router.INTERVIEW_CHUNK_CHARS for chunk in chunks))

    def test_long_interview_is_read_in_parts_then_merged_in_order(self):
        sentences = ['%d번째 발언입니다.' % i for i in range(4000)]
        body = ' '.join(sentences)
        seen = []

        def fake(name, instructions, schema, content):
            seen.append(name)
            if name == 'interview_analysis_part':
                return {'summary': '조각 요약 ' + content[11:20], 'keyPoints': ['조각 핵심'], 'keywords': ['조각']}
            self.assertIn('[1/', content)                           # 합치는 입력은 앞에서부터 번호가 붙고
            self.assertLess(content.index('[1/'), content.index('[2/'))  # 순서가 유지된다
            return {'summary': '전체 요약', 'keyPoints': ['전체 핵심'], 'keywords': ['전체']}

        with patch.object(router, 'structured_call', side_effect=fake):
            result = router.assist({'kind': 'interview_analysis', 'body': body})
        parts = seen.count('interview_analysis_part')
        self.assertEqual(parts, len(router._interview_chunks(body)))
        self.assertGreater(parts, 1)
        self.assertEqual(seen[-1], 'interview_analysis')              # 마지막 호출이 합치기
        self.assertEqual(seen.count('interview_analysis'), 1)
        self.assertEqual(result, {'summary': '전체 요약', 'keyPoints': ['전체 핵심'], 'keywords': ['전체']})  # 안내·잘림 표시 없음

    def test_beyond_the_hard_limit_only_the_first_part_is_read(self):
        body = '가' * (router.INTERVIEW_MAX_CHARS + 5000)
        with patch.object(router, 'structured_call', return_value=GOOD) as call:
            router.assist({'kind': 'interview_analysis', 'body': body})
        total = sum(len(c.args[3]) - len('<interview></interview>') for c in call.call_args_list if c.args[0] == 'interview_analysis_part')
        self.assertEqual(total, router.INTERVIEW_MAX_CHARS)

    def test_too_short_or_not_text_is_rejected_without_calling_ai(self):
        with patch.object(router, 'structured_call') as call:
            for body in ('', '   ', '짧음', None, 123):
                with self.assertRaises(RequestError):
                    router.assist({'kind': 'interview_analysis', 'body': body})
        call.assert_not_called()

    def test_empty_summary_from_ai_is_an_error(self):
        with patch.object(router, 'structured_call', return_value={'summary': '  ', 'keyPoints': [], 'keywords': []}):
            with self.assertRaises(RequestError):
                router.assist({'kind': 'interview_analysis', 'body': '녹취 내용입니다. ' * 10})


if __name__ == '__main__':
    unittest.main()
