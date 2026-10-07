"""원고·취재자료를 암호화 로컬 저장소(vault.py)에 저장한다."""
import base64
import datetime
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import threading
import uuid

from . import config  # noqa: F401  — sys.path 에 app/ 를 올린다(app_paths)
from app_paths import APP_DATA, ARTICLES_DIR, SOURCES_DIR  # noqa: E402

from . import ids, vault
from .errors import RequestError

SAVE_LOCK = threading.Lock()
MAX_REVISIONS = 200  # ponytail: 자동저장 이력은 원고마다 최근 200개만 둔다. 더 필요하면 간격 저장(예: 1분)이나 압축으로
OPEN_DIR = APP_DATA / 'open'  # 외부 프로그램으로 열 때만 만드는 임시 복호화본(cleanup_open)


def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def cleanup_open():
    """외부 프로그램용 임시 복호화본을 지운다(앱 시작·종료 때). 뷰어가 잡고 있는 파일은 못 지우므로 오류는 무시하고 다음 기회에 지운다."""
    shutil.rmtree(OPEN_DIR, ignore_errors=True)


PHOTO_FIELDS = ('data', 'original')  # 사진 항목에서 base64 data URL 이 들어오는 필드
MEDIA_REF = re.compile(r'media:([a-f0-9]{32})')


def _pack(db, draft):
    """원고의 사진(data URL, base64)을 media 테이블에 한 번만 저장하고 원고에는 'media:<id>' 만 남긴다.
    같은 사진은 해시가 같아 한 번만 저장된다(data·original 이 같고, 본문만 고쳐도 사진이 복사되지 않는다)."""
    photos = draft.get('photos')
    if not isinstance(photos, list):
        return draft
    packed = []
    for photo in photos:
        if isinstance(photo, dict):
            photo = dict(photo)
            for key in PHOTO_FIELDS:
                head, _, b64 = photo[key].partition(',') if isinstance(photo.get(key), str) else ('', '', '')
                if not (head.startswith('data:') and head.endswith(';base64')):
                    continue
                try:
                    raw = base64.b64decode(b64, validate=True)
                except ValueError:
                    continue  # 읽지 못하면 원고 안에 그대로 둔다(잃지 않는다)
                media_id = hashlib.sha256(head.encode() + b'\0' + raw).hexdigest()[:32]
                db.execute('INSERT OR IGNORE INTO media VALUES (?, ?, ?, ?, ?)', (media_id, vault.WORKSPACE_ID, head, raw, _now()))
                photo[key] = 'media:' + media_id
        packed.append(photo)
    return dict(draft, photos=packed)


def _unpack(db, draft):
    """_pack 의 반대 — 'media:<id>' 를 원래 data URL 로 되돌려 프론트에 돌려준다."""
    for photo in draft.get('photos') or []:
        for key in PHOTO_FIELDS if isinstance(photo, dict) else ():
            found = MEDIA_REF.fullmatch(photo[key]) if isinstance(photo.get(key), str) else None
            row = db.execute('SELECT header, data FROM media WHERE id = ?', (found.group(1),)).fetchone() if found else None
            if row:  # ponytail: 행이 없으면 참조를 그대로 둔다(깨진 사진). 고아 media 정리(GC)는 용량이 문제될 때
                photo[key] = row[0] + ',' + base64.b64encode(bytes(row[1])).decode()
    return draft


def pack_existing_photos():
    """이미 저장된 이력(revision)에 들어 있는 사진 base64 를 media 로 옮긴다. 여러 번 불러도 안전하다."""
    changed = 0
    with SAVE_LOCK, vault.connect() as db:
        rows = db.execute("SELECT article_id, revision_no, draft_json FROM article_revisions WHERE draft_json LIKE '%;base64,%'").fetchall()
        for article_id, revision, text in rows:
            draft = json.loads(text)
            packed = _pack(db, draft)
            if packed != draft:
                db.execute('UPDATE article_revisions SET draft_json = ? WHERE article_id = ? AND revision_no = ?',
                           (json.dumps(packed, ensure_ascii=False, sort_keys=True), article_id, revision))
                changed += 1
        if changed:
            db.commit()
            db.execute('VACUUM')  # 줄어든 만큼 파일도 줄인다
    return changed


def import_legacy_embedding_cache():
    """예전 평문 임베딩 캐시(APP_DATA/factcheck/*.sqlite3)를 암호화 저장소로 옮기고, 모두 들어갔음을 확인한 뒤에만 지운다."""
    from .ai.factcheck.paths import RUNTIME_DIR
    old = RUNTIME_DIR / 'qwen3_embedding_vectors.sqlite3'
    if not old.is_file():
        return 0
    moved = 0
    source = sqlite3.connect(f'file:{old.as_posix()}?mode=ro', uri=True)
    try:
        cursor = source.execute('SELECT key, vector, origin FROM vectors')
        with vault.connect() as db:
            while True:
                rows = cursor.fetchmany(500)
                if not rows:
                    break
                db.executemany('INSERT OR IGNORE INTO embedding_vectors VALUES (?, ?, ?)', rows)
                found = db.execute(f'SELECT count(*) FROM embedding_vectors WHERE key IN ({",".join("?" * len(rows))})',
                                   [r[0] for r in rows]).fetchone()[0]
                if found != len(rows):
                    raise RuntimeError('임베딩 캐시 이전 확인 실패 — 평문 캐시를 지우지 않습니다.')
                moved += len(rows)
    finally:
        source.close()
    for path in (old, old.with_name(old.name + '-wal'), old.with_name(old.name + '-shm'), old.with_name(old.name + '-journal')):
        try:
            path.unlink(missing_ok=True)
        except OSError:  # 실행 중인 예전 앱이 아직 쥐고 있다 — 다음 시작 때 다시 지운다
            return moved
    return moved


def import_legacy_files():
    """예전 평문 저장물(내 문서/AI Newsroom/articles·sources)을 암호화 저장소로 가져온다.
    여러 번 불러도 안전하다(이미 있는 것은 건너뜀). 원본 파일은 지우지 않는다 — 지우기는 사용자 확인 뒤에 따로."""
    report = {'articles': 0, 'sources': 0, 'skipped': 0, 'failed': []}

    def stamp(path):
        return datetime.datetime.fromtimestamp(path.stat().st_mtime, datetime.timezone.utc).isoformat()

    with SAVE_LOCK, vault.connect() as db:
        for path in sorted(ARTICLES_DIR.glob('*.json')) if ARTICLES_DIR.is_dir() else []:
            try:
                draft = json.loads(path.read_text(encoding='utf-8'))
                identifier = draft['articleId']
                if not re.fullmatch(r'[a-f0-9]{32}', identifier) or path.stem != identifier:
                    raise ValueError(identifier)
                when = stamp(path)
            except (OSError, ValueError, KeyError, TypeError):
                report['failed'].append(path.name)
                continue
            if db.execute('SELECT 1 FROM articles WHERE id = ?', (identifier,)).fetchone():
                report['skipped'] += 1
                continue
            body = json.dumps(_pack(db, dict(draft, articleId=identifier, savedAt=None)), ensure_ascii=False, sort_keys=True)
            db.execute('INSERT INTO articles VALUES (?, ?, ?, ?)', (identifier, vault.WORKSPACE_ID, when, when))
            db.execute('INSERT INTO article_revisions (article_id, revision_no, draft_json, created_at, id) VALUES (?, 1, ?, ?, ?)',
                       (identifier, body, when, ids.revision_uuid(identifier, 1)))
            report['articles'] += 1
        for folder in sorted(SOURCES_DIR.iterdir()) if SOURCES_DIR.is_dir() else []:
            files = [p for p in folder.glob('*') if p.is_file() and p.name != 'text.txt']
            if not folder.is_dir() or not re.fullmatch(r'[a-f0-9]{16}', folder.name) or not files or not (folder / 'text.txt').is_file():
                report['failed'].append(folder.name)
                continue
            if db.execute('SELECT 1 FROM sources WHERE id = ?', (folder.name,)).fetchone():
                report['skipped'] += 1
                continue
            try:
                db.execute('INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?)',
                           (folder.name, vault.WORKSPACE_ID, files[0].name, (folder / 'text.txt').read_text(encoding='utf-8'),
                            files[0].read_bytes(), stamp(files[0])))
            except OSError:
                report['failed'].append(folder.name)
                continue
            report['sources'] += 1
    return report


def _append_revision(db, identifier, body, now):
    """이력에 새 줄을 더한다. 마지막 줄과 내용이 같으면 늘리지 않는다(자동저장이 잦다). → 최신 revision 번호"""
    last = db.execute('SELECT revision_no, draft_json FROM article_revisions WHERE article_id = ? '
                      'ORDER BY revision_no DESC LIMIT 1', (identifier,)).fetchone()
    if last and last[1] == body:
        return last[0]
    revision = (last[0] if last else 0) + 1
    db.execute('INSERT INTO article_revisions (article_id, revision_no, draft_json, created_at, id) VALUES (?, ?, ?, ?, ?)',
               (identifier, revision, body, now, ids.revision_uuid(identifier, revision)))
    db.execute('DELETE FROM article_revisions WHERE article_id = ? AND revision_no <= ?',
               (identifier, revision - MAX_REVISIONS))
    return revision


def save_article(data):
    draft = data.get('draft')
    if not isinstance(draft, dict) or not isinstance(draft.get('bodyHtml'), str):
        raise RequestError('저장할 원고를 확인해 주세요.')
    identifier = draft.get('articleId') or uuid.uuid4().hex
    if not isinstance(identifier, str) or not re.fullmatch(r'[a-f0-9]{32}', identifier):
        raise RequestError('잘못된 원고 ID입니다.')
    now = _now()
    with SAVE_LOCK, vault.connect() as db:
        body = json.dumps(_pack(db, dict(draft, articleId=identifier, savedAt=None)), ensure_ascii=False, sort_keys=True)
        db.execute('INSERT OR IGNORE INTO articles VALUES (?, ?, ?, ?)', (identifier, vault.WORKSPACE_ID, now, now))
        revision = _append_revision(db, identifier, body, now)
        db.execute('UPDATE articles SET updated_at = ? WHERE id = ?', (now, identifier))
    return {'saved': True, 'articleId': identifier, 'revisionNo': revision,
            'fileName': identifier + '.json', 'folder': '암호화 저장소'}  # fileName·folder 는 이전 응답과의 호환용 표시값


def latest_article():
    """가장 최근에 저장된 원고(앱을 열면 이어서 작업). 취재자료 본문은 sources 테이블에서 다시 붙인다."""
    with vault.connect() as db:
        row = db.execute('SELECT r.draft_json, a.updated_at FROM articles a JOIN article_revisions r ON r.article_id = a.id '
                         'AND r.revision_no = (SELECT max(revision_no) FROM article_revisions WHERE article_id = a.id) '
                         'ORDER BY a.updated_at DESC LIMIT 1').fetchone()
        if not row:
            return {'draft': None}
        return {'draft': _full_draft(db, row[0], row[1])}


def _full_draft(db, draft_json, saved_at):
    """이력 한 줄 → 화면이 쓰는 원고(사진 되돌리기 + 취재자료 본문 붙이기)."""
    draft = _unpack(db, dict(json.loads(draft_json), savedAt=saved_at))
    for source in draft.get('sources') or []:
        sid = source.get('id')
        found = db.execute('SELECT text FROM sources WHERE id = ?', (sid,)).fetchone() if isinstance(sid, str) else None
        if found:
            source['text'] = found[0]
    return draft


def _article_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{32}', value):
        raise RequestError('잘못된 원고 ID입니다.')
    return value


def _plain(draft):
    """미리보기용 본문 글자(content 가 없는 옛 원고는 bodyHtml 에서 태그만 걷어 낸다)."""
    text = draft.get('content')
    if not isinstance(text, str):
        text = re.sub(r'<[^>]+>', '', (draft.get('bodyHtml') or '').replace('<br>', '\n').replace('</p>', '\n\n')).strip()
    return text


def list_revisions(article_id):
    """원고의 저장 이력(최신이 위). 목록용 요약만 — 본문 전체와 사진은 싣지 않는다."""
    article_id = _article_id(article_id)
    with vault.connect() as db:
        rows = db.execute('SELECT revision_no, id, created_at, draft_json FROM article_revisions WHERE article_id = ? '
                          'ORDER BY revision_no DESC', (article_id,)).fetchall()
    out = []
    for number, uuid_, created, body in rows:
        draft = json.loads(body)
        text = _plain(draft)
        out.append({'revisionNo': number, 'id': uuid_, 'createdAt': created, 'title': draft.get('title') or '',
                    'subtitle': draft.get('subtitle') or '', 'excerpt': text[:120], 'chars': len(text),
                    'photoCount': len(draft.get('photos') or []), 'sourceCount': len(draft.get('sources') or [])})
    return {'articleId': article_id, 'revisions': out}


def get_revision(article_id, revision_no):
    """이력 한 줄의 미리보기(제목·부제·본문). 읽기 전용이며 아무것도 바꾸지 않는다."""
    article_id = _article_id(article_id)
    with vault.connect() as db:
        row = db.execute('SELECT id, created_at, draft_json FROM article_revisions WHERE article_id = ? AND revision_no = ?',
                         (article_id, revision_no)).fetchone()
    if not row:
        raise RequestError('해당 저장 이력을 찾지 못했습니다. 오래된 이력은 자동으로 정리됩니다.', 404)
    draft = json.loads(row[2])
    return {'revisionNo': revision_no, 'id': row[0], 'createdAt': row[1], 'title': draft.get('title') or '',
            'subtitle': draft.get('subtitle') or '', 'content': _plain(draft),
            'photoCount': len(draft.get('photos') or []), 'sourceCount': len(draft.get('sources') or [])}


def restore_revision(article_id, revision_no):
    """옛 저장본을 **새 최신 저장본**으로 다시 올린다. 이력은 지우지 않으므로 복원 직전 상태도 이력에 남는다.
    이미 최신과 같은 내용이면 이력을 늘리지 않는다(같은 요청을 두 번 보내도 안전). → 복원된 원고"""
    article_id = _article_id(article_id)
    now = _now()
    with SAVE_LOCK, vault.connect() as db:
        row = db.execute('SELECT draft_json FROM article_revisions WHERE article_id = ? AND revision_no = ?',
                         (article_id, revision_no)).fetchone()
        if not row:
            raise RequestError('해당 저장 이력을 찾지 못했습니다. 오래된 이력은 자동으로 정리됩니다.', 404)
        body = json.dumps(dict(json.loads(row[0]), articleId=article_id, savedAt=None), ensure_ascii=False, sort_keys=True)
        latest = _append_revision(db, article_id, body, now)
        db.execute('UPDATE articles SET updated_at = ? WHERE id = ?', (now, article_id))
        draft = _full_draft(db, body, now)
    return {'restored': True, 'articleId': article_id, 'fromRevision': revision_no, 'revisionNo': latest, 'draft': draft}


def save_source(filename, raw, text):
    """취재자료 원본과 추출 텍스트를 암호화 저장소에 둔다. 같은 파일(내용 해시)은 한 번만 저장된다.
    파일 이름은 사용자가 알아보도록 원래 이름을 쓴다(경로 문자만 걸러 낸다)."""
    source_id = hashlib.sha1(raw).hexdigest()[:16]
    safe = re.sub(r'[\\/:*?"<>|\x00-\x1f]', '_', filename.replace('\\', '/').rsplit('/', 1)[-1]).strip(' .') or 'source'
    with SAVE_LOCK, vault.connect() as db:  # ponytail: 원본(최대 30MB)을 DB 안에 둔다. 커져서 느려지면 암호화 파일로 분리
        db.execute('INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET text = excluded.text',
                   (source_id, vault.WORKSPACE_ID, safe, text, raw, _now()))
    return source_id, '암호화 저장소/' + safe


def _original(source_id):
    """보관한 취재자료 원본 (이름, 바이트). ID 는 16자 hex 만 받는다."""
    if not isinstance(source_id, str) or not re.fullmatch(r'[a-f0-9]{16}', source_id):
        raise RequestError('잘못된 자료 ID입니다.')
    with vault.connect() as db:
        row = db.execute('SELECT name, original FROM sources WHERE id = ?', (source_id,)).fetchone()
    if not row:
        raise RequestError('보관된 원본 파일을 찾지 못했습니다.', 404)
    return row[0], bytes(row[1])


def source_file(source_id):
    """앱 안 뷰어용 원본 바이트 → (bytes, mime)."""
    name, raw = _original(source_id)
    mime = {'.pdf': 'application/pdf'}.get(os.path.splitext(name)[1].lower(), 'application/octet-stream')
    return raw, mime


def open_source(data):
    """보관한 취재자료 원본을 이 PC 의 기본 프로그램(PDF 뷰어·한글 등)으로 연다. payload: {sourceId}
    외부 프로그램은 암호화 저장소를 못 읽으므로 임시 복호화본을 만든다(APP_DATA/open, 다음 호출·앱 시작·종료 때 지운다)."""
    name, raw = _original(data.get('sourceId'))
    cleanup_open()
    folder = OPEN_DIR / data['sourceId']
    folder.mkdir(parents=True, exist_ok=True)
    original = folder / name
    original.write_bytes(raw)
    if os.name == 'nt':
        os.startfile(original)  # noqa: S606 — 우리가 만든 임시 파일만(ID 검증)
    else:
        subprocess.Popen(['open' if sys.platform == 'darwin' else 'xdg-open', str(original)])
    return {'opened': True, 'path': str(original)}
