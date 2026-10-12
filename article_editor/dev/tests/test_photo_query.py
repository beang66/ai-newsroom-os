# 2026-10-10: 사진 검색창의 한글 검색어 → 영어 검색어(Unsplash). 짧은 검색어도 본문 길이 검사(20자)에 걸리지 않아야 한다
import unittest
from unittest.mock import patch

import su_server  # noqa: F401  — .env 격리 + app 경로 등록
from core.ai import router
from core.errors import RequestError


class PhotoQuery(unittest.TestCase):
    def test_short_korean_query_translated(self):
        with patch.object(router, 'structured_call', return_value={'query': 'baseball stadium'}) as call:
            self.assertEqual(router.assist({'kind': 'photo_query', 'body': '야구장'}), {'query': 'baseball stadium'})
        name, instructions, schema, content = call.call_args.args
        self.assertEqual(name, 'photo_query')
        self.assertEqual(content, '야구장')
        self.assertIn('영어 검색어', instructions)

    def test_empty_or_long_query_rejected(self):
        for body in ('', '   ', '가' * 151):
            with self.assertRaises(RequestError):
                router.assist({'kind': 'photo_query', 'body': body})


if __name__ == '__main__':
    unittest.main()
