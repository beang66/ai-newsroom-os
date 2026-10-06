"""원고·취재자료를 사용자 문서 폴더(내 문서\\AI Newsroom)에 저장한다(app_paths)."""
import datetime
import hashlib
import json
import re
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
