"""원고·취재자료를 사용자 문서 폴더(내 문서\\AI Newsroom)에 저장한다(app_paths)."""
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import threading
import uuid

from . import config  # noqa: F401  — sys.path 에 app/ 를 올린다(app_paths)
from app_paths import ARTICLES_DIR, SOURCES_DIR  # noqa: E402

from .errors import RequestError

SAVE_LOCK = threading.Lock()


def save_article(data):
    draft = data.get('draft')
    if not isinstance(draft, dict) or not isinstance(draft.get('bodyHtml'), str):
        raise RequestError('저장할 원고를 확인해 주세요.')
    identifier = draft.get('articleId') or uuid.uuid4().hex
    if not isinstance(identifier, str) or not re.fullmatch(r'[a-f0-9]{32}', identifier):
        raise RequestError('잘못된 원고 ID입니다.')
    draft = dict(draft, articleId=identifier, savedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
    ARTICLES_DIR.mkdir(parents=True, exist_ok=True)
    target = ARTICLES_DIR / (identifier + '.json')
    temp = ARTICLES_DIR / (identifier + '.tmp')
    with SAVE_LOCK:
        temp.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding='utf-8')
        temp.replace(target)
    return {'saved': True, 'articleId': identifier, 'fileName': target.name, 'folder': str(ARTICLES_DIR)}


def latest_article():
    """가장 최근에 저장된 원고(앱을 열면 이어서 작업). 취재자료 본문은 sources/<id>/text.txt 에서 다시 붙인다."""
    files = sorted(ARTICLES_DIR.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True) if ARTICLES_DIR.is_dir() else []
    for path in files:
        try:
            draft = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue  # 깨진 파일은 건너뛰고 그다음 최근 원고
        for source in draft.get('sources') or []:
            sid = source.get('id')
            text = SOURCES_DIR / sid / 'text.txt' if isinstance(sid, str) and re.fullmatch(r'[a-f0-9]{16}', sid) else None
            if text and text.is_file():
                source['text'] = text.read_text(encoding='utf-8')
        return {'draft': draft}
    return {'draft': None}


def save_source(filename, raw, text):
    """취재자료 원본과 추출 텍스트를 sources/<내용 해시>/ 에 둔다. 같은 파일은 한 번만 저장된다.
    파일 이름은 사용자가 탐색기에서 알아보도록 원래 이름을 쓴다(경로 문자만 걸러 낸다)."""
    source_id = hashlib.sha1(raw).hexdigest()[:16]
    safe = re.sub(r'[\\/:*?"<>|\x00-\x1f]', '_', filename.replace('\\', '/').rsplit('/', 1)[-1]).strip(' .') or 'source'
    folder = SOURCES_DIR / source_id
    folder.mkdir(parents=True, exist_ok=True)
    original = folder / safe
    if not original.exists():
        original.write_bytes(raw)
    (folder / 'text.txt').write_text(text, encoding='utf-8')
    return source_id, str(original)


def _original(source_id):
    """보관한 취재자료 원본 경로. ID 는 16자 hex 만 받는다(경로 조작 방지)."""
    if not isinstance(source_id, str) or not re.fullmatch(r'[a-f0-9]{16}', source_id):
        raise RequestError('잘못된 자료 ID입니다.')
    folder = SOURCES_DIR / source_id
    originals = [p for p in folder.glob('*') if p.is_file() and p.name != 'text.txt'] if folder.is_dir() else []
    if not originals:
        raise RequestError('보관된 원본 파일을 찾지 못했습니다.', 404)
    return originals[0]


def source_file(source_id):
    """앱 안 뷰어용 원본 바이트 → (bytes, mime)."""
    original = _original(source_id)
    mime = {'.pdf': 'application/pdf'}.get(original.suffix.lower(), 'application/octet-stream')
    return original.read_bytes(), mime


def open_source(data):
    """보관한 취재자료 원본을 이 PC 의 기본 프로그램(PDF 뷰어·한글 등)으로 연다. payload: {sourceId}"""
    original = _original(data.get('sourceId'))
    if os.name == 'nt':
        os.startfile(original)  # noqa: S606 — 우리가 저장한 파일만(ID 검증)
    else:
        subprocess.Popen(['open' if sys.platform == 'darwin' else 'xdg-open', str(original)])
    return {'opened': True, 'path': str(original)}
