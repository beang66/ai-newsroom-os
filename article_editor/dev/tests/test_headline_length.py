# 2026-10-10: 제목이 응답 글자 상한(42)에서 잘려 "…노"처럼 끊기던 문제 — 상한을 풀고, 42자를 넘는 후보만 완결된 짧은 제목으로 다시 쓴다
import unittest
from unittest.mock import patch

import su_server  # noqa: F401  — .env 격리 + app 경로 등록
from core.ai import headline

LONG = "여성가족부, 청소년 유해 정보 노출을 막기 위한 온라인 플랫폼 점검을 다음 달부터 전국에서 시작"  # 50자 남짓
SHORT = "여가부, 청소년 유해 정보 노출 막을 플랫폼 점검 착수"


class HeadlineLength(unittest.TestCase):
    def test_schema_does_not_cut_headlines(self):
        import inspect
        self.assertNotIn("'maxLength':42}", inspect.getsource(headline.metadata_assist))

    def test_long_candidate_rewritten_short_and_complete(self):
        items = [{"headline": LONG, "evidence_sentence": "근거"}, {"headline": "짧은 제목", "evidence_sentence": "근거"}]
        with patch.object(headline, "structured_call", return_value={"headlines": [SHORT]}) as call:
            out = headline.fit_headlines(items, "본문")
        self.assertEqual([x["headline"] for x in out], [SHORT, "짧은 제목"])
        self.assertEqual(call.call_args.args[0], "headline_shorten")

    def test_still_too_long_is_dropped_not_cut(self):
        with patch.object(headline, "structured_call", return_value={"headlines": [LONG]}):
            self.assertEqual(headline.fit_headlines([LONG, "짧은 제목"], "본문"), ["짧은 제목"])

    def test_short_candidates_untouched_without_ai_call(self):
        with patch.object(headline, "structured_call") as call:
            self.assertEqual(headline.fit_headlines(["가", "나"], "본문"), ["가", "나"])
        call.assert_not_called()


if __name__ == "__main__":
    unittest.main()
