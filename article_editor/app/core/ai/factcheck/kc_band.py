"""근거 검색 순위 — 입력 확장 버섯체(KC) + 숫자 SimHash 밴드 + BM25 를 RRF 로 합친다.

연구: ai-newsroom-os/research/mushroom-body-redesign (P4~P11, 2026-10-16~18).
- KC 입력 = [중심화·정규화 Qwen 임베딩, 0.5 × 한글 2-gram·영숫자 해시 tf-idf(4096) + 숫자 SimHash 밴드 토큰].
- 가우시안 투영 8개(시드 101…1511), KC 2560개, 상위 10%(256) 승자, 점수 = 8개 코드 겹침 합.
- 숫자 밴드: 숫자(단위 전개·끝 0 제거)의 3자리 조각을 SimHash 32비트로 묶고 8비트 밴드 4개를 토큰으로(BLEND, Firtina 2023).
- 최종 = KC 상위 50 + BM25 상위 50 의 RRF(K60). Real20 Hit@5 77.8(DenseFly2+BM25 65.0).
연구는 torch 난수로 투영을 만들었고 여기서는 numpy 로 만든다(행 단위 시드, 같은 분포). 동등성: dev/tests/test_kc_band.py
"""
from __future__ import annotations

import math
import re
from collections import Counter
from decimal import Decimal
from functools import lru_cache

import numpy as np

from .fusion import LIST_K, rrf

SEEDS = (101, 307, 509, 701, 907, 1103, 1301, 1511)
DIM, LEX_DIM, KCS, BETA = 1024, 4096, 2560, 0.5
WINNERS = math.ceil(0.10 * KCS)
UNIT = {"조": 10 ** 12, "억": 10 ** 8, "만": 10 ** 4, "천": 10 ** 3}
_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?(?:\s*[조억만천])?(?:\s*\d[\d,]*(?:\.\d+)?\s*[억만천]?)*")
_NUM_COMMA = re.compile(r"(?<=\d),(?=\d{3}(?!\d))")
_PIECE = re.compile(r"[가-힣]+|[A-Za-z0-9]+(?:\.[0-9]+)?")


@lru_cache(maxsize=1 << 17)
def fnv(text):
    h = 2166136261
    for ch in text.encode("utf-8"):
        h = ((h ^ ch) * 16777619) & 0xFFFFFFFF
    return h


def char_tokens(text):
    """한글은 2-gram, 영숫자는 낱말(소문자). 천 단위 쉼표는 먼저 지운다."""
    out = []
    for m in _PIECE.findall(_NUM_COMMA.sub("", text or "")):
        out += ([m[i:i + 2] for i in range(len(m) - 1)] or [m]) if "가" <= m[0] <= "힣" else [m.lower()]
    return out


def number_band_tokens(text):
    out = []
    for m in _NUM.finditer(text or ""):
        s = m.group(0)
        forms = {re.sub(r"\D", "", s.split(".")[0])}
        parts = re.findall(r"(\d[\d,]*(?:\.\d+)?)\s*([조억만천]?)", s)
        if any(u for _, u in parts):  # 2915만1000 → 29151000
            forms.add(str(int(round(sum(float(n.replace(",", "")) * UNIT.get(u, 1) for n, u in parts)))))
        for f in forms:
            f = f.rstrip("0") or f
            acc = [0] * 32
            for k in [f[i:i + 3] for i in range(len(f) - 2)] or [f]:
                h = fnv("k" + k)
                for b in range(32):
                    acc[b] += 1 if (h >> b) & 1 else -1
            fp = sum(1 << b for b in range(32) if acc[b] > 0)
            out += [f"#S{band}_{(fp >> (8 * band)) & 255}" for band in range(4)]
    return out


# 값 서명(연구 p13_real20·p14_numfix): 숫자는 하나씩 뽑고(띄어 쓴 표 숫자를 한 덩어리로 묶지 않음), 단위가 붙은 한국식 숫자만 묶는다.
# 서명 = 단위 풀고 소수점·쉼표·앞뒤 0 제거. 4,405.6억 = 4405억6000만 = '44056'.
_BIG = (("조", 10 ** 12), ("억", 10 ** 8), ("만", 10 ** 4))
_SMALL = (("천", 1000), ("백", 100), ("십", 10))
NUM1 = re.compile(r"\d[\d,]*(?:\.\d+)?")
KOR = re.compile(r"\d[\d,]*(?:\.\d+)?\s*[조억만천백십]+(?:\s*\d[\d,]*(?:\.\d+)?\s*[조억만천백십]*)*")


def _small(seg):
    seg = seg.replace(",", "").replace(" ", "")
    if not seg:
        return Decimal(0)
    total = Decimal(0)
    for u, m in _SMALL:
        if u in seg:
            head, seg = seg.split(u, 1)
            total += (Decimal(head) if head else Decimal(1)) * m
    return total + (Decimal(seg) if seg else 0)


def kor_value(s):
    """한국식 숫자: 1천406억2천만 = 1406억2000만, 4억9천279만, 1조 6,404억."""
    s = s.replace(" ", "")
    total = Decimal(0)
    for u, m in _BIG:
        if u in s:
            head, s = s.split(u, 1)
            total += _small(head) * m
    return total + _small(s)


def _sig_of_value(v):
    return format(v, "f").replace(".", "").strip("0") or "0"


def sig(s):
    s = s.strip()
    m = KOR.search(s)
    if m:
        try:
            return _sig_of_value(kor_value(m.group(0)))
        except Exception:
            pass
    m = NUM1.search(s)
    return _sig_of_value(Decimal(m.group(0).replace(",", ""))) if m else None


def text_sigs(text):
    """글 속 숫자 하나하나 + 단위가 붙은 한국식 숫자의 값 서명 집합."""
    out = {_sig_of_value(Decimal(m.group(0).replace(",", ""))) for m in NUM1.finditer(text or "")}
    for m in KOR.finditer(text or ""):
        try:
            out.add(_sig_of_value(kor_value(m.group(0))))
        except Exception:
            pass
    return out


def _rounds_to(t, c):
    if len(t) <= len(c):
        return t == c
    head, rest = int(t[:len(c)]), t[len(c):]
    return str(head) == c or (rest[0] >= "5" and str(head + 1) == c)


def sig_match(c, sigs):
    """정확히 같거나, 세 자리 이상 숫자는 반올림 허용(1406.2→1406). 짧은 숫자는 우연 일치가 많아 정확 일치만."""
    return c in sigs or (len(c) >= 3 and any(_rounds_to(t, c) for t in sigs))


def value_band_tokens(text):
    """값 서명마다 SimHash 밴드 4개(연구 p14 band_tokens_v2). number_band_tokens 는 표 숫자 여러 개를 한 덩어리로 묶는 버그가 있다."""
    out = []
    for f in sorted(text_sigs(text)):
        acc = [0] * 32
        for k in [f[i:i + 3] for i in range(len(f) - 2)] or [f]:
            h = fnv("k" + k)
            for b in range(32):
                acc[b] += 1 if (h >> b) & 1 else -1
        fp = sum(1 << b for b in range(32) if acc[b] > 0)
        out += [f"#S{band}_{(fp >> (8 * band)) & 255}" for band in range(4)]
    return out


def lexical(texts, idf=None, bands=number_band_tokens):
    """해시 tf-idf(L2 정규화). idf 는 후보 청크 집합에서 만들고 질의에도 같은 것을 쓴다."""
    toks = [char_tokens(t) + bands(t) for t in texts]
    if idf is None:
        df = Counter(t for ts in toks for t in set(ts))
        idf = {t: math.log(1 + (len(texts) - c + 0.5) / (c + 0.5)) for t, c in df.items()}
    x = np.zeros((len(texts), LEX_DIM), dtype=np.float32)
    for i, ts in enumerate(toks):
        for t, f in Counter(ts).items():
            if t in idf:
                x[i, fnv(t) % LEX_DIM] += (1 + math.log(f)) * idf[t]
    return x / np.maximum(np.linalg.norm(x, axis=1, keepdims=True), 1e-9), idf


def _center(vecs):
    e = np.asarray(vecs, dtype=np.float32)
    e = e - e.mean(axis=1, keepdims=True)
    return e / np.maximum(np.linalg.norm(e, axis=1, keepdims=True), 1e-9)


def _row(seed, r):
    # ponytail: 행마다 난수를 새로 만든다(후보 140청크 색인 ≈3초, 질의 ≈0.07초). 느려지면 행을 float16 으로 캐시.
    return np.random.default_rng((seed, r)).standard_normal(KCS, dtype=np.float32)


@lru_cache(maxsize=len(SEEDS))
def _dense_projection(seed, dim=DIM):
    return np.stack([_row(seed, r) for r in range(dim)])  # 1024×2560, 시드당 10MB


def winners(emb, lex, seed):
    """행마다 승자 KC 번호(n×256). 희소 입력의 어휘 쪽은 쓰인 행만 만든다(4096행 전체를 들고 있지 않음)."""
    act = emb @ _dense_projection(seed, emb.shape[1])
    cols = np.flatnonzero(lex.any(axis=0))
    if len(cols):
        act += (BETA * lex[:, cols]) @ np.stack([_row(seed, DIM + int(c)) for c in cols])
    return np.argpartition(-act, WINNERS - 1, axis=1)[:, :WINNERS].astype(np.int16)


class KCIndex:
    """후보 청크 집합의 문서 쪽 계산(idf·승자 KC)을 한 번만 한다. 코드는 승자 번호로만 들고 있다(청크 3천 개 ≈ 12MB)."""

    def __init__(self, texts, doc_vecs, bands=number_band_tokens):
        emb = _center(doc_vecs)
        self.bands = bands
        lex, self.idf = lexical(texts, bands=bands)
        self.doc_winners = [winners(emb, lex, s) for s in SEEDS]

    def scores(self, query, query_vec):
        """청크마다 8개 코드의 겹침 합."""
        emb = _center(np.asarray(query_vec)[None, :])
        lex, _ = lexical([query], self.idf, self.bands)
        total = np.zeros(len(self.doc_winners[0]), dtype=np.int32)
        for dw, s in zip(self.doc_winners, SEEDS):
            q = np.zeros(KCS, dtype=np.int32)
            q[winners(emb, lex, s)[0]] = 1
            total += q[dw].sum(axis=1)
        return total

    def top(self, query, query_vec, k=LIST_K):
        score = self.scores(query, query_vec)
        return np.lexsort((np.arange(len(score)), -score))[:k]


def fused_order(query, query_vec, kc_index, bm25, k=LIST_K):
    return rrf([kc_index.top(query, query_vec), bm25.top(query)], k)
