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

from . import ids, knowledge_files, sources, storage, vault


def _uuid(value):
    try:
        return ids.uuid_text(value)
    except ids.IdError:
        return value  # 옛 16자리 자료 id


MAX_LINKED_INTERVIEWS = 20


def _interviews(draft):
    """원고에 연결된 인터뷰(녹취)의 id·파일명만 추린다. 문자열 id 와 {id, filename} 둘 다 받는다."""
    out = []
    for item in draft.get('linkedInterviews') or []:
        if isinstance(item, str):
            item = {'id': item}
        if not isinstance(item, dict) or not isinstance(item.get('id'), str) or not item['id'].strip():
            continue
        filename = item.get('filename')
        out.append({'id': item['id'].strip()[:80], 'filename': filename.strip()[:200] if isinstance(filename, str) else ''})
        if len(out) >= MAX_LINKED_INTERVIEWS:
            break
    return out


def _articles(db):
    counts = dict(db.execute("SELECT article_id, count(*) FROM article_revisions WHERE kind = 'manual' GROUP BY article_id").fetchall())
    unsaved = {row[0] for row in db.execute("SELECT article_id FROM article_revisions r WHERE kind = 'auto' AND revision_no = "
               '(SELECT max(revision_no) FROM article_revisions WHERE article_id = r.article_id)').fetchall()}
    snapshots = dict(db.execute('SELECT article_id, count(*) FROM article_snapshots GROUP BY article_id').fetchall())
    out = []
    # 보관소에는 마지막 수동 저장본을 보인다(수동 저장 전인 기사는 임시 저장본, unsaved_changes 로 표시)
    for article_id, created, updated, revision_no, body in storage.latest_revisions(db, manual=True):
        draft = json.loads(body)
        count = counts.get(article_id, 0)
        source_ids = storage.draft_source_ids(draft)
        published = storage.published_info(db, article_id)
        state = storage.article_state(db, article_id)  # 상태는 이것 하나(원고 JSON 에는 저장하지 않는다)
        out.append({'id': _uuid(article_id), 'title': draft.get('title') or '', 'subtitle': draft.get('subtitle') or '',
                    'created_at': created, 'updated_at': updated,
                    'excerpt': storage._plain(draft)[:120], 'photo_count': len(draft.get('photos') or []),
                    'interviews': _interviews(draft), 'state': state, 'published': published, 'article_id': article_id,  # article_id: 편집기로 열 때 쓰는 32자 id
                    'revision_no': revision_no, 'revision_count': count, 'unsaved_changes': article_id in unsaved,
                    'snapshot_count': snapshots.get(article_id, 0),  # 고정본 = 검증·변환에 넘긴 판
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
        transcript_rows = db.execute('SELECT id, filename, duration, created_at FROM transcripts ORDER BY created_at DESC').fetchall()
        files, unresolved, file_links = knowledge_files.map_items(db)
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
    file_edges = sorted({(link['source'], link['target']) for link in file_links if link['resolved']})
    edges += [{'source': source, 'target': target, 'relation': 'links_to'} for source, target in file_edges]
    # 기사에 연결한 녹취(원고의 linkedInterviews) — 저장소에 실제로 있는 녹취만 잇는다
    linked = {}
    for article in articles:
        for item in article['interviews']:
            linked.setdefault(item['id'], []).append(article['id'])
    interviews = [{'id': tid, 'filename': name, 'duration': duration, 'created_at': created, 'used_by': linked[tid]}
                  for tid, name, duration, created in transcript_rows if tid in linked]
    edges += [{'source': a, 'target': i['id'], 'relation': 'uses_interview'} for i in interviews for a in i['used_by']]
    source_list = [{'id': _uuid(item['id']), 'name': item['name'], 'format': item['format'], 'size': item['size'],
                    'chars': item['chars'], 'created_at': item['createdAt'], 'role': 'data',
                    'used_by': [_uuid(u['articleId']) for u in item['usedBy']]} for item in source_items]
    # 자료 하나의 목록: 업로드한 파일(kind=file, 역할 원자료)과 가져온 Markdown 노트(kind=note, 역할은 코어가 저장한 값)
    resources = sorted([{'id': s['id'], 'kind': 'file', 'role': 'data', 'name': s['name'], 'format': s['format'],
                         'updated_at': s['created_at'], 'used_by': s['used_by']} for s in source_list]
                       + [{'id': f['id'], 'kind': 'note', 'role': f['role'], 'name': f['title'] or f['path'], 'format': 'md',
                           'updated_at': f['updated_at'], 'path': f['path']} for f in files],
                       key=lambda r: r['updated_at'] or '', reverse=True)
    return {'workspace_id': vault.WORKSPACE_ID, 'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'articles': articles, 'sources': source_list, 'interviews': interviews, 'resources': resources,
            'snapshots': snapshots, 'entities': [], 'edges': edges,
            'files': files, 'unresolved': unresolved, 'file_links': file_links}
