"""Foam-inspired Markdown file index in the managed, encrypted workspace.

The database stores source text, link occurrences, and resolved targets. Backlinks
are the inverse of those occurrences, not another mutable copy of the graph.
"""
import datetime
import hashlib
import posixpath
import re
import unicodedata
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
# 노트의 역할(분류)은 코어가 정해 저장한다 — 경로에 든 역할 폴더(가장 안쪽 것), 없으면 note(취재 노트)
ROLE_FOLDERS = {
    '기사': 'article', 'articles': 'article',
    '기획': 'plan', '메모': 'plan', 'plan': 'plan', 'plans': 'plan',
    '원자료': 'data', '자료': 'data', '데이터': 'data', 'data': 'data',
    '인터뷰': 'interview', '녹취': 'interview', '발언': 'interview', 'interviews': 'interview',
    '검증': 'verify', '팩트체크': 'verify', 'factcheck': 'verify',
}


def role_from_path(path):
    for folder in reversed(str(path or '').split('/')[:-1]):
        role = ROLE_FOLDERS.get(unicodedata.normalize('NFC', folder).lower())
        if role:
            return role
    return 'note'


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
                    db.execute('UPDATE knowledge_files SET path = ?, title = ?, content = ?, sha256 = ?, updated_at = ?, role = ? '
                               'WHERE id = ?', (path, _title(path, content), content, digest, now, role_from_path(path), file_id))
                    db.execute('DELETE FROM knowledge_links WHERE source_id = ?', (file_id,))
                else:
                    db.execute('INSERT INTO knowledge_files (id, workspace_id, path, path_key, title, content, sha256, created_at, updated_at, role) '
                               'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                               (file_id, vault.WORKSPACE_ID, path, key, _title(path, content), content, digest, now, now, role_from_path(path)))
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


def _norm_filename(name):
    return re.sub(r'[\s_()（）\[\]「」『』·.,/-]+', '', unicodedata.normalize('NFC', str(name or ''))).casefold()


_TOPIC_RULES = [
    ('한국은행', ('한국은행', '한은')),
    ('국가데이터처', ('국가데이터처', '통계청')),
    ('산업통상부', ('산업통상부', '산업부')),
    ('고용노동부', ('고용노동부',)),
    ('국토교통부', ('국토교통부',)),
    ('금융감독원', ('금융감독원', '금감원')),
    ('성장·국민소득', ('성장률', '국민소득', '국민총소득', 'gni', 'gdp', '경제전망', '저축률', '경제 성장')),
    ('수출·무역', ('수출', '수입', '수출입', '무역수지', '경상수지', '국제수지')),
    ('반도체·제조업', ('반도체', '제조업', '자동차', '광학기기', '기계류', '생산', '산업활동', '기업경기')),
    ('물가·소비', ('소비자물가', '생산자물가', '물가', '소비심리', '소비자동향', '온라인쇼핑', '민간소비', '소매판매', '소비')),
    ('고용·노동', ('고용동향', '고용률', '취업자', '실업률', '사업체노동력', '종사자', '임금', '청년층')),
    ('인구·사회', ('인구동향', '출생아', '합계출산율', '고령자', '사망원인', '사망자', '인구')),
    ('외환·금융', ('외환보유액', '외화예금', '환율', '달러', '금리', '외국인', '증권투자', '주식', '채권')),
    ('건설·부동산', ('주택통계', '주택', '인허가', '건설업', '건설투자', '토목건설', '부동산')),
]
_PDF_REF = re.compile(r'([^\s`|()\[\]<>]+?\.pdf)', re.IGNORECASE)


def _extract_metadata(path, title, content, all_folders):
    """노트 본문과 제목·경로에서 주제 태그, 참조 PDF 파일명, 하위 폴더 언급을 추출한다."""
    text = unicodedata.normalize('NFC', f'{path}\n{title}\n{content or ""}')
    lower = text.casefold()
    # 헤더·요약 영역(상단 25줄)에 등장하는 주제는 핵심 주제로 가중치를 둔다
    head_text = '\n'.join((content or '').splitlines()[:25])
    head_lower = unicodedata.normalize('NFC', f'{path}\n{title}\n{head_text}').casefold()
    tags = []
    primary_tags = []
    for label, keywords in _TOPIC_RULES:
        if any(k.strip().casefold() in lower for k in keywords):
            tags.append(label)
        if any(k.strip().casefold() in head_lower for k in keywords):
            primary_tags.append(label)
    pdf_refs = sorted({_norm_filename(m.group(1)) for m in _PDF_REF.finditer(content or '') if m.group(1)})
    my_folder = unicodedata.normalize('NFC', posixpath.dirname(path).split('/')[-1]).casefold() if '/' in path else ''
    folder_mentions = [
        folder for folder in all_folders
        if folder and folder != my_folder and len(folder) >= 4 and folder in lower
    ]
    return tags, primary_tags, pdf_refs, folder_mentions


def map_items(db):
    rows = db.execute('SELECT id, path, title, updated_at, role, content FROM knowledge_files ORDER BY path_key').fetchall()
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
    all_folders = sorted({
        unicodedata.normalize('NFC', posixpath.dirname(path).split('/')[-1]).casefold()
        for _, path, _, _, _, _ in rows if '/' in path
    })
    files = []
    for ident, path, title, updated, role, content in rows:
        tags, primary_tags, pdf_refs, folder_mentions = _extract_metadata(path, title, content, all_folders)
        files.append({
            'id': ident, 'path': path, 'title': title, 'updated_at': updated, 'role': role,
            'outgoing_count': outgoing.get(ident, 0), 'backlink_count': incoming.get(ident, 0),
            'tags': tags, 'primary_tags': primary_tags,
            'pdf_refs': pdf_refs, 'folder_mentions': folder_mentions,
        })
    return files, list(unresolved.values()), file_links


def list_files():
    with vault.connect() as db:
        files, _, _ = map_items(db)
    return {'files': files}


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
