"""근거 후보 만들기 — 표 행 단위 검색 + 숫자 색인 + 맥락 색인 + 가공 표(기본 검색 방식 kc-band-table-ctx).

연구: ai-newsroom-os/research/mushroom-body-redesign (P13·P14·P16·P19·P23·P27, 2026-10-19). 개발셋 859주장 단일@1/합침@5
기존 청크 검색 대비 78.8→83.7 / 95.9→98.3, Real20(222주장) 85.1→88.3 / 97.3→98.2.
1) 단위: 표 청크는 행마다 [표 제목·머리글 + 행] 하나(벡터는 원래 청크 것), 나머지 청크는 그대로.
2) 단위 순위 = KC 밴드(값 서명 밴드) 상위 100 + BM25 상위 100 RRF.
3) 숫자 재정렬(주장의 드문 값을 가진 단위 위로) → 드문 숫자 색인과 RRF(=C) → 맥락 색인 v2 와 RRF.
   맥락 색인: 주장 숫자마다 그 문장 낱말(숫자에서 멀수록 가볍게), 단위 숫자마다 표 제목·머리글+행 / 숫자가 든 문장+청크 첫 줄.
   값이 맞고 낱말이 겹칠 때 idf(값) × Σ idf(낱말)×거리 무게.
4) 가공 표: 순위대로 훑어 같은 표 행은 한 후보로 묶고(상위 40단위까지), 주장 숫자 중 빠진 값은 같은 표의 행에서 모으고,
   주장 숫자가 많이 맞는 행을 머리글 바로 아래로(행은 지우지 않음). 후보 최대 10개.
상수·규칙을 바꾸면 연구 결과와 달라진다. 동등성: research .../scripts/p30_app_parity.py
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict

from .fusion import BM25, rrf
from .kc_band import KCIndex, KOR, NUM1, sig, sig_match, text_sigs, value_band_tokens

UNIT_LIST, N_SCAN, SLOTS = 100, 40, 10
RARE_DF = 3
_NUMTOK = re.compile(r"^[-+△▽]?[\d,.]+%?p?$|^\([-\d.,]+\)$")
WORD = re.compile(r"[가-힣A-Za-z]{2,}")
_JOSA = re.compile(r"(으로|에서|에게|까지|부터|보다|이며|이고|이나|으며|라고|에는|에도|와는|과는|은|는|이|가|을|를|의|도|로|와|과|에|만)$")
_STOP = {"지난해", "지난달", "올해", "이번", "전년", "전월", "대비", "동월", "동기", "기록", "집계", "나타", "각각", "증가", "감소",
         "늘었", "줄었", "상승", "하락", "이후", "가장", "이는", "수준", "이어", "반면", "다만", "또한", "한편", "모두"}


def _is_year(f):
    return len(f) == 4 and f[:2] in ("19", "20")


def _is_row(line):
    toks = line.split()
    nums = sum(bool(_NUMTOK.match(t)) for t in toks)
    return nums >= 2 and nums / max(len(toks), 1) >= 0.5


def _split_rows(rows):
    split = []
    for row in rows:
        toks = row.split()
        k = next((i for i, t in enumerate(toks) if _NUMTOK.match(t)), 0)
        split.append({"label": " ".join(toks[:k]), "cells": toks[k:]})
    return split


def table_view(ctx, rows, meta=None, infos=None):
    """화면 표시용 표 구조 {caption, header, header_rows?, rows: [{label, cells, path?}]}.
    meta·infos(PDF 표, pdf_chunker.table_chunks): 청커가 PDF 칸 그대로 읽은 머리글({line, cells, rows, note})과 행마다 칸·상위 행
    경로(infos: 줄 → {label, cells, path}). 고른 행이 모두 infos 에 있으면 추측하지 않고 그대로 쓴다 — 여러 칸에 걸친 머리글
    ('2025. 8' 아래 인구·취업자·고용률), 띄어쓰기가 든 열 제목('2026.8월말 (a)'), 한 칸에 숫자 두 개('45,779 100.0')도 칸이 맞는다.
    글 속 머리글 줄(line)은 caption 에서 뺀다.
    그 밖(PDF 가 아닌 자료 등): 표 머리 마지막 줄의 토큰 수가 값 칸 수와 같을 때만 열 제목(아니면 caption 에 남긴다)."""
    caption = [l.strip() for l in (ctx or "").split("\n") if l.strip()]
    line = (meta or {}).get("line") or ""
    picked = [r for r in rows if r != line]
    if meta and picked and infos and all(infos.get(r) for r in picked):
        note = meta.get("note") or ""
        caption = [note if l == line else l for l in caption] if line in caption else caption + [note]
        out = {"caption": [l for l in caption if l], "header": meta.get("cells") or None,
               "rows": [{"label": infos[r]["label"], "cells": infos[r]["cells"], "path": infos[r]["path"]} for r in picked]}
        if meta.get("rows"):
            out["header_rows"] = meta["rows"]
        return out
    split = _split_rows(rows)
    width = max((len(r["cells"]) for r in split), default=0)
    head = caption[-1].split() if caption else []
    header = head if width and len(head) in (width, width + 1) else None  # 칸 하나 더면 첫 칸은 행 이름 열 제목('구분')
    return {"caption": caption[:-1] if header else caption, "header": header, "rows": split}


def units_of(chunks):
    """chunks: [{text, kind, table_meta?}]. 표 청크는 행 단위로 나눈다. 반환: [{text, parent, table, row, ctx, meta, info}].
    meta·info: 청커가 넘긴 표 구조(PDF 표만)와 그 행의 칸·상위 행 경로 — 화면 표와 판정기에 보낼 글에만 쓰고 순위에는 쓰지 않는다.
    meta 의 머리글 줄은 숫자처럼 보여도('2025. 8 인구 …') 행이 아니라 머리글이다."""
    out, last_ctx, last_meta = [], "", None
    for ci, c in enumerate(chunks):
        text, kind = str(c.get("text") or ""), c.get("kind")
        lines = [l for l in text.split("\n") if l.strip()]
        meta = c.get("table_meta") if kind == "table" else None
        head = (meta or {}).get("line")
        is_row = lambda l: _is_row(l) and l != head
        rows = [l for l in lines if is_row(l)] if kind == "table" else []
        if kind != "table" or not rows:
            out.append(dict(text=text, parent=ci, table=None, row=None, ctx=None, meta=None, info=None))
            continue
        k = next(i for i, l in enumerate(lines) if is_row(l))
        ctx = "\n".join(lines[:k]) or last_ctx  # 머리글 없는 이어진 청크는 앞 표의 머리글을 쓴다
        meta = meta or (last_meta if not lines[:k] else None)
        last_ctx, last_meta = ctx, meta
        body = {b["line"]: b for b in (meta or {}).get("body") or []}
        # 검색 단위 글에는 PDF 표의 머리글 줄(열 제목을 칸마다 펼친 긴 줄)을 넣지 않는다 — 모든 행에 같은 긴 줄이 붙으면 행 점수가
        # 흐려진다(고용동향 시험 33주장: 넣으면 상위 5 적중 0.879→0.818). 맥락 색인(tags)과 판정기에 보낼 글(ctx)에는 그대로 둔다.
        search_ctx = "\n".join(x for x in ctx.split("\n") if x != (meta or {}).get("line"))
        tkey = (ctx.split("\n")[0], ci if not ctx else 0)
        for l in lines[k:]:
            out.append(dict(text=(search_ctx + "\n" + l).strip(), parent=ci, table=tkey, row=l, ctx=ctx, meta=meta, info=body.get(l)))
    return out


def _with_path(row, info):
    """판정기에 보낼 행 줄: 상위 행 경로를 앞에 붙인다('남자 › 20～29세 2,828 …') — 같은 이름의 행을 가르게."""
    path = (info or {}).get("path") or []
    return " › ".join(path) + " › " + row if path else row


def claim_numbers(q):
    """주장 숫자 서명 중 연도·두 자리 이하 정수 제외('8조3010억' 안의 조각은 따로 세지 않음)."""
    out = set()
    spans = [m.span() for m in KOR.finditer(q)]
    for m in NUM1.finditer(q):
        if any(a <= m.start() < b for a, b in spans):
            continue
        raw = m.group(0).replace(",", "")
        if "." not in raw and (len(raw) <= 2 or _is_year(raw)):
            continue
        s = sig(raw)
        if s:
            out.add(s)
    for m in KOR.finditer(q):
        s = sig(m.group(0))
        if s:
            out.add(s)
    return out


def _nums_with_pos(text):
    """[(서명, 시작, 끝)] — 한국식 표기는 통째로. 한 자리 정수·연도는 뺀다."""
    out, spans = [], []
    for m in KOR.finditer(text):
        s = sig(m.group(0))
        if s:
            out.append((s, m.start(), m.end()))
        spans.append(m.span())
    for m in NUM1.finditer(text):
        if any(a <= m.start() < b for a, b in spans):
            continue
        raw = m.group(0).replace(",", "")
        if "." not in raw and (len(raw) == 1 or _is_year(raw)):
            continue
        s = sig(raw)
        if s:
            out.append((s, m.start(), m.end()))
    return out


def _stem(w):
    w = _JOSA.sub("", w)
    return w if len(w) >= 2 and w not in _STOP else None


def _claim_items(q):
    """주장 숫자(유효숫자 2자리 이상)마다 (서명, {낱말: 거리 무게})."""
    toks = [(m.start(), _stem(m.group(0))) for m in WORD.finditer(q)]
    items = []
    for s, a, _ in _nums_with_pos(q):
        if len(s) < 2:
            continue
        ws = {}
        for pos, w in toks:
            if w:
                dist = len(WORD.findall(q[min(pos, a):max(pos, a)]))
                ws[w] = max(ws.get(w, 0), 1 / (1 + dist / 4))
        items.append((s, ws))
    return items


class UnitIndex:
    """후보 청크 집합의 단위·순위용 색인(문서 쪽)을 한 번만 만든다(retrieval.ChunkIndex 가 들고 있다)."""

    def __init__(self, chunks, chunk_vectors):
        self.units = units_of(chunks)
        texts = [u["text"] for u in self.units]
        self.kc = KCIndex(texts, chunk_vectors[[u["parent"] for u in self.units]], bands=value_band_tokens)
        self.bm25 = BM25(texts)
        self.usigs = [text_sigs(u["row"] or u["text"]) for u in self.units]
        self.df = Counter(f for s in self.usigs for f in s)
        self.by_table = defaultdict(list)
        for ui, u in enumerate(self.units):
            if u["table"] is not None:
                self.by_table[u["table"]].append(ui)
        self.tags = []
        for u in self.units:
            if u["table"] is not None:
                tag = (u["ctx"] or "") + " " + u["row"]
                self.tags.append([(s, tag) for s, _, _ in _nums_with_pos(u["row"])])
            else:
                t = u["text"]
                head = t.split("\n")[0][:80]
                spans = [(m.start(), m.end()) for m in re.finditer(r"[^\n]+?(?:다\.|$)", t)] or [(0, len(t))]
                tg = []
                for s, a, b in _nums_with_pos(t):
                    sa, sb = next(((x, y) for x, y in spans if x <= a < y), (max(0, a - 80), b + 80))
                    tg.append((s, head + " " + t[sa:sb]))
                self.tags.append(tg)
        self.tag_texts = [(u["row"] or u["text"]) + " " + (u["ctx"] or "") for u in self.units]
        self.tag_df = Counter(s for tg in self.tags for s in {x for x, _ in tg})
        self._wdf = {}

    def _base(self, query, query_vec):
        return rrf([self.kc.top(query, query_vec, UNIT_LIST), self.bm25.top(query, UNIT_LIST)], UNIT_LIST)

    def _numrerank(self, order, q):
        qs = {f for f in text_sigs(q) if not _is_year(f) and len(f) >= 3}
        if not qs:
            return order
        n = len(self.units)
        sc = {ui: sum(math.log(n / self.df[f]) for f in qs & self.usigs[ui]) for ui in order}
        return rrf([order, sorted(order, key=lambda ui: -sc[ui])], UNIT_LIST)  # sorted 는 안정 정렬 = 원래 순서로 동점 처리

    def _num_index(self, q):
        score = Counter()
        n = len(self.units)
        for c in claim_numbers(q):
            h = [ui for ui, s in enumerate(self.usigs) if sig_match(c, s)]
            if 0 < len(h) <= RARE_DF:
                for ui in h:
                    score[ui] += math.log(n / len(h))
        return [ui for ui, _ in sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))]

    def _ctx_index(self, q):
        n = len(self.units)
        score = Counter()
        for c, ws in _claim_items(q):
            for w in ws:
                if w not in self._wdf:
                    self._wdf[w] = sum(1 for t in self.tag_texts if w in t)
            widf = {w: math.log(1 + n / (1 + self._wdf[w])) for w in ws}
            num_idf = math.log(1 + n / max(1, self.tag_df.get(c, 1)))
            for ui, tg in enumerate(self.tags):
                best = 0.0
                for s, tag in tg:
                    if s == c or sig_match(c, {s}):
                        best = max(best, sum(widf[w] * d for w, d in ws.items() if w in tag))
                if best:
                    score[ui] += num_idf * best
        return [ui for ui, _ in sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))]

    def order(self, query, query_vec):
        base = self._numrerank(self._base(query, query_vec), query)
        ni = self._num_index(query)
        c = rrf([base, ni], 200) if ni else base
        ci = self._ctx_index(query)
        return rrf([c, ci], 200) if ci else c

    def candidates(self, query, query_vec, exclude=()):
        """[(글, 부모 청크 번호 집합, 표 구조|None)] 최대 10개. exclude: 이미 보낸 글(그 줄만으로 된 후보는 뺀다, 재검색용)."""
        units, qn = self.units, claim_numbers(query)
        sent = {l for t in exclude for l in t.splitlines()}
        slots, where = [], {}
        for r, ui in enumerate(self.order(query, query_vec)):
            u = units[ui]
            if u["table"] is None:
                key = ("c", u["parent"])
                if key not in where and len(slots) < SLOTS:
                    where[key] = len(slots)
                    slots.append(dict(table=None, text=u["text"], src={u["parent"]}))
            else:
                key = ("t", u["table"])
                if key in where:
                    s = slots[where[key]]
                    if r < N_SCAN and u["row"] not in s["rows"]:
                        s["rows"].append(u["row"])
                        s["infos"][u["row"]] = u["info"]
                        s["src"].add(u["parent"])
                elif len(slots) < SLOTS:
                    where[key] = len(slots)
                    slots.append(dict(table=u["table"], ctx=u["ctx"], meta=u["meta"], rows=[u["row"]], infos={u["row"]: u["info"]},
                                      src={u["parent"]}))
            if len(slots) >= SLOTS and r >= N_SCAN:
                break
        out = []
        for s in slots:
            if s["table"] is None:
                out.append((s["text"], s["src"], None))
                continue
            have = text_sigs("\n".join(s["rows"]))
            for c in qn:  # 모으기: 주장 숫자 중 이 표에 아직 없는 값을 같은 표의 다른 행에서
                if sig_match(c, have):
                    continue
                for ui in self.by_table[s["table"]]:
                    if units[ui]["row"] not in s["rows"] and sig_match(c, self.usigs[ui]):
                        s["rows"].append(units[ui]["row"])
                        s["infos"][units[ui]["row"]] = units[ui]["info"]
                        s["src"].add(units[ui]["parent"])
                        have |= self.usigs[ui]
                        break
            hits = {row: -sum(1 for c in qn if sig_match(c, text_sigs(row))) for row in s["rows"]} if qn else {}
            rows = sorted(s["rows"], key=lambda row: hits.get(row, 0))  # 앞으로: 주장 숫자가 많이 맞는 행부터(안정 정렬)
            text = "\n".join([s["ctx"]] + [_with_path(row, s["infos"].get(row)) for row in rows]).strip()
            out.append((text, s["src"], table_view(s["ctx"], rows, s["meta"], s["infos"])))
        return [o for o in out if not sent or set(o[0].splitlines()) - sent]
