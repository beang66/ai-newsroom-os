"""근거 검색 순위 — DenseFly(시드 2개) + BM25 를 RRF 로 합친다.

버섯체 연구 archive-os.v2/research/mushroom-retrieval/active/benchmark_densefly_bm25_fusion_v1.py 의
"RRF_equal" 을 그대로 옮겼다(2026-10-02 기준 최적: 패러프레이즈 스트레스 Hit@10 28/30, exact 대비 손실 0).
상수·동점 처리·토크나이저를 바꾸면 연구 결과와 달라지므로 연구 쪽 갱신을 따라서만 바꾼다.
동일성 검증: dev/tests/test_factcheck.py::FusionParityTests
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from functools import lru_cache

import numpy as np

SEEDS = (101, 307)
DIM, HASH_DIM, DENSITY = 1024, 2560, 0.1
LIST_K, RRF_K = 50, 60
_TOKEN = re.compile(r"[가-힣A-Za-z0-9]+(?:\.[0-9]+)?")


def tokenize(text):
    return [t.lower() for t in _TOKEN.findall(text or "")]


class BM25:
    def __init__(self, docs, k1=1.5, b=0.75):
        self.docs = [tokenize(x) for x in docs]
        self.N, self.k1, self.b = len(docs), k1, b
        self.dl = np.asarray([len(x) for x in self.docs], dtype=np.float32)
        self.avg = float(self.dl.mean()) if self.N else 0.0
        self.post, df = defaultdict(list), Counter()
        for i, toks in enumerate(self.docs):
            for t, f in Counter(toks).items():
                self.post[t].append((i, f))
                df[t] += 1
        self.idf = {t: math.log(1 + (self.N - n + 0.5) / (n + 0.5)) for t, n in df.items()}

    def top(self, query, k=LIST_K):
        s = np.zeros(self.N, dtype=np.float32)
        for t in tokenize(query):
            for i, f in self.post.get(t, ()):
                den = f + self.k1 * (1 - self.b + self.b * self.dl[i] / self.avg)
                s[i] += self.idf[t] * (f * (self.k1 + 1) / den)
        return np.argsort(-s, kind="stable")[:k]


@lru_cache(maxsize=len(SEEDS))
def _projection(seed):
    return np.random.RandomState(seed).random_sample((DIM, HASH_DIM)) < DENSITY


def doc_codes(doc_vecs, seed):
    """문서 쪽 희소 이진 코드. 질의와 무관하므로 후보 집합마다 한 번만 만들어 재사용한다(retrieval.ChunkIndex)."""
    return ((doc_vecs - doc_vecs.mean(axis=1, keepdims=True)) @ _projection(seed)) > 0


def densefly_top(doc_vecs, query_vec, seed, k=LIST_K, codes=None):
    """행 평균을 뺀 벡터를 희소 이진 투영 → 부호 → 해밍 거리 오름차순. codes: 미리 만든 doc_codes(없으면 여기서 계산)."""
    w = _projection(seed)
    docs = codes if codes is not None else doc_codes(doc_vecs, seed)
    q = ((query_vec - query_vec.mean()) @ w) > 0
    dist = np.count_nonzero(docs != q[None, :], axis=1)
    return np.argsort(dist, kind="stable")[:k]


def rrf(lists, k=LIST_K):
    score = {}
    for ranked in lists:
        for r, doc in enumerate(ranked, start=1):
            score[int(doc)] = score.get(int(doc), 0) + 1 / (RRF_K + r)
    return [d for d, _ in sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))[:k]]


def fused_order(texts, doc_vecs, query, query_vec, k=LIST_K, bm25=None, codes=None):
    """후보 청크 인덱스를 융합 순위대로 돌려준다(최대 k개). bm25·codes 는 미리 만든 문서 쪽 색인(없으면 여기서 계산)."""
    bm = bm25 if bm25 is not None else BM25(texts)
    lists = [densefly_top(doc_vecs, query_vec, s, codes=(codes or {}).get(s)) for s in SEEDS] + [bm.top(query)]
    return rrf(lists, k)
