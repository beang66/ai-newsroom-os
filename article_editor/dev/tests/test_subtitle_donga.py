# 2026-10-08: 동아일보 부제 경로(KoBART 초안 → OpenAI 1회) — 비교 테스트에서 검증한 구조를 앱에 옮긴 것
import json
import os
import unittest
from unittest.mock import patch

import su_server  # noqa: F401  — .env 격리 + app 경로 등록
from core.ai import router, subtitle_donga

BODY = '제주도는 22년간 지방비 등 3074억 원을 투입했다. 고사목을 제거하고 나무예방주사를 놓았다. 도는 2030년 청정지역을 목표로 한다.'


def fake_openai(lines):
    return lambda path, payload: {'output': [{'content': [{'type': 'output_text', 'text': json.dumps({'subtitle_lines': lines}, ensure_ascii=False)}]}]}


class SubtitleDonga(unittest.TestCase):
    def test_tidy_line(self):
        self.assertEqual(subtitle_donga.tidy_line('1. 고사목 제거·나무예방주사 실시.'), '고사목 제거-나무예방주사 실시')
        self.assertEqual(subtitle_donga.tidy_line('홍콩 서버가 역할 분담하는 체계로 진행됨'), '홍콩 서버가 역할 분담하는 체계로 진행')
        self.assertEqual(subtitle_donga.tidy_line('정규시즌 1위 확정했다'), '정규시즌 1위 확정')
        self.assertEqual(subtitle_donga.tidy_line('감독 “더 높은 곳 노린다”'), '감독 “더 높은 곳 노린다”')  # 인용은 그대로

    def test_generate_short_lines_and_drops_invented_numbers(self):
        lines = ['22년간 지방비 등 3074억 투입', '고사목 제거·나무예방주사 실시', '5000억 추가 투입 예정', '2030년 청정지역 목표']
        with patch.object(subtitle_donga, 'generate_subtitle_drafts', return_value=[['초안']]), \
                patch.object(subtitle_donga, 'openai_call', side_effect=fake_openai(lines)) as call:
            result = subtitle_donga.subtitle_result(BODY, '제주 재선충 방제')
        self.assertEqual(result['subtitle'], '22년간 지방비 등 3074억 투입\n고사목 제거-나무예방주사 실시\n2030년 청정지역 목표')
        payload = call.call_args.args[1]
        self.assertEqual(payload['temperature'], 0)
        self.assertIn('[동아일보 부제 규칙]', payload['instructions'])
        self.assertIn('[KoBART 초안]\n초안', payload['input'][0]['content'][0]['text'])

    def test_subheadline_request_uses_donga_route(self):
        with patch.dict(os.environ, {'USE_LOCAL_MODELS': 'true'}), \
                patch.object(subtitle_donga, 'generate_subtitle_drafts', return_value=[['초안']]), \
                patch.object(subtitle_donga, 'openai_call', side_effect=fake_openai(['고사목 제거-나무예방주사 실시', '2030년 청정지역 목표'])), \
                patch.object(router, 'metadata_assist') as old_route:
            result = router.assist({'kind': 'metadata', 'requested': 'subheadline', 'body': BODY, 'current_headline': '제목'})
        old_route.assert_not_called()
        self.assertEqual(result['subtitle'].splitlines(), ['고사목 제거-나무예방주사 실시', '2030년 청정지역 목표'])


if __name__ == '__main__':
    unittest.main()
