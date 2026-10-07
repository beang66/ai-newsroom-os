"""임베딩 캐시: 암호화 저장소(embedding_vectors)에 저장하고, 예전 평문 캐시는 옮긴 뒤 지운다."""
import env_isolation  # noqa: F401  — 가장 먼저(.env 격리)
import sqlite3
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_fixture import use_temp_vault  # noqa: E402
from core import storage, vault  # noqa: E402

try:
    import numpy as np
except ImportError:  # 팩트체크 런타임이 없는 환경
    np = None


@unittest.skipIf(np is None, 'numpy 필요')
class EmbeddingCacheTests(unittest.TestCase):
    def setUp(self):
        self.root = use_temp_vault(self)

    def test_vectors_are_cached_in_vault(self):
        from core.ai.factcheck.retrieval import VectorCache

        class Encoder:
            calls = 0

            def encode(self, texts, role):
                Encoder.calls += 1
                v = np.zeros((len(texts), 1024), dtype='<f4')
                v[:, 0] = 1.0
                return v

        cache = VectorCache(encoder=Encoder())
        first = cache.encode(['가', '나'], 'document')
        again = cache.encode(['가', '나'], 'document')
        self.assertEqual(Encoder.calls, 1)  # 두 번째는 저장된 벡터를 쓴다
        self.assertTrue((first == again).all())
        with vault.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM embedding_vectors').fetchone()[0], 2)

    def test_legacy_plain_cache_is_moved_then_deleted(self):
        legacy = self.root / 'factcheck'
        legacy.mkdir()
        old = legacy / 'qwen3_embedding_vectors.sqlite3'
        db = sqlite3.connect(old)
        db.execute('CREATE TABLE vectors (key TEXT PRIMARY KEY, vector BLOB NOT NULL, origin TEXT NOT NULL)')
        db.executemany('INSERT INTO vectors VALUES (?, ?, ?)', [(f'k{i}', bytes([i % 250]) * 8, 'local-cpu') for i in range(1200)])
        db.commit()
        db.close()
        with mock.patch('core.ai.factcheck.paths.RUNTIME_DIR', legacy):
            self.assertEqual(storage.import_legacy_embedding_cache(), 1200)
            self.assertFalse(old.exists())
            self.assertEqual(storage.import_legacy_embedding_cache(), 0)  # 이미 옮김
        with vault.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM embedding_vectors').fetchone()[0], 1200)
            self.assertEqual(bytes(db.execute("SELECT vector FROM embedding_vectors WHERE key='k7'").fetchone()[0]), bytes([7]) * 8)


if __name__ == '__main__':
    unittest.main()
