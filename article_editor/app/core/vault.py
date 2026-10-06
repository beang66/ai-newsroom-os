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

SERVICE = 'AI Newsroom'
ACCOUNT = 'device-key'
WORKSPACE_ID = '10000000-0000-4000-8000-000000000001'  # 단일 워크스페이스(계약 ERD 의 workspace_id)

SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS article_revisions (
  article_id TEXT NOT NULL REFERENCES articles(id), revision_no INTEGER NOT NULL,
  draft_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (article_id, revision_no));
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, header TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS embedding_vectors (
  key TEXT PRIMARY KEY, vector BLOB NOT NULL, origin TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS factcheck_memo (
  key TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, entry_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL,
  text TEXT NOT NULL, original BLOB NOT NULL, created_at TEXT NOT NULL);
"""


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
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()
