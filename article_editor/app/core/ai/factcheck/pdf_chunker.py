"""PDF 블록(pdf_layout) → 근거 청크.

- 줄글·불릿: 문장 분리 → 경계 모델 묶기(packed_units 와 같은 알고리즘). 제목 앞에서는 강제로 자르고,
  표·그림이 끼거나 쪽이 건너뛰면 묶음을 끊는다(다른 단락이 한 청크에 섞이지 않게).
- 표: 캡션·단위·머리글을 조각마다 반복한 행 묶음(약 600자). 행 이름이 빈 연속 행 앞에서는 자르지 않는다(2배까지).
- 그림: 캡션 + 그림 속 글자(버리지 않고 600자 단위로 나눔).
- 100자 미만 조각은 같은 쪽 이웃에 붙이고, 쪽 번호·'부록 1' 같은 조각은 버린다.
"""
import re

from .semantic_chunker_v3 import HARD_LIMIT, SOFT_LIMIT, detect_relation, split_oversize_sentence, split_sentences

TABLE_MAX = 600
JUNK = re.compile(r'^(부\s*록|참\s*고|통\s*계\s*표)?\s*[\dⅠⅡⅢⅣⅤ\-–.\s]*$')
NUM_CELL = re.compile(r'^[△▽▲\-+]?\(?\d[\d,]*(\.\d+)?%?\)?[%p]*$|^\d{1,2}:\d{2}$')  # 시:분(5:43)도 숫자


def pack(segs, boundary):
    """segs: [(text, join_prev, page, heading)] -> [(text, pages)]. 제목 앞에서 강제로 자르고 제목은 다음 문장에 붙인다."""
    if not segs:
        return []
    gap = [None] * len(segs)
    asks = []
    for i in range(1, len(segs)):
        if segs[i][3]:
            gap[i] = 'cut'
            continue
        if segs[i][1] or segs[i - 1][3] or detect_relation(segs[i - 1][0], segs[i][0]):
            continue
        gap[i] = 1.0
        asks.append(i)
    if boundary and asks:
        th = boundary.threshold['press']
        for i, p in zip(asks, boundary.probs([(segs[i - 1][0], segs[i][0]) for i in asks])):
            gap[i] = None if p[1] >= th and p[1] >= p[2] else float(p[0])
    groups, cur = [], []
    for i, s in enumerate(segs):
        if gap[i] == 'cut' and cur:
            groups.append(cur)
            cur = []
        cur.append((s, gap[i]))
    if cur:
        groups.append(cur)
    out = []
    for g in groups:
        atoms = []  # [text, 앞 경계 점수, pages]
        for s, g_ in g:
            score = None if g_ == 'cut' else g_
            if atoms and score is None and len(atoms[-1][0]) + 1 + len(s[0]) <= HARD_LIMIT:
                atoms[-1][0] += ' ' + s[0]
                atoms[-1][2].add(s[2])
            else:
                atoms.append([s[0], score if score is not None else 0.0, {s[2]}])
        cur = []
        for a in atoms:
            if cur and sum(len(x[0]) + 1 for x in cur) + len(a[0]) > SOFT_LIMIT:
                ks = [k for k in range(1, len(cur) + 1) if sum(len(x[0]) + 1 for x in cur[:k]) >= SOFT_LIMIT // 2] or [len(cur)]
                k = max(ks, key=lambda k: (cur[k][1] if k < len(cur) else a[1], k))
                out.append((' '.join(x[0] for x in cur[:k]), sorted(set().union(*[x[2] for x in cur[:k]]))))
                cur = cur[k:]
            cur.append(a)
        if cur:
            out.append((' '.join(x[0] for x in cur), sorted(set().union(*[x[2] for x in cur]))))
    return out


def take_heads(segs):
    """줄글 끝에 남은 제목들(뒤따르는 줄글 없이 바로 표·그림이 오는 경우)을 떼어 표·그림 청크의 앞머리로 쓴다."""
    heads = []
    while segs and segs[-1][3]:
        heads.insert(0, segs.pop()[0])
    return heads


def despace(text, min_run):
    """한 글자씩 띄어 쓴 한글(재 배 면 적, 강 원)을 붙인다. min_run = 붙일 최소 글자 수."""
    pat = re.compile(r'(?<![가-힣])([가-힣](?: [가-힣]){%d,})(?![가-힣])' % (min_run - 1))
    return pat.sub(lambda m: m.group(1).replace(' ', ''), text)


def header_split(rows):
    h = 0
    while h < len(rows) and h < 4:
        cells = [c for c in rows[h] if c]
        if cells and sum(bool(NUM_CELL.match(c.replace(' ', ''))) for c in cells) / len(cells) >= 0.5:
            break
        h += 1
    head = [' '.join(x for x in (rows[r][c] for r in range(h)) if x) for c in range(len(rows[0]))] if h and rows else []
    return head, rows[h:]


def table_chunks(b, cap, page):
    """→ [(글, 쪽, 머리글)]. 머리글 = {line: 글 속 머리글 줄, cells: 칸별 열 제목(첫 칸은 행 이름 열), note: head_text}.
    글에서는 칸을 띄어쓰기로 이어 '2026.8월말 (a)' 같은 열 제목의 칸 경계가 사라지므로, 화면 표(evidence_rank.table_view)가
    추측하지 않도록 칸 목록을 따로 넘긴다. 칸 열 제목이 없으면 None. 글은 그대로다(검색·임베딩 캐시 영향 없음)."""
    head, rows = header_split(b['rows'])
    hline = ' / '.join(x for x in [b.get('head_text', ''), ' '.join(h for h in head if h)] if x)
    header = {'line': hline, 'cells': head, 'note': b.get('head_text', '')} if any(head) else None
    base = '\n'.join(x for x in [cap, hline] if x)
    out, cur = [], []
    for r in rows:
        line = ' '.join(c for c in r if c)
        size = len(base) + sum(len(x) + 1 for x in cur) + len(line)
        cont = bool(r) and not r[0]
        if cur and (size > 2 * TABLE_MAX or (size > TABLE_MAX and not cont)):
            out.append(('\n'.join(x for x in [base] + cur if x), [page], header))
            cur = []
        cur.append(line)
    if cur or base:
        out.append(('\n'.join(x for x in [base] + cur if x), [page], header))
    return out


def figure_chunks(title, text, page):
    out, cur = [], []
    for w in text.split():
        if cur and len(title) + sum(len(x) + 1 for x in cur) + len(w) > TABLE_MAX:
            out.append(((title + ' ' + ' '.join(cur)).strip(), [page]))
            cur = []
        cur.append(w)
    if cur:
        out.append(((title + ' ' + ' '.join(cur)).strip(), [page]))
    return out


def merge_small(items, min_len=100):
    items = [list(x) for x in items]
    keep = [True] * len(items)
    for n, (kind, text, pg, _) in enumerate(items):
        if kind == 'table' or len(text) >= min_len:
            continue
        keep[n] = False
        if JUNK.match(text.strip()):
            continue
        if n + 1 < len(items) and set(items[n + 1][2]) & set(pg):
            items[n + 1][1] = text + '\n' + items[n + 1][1]
            continue
        prv = next((m for m in range(n - 1, -1, -1) if keep[m]), None)
        if prv is not None and set(items[prv][2]) & set(pg):
            items[prv][1] = items[prv][1] + '\n' + text
            continue
        keep[n] = True  # 붙일 곳이 없으면 그대로 둔다
    return [tuple(x) for n, x in enumerate(items) if keep[n]]


def pdf_units(pages, boundary=None):
    """[{page, blocks}] -> [{text, kind, field, pages}] (읽기 순서)."""
    segs, special, ordered, last_head = [], [], [], {}

    def flush_segs():
        nonlocal segs
        ordered.extend(('narrative', t, pg, None) for t, pg in pack(segs, boundary))
        segs = []

    def emit(items):
        flush_segs()
        ordered.extend((k, x[0], x[1], x[2] if len(x) > 2 else None) for k, x in items)  # 표만 머리글을 함께 넘긴다

    def heads_for(p):
        return take_heads(segs) or ([last_head[p]] if last_head.get(p) else [])

    flat = [(pg['page'], bl) for pg in pages for bl in pg['blocks'] if bl['type'] not in ('margin', 'toc')]
    i = 0
    while i < len(flat):
        p, bl = flat[i]
        t = bl['type']
        if segs and t not in ('table', 'figure') and p > segs[-1][2] + 1:
            flush_segs()
        if t in ('table', 'figure') or (t in ('caption', 'unit') and any(fb[1]['type'] in ('table', 'figure') for fb in flat[i + 1:i + 4])):
            kept = []
            while segs and segs[-1][3]:
                kept.insert(0, segs.pop())
            flush_segs()
            segs = kept  # 표·그림 바로 앞 제목은 take_heads 가 가져가도록 남긴다
        if t in ('caption', 'unit'):
            cap = [bl['text']]
            j = i + 1
            while j < len(flat) and flat[j][1]['type'] in ('caption', 'unit') and len(cap) < 3:
                cap.append(flat[j][1]['text'])
                j += 1
            if j < len(flat) and flat[j][1]['type'] in ('table', 'figure') and flat[j][0] == p:
                nb = flat[j][1]
                title = ' '.join(heads_for(p) + cap)
                emit([('table', x) for x in table_chunks(nb, title, p)] if nb['type'] == 'table'
                     else [('figure', x) for x in figure_chunks(title, nb['text'], p)])
                i = j + 1
                continue
            segs += [(c, False, p, True) for c in cap]
            i = j
            continue
        if t == 'table':
            emit([('table', x) for x in table_chunks(bl, ' '.join(heads_for(p)), p)])
        elif t == 'figure':
            emit([('figure', x) for x in figure_chunks(' '.join(heads_for(p)), bl['text'], p)])
        elif t == 'heading':
            segs.append((bl['text'], False, p, True))
            last_head[p] = bl['text']
        else:  # para, bullet
            for s in split_sentences(bl['text']):
                for m, piece in enumerate(split_oversize_sentence(s, SOFT_LIMIT)):
                    segs.append((piece, m > 0, p, False))
        i += 1
    flush_segs()
    out = []
    for kind, text, pg, header in merge_small(ordered):
        text = tidy(text, kind)
        if text:  # 쪽마다 반복되는 각주도 지우지 않는다(쪽 번호가 다르다)
            item = {'text': text, 'kind': kind, 'field': None, 'pages': pg}
            if header:  # 글과 같은 정리를 칸마다 따로 한다(정리 규칙은 줄 안에서만 작동해 line 은 글 속 줄과 같다)
                item['table_header'] = {'line': tidy(header['line'], kind), 'cells': [tidy(c, kind) for c in header['cells']],
                                        'note': tidy(header['note'], kind)}
            out.append(item)
    return out


def tidy(text, kind):
    """미변환 글자 제거, 여는 괄호 뒤 공백 제거, 한 글자씩 띄어 쓴 한글 붙이기. 모두 한 줄 안에서만 바꾼다."""
    text = re.sub(r'\( +', '(', re.sub(r'\(cid:\d+\)', '', text or ''))
    return despace(text, 2 if kind == 'table' else 3).strip()


if __name__ == '__main__':
    tbl = {'type': 'table', 'rows': [['구분', '2022', '2023'], ['전체', '1,234', '1,300'], ['', '(2.1)', '(5.4)'], ['남자', '600', '650']]}
    pages = [{'page': 1, 'blocks': [
        {'type': 'margin', 'text': '- 3 -'},
        {'type': 'heading', 'text': '1. 인구 현황'},
        {'type': 'para', 'text': '전체 인구는 1,300명으로 전년보다 5.4% 늘었다. 남자 인구는 650명이다. ' * 3},
        {'type': 'caption', 'text': '<표 1> 성별 인구'}, {'type': 'unit', 'text': '(단위: 명, %)'}, tbl,
        {'type': 'para', 'text': '그림을 보면 증가 추세가 뚜렷하게 나타난다고 분석했다. 추세는 계속될 전망이다. ' * 3},
        {'type': 'figure', 'text': '1,100 1,200 1,300'},
        {'type': 'margin', 'text': '- 4 -'}]},
        {'page': 3, 'blocks': [{'type': 'para', 'text': '쪽이 건너뛰면 다른 단락이다. 앞 쪽 문장과 섞이지 않아야 한다. ' * 3}]}]
    u = pdf_units(pages)
    assert [x['kind'] for x in u] == ['narrative', 'table', 'narrative', 'narrative'], u  # 짧은 그림(100자 미만)은 같은 쪽 앞 청크에 붙는다
    assert u[0]['text'].startswith('1. 인구 현황 전체 인구는'), u[0]
    # 캡션 없는 표·그림이면 쪽의 마지막 제목을 앞에 붙인다(여기서는 캡션 앞에도 붙음)
    assert u[1]['text'] == '1. 인구 현황 <표 1> 성별 인구 (단위: 명, %)\n구분 2022 2023\n전체 1,234 1,300\n(2.1) (5.4)\n남자 600 650', u[1]
    assert u[2]['text'].endswith('1. 인구 현황 1,100 1,200 1,300') and u[3]['pages'] == [3], u
    assert header_split([['시간', '평일'], ['수면', '7:43']])[0] == ['시간', '평일']
    assert despace('재 배 면 적 은 늘었다 강 원', 3) == '재배면적은 늘었다 강 원'
    print('ok')
