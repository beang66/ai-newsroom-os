"""Foam-inspired Markdown file index in the managed, encrypted workspace.

The database stores source text, link occurrences, and resolved targets. Backlinks
are the inverse of those occurrences, not another mutable copy of the graph.
"""
import datetime
import hashlib
import posixpath
import re
import uuid
from urllib.parse import unquote, urlsplit

from . import ids, vault
from .errors import RequestError

MAX_CONTENT_BYTES = 5_000_000
MAX_PATH_LENGTH = 512
MAX_IMPORT_FILES = 100
_FENCE = re.compile(r'^ {0,3}(`{3,}|~{3,})')
_TOKEN = re.compile(r'!?(?:\[\[([^\]\n]+)\]\]|\[[^\]\n]*\]\((<[^>\n]+>|[^)\n]+)\))')
_HEADING = re.compile(r'^\s{0,3}#\s+(.+?)\s*#*\s*$')


def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _path(value):
    if not isinstance(value, str):
        raise RequestError('Markdown 파일의 상대 경로가 필요합니다.')
    path = value.replace('\\', '/')
    parts = path.split('/')
    if (not path or len(path) > MAX_PATH_LENGTH or path.startswith('/') or
            re.match(r'^[a-zA-Z]:', path) or any(p in ('', '.', '..') for p in parts) or
            any(ord(c) < 32 for c in path) or not path.lower().endswith('.md')):
        raise RequestError('워크스페이스 안의 .md 상대 경로만 가져올 수 있습니다.')
    return path


def _masked_lines(content):
    """Hide fenced/inline code while keeping columns and line numbers stable."""
    fence_char, fence_len = None, 0
    for line in content.splitlines():
        marker = _FENCE.match(line)
        if fence_char:
            if marker and marker.group(1)[0] == fence_char and len(marker.group(1)) >= fence_len:
                fence_char = None
            yield ' ' * len(line)
            continue
        if marker:
            fence_char, fence_len = marker.group(1)[0], len(marker.group(1))
            yield ' ' * len(line)
            continue
        chars = list(line)
        for match in re.finditer(r'(`+)(.*?)\1', line):
            chars[match.start():match.end()] = ' ' * (match.end() - match.start())
        yield ''.join(chars)


def parse_links(content):
    """Extract the supported local Markdown links in source order."""
    links = []
    if not isinstance(content, str):
        raise RequestError('Markdown 본문은 문자열이어야 합니다.')
    for line_no, line in enumerate(_masked_lines(content), 1):
        for match in _TOKEN.finditer(line):
            raw_text = match.group(0)
            kind = 'wikilink' if match.group(1) is not None else 'markdown'
            target = match.group(1).split('|', 1)[0] if kind == 'wikilink' else match.group(2)
            target = target.strip().strip('<>')
            if kind == 'markdown':
                target = target.split(' "', 1)[0].split(" '", 1)[0]
            target, _, fragment = target.partition('#')
            parsed = urlsplit(target)
            if parsed.scheme or parsed.netloc or target.startswith('//'):
                continue
            if kind == 'markdown':
                target = unquote(parsed.path)
            if not target and not fragment:
                continue
            links.append({'kind': kind, 'raw_text': raw_text, 'target_ref': target,
                          'fragment': fragment, 'line': line_no,
                          'is_embed': raw_text.startswith('!')})
    return links


def _title(path, content):
    for line in _masked_lines(content):
        match = _HEADING.match(line)
        if match:
            return match.group(1).strip()
    return posixpath.basename(path)[:-3]


def _candidate(path):
    return path if path.lower().endswith('.md') else path + '.md'


def _inside(path):
    return path not in ('', '..') and not path.startswith('../') and not path.startswith('/')


def _directory_target(path, by_path):
    for name in ('index.md', 'README.md'):
        target = by_path.get((path.rstrip('/') + '/' + name).casefold())
        if target:
            return target
    return None


def _resolve(source_path, kind, ref, by_path, ordered):
    if not ref:
        return by_path.get(source_path.casefold()), 'path:' + source_path.casefold()
    ref = ref.replace('\\', '/')
    if ref.startswith('/'):
        paths = [posixpath.normpath(ref.lstrip('/'))]
    else:
        paths = [posixpath.normpath(posixpath.join(posixpath.dirname(source_path), ref))]
        if kind == 'wikilink' and not ref.startswith(('./', '../')):
            paths.append(posixpath.normpath(ref))
    paths = [p for p in dict.fromkeys(paths) if _inside(p)]
    for path in paths:
        target = by_path.get(_candidate(path).casefold()) or _directory_target(path, by_path)
        if target:
            return target, 'path:' + path.casefold()
    if kind == 'wikilink' and not ref.startswith(('/', './', '../')):
        needle = _candidate(ref).casefold()
        matches = [item for item in ordered if item['path'].casefold() == needle or
                   item['path'].casefold().endswith('/' + needle)]
        if matches:
            return matches[0], 'wiki:' + needle
        directory = [item for item in ordered if item['path'].casefold().endswith('/' + ref.casefold() + '/index.md') or
                     item['path'].casefold().endswith('/' + ref.casefold() + '/readme.md')]
        if directory:
            directory.sort(key=lambda item: (0 if item['path'].casefold().endswith('/index.md') else 1, item['path'].casefold()))
            return directory[0], 'wiki:' + ref.casefold()
        return None, 'wiki:' + needle
    return None, 'path:' + (paths[0].casefold() if paths else ref.casefold())


def resolve_links(db):
    """Re-resolve occurrences after a workspace change; content parsing stays incremental."""
    rows = db.execute('SELECT id, path FROM knowledge_files ORDER BY path_key, path').fetchall()
    ordered = [{'id': row[0], 'path': row[1]} for row in rows]
    by_path = {item['path'].casefold(): item for item in ordered}
    for source_id, ordinal, kind, ref, source_path in db.execute(
            'SELECT l.source_id, l.ordinal, l.kind, l.target_ref, f.path FROM knowledge_links l '
            'JOIN knowledge_files f ON f.id = l.source_id').fetchall():
        target, key = _resolve(source_path, kind, ref, by_path, ordered)
        db.execute('UPDATE knowledge_links SET target_id = ?, target_key = ? WHERE source_id = ? AND ordinal = ?',
                   (target['id'] if target else None, key, source_id, ordinal))


def import_files(payload):
    files = payload.get('files') if isinstance(payload, dict) else None
    if not isinstance(files, list) or not 0 < len(files) <= MAX_IMPORT_FILES:
        raise RequestError('가져올 Markdown 파일을 1~100개 선택해 주세요.')
    prepared, seen = [], set()
    for item in files:
        if not isinstance(item, dict):
            raise RequestError('각 파일에는 경로와 본문이 필요합니다.')
        path = _path(item.get('path'))
        content = item.get('content')
        if not isinstance(content, str) or len(content.encode('utf-8')) > MAX_CONTENT_BYTES:
            raise RequestError('Markdown 파일은 UTF-8 텍스트로 5MB 이하여야 합니다.', 413)
        key = path.casefold()
        if key in seen:
            raise RequestError('같은 경로의 파일이 요청에 두 번 포함됐습니다.')
        seen.add(key)
        prepared.append((path, key, content, hashlib.sha256(content.encode('utf-8')).hexdigest(), parse_links(content)))
    result, counts = [], {'imported': 0, 'updated': 0, 'unchanged': 0}
    with vault.connect() as db:
        for path, key, content, digest, links in prepared:
            previous = db.execute('SELECT id, sha256 FROM knowledge_files WHERE path_key = ?', (key,)).fetchone()
            if previous and previous[1] == digest:
                file_id, state = previous[0], 'unchanged'
            else:
                file_id = previous[0] if previous else str(uuid.uuid4())
                state = 'updated' if previous else 'imported'
                now = _now()
                if previous:
                    db.execute('UPDATE knowledge_files SET path = ?, title = ?, content = ?, sha256 = ?, updated_at = ? '
                               'WHERE id = ?', (path, _title(path, content), content, digest, now, file_id))
                    db.execute('DELETE FROM knowledge_links WHERE source_id = ?', (file_id,))
                else:
                    db.execute('INSERT INTO knowledge_files VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                               (file_id, vault.WORKSPACE_ID, path, key, _title(path, content), content, digest, now, now))
                db.executemany('INSERT INTO knowledge_links '
                               '(source_id, ordinal, kind, raw_text, target_ref, fragment, target_id, target_key, line, is_embed) '
                               'VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)',
                               [(file_id, n, link['kind'], link['raw_text'], link['target_ref'], link['fragment'], '',
                                 link['line'], int(link['is_embed'])) for n, link in enumerate(links)])
            result.append({'id': file_id, 'path': path, 'state': state})
            counts[state] += 1
        resolve_links(db)
    return {'files': result, **counts}


def _file_id(value):
    try:
        return ids.uuid_text(value)
    except ids.IdError:
        raise RequestError('잘못된 파일 ID입니다.')


def _placeholder_id(key):
    return str(uuid.uuid5(ids.TEAM_NAMESPACE, 'app-core:knowledge-placeholder:' + key))


def map_items(db):
    rows = db.execute('SELECT id, path, title, updated_at FROM knowledge_files ORDER BY path_key').fetchall()
    links = db.execute('SELECT l.source_id, l.ordinal, l.kind, l.raw_text, l.target_ref, l.fragment, '
                       'l.target_id, l.target_key, l.line, l.is_embed FROM knowledge_links l '
                       'ORDER BY l.source_id, l.ordinal').fetchall()
    outgoing, incoming, unresolved = {}, {}, {}
    file_links = []
    for source, ordinal, kind, raw, ref, fragment, target, key, line, embed in links:
        outgoing[source] = outgoing.get(source, 0) + 1
        if target:
            incoming[target] = incoming.get(target, 0) + 1
        else:
            unresolved.setdefault(key, {'id': _placeholder_id(key), 'label': ref or fragment,
                                         'target_key': key, 'mentions': 0})['mentions'] += 1
        file_links.append({'id': f'{source}:{ordinal}', 'source': source,
                           'target': target or _placeholder_id(key), 'resolved': bool(target),
                           'relation': 'links_to', 'kind': kind, 'raw_text': raw,
                           'target_ref': ref, 'fragment': fragment, 'line': line,
                           'is_embed': bool(embed)})
    files = [{'id': ident, 'path': path, 'title': title, 'updated_at': updated,
              'outgoing_count': outgoing.get(ident, 0), 'backlink_count': incoming.get(ident, 0)}
             for ident, path, title, updated in rows]
    return files, list(unresolved.values()), file_links


def get_file(file_id):
    file_id = _file_id(file_id)
    with vault.connect() as db:
        row = db.execute('SELECT id, path, title, content, updated_at FROM knowledge_files WHERE id = ?',
                         (file_id,)).fetchone()
        if not row:
            raise RequestError('파일을 찾지 못했습니다.', 404, code='NOT_FOUND')
        _, _, links = map_items(db)
    return {'id': row[0], 'path': row[1], 'title': row[2], 'content': row[3], 'updated_at': row[4],
            'outgoing': [link for link in links if link['source'] == file_id],
            'incoming': [link for link in links if link['target'] == file_id and link['resolved']]}


def delete_file(file_id):
    file_id = _file_id(file_id)
    with vault.connect() as db:
        found = db.execute('SELECT 1 FROM knowledge_files WHERE id = ?', (file_id,)).fetchone()
        if not found:
            raise RequestError('파일을 찾지 못했습니다.', 404, code='NOT_FOUND')
        db.execute('DELETE FROM knowledge_links WHERE source_id = ?', (file_id,))
        db.execute('DELETE FROM knowledge_files WHERE id = ?', (file_id,))
        resolve_links(db)
    return {'deleted': True, 'id': file_id}
