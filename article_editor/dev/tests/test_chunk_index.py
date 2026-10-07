"""후보 청크 색인(ChunkIndex): 주장마다 다시 읽고 색인하지 않아도 순위·점수는 그대로다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'app'))

try:
    import numpy as np
    from core.ai.factcheck import fusion, retrieval, service
except ImportError:  # 팩트체크 런타임이 없는 환경
    np = None


class FakeCache:
    """VectorCache 대역: 글자에서 정해지는 벡터를 돌려주고 문서 쪽 호출 횟수를 센다."""

    def __init__(self):
        self.document_calls = 0

    def encode(self, texts, role):
        if role == 'document':
            self.document_calls += 1
        rows = []
        for text in texts:
            rng = np.random.RandomState(abs(hash(('v', text))) % (2 ** 31))
            v = rng.randn(1024).astype('<f4')
            rows.append(v / np.linalg.norm(v))
        return np.stack(rows) if rows else np.empty((0, 1024), dtype='<f4')


def make_chunks(n=60):
    topics = ['예산', '인구', '교통', '교육', '복지', '환경']
    return [{'text': f'{topics[i % 6]} 관련 문장 {i} 은 {i * 7}억원 규모이다.', 'material_id': f'm{i % 3}'} for i in range(n)]


@unittest.skipIf(np is None, 'numpy 필요')
class ChunkIndexTests(unittest.TestCase):
    def ranked(self, mode, with_index):
        chunks, cache = make_chunks(), FakeCache()
        index = retrieval.ChunkIndex(chunks, cache) if with_index else None
        with mock.patch.dict(os.environ, {'FACTCHECK_RETRIEVAL': mode}):
            return [retrieval.rank_chunks(q, chunks, limit=10, cache=cache, index=index)
                    for q in ('예산 3억원', '교통 관련 문장 8', '환경 28억원 규모')]

    def test_same_ranking_and_scores_with_and_without_index(self):
        for mode in ('densefly-bm25-rrf', 'exact'):
            plain, indexed = self.ranked(mode, False), self.ranked(mode, True)
            for a, b in zip(plain, indexed):
                self.assertEqual([(r['text'], r['retrieval_rank'], r['retrieval_score']) for r in a],
                                 [(r['text'], r['retrieval_rank'], r['retrieval_score']) for r in b], mode)

    def test_document_side_work_happens_once_per_index(self):
        chunks, cache = make_chunks(), FakeCache()
        builds, projections = [], []
        real_bm25, real_codes = fusion.BM25, fusion.doc_codes
        with mock.patch.dict(os.environ, {'FACTCHECK_RETRIEVAL': 'densefly-bm25-rrf'}), \
                mock.patch.object(fusion, 'BM25', lambda texts: builds.append(1) or real_bm25(texts)), \
                mock.patch.object(fusion, 'doc_codes', lambda v, s: projections.append(s) or real_codes(v, s)):
            index = retrieval.ChunkIndex(chunks, cache)
            for q in ('가', '나', '다', '라'):
                retrieval.rank_chunks(q, chunks, limit=5, cache=cache, index=index)
        self.assertEqual(cache.document_calls, 1)  # 벡터는 한 번만 읽는다
        self.assertEqual(len(builds), 1)  # BM25 색인은 한 번만 만든다
        self.assertEqual(sorted(projections), sorted(fusion.SEEDS))  # 희소 코드는 seed 마다 한 번

    def test_without_index_each_call_rebuilds_as_before(self):
        chunks, cache = make_chunks(), FakeCache()
        for q in ('가', '나', '다'):
            retrieval.rank_chunks(q, chunks, limit=5, cache=cache)
        self.assertEqual(cache.document_calls, 3)  # 기존 동작(호환)

    def test_service_reuses_index_per_candidate_scope(self):
        chunks, cache = make_chunks(), FakeCache()
        indexes = {}
        with mock.patch.object(retrieval, 'get_vector_cache', lambda: cache):
            for claim in ('예산 3억원', '교통 8', '환경 28'):
                service._retrieve_qwen_candidates(claim, {}, chunks, indexes=indexes)
            self.assertEqual(cache.document_calls, 1)  # 주장 3개가 한 번 읽은 벡터를 같이 쓴다
            service._retrieve_qwen_candidates('예산', {'linkedSourceIds': ['m1']}, chunks, indexes=indexes)
            self.assertEqual(cache.document_calls, 2)  # 연결 자료가 다르면 다른 후보 집합이라 따로 색인
            self.assertEqual(len(indexes), 2)


if __name__ == '__main__':
    unittest.main()
