"""KLUE-RoBERTa 경계 판정 모델 (Colab v3 학습, ONNX CPU 추론). 라벨 기준: LABELING_GUIDE.md"""
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer



class BoundaryModel:
    def __init__(self, model_dir, threads=4):
        model_dir = Path(model_dir)
        cfg = json.loads((model_dir / "boundary_config.json").read_text(encoding="utf-8"))
        self.threshold, self.chars = cfg["threshold"], cfg["chars"]
        self.tok = Tokenizer.from_file(str(model_dir / "tokenizer.json"))
        self.tok.enable_truncation(cfg["maxlen"])  # longest_first, 학습 때와 동일
        opt = ort.SessionOptions(); opt.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(str(model_dir / "model.onnx"), opt, providers=["CPUExecutionProvider"])

    def probs(self, pairs, batch=16):
        """pairs: [(left, right)] → (n, 3) 확률 [SPLIT, JOIN, SPLIT_INHERIT]"""
        out = []
        for i in range(0, len(pairs), batch):
            enc = self.tok.encode_batch([(l[-self.chars:], r[:self.chars]) for l, r in pairs[i:i + batch]])
            n = max(len(e.ids) for e in enc)
            ids = np.array([e.ids + [1] * (n - len(e.ids)) for e in enc], np.int64)  # KLUE pad id = 1
            mask = np.array([[1] * len(e.ids) + [0] * (n - len(e.ids)) for e in enc], np.int64)
            logits = self.sess.run(None, {"input_ids": ids, "attention_mask": mask})[0]
            e = np.exp(logits - logits.max(1, keepdims=True)); out.append(e / e.sum(1, keepdims=True))
        return np.concatenate(out) if out else np.zeros((0, 3))
