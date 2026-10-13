"""작성 중 기사 서버 백업의 부품 — 백업 키 받기, 암호화(봉인), 백업 내용 만들기·되돌리기.

서버(Supabase Storage)에는 **암호문만** 올라간다. 열쇠는 우리 백엔드(Render)가 관리한다:
백엔드가 마스터 키(BACKUP_MASTER_KEY)에서 **사용자별 키를 파생**해 로그인한 사용자에게만 돌려주고(POST /ai/backup-key),
앱은 그 키를 메모리에만 두고 기사를 암호화해 올린다. 그래서
- 사용자는 복구 키를 따로 관리하지 않고, 새 PC 에서는 로그인만 하면 복구할 수 있으며,
- Supabase(저장소)만 침해되면 암호문뿐이라 내용을 읽을 수 없다.
대신 **우리 관리측(백엔드 마스터 키 보유자)은 이론상 기사를 풀 수 있다** — 기사는 발행용이라 보안 민감도가 낮다는 판단이다(2026-10-13 결정).
취재자료·녹취는 이 백업에 넣지 않는다(로컬 전용).

암호화는 새 의존성 없이 기존 SQLCipher 로 한다: 내용을 담은 작은 SQLCipher 파일을 만들고 그 바이트를 올린다(사용자 백업과 같은 방식).
"""
import json
import tempfile
import threading
from pathlib import Path

from . import backend_proxy, storage, vault
from .errors import RequestError

_KEYS = {}  # 사용자 id -> 백업 키(메모리에만, 디스크에 저장하지 않는다)
_LOCK = threading.Lock()


# ---- 백업 키 ----
def backup_key(user_id):
    """이 사용자의 백업 키(문자열). 백엔드에서 받아 프로세스가 사는 동안만 기억한다. 못 받으면 RequestError."""
    with _LOCK:
        key = _KEYS.get(user_id)
    if key:
        return key
    reply = backend_proxy.post('/ai/backup-key', {})
    key = reply.get('key') if isinstance(reply, dict) else None
    if not isinstance(key, str) or len(key) < 20:
        raise RequestError('백업 키를 받지 못했어요. 백엔드 설정을 확인해 주세요.', 502)
    with _LOCK:
        _KEYS[user_id] = key
    return key


def forget_key(user_id=None):
    with _LOCK:
        if user_id is None:
            _KEYS.clear()
        else:
            _KEYS.pop(user_id, None)


# ---- 봉인(암호화) ----
def seal(key, data):
    """data(bytes)를 key 로 암호화한 SQLCipher 파일의 바이트."""
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / 'backup.db'
        db = vault.sqlite.connect(str(path))
        try:
            db.execute('PRAGMA cipher_log_level = NONE')
            db.execute(f'PRAGMA key = {vault._quote(db, key)}')
            db.execute('CREATE TABLE backup (data BLOB NOT NULL)')
            db.execute('INSERT INTO backup VALUES (?)', (data,))
            db.commit()
        finally:
            db.close()
        return path.read_bytes()


def open_sealed(key, raw):
    """seal 의 반대. 키가 틀리거나 파일이 깨졌으면 RequestError(400)."""
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / 'backup.db'
        path.write_bytes(raw)
        db = vault.sqlite.connect(str(path))
        try:
            db.execute('PRAGMA cipher_log_level = NONE')
            db.execute(f'PRAGMA key = {vault._quote(db, key)}')
            row = db.execute('SELECT data FROM backup').fetchone()
        except vault.sqlite.DatabaseError:
            raise RequestError('백업을 풀지 못했어요. 키가 바뀌었거나 파일이 손상됐어요.') from None
        finally:
            db.close()
        if row is None:
            raise RequestError('백업 파일이 비어 있어요.')
        return bytes(row[0])


# ---- 백업 내용 ----
def build_payload(article_id):
    """한 기사의 백업 내용(bytes) = 최신 작업본 + 마지막 수동 저장본. 기사가 없거나 보관소에서 지웠으면 None.
    사진·취재자료는 넣지 않는다(기사 본문의 'media:<id>' 참조만 남음)."""
    with vault.connect() as db:
        if storage.is_deleted(db, article_id):
            return None
        latest = db.execute('SELECT revision_no, draft_json, created_at, kind FROM article_revisions WHERE article_id = ? '
                            'ORDER BY revision_no DESC LIMIT 1', (article_id,)).fetchone()
        manual = db.execute("SELECT revision_no, draft_json, created_at FROM article_revisions WHERE article_id = ? AND kind = 'manual' "
                            'ORDER BY revision_no DESC LIMIT 1', (article_id,)).fetchone()
    if latest is None:
        return None
    working = json.loads(latest[1])
    payload = {'v': 1, 'articleId': article_id, 'title': working.get('title') or '', 'savedAt': latest[2],
               'working': {'revisionNo': latest[0], 'savedAt': latest[2], 'kind': latest[3], 'draft': working},
               'manual': ({'revisionNo': manual[0], 'savedAt': manual[2], 'draft': json.loads(manual[1])} if manual else None)}
    return json.dumps(payload, ensure_ascii=False, sort_keys=True).encode('utf-8')


def restore_payload(raw):
    """백업 내용을 이 PC 의 저장소에 되돌린다 → 새 이력 번호. 최신 작업본을 수동 저장으로 추가한다
    (기존 이력은 지우지 않고 새 저장본으로 쌓는다). 보관소에서 지운 기사는 ARTICLE_DELETED 로 거절된다."""
    payload = json.loads(raw.decode('utf-8'))
    source = payload.get('working') or payload.get('manual')
    if not source or not isinstance(source.get('draft'), dict):
        raise RequestError('백업 내용을 읽지 못했어요.')
    draft = dict(source['draft'], articleId=payload['articleId'])
    return storage.save_article({'draft': draft, 'kind': 'manual'})['revisionNo']
