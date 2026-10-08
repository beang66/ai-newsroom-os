"""Persist source chunks and document embeddings in the encrypted vault only."""
import datetime
import hashlib
import importlib.util
import json
import threading

from . import ids, jobs, storage, vault
from .errors import RequestError

CHUNKER_VERSION = 'semantic_chunker_v3+boundary-roberta-base-v3:material-v1'
# ponytail: serialize indexing in this process; per-source locks if throughput requires it.
_LOCK = threading.RLock()
_MATERIAL_FIELDS = {'material_id', 'material_title', 'material_date', 'speaker'}
_LAST_CHUNKER_VERSION = None


def chunker_version():
    from .ai.factcheck.paths import BOUNDARY_DIR
    # Rule-only chunks must be rebuilt after installing the optional boundary model.
    return CHUNKER_VERSION + (':boundary' if (BOUNDARY_DIR / 'model.onnx').is_file() else ':rules')


def text_sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _source(db, source_id):
    return db.execute('SELECT name, text FROM sources WHERE id = ? AND workspace_id = ?',
                      (source_id, vault.WORKSPACE_ID)).fetchone()


def _status(db, source_id):
    return db.execute('SELECT state, chunk_count, text_sha256, chunker_version FROM source_index '
                      'WHERE source_id = ? AND workspace_id = ?', (source_id, vault.WORKSPACE_ID)).fetchone()


def _matches(status, text, version):
    return status and status[0] == 'ready' and status[2:] == (text_sha256(text), version)


def _write_status(db, source_id, text, version, state, count=0, error=None):
    db.execute('INSERT INTO source_index VALUES (?, ?, ?, ?, ?, ?, ?, ?) '
               'ON CONFLICT(source_id) DO UPDATE SET workspace_id = excluded.workspace_id, '
               'state = excluded.state, text_sha256 = excluded.text_sha256, '
               'chunker_version = excluded.chunker_version, chunk_count = excluded.chunk_count, '
               'error_code = excluded.error_code, updated_at = excluded.updated_at',
               (source_id, vault.WORKSPACE_ID, state, text_sha256(text), version, count, error, _now()))


def _runtime_available():
    from .ai.factcheck.paths import embedding_dependencies
    return all(importlib.util.find_spec(name) is not None
               for name in embedding_dependencies())


def _models_available(cache):
    # The judge is unnecessary for ingestion. The boundary model is optional,
    # exactly as in factcheck_status(); the encoder never downloads a model.
    return cache.encoder.available()


def _prepare_chunker(version):
    global _LAST_CHUNKER_VERSION
    if _LAST_CHUNKER_VERSION != version:
        from .ai.factcheck import chunker
        chunker._boundary.cache_clear()
        chunker._narrative_texts.cache_clear()
        _LAST_CHUNKER_VERSION = version


def _persist(source_id, text, version, chunks):
    from .ai.factcheck.retrieval import vector_key
    with storage.SAVE_LOCK, vault.connect() as db:
        source = _source(db, source_id)
        if not source or source[1] != text or version != chunker_version():
            return False  # Deleted/changed while the chunker or encoder was running.
        db.execute('DELETE FROM source_chunks WHERE source_id = ? AND workspace_id = ?',
                   (source_id, vault.WORKSPACE_ID))
        db.executemany('INSERT INTO source_chunks VALUES (?, ?, ?, ?, ?, ?)', [
            (source_id, ordinal, vault.WORKSPACE_ID, chunk['text'],
             json.dumps({k: v for k, v in chunk.items() if k != 'text'}, ensure_ascii=False),
             vector_key(chunk['text'], 'document'))
            for ordinal, chunk in enumerate(chunks)
        ])
        _write_status(db, source_id, text, version, 'ready', len(chunks))
    return True


def _mark(source_id, text, version, state, error=None):
    with storage.SAVE_LOCK, vault.connect() as db:
        source = _source(db, source_id)
        if source and source[1] == text:
            db.execute('DELETE FROM source_chunks WHERE source_id = ? AND workspace_id = ?',
                       (source_id, vault.WORKSPACE_ID))
            _write_status(db, source_id, text, version, state, error=error)


SLICE = 8  # 진행률을 보고하고 취소를 확인하는 단위(조각 수)


def _encode_and_persist(source_id, text, version, chunks, cache, on_progress=None):
    """on_progress(0~1): 조각을 SLICE 개씩 인코딩할 때마다 부른다. 거기서 JobCancelled 를 던지면 멈춘다."""
    if not _models_available(cache):
        _mark(source_id, text, version, 'pending')
        return 'pending'
    texts = [chunk['text'] for chunk in chunks]
    size = getattr(cache.encoder, 'slice_size', None) or SLICE  # 원격 인코더는 병렬 요청 수만큼 크게
    try:
        for start in range(0, len(texts), size):
            cache.encode(texts[start:start + size], 'document')
            if on_progress:
                on_progress(min(1.0, (start + size) / len(texts)))
    except jobs.JobCancelled:
        _mark(source_id, text, version, 'pending')  # 이미 만든 벡터는 캐시에 남아 다음 색인이 이어서 빠르다
        raise
    except RequestError:
        _mark(source_id, text, version, 'pending')  # 서버 연결·로그인 문제는 일시적이다 — 실패로 굳히지 않고 나중에 다시 한다
        return 'pending'
    except Exception:
        _mark(source_id, text, version, 'failed', 'ENCODER_ERROR')
        return 'failed'
    return 'ready' if _persist(source_id, text, version, chunks) else 'pending'


def index_source(source_id, on_progress=None):
    """Index once; missing models are a successful deferred (pending) outcome."""
    from .ai.factcheck.material_chunks import build_material_chunks
    with _LOCK:
        version = chunker_version()
        with vault.connect() as db:
            source = _source(db, source_id)
            if not source:
                return 'pending'
            title, text = source
            if _matches(_status(db, source_id), text, version):
                return 'ready'
        if not _runtime_available():
            _mark(source_id, text, version, 'pending')
            return 'pending'
        from .ai.factcheck.retrieval import get_vector_cache
        cache = get_vector_cache()
        if not _models_available(cache):
            _mark(source_id, text, version, 'pending')
            return 'pending'
        try:
            _prepare_chunker(version)
            chunks = build_material_chunks({'id': source_id, 'title': title, 'content': text})
        except Exception:
            _mark(source_id, text, version, 'failed', 'CHUNKER_ERROR')
            return 'failed'
        if on_progress:
            on_progress(0.0)  # 청킹이 끝났다 — 이제부터 임베딩(대부분의 시간)
        return _encode_and_persist(source_id, text, version, chunks, cache, on_progress)


def material_chunks(material):
    """Reuse stored body chunks, preserving the current material's exact metadata."""
    from .ai.factcheck.material_chunks import build_material_chunks, material_chunks_from_body
    from .ai.factcheck.retrieval import get_vector_cache
    source_id = material.get('id')
    text = material.get('content') or material.get('summary') or ''
    with _LOCK:
        version = chunker_version()
        with vault.connect() as db:
            source = _source(db, source_id)
            if source and source[1] == text and _matches(_status(db, source_id), text, version):
                rows = db.execute('SELECT text, meta_json FROM source_chunks WHERE source_id = ? '
                                  'AND workspace_id = ? ORDER BY ordinal',
                                  (source_id, vault.WORKSPACE_ID)).fetchall()
                body = []
                for chunk_text, meta_json in rows:
                    meta = json.loads(meta_json)
                    if meta.get('field') != 'source_identity':
                        body.append({'text': chunk_text, **{k: v for k, v in meta.items() if k not in _MATERIAL_FIELDS}})
                return material_chunks_from_body(material, body)
        try:
            _prepare_chunker(version)
            chunks = build_material_chunks(material)
        except Exception:
            if source and source[1] == text:
                _mark(source_id, text, version, 'failed', 'CHUNKER_ERROR')
            raise  # Preserve existing fact-check error behaviour.
        if source and source[1] == text:
            _encode_and_persist(source_id, text, version, chunks, get_vector_cache())
        return chunks


def indexing_progress():
    """지금 색인 작업(source_ingest)이 대기·실행 중인 자료 → 진행률(0~1) {32자 hex id: float}."""
    with vault.connect() as db:
        rows = db.execute("SELECT input_resource_id, progress FROM processing_jobs WHERE type = 'source_ingest' "
                          "AND status IN ('queued', 'running') AND workspace_id = ?", (vault.WORKSPACE_ID,)).fetchall()
    return {row[0].replace('-', ''): float(row[1] or 0) for row in rows if row[0]}


def indexing_ids():
    return set(indexing_progress())


def start_indexing(source_id):
    """Queue ingestion without importing/loading the ML runtime on the upload thread."""
    try:
        resource_id = ids.uuid_text(source_id)
    except ids.IdError:
        return {'indexJobId': None, 'indexState': 'pending'}  # Legacy 16-hex source.
    with storage.SAVE_LOCK, vault.connect() as db:
        status = _status(db, source_id)
        source = _source(db, source_id)
        if source and _matches(status, source[1], chunker_version()):
            return {'indexJobId': None, 'indexState': 'ready'}
        if source:
            _write_status(db, source_id, source[1], chunker_version(), 'pending')
    job = jobs.create_job('source_ingest', {'resource_type': 'source', 'resource_id': resource_id})

    def worker(ctx):
        if ctx.cancelled():
            raise jobs.JobCancelled()
        def on_progress(value):
            if ctx.cancelled():
                raise jobs.JobCancelled()
            ctx.progress(value)

        state = index_source(source_id, on_progress)
        if state == 'failed':
            raise RuntimeError('Source indexing failed')
        return {'resource_type': 'source', 'resource_id': resource_id}

    jobs.run_in_background(job['id'], worker)
    return {'indexJobId': job['id'], 'indexState': 'indexing'}
