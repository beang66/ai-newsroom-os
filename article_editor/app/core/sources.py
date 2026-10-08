"""취재자료(Source) 공개 API: 목록 · 한 건 정보 · 삭제.

자료를 올리는 길은 하나다 — 화면 → /api/materials/extract(글자 추출 + 암호화 저장, storage.save_source).
여기는 이미 저장된 자료를 보고 지우는 쪽이다. 자료는 기사에 `sources`/`linkedSources` 로 붙으므로
"어느 기사가 쓰는가"는 각 기사의 **최신 저장본**에서 읽는다(이전 저장본에 남은 참조는 이력일 뿐이다).

삭제 정책(사용자 결정 2026-10-07): 쓰는 기사가 있으면 먼저 경고(409 SOURCE_IN_USE + 쓰는 기사 목록)를 돌려주고,
사용자가 확인하면 force=true 로 다시 보내 지운다. 지워도 기사 안의 참조는 그대로 남아 화면이 "삭제된 자료"로 보여 줄 수 있다.
지울 때는 원본·글자·조각·색인과 그 조각의 임베딩 벡터(다른 자료가 같이 쓰지 않는 것)까지 함께 지운다.
"""
import json
import os

from . import storage, vault
from .source_index import indexing_progress
from .errors import RequestError


def _check_id(source_id):
    if not isinstance(source_id, str) or not storage.SOURCE_ID.fullmatch(source_id):
        raise RequestError('잘못된 자료 ID입니다.')
    return source_id


def _usage(db):
    """자료 id → 그 자료를 쓰는 기사 [{articleId, title}] (각 기사의 최신 저장본 기준)."""
    used = {}
    for article_id, _created, _updated, _revision, body in storage.latest_revisions(db):
        draft = json.loads(body)
        for source_id in storage.draft_source_ids(draft):
            used.setdefault(source_id, []).append({'articleId': article_id, 'title': draft.get('title') or ''})
    return used


def _item(row, used, active=None):
    source_id, name, created, size, chars, state, chunks = row
    active = active or {}
    if source_id in active:
        state = 'indexing'  # 색인 작업이 도는 중 — 끝나기 전에는 팩트체크를 보내지 않는다
    return {'id': source_id, 'name': name, 'format': os.path.splitext(name)[1].lstrip('.').lower(), 'size': size, 'chars': chars,
            'createdAt': created, 'usedBy': used.get(source_id, []),
            'index': {'state': state or 'pending', 'chunks': chunks or 0,
                      **({'progress': round(active[source_id], 3)} if source_id in active else {})}}


_SELECT = ('SELECT s.id, s.name, s.created_at, length(s.original), length(s.text), i.state, i.chunk_count '
           'FROM sources s LEFT JOIN source_index i ON i.source_id = s.id AND i.workspace_id = s.workspace_id')


def list_sources():
    """저장된 취재자료(최신순)와 각각을 쓰는 기사."""
    with vault.connect() as db:
        used = _usage(db)
        rows = db.execute(_SELECT + ' WHERE s.workspace_id = ? ORDER BY s.created_at DESC, s.id',
                          (vault.WORKSPACE_ID,)).fetchall()
    active = indexing_progress()
    return {'sources': [_item(row, used, active) for row in rows]}


def get_source(source_id):
    _check_id(source_id)
    with vault.connect() as db:
        row = db.execute(_SELECT + ' WHERE s.id = ? AND s.workspace_id = ?', (source_id, vault.WORKSPACE_ID)).fetchone()
        used = _usage(db)
    if not row:
        raise RequestError('자료를 찾지 못했습니다.', 404, code='NOT_FOUND')
    return _item(row, used, indexing_progress())


def delete_source(source_id, force=False):
    """쓰는 기사가 있고 force 가 아니면 409(SOURCE_IN_USE, details.usedBy). 아니면 지운다. → {deleted, id, wasUsedBy}"""
    _check_id(source_id)
    if not isinstance(force, bool):
        raise RequestError('force 는 true/false 여야 합니다.')
    with storage.SAVE_LOCK, vault.connect() as db:
        if not db.execute('SELECT 1 FROM sources WHERE id = ?', (source_id,)).fetchone():
            raise RequestError('자료를 찾지 못했습니다.', 404, code='NOT_FOUND')
        used_by = _usage(db).get(source_id, [])
        if used_by and not force:
            raise RequestError('이 자료를 쓰는 기사가 있어요. 그래도 지울까요?', 409, code='SOURCE_IN_USE', details={'usedBy': used_by})
        # 이 자료의 조각에서 만든 임베딩 벡터도 지운다 — 다른 자료의 조각이 같은 벡터(같은 글자)를 쓰면 남긴다.
        db.execute('DELETE FROM embedding_vectors WHERE key IN '
                   '(SELECT vector_key FROM source_chunks WHERE source_id = ? AND workspace_id = ?) '
                   'AND key NOT IN (SELECT vector_key FROM source_chunks WHERE source_id != ? AND vector_key IS NOT NULL)',
                   (source_id, vault.WORKSPACE_ID, source_id))
        db.execute('DELETE FROM source_chunks WHERE source_id = ? AND workspace_id = ?', (source_id, vault.WORKSPACE_ID))
        db.execute('DELETE FROM source_index WHERE source_id = ? AND workspace_id = ?', (source_id, vault.WORKSPACE_ID))
        db.execute('DELETE FROM sources WHERE id = ?', (source_id,))
    return {'deleted': True, 'id': source_id, 'wasUsedBy': used_by}
