"""취재자료(Source) 공개 API: 목록 · 한 건 정보 · 삭제.

자료를 올리는 길은 하나다 — 화면 → /api/materials/extract(글자 추출 + 암호화 저장, storage.save_source).
여기는 이미 저장된 자료를 보고 지우는 쪽이다. 자료는 기사에 `sources`/`linkedSources` 로 붙으므로
"어느 기사가 쓰는가"는 각 기사의 **최신 저장본**에서 읽는다(이전 저장본에 남은 참조는 이력일 뿐이다).

삭제 정책(사용자 결정 2026-10-07): 쓰는 기사가 있으면 먼저 경고(409 SOURCE_IN_USE + 쓰는 기사 목록)를 돌려주고,
사용자가 확인하면 force=true 로 다시 보내 지운다. 지워도 기사 안의 참조는 그대로 남아 화면이 "삭제된 자료"로 보여 줄 수 있다.
"""
import json
import os

from . import storage, vault
from .errors import RequestError


def _check_id(source_id):
    if not isinstance(source_id, str) or not storage.SOURCE_ID.fullmatch(source_id):
        raise RequestError('잘못된 자료 ID입니다.')
    return source_id


def _usage(db):
    """자료 id → 그 자료를 쓰는 기사 [{articleId, title}] (각 기사의 최신 저장본 기준)."""
    used = {}
    rows = db.execute('SELECT r.article_id, r.draft_json FROM article_revisions r WHERE r.revision_no = '
                      '(SELECT max(revision_no) FROM article_revisions WHERE article_id = r.article_id)').fetchall()
    for article_id, body in rows:
        draft = json.loads(body)
        ids = {s.get('id') for s in draft.get('sources') or [] if isinstance(s, dict)}
        ids |= {i for i in draft.get('linkedSources') or [] if isinstance(i, str)}
        for source_id in ids:
            if isinstance(source_id, str):
                used.setdefault(source_id, []).append({'articleId': article_id, 'title': draft.get('title') or ''})
    return used


def _item(row, used):
    source_id, name, created, size, chars = row
    return {'id': source_id, 'name': name, 'format': os.path.splitext(name)[1].lstrip('.').lower(), 'size': size, 'chars': chars,
            'createdAt': created, 'usedBy': used.get(source_id, [])}


_SELECT = 'SELECT id, name, created_at, length(original), length(text) FROM sources'


def list_sources():
    """저장된 취재자료(최신순)와 각각을 쓰는 기사."""
    with vault.connect() as db:
        used = _usage(db)
        rows = db.execute(_SELECT + ' ORDER BY created_at DESC, id').fetchall()
    return {'sources': [_item(row, used) for row in rows]}


def get_source(source_id):
    _check_id(source_id)
    with vault.connect() as db:
        row = db.execute(_SELECT + ' WHERE id = ?', (source_id,)).fetchone()
        used = _usage(db)
    if not row:
        raise RequestError('자료를 찾지 못했습니다.', 404, code='NOT_FOUND')
    return _item(row, used)


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
        db.execute('DELETE FROM sources WHERE id = ?', (source_id,))
    return {'deleted': True, 'id': source_id, 'wasUsedBy': used_by}
