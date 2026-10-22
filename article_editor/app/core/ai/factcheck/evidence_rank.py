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


def _labeled(line):
    """행 이름이 있는 데이터 행. 숫자로 시작하는 '행'(2024 2025p 2026p 같은 연도 머리 줄)은 아니다."""
    return _is_row(line) and not _NUMTOK.match(line.split()[0])


def table_view(ctx, rows, head=()):
    """화면 표시용 표 구조. 행은 청크를 쪼갤 때 이미 _is_row 로 고른 줄이라 여기서는 칸만 나눈다.
    head: 청크에서 첫 데이터 행 앞의 열 머리 줄(units_of). 행 목록에 섞여 온 머리 줄·글자 조각('생')은 뺀다.
    header: 머리 줄 중 토큰 수가 값 칸 수(또는 +1)와 같은 마지막 줄 → 열 제목, 나머지 머리 줄은 caption."""
    split = []
    for row in rows:
        if row in head or not _is_row(row):
            continue
        toks = row.split()
        k = next((i for i, t in enumerate(toks) if _NUMTOK.match(t)), 0)
        split.append({"label": " ".join(toks[:k]), "cells": toks[k:]})
    caption = [l.strip() for l in (ctx or "").split("\n") if l.strip()] + list(head)
    counts = [len(r["cells"]) for r in split]
    width = max(counts, key=counts.count) if counts else 0  # 가장 흔한 칸 수(주석 칸이 붙은 행이 있어도)
    at = next((i for i in range(len(caption) - 1, -1, -1) if width and len(caption[i].split()) in (width, width + 1)), None)
    header = caption.pop(at).split() if at is not None else None  # 칸 하나 더면 첫 칸은 행 이름 열 제목('구분')
    return {"caption": caption, "header": header, "rows": split}


def units_of(chunks):
    """chunks: [{text, kind}]. 표 청크는 행 단위로 나눈다. 반환: [{text, parent, table, row, ctx, head}].
    head 는 화면 표시용(열 머리 줄)이고 검색 글(text)에는 넣지 않는다."""
    out, last_ctx, heads = [], "", {}
    for ci, c in enumerate(chunks):
        text, kind = str(c.get("text") or ""), c.get("kind")
        lines = [l for l in text.split("\n") if l.strip()]
        rows = [l for l in lines if _is_row(l)] if kind == "table" else []
        if kind != "table" or not rows:
            out.append(dict(text=text, parent=ci, table=None, row=None, ctx=None, head=()))
            continue
        k = next(i for i, l in enumerate(lines) if _is_row(l))
        ctx = "\n".join(lines[:k]) or last_ctx  # 머리글 없는 이어진 청크는 앞 표의 머리글을 쓴다
        last_ctx = ctx
        tkey = (ctx.split("\n")[0], ci if not ctx else 0)
        d = next((i for i in range(k, len(lines)) if _labeled(lines[i])), k)
        head = tuple(lines[k:d])
        if head:  # 이어진 페이지 조각은 머리 줄 없이 표 제목만 반복된다 — 같은 제목 줄을 가진 앞 조각의 열 머리를 쓴다
            heads.update({l: head for l in ctx.split("\n")})
        else:
            head = next((heads[l] for l in ctx.split("\n") if l in heads), ())
        for l in lines[k:]:
            out.append(dict(text=(ctx + "\n" + l).strip(), parent=ci, table=tkey, row=l, ctx=ctx, head=head))
    return out


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
                        s["src"].add(u["parent"])
                elif len(slots) < SLOTS:
                    where[key] = len(slots)
                    slots.append(dict(table=u["table"], ctx=u["ctx"], head=u["head"], rows=[u["row"]], src={u["parent"]}))
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
                        s["src"].add(units[ui]["parent"])
                        have |= self.usigs[ui]
                        break
            hits = {row: -sum(1 for c in qn if sig_match(c, text_sigs(row))) for row in s["rows"]} if qn else {}
            rows = sorted(s["rows"], key=lambda row: hits.get(row, 0))  # 앞으로: 주장 숫자가 많이 맞는 행부터(안정 정렬)
            out.append(((s["ctx"] + "\n" + "\n".join(rows)).strip(), s["src"], table_view(s["ctx"], rows, s["head"])))
        return [o for o in out if not sent or set(o[0].splitlines()) - sent]
