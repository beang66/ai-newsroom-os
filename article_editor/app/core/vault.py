"""암호화 로컬 저장소(SQLCipher) — 원고·취재자료는 여기에만 둔다.

기기 키(랜덤 32바이트)는 OS 자격 증명 저장소(Windows 자격 증명 관리자)에 두고, 로그인과는 무관하다.
키는 이 PC 의 사용자 계정에 묶이므로 폴더를 통째로 복사해도 다른 PC 에서는 열리지 않는다.
실패하면 열지 않는다(fail closed). 특히 DB 가 이미 있는데 키가 없으면 새 키를 만들지 않는다 — 만들면 기존 원고가 영영 안 열린다.
"""
import contextlib
import os

import keyring
from sqlcipher3 import dbapi2 as sqlite

from . import config  # noqa: F401  — sys.path 에 app/ 를 올린다(app_paths)
from app_paths import DB_PATH  # noqa: E402

from .errors import RequestError
from .ids import revision_uuid

SERVICE = os.environ.get('AI_NEWSROOM_KEY_SERVICE') or 'AI Newsroom'  # 테스트는 다른 이름을 써서 실제 기기 키를 건드리지 않는다
ACCOUNT = 'device-key'
WORKSPACE_ID = '10000000-0000-4000-8000-000000000001'  # 단일 워크스페이스(계약 ERD 의 workspace_id)

SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS article_revisions (
  article_id TEXT NOT NULL REFERENCES articles(id), revision_no INTEGER NOT NULL,
  draft_json TEXT NOT NULL, created_at TEXT NOT NULL, id TEXT, PRIMARY KEY (article_id, revision_no));
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
CREATE TABLE IF NOT EXISTS article_snapshots (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, article_id TEXT NOT NULL REFERENCES articles(id),
  revision_id TEXT NOT NULL, revision_no INTEGER NOT NULL, title TEXT NOT NULL, body_html TEXT NOT NULL,
  body_text TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE (article_id, revision_id, content_hash));
CREATE TRIGGER IF NOT EXISTS article_snapshots_no_update BEFORE UPDATE ON article_snapshots
BEGIN SELECT RAISE(ABORT, 'article_snapshots are immutable'); END;
CREATE TRIGGER IF NOT EXISTS article_snapshots_no_delete BEFORE DELETE ON article_snapshots
BEGIN SELECT RAISE(ABORT, 'article_snapshots are immutable'); END;
CREATE TABLE IF NOT EXISTS processing_jobs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  input_resource_type TEXT NOT NULL, input_resource_id TEXT NOT NULL,
  output_resource_type TEXT, output_resource_id TEXT,
  error_code TEXT, error_message TEXT, retryable INTEGER,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, started_at TEXT, finished_at TEXT);
"""
# article_snapshots: 검증·변환용 고정본(계약 ArticleSnapshot). 이력 줄을 참조하지 않고 내용을 **복사해** 둔다 —
# 이력이 MAX_REVISIONS 로 정리돼도 남는다. 두 트리거 때문에 한 번 쓴 줄은 고치거나 지울 수 없다(코드 실수로도).
# CREATE ... IF NOT EXISTS 라 옛 저장소에서도 connect() 마다 안전하게 생긴다(별도 이전 단계 불필요).


def _migrate(db):
    """옛 저장소에 없는 열을 채운다(여러 번 불러도 안전). 새 DB 는 SCHEMA 에 이미 있다."""
    if not any(row[1] == 'id' for row in db.execute('PRAGMA table_info(article_revisions)')):
        db.execute('ALTER TABLE article_revisions ADD COLUMN id TEXT')
    for article_id, revision_no in db.execute('SELECT article_id, revision_no FROM article_revisions WHERE id IS NULL').fetchall():
        db.execute('UPDATE article_revisions SET id = ? WHERE article_id = ? AND revision_no = ?',
                   (revision_uuid(article_id, revision_no), article_id, revision_no))
    db.execute('CREATE UNIQUE INDEX IF NOT EXISTS article_revisions_id ON article_revisions(id)')


def _device_key():
    try:
        key = keyring.get_password(SERVICE, ACCOUNT)
        if key:
            return key
        if DB_PATH.exists():
            raise RequestError('암호화 저장소의 키를 찾을 수 없습니다. 이 PC 의 보관 키가 사라졌습니다.', 500)
        key = os.urandom(32).hex()
        keyring.set_password(SERVICE, ACCOUNT, key)
        return key
    except RequestError:
        raise
    except Exception:
        raise RequestError('이 PC 의 보안 저장소(키)를 사용할 수 없어 저장소를 열지 못했습니다.', 500)


@contextlib.contextmanager
def connect():
    """암호화 DB 연결(호출마다 열고 닫는다). 정상 종료하면 커밋, 예외면 롤백."""
    # TODO(debt: DEBT-001): 키/스키마 초기화가 동시 연결마다 실행된다. 업로드 시험에서 WAL 설정 시 잠금 오류 관찰.
    # 초기화 직렬화·이미 WAL인 DB의 재설정 생략·마이그레이션 트랜잭션 조기 종료를 검토할 것.
    key = _device_key()
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite.connect(str(DB_PATH))
    try:
        db.execute('PRAGMA cipher_log_level = NONE')  # 키가 틀려도 C 라이브러리가 stderr 에 로그를 쏟지 않게
        db.execute(f"PRAGMA key = \"x'{key}'\"")
        try:
            db.execute('SELECT count(*) FROM sqlite_master').fetchone()
        except sqlite.DatabaseError:
            raise RequestError('암호화 저장소를 열 수 없습니다. 키가 맞지 않거나 파일이 손상됐습니다.', 500)
        db.execute('PRAGMA journal_mode = WAL')
        db.executescript(SCHEMA)
        _migrate(db)
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()
