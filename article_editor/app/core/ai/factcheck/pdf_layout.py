"""PDF 쪽 → 블록(제목·문단·불릿·캡션·단위·표·그림). pdfplumber 의 글자 위치·선·도형을 써서
표와 그림을 줄글과 섞이지 않게 떼어 낸다. 블록 → 청크는 pdf_chunker.py.

- 선 있는 표: find_tables + 표 옆에 붙은 칸 확장. 칸이 대부분 빈(35% 미만) 것·축 눈금이 있는 것은 그래프로 보고 버린다.
- 선 없는 표: 숫자가 같은 열에 3줄 이상 정렬된 구간.
- 그림: 표 밖 벡터 도형 묶음(쪽 밖 도형·문장 테두리 제외, 문장 2줄 이상 든 영역 거부). 안의 문장 줄은 줄글로 돌린다.
"""
import io
import re
import statistics

NUM = re.compile(r'^[△▽▲\-+]?\(?\d[\d,]*(\.\d+)?%?\)?[%p㎡㎏]*$|^[-－–]$|^\d{1,2}:\d{2}$')
BULLET = re.compile('^(ㅇ|○|❍|◦|•|·|․|∘|◊|▢|▪|■|□|◆|◇|※|＊|\\*|-|―|–|◾|▶|►|➢|‣|[①-⑳]|[-]|[\U000F0000-\U000FFFFD])')
HEADING = re.compile(r'^(\d{1,2}\.|[가-하]\.|\(\d+\)|\d+\)|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\.?)\s')
CAPTION = re.compile(r'^[<＜\[]\s*(표|그림|그래프|참고|부표)')
CAPTION_ANY = re.compile(r'^([<＜\[][^<>＜＞\[\]]{2,70}[>＞\]]|《[^《》]{2,70}》|【[^【】]{1,70}】)\s*\d?\)?$')
UNIT = re.compile(r'^[\(（\[]?\s*단위')
UNIT_PAREN = re.compile(r'^[\(（][^()（）]{1,40}[\)）]$')
UNIT_WORD = re.compile(r'%|=|(^|[\s(,])(조원|억원|만원|천원|원|명|천명|톤|ha|㎡|kg|개|가구|배|점)(?=[\s,)]|$)')
PAGENO = re.compile(r'^[-–\s]*\d{1,3}[-–\s]*$')
TOC = re.compile(r'[·․…]{4,}|\.{5,}')
SENT_END = re.compile(r'(다|음|함|임|됨|요|\.)\s*$')
CONT_END = re.compile(r'(다|음|함|임|됨|요|\.|\)|%|명|원)\s*$')  # 이 끝이면 문장이 끝난 것으로 봄(7번)
SENT_ANY = re.compile(r'(다|음|함|임|됨)(\s|$)')


def is_unit(t):
    t = t.strip()
    return bool(UNIT.match(t) or (UNIT_PAREN.match(t) and UNIT_WORD.search(t)))


def lines_of(words, ytol=0.5):
    out = []
    for w in sorted(words, key=lambda w: (round(w['top']), w['x0'])):
        sz = w.get('size', 10) or 10
        for L in out:
            if abs(L['top'] - w['top']) <= ytol * sz:
                L['w'].append(w)
                break
        else:
            out.append({'top': w['top'], 'bottom': w['bottom'], 'w': [w]})
    for L in out:
        L['w'].sort(key=lambda w: w['x0'])
        L['text'] = ' '.join(w['text'] for w in L['w'])
        L['x0'] = L['w'][0]['x0']
        L['x1'] = L['w'][-1]['x1']
        L['bottom'] = max(w['bottom'] for w in L['w'])
        L['size'] = statistics.median([w.get('size', 10) for w in L['w']])
        L['nnum'] = sum(bool(NUM.match(w['text'])) for w in L['w'])
    out.sort(key=lambda L: L['top'])
    return out


def is_sentence_line(ln):
    t = ln['text']
    return (len(t) >= 25 and bool(SENT_ANY.search(t)) and ln['nnum'] < 0.5 * len(ln['w'])) or (bool(BULLET.match(t)) and len(t) >= 15 and ln['nnum'] < 0.5 * len(ln['w']))


def merge_cols(vals, tol=3.0):
    out = []
    for v in sorted(vals):
        if out and v - out[-1][-1] <= tol:
            out[-1].append(v)
        else:
            out.append([v])
    return [sum(g) / len(g) for g in out]


def rows_from_words(words, cuts):
    rows = []
    for L in lines_of(words, 0.6):
        cells = [''] * (len(cuts) - 1)
        for w in L['w']:
            c = (w['x0'] + w['x1']) / 2
            k = next((i for i in range(len(cuts) - 1) if cuts[i] <= c < cuts[i + 1]), len(cuts) - 2)
            cells[k] = (cells[k] + ' ' + w['text']).strip()
        rows.append(cells)
    out = []
    for r in rows:
        cont = (out and not r[0] and any(r) and all((not c) or out[-1][i] for i, c in enumerate(r))
                and not any(NUM.match(c) and not c.startswith('(') for c in r if c))
        if cont:
            out[-1] = [(a + ' ' + b).strip() for a, b in zip(out[-1], r)]
        else:
            out.append(r)
    # 4) 행 이름만 있는 줄(값 칸이 모두 빔): 바로 앞뒤에 행 이름이 빈 값 행이 있으면 그 행들의 행 이름으로 붙이고 줄은 지움
    res, i = [], 0
    label_only = lambda r: bool(r[0]) and not any(r[1:])
    empty_label = lambda r: not r[0] and sum(bool(NUM.match(c.replace(' ', ''))) for c in r[1:] if c) >= 1
    for k, r in enumerate(out):
        if label_only(r) and len(r) > 2:
            nb = [j for j in (k - 1, k + 1) if 0 <= j < len(out) and empty_label(out[j])]
            if nb:
                for j in nb:
                    out[j][0] = (r[0] + ' ' + out[j][0]).strip()
                continue
        res.append(r)
    # 같은 행 이름 줄이 두 번 붙는 것을 막기 위해 위에서 제자리 수정한 out을 그대로 씀
    return [r for r in res if any(r)]


def figure_boxes(page, table_boxes, sent_boxes):
    """1) 표 밖 벡터 도형을 묶어 그림 영역으로. 쪽 밖 도형·문장 테두리는 제외, 문장 2줄 이상 들어간 영역은 거부."""
    W, H = page.width, page.height
    within = lambda b, x, y: b[0] - 2 <= x <= b[2] + 2 and b[1] - 2 <= y <= b[3] + 2
    objs = []
    for o in list(page.rects) + list(page.curves) + list(page.lines):
        x0, x1, t, bt = o['x0'], o['x1'], o['top'], o['bottom']
        if x1 < 0 or bt < 0 or x0 > W or t > H:
            continue
        x0, x1, t, bt = max(0, x0), min(W, x1), max(0, t), min(H, bt)
        w, h = x1 - x0, bt - t
        if w * h > 0.6 * W * H or (w > 0.8 * W and h < 3) or (h > 0.8 * H and w < 3) or (w < 0.3 and h < 0.3):
            continue
        cx, cy = (x0 + x1) / 2, (t + bt) / 2
        if any(within(b, cx, cy) for b in table_boxes):
            continue
        if w > 20 and h > 8 and any(x0 - 2 <= s[0] and s[2] <= x1 + 2 and t - 2 <= s[1] and s[3] <= bt + 2 for s in sent_boxes):
            continue  # 문장을 둘러싼 테두리(텍스트 상자)
        objs.append([x0, t, x1, bt, 1])
    objs = objs[:2500]
    pad = 6.0
    changed = True
    while changed and len(objs) > 1:
        changed = False
        objs.sort(key=lambda b: b[0])
        out = []
        for b in objs:
            for c in out:
                if b[0] <= c[2] + pad and b[2] >= c[0] - pad and b[1] <= c[3] + pad and b[3] >= c[1] - pad:
                    c[0], c[1], c[2], c[3], c[4] = min(c[0], b[0]), min(c[1], b[1]), max(c[2], b[2]), max(c[3], b[3]), c[4] + b[4]
                    changed = True
                    break
            else:
                out.append(b)
        objs = out
    boxes = [b for b in objs if b[4] >= 5 and (b[2] - b[0]) > 40 and (b[3] - b[1]) > 25]
    return [b for b in boxes if sum(1 for s in sent_boxes if within(b, (s[0] + s[2]) / 2, (s[1] + s[3]) / 2)) < 2]


AXIS_LABEL = re.compile(r"^['’‘]\d{2}(\.\d)?(/\d)?$")


def looks_like_chart(rows):
    """테두리로 감싼 그래프가 선 있는 표로 잡힌 경우: 행 대부분이 짧은 숫자 1~2개뿐이고,
    축 라벨('24.2/4 등) 3개 이상 또는 등간격 눈금(10,5,0,-5…) 4개 이상이 있으면 그래프로 본다."""
    cells = [[c for c in r if c] for r in rows]
    toks = [t for r in cells for c in r for t in c.split()]
    if not toks:
        return False
    sparse = sum(1 for r in cells if 0 < len(r) <= 2 and all(len(c.replace(' ', '')) <= 8 for c in r)) / max(1, sum(1 for r in cells if r))
    if sparse < 0.5:
        return False
    if sum(1 for t in toks if AXIS_LABEL.match(t)) >= 3:
        return True
    vals = []
    for t in toks:
        try:
            v = float(t.replace(',', ''))
        except ValueError:
            continue
        if not (v.is_integer() and 1900 <= v <= 2100):  # 연도 열은 등간격이어도 눈금이 아니다
            vals.append(v)
    for step in sorted({abs(a - b) for a, b in zip(vals, vals[1:]) if a != b})[:20]:
        if step <= 0:
            continue
        run = best = 1
        for a, b in zip(vals, vals[1:]):
            run = run + 1 if abs(abs(a - b) - step) < 1e-9 else 1
            best = max(best, run)
        if best >= 4:
            return True
    return False


def strong_table(L):
    """2) 행마다 숫자 3개 이상인 줄이 3줄 이상, 그중 절반 이상이 글자 행 이름으로 시작"""
    rows = [ln for ln in L if ln['nnum'] >= 3]
    lab = [ln for ln in rows if not NUM.match(ln['w'][0]['text'])]
    if len(rows) >= 3 and len(lab) * 2 >= len(rows):
        return True
    # 행 이름이 연도처럼 숫자인 표: 숫자 4개 이상인 줄이 3줄 이상이고 줄마다 숫자 개수가 거의 같음(그래프 축 눈금은 줄당 1~2개)
    wide = [ln['nnum'] for ln in L if ln['nnum'] >= 4]
    if len(wide) >= 3:
        med = sorted(wide)[len(wide) // 2]
        return sum(1 for n in wide if abs(n - med) <= 1) >= 0.7 * len(wide)
    return False


def extend_table(words, used_other, b, all_lines):
    """4) 표 영역의 세로 범위 안, 영역 좌우로 붙어 있는(간격 30pt 이하로 이어진) 단어 중 문장 줄이 아닌 것"""
    sent_ids = {id(w) for ln in all_lines if is_sentence_line(ln) for w in ln['w']}
    cand = [w for w in words if id(w) not in used_other and id(w) not in sent_ids
            and b[1] + 1 <= (w['top'] + w['bottom']) / 2 <= b[3] - 1
            and not (b[0] - 2 <= (w['x0'] + w['x1']) / 2 <= b[2] + 2)]
    take = []
    left = sorted([w for w in cand if w['x1'] <= b[0] + 2], key=lambda w: -w['x1'])
    edge = b[0]
    for w in left:
        if edge - w['x1'] <= 30 or any(abs(w['x1'] - t['x0']) <= 30 and abs(w['top'] - t['top']) < 20 for t in take):
            take.append(w)
            edge = min(edge, w['x0'])
    right = sorted([w for w in cand if w['x0'] >= b[2] - 2], key=lambda w: w['x0'])
    edge = b[2]
    for w in right:
        if w['x0'] - edge <= 30:
            take.append(w)
            edge = max(edge, w['x1'])
    return take


def merge_tight(words, ratio=0.15):
    """글자 크기 정보를 함께 뽑으면 크기가 조금만 달라도(숫자 14.0pt / 한글 13.98pt) 단어가 끊긴다.
    같은 줄에서 간격이 글자 크기의 15% 미만(겹침 포함)인 조각은 한 단어로 다시 합친다."""
    out = []
    for L in lines_of(words):
        cur = None
        for w in L['w']:
            if cur and w['x0'] - cur['x1'] < ratio * max(cur.get('size', 10) or 10, w.get('size', 10) or 10):
                cur = dict(cur, text=cur['text'] + w['text'], x1=max(cur['x1'], w['x1']), top=min(cur['top'], w['top']),
                           bottom=max(cur['bottom'], w['bottom']), size=max(cur.get('size', 10), w.get('size', 10)))
            else:
                if cur:
                    out.append(cur)
                cur = dict(w)
        if cur:
            out.append(cur)
    return out


def page_blocks(page):
    H = page.height
    words = merge_tight(page.extract_words(x_tolerance=1.5, y_tolerance=2, extra_attrs=['size'], keep_blank_chars=False))
    all_lines = lines_of(words)
    sent_boxes = [(ln['x0'], ln['top'], ln['x1'], ln['bottom']) for ln in all_lines if is_sentence_line(ln)]
    blocks = []
    inside = lambda w, b: b[0] - 2 <= (w['x0'] + w['x1']) / 2 <= b[2] + 2 and b[1] - 2 <= (w['top'] + w['bottom']) / 2 <= b[3] + 2
    used = set()
    tboxes = []
    tabs = page.find_tables()
    all_tbox = [t.bbox for t in tabs]
    for t in tabs:
        b = t.bbox
        ws = [w for w in words if inside(w, b) and id(w) not in used]
        cuts = merge_cols([c[0] for c in t.cells] + [c[2] for c in t.cells], 3.0)
        if len(ws) < 6 or len(cuts) - 1 < 2:
            continue
        other = {id(w) for w in words if any(inside(w, ob) for ob in all_tbox if ob is not b)}
        ext = extend_table(words, used | other | {id(w) for w in ws}, b, all_lines)
        if ext:
            lx = [w for w in ext if w['x1'] <= b[0] + 2]
            rx = [w for w in ext if w['x0'] >= b[2] - 2]
            if lx:
                cuts = [min(w['x0'] for w in lx) - 1] + [c for c in cuts if c > max(w['x1'] for w in lx)]
                cuts = sorted(set(cuts + [b[0]]))
            if rx:
                cuts = sorted(set([c for c in cuts if c < min(w['x0'] for w in rx)] + [b[2], max(w['x1'] for w in rx) + 1]))
            ws = ws + ext
        rows = rows_from_words(ws, cuts)
        if len(rows) < 2:
            continue
        # 그래프 테두리가 표로 잡힌 경우: 숫자가 있는 행의 칸 대부분이 비어 있으면(채움 35% 미만) 그림으로 넘긴다
        drows = [r for r in rows if any(NUM.match(c.replace(' ', '')) for c in r if c)]
        if drows and len(rows[0]) >= 2:
            fill = sum(sum(1 for c in r if c) / len(r) for r in drows) / len(drows)
            if fill < 0.35:
                continue
        if looks_like_chart(rows):
            continue
        for w in ws:
            used.add(id(w))
        tboxes.append(b)
        blocks.append(dict(type='table', kind='ruled' + ('+ext' if ext else ''), top=b[1], bottom=b[3], x0=b[0], rows=rows, ncol=len(cuts) - 1))
    for fb in figure_boxes(page, tboxes, sent_boxes):
        ws = [w for w in words if id(w) not in used and inside(w, fb)]
        if not ws:
            continue
        L = lines_of(ws)
        if strong_table(L):
            continue  # 2) 표로 되돌림: 아래 선 없는 표 검출이 처리
        keep = [ln for ln in L if not is_sentence_line(ln)]  # 3) 문장·불릿 줄은 줄글로
        if not keep:
            continue
        for ln in keep:
            for w in ln['w']:
                used.add(id(w))
        blocks.append(dict(type='figure', kind='vector', top=fb[1], bottom=fb[3], x0=fb[0], text=' '.join(l['text'] for l in keep)))
    L = lines_of([w for w in words if id(w) not in used])
    keep = []
    for ln in L:
        if PAGENO.match(ln['text']) and (ln['top'] < 0.08 * H or ln['top'] > 0.9 * H):
            blocks.append(dict(type='margin', top=ln['top'], text=ln['text']))
        elif TOC.search(ln['text']):
            blocks.append(dict(type='toc', top=ln['top'], bottom=ln['bottom'], text=ln['text']))
        else:
            keep.append(ln)
    L = keep
    n = len(L)
    flags = ['p'] * n
    i = 0
    while i < n:
        if not is_sentence_line(L[i]) and (L[i]['nnum'] >= 3 and not BULLET.match(L[i]['text']) or (L[i]['nnum'] >= 3 and L[i]['nnum'] >= 0.7 * len(L[i]['w']))):
            j = i
            while (j + 1 < n and L[j + 1]['top'] - L[j]['bottom'] < 1.8 * L[j]['size']
                   and not is_sentence_line(L[j + 1]) and (L[j + 1]['nnum'] >= 2 or (L[j + 1]['nnum'] == 0 and len(L[j + 1]['w']) <= 3 and j + 2 < n and L[j + 2]['nnum'] >= 3))):
                j += 1
            if j - i + 1 >= 3:
                ctr = merge_cols([(w['x0'] + w['x1']) / 2 for k in range(i, j + 1) for w in L[k]['w'] if NUM.match(w['text'])], 6.0)
                aligned = sum(1 for k in range(i, j + 1) if L[k]['nnum'] >= 2)
                if aligned >= 3 and len(ctr) <= 24:
                    for k in range(i, j + 1):
                        flags[k] = 't'
            i = j + 1
        else:
            i += 1
    for k in range(n):
        if flags[k] == 't' and (k == 0 or flags[k - 1] != 't'):
            m, c = k - 1, 0
            while (m >= 0 and c < 3 and flags[m] == 'p' and L[m]['nnum'] <= 1 and len(L[m]['w']) <= 8
                   and not BULLET.match(L[m]['text']) and L[k]['top'] - L[m]['bottom'] < 2.2 * L[m]['size']):
                if CAPTION.match(L[m]['text']) or CAPTION_ANY.match(L[m]['text']) or is_unit(L[m]['text']):
                    break
                flags[m] = 't'
                m -= 1
                c += 1
    i = 0
    while i < n:
        if flags[i] == 't':
            j = i
            while j + 1 < n and flags[j + 1] == 't':
                j += 1
            ws = [w for k in range(i, j + 1) for w in L[k]['w']]
            cc = merge_cols([(w['x0'] + w['x1']) / 2 for w in ws if NUM.match(w['text'])], 6.0)
            lab = min(w['x0'] for w in ws)
            cuts = [lab - 1] + ([cc[0] - 18] if cc and cc[0] - 18 > lab else []) + [(cc[q] + cc[q + 1]) / 2 for q in range(len(cc) - 1)] + [max(w['x1'] for w in ws) + 1]
            cuts = sorted(set(cuts))
            if len(cuts) - 1 >= 2:
                blocks.append(dict(type='table', kind='aligned', top=L[i]['top'], bottom=L[j]['bottom'], x0=lab, rows=rows_from_words(ws, cuts), ncol=len(cuts) - 1))
            i = j + 1
        else:
            i += 1
    body = [L[k] for k in range(n) if flags[k] == 'p']
    med = statistics.median([ln['size'] for ln in body] or [10])
    cur, prev = None, None

    def flush():
        nonlocal cur
        if cur:
            blocks.append(cur)
        cur = None

    for ln in body:
        t = ln['text']
        nw = len(ln['w'])
        gap = (ln['top'] - prev['bottom']) if prev else 99
        isfig = nw >= 3 and ln['nnum'] / nw >= 0.7
        if isfig:
            if cur and cur['type'] == 'figure' and gap < 2 * ln['size']:
                cur['text'] += ' ' + t
                cur['bottom'] = ln['bottom']
            else:
                flush()
                cur = dict(type='figure', kind='numeric', top=ln['top'], bottom=ln['bottom'], text=t)
        elif CAPTION.match(t) or CAPTION_ANY.match(t) or is_unit(t):
            flush()
            blocks.append(dict(type='unit' if is_unit(t) else 'caption', top=ln['top'], bottom=ln['bottom'], text=t))
        elif BULLET.match(t):
            flush()
            cur = dict(type='bullet', top=ln['top'], bottom=ln['bottom'], text=t, x0=ln['x0'])
        elif cur and cur['type'] in ('bullet', 'para') and not CONT_END.search(cur['text']) and 0 <= gap < 1.0 * ln['size']:
            cur['text'] += ' ' + t  # 7) 앞 문장이 안 끝났으면 글자 크기와 상관없이 이어지는 줄
            cur['bottom'] = ln['bottom']
        elif (ln['size'] >= 1.18 * med and len(t) < 60) or (HEADING.match(t) and len(t) < 70 and ln['size'] >= 1.05 * med and not SENT_END.search(t)):
            flush()
            blocks.append(dict(type='heading', top=ln['top'], bottom=ln['bottom'], text=t))
        else:
            if cur and cur['type'] in ('bullet', 'para') and gap < 1.0 * ln['size'] and ln['x0'] >= cur['x0'] - 2:
                cur['text'] += ' ' + t
                cur['bottom'] = ln['bottom']
            else:
                flush()
                cur = dict(type='para', top=ln['top'], bottom=ln['bottom'], text=t, x0=ln['x0'])
        prev = ln
    flush()
    blocks.sort(key=lambda b: b['top'])
    return merge_header_tables(blocks)


def merge_header_tables(blocks):
    """선이 머리글에만 그어진 표: 숫자 없는 짧은 선 표(머리글) 바로 아래에 선 없는 표(본문)가 붙어 있으면 하나로 합친다.
    본문 칸 경계와 머리글 칸 경계가 달라서 머리글은 줄 단위 문자열(head_text)로 붙인다."""
    out = []
    for b in blocks:
        p = out[-1] if out else None
        if (p and b['type'] == 'table' and b['kind'] == 'aligned' and p['type'] == 'table' and p['kind'].startswith('ruled')
                and 0 <= b['top'] - p['bottom'] < 25 and len(p['rows']) <= 5
                and not any(NUM.match(c.replace(' ', '')) and not re.fullmatch(r'(19|20)\d\d', c.replace(' ', '')) for r in p['rows'] for c in r if c)):
            head = ' / '.join(' '.join(c for c in r if c) for r in p['rows'] if any(r))
            merged = dict(b, top=p['top'], kind='ruled-head+aligned', head_text=head)
            out[-1] = merged
            continue
        out.append(b)
    return out


def pdf_pages(raw):
    """PDF 바이트 → [{page, blocks}]. 한 쪽 분석이 실패하면 그 쪽만 일반 텍스트 문단으로 둔다(내용을 잃지 않게)."""
    import pdfplumber
    pages = []
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        for i, page in enumerate(pdf.pages):
            try:
                blocks = page_blocks(page)
            except Exception:
                text = ' '.join((page.extract_text() or '').split())
                blocks = [dict(type='para', top=0, text=text)] if text else []
            pages.append(dict(page=i + 1, blocks=blocks))
            page.close()  # 쪽마다 캐시를 비운다(큰 PDF 메모리)
    return pages


if __name__ == '__main__':
    # 그래프 테두리(축 라벨·등간격 눈금)는 표가 아니고, 연도 행이 등간격인 표는 표다
    assert looks_like_chart([["'22.1/4", ''], ['', "'22.2/4"], ["'22.3/4", ''], ['5.0', '']])
    assert looks_like_chart([['10'], ['5'], ['0'], ['-5'], ['-10']])
    assert not looks_like_chart([['2020', '1,234', '5.1'], ['2021', '1,300', '5.4'], ['2022', '1,350', '3.8']])
    assert not looks_like_chart([['2019'], ['2020'], ['2021'], ['2022']])
    head = dict(type='table', kind='ruled', top=0, bottom=20, rows=[['구분', '2022', '2023']])
    body = dict(type='table', kind='aligned', top=30, bottom=90, rows=[['전체', '1', '2']])
    merged = merge_header_tables([head, body])
    assert len(merged) == 1 and merged[0]['head_text'] == '구분 2022 2023' and merged[0]['kind'] == 'ruled-head+aligned'
    print('ok')
