"""SQLite adapter. A review and its source dependencies commit atomically."""
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(os.environ.get('NEWSROOM_DB', Path(__file__).resolve().parents[1] / 'data' / 'newsroom-v2.sqlite3'))


@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA secure_delete=ON')
    try:
        yield db
        db.commit()
    finally:
        db.close()


def init():
    with connect() as db:
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'documents' in tables and 'metadata' not in tables:
            raise ValueError('v0.1 DB는 자동 변환하지 않습니다. NEWSROOM_DB를 새 경로로 설정하고 원본을 재업로드하세요.')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
        INSERT OR IGNORE INTO metadata VALUES ('schema_version',2),('corpus_revision',0);
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, path TEXT NOT NULL,
          mime TEXT NOT NULL, raw BLOB NOT NULL, created_at TEXT NOT NULL,
          parse_info TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS blocks (
          id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          ordinal INTEGER NOT NULL, text TEXT NOT NULL, locator TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS entities (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS mentions (
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
          block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
          PRIMARY KEY(document_id,entity_id,block_id)
        );
        CREATE TABLE IF NOT EXISTS reviews (
          id TEXT PRIMARY KEY, article TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS review_documents (
          review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          PRIMARY KEY(review_id,document_id)
        );
        ''')
        if db.execute("SELECT value FROM metadata WHERE key='schema_version'").fetchone()[0] != 2:
            raise ValueError('Unsupported database schema')


def corpus_revision():
    with connect() as db:
        return db.execute("SELECT value FROM metadata WHERE key='corpus_revision'").fetchone()[0]


def list_documents():
    with connect() as db:
        return [dict(r) for r in db.execute('SELECT id,title,path,mime,created_at,length(raw) AS size FROM documents ORDER BY created_at DESC')]


def get_document(doc_id):
    with connect() as db:
        row = db.execute('SELECT id,title,path,mime,created_at,parse_info FROM documents WHERE id=?', (doc_id,)).fetchone()
        if row is None:
            return None
        result = dict(row)
        result['parse_info'] = json.loads(result['parse_info'])
        result['blocks'] = [dict(r) for r in db.execute('SELECT id,ordinal,text,locator FROM blocks WHERE document_id=? ORDER BY ordinal', (doc_id,))]
        for block in result['blocks']:
            block['locator'] = json.loads(block['locator'])
        return result


def get_original(doc_id):
    with connect() as db:
        row = db.execute('SELECT title,mime,raw FROM documents WHERE id=?', (doc_id,)).fetchone()
        return dict(row) if row else None


def source_blocks():
    with connect() as db:
        rows = db.execute('SELECT b.id AS block_id,b.document_id,b.text,b.locator,d.title FROM blocks b JOIN documents d ON d.id=b.document_id ORDER BY d.id,b.ordinal').fetchall()
    return [{**dict(r), 'locator': json.loads(r['locator'])} for r in rows]


def save_review(article, result, corpus_revision):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        current = db.execute("SELECT value FROM metadata WHERE key='corpus_revision'").fetchone()[0]
        if current != corpus_revision:
            raise ValueError('검토 도중 자료가 변경됐습니다. 다시 검토해 주세요.')
        # Reject fabricated or stale provenance from any injected retriever.
        source_sets = [claim['candidates'] for claim in result['claims']] + [f['evidence'] for f in result.get('findings',[])]
        for source_set in source_sets:
            for candidate in source_set:
                block = db.execute('SELECT document_id,text,locator FROM blocks WHERE id=?', (candidate['block_id'],)).fetchone()
                if (block is None or block['document_id'] != candidate['document_id']
                    or candidate['document_version'] != candidate['document_id']
                    or json.loads(block['locator']) != candidate['locator']
                    or not 0 <= candidate['start'] < candidate['end'] <= len(block['text'])
                    or block['text'][candidate['start']:candidate['end']] != candidate['excerpt']):
                    raise ValueError('검색 어댑터가 반환한 원문 위치가 저장 자료와 일치하지 않습니다.')
        db.execute('INSERT INTO reviews VALUES(?,?,?,?)', (result['id'], article, json.dumps(result,ensure_ascii=False), datetime.now(timezone.utc).isoformat()))
        dependencies = {c['document_id'] for claim in result['claims'] for c in claim['candidates']} | set(result.get('source_document_ids',[]))
        for doc_id in dependencies:
            db.execute('INSERT INTO review_documents VALUES(?,?)', (result['id'],doc_id))


def get_review(review_id):
    with connect() as db:
        row = db.execute('SELECT result FROM reviews WHERE id=?',(review_id,)).fetchone()
        return json.loads(row['result']) if row else None


def delete_document(doc_id):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        count = db.execute('SELECT count(*) FROM review_documents WHERE document_id=?',(doc_id,)).fetchone()[0]
        db.execute('DELETE FROM reviews WHERE id IN (SELECT review_id FROM review_documents WHERE document_id=?)',(doc_id,))
        deleted = db.execute('DELETE FROM documents WHERE id=?',(doc_id,)).rowcount
        db.execute('DELETE FROM entities WHERE id NOT IN (SELECT entity_id FROM mentions)')
        if deleted:
            db.execute("UPDATE metadata SET value=value+1 WHERE key='corpus_revision'")
    return {'deleted':bool(deleted), 'deleted_review_count':count}


def graph():
    with connect() as db:
        docs = [dict(r) for r in db.execute('SELECT id,title FROM documents ORDER BY id')]
        entities = [dict(r) for r in db.execute('SELECT id,name,kind FROM entities ORDER BY id')]
        edges = [dict(r) for r in db.execute('SELECT document_id AS source,entity_id AS target,block_id FROM mentions')]
    return {'nodes':[{'id':d['id'],'label':d['title'],'kind':'document'} for d in docs]+[
        {'id':e['id'],'label':e['name'],'kind':e['kind']} for e in entities],
        'edges':edges, 'relationship':'text_mention_candidate', 'layout':'decorative_3d_not_similarity'}


def set_finding_status(review_id, finding_id, status, input_hash):
    if status not in ('open','acknowledged','later'):
        raise ValueError('상태는 open/acknowledged/later 중 하나여야 합니다.')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT result FROM reviews WHERE id=?',(review_id,)).fetchone()
        if not row:
            raise ValueError('검토 결과가 삭제됐습니다. 다시 검사하세요.')
        result=json.loads(row['result'])
        if result.get('input_hash')!=input_hash or result['corpus_revision']!=db.execute("SELECT value FROM metadata WHERE key='corpus_revision'").fetchone()[0]:
            raise ValueError('원고 또는 자료가 변경됐습니다. 다시 검사하세요.')
        item=next((f for f in result.get('findings',[]) if f['id']==finding_id),None)
        if item is None:
            raise ValueError('검사 항목을 찾을 수 없습니다.')
        item['status']=status
        item['updated_at']=datetime.now(timezone.utc).isoformat()
        db.execute('UPDATE reviews SET result=? WHERE id=?',(json.dumps(result,ensure_ascii=False),review_id))
        return {'finding_id':finding_id,'status':status,'review_id':review_id}
