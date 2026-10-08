"""Qwen3 임베딩을 우리 백엔드(/ai/embeddings → Cloudflare Workers AI)에서 받는다.

같은 모델·같은 벡터 공간(1024차원, L2)이라 이후 검색(DenseFly·BM25·RRF)은 로컬 그대로다.
무거운 모델 계산만 서버가 한다. 네트워크가 안 되면 로컬 ONNX 모델이 설치돼 있을 때만 그쪽으로 되돌아간다.
FACTCHECK_EMBEDDING_RUNTIME=remote 로 켠다(기본은 로컬 ONNX — dev/tools/verify_remote_embedding.py 로 일치를 확인한 뒤 전환).
"""
from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from ... import backend_proxy
from ...errors import RequestError

DIMENSION = 1024
MAX_ITEMS = 8  # 요청 하나에 실을 문장 수(Cloudflare 상한은 32 — 작게 나눠 병렬로 보낸다)
WORKERS = max(1, int(os.environ.get('FACTCHECK_REMOTE_PARALLEL', '4') or 4))
MAX_CHARS = 60_000  # 요청 하나에 실을 글자 수(백엔드 본문 한도 2MB 아래로)


class RemoteQwenEncoder:
    slice_size = MAX_ITEMS * WORKERS  # 색인이 한 번에 맡길 조각 수 — 병렬 요청 수만큼 한꺼번에

    def __init__(self, task: str, fallback=None):
        self.task = task
        self.fallback = fallback  # 오프라인일 때 쓸 로컬 인코더(없으면 None)

    def available(self) -> bool:
        return backend_proxy.enabled() or bool(self.fallback and self.fallback.available())

    def _batches(self, texts: list[str]):
        batch, size = [], 0
        for text in texts:
            if batch and (len(batch) >= MAX_ITEMS or size + len(text) > MAX_CHARS):
                yield batch
                batch, size = [], 0
            batch.append(text)
            size += len(text)
        if batch:
            yield batch

    def _request(self, batch: list[str], role: str) -> np.ndarray:
        payload = {'queries': batch, 'instruction': self.task} if role == 'query' else {'documents': batch}
        reply = backend_proxy.post('/ai/embeddings', payload)
        data = (reply.get('result') or reply).get('data')
        vectors = np.asarray(data, dtype='<f4')
        if vectors.shape != (len(batch), DIMENSION) or not np.isfinite(vectors).all():
            raise ValueError(f'Invalid remote embedding shape: {vectors.shape}')
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        return vectors / np.where(norms == 0, 1, norms)  # 서버가 정규화하지 않아도 같은 공간으로

    def encode(self, texts: list[str], role: str) -> np.ndarray:
        if role not in {'document', 'query'}:
            raise ValueError(f'Unknown embedding role: {role}')
        if not texts:
            return np.empty((0, DIMENSION), dtype='<f4')
        if not backend_proxy.enabled():
            if self.fallback and self.fallback.available():
                return self.fallback.encode(texts, role)
            raise RequestError('임베딩 서버가 설정되어 있지 않습니다(AI_BACKEND=remote).', 503)
        try:
            batches = list(self._batches(list(texts)))
            if len(batches) == 1:
                return self._request(batches[0], role)
            with ThreadPoolExecutor(max_workers=min(WORKERS, len(batches))) as pool:  # map 은 순서를 유지한다
                return np.concatenate(list(pool.map(lambda batch: self._request(batch, role), batches)))
        except RequestError:
            if self.fallback and self.fallback.available():
                return self.fallback.encode(texts, role)
            raise
