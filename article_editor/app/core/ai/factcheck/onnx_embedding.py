"""Qwen3 embedding inference using only ONNX Runtime, tokenizers and NumPy.

KEEP — 삭제 금지: 로컬 임베딩은 2026-10-08부터 '잠정 폐기'(기본은 원격 /ai/embeddings)일 뿐 코드는 일부러 남겨 둔 것이다.
용도: 오프라인·원격 장애 때 되살릴 수 있는 대체 경로(지금은 자동 폴백 없음), 원격 벡터와의 일치 검증 기준(dev/tools/verify_remote_embedding.py), 로컬 복귀.
지금 이 코드를 부르는 곳이 없어 보여도(정적 분석·미사용 검사에 걸려도) 지우지 말 것. 되살리려면 FACTCHECK_EMBEDDING_RUNTIME=onnx 로 명시한다.

The graph includes last-token pooling and L2 normalization. Tokenization,
left padding, query formatting and the embedding space match the torch reference.
"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path

import numpy as np

BATCH = 4
MAX_LENGTH = 8192
DIMENSION = 1024
MODEL_FILES = ('embedding.onnx', 'embedding.onnx.data', 'tokenizer.json', 'embedding.json')


class OnnxQwenEncoder:
    """Lazy local CPU encoder. No downloads or torch/transformers imports."""

    def __init__(self, model_path: str | Path, query_input):
        self.path = Path(model_path)
        self._query_input = query_input
        self.tokenizer = None
        self.session = None
        self.pad_id = 0
        self._load_lock = threading.RLock()

    def available(self) -> bool:
        if not all((self.path / name).is_file() for name in MODEL_FILES):
            return False
        try:
            import onnxruntime  # noqa: F401
            import tokenizers  # noqa: F401
        except ImportError:
            return False
        return True

    def _load(self) -> None:
        if self.session is not None:
            return
        with self._load_lock:
            if self.session is not None:
                return
            if not self.available():
                raise RuntimeError(f'ONNX embedding model/runtime missing: {self.path}')
            import onnxruntime as ort
            from tokenizers import Tokenizer

            meta = json.loads((self.path / 'embedding.json').read_text(encoding='utf-8'))
            if (meta.get('dimension'), meta.get('max_length'), meta.get('pooling'),
                    meta.get('padding_side'), meta.get('normalize')) != (
                    DIMENSION, MAX_LENGTH, 'last_token', 'left', 'l2'):
                raise ValueError('Incompatible Qwen embedding metadata')
            tokenizer = Tokenizer.from_file(str(self.path / 'tokenizer.json'))
            tokenizer.no_padding()
            tokenizer.enable_truncation(max_length=MAX_LENGTH, direction='right')
            pad = tokenizer.token_to_id('<|endoftext|>')
            if pad is None:
                raise ValueError('Qwen padding token missing')
            options = ort.SessionOptions()
            options.intra_op_num_threads = max(1, int(os.getenv(
                'FACTCHECK_EMBEDDING_THREADS', '0')) or min(4, os.cpu_count() or 1))
            options.inter_op_num_threads = 1
            session = ort.InferenceSession(str(self.path / 'embedding.onnx'),
                sess_options=options, providers=['CPUExecutionProvider'])
            self.pad_id = int(pad)
            self.tokenizer = tokenizer
            self.session = session  # publish only after complete initialization

    def encode(self, texts: list[str], role: str) -> np.ndarray:
        if role not in {'document', 'query'}:
            raise ValueError(f'Unknown embedding role: {role}')
        if not texts:
            return np.empty((0, DIMENSION), dtype='<f4')
        self._load()
        prepared = [self._query_input(x) for x in texts] if role == 'query' else list(texts)
        result = []
        for start in range(0, len(prepared), BATCH):
            encodings = self.tokenizer.encode_batch(prepared[start:start + BATCH])
            # Long contexts otherwise pad four rows to 8192 tokens. Run those
            # separately to bound CPU attention memory while preserving order.
            groups = [[e] for e in encodings] if max(len(e.ids) for e in encodings) > 2048 else [encodings]
            for group in groups:
                longest = max(len(e.ids) for e in group)
                if not longest:
                    raise ValueError('Embedding input has no tokens')
                ids = np.full((len(group), longest), self.pad_id, dtype=np.int64)
                mask = np.zeros((len(group), longest), dtype=np.int64)
                for row, encoding in enumerate(group):
                    count = len(encoding.ids)
                    if not count:
                        raise ValueError('Embedding input has no tokens')
                    ids[row, longest - count:] = encoding.ids
                    mask[row, longest - count:] = encoding.attention_mask
                vectors = np.asarray(self.session.run(['embedding'], {
                    'input_ids': ids, 'attention_mask': mask})[0], dtype='<f4')
                if vectors.shape != (len(group), DIMENSION) or not np.isfinite(vectors).all():
                    raise ValueError('Invalid Qwen ONNX embedding shape/values')
                if np.max(np.abs(np.linalg.norm(vectors, axis=1) - 1.0)) > 1e-4:
                    raise ValueError('Qwen ONNX embeddings must be L2-normalized')
                result.append(vectors)
        return np.concatenate(result, axis=0)
