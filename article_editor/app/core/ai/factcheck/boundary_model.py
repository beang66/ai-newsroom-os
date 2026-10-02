"""KLUE-RoBERTa 경계 판정 모델 (Colab v3 학습, ONNX CPU 추론). 라벨 기준: LABELING_GUIDE.md"""
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

DEFAULT_DIR = Path(__file__).parent / "models" / "model_roberta-base_v3"
SPLIT, JOIN, INHERIT = 0, 1, 2


class BoundaryModel:
    def __init__(self, model_dir=DEFAULT_DIR, threads=4):
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

    def decide(self, pairs, domain="press"):
        """→ [(label, p)]: JOIN은 도메인 threshold, 단 INHERIT가 JOIN보다 크면 상속 쪽 (val press/dart 모두 개선).
        나머지는 SPLIT vs INHERIT 중 큰 쪽"""
        th = self.threshold[domain]
        return [(JOIN, float(p[JOIN])) if p[JOIN] >= th and p[JOIN] >= p[INHERIT] else
                ((INHERIT, float(p[INHERIT])) if p[INHERIT] > p[SPLIT] else (SPLIT, float(p[SPLIT])))
                for p in self.probs(pairs)]


if __name__ == "__main__":
    import time
    m = BoundaryModel()
    pairs = [("회사는 시장 혼란 우려가 있다고 판단했다.", "제반 여건을 고려하여 금번 유상증자를 철회하기로 결정하였다."),
             ("시는 오는 10일 청소년 선발대회를 개최한다.", "참가자격은 관내 중학생이다."),
             ("시는 오는 10일 청소년 선발대회를 개최한다.", "한편 시립도서관은 다음 달 리모델링에 들어간다.")]
    t = time.perf_counter(); r = m.decide(pairs); dt = time.perf_counter() - t
    for (l, rr), (lab, p) in zip(pairs, r):
        print(["SPLIT", "JOIN", "INHERIT"][lab], round(p, 3), "|", rr[:30])
    print(f"{dt / len(pairs) * 1000:.0f} ms/pair")
    assert r[0][0] == JOIN
