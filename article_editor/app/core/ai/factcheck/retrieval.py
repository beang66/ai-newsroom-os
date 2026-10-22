"""Pinned Qwen3-Embedding-0.6B retrieval for the production backend.

Single embedding space:
- documents: raw chunk text
- queries: official Qwen retrieval instruction
- last-token pooling
- L2-normalized 1024D vectors
- exact cosine via dot product

Runtime never downloads models implicitly.
"""
from __future__ import annotations

import hashlib
import os
from collections import OrderedDict
from pathlib import Path
import threading
from typing import Iterable

import numpy as np

from ... import vault
from . import paths
MODEL = "Qwen/Qwen3-Embedding-0.6B"
REVISION = "97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3"
TASK = "Given a web search query, retrieve relevant passages that answer the query"
MODEL_ID = f"{MODEL}@{REVISION}:last-token:l2:1024:8192:{TASK}"
MODEL_PATH = paths.TORCH_EMBEDDING_DIR

DEFAULT_K = 10
MAX_K = 150
RETRIEVAL_LABELS = {
    "exact": "Qwen3-Embedding-0.6B exact",
    "densefly-bm25-rrf": "DenseFly x2 (seed 101,307) + BM25 RRF",
    "kc-band-bm25-rrf": "Mushroom-body KC x8 (input-expanded, number SimHash bands) + BM25 RRF",
    "kc-band-table-ctx": "Table-row units, KC x8 value bands + BM25 RRF, number + context index, packed tables",
}
DEFAULT_MODE = "kc-band-table-ctx"


def retrieval_mode() -> str:
    """검색 방식의 단일 기준: 기본 kc-band-table-ctx(표 행 단위 + 숫자·맥락 색인 + 가공 표, evidence_rank.py).
    FACTCHECK_RETRIEVAL=kc-band-bm25-rrf 면 청크 단위 버섯체(kc_band.py), =exact 면 Qwen 코사인만,
    =densefly-bm25-rrf 면 그 이전 방식. 모르는 값은 기본."""
    mode = os.getenv("FACTCHECK_RETRIEVAL", DEFAULT_MODE)
    return mode if mode in RETRIEVAL_LABELS else DEFAULT_MODE


def query_input(text: str) -> str:
    return f"Instruct: {TASK}\nQuery:{text}"


def vector_key(text: str, role: str) -> str:
    payload = MODEL_ID + "\0" + role + "\0" + (text or "")
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class QwenEncoder:
    """Lazy CPU encoder. No implicit downloads and no MiniLM fallback.

    KEEP — 삭제 금지: 로컬 임베딩은 2026-10-08부터 '잠정 폐기'(기본은 원격 /ai/embeddings)일 뿐 코드는 일부러 남겨 둔 것이다.
    용도: ONNX 변환·검증의 torch 기준 구현(개발 전용, FACTCHECK_EMBEDDING_RUNTIME=torch).
    지금 이 코드를 부르는 곳이 없어 보여도(정적 분석·미사용 검사에 걸려도) 지우지 말 것. 되살리려면 FACTCHECK_EMBEDDING_RUNTIME=onnx 로 명시한다.
    """

    def __init__(self, model_path: str | Path | None = None):
        self.path = Path(
            model_path
            or os.getenv("ARCHIVE_EMBEDDING_MODEL_PATH")
            or MODEL_PATH
        )
        self.tokenizer = None
        self.model = None
        self._load_lock = threading.RLock()

    def available(self) -> bool:
        return self.path.is_dir() and (self.path / "model.safetensors").exists()

    def _load(self) -> None:
        if self.model is not None:
            return
        with self._load_lock:
            if self.model is not None:
                return
            if not self.available():
                raise RuntimeError(
                    f"Qwen3 embedding model missing: {self.path}. "
                    "Install the pinned product model before starting retrieval."
                )
            import torch
            from transformers import AutoModel, AutoTokenizer

            self.tokenizer = AutoTokenizer.from_pretrained(
                self.path,
                padding_side="left",
                local_files_only=True,
            )
            self.model = AutoModel.from_pretrained(
                self.path,
                local_files_only=True,
                dtype=torch.float32,
            ).eval()

    def encode(self, texts: list[str], role: str) -> np.ndarray:
        if role not in {"document", "query"}:
            raise ValueError(f"Unknown embedding role: {role}")
        if not texts:
            return np.empty((0, 1024), dtype="<f4")

        self._load()
        import torch

        prepared = [query_input(x) for x in texts] if role == "query" else texts
        result: list[np.ndarray] = []

        with torch.inference_mode():
            for start in range(0, len(prepared), 4):
                values = prepared[start : start + 4]
                batch = self.tokenizer(
                    values,
                    padding=True,
                    truncation=True,
                    max_length=8192,
                    return_tensors="pt",
                )
                hidden = self.model(**batch).last_hidden_state
                vectors = torch.nn.functional.normalize(
                    hidden[:, -1].float(),
                    p=2,
                    dim=1,
                )
                result.append(vectors.cpu().numpy().astype("<f4"))

        return np.concatenate(result, axis=0)


def create_encoder():
    """Preserve the embedding space/cache keys; select only the inference runtime."""
    if paths.embedding_runtime() == 'torch':
        return QwenEncoder()
    # KEEP — 삭제 금지: 아래 'onnx'·'torch' 분기는 로컬 임베딩을 잠정 폐기하며 일부러 남긴 개발·검증·복귀 경로다(2026-10-08).
    if paths.embedding_runtime() == 'onnx':  # 개발·검증용(명시 설정일 때만)
        from .onnx_embedding import OnnxQwenEncoder
        return OnnxQwenEncoder(paths.EMBEDDING_DIR, query_input)
    from .remote_embedding import RemoteQwenEncoder
    return RemoteQwenEncoder(TASK)  # 오프라인이면 색인·팩트체크가 안 된다(로컬 폴백 없음)


class VectorCache:
    """Persistent model/role/text keyed embedding cache — 암호화 저장소(vault)의 embedding_vectors 테이블.

    자료 조각(document) 벡터는 자료를 지울 때 함께 지운다(sources.delete_source).
    ponytail: 팩트체크 질의(query) 벡터와 화면에서 올린 임시 자료의 벡터는 어느 자료에도 묶이지 않아 계속 쌓인다(한 개 약 4KB).
    용량이 문제되면 source_chunks 가 참조하지 않는 오래된 벡터를 정리한다."""

    def __init__(self, encoder: QwenEncoder | None = None):
        self.encoder = encoder if encoder is not None else create_encoder()
        self.lock = threading.RLock()

    @staticmethod
    def validate(values: np.ndarray, count: int) -> None:
        if values.shape != (count, 1024) or not np.isfinite(values).all():
            raise ValueError(
                f"Invalid Qwen3 vector shape/values: {values.shape}, "
                f"expected {(count, 1024)}"
            )
        if count:
            norm_error = float(
                np.max(np.abs(np.linalg.norm(values, axis=1) - 1.0))
            )
            if norm_error > 1e-4:
                raise ValueError(
                    f"Qwen3 vectors must be L2-normalized; max error={norm_error}"
                )

    def encode(self, texts: Iterable[str], role: str) -> np.ndarray:
        texts = list(texts)
        if role not in {"document", "query"}:
            raise ValueError(f"Unknown embedding role: {role}")

        keys = [vector_key(text, role) for text in texts]
        with self.lock:
            found: dict[str, np.ndarray] = {}
            with vault.connect() as db:
                for key in dict.fromkeys(keys):
                    row = db.execute(
                        "SELECT vector FROM embedding_vectors WHERE key=?",
                        (key,),
                    ).fetchone()
                    if row:
                        found[key] = np.frombuffer(row[0], dtype="<f4").copy()

            missing_pairs: list[tuple[str, str]] = []
            seen_missing: set[str] = set()
            for key, text in zip(keys, texts):
                if key not in found and key not in seen_missing:
                    missing_pairs.append((key, text))
                    seen_missing.add(key)

            if missing_pairs:
                vectors = self.encoder.encode(
                    [text for _, text in missing_pairs],
                    role,
                )
                self.validate(vectors, len(missing_pairs))
                with vault.connect() as db:
                    for (key, _), value in zip(missing_pairs, vectors):
                        found[key] = value
                        db.execute(
                            "INSERT OR REPLACE INTO embedding_vectors(key, vector, origin) VALUES (?,?,?)",
                            (key, value.astype("<f4", copy=False).tobytes(), "local-cpu"),
                        )

            result = (
                np.stack([found[key] for key in keys]).astype("<f4", copy=False)
                if keys
                else np.empty((0, 1024), dtype="<f4")
            )
            self.validate(result, len(keys))
            return result


_cache: VectorCache | None = None
_cache_lock = threading.Lock()


def get_vector_cache() -> VectorCache:
    global _cache
    if _cache is None:
        with _cache_lock:
            if _cache is None:
                _cache = VectorCache()
    return _cache


class ChunkIndex:
    """후보 청크 집합의 문서 쪽 계산(벡터 읽기·희소 코드·BM25 색인)을 한 번만 한다.
    주장마다 같은 집합을 다시 읽고 색인하지 않도록 한 요청 안에서 재사용하고(service.review_workspace),
    요청 사이에도 shared_chunk_index 로 재사용한다. 색인이 읽는 것은 청크의 글·종류(kind)뿐이다."""

    def __init__(self, chunks: list[dict], cache: VectorCache | None = None):
        self.chunks = chunks
        self.texts = [str(row.get("text") or "") for row in chunks]
        self.vectors = (cache or get_vector_cache()).encode(self.texts, "document")
        self._fusion = None
        self._kc = None
        self._bm25 = None
        self._units = None
        self._build_lock = threading.RLock()  # 여러 요청이 같은 색인을 함께 쓸 때 같은 계산을 두 번 하지 않게

    def bm25(self):
        with self._build_lock:
            if self._bm25 is None:
                from .fusion import BM25
                self._bm25 = BM25(self.texts)
            return self._bm25

    def fusion_parts(self):
        with self._build_lock:
            if self._fusion is None:
                from .fusion import SEEDS, doc_codes
                self._fusion = (self.bm25(), {seed: doc_codes(self.vectors, seed) for seed in SEEDS})
            return self._fusion

    def kc_index(self):
        with self._build_lock:
            if self._kc is None:
                from .kc_band import KCIndex
                self._kc = KCIndex(self.texts, self.vectors)
            return self._kc

    def unit_index(self):
        with self._build_lock:
            if self._units is None:
                from .evidence_rank import UnitIndex
                self._units = UnitIndex(self.chunks, self.vectors)
            return self._units


# 요청 사이 색인 재사용: 자동 검증은 글이 멈출 때마다(고친 문장만) 돌지만 자료는 그동안 거의 바뀌지 않는다.
# 예전에는 요청마다 색인(표 행 단위 버섯체, 150청크 ≈5초)을 새로 만들고 버렸다.
# 키 = 청크의 글·종류(색인이 읽는 것 전부). 자료가 바뀌면 키가 달라져 새로 만들고, 오래된 것은 SHARED_INDEXES 개를 넘으면 버린다.
# 자료 이름 등 메타데이터는 rank_chunks 가 호출자의 청크에서 붙이므로 키에 넣지 않는다. 로그아웃하면 비운다(clear_shared_indexes).
SHARED_INDEXES = 4
_shared: OrderedDict[str, tuple[object, ChunkIndex]] = OrderedDict()
_shared_lock = threading.Lock()


def _content_key(chunks: list[dict]) -> str:
    digest = hashlib.sha256(MODEL_ID.encode("utf-8"))
    for row in chunks:
        for part in (str(row.get("text") or ""), str(row.get("kind") or "")):
            data = part.encode("utf-8")
            digest.update(len(data).to_bytes(8, "little") + data)
    return digest.hexdigest()


def shared_chunk_index(chunks: list[dict], cache: VectorCache | None = None) -> ChunkIndex:
    """같은 글·종류의 청크 집합이면 이전 요청이 만든 ChunkIndex 를 돌려준다(벡터 캐시가 같을 때만)."""
    cache = cache or get_vector_cache()
    key = _content_key(chunks)
    with _shared_lock:
        entry = _shared.get(key)
        if entry is not None and entry[0] is cache:
            _shared.move_to_end(key)
            return entry[1]
    index = ChunkIndex(chunks, cache)
    with _shared_lock:
        _shared[key] = (cache, index)
        _shared.move_to_end(key)
        while len(_shared) > SHARED_INDEXES:
            _shared.popitem(last=False)
    return index


def clear_shared_indexes() -> None:
    with _shared_lock:
        _shared.clear()


def rank_chunks(
    query: str,
    chunks: list[dict],
    *,
    limit: int = DEFAULT_K,
    cache: VectorCache | None = None,
    index: ChunkIndex | None = None,
    query_vector: np.ndarray | None = None,
    exclude: Iterable[str] = (),
) -> list[dict]:
    """Rank the caller-provided chunk scope.

    기본: 입력 확장 버섯체 + 숫자 밴드 + BM25 RRF (kc_band.py). FACTCHECK_RETRIEVAL=exact 면 Qwen 코사인만,
    =densefly-bm25-rrf 면 이전 DenseFly x2 + BM25 RRF (fusion.py).
    retrieval_score 는 두 방식 모두 Qwen 코사인(판정 단계 호환용)이다.
    query_vector: 미리 만든 질의 벡터(판정기 재검색 요청문처럼 캐시에 남기지 않을 질의). exclude: 이미 보낸 후보 글(kc-band-table-ctx 만)."""

    if not chunks:
        return []

    limit = max(1, min(int(limit), MAX_K, len(chunks)))
    cache = cache or get_vector_cache()
    index = index or ChunkIndex(chunks, cache)  # index 를 받으면 문서 쪽 계산을 다시 하지 않는다
    texts, corpus_vectors = index.texts, index.vectors
    if query_vector is None:
        query_vector = cache.encode([query], "query")[0]

    scores = corpus_vectors @ query_vector
    engine = "qwen3-embedding-0.6b-exact"
    mode = retrieval_mode()
    if mode == "kc-band-table-ctx":
        # 후보 = 단위를 묶은 글(가공 표는 여러 행). 자료 정보·점수는 그 글의 첫 부모 청크 것.
        ranked = []
        for rank, (text, src) in enumerate(index.unit_index().candidates(query, query_vector, exclude)[:limit], 1):
            first = min(src)
            ranked.append({**chunks[first], "text": text, "retrieval_rank": rank,
                           "retrieval_score": float(max(scores[i] for i in src)),
                           "retrieval_engine": "qwen3-embedding-0.6b-kc8-table-ctx"})
        return ranked
    if mode == "exact":
        order = np.lexsort(
            (np.arange(len(chunks), dtype=np.int32), -scores)
        )
    elif mode == "kc-band-bm25-rrf":
        from .fusion import LIST_K
        from .kc_band import fused_order as kc_fused_order
        fused = kc_fused_order(query, query_vector, index.kc_index(), index.bm25(), k=max(limit, LIST_K))
        order = np.asarray(fused, dtype=np.int64)
        engine = "qwen3-embedding-0.6b-kc8-band-bm25-rrf"
    else:
        from .fusion import LIST_K, fused_order
        bm25, codes = index.fusion_parts()
        fused = fused_order(texts, corpus_vectors, query, query_vector, k=max(limit, LIST_K), bm25=bm25, codes=codes)
        order = np.asarray(fused, dtype=np.int64)
        engine = "qwen3-embedding-0.6b-densefly2-bm25-rrf"

    ranked = []
    for rank, idx in enumerate(order[:limit], 1):
        idx = int(idx)
        ranked.append(
            {
                **chunks[idx],
                "retrieval_rank": rank,
                "retrieval_score": float(scores[idx]),
                "retrieval_engine": engine,
            }
        )
    return ranked

