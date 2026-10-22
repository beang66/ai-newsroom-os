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


def _numeric_row(r):
    cells = [c for c in r if c]
    return bool(cells) and sum(bool(NUM_CELL.match(c.replace(' ', ''))) for c in cells) / len(cells) >= 0.5


def header_count(rows):
    """맨 위 머리글 줄 수(최대 4). 행 이름 칸이 찬 줄은 칸 절반 이상이 숫자면 데이터('구분 2022 2023' 은 데이터 — 예전과 같다).
    행 이름 칸이 빈 줄은 아래에 행 이름이 있는 줄이 있으면 숫자처럼 보여도('2025. 8 … 2026. 8 … 증감') 머리글이다."""
    h = 0
    while h < len(rows) and h < 4:
        r = rows[h]
        if _numeric_row(r) and (r[0] or not any(x[0] for x in rows[h + 1:h + 5])):
            break
        h += 1
    return h


def head_groups(head_rows, active):
    """위 머리글 줄(마지막 줄 빼고)마다 {글자 칸: 덮는 값 열들}. '2025. 8' 처럼 여러 열에 걸친 머리글은 글자가 묶음의 한 칸
    (가운데·왼쪽)에만 있다. 글자 칸이 값 열 사이에 일정한 간격 g(≥2)로 놓이면 묶음 하나가 g 열이라고 보고, 첫 묶음이 맨 앞 값 열부터
    시작하도록 나눈다(10쪽 '2025. 8' → 인원·증감·증감률, 12쪽 → 구성비·증감, 뒤에 따로 선 '증감률' 열은 묶음 밖).
    간격이 일정하지 않으면(부록 통계표처럼 한 칸의 여러 줄 글자가 열마다 흩어진 머리글) 제 열에만 둔다. active: 값 열(1부터)."""
    out = []
    for r in head_rows[:-1]:
        idx = [i for i, c in enumerate(active) if r[c]]
        gaps = {b - a for a, b in zip(idx, idx[1:])}
        if len(idx) < 2 or len(gaps) != 1 or min(gaps) < 2:
            out.append({active[i]: [active[i]] for i in idx})
            continue
        g = gaps.pop()
        start = idx[0] - min(idx[0], g - 1)  # 첫 글자 칸이 묶음 안에 들도록, 되도록 맨 앞 값 열부터
        out.append({active[i]: active[start + k * g:start + (k + 1) * g] for k, i in enumerate(idx)})
    return out


def header_split(rows):
    """→ (칸별 열 제목, 데이터 행). 여러 줄 머리글은 위 줄 묶음(head_groups)을 아래 칸마다 붙여 펼친다('2025. 8 인구')."""
    head, _, body, _ = table_head(rows)
    return head, body


def table_head(rows):
    """→ (칸별 열 제목[열 0 = 행 이름 열], 화면용 머리글 줄 [[{text, span}]], 데이터 행, 값 열 번호들).
    값 열 = 머리글·데이터 어느 줄에든 글자가 있는 열(통째로 빈 열은 화면에서 뺀다). 머리글이 없으면 ([], [], rows, 값 열)."""
    ncol = len(rows[0]) if rows else 0
    active = [c for c in range(1, ncol) if any(r[c] for r in rows if c < len(r))]
    h = header_count(rows)
    if not h:
        return [], [], rows, active
    hrows = rows[:h]
    groups = head_groups(hrows, active)
    head = [' '.join(r[0] for r in hrows if r[0])]  # 행 이름 열 제목('구분')
    for c in range(1, ncol):
        parts = [r[p] for r, g in zip(hrows, groups) for p, cols in g.items() if c in cols]
        head.append(' '.join(parts + ([hrows[-1][c]] if hrows[-1][c] else [])))
    view = []  # 화면 머리글: 위 줄은 묶음을 칸 여러 개에 걸쳐(span), 마지막 줄은 열마다. 행 이름 열 제목은 첫 줄에만
    for i, r in enumerate(hrows):
        cells = [{'text': head[0] if i == 0 else '', 'span': 1}]
        if i == h - 1:
            cells += [{'text': r[c], 'span': 1} for c in active]
        else:
            starts = {cols[0]: (r[p], len(cols)) for p, cols in groups[i].items() if cols}
            covered = {c for cols in groups[i].values() for c in cols}
            cells += [{'text': starts[c][0], 'span': starts[c][1]} if c in starts else {'text': '', 'span': 1}
                      for c in active if c in starts or c not in covered]
        view.append(cells)
    return head, view, rows[h:], active


SECTION = re.compile(r'^[<＜]\s*(.+?)\s*[>＞]$')
INDENT = {'․': 1, '‥': 2}  # 행 이름 앞 들여쓰기 점(한 점·두 점) — 바로 위 얕은 행의 하위 행
PERIOD_YEAR = re.compile(r'^(19|20)\d{2}\.\s*\d{1,2}(/4)?$')
PERIOD_BARE = re.compile(r'^\d{1,2}(/4)?$')
# '◦ 15세이상인구' '- 경제활동인구' 'w 건설업': 기호 행. 'w' 는 기호 글꼴(Wingdings)의 ◆ 글머리표가 글자로 뽑힌 것이다.
MARK = re.compile(r'^(?:[◦◉▣○●□■•\-–]|w(?=\s))\s*')
MARK_RANK = {'◉': 0, '▣': 1, '□': 1, '■': 1, '◦': 2, '○': 2, '●': 2, 'w': 3, '•': 3, '-': 4, '–': 4}


def row_label(label):
    """화면에 보일 행 이름: 들여쓰기 점·기호를 떼고 한 글자씩 띄어 쓴 한글을 붙인다('․15～19세' → '15～19세', '◦ 남 자' → '남자')."""
    return despace(MARK.sub('', label.strip().lstrip(''.join(INDENT)).strip()), 2)


def row_paths(rows):
    """데이터 행마다 상위 행 이름 [소제목, 부모 …]. 같은 이름의 행(남자 20～29세 / 여자 20～29세)을 화면에서 가르려고 쓴다.
    - '< 남 자 >' 줄은 아래 행들의 소제목(그 줄 자신은 소제목 없음)
    - 기호 행은 보도자료의 관례 단계(◉ > ▣·□ > ◦·○ > w·• > -)로 위아래를 가른다(표마다 기호가 나오는 순서는 달라 쓰지 않는다).
      기호를 쓰는 표의 기호 없는 행('실 업 률')은 바로 위 기호 행의 하위, '․'·'‥' 들여쓰기 행은 그보다 아래 단계
    - 행 이름이 비었거나 괄호뿐인 줄('(참가율)')은 바로 앞 행의 하위
    - '8' '3/4' 같은 월·분기 행은 위의 '2025. 1' 같은 연도 행의 해('2025년')"""
    section, stack, out, last, year = None, [], [], [], None
    ranks = any(MARK.match((r[0] if r else '').strip()) for r in rows)  # 기호를 쓰는 표인가
    for r in rows:
        label = (r[0] if r else '').strip()
        m = SECTION.match(label)
        if m:
            section, stack = despace(m.group(1), 2), []
            out.append([])
            last = [section]
            continue
        if not label or re.fullmatch(r'[(（][^()（）]*[)）]', label):
            out.append(list(last))
            continue
        if PERIOD_YEAR.match(label):  # '2025. 1' '2024.2/4' — 아래 '2' '3/4' 같은 행의 연도
            year = label[:4] + '년'
            out.append([section] if section else [])
            last = out[-1] + [label]
            continue
        if PERIOD_BARE.match(label):  # '8' '3/4' — 위 연도 행의 같은 해(부록 통계표의 월·분기 행)
            out.append(([section] if section else []) + ([year] if year else []))
            last = out[-1] + [label]
            continue
        year = None if re.fullmatch(r'(19|20)\d{2}', label) else year
        dots = label[:len(label) - len(label.lstrip(''.join(INDENT)))]
        mark = MARK.match(label)
        level = (MARK_RANK.get(mark.group(0).strip(), 4) if mark else 50 if ranks and not dots else 100 + sum(INDENT[ch] for ch in dots)
                 if ranks else sum(INDENT[ch] for ch in dots))
        name = row_label(label)
        while stack and stack[-1][0] >= level:
            stack.pop()
        path = ([section] if section else []) + [n for _, n in stack]
        out.append(path)
        stack.append((level, name))
        last = path + [name]
    return out


def table_chunks(b, cap, page):
    """→ [(글, 쪽, 표 구조)]. 표 구조 = {line: 글 속 머리글 줄, cells: 칸별 열 제목(첫 칸은 행 이름 열), rows: 화면용 머리글 줄,
    note: head_text, body: [{line, label, cells, path}] (이 조각의 행)}. 글에서는 칸을 띄어쓰기로 이어 칸 경계가 사라지므로
    화면 표(evidence_rank.table_view)가 추측하지 않도록 구조를 따로 넘긴다. 머리글은 조각마다 되풀이한다."""
    rows = b['rows']
    if rows and not any(r[0] for r in rows if r):  # 맨 앞 열이 통째로 비면(부록 통계표) 다음 열이 행 이름 열
        rows = [r[1:] for r in rows]
    head, head_view, rows, active = table_head(rows)
    hline = ' / '.join(x for x in [b.get('head_text', ''), ' '.join(h for h in head if h)] if x)
    paths = row_paths(rows)
    base = '\n'.join(x for x in [cap, hline] if x)

    def struct(part):
        return {'line': hline, 'cells': [head[0]] + [head[c] for c in active] if any(head) else [], 'rows': head_view,
                'note': b.get('head_text', ''),
                'body': [{'line': line, 'label': row_label(SECTION.sub(r'\1', r[0].strip())), 'cells': [r[c] if c < len(r) else '' for c in active],
                          'path': p} for line, r, p in part]}
    out, cur = [], []
    for r, p in zip(rows, paths):
        line = ' '.join(c for c in r if c)
        size = len(base) + sum(len(x[0]) + 1 for x in cur) + len(line)
        cont = bool(r) and not r[0]
        if cur and (size > 2 * TABLE_MAX or (size > TABLE_MAX and not cont)):
            out.append(('\n'.join(x for x in [base] + [x[0] for x in cur] if x), [page], struct(cur)))
            cur = []
        cur.append((line, r, p))
    if cur or base:
        out.append(('\n'.join(x for x in [base] + [x[0] for x in cur] if x), [page], struct(cur)))
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
                t = lambda s: tidy(s, kind)
                item['table_meta'] = {
                    'line': t(header['line']), 'cells': [t(c) for c in header['cells']], 'note': t(header['note']),
                    'rows': [[{'text': t(c['text']), 'span': c['span']} for c in r] for r in header['rows']],
                    'body': [{'line': t(b['line']), 'label': t(b['label']), 'cells': [t(c) for c in b['cells']], 'path': b['path']}
                             for b in header['body']]}
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
