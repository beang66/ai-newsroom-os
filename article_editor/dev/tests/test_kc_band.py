"""입력 확장 버섯체 + 숫자 밴드(kc_band.py): 숫자 표기 차이를 같은 토큰으로 묶고, 문서 쪽 계산은 색인마다 한 번이다.
연구 구현과의 동일성(토큰·어휘 특징)과 성능은 research/mushroom-body-redesign/scripts/p12_app_parity.py 로 확인했다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'app'))

try:
    import numpy as np
    from core.ai.factcheck import kc_band, retrieval
    from test_chunk_index import FakeCache, make_chunks
except ImportError:  # 팩트체크 런타임이 없는 환경
    np = None


@unittest.skipIf(np is None, 'numpy 필요')
class KCBandTests(unittest.TestCase):
    def test_unit_and_comma_forms_share_band_tokens(self):
        a = kc_band.number_band_tokens('2915만1000명')
        self.assertTrue(set(a) & set(kc_band.number_band_tokens('29,151,000명')))
        self.assertEqual(len(kc_band.number_band_tokens('예산 3억원')), 8)  # 원 표기 + 단위 전개, 밴드 4개씩

    def test_char_tokens(self):
        self.assertEqual(kc_band.char_tokens('예산 1,234 KPI'), ['예산', '1234', 'kpi'])

    def test_winner_count_and_determinism(self):
        chunks, cache = make_chunks(), FakeCache()
        texts = [c['text'] for c in chunks]
        vecs = cache.encode(texts, 'document')
        a, b = kc_band.KCIndex(texts, vecs), kc_band.KCIndex(texts, vecs)
        self.assertEqual(a.doc_winners[0].shape, (len(texts), kc_band.WINNERS))
        q = cache.encode([texts[7]], 'query')[0]
        self.assertEqual(list(a.top(texts[7], q)), list(b.top(texts[7], q)))
        self.assertEqual(int(a.top(texts[7], q)[0]), 7)  # 같은 글·같은 벡터면 자기 자신이 1위

    def test_document_side_work_happens_once_per_index(self):
        chunks, cache = make_chunks(), FakeCache()
        built = []
        real = kc_band.KCIndex
        with mock.patch.dict(os.environ, {'FACTCHECK_RETRIEVAL': 'kc-band-bm25-rrf'}), \
                mock.patch.object(kc_band, 'KCIndex', lambda t, v: built.append(1) or real(t, v)):
            index = retrieval.ChunkIndex(chunks, cache)
            for q in ('가', '나', '다'):
                rows = retrieval.rank_chunks(q, chunks, limit=5, cache=cache, index=index)
        self.assertEqual(len(built), 1)
        self.assertEqual(rows[0]['retrieval_engine'], 'qwen3-embedding-0.6b-kc8-band-bm25-rrf')


if __name__ == '__main__':
    unittest.main()
