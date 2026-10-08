"""Encrypted source ingestion, lifecycle, and fact-check reuse/parity."""
import env_isolation  # noqa: F401 — first: never load developer credentials
import base64
import hashlib
import json
import threading
import time
import unittest
from unittest import mock

from vault_fixture import use_temp_vault
from core import documents, ids, jobs, source_index, sources, storage, vault
from core.ai.factcheck import chunker, material_chunks, retrieval, service
from core.errors import RequestError
from core.managers.ai_manager import AIManager
import numpy as np


class FakeEncoder:
    def __init__(self):
        self.installed = True
        self.calls = []

    def available(self):
        return self.installed

    def encode(self, texts, role):
        self.calls.append((list(texts), role))
        vectors = []
        for text in texts:
            seed = int.from_bytes(hashlib.sha256((role + text).encode()).digest()[:4], 'little')
            vector = np.random.RandomState(seed).randn(1024).astype('<f4')
            vectors.append(vector / np.linalg.norm(vector))
        return np.stack(vectors) if vectors else np.empty((0, 1024), dtype='<f4')


def fake_chunker(text, meta):
    return [chunker.EvidenceUnit(x.strip(), 'narrative', 'body') for x in text.split('|') if x.strip()]


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


class SourceIndexTests(unittest.TestCase):
    def setUp(self):
        self.root = use_temp_vault(self)
        self.encoder = FakeEncoder()
        self.cache = retrieval.VectorCache(self.encoder)
        self.chunk = mock.Mock(side_effect=fake_chunker)
        for patcher in (mock.patch.object(retrieval, 'get_vector_cache', return_value=self.cache),
                        mock.patch.object(material_chunks, 'chunk_document', self.chunk),
                        mock.patch.object(source_index, '_runtime_available', return_value=True),
                        mock.patch.object(service, 'record_factcheck_event')):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.sid, _ = storage.save_source('report.txt', b'report', 'Budget is 20 billion.|Attendance is 50 people.')
        self.material = {'id': self.sid, 'title': 'report.txt',
                         'content': 'Budget is 20 billion.|Attendance is 50 people.'}

    def status(self):
        with vault.connect() as db:
            return db.execute('SELECT state, chunk_count, text_sha256, chunker_version, error_code, updated_at '
                              'FROM source_index WHERE source_id = ?', (self.sid,)).fetchone()

    def stored_chunks(self):
        with vault.connect() as db:
            return [{'text': text, **json.loads(meta)} for text, meta in
                    db.execute('SELECT text, meta_json FROM source_chunks WHERE source_id = ? ORDER BY ordinal',
                               (self.sid,)).fetchall()]

    def test_pending_without_models_or_runtime_then_ready(self):
        self.encoder.installed = False
        self.assertEqual(source_index.index_source(self.sid), 'pending')
        self.assertEqual(self.status()[:2], ('pending', 0))
        self.chunk.assert_not_called()
        self.assertEqual(self.encoder.calls, [])
        self.encoder.installed = True
        with mock.patch.object(source_index, '_runtime_available', return_value=False):
            self.assertEqual(source_index.index_source(self.sid), 'pending')
        self.assertEqual(source_index.index_source(self.sid), 'ready')
        self.assertEqual(self.status()[:2], ('ready', 3))

    def test_ready_vectors_and_idempotent_same_file_upload(self):
        self.assertEqual(source_index.index_source(self.sid), 'ready')
        status = self.status()
        self.assertEqual(status[2], source_index.text_sha256(self.material['content']))
        with vault.connect() as db:
            rows = db.execute('SELECT c.workspace_id, c.vector_key, length(v.vector) FROM source_chunks c '
                              'JOIN embedding_vectors v ON v.key = c.vector_key WHERE c.source_id = ?',
                              (self.sid,)).fetchall()
        self.assertEqual(len(rows), 3)
        self.assertTrue(all(workspace == vault.WORKSPACE_ID and size == 4096 for workspace, key, size in rows))
        storage.save_source('renamed.txt', b'report', self.material['content'])
        self.assertEqual(source_index.index_source(self.sid), 'ready')
        self.assertEqual(self.status(), status)
        self.assertEqual(self.chunk.call_count, 1)
        self.assertEqual(len(self.encoder.calls), 1)
        self.assertEqual(source_index.start_indexing(self.sid), {'indexJobId': None, 'indexState': 'ready'})
        self.assertEqual(sources.get_source(self.sid)['index'], {'state': 'ready', 'chunks': 3})
        self.assertEqual(sources.list_sources()['sources'][0]['index'], {'state': 'ready', 'chunks': 3})
        # SQLCipher, including source chunks: no plaintext SQLite file header or text.
        data = (self.root / 'vault.db').read_bytes()
        self.assertFalse(data.startswith(b'SQLite format 3'))
        self.assertNotIn(self.material['content'].encode(), data)

    def test_stale_text_and_chunker_version_rebuild(self):
        source_index.index_source(self.sid)
        self.assertEqual(storage.save_source('report.txt', b'report', 'Changed body.')[0], self.sid)
        self.assertEqual(self.status()[:2], ('pending', 0))
        self.assertEqual(self.stored_chunks(), [])
        self.assertEqual(source_index.index_source(self.sid), 'ready')
        self.assertEqual(self.chunk.call_count, 2)
        self.assertEqual(self.stored_chunks()[1]['text'], 'Changed body.')
        with mock.patch.object(source_index, 'CHUNKER_VERSION', 'future-chunker'):
            self.assertEqual(source_index.index_source(self.sid), 'ready')
            self.assertTrue(self.status()[3].startswith('future-chunker:'))
        self.assertEqual(self.chunk.call_count, 3)

    def test_delete_removes_index_and_own_vectors_but_preserves_shared_ones(self):
        source_index.index_source(self.sid)
        other, _ = storage.save_source('other.txt', b'other', self.material['content'])
        source_index.index_source(other)
        keys = lambda sid: {row[0] for row in db.execute('SELECT vector_key FROM source_chunks WHERE source_id = ?', (sid,))}
        with vault.connect() as db:
            mine, theirs = keys(self.sid), keys(other)
        self.assertTrue(mine & theirs)  # 같은 본문이라 대부분의 벡터를 함께 쓴다
        sources.delete_source(self.sid)
        self.assertIsNone(self.status())
        self.assertEqual(self.stored_chunks(), [])
        with vault.connect() as db:
            left = {row[0] for row in db.execute('SELECT key FROM embedding_vectors')}
        self.assertTrue(theirs <= left)  # 다른 자료가 쓰는 벡터는 남는다
        self.assertFalse((mine - theirs) & left)  # 지운 자료만 쓰던 벡터는 사라진다
        self.assertEqual(source_index.index_source(other), 'ready')

    def test_upload_returns_job_without_waiting_and_job_finishes(self):
        entered, release = threading.Event(), threading.Event()
        threads = []
        real_run = jobs.run_in_background
        real_encode = self.encoder.encode

        def encode_blocked(texts, role):
            entered.set()
            if not release.wait(5):
                raise RuntimeError('Test worker timeout')
            return real_encode(texts, role)

        def run(job_id, worker):
            thread = real_run(job_id, worker)
            threads.append(thread)
            return thread

        with mock.patch.object(self.encoder, 'encode', side_effect=encode_blocked), \
                mock.patch.object(jobs, 'run_in_background', side_effect=run):
            try:
                result = documents.extract_text({'filename': 'new.txt', 'data': base64.b64encode(b'New source.').decode()})
                self.assertTrue(entered.wait(5))
                self.assertEqual(result['indexState'], 'indexing')
                self.assertTrue(result['indexJobId'])
                job = jobs.get_job(result['indexJobId'])
                self.assertEqual(job['input_ref'], {'resource_type': 'source', 'resource_id': ids.uuid_text(result['sourceId'])})
                self.assertEqual(job['type'], 'source_ingest')
                self.assertEqual(job['status'], 'running')
                # 색인 중에는 목록이 indexing 으로 보이고, 팩트체크는 409 로 막힌다(요청 안에서 다시 색인하지 않게)
                running = sources.get_source(result['sourceId'])['index']
                self.assertEqual((running['state'], running['progress']), ('indexing', 0.0))
                with self.assertRaises(RequestError) as blocked:
                    AIManager().factcheck_run({'nodes': [{'id': 's1', 'type': 'TEXT', 'text': 'x'}],
                                               'materials': [{'id': result['sourceId'], 'title': 'new.txt', 'content': 'New source.'}]})
                self.assertEqual((blocked.exception.status, blocked.exception.code), (409, 'SOURCE_INDEXING'))
            finally:
                release.set()
                for thread in threads:
                    thread.join(10)
                    self.assertFalse(thread.is_alive())
        self.assertEqual(jobs.get_job(result['indexJobId'])['status'], 'succeeded')
        self.assertEqual(sources.get_source(result['sourceId'])['index'], {'state': 'ready', 'chunks': 2})

    def test_missing_model_job_succeeds_with_pending_index(self):
        self.encoder.installed = False
        threads = []
        real_run = jobs.run_in_background

        def run(job_id, worker):
            thread = real_run(job_id, worker)
            threads.append(thread)
            return thread

        with mock.patch.object(jobs, 'run_in_background', side_effect=run):
            result = documents.extract_text({'filename': 'pending.txt', 'data': 'UGVuZGluZy4='})
            for thread in threads:
                thread.join(10)
                self.assertFalse(thread.is_alive())
        self.assertEqual(jobs.get_job(result['indexJobId'])['status'], 'succeeded')
        self.assertEqual(sources.get_source(result['sourceId'])['index'], {'state': 'pending', 'chunks': 0})

    def test_legacy_upload_skips_job(self):
        with mock.patch.object(storage, 'save_source', return_value=('a' * 16, 'vault/legacy')), \
                mock.patch.object(jobs, 'create_job') as create:
            result = documents.extract_text({'filename': 'legacy.txt', 'data': 'eA=='})
        create.assert_not_called()
        self.assertEqual((result['indexJobId'], result['indexState']), (None, 'pending'))

    def test_lazy_reuse_and_chunks_equal_fresh_output_with_changed_metadata(self):
        self.encoder.installed = False
        source_index.index_source(self.sid)
        self.encoder.installed = True
        first = service._material_chunks(self.material)
        self.assertEqual(self.status()[0], 'ready')
        self.assertEqual(encoded(self.stored_chunks()), encoded(first))
        with mock.patch.object(material_chunks, 'chunk_document', side_effect=AssertionError('must reuse')):
            second = service._material_chunks(self.material)
        self.assertEqual(encoded(first), encoded(second))
        self.assertEqual(self.chunk.call_count, 1)
        for fields in ({'title': 'New title', 'date': '2026-10-07', 'speaker': 'New speaker'},
                       {'title': '', 'outletOrSpeaker': ' Outlet  speaker ', 'date': ' 2026-10-07 '},
                       {'title': '', 'speaker': '', 'date': None}):
            changed = {**self.material, **fields}
            expected = material_chunks.build_material_chunks(changed)
            with mock.patch.object(material_chunks, 'chunk_document', side_effect=AssertionError('must reuse')):
                reused = service._material_chunks(changed)
            self.assertEqual(encoded(expected), encoded(reused))
        for mode in ('exact', 'densefly-bm25-rrf'):
            with mock.patch.dict('os.environ', {'FACTCHECK_RETRIEVAL': mode}):
                self.assertEqual(encoded(retrieval.rank_chunks('Budget', first)),
                                 encoded(retrieval.rank_chunks('Budget', second)))

    def test_virtual_or_mismatching_material_is_not_persisted(self):
        for changed in ({**self.material, 'id': 'virtual'}, {**self.material, 'content': 'Unsaved edit.'}):
            self.assertEqual(service._material_chunks(changed), material_chunks.build_material_chunks(changed))
        self.assertIsNone(self.status())

    def test_original_chunk_format_and_summary_fallback(self):
        material = {'id': 'virtual', 'title': ' Title  name ', 'date': ' 2026-10-07 ',
                    'outletOrSpeaker': ' Speaker  name ', 'summary': ' Body text. '}
        expected = [
            {'text': '자료명: Title name. 출처/화자: Speaker name. 날짜: 2026-10-07.',
             'kind': 'metadata', 'field': 'source_identity', 'material_id': 'virtual',
             'material_title': 'Title name', 'material_date': '2026-10-07', 'speaker': 'Speaker name'},
            {'text': 'Body text.', 'kind': 'narrative', 'field': 'body', 'material_id': 'virtual',
             'material_title': ' Title  name ', 'material_date': ' 2026-10-07 ', 'speaker': ' Speaker  name '},
        ]
        self.assertEqual(encoded(service._material_chunks(material)), encoded(expected))
        self.assertEqual(service._material_chunks({'id': 'virtual', 'content': '  '}), [])
        empty_title = {'id': 'virtual', 'content': 'Body text.'}
        self.assertEqual(service._material_chunks(empty_title)[0]['material_title'], '취재 자료')

    def test_failures_store_only_short_codes_and_can_retry(self):
        self.chunk.side_effect = RuntimeError('SECRET source text')
        self.assertEqual(source_index.index_source(self.sid), 'failed')
        self.assertEqual(self.status()[4], 'CHUNKER_ERROR')
        self.chunk.side_effect = fake_chunker
        with mock.patch.object(self.encoder, 'encode', side_effect=RuntimeError('SECRET source text')):
            self.assertEqual(source_index.index_source(self.sid), 'failed')
        self.assertEqual(self.status()[4], 'ENCODER_ERROR')
        self.assertEqual(self.stored_chunks(), [])
        self.assertEqual(source_index.index_source(self.sid), 'ready')

    def test_progress_is_reported_per_slice_and_cancel_stops_without_failing(self):
        seen = []
        with mock.patch.object(source_index, 'SLICE', 1):
            self.assertEqual(source_index.index_source(self.sid, seen.append), 'ready')
        self.assertEqual(seen[0], 0.0)
        self.assertEqual(seen[-1], 1.0)
        self.assertEqual(seen, sorted(seen))
        self.assertEqual(source_index.indexing_ids(), set())
        sid2, _ = storage.save_source('b.txt', b'Another|source', 'Another|source')

        def stop(value):
            if value > 0:  # 청킹이 끝난 뒤 임베딩 구간에서 취소
                raise jobs.JobCancelled()
        with mock.patch.object(source_index, 'SLICE', 1):
            with self.assertRaises(jobs.JobCancelled):
                source_index.index_source(sid2, stop)
        with vault.connect() as db:
            self.assertEqual(db.execute('SELECT state FROM source_index WHERE source_id = ?', (sid2,)).fetchone()[0], 'pending')

    def test_backend_unavailable_keeps_index_pending_not_failed(self):
        self.chunk.side_effect = fake_chunker
        with mock.patch.object(self.encoder, 'encode', side_effect=RequestError('서버 연결 실패', 504)):
            self.assertEqual(source_index.index_source(self.sid), 'pending')
        self.assertEqual((self.status()[0], self.status()[4]), ('pending', None))  # 실패 코드를 남기지 않는다
        self.assertEqual(source_index.index_source(self.sid), 'ready')  # 서버가 돌아오면 다시 색인된다

    def test_deleted_or_changed_during_encoding_does_not_publish_stale_rows(self):
        real_encode = self.encoder.encode

        def changed(texts, role):
            storage.save_source('report.txt', b'report', 'New body during encoding.')
            return real_encode(texts, role)

        with mock.patch.object(self.encoder, 'encode', side_effect=changed):
            self.assertEqual(source_index.index_source(self.sid), 'pending')
        self.assertEqual(self.stored_chunks(), [])
        source_index.index_source(self.sid)
        sources.delete_source(self.sid)
        # Simulate the final publication of a deleted source's completed work.
        self.assertFalse(source_index._persist(self.sid, self.material['content'], source_index.chunker_version(), []))
        self.assertIsNone(self.status())

    def test_concurrent_index_calls_chunk_and_encode_once(self):
        barrier = threading.Barrier(2)
        results = []

        def run():
            barrier.wait(5)
            results.append(source_index.index_source(self.sid))

        threads = [threading.Thread(target=run) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(10)
            self.assertFalse(thread.is_alive())
        self.assertEqual(results, ['ready', 'ready'])
        self.assertEqual(self.chunk.call_count, 1)
        self.assertEqual(len(self.encoder.calls), 1)

    def test_chunk_and_ready_publication_roll_back_together(self):
        source_index.index_source(self.sid)
        before, status = self.stored_chunks(), self.status()
        with mock.patch.object(source_index, '_write_status', side_effect=RuntimeError('Publication failed')):
            with self.assertRaises(RuntimeError):
                source_index._persist(self.sid, self.material['content'], source_index.chunker_version(),
                                      [{'text': 'Partial replacement.', 'kind': 'narrative', 'field': None}])
        self.assertEqual(self.stored_chunks(), before)
        self.assertEqual(self.status(), status)

    def test_review_workspace_reuses_chunks_with_byte_identical_results(self):
        # Exercise retrieval and judgement without any installed models.
        from types import SimpleNamespace
        judge = SimpleNamespace(judge=lambda *args: SimpleNamespace(
            status='SUPPORTED', reason='Supported.', confidence=0.95, provider='fake', metadata={}))
        nodes = [{'id': 'n', 'type': 'FACT', 'text': 'Budget totals twenty billion.', 'linkedSourceIds': [self.sid]}]
        with mock.patch.object(service, '_get_provider', return_value=judge):
            first = service.review_workspace(nodes, [self.material])
            with mock.patch.object(material_chunks, 'chunk_document', side_effect=AssertionError('must reuse')):
                second = service.review_workspace(nodes, [self.material])
        self.assertEqual(encoded(first), encoded(second))


class RealSourceIndexTest(unittest.TestCase):
    def setUp(self):
        use_temp_vault(self)
        # 설치된 실제 로컬 모델로 검증한다(기본 임베딩은 원격이라 로그인 없는 테스트에선 쓸 수 없다)
        patcher = mock.patch.dict('os.environ', {'FACTCHECK_EMBEDDING_RUNTIME': 'onnx'})
        patcher.start()
        self.addCleanup(patcher.stop)
        retrieval._cache = None  # 다른 인코더로 만든 캐시를 쓰지 않게
        self.addCleanup(setattr, retrieval, '_cache', None)

    def test_real_vectors_factcheck_parity_and_five_page_timing(self):
        if not AIManager().factcheck_status()['ready']:
            self.skipTest('팩트체크 모델/런타임 미설치')
        source, _ = storage.save_source('budget.txt', b'real-index-test',
                                       '부여군은 올해 청소년 교육 사업에 20억원을 투입한다. 참여 인원은 50명이다.')
        with mock.patch.object(service, 'record_factcheck_event'):
            self.assertEqual(source_index.index_source(source), 'ready')
            with vault.connect() as db:
                rows = db.execute('SELECT c.vector_key, length(v.vector) FROM source_chunks c '
                                  'LEFT JOIN embedding_vectors v ON v.key = c.vector_key WHERE c.source_id = ?',
                                  (source,)).fetchall()
            self.assertTrue(rows and all(key and size == 4096 for key, size in rows))
            material = {'id': source, 'title': 'budget.txt',
                        'content': '부여군은 올해 청소년 교육 사업에 20억원을 투입한다. 참여 인원은 50명이다.'}
            fresh = material_chunks.build_material_chunks(material)
            self.assertEqual(encoded(fresh), encoded(service._material_chunks(material)))
            nodes = [{'id': 'real', 'type': 'FACT', 'text': '부여군은 청소년 교육에 20억원을 지원한다.',
                      'linkedSourceIds': [source]}]
            stored = service.review_workspace(nodes, [material])
            with mock.patch.object(service, '_material_chunks', side_effect=material_chunks.build_material_chunks):
                uncached = service.review_workspace(nodes, [material])
            self.assertEqual(encoded(stored), encoded(uncached))

            # Synthetic ~5-page document; only encrypted test vault writes, models read-only.
            text = '\n\n'.join(
                f'{i + 1}차 교육 사업은 {20 + i}억원의 예산으로 진행한다. '
                f'참여 학생은 {50 + i}명이며 활동 기간은 {i % 12 + 1}개월이다. '
                '군은 교육 자료를 제공하고 학교는 참여 신청을 받는다. '
                '다만 기상 악화 시 현장 활동을 온라인으로 전환한다.'
                for i in range(60))
            large, _ = storage.save_source('five-pages.txt', b'five-page-index-test', text)
            started = time.perf_counter()
            self.assertEqual(source_index.index_source(large), 'ready')
            elapsed = time.perf_counter() - started
            print(f'\nSOURCE_INDEX_REAL_TIMING chars={len(text)} chunks={sources.get_source(large)["index"]["chunks"]} '
                  f'seconds={elapsed:.3f}', flush=True)


if __name__ == '__main__':
    unittest.main()
