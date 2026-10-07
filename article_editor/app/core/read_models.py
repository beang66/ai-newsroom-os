"""읽기 모델: 코어가 가진 기사·자료·고정본과 그 연결을 읽기 전용으로 묶어 돌려준다(Data Map·보관함 목록용).

- 코어가 조립한다. 화면(Data Map)은 받은 목록을 자기 모양으로 바꾸기만 한다(형식 변환은 화면 쪽).
- 연결(edges)은 **실제 근거가 있는 것만** 담는다: 기사 → 자료(최신 저장본이 쓰는 자료), 기사 → 고정본(만들어 둔 고정본).
  비슷해 보이는 관계·유사도 점수는 만들지 않는다. 임베딩 벡터도 싣지 않는다(크고, 화면이 쓰지 않는다).
- id 는 계약 표기(하이픈 UUID)로 내보낸다. 16자리 옛 자료 id 는 UUID 가 아니라 그대로 둔다.
- `entities` 는 계약(KnowledgeMap)의 자리표시다 — 인물·기관 추출이 아직 없어서 빈 목록이다.
ponytail: 전부 한 번에 읽는다(기사·자료 수백 건 규모까지). 더 커지면 쪽 나누기(페이지)를 붙인다.
"""
import datetime
import json

from . import ids, sources, storage, vault


def _uuid(value):
    try:
        return ids.uuid_text(value)
    except ids.IdError:
        return value  # 옛 16자리 자료 id


def _articles(db):
    counts = dict(db.execute('SELECT article_id, count(*) FROM article_revisions GROUP BY article_id').fetchall())
    out = []
    for article_id, created, updated, revision_no, body in storage.latest_revisions(db):
        draft = json.loads(body)
        count = counts.get(article_id, 0)
        source_ids = storage.draft_source_ids(draft)
        out.append({'id': _uuid(article_id), 'title': draft.get('title') or '', 'subtitle': draft.get('subtitle') or '',
                    'status': draft.get('status') or '', 'created_at': created, 'updated_at': updated,
                    'revision_no': revision_no, 'revision_count': count,
                    'source_ids': sorted(_uuid(i) for i in source_ids)})
    return out


def list_articles():
    """기사 목록(최신 수정순) — 제목·상태·저장 횟수·쓰는 자료 id."""
    with vault.connect() as db:
        return {'articles': _articles(db)}


def knowledge_map():
    with vault.connect() as db:
        articles = _articles(db)
        used = sources._usage(db)
        source_rows = db.execute(sources._SELECT + ' ORDER BY created_at DESC, id').fetchall()
        snapshot_rows = db.execute('SELECT id, article_id, revision_id, revision_no, content_hash, created_at '
                                   'FROM article_snapshots ORDER BY created_at DESC, id').fetchall()
    known = {a['id'] for a in articles}
    source_items = [sources._item(row, used) for row in source_rows]
    snapshots = [{'id': row[0], 'article_id': _uuid(row[1]), 'revision_id': row[2], 'revision_no': row[3],
                  'content_hash': row[4], 'created_at': row[5]} for row in snapshot_rows]
    edges = []
    for article in articles:
        edges += [{'source': article['id'], 'target': source_id, 'relation': 'uses_source'} for source_id in article['source_ids']]
    edges += [{'source': s['article_id'], 'target': s['id'], 'relation': 'has_snapshot'} for s in snapshots if s['article_id'] in known]
    present = {_uuid(item['id']) for item in source_items}
    edges = [e for e in edges if e['relation'] != 'uses_source' or e['target'] in present]  # 지운 자료를 가리키는 선은 뺀다
    return {'workspace_id': vault.WORKSPACE_ID, 'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'articles': articles,
            'sources': [{'id': _uuid(item['id']), 'name': item['name'], 'format': item['format'], 'size': item['size'],
                         'chars': item['chars'], 'created_at': item['createdAt'],
                         'used_by': [_uuid(u['articleId']) for u in item['usedBy']]} for item in source_items],
            'snapshots': snapshots, 'entities': [], 'edges': edges}
