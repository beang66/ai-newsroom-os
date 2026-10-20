"""보관함 분류·표시·휴지통 상태를 코어 저장소에 보관한다."""
import json

from . import vault
from .errors import RequestError


KEY = 'library_state:v1'
DEFAULT = {'favorites': [], 'folders': [], 'folderItems': {}, 'tagDefinitions': [],
           'tags': {}, 'aliases': {}, 'trashed': []}
MAX_ITEMS = 10000


def _strings(values, limit=MAX_ITEMS):
    if not isinstance(values, list):
        return []
    result = []
    for value in values[:limit]:
        if isinstance(value, str) and value.strip():
            result.append(value.strip()[:300])
    return list(dict.fromkeys(result))


def normalize(value):
    value = value if isinstance(value, dict) else {}
    raw_folders = value.get('folders') if isinstance(value.get('folders'), list) else []
    folders = []
    for folder in raw_folders[:1000]:
        if not isinstance(folder, dict):
            continue
        ident, name = folder.get('id'), folder.get('name')
        if isinstance(ident, str) and ident.strip() and isinstance(name, str) and name.strip():
            folders.append({'id': ident.strip()[:100], 'name': name.strip()[:100]})

    def mapping(name):
        source = value.get(name)
        if not isinstance(source, dict):
            return {}
        return {key[:300]: _strings(values, 100) for key, values in source.items()
                if isinstance(key, str) and isinstance(values, list)}

    aliases_source = value.get('aliases') if isinstance(value.get('aliases'), dict) else {}
    aliases = {key[:300]: alias.strip()[:300] for key, alias in aliases_source.items()
               if isinstance(key, str) and isinstance(alias, str) and alias.strip()}
    return {'favorites': _strings(value.get('favorites')), 'folders': folders,
            'folderItems': mapping('folderItems'), 'tagDefinitions': _strings(value.get('tagDefinitions'), 1000),
            'tags': mapping('tags'), 'aliases': aliases, 'trashed': _strings(value.get('trashed'))}


def read(db):
    row = db.execute('SELECT value FROM app_meta WHERE key = ?', (KEY,)).fetchone()
    if not row:
        return dict(DEFAULT)
    try:
        return normalize(json.loads(row[0]))
    except (TypeError, ValueError):
        return dict(DEFAULT)


def get_state():
    with vault.connect() as db:
        return {'state': read(db)}


def save_state(data):
    state = normalize(data.get('state') if isinstance(data, dict) else None)
    raw = json.dumps(state, ensure_ascii=False, separators=(',', ':'))
    if len(raw.encode('utf-8')) > 2_000_000:
        raise RequestError('보관함 분류 정보가 너무 큽니다.', 413, code='LIBRARY_STATE_TOO_LARGE')
    with vault.connect() as db:
        db.execute('INSERT OR REPLACE INTO app_meta(key, value) VALUES (?, ?)', (KEY, raw))
    return {'state': state}


def deleted_keys(db):
    return set(read(db)['trashed'])
