"""검색 방식 설명(응답의 engine·retrieval)은 실제 동작(FACTCHECK_RETRIEVAL)과 같은 값을 쓴다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'app'))

try:
    import numpy  # noqa: F401
    from core.ai.factcheck import retrieval
except ImportError:  # 팩트체크 런타임이 없는 환경
    retrieval = None


@unittest.skipIf(retrieval is None, 'numpy 필요')
class RetrievalLabelTests(unittest.TestCase):
    def test_default_is_densefly_bm25_rrf(self):
        with mock.patch.dict(os.environ):
            os.environ.pop('FACTCHECK_RETRIEVAL', None)
            self.assertEqual(retrieval.retrieval_mode(), 'densefly-bm25-rrf')
            self.assertIn('BM25', retrieval.RETRIEVAL_LABELS[retrieval.retrieval_mode()])

    def test_exact_switch(self):
        with mock.patch.dict(os.environ, {'FACTCHECK_RETRIEVAL': 'exact'}):
            self.assertEqual(retrieval.retrieval_mode(), 'exact')
            self.assertNotIn('BM25', retrieval.RETRIEVAL_LABELS['exact'])

    def test_unknown_value_falls_back_to_default(self):
        with mock.patch.dict(os.environ, {'FACTCHECK_RETRIEVAL': 'typo'}):
            self.assertEqual(retrieval.retrieval_mode(), 'densefly-bm25-rrf')  # rank_chunks 와 같은 규칙


if __name__ == '__main__':
    unittest.main()
