"""암호화 로컬 저장소(SQLCipher) — 원고·취재자료는 여기에만 둔다.

기기 키(랜덤 32바이트)는 OS 자격 증명 저장소(Windows 자격 증명 관리자)에 두고, 로그인과는 무관하다.
키는 이 PC 의 사용자 계정에 묶이므로 폴더를 통째로 복사해도 다른 PC 에서는 열리지 않는다.
실패하면 열지 않는다(fail closed). 특히 DB 가 이미 있는데 키가 없으면 새 키를 만들지 않는다 — 만들면 기존 원고가 영영 안 열린다.
"""
import base64
import contextlib
import datetime
import functools
import hashlib
import hmac
import os
import re
import shutil
import sys
import tempfile
import threading

import keyring
from sqlcipher3 import dbapi2 as sqlite

from . import auth, config  # noqa: F401  — sys.path 에 app/ 를 올린다(app_paths)
from app_paths import DB_PATH  # noqa: E402

from .errors import RequestError
from .ids import revision_uuid

SERVICE = os.environ.get('AI_NEWSROOM_KEY_SERVICE') or 'AI Newsroom'  # 테스트는 다른 이름을 써서 실제 기기 키를 건드리지 않는다
ACCOUNT = 'device-key'
MANUAL_SAVE_INTRODUCED = '2026-10-10T06:00:00+00:00'  # 수동 저장 도입(10-10 15:00 KST) — 그 전 이력은 모두 자동 저장
WORKSPACE_ID = '10000000-0000-4000-8000-000000000001'  # 단일 워크스페이스(계약 ERD 의 workspace_id). 저장소 파일이 계정마다 따로라 계정 안에서는 하나다


def _fixed_user():
    # AI_NEWSROOM_FIXED_USER: 시험용(UI 스모크·단위 시험) 고정 사용자. 배포본(frozen)에서는 무시한다.
    return '' if getattr(sys, 'frozen', False) else os.environ.get('AI_NEWSROOM_FIXED_USER', '')


def _user_id():
    return _fixed_user() or auth.signed_user()


def _path_for(user):
    return DB_PATH.with_name(f'{DB_PATH.stem}-{re.sub(r"[^A-Za-z0-9_-]", "_", user)[:64]}{DB_PATH.suffix}')


def active_path():
    """지금 로그인한 계정의 저장소 파일(vault-<사용자 id>.db). 로그인하지 않았으면 열지 않는다(AUTH_REQUIRED).
    계정마다 파일이 따로라서 다른 계정의 기사·자료는 질의로도 닿지 않는다."""
    user = _user_id()
    if not user:
        raise RequestError('로그인이 필요합니다.', 401, code='AUTH_REQUIRED')
    if user == _fixed_user():  # 시험용 고정 사용자는 DB_PATH 자체를 쓴다(시험이 DB_PATH 를 직접 다룬다)
        return DB_PATH
    return _path_for(user)


def backup_key():
    """강제 종료 대비 원고 백업(브라우저 저장소)을 암호화하는 키: 기기 키와 계정 id 에서 파생한 32바이트(base64).
    계정마다 다르고, 이 PC 의 기기 키가 같으면 늘 같다(재시작 후에도 복호화된다). 로그인하지 않았으면 주지 않는다."""
    user = _user_id()
    if not user:
        raise RequestError('로그인이 필요합니다.', 401, code='AUTH_REQUIRED')
    digest = hmac.new(bytes.fromhex(_device_key()), b'draft-backup:' + user.encode('utf-8'), hashlib.sha256).digest()
    return base64.b64encode(digest).decode('ascii')


def _any_db_exists():
    return DB_PATH.exists() or any(DB_PATH.parent.glob(f'{DB_PATH.stem}-*{DB_PATH.suffix}'))


def adopt_legacy(user_id):
    """계정 도입 전의 저장소(vault.db)를 처음 로그인한 계정의 것으로 옮긴다(한 번만). 옮겼으면 True."""
    marker = DB_PATH.with_name(DB_PATH.stem + '.adopted')
    with _INIT_LOCK:
        if marker.exists() or not DB_PATH.is_file():
            return False
        target = _path_for(user_id)
        moved = False
        if not target.exists():
            # 이전하기 전에 원본을 한 번 복사해 둔다(문제가 생기면 이 파일로 되돌릴 수 있다). 복사에 실패하면 옮기지 않는다.
            with contextlib.suppress(RequestError, sqlite.DatabaseError), connect_path(DB_PATH) as legacy_db:
                legacy_db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
            shutil.copy2(DB_PATH, DB_PATH.with_name(DB_PATH.stem + '.pre-accounts' + DB_PATH.suffix))
            for suffix in ('', '-wal', '-shm'):
                source = DB_PATH.with_name(DB_PATH.name + suffix)
                if source.exists():
                    os.replace(source, target.with_name(target.name + suffix))
            moved = True
        marker.write_text(user_id, encoding='utf-8')
        return moved
_INIT_LOCK = threading.RLock()
SCHEMA_VERSION = 7  # 4: article_deleted / 5: 고정본 보강 / 6: 노트 역할 / 7: 동의 기반 UT 이벤트
# api.py 의 /api/vault/restore 요청 한도(220MB)에 base64(4/3배)·JSON 여유를 뺀 값. 넘는 백업은 받아도 복구할 수 없다.
MAX_BACKUP_BYTES = 160_000_000

# storage.purge_trash 가 영구 삭제 때만 잠시 지웠다가 이것으로 되돌린다
SNAPSHOT_NO_DELETE = """CREATE TRIGGER IF NOT EXISTS article_snapshots_no_delete BEFORE DELETE ON article_snapshots
BEGIN SELECT RAISE(ABORT, 'article_snapshots are immutable'); END;"""

SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS article_revisions (
  article_id TEXT NOT NULL REFERENCES articles(id), revision_no INTEGER NOT NULL,
  draft_json TEXT NOT NULL, created_at TEXT NOT NULL, id TEXT, kind TEXT NOT NULL DEFAULT 'manual',
  PRIMARY KEY (article_id, revision_no));
-- 발행본: 기사마다 하나(다시 발행하면 덮어쓰고 published_at 갱신). draft_json 은 발행한 판의 복사본이라 이력이 정리돼도 남는다
CREATE TABLE IF NOT EXISTS article_published (
  article_id TEXT PRIMARY KEY REFERENCES articles(id), revision_no INTEGER NOT NULL, draft_json TEXT NOT NULL,
  first_published_at TEXT NOT NULL, published_at TEXT NOT NULL, publish_count INTEGER NOT NULL DEFAULT 1);
-- 처음 수동 저장한 시각(미리보기 '입력', 송고 전). 이력이 정리돼도 남도록 따로 둔다
CREATE TABLE IF NOT EXISTS article_first_saved (article_id TEXT PRIMARY KEY, first_saved_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS article_deleted (article_id TEXT PRIMARY KEY REFERENCES articles(id), deleted_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, header TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY, media_id TEXT NOT NULL REFERENCES media(id), workspace_id TEXT NOT NULL, kind TEXT NOT NULL,
  mime_type TEXT NOT NULL, filename TEXT NOT NULL, caption TEXT NOT NULL, generated INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS embedding_vectors (
  key TEXT PRIMARY KEY, vector BLOB NOT NULL, origin TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS factcheck_memo (
  key TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, entry_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL,
  text TEXT NOT NULL, original BLOB NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS source_chunks (
  source_id TEXT NOT NULL, ordinal INTEGER NOT NULL, workspace_id TEXT NOT NULL,
  text TEXT NOT NULL, meta_json TEXT NOT NULL, vector_key TEXT,
  PRIMARY KEY (source_id, ordinal));
CREATE TABLE IF NOT EXISTS source_index (
  source_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, state TEXT NOT NULL,
  text_sha256 TEXT NOT NULL, chunker_version TEXT NOT NULL, chunk_count INTEGER NOT NULL,
  error_code TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS knowledge_files (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, path TEXT NOT NULL, path_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL, content TEXT NOT NULL, sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'note');
CREATE TABLE IF NOT EXISTS knowledge_links (
  source_id TEXT NOT NULL REFERENCES knowledge_files(id), ordinal INTEGER NOT NULL,
  kind TEXT NOT NULL, raw_text TEXT NOT NULL, target_ref TEXT NOT NULL,
  fragment TEXT NOT NULL, target_id TEXT, target_key TEXT NOT NULL, line INTEGER NOT NULL,
  is_embed INTEGER NOT NULL, PRIMARY KEY (source_id, ordinal));
CREATE INDEX IF NOT EXISTS knowledge_links_target_id ON knowledge_links(target_id);
CREATE INDEX IF NOT EXISTS knowledge_links_target_key ON knowledge_links(target_key);
CREATE TABLE IF NOT EXISTS article_snapshots (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, article_id TEXT NOT NULL REFERENCES articles(id),
  revision_id TEXT NOT NULL, revision_no INTEGER NOT NULL, title TEXT NOT NULL, body_html TEXT NOT NULL,
  body_text TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
  UNIQUE (article_id, revision_id, content_hash));
CREATE TRIGGER IF NOT EXISTS article_snapshots_no_update BEFORE UPDATE ON article_snapshots
BEGIN SELECT RAISE(ABORT, 'article_snapshots are immutable'); END;
""" + SNAPSHOT_NO_DELETE + """
CREATE TABLE IF NOT EXISTS processing_jobs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  input_resource_type TEXT NOT NULL, input_resource_id TEXT NOT NULL,
  output_resource_type TEXT, output_resource_id TEXT,
  error_code TEXT, error_message TEXT, retryable INTEGER,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, started_at TEXT, finished_at TEXT);
CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, filename TEXT NOT NULL, mime_type TEXT NOT NULL,
  audio BLOB NOT NULL, dialogues_json TEXT NOT NULL, duration REAL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ut_events (
  event_id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, payload_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ut_events_occurred_at ON ut_events(occurred_at);
"""
# article_snapshots: 검증·변환용 고정본(계약 ArticleSnapshot). 이력 줄을 참조하지 않고 내용을 **복사해** 둔다 —
# 이력이 MAX_REVISIONS 로 정리돼도 남는다. 두 트리거 때문에 한 번 쓴 줄은 고치거나 지울 수 없다(코드 실수로도).
# CREATE ... IF NOT EXISTS 라 옛 저장소에서도 connect() 마다 안전하게 생긴다(별도 이전 단계 불필요).


def _migrate(db):
    """옛 저장소에 없는 열을 채운다(여러 번 불러도 안전). 새 DB 는 SCHEMA 에 이미 있다."""
    # 원고 JSON의 부제·출처도 고정한다. 기존 고정본을 덮어쓰거나 해시 레시피를 바꾸지 않는다.
    snapshot_columns = {row[1] for row in db.execute('PRAGMA table_info(article_snapshots)')}
    for column in ('subtitle', 'url'):
        if column not in snapshot_columns:
            db.execute(f"ALTER TABLE article_snapshots ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")
    # 6: 노트 역할을 코어가 저장한다. 옛 노트는 경로의 역할 폴더로 한 번 채운다(화면이 하던 규칙과 같다)
    if not any(row[1] == 'role' for row in db.execute('PRAGMA table_info(knowledge_files)')):
        from .knowledge_files import role_from_path
        db.execute("ALTER TABLE knowledge_files ADD COLUMN role TEXT NOT NULL DEFAULT 'note'")
        db.executemany('UPDATE knowledge_files SET role = ? WHERE id = ?',
                       [(role_from_path(path), ident) for ident, path in db.execute('SELECT id, path FROM knowledge_files').fetchall()])
    if not any(row[1] == 'id' for row in db.execute('PRAGMA table_info(article_revisions)')):
        db.execute('ALTER TABLE article_revisions ADD COLUMN id TEXT')
    for article_id, revision_no in db.execute('SELECT article_id, revision_no FROM article_revisions WHERE id IS NULL').fetchall():
        db.execute('UPDATE article_revisions SET id = ? WHERE article_id = ? AND revision_no = ?',
                   (revision_uuid(article_id, revision_no), article_id, revision_no))
    db.execute('CREATE UNIQUE INDEX IF NOT EXISTS article_revisions_id ON article_revisions(id)')
    # 2026-10-10 저장 종류: 'manual'(수동 저장 = 저장 이력·보관소) | 'auto'(자동 임시 저장 — 한 칸을 덮어씀).
    # 옛 이력은 'manual' 로 둔다(예전에는 저장마다 이력이었으므로 그대로 보이게).
    added = not any(row[1] == 'kind' for row in db.execute('PRAGMA table_info(article_revisions)'))
    if added:
        db.execute("ALTER TABLE article_revisions ADD COLUMN kind TEXT NOT NULL DEFAULT 'manual'")
    # 수동 저장을 쓰기 시작한 시각 — 이보다 앞선 이력은 '저장할 때마다 남던' 옛 자동 저장이다(저장 이력에서 정리 가능).
    # 지금 kind 열을 붙인 저장소는 지금부터, 이미 붙어 있던 저장소(10-10 수동 저장 도입 뒤 실행)는 도입 시각으로 적는다.
    # 처음 수동 저장 시각이 없는 옛 기사는 남아 있는 수동 저장 이력 중 가장 이른 시각으로 채운다(빠진 게 있을 때만 쓴다)
    missing = "SELECT article_id, min(created_at) FROM article_revisions WHERE kind = 'manual' " \
              'AND article_id NOT IN (SELECT article_id FROM article_first_saved) GROUP BY article_id'
    rows = db.execute(missing).fetchall()
    if rows:
        db.executemany('INSERT OR IGNORE INTO article_first_saved VALUES (?, ?)', rows)
    # 없을 때만 쓴다 — connect() 마다 쓰기 잠금을 잡으면 다른 스레드의 저장과 부딪힌다
    if not db.execute("SELECT 1 FROM app_meta WHERE key = 'manual_save_since'").fetchone():
        db.execute('INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)',
                   ('manual_save_since', datetime.datetime.now(datetime.timezone.utc).isoformat() if added else MANUAL_SAVE_INTRODUCED))


@functools.cache  # 처음 읽은 키를 기억한다(연결마다 자격 증명 관리자를 부르지 않게). 예외는 기억하지 않으므로 키가 없으면 계속 닫힌 채 실패한다
def _device_key():
    try:
        key = keyring.get_password(SERVICE, ACCOUNT)
        if key:
            return key
        if _any_db_exists():
            raise RequestError('암호화 저장소의 키를 찾을 수 없습니다. 이 PC 의 보관 키가 사라졌습니다.', 500)
        key = os.urandom(32).hex()
        keyring.set_password(SERVICE, ACCOUNT, key)
        return key
    except RequestError:
        raise
    except Exception:
        raise RequestError('이 PC 의 보안 저장소(키)를 사용할 수 없어 저장소를 열지 못했습니다.', 500)


def _password(value):
    if not isinstance(value, str) or not 12 <= len(value) <= 200:
        raise RequestError('백업 암호는 12~200자로 입력해 주세요.')
    return value


def _quote(_db, value):
    return "'" + str(value).replace("'", "''") + "'"


def _export(db, target, key, raw_key=False):
    target.unlink(missing_ok=True)
    key_sql = '"x\'' + key + '\'"' if raw_key else _quote(db, key)
    db.execute(f'ATTACH DATABASE {_quote(db, target)} AS portable KEY {key_sql}')
    try:
        db.execute("SELECT sqlcipher_export('portable')").fetchone()
    finally:
        db.execute('DETACH DATABASE portable')


def export_backup(password):
    """기기 키 대신 사용자가 정한 암호로 다시 암호화한 이동식 SQLCipher 백업."""
    password = _password(password)
    path = active_path()
    if not path.is_file():
        raise RequestError('백업할 사용자 자료가 없습니다.', 404)
    handle, name = tempfile.mkstemp(prefix='ai-newsroom-backup-', suffix='.db')
    os.close(handle)
    target = type(path)(name)
    try:
        with connect() as db:
            db.execute('PRAGMA wal_checkpoint(FULL)')
            _export(db, target, password)
        if target.stat().st_size > MAX_BACKUP_BYTES:
            raise RequestError('자료가 너무 커서 복구할 수 있는 백업을 만들 수 없습니다(최대 160MB). 오래된 녹음·자료를 정리해 주세요.', 413)
        return target.read_bytes()
    finally:
        target.unlink(missing_ok=True)


def restore_backup(raw, password):
    """이동식 백업을 검증한 뒤 이 기기의 새 키로 재암호화해 교체한다."""
    password = _password(password)
    if not isinstance(raw, bytes) or not raw:
        raise RequestError('복구할 백업 파일을 선택해 주세요.')
    path = active_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with _INIT_LOCK:
        source_handle, source_name = tempfile.mkstemp(prefix='ai-newsroom-restore-', suffix='.db')
        target_handle, target_name = tempfile.mkstemp(prefix='ai-newsroom-restored-', suffix='.db')
        os.close(source_handle)
        os.close(target_handle)
        source, target = type(path)(source_name), type(path)(target_name)
        rollback = path.with_name(path.stem + '.before-restore.db')
        try:
            source.write_bytes(raw)
            target.unlink(missing_ok=True)
            db = sqlite.connect(str(source), timeout=10)
            try:
                db.execute('PRAGMA cipher_log_level = NONE')
                db.execute(f'PRAGMA key = {_quote(db, password)}')
                tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if not {'articles', 'article_revisions', 'sources'} <= tables:
                    raise RequestError('AI Newsroom 백업 파일이 아니거나 암호가 맞지 않습니다.')
                _export(db, target, _device_key(), raw_key=True)
            except sqlite.DatabaseError as error:
                raise RequestError('백업 암호가 맞지 않거나 파일이 손상됐습니다.') from error
            finally:
                db.close()
            if path.is_file():
                # 옛 -wal 이 새 DB 옆에 남으면 다음 실행에서 옛 쓰기가 새 DB 위에 재생돼 깨진다: 먼저 비운다.
                with contextlib.suppress(RequestError, sqlite.DatabaseError), connect() as live_db:
                    live_db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
            rollback.unlink(missing_ok=True)
            for suffix in ('', '-wal', '-shm'):
                live = path.with_name(path.name + suffix)
                copy = rollback.with_name(rollback.name + suffix)
                copy.unlink(missing_ok=True)
                if live.exists():
                    shutil.copy2(live, copy)
            for suffix in ('-wal', '-shm'):  # 교체 전에 지운다(체크포인트가 실패했어도 안전 복사본에 남아 있다)
                path.with_name(path.name + suffix).unlink(missing_ok=True)
            os.replace(target, path)  # atomic: the live DB path is never empty
            return {'restored': True, 'safetyCopy': str(rollback) if rollback.exists() else None,
                    'restoredAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        finally:
            source.unlink(missing_ok=True)
            target.unlink(missing_ok=True)


@contextlib.contextmanager
def connect():
    """암호화 DB 연결(호출마다 열고 닫는다). 지금 로그인한 계정의 저장소를 연다."""
    with connect_path(active_path()) as db:
        yield db


@contextlib.contextmanager
def connect_path(path):
    """주어진 저장소 파일의 암호화 DB 연결. 정상 종료하면 커밋, 예외면 롤백."""
    db = None
    try:
        with _INIT_LOCK:
            key = _device_key()
            path.parent.mkdir(parents=True, exist_ok=True)
            db = sqlite.connect(str(path), timeout=10)
            db.execute('PRAGMA cipher_log_level = NONE')
            db.execute(f"PRAGMA key = \"x'{key}'\"")
            try:
                db.execute('SELECT count(*) FROM sqlite_master').fetchone()
            except sqlite.DatabaseError:
                raise RequestError('암호화 저장소를 열 수 없습니다. 키가 맞지 않거나 파일이 손상됐습니다.', 500)
            if db.execute('PRAGMA journal_mode').fetchone()[0].lower() != 'wal':
                db.execute('PRAGMA journal_mode = WAL')
            if db.execute('PRAGMA user_version').fetchone()[0] < SCHEMA_VERSION:
                db.executescript(SCHEMA)
                _migrate(db)
                db.execute(f'PRAGMA user_version = {SCHEMA_VERSION}')
                db.commit()
            yield db
            db.commit()
    except BaseException:
        if db is not None:
            db.rollback()
        raise
    finally:
        if db is not None:
            db.close()
