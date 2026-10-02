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
from pathlib import Path
import sqlite3
import threading
from typing import Iterable

import numpy as np

from .paths import EMBEDDING_DIR, RUNTIME_DIR
MODEL = "Qwen/Qwen3-Embedding-0.6B"
REVISION = "97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3"
TASK = "Given a web search query, retrieve relevant passages that answer the query"
MODEL_ID = f"{MODEL}@{REVISION}:last-token:l2:1024:8192:{TASK}"
MODEL_PATH = EMBEDDING_DIR
CACHE_PATH = RUNTIME_DIR / "qwen3_embedding_vectors.sqlite3"

DEFAULT_K = 10
EXPANDED_K = 50
MAX_K = 150


def query_input(text: str) -> str:
    return f"Instruct: {TASK}\nQuery:{text}"


def vector_key(text: str, role: str) -> str:
    payload = MODEL_ID + "\0" + role + "\0" + (text or "")
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class QwenEncoder:
    """Lazy CPU encoder. No implicit downloads and no MiniLM fallback."""

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


class VectorCache:
    """Persistent model/role/text keyed embedding cache."""

    def __init__(
        self,
        path: str | Path | None = None,
        encoder: QwenEncoder | None = None,
    ):
        self.path = Path(path or CACHE_PATH)
        self.encoder = encoder or QwenEncoder()
        self.lock = threading.RLock()
        self.path.parent.mkdir(parents=True, exist_ok=True)

        with sqlite3.connect(self.path) as db:
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS vectors (
                    key TEXT PRIMARY KEY,
                    vector BLOB NOT NULL,
                    origin TEXT NOT NULL
                )
                """
            )
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )
            db.execute(
                "INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)",
                ("model_id", MODEL_ID),
            )

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
        with self.lock, sqlite3.connect(self.path) as db:
            found: dict[str, np.ndarray] = {}
            for key in dict.fromkeys(keys):
                row = db.execute(
                    "SELECT vector FROM vectors WHERE key=?",
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
                for (key, _), value in zip(missing_pairs, vectors):
                    found[key] = value
                    db.execute(
                        """
                        INSERT OR REPLACE INTO vectors(key, vector, origin)
                        VALUES (?,?,?)
                        """,
                        (
                            key,
                            value.astype("<f4", copy=False).tobytes(),
                            "local-cpu",
                        ),
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


def rank_chunks(
    query: str,
    chunks: list[dict],
    *,
    limit: int = DEFAULT_K,
    cache: VectorCache | None = None,
) -> list[dict]:
    """Exact cosine ranking over the caller-provided chunk scope."""

    if not chunks:
        return []

    limit = max(1, min(int(limit), MAX_K, len(chunks)))
    cache = cache or get_vector_cache()
    texts = [str(row.get("text") or "") for row in chunks]
    corpus_vectors = cache.encode(texts, "document")
    query_vector = cache.encode([query], "query")[0]

    scores = corpus_vectors @ query_vector
    order = np.lexsort(
        (np.arange(len(chunks), dtype=np.int32), -scores)
    )

    ranked = []
    for rank, idx in enumerate(order[:limit], 1):
        idx = int(idx)
        ranked.append(
            {
                **chunks[idx],
                "retrieval_rank": rank,
                "retrieval_score": float(scores[idx]),
                "retrieval_engine": "qwen3-embedding-0.6b-exact",
            }
        )
    return ranked


def capabilities() -> dict:
    cache = get_vector_cache()
    return {
        "model": MODEL,
        "revision": REVISION,
        "model_path": str(cache.encoder.path),
        "available": cache.encoder.available(),
        "dimension": 1024,
        "default_k": DEFAULT_K,
        "expanded_k": EXPANDED_K,
        "max_k": MAX_K,
        "cache_path": str(CACHE_PATH),
        "runtime_downloads": False,
    }
