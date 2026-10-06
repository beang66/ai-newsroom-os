"""Local SQLite adapter; no third-party dependencies or shared DB credentials.
User scope must come from the trusted login integration, never request JSON.
"""
import datetime
import json
import sqlite3
import uuid
from contextlib import contextmanager
from version_store import JsonVersionStore, VersionStoreError, content_hash

class SQLiteVersionStore(JsonVersionStore):
    def __init__(self, root, lock=None, user_id='test-user-001'):
        super().__init__(root, lock)
        if not isinstance(user_id, str) or not user_id.strip():
            raise ValueError('user_id required')
        self.user_id = user_id
        self.root.mkdir(parents=True, exist_ok=True)
        self.db_path = self.root / 'workspace.db'
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS articles (
                  user_id TEXT NOT NULL, article_id TEXT NOT NULL,
                  draft_json TEXT NOT NULL, updated_at TEXT NOT NULL,
                  PRIMARY KEY(user_id, article_id));
                CREATE TABLE IF NOT EXISTS versions (
                  user_id TEXT NOT NULL, article_id TEXT NOT NULL,
                  version_id TEXT NOT NULL, created_at TEXT NOT NULL,
                  internal INTEGER NOT NULL, version_number INTEGER,
                  record_json TEXT NOT NULL,
                  PRIMARY KEY(user_id, article_id, version_id));
                CREATE INDEX IF NOT EXISTS version_order ON versions
                  (user_id, article_id, created_at);
                CREATE UNIQUE INDEX IF NOT EXISTS version_numbers ON versions
                  (user_id, article_id, version_number) WHERE internal=0;
                CREATE TABLE IF NOT EXISTS migrations (
                  user_id TEXT NOT NULL, article_id TEXT NOT NULL,
                  PRIMARY KEY(user_id, article_id));
                CREATE TABLE IF NOT EXISTS version_requests (
                  user_id TEXT NOT NULL, article_id TEXT NOT NULL,
                  request_id TEXT NOT NULL, version_id TEXT NOT NULL,
                  PRIMARY KEY(user_id, article_id, request_id));
                PRAGMA user_version=2;
            ''')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=15)
        try:
            db.execute('PRAGMA busy_timeout=15000')
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except sqlite3.Error as e:
            db.rollback()
            raise VersionStoreError('로컬 DB를 읽거나 저장하지 못했어요. 저장 공간과 폴더 권한을 확인한 뒤 다시 시도해 주세요.', 500) from e
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def _insert(self, db, record):
        db.execute('INSERT INTO versions VALUES(?,?,?,?,?,?,?)',
            (self.user_id, record['articleId'], record['versionId'], record['createdAt'],
             int(record['internal']), record['versionNumber'], json.dumps(record, ensure_ascii=False)))

    def _save(self, db, article_id, draft):
        db.execute('INSERT INTO articles VALUES(?,?,?,?) ON CONFLICT(user_id,article_id) DO UPDATE SET draft_json=excluded.draft_json, updated_at=excluded.updated_at',
            (self.user_id, article_id, json.dumps(draft, ensure_ascii=False), datetime.datetime.now(datetime.timezone.utc).isoformat()))

    def _migrate(self, db, article_id):
        # Import atomically, exactly once. JSON originals remain untouched.
        if db.execute('SELECT 1 FROM migrations WHERE user_id=? AND article_id=?', (self.user_id, article_id)).fetchone():
            return
        # Legacy JSON had no owner. Only the explicitly designated test owner imports it.
        if self.user_id != 'test-user-001':
            db.execute('INSERT INTO migrations VALUES(?,?)', (self.user_id, article_id))
            return
        legacy = JsonVersionStore(self.root, self.lock)
        for meta in reversed(legacy.list(article_id, include_internal=True)):
            record = legacy.get(article_id, meta['versionId'])
            record.update(versionNumber=meta['versionNumber'], internal=meta['internal'])
            self._insert(db, record)
        path = self.root / 'articles' / (article_id + '.json')
        if path.exists():
            self._save(db, article_id, json.loads(path.read_text(encoding='utf-8')))
        db.execute('INSERT INTO migrations VALUES(?,?)', (self.user_id, article_id))

    def _records(self, db, article_id):
        rows = db.execute('SELECT record_json FROM versions WHERE user_id=? AND article_id=? ORDER BY created_at DESC,version_id DESC', (self.user_id, article_id))
        return [json.loads(row[0]) for row in rows]

    @staticmethod
    def _meta(record):
        return {k:v for k,v in record.items() if k != 'draft'}

    def list(self, article_id, include_internal=False):
        self.validate(article_id)
        with self.lock, self.connect() as db:
            self._migrate(db, article_id)
            return [self._meta(r) for r in self._records(db, article_id) if include_internal or not r['internal']]

    def _get(self, db, article_id, version_id):
        row = db.execute('SELECT record_json FROM versions WHERE user_id=? AND article_id=? AND version_id=?', (self.user_id, article_id, version_id)).fetchone()
        if not row:
            raise VersionStoreError('저장된 버전을 찾지 못했어요.', 404)
        return json.loads(row[0])

    def get(self, article_id, version_id):
        self.validate(article_id); self.validate(version_id)
        with self.lock, self.connect() as db:
            self._migrate(db, article_id)
            return self._get(db, article_id, version_id)

    def _create(self, db, article_id, draft, kind, force):
        if not isinstance(draft, dict) or not isinstance(draft.get('bodyHtml'), str):
            raise VersionStoreError('저장할 원고를 확인해 주세요.')
        if kind not in ('automatic','manual','before_restore','restored'):
            raise VersionStoreError('잘못된 저장 유형입니다.')
        records = self._records(db, article_id)
        visible = [r for r in records if not r['internal']]
        comparison = records if kind == 'automatic' else visible
        digest = content_hash(draft)
        if comparison and comparison[0]['contentHash'] == digest and not force:
            return {'created':False, 'version':self._meta(comparison[0])}
        internal = kind in ('before_restore','restored')
        record = dict(schemaVersion=1, versionId=uuid.uuid4().hex, articleId=article_id,
            parentVersionId=visible[0]['versionId'] if visible else None,
            versionNumber=None if internal else max((r['versionNumber'] for r in visible), default=0)+1,
            internal=internal, createdAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            kind=kind, contentHash=digest, title=draft.get('title',''), draft=dict(draft,articleId=article_id))
        self._insert(db, record)
        return {'created':True, 'version':self._meta(record)}

    def create(self, article_id, draft, kind='automatic', force=False, request_id=None):
        self.validate(article_id)
        if request_id is not None:self.validate(request_id)
        with self.lock, self.connect() as db:
            self._migrate(db, article_id)
            if request_id:
                prior=db.execute('SELECT version_id FROM version_requests WHERE user_id=? AND article_id=? AND request_id=?',(self.user_id,article_id,request_id)).fetchone()
                if prior:return {'created':False,'replayed':True,'version':self._meta(self._get(db,article_id,prior[0]))}
            # Explicit save is a checkpoint even when the content is unchanged.
            result=self._create(db, article_id, draft, kind, force or kind=='manual')
            if request_id:
                db.execute('INSERT INTO version_requests VALUES(?,?,?,?)',(self.user_id,article_id,request_id,result['version']['versionId']))
            return result

    def save_current(self, article_id, draft):
        self.validate(article_id)
        with self.lock, self.connect() as db:
            self._migrate(db, article_id)
            self._save(db, article_id, dict(draft, articleId=article_id))

    def current(self, article_id):
        self.validate(article_id)
        with self.lock, self.connect() as db:
            self._migrate(db, article_id)
            row = db.execute('SELECT draft_json FROM articles WHERE user_id=? AND article_id=?', (self.user_id, article_id)).fetchone()
            return json.loads(row[0]) if row else None

    def restore(self, article_id, version_id, current, expected_hash):
        self.validate(article_id); self.validate(version_id)
        if not isinstance(current, dict):raise VersionStoreError('복원할 원고를 확인해 주세요.')
        with self.lock, self.connect() as db:
            self._migrate(db, article_id)
            target = self._get(db, article_id, version_id)
            latest = db.execute('SELECT draft_json FROM articles WHERE user_id=? AND article_id=?', (self.user_id, article_id)).fetchone()
            if latest and content_hash(json.loads(latest[0])) != expected_hash:
                raise VersionStoreError('원고가 다른 곳에서 수정됐어요. 현재 원고를 확인한 뒤 다시 시도해 주세요.', 409)
            if content_hash(current) != expected_hash:
                raise VersionStoreError('복원할 원고 상태가 달라졌어요. 다시 시도해 주세요.', 409)
            backup = self._create(db, article_id, current, 'before_restore', True)
            draft = dict(target['draft'], articleId=article_id, updatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
            if target['kind']=='before_restore':draft.pop('__versionReturn', None)
            else:draft['__versionReturn']={'versionId':version_id,'backupVersionId':backup['version']['versionId']}
            restored = self._create(db, article_id, draft, 'restored', True)
            self._save(db, article_id, draft)
            return {'draft':draft,'version':restored['version'],'backupVersionId':backup['version']['versionId']}
