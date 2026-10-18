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
from html.parser import HTMLParser

from . import config  # noqa: F401  — sys.path 에 app/ 를 올린다(app_paths)
from app_paths import APP_DATA, ARTICLES_DIR, SOURCES_DIR  # noqa: E402

from . import ids, vault
from .errors import RequestError

SAVE_LOCK = threading.Lock()
MAX_REVISIONS = 200  # ponytail: 자동저장 이력은 원고마다 최근 200개만 둔다. 더 필요하면 간격 저장(예: 1분)이나 압축으로
OPEN_DIR = APP_DATA / 'open'  # 외부 프로그램으로 열 때만 만드는 임시 복호화본(cleanup_open)
MAX_TRANSCRIPT_AUDIO = 40_000_000


def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def save_transcript(payload, result):
    """STT 성공 결과와 원본 녹음을 같은 암호화 저장소에 영구 보관한다."""
    filename = payload.get('filename')
    mime = payload.get('mimeType') or 'application/octet-stream'
    encoded = payload.get('data')
    dialogues = result.get('dialogues') if isinstance(result, dict) else None
    if not isinstance(filename, str) or not filename.strip() or len(filename) > 255:
        raise RequestError('녹음 파일 이름을 확인해 주세요.')
    known_audio = filename.lower().endswith(('.mp3', '.m4a', '.wav', '.aac', '.ogg', '.webm', '.mp4', '.mov'))
    if not isinstance(mime, str) or len(mime) > 100 or not (mime.startswith('audio/') or mime.startswith('video/')
                                                             or (mime == 'application/octet-stream' and known_audio)):
        raise RequestError('지원하지 않는 녹음 형식입니다.', 415)
    if not isinstance(encoded, str) or not isinstance(dialogues, list) or len(dialogues) > 10_000:
        raise RequestError('녹취 결과 형식을 확인해 주세요.')
    try:
        audio = base64.b64decode(encoded.split(',', 1)[-1], validate=True)
    except ValueError:
        raise RequestError('녹음 파일을 읽지 못했어요.') from None
    if not audio or len(audio) > MAX_TRANSCRIPT_AUDIO:
        raise RequestError('녹음 파일은 40MB 이하만 보관할 수 있어요.', 413)
    for item in dialogues:
        if not isinstance(item, dict) or not isinstance(item.get('text'), str) or len(item['text']) > 20_000:
            raise RequestError('녹취 발언 형식을 확인해 주세요.')
    identifier, created = uuid.uuid4().hex, _now()
    duration = result.get('duration')
    if duration is not None and (isinstance(duration, bool) or not isinstance(duration, (int, float)) or duration < 0):
        duration = None
    with vault.connect() as db:
        db.execute('INSERT INTO transcripts VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                   (identifier, vault.WORKSPACE_ID, filename.strip(), mime, audio,
                    json.dumps(dialogues, ensure_ascii=False), duration, created))
    return {**result, 'transcriptId': identifier, 'filename': filename.strip(), 'createdAt': created}


def list_transcripts():
    with vault.connect() as db:
        rows = db.execute('SELECT id, filename, mime_type, duration, created_at, length(audio), dialogues_json '
                          'FROM transcripts ORDER BY created_at DESC').fetchall()
    return {'transcripts': [{'id': row[0], 'filename': row[1], 'mimeType': row[2], 'duration': row[3],
                             'createdAt': row[4], 'bytes': row[5], 'segments': len(json.loads(row[6]))}
                            for row in rows]}


def get_transcript(identifier):
    if not isinstance(identifier, str) or not re.fullmatch(r'[a-f0-9]{32}', identifier):
        raise RequestError('잘못된 녹취 ID입니다.')
    with vault.connect() as db:
        row = db.execute('SELECT filename, mime_type, dialogues_json, duration, created_at FROM transcripts WHERE id = ?',
                         (identifier,)).fetchone()
        edits = db.execute('SELECT value FROM app_meta WHERE key = ?', (SPEAKER_EDITS_PREFIX + identifier,)).fetchone() if row else None
    if not row:
        raise RequestError('녹취를 찾지 못했습니다.', 404, code='NOT_FOUND')
    return {'id': identifier, 'filename': row[0], 'mimeType': row[1], 'dialogues': json.loads(row[2]),
            'duration': row[3], 'createdAt': row[4], 'speakerEdits': json.loads(edits[0]) if edits else {}}


MARK_COLORS = {'yellow', 'orange', 'green', 'blue', 'pink'}  # 형광펜 색(화면 src/lib/speakerEdits.js 와 같게)
SPEAKER_EDITS_PREFIX = 'speaker_edits:'  # app_meta 키 — 발언 원본(transcripts.dialogues_json)은 바꾸지 않고 사용자의 화자 수정만 따로 둔다


def _clean_speaker_edits(edits):
    """화면이 보낸 화자 수정(이름 바꾸기 names · 합치기 merge · 구간 지정 assign)을 검사해 정리한다."""
    if not isinstance(edits, dict):
        raise RequestError('화자 수정 형식을 확인해 주세요.')
    clean = {}
    for field, limit in (('names', 200), ('merge', 500), ('assign', 10_000)):
        raw = edits.get(field, {})
        if not isinstance(raw, dict) or len(raw) > limit:
            raise RequestError('화자 수정 형식을 확인해 주세요.')
        for key, value in raw.items():
            if not isinstance(key, str) or not isinstance(value, str) or not key or not value or len(key) > 100 or len(value) > 100:
                raise RequestError('화자 수정 형식을 확인해 주세요.')
        clean[field] = dict(raw)
    # 글 수정(texts: 박스 id → 고친 글)과 형광펜(marks: 박스 id → [{s, e, c}]) — 쓰이지 않으면 필드를 만들지 않는다
    texts = edits.get('texts')
    if texts is not None:
        if not isinstance(texts, dict) or len(texts) > 2_000:
            raise RequestError('화자 수정 형식을 확인해 주세요.')
        for key, value in texts.items():
            if not isinstance(key, str) or not key or len(key) > 100 or not isinstance(value, str) or not value.strip() or len(value) > 60_000:
                raise RequestError('화자 수정 형식을 확인해 주세요.')
        clean['texts'] = dict(texts)
    marks = edits.get('marks')
    if marks is not None:
        if not isinstance(marks, dict) or len(marks) > 2_000:
            raise RequestError('화자 수정 형식을 확인해 주세요.')
        for key, items in marks.items():
            if not isinstance(key, str) or not key or len(key) > 100 or not isinstance(items, list) or len(items) > 200:
                raise RequestError('화자 수정 형식을 확인해 주세요.')
            for mark in items:
                ok = isinstance(mark, dict) and all(isinstance(mark.get(f), int) and not isinstance(mark.get(f), bool) for f in ('s', 'e'))
                if not ok or not 0 <= mark['s'] < mark['e'] <= 60_000 or mark.get('c') not in MARK_COLORS:
                    raise RequestError('화자 수정 형식을 확인해 주세요.')
        clean['marks'] = {key: [{'s': m['s'], 'e': m['e'], 'c': m['c']} for m in items] for key, items in marks.items()}
    return clean


def save_speaker_edits(identifier, edits):
    if not isinstance(identifier, str) or not re.fullmatch(r'[a-f0-9]{32}', identifier):
        raise RequestError('잘못된 녹취 ID입니다.')
    clean = _clean_speaker_edits(edits)
    with vault.connect() as db:
        if not db.execute('SELECT 1 FROM transcripts WHERE id = ?', (identifier,)).fetchone():
            raise RequestError('녹취를 찾지 못했습니다.', 404, code='NOT_FOUND')
        db.execute('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
                   (SPEAKER_EDITS_PREFIX + identifier, json.dumps(clean, ensure_ascii=False)))
    return {'id': identifier, 'speakerEdits': clean}


def transcript_audio(identifier):
    if not isinstance(identifier, str) or not re.fullmatch(r'[a-f0-9]{32}', identifier):
        raise RequestError('잘못된 녹취 ID입니다.')
    with vault.connect() as db:
        row = db.execute('SELECT audio, mime_type FROM transcripts WHERE id = ?', (identifier,)).fetchone()
    if not row:
        raise RequestError('녹취를 찾지 못했습니다.', 404, code='NOT_FOUND')
    return bytes(row[0]), row[1]


def cleanup_open():
    """외부 프로그램용 임시 복호화본을 지운다(앱 시작·종료 때). 뷰어가 잡고 있는 파일은 못 지우므로 오류는 무시하고 다음 기회에 지운다."""
    shutil.rmtree(OPEN_DIR, ignore_errors=True)


PHOTO_FIELDS = ('data', 'original')  # 사진 항목에서 base64 data URL 이 들어오는 필드
MEDIA_REF = re.compile(r'media:([a-f0-9]{32})')
SOURCE_ID = re.compile(r'[a-f0-9]{32}|[a-f0-9]{16}')  # 32자 = UUID(새 자료). 16자 = 옛 평문 폴더 가져오기(import_legacy_files)


def _store_media(db, head, raw):
    """사진 바이트를 media 표에 한 번만 둔다(같은 바이트·머리글이면 같은 id). → 32자리 id"""
    media_id = ids.media_id(head, raw)
    db.execute('INSERT OR IGNORE INTO media VALUES (?, ?, ?, ?, ?)', (media_id, vault.WORKSPACE_ID, head, raw, _now()))
    return media_id


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
                photo[key] = 'media:' + _store_media(db, head, raw)
        packed.append(photo)
    return dict(draft, photos=packed)


def _unpack(db, draft):
    """_pack 의 반대 — 'media:<id>' 를 원래 data URL 로 되돌려 프론트에 돌려준다."""
    for photo in draft.get('photos') or []:
        for key in PHOTO_FIELDS if isinstance(photo, dict) else ():
            found = MEDIA_REF.fullmatch(photo[key]) if isinstance(photo.get(key), str) else None
            row = db.execute('SELECT header, data FROM media WHERE id = ?', (found.group(1),)).fetchone() if found else None
            if row:  # 행이 없으면 참조를 그대로 둔다(깨진 사진). 쓰지 않는 사진은 purge_trash 가 drop_unused_media 로 지운다
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
            if db.execute('SELECT 1 FROM articles WHERE id = ? UNION ALL SELECT 1 FROM app_meta WHERE key = ?',
                          (identifier, 'purged:' + identifier)).fetchone():
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


SAVE_KINDS = ('manual', 'auto')


def _append_revision(db, identifier, body, now, kind='manual'):
    """이력에 저장본을 더한다. → 최신 revision 번호
    - manual(수동 저장): 저장 이력에 남는 버전. 바로 앞 줄이 자동 임시 저장이면 그 줄을 이 버전으로 올린다.
    - auto(자동 임시 저장): 이력을 늘리지 않고 '마지막 수동 저장 뒤의 한 칸'을 계속 덮어쓴다 — 앱이 갑자기 꺼져도
      이어서 작업할 수 있게 하는 작업본이다. 저장 이력·보관소에는 보이지 않는다.
    마지막 줄과 내용이 같으면 아무것도 늘리지 않는다."""
    last = db.execute('SELECT revision_no, draft_json, kind, id FROM article_revisions WHERE article_id = ? '
                      'ORDER BY revision_no DESC LIMIT 1', (identifier,)).fetchone()
    if last and last[1] == body and (kind == 'auto' or last[2] == 'manual'):
        return last[0]
    # 고정본(스냅샷)이 가리키는 작업본은 덮어쓰지 않는다 — 그 뒤 저장은 새 줄로
    pinned = last and db.execute('SELECT 1 FROM article_snapshots WHERE revision_id = ? LIMIT 1', (last[3],)).fetchone()
    if last and last[2] == 'auto' and not pinned:
        if kind == 'manual':
            before = db.execute("SELECT revision_no, draft_json FROM article_revisions WHERE article_id = ? AND kind = 'manual' "
                                'ORDER BY revision_no DESC LIMIT 1', (identifier,)).fetchone()
            if before and before[1] == body:  # 수동 저장본과 같아졌다 → 작업본은 필요 없다
                db.execute('DELETE FROM article_revisions WHERE article_id = ? AND revision_no = ?', (identifier, last[0]))
                return before[0]
        db.execute('UPDATE article_revisions SET draft_json = ?, created_at = ?, kind = ? WHERE article_id = ? AND revision_no = ?',
                   (body, now, kind, identifier, last[0]))
        return last[0]
    revision = (last[0] if last else 0) + 1
    db.execute('INSERT INTO article_revisions (article_id, revision_no, draft_json, created_at, id, kind) VALUES (?, ?, ?, ?, ?, ?)',
               (identifier, revision, body, now, ids.revision_uuid(identifier, revision), kind))
    db.execute('DELETE FROM article_revisions WHERE article_id = ? AND revision_no <= ?',
               (identifier, revision - MAX_REVISIONS))
    return revision


def _check_draft(data):
    """저장 요청 검사 → (draft, identifier, expected)."""
    draft = data.get('draft')
    if not isinstance(draft, dict) or not isinstance(draft.get('bodyHtml'), str):
        raise RequestError('저장할 원고를 확인해 주세요.')
    identifier = draft.get('articleId') or uuid.uuid4().hex
    if not isinstance(identifier, str) or not re.fullmatch(r'[a-f0-9]{32}', identifier):
        raise RequestError('잘못된 원고 ID입니다.')
    # 낙관적 동시성(계약 expected_revision_no): 주면 지금 최신 이력 번호와 같아야 저장한다. 0 = 아직 없는 원고.
    # 안 주면 예전처럼 그냥 저장한다(지금 화면은 보내지 않는다).
    expected = data.get('expectedRevisionNo')
    if expected is not None and (isinstance(expected, bool) or not isinstance(expected, int) or expected < 0):
        raise RequestError('expectedRevisionNo 는 0 이상의 정수여야 합니다.')
    return draft, identifier, expected


def _save_in(db, draft, identifier, expected, kind, now, replace_latest=False):
    """한 트랜잭션 안에서 원고를 저장한다 → (revision_no, 저장한 draft_json). 보관소에서 지운 기사에는 저장하지 않는다.
    replace_latest=True 면 같은 편집 세션의 최신 이력 줄을 새 줄 없이 덮어쓴다(스냅샷이 가리키는 줄은 절대 덮어쓰지 않는다)."""
    if is_deleted(db, identifier):
        raise RequestError('보관소에서 삭제한 기사입니다. 새 기사로 작성해 주세요.', 409, code='ARTICLE_DELETED')
    if expected is not None:
        current = db.execute('SELECT max(revision_no) FROM article_revisions WHERE article_id = ?', (identifier,)).fetchone()[0] or 0
        if current != expected:
            raise RequestError(f'다른 곳에서 먼저 저장된 원고입니다(현재 {current}번 저장본). 최신 원고를 다시 불러온 뒤 저장해 주세요.',
                               409, code='REVISION_CONFLICT')
    # 상태(status)는 원고에 저장하지 않는다 — 코어가 송고본에서 계산한다(article_state). 화면이 보낸 값은 버린다
    kept = {key: value for key, value in draft.items() if key != 'status'}
    body = json.dumps(_pack(db, dict(kept, articleId=identifier, savedAt=None)), ensure_ascii=False, sort_keys=True)
    db.execute('INSERT OR IGNORE INTO articles VALUES (?, ?, ?, ?)', (identifier, vault.WORKSPACE_ID, now, now))
    latest = db.execute('SELECT revision_no, draft_json, id, kind FROM article_revisions WHERE article_id = ? '
                        'ORDER BY revision_no DESC LIMIT 1', (identifier,)).fetchone() if replace_latest else None
    can_replace = latest and not db.execute(
        'SELECT 1 FROM article_snapshots WHERE revision_id = ? LIMIT 1', (latest[2],)).fetchone()
    if can_replace:
        # 수동 저장본은 임시 저장으로 덮어써도 수동 저장으로 남긴다(저장 이력에서 사라지지 않게)
        new_kind = 'manual' if 'manual' in (kind, latest[3]) else 'auto'
        if latest[1] != body or latest[3] != new_kind:
            db.execute('UPDATE article_revisions SET draft_json = ?, created_at = ?, kind = ? WHERE article_id = ? AND revision_no = ?',
                       (body, now, new_kind, identifier, latest[0]))
        revision = latest[0]
    else:
        revision = _append_revision(db, identifier, body, now, kind)
    db.execute('UPDATE articles SET updated_at = ? WHERE id = ?', (now, identifier))
    if kind == 'manual':
        db.execute('INSERT OR IGNORE INTO article_first_saved VALUES (?, ?)', (identifier, now))
    return revision, body


def save_article(data):
    draft, identifier, expected = _check_draft(data)
    kind = data.get('kind', 'manual')  # 화면의 자동 저장은 'auto', 저장 버튼은 'manual'(값이 없으면 예전처럼 이력에 남김)
    if kind not in SAVE_KINDS:
        raise RequestError("kind 는 'manual' 또는 'auto' 입니다.")
    replace_latest = data.get('replaceLatest', False)
    if not isinstance(replace_latest, bool):
        raise RequestError('replaceLatest 는 true/false 여야 합니다.')
    now = _now()
    with SAVE_LOCK, vault.connect() as db:
        revision, _ = _save_in(db, draft, identifier, expected, kind, now, replace_latest)
        first = first_saved_at(db, identifier)
    return {'saved': True, 'articleId': identifier, 'revisionNo': revision, 'kind': kind, 'savedAt': now, 'firstSavedAt': first,
            'fileName': identifier + '.json', 'folder': '암호화 저장소'}  # fileName·folder 는 이전 응답과의 호환용 표시값


def _published_row(db, article_id):
    return db.execute('SELECT revision_no, first_published_at, published_at, publish_count, draft_json FROM article_published '
                      'WHERE article_id = ?', (article_id,)).fetchone()


def first_saved_at(db, article_id):
    """처음 수동 저장한 시각(없으면 None) — 송고 전 미리보기의 '입력'."""
    row = db.execute('SELECT first_saved_at FROM article_first_saved WHERE article_id = ?', (article_id,)).fetchone()
    return row[0] if row else None


def published_info(db, article_id):
    """기사의 발행본 정보(본문 제외) — 발행한 적 없으면 None."""
    row = _published_row(db, article_id)
    if not row:
        return None
    draft = json.loads(row[4])
    return {'revisionNo': row[0], 'firstPublishedAt': row[1], 'publishedAt': row[2], 'publishCount': row[3],
            'title': draft.get('title') or '', 'subtitle': draft.get('subtitle') or '', 'excerpt': _plain(draft)[:120]}


def _last_manual(db, article_id):
    return db.execute("SELECT revision_no, created_at, draft_json FROM article_revisions WHERE article_id = ? AND kind = 'manual' "
                      'ORDER BY revision_no DESC LIMIT 1', (article_id,)).fetchone()


def _manual_summary(manual):
    if not manual:
        return None
    saved = json.loads(manual[2])
    return {'revisionNo': manual[0], 'savedAt': manual[1], 'title': saved.get('title') or '',
            'subtitle': saved.get('subtitle') or '', 'content': saved.get('content') or _plain(saved)}


def edited_after_publish(db, article_id):
    """발행한 뒤 수동 저장한 내용이 발행본과 다른가(보관소 '발행 후 수정 중')."""
    row = _published_row(db, article_id)
    manual = _last_manual(db, article_id)
    return bool(row and manual and manual[2] != row[4])


STATE_LABELS = {'draft': '작성 중', 'published': '송고됨', 'editing': '수정 중'}


def article_state(db, article_id):
    """기사 상태의 유일한 출처: draft(송고 전) | published(송고본과 마지막 저장본이 같음) | editing(송고 뒤 고쳐 저장함)."""
    if not _published_row(db, article_id):
        return 'draft'
    return 'editing' if edited_after_publish(db, article_id) else 'published'


def publish_article(data):
    """송고(화면 이름, 예전 "CMS 최종 발행") = **수동 저장 + 송고본(발행본) 갱신**(한 트랜잭션). 출고는 동아일보 CMS 에서 따로 한다.
    발행본은 기사마다 하나다. 다시 발행하면 기존 발행본을 이 판으로 덮어쓰고 발행 시각(published_at)을 새로 적는다.
    처음 발행 시각(first_published_at)과 발행 횟수(publish_count)는 남긴다 — 언제 처음 나갔는지·몇 번 고쳐 냈는지 확인용.
    → {published: {...}, articleId, revisionNo, savedAt, republished}"""
    draft, identifier, expected = _check_draft(data)
    now = _now()
    with SAVE_LOCK, vault.connect() as db:
        revision, body = _save_in(db, draft, identifier, expected, 'manual', now)
        before = _published_row(db, identifier)
        if before:
            db.execute('UPDATE article_published SET revision_no = ?, draft_json = ?, published_at = ?, publish_count = publish_count + 1 '
                       'WHERE article_id = ?', (revision, body, now, identifier))
        else:
            db.execute('INSERT INTO article_published (article_id, revision_no, draft_json, first_published_at, published_at, publish_count) '
                       'VALUES (?, ?, ?, ?, ?, 1)', (identifier, revision, body, now, now))
        info = published_info(db, identifier)
        first = first_saved_at(db, identifier)
    return {'published': info, 'articleId': identifier, 'revisionNo': revision, 'savedAt': now, 'firstSavedAt': first,
            'republished': bool(before)}


ARTICLE_VERSIONS = ('saved', 'published')


def get_article(article_id, version='saved', photo_refs=False):
    """보관소에서 '수정'을 누른 기사를 편집기로 연다(읽기만 하고 아무것도 바꾸지 않는다).
    - saved: 마지막 수동 저장본(보관소 '작성 중'에 보이는 판). 수동 저장이 없으면 최신 임시 저장본
    - published: 발행본
    응답 모양은 latest_article 과 같다."""
    article_id = _article_id(article_id)
    if version not in ARTICLE_VERSIONS:
        raise RequestError("version 은 'saved' 또는 'published' 입니다.")
    with vault.connect() as db:
        if is_deleted(db, article_id):
            raise _not_found('보관소에서 삭제한 기사입니다.')
        manual = _last_manual(db, article_id)
        pub = _published_row(db, article_id)
        if version == 'published':
            if not pub:
                raise _not_found('이 기사는 아직 발행본이 없습니다.')
            body, at = pub[4], pub[2]
        elif manual:
            body, at = manual[2], manual[1]
        else:
            row = db.execute('SELECT draft_json, created_at FROM article_revisions WHERE article_id = ? ORDER BY revision_no DESC LIMIT 1',
                             (article_id,)).fetchone()
            if not row:
                raise _not_found('기사를 찾지 못했습니다.')
            body, at = row
        latest_rev = db.execute('SELECT max(revision_no) FROM article_revisions WHERE article_id = ?', (article_id,)).fetchone()[0] or 0
        return {'draft': _full_draft(db, body, at, latest_rev, unpack_photos=not photo_refs), 'version': version,
                'revisionNo': latest_rev,
                # 연 판이 마지막 수동 저장본과 다르면(발행 뒤 저장한 수정본이 따로 있는 경우) 화면이 '저장하지 않은 변경'으로 알린다
                'revisionKind': 'manual' if manual and manual[2] == body else 'auto',
                'lastManual': _manual_summary(manual), 'published': published_info(db, article_id),
                'firstSavedAt': first_saved_at(db, article_id),
                'editedAfterPublish': bool(pub and body != pub[4])}


def is_deleted(db, article_id):
    return bool(db.execute('SELECT 1 FROM article_deleted WHERE article_id = ?', (article_id,)).fetchone())


TRASH_DAYS = 30


def _purge_at(deleted_at):
    return (datetime.datetime.fromisoformat(deleted_at) + datetime.timedelta(days=TRASH_DAYS)).isoformat()


def delete_article(article_id):
    """보관소에서 기사 지우기 = 휴지통으로 옮기기 → {deleted, articleId, purgeAt}.
    보관소·이어서 작업·자료 사용처에서 빠지고 더 저장되지 않는다. TRASH_DAYS 동안 되살릴 수 있고, 지나면 purge_trash 가 영구 삭제한다."""
    article_id = _article_id(article_id)
    with SAVE_LOCK, vault.connect() as db:
        if not db.execute('SELECT 1 FROM articles WHERE id = ?', (article_id,)).fetchone():
            raise _not_found('기사를 찾지 못했습니다.')
        db.execute('INSERT OR IGNORE INTO article_deleted VALUES (?, ?)', (article_id, _now()))
        deleted_at = db.execute('SELECT deleted_at FROM article_deleted WHERE article_id = ?', (article_id,)).fetchone()[0]
    return {'deleted': True, 'articleId': article_id, 'purgeAt': _purge_at(deleted_at)}


def list_trash():
    """휴지통 → {articles: [{articleId, title, deletedAt, purgeAt}]} (최근 지운 순)."""
    with vault.connect() as db:
        rows = db.execute('SELECT d.article_id, d.deleted_at, (SELECT draft_json FROM article_revisions WHERE article_id = d.article_id '
                          'ORDER BY revision_no DESC LIMIT 1) FROM article_deleted d ORDER BY d.deleted_at DESC').fetchall()
    return {'articles': [{'articleId': article_id, 'title': (json.loads(body).get('title') if body else '') or '',
                          'deletedAt': at, 'purgeAt': _purge_at(at)} for article_id, at, body in rows]}


def restore_deleted(article_id):
    """휴지통에서 되살린다 → {restored, articleId}. 이력·송고본·고정본은 지운 적이 없어 그대로 돌아온다."""
    article_id = _article_id(article_id)
    with SAVE_LOCK, vault.connect() as db:
        if not is_deleted(db, article_id):
            raise _not_found('휴지통에 없는 기사입니다.')
        db.execute('DELETE FROM article_deleted WHERE article_id = ?', (article_id,))
    return {'restored': True, 'articleId': article_id}


def purge_trash(now=None):
    """휴지통에 TRASH_DAYS 넘게 있던 기사를 영구 삭제한다(이력·송고본·고정본까지, 2026-10-18 결정 D1).
    이어서 어떤 원고·고정본·미디어 자산도 쓰지 않는 사진을 지운다. → 영구 삭제한 기사 id 목록"""
    cutoff = ((now or datetime.datetime.now(datetime.timezone.utc)) - datetime.timedelta(days=TRASH_DAYS)).isoformat()
    with SAVE_LOCK, vault.connect() as db:
        gone = [row[0] for row in db.execute('SELECT article_id FROM article_deleted WHERE deleted_at <= ?', (cutoff,))]
        if not gone:
            return []
        marks = ','.join('?' * len(gone))
        # 고정본은 평소 고치거나 지울 수 없다(트리거). 영구 삭제 때만 같은 트랜잭션 안에서 잠시 풀고 바로 되돌린다
        db.execute('DROP TRIGGER IF EXISTS article_snapshots_no_delete')
        try:
            for table in ('article_snapshots', 'article_revisions', 'article_published', 'article_first_saved', 'article_deleted'):
                db.execute(f'DELETE FROM {table} WHERE article_id IN ({marks})', gone)
            db.execute(f'DELETE FROM articles WHERE id IN ({marks})', gone)
            # 예전 평문 원본(import_legacy_files)이 남아 있어도 다음 로그인 때 되살아나지 않게 표시를 남긴다
            db.executemany('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [('purged:' + a, cutoff) for a in gone])
        finally:
            db.execute(vault.SNAPSHOT_NO_DELETE)
        drop_unused_media(db)
    return gone


def drop_unused_media(db):
    """어떤 원고(이력·송고본)·고정본·미디어 자산도 가리키지 않는 사진(media)을 지운다 → 지운 수.
    shortcut: 저장된 원고 JSON 을 전부 훑는다(기사 수백 건까지), 수천 건이면 사진 참조 표를 따로 둔다."""
    used = {row[0] for row in db.execute('SELECT media_id FROM media_assets')}
    for (text,) in db.execute('SELECT draft_json FROM article_revisions UNION ALL SELECT draft_json FROM article_published '
                              'UNION ALL SELECT body_html FROM article_snapshots'):
        used.update(MEDIA_REF.findall(text))
    stale = [(row[0],) for row in db.execute('SELECT id FROM media') if row[0] not in used]
    db.executemany('DELETE FROM media WHERE id = ?', stale)
    return len(stale)


def latest_revisions(db, limit=None, manual=False, article_id=None):
    """기사마다 **최신 저장본** 한 줄 (article_id, created_at, updated_at, revision_no, draft_json) — 최근 수정순.
    "기사가 지금 무엇을 쓰는가"(자료 사용처·읽기 모델·이어서 작업)는 모두 이 한 곳에서 읽는다.
    manual=True 면 마지막 **수동 저장본**(보관소 '작성 중'에 보이는 판). 수동 저장이 아직 없는 기사는 최신 임시 저장본."""
    pick = ('(SELECT revision_no FROM article_revisions WHERE article_id = a.id '
            "ORDER BY kind = 'manual' DESC, revision_no DESC LIMIT 1)") if manual else \
        '(SELECT max(revision_no) FROM article_revisions WHERE article_id = a.id)'
    sql = ('SELECT a.id, a.created_at, a.updated_at, r.revision_no, r.draft_json FROM articles a '
           'JOIN article_revisions r ON r.article_id = a.id AND r.revision_no = ' + pick
           + ' WHERE a.id NOT IN (SELECT article_id FROM article_deleted)')  # 보관소에서 지운 기사는 어디에도 보이지 않는다
    params = []
    if article_id is not None:
        sql += ' AND a.id = ?'
        params.append(_article_id(article_id))
    sql += ' ORDER BY a.updated_at DESC'
    if limit:
        sql += ' LIMIT ?'
        params.append(limit)
    return db.execute(sql, params).fetchall()


def draft_source_ids(draft):
    """원고가 쓰는 자료 id — 올린 자료(sources[].id)와 출처로 연결한 자료(linkedSources)."""
    found = {s.get('id') for s in draft.get('sources') or [] if isinstance(s, dict)}
    found |= set(draft.get('linkedSources') or [])
    return {i for i in found if isinstance(i, str)}


def latest_article(photo_refs=False, article_id=None):
    """가장 최근에 저장된 원고(앱을 열면 이어서 작업). 취재자료 본문은 sources 테이블에서 다시 붙인다.
    photo_refs=True 면 사진을 data URL 로 되돌리지 않고 'media:<id>' 참조 그대로 준다 — 화면이 사진 바이트를
    media_file 로 따로 받는다(사진 몇 장이면 응답이 수십 MB 가 되던 것을 피한다)."""
    with vault.connect() as db:
        rows = latest_revisions(db, limit=1, article_id=article_id)
        if not rows:
            if article_id is not None:
                raise RequestError('원고를 찾지 못했습니다.', 404)
            return {'draft': None}
        # 이어서 작업할 원고는 가장 최근 것(임시 저장 포함). 그게 수동 저장 뒤의 임시 저장본이면 화면이 '저장하지 않은 변경'을 알린다
        article_id = rows[0][0]
        kind = db.execute('SELECT kind FROM article_revisions WHERE article_id = ? AND revision_no = ?', (article_id, rows[0][3])).fetchone()[0]
        pub = _published_row(db, article_id)
        return {'draft': _full_draft(db, rows[0][4], rows[0][2], rows[0][3], unpack_photos=not photo_refs),
                'revisionKind': kind, 'lastManual': _manual_summary(_last_manual(db, article_id)),
                'published': published_info(db, article_id), 'editedAfterPublish': bool(pub and pub[4] != rows[0][4]),
                'firstSavedAt': first_saved_at(db, article_id)}


def media_file(media_id):
    """암호화 저장소의 사진 바이트 → (bytes, mime). 원고 사진의 'media:<id>' 참조를 화면이 그릴 때 쓴다."""
    if not isinstance(media_id, str) or not re.fullmatch(r'[a-f0-9]{32}', media_id):
        raise RequestError('잘못된 사진 ID입니다.')
    with vault.connect() as db:
        row = db.execute('SELECT header, data FROM media WHERE id = ?', (media_id,)).fetchone()
    if not row:
        raise RequestError('사진을 찾지 못했습니다.', 404, code='NOT_FOUND')
    mime = re.fullmatch(r'data:([\w.+-]+/[\w.+-]+)(?:;[^,]*)?', row[0])
    return bytes(row[1]), mime.group(1) if mime else 'application/octet-stream'


def _full_draft(db, draft_json, saved_at, revision_no=None, unpack_photos=True):
    """이력 한 줄 → 화면이 쓰는 원고(사진 되돌리기 + 취재자료 본문 붙이기)."""
    draft = dict(json.loads(draft_json), savedAt=saved_at)
    if isinstance(draft.get('articleId'), str) and re.fullmatch(r'[a-f0-9]{32}', draft['articleId']):
        draft['status'] = STATE_LABELS[article_state(db, draft['articleId'])]  # 옛 원고에 저장된 status 도 이 값으로 덮는다
    if revision_no is not None:
        draft['revisionNo'] = revision_no
    if unpack_photos:
        draft = _unpack(db, draft)
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
    """미리보기용 본문 글자(content 가 없는 옛 원고는 bodyHtml 에서 글자만 — 고정본 body_text 와 같은 규칙)."""
    text = draft.get('content')
    return text if isinstance(text, str) else _text_of(draft.get('bodyHtml'))


def _legacy_rows(db, article_id):
    """수동 저장 도입 전에 쌓인 이력(그때는 고칠 때마다 자동으로 남았다) 중 지워도 되는 줄의 번호.
    기사가 비지 않도록, 도입 뒤 저장본이 하나도 없으면 옛 이력 중 마지막 하나는 남긴다. 송고본은 따로 복사돼 있어 영향 없음."""
    row = db.execute("SELECT value FROM app_meta WHERE key = 'manual_save_since'").fetchone()
    if not row:
        return []
    old = [r[0] for r in db.execute('SELECT revision_no FROM article_revisions WHERE article_id = ? AND created_at < ? '
                                    'ORDER BY revision_no', (article_id, row[0])).fetchall()]
    newer = db.execute('SELECT count(*) FROM article_revisions WHERE article_id = ? AND created_at >= ?', (article_id, row[0])).fetchone()[0]
    return old if newer else old[:-1]


def prune_legacy_revisions(article_id):
    """저장 이력에서 옛 자동 저장 이력을 지운다(사용자가 '정리'를 눌렀을 때만). → {deleted, articleId}"""
    article_id = _article_id(article_id)
    with SAVE_LOCK, vault.connect() as db:
        numbers = _legacy_rows(db, article_id)
        db.executemany('DELETE FROM article_revisions WHERE article_id = ? AND revision_no = ?', [(article_id, n) for n in numbers])
    return {'deleted': len(numbers), 'articleId': article_id}


def list_revisions(article_id):
    """원고의 저장 이력(최신이 위). 목록용 요약만 — 본문 전체와 사진은 싣지 않는다."""
    article_id = _article_id(article_id)
    with vault.connect() as db:
        rows = db.execute('SELECT revision_no, id, created_at, draft_json FROM article_revisions WHERE article_id = ? '
                          "AND kind = 'manual' ORDER BY revision_no DESC", (article_id,)).fetchall()  # 저장 이력 = 수동 저장만
        legacy = len(_legacy_rows(db, article_id))
    out = []
    for number, uuid_, created, body in rows:
        draft = json.loads(body)
        text = _plain(draft)
        out.append({'revisionNo': number, 'id': uuid_, 'createdAt': created, 'title': draft.get('title') or '',
                    'subtitle': draft.get('subtitle') or '', 'excerpt': text[:120], 'chars': len(text),
                    'photoCount': len(draft.get('photos') or []), 'sourceCount': len(draft.get('sources') or [])})
    return {'articleId': article_id, 'revisions': out, 'legacyCount': legacy}  # legacyCount: 정리할 수 있는 옛 자동 저장 이력 수


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
        latest = _append_revision(db, article_id, body, now, 'manual')  # 복원은 사용자가 고른 판이므로 수동 저장으로 남긴다
        db.execute('UPDATE articles SET updated_at = ? WHERE id = ?', (now, article_id))
        draft = _full_draft(db, body, now, latest)
    return {'restored': True, 'articleId': article_id, 'fromRevision': revision_no, 'revisionNo': latest, 'draft': draft}


class _TextParser(HTMLParser):
    """integration/core_contract.py 의 TextParser 를 옮긴 것: 취소선(s·del)·사진 설명(figure)·script·style 은 뺀다."""
    SKIP = ('script', 'style', 's', 'del', 'figure')

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        if not self.skip and tag in ('p', 'div', 'br', 'li'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        elif not self.skip and tag in ('p', 'div', 'li'):
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def _text_of(html):
    """계약 body_text — bodyHtml 의 글자만(core_contract.text_of 와 같은 결과)."""
    parser = _TextParser()
    parser.feed(html or '')
    return re.sub(r'\n{2,}', '\n', ''.join(parser.parts)).strip()


def content_hash(title, body_html):
    """스냅샷 내용 해시. **레시피를 바꾸지 말 것** — 나중 실행·다른 시스템이 같은 값을 재현해야 한다.

        sha256( json.dumps({"body_html": body_html, "title": title},
                           ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8") ).hexdigest()

    즉 키를 정렬한 공백 없는 JSON 객체(한글은 \\u 이스케이프 없이 그대로)를 UTF-8 로 인코딩해 SHA-256, 소문자 16진수 64자.
    예: content_hash('제목', '<p>본문</p>') 은 '{"body_html":"<p>본문</p>","title":"제목"}' 의 SHA-256 이다."""
    canonical = json.dumps({'body_html': body_html, 'title': title}, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


SNAPSHOT_FIELDS = ('id', 'workspace_id', 'article_id', 'revision_id', 'revision_no', 'title', 'body_html', 'body_text',
                   'content_hash', 'created_at', 'subtitle', 'url')


def _snapshot(row):
    return dict(zip(SNAPSHOT_FIELDS, row))


def _not_found(message):
    return RequestError(message, 404, code='NOT_FOUND')


def create_snapshot(article_id, revision_id=None):
    """저장 이력 한 줄을 고정본(계약 ArticleSnapshot)으로 만든다. revision_id(UUID)를 안 주면 최신 이력.
    제목·본문·본문 글자를 **복사해** 두므로 이력이 정리돼도 남는다. 고정본은 고칠 수 없다(트리거).
    최신 고정은 제목·HTML·부제·출처가 같으면 플랫폼 초안 저장 이력과 무관하게 재사용한다.
    명시적 revision_id 는 그 이력의 고정본을 만든다. 해시 레시피·UUID·불변 트리거는 유지한다."""
    article_id = _article_id(article_id)
    if revision_id is not None:
        try:
            revision_id = ids.uuid_text(revision_id)
        except ids.IdError:
            raise RequestError('잘못된 저장 이력 ID입니다.')
    with SAVE_LOCK, vault.connect() as db:
        if not db.execute('SELECT 1 FROM articles WHERE id = ? AND id NOT IN (SELECT article_id FROM article_deleted)', (article_id,)).fetchone():
            raise _not_found('기사가 삭제되었거나 존재하지 않습니다.')
        if revision_id is None:
            row = db.execute('SELECT id, revision_no, draft_json FROM article_revisions WHERE article_id = ? '
                             'ORDER BY revision_no DESC LIMIT 1', (article_id,)).fetchone()
        else:  # 이력 ID 와 원고가 함께 맞아야 한다(다른 원고의 이력으로는 만들 수 없다)
            row = db.execute('SELECT id, revision_no, draft_json FROM article_revisions WHERE id = ? AND article_id = ?',
                             (revision_id, article_id)).fetchone()
        if not row:
            raise _not_found('고정본을 만들 저장 이력을 찾지 못했습니다. 오래된 이력은 자동으로 정리됩니다.')
        draft = json.loads(row[2])
        title = draft.get('title') if isinstance(draft.get('title'), str) else ''
        body_html = draft.get('bodyHtml') if isinstance(draft.get('bodyHtml'), str) else ''
        digest = content_hash(title, body_html)
        subtitle = draft.get('subtitle') if isinstance(draft.get('subtitle'), str) else ''
        url = draft.get('url') if isinstance(draft.get('url'), str) else ''
        query = 'SELECT ' + ', '.join(SNAPSHOT_FIELDS) + ' FROM article_snapshots '
        # v4에서 이미 고정한 이력은 metadata를 새 값으로 덮어쓸 수 없다. 저장 후 다시 고정해야 한다.
        pinned = db.execute(query + 'WHERE article_id = ? AND revision_id = ? AND content_hash = ?',
                            (article_id, row[0], digest)).fetchone()
        if pinned:
            return _snapshot(pinned)
        # 플랫폼 초안만 저장한 새 이력은 원문을 바꾸지 않는다. 자동 최신 고정은 같은 원문을 재사용한다.
        # 명시적으로 고른 과거 이력은 기존 revision_id 계약대로 그 이력에 묶는다.
        where = 'WHERE article_id = ? AND content_hash = ? AND subtitle = ? AND url = ?'
        args = (article_id, digest, subtitle, url)
        if revision_id is not None:
            where += ' AND revision_id = ?'
            args += (row[0],)
        existing = db.execute(query + where + ' ORDER BY created_at DESC LIMIT 1', args).fetchone()
        if existing:
            return _snapshot(existing)
        values = (str(uuid.uuid4()), vault.WORKSPACE_ID, article_id, row[0], row[1], title, body_html, _text_of(body_html),
                  digest, _now(), subtitle, url)
        db.execute('INSERT INTO article_snapshots (' + ', '.join(SNAPSHOT_FIELDS) + ') VALUES (' + ','.join('?' for _ in values) + ')',
                   values)
    return _snapshot(values)


def get_snapshot(snapshot_id):
    """고정본 한 건(본문 포함). 읽기 전용."""
    try:
        snapshot_id = ids.uuid_text(snapshot_id)
    except ids.IdError:
        raise RequestError('잘못된 고정본 ID입니다.')
    with vault.connect() as db:
        row = db.execute('SELECT ' + ', '.join(SNAPSHOT_FIELDS) + ' FROM article_snapshots WHERE id = ?',
                         (snapshot_id,)).fetchone()
    if not row:
        raise _not_found('해당 고정본을 찾지 못했습니다.')
    return _snapshot(row)


def list_snapshots(article_id):
    """원고의 고정본 목록(최신이 위). 목록용 요약만 — 본문(body_html·body_text)은 싣지 않는다."""
    article_id = _article_id(article_id)
    with vault.connect() as db:
        rows = db.execute('SELECT ' + ', '.join(SNAPSHOT_FIELDS) + ' FROM article_snapshots WHERE article_id = ? '
                          'ORDER BY created_at DESC, revision_no DESC', (article_id,)).fetchall()
    out = []
    for row in rows:
        snap = _snapshot(row)
        text = snap.pop('body_text')
        snap.pop('body_html')
        out.append(dict(snap, excerpt=text[:120], chars=len(text)))
    return {'articleId': article_id, 'snapshots': out}


def save_source(filename, raw, text):
    """취재자료 원본과 추출 텍스트를 암호화 저장소에 둔다. 같은 파일(내용 해시)은 한 번만 저장된다.
    파일 이름은 사용자가 알아보도록 원래 이름을 쓴다(경로 문자만 걸러 낸다)."""
    source_id = ids.source_id(raw)
    safe = re.sub(r'[\\/:*?"<>|\x00-\x1f]', '_', filename.replace('\\', '/').rsplit('/', 1)[-1]).strip(' .') or 'source'
    with SAVE_LOCK, vault.connect() as db:  # ponytail: 원본(최대 30MB)을 DB 안에 둔다. 커져서 느려지면 암호화 파일로 분리
        previous = db.execute('SELECT text FROM sources WHERE id = ?', (source_id,)).fetchone()
        db.execute('INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET text = excluded.text',
                   (source_id, vault.WORKSPACE_ID, safe, text, raw, _now()))
        if previous and previous[0] != text:
            db.execute("UPDATE source_index SET state = 'pending', chunk_count = 0, error_code = NULL, updated_at = ? "
                       'WHERE source_id = ? AND workspace_id = ?', (_now(), source_id, vault.WORKSPACE_ID))
            db.execute('DELETE FROM source_chunks WHERE source_id = ? AND workspace_id = ?',
                       (source_id, vault.WORKSPACE_ID))
    return source_id, '암호화 저장소/' + safe


def _original(source_id):
    """보관한 취재자료 원본 (이름, 바이트). ID 는 32자 hex(UUID). 16자 hex 는 옛 평문 폴더에서 가져온 자료용으로만 받는다."""
    if not isinstance(source_id, str) or not SOURCE_ID.fullmatch(source_id):
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
    if sys.platform == 'win32':  # os.name 이 아니라 sys.platform — 테스트가 윈도우 분기를 흉내 내도 경로 처리(pathlib)는 그대로다
        os.startfile(original)  # noqa: S606 — 우리가 만든 임시 파일만(ID 검증)
    else:
        subprocess.Popen(['open' if sys.platform == 'darwin' else 'xdg-open', str(original)])
    return {'opened': True, 'path': str(original)}
