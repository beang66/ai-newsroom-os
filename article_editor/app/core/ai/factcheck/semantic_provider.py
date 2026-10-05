"""팩트체크 판정기 — 주장 하나와 근거 청크 하나의 관계를 5클래스로 분류한다(ONNX, CPU).

모델 폴더(paths.JUDGE_DIR): model.onnx(+.data), tokenizer.json, judge.json(라벨·입력 길이·확신도 기준).
학습·평가·패키징은 research/factcheck-judge (README 의 q06b-v2-full). 입력 모양은 학습과 같아야 한다(_render).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

CACHE_MAX = 4096  # (주장, 근거) 판정 결과 — 기사를 고쳐 다시 검증할 때 바뀐 문장만 다시 판정


@dataclass(frozen=True)
class SemanticJudgement:
    status: str
    reason: str
    confidence: float | None = None
    provider: str = "none"
    metadata: dict | None = None


REASON = {
    "SUPPORTED_LOCAL": "판정기가 직접 지지 근거로 판정했습니다.",
    "CONFLICT_LOCAL": "판정기가 근거와 어긋난다고 판정했습니다.",
    "GAP_LOCAL": "판정기가 현재 근거로는 직접 뒷받침되지 않는다고 판정했습니다.",
    "REVIEW_LOCAL": "판정기가 사람의 검토가 필요한 사례로 판정했습니다.",
    "REVIEW_EXTERNAL": "판정기가 더 강한 의미판정이 필요한 사례로 판정했습니다.",
}
STATUS = {"SUPPORTED_LOCAL": "SUPPORTED", "CONFLICT_LOCAL": "CONFLICT", "GAP_LOCAL": "EVIDENCE_GAP",
          "REVIEW_LOCAL": "REVIEW"}


class OnnxJudgeProvider:
    name = "onnx-judge"

    def __init__(self, folder: Path):
        self.folder = Path(folder)
        self.config = json.loads((self.folder / "judge.json").read_text(encoding="utf-8")) if self.available() else {}
        self._session = None
        self._tok = None
        self._cache: dict[tuple[str, str], tuple[str, float]] = {}

    def available(self) -> bool:
        return all((self.folder / f).is_file() for f in ("judge.json", "model.onnx", "tokenizer.json"))

    @staticmethod
    def _render(claim: str, evidence: str) -> str:
        """research/factcheck-judge/scripts/common.py: render 와 같아야 한다."""
        return f"fact_relation\nCLAIM: {claim}\nEVIDENCE:\nE1: {evidence[:500]}"

    def _load(self):
        if self._session is not None:
            return
        import onnxruntime as ort
        from tokenizers import Tokenizer

        tok = Tokenizer.from_file(str(self.folder / "tokenizer.json"))
        tok.no_padding()
        tok.enable_truncation(self.config["max_length"])
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self._session = ort.InferenceSession(str(self.folder / "model.onnx"), opts, providers=["CPUExecutionProvider"])
        self._tok = tok

    def _classify(self, claim: str, evidence: str) -> tuple[str, float]:
        key = (claim, evidence)
        if key in self._cache:
            return self._cache[key]
        import numpy as np

        self._load()
        ids = self._tok.encode(self._render(claim, evidence)).ids
        feed = {"input_ids": np.array([ids], dtype=np.int64), "attention_mask": np.ones((1, len(ids)), dtype=np.int64)}
        logits = self._session.run(None, feed)[0][0]
        probs = np.exp(logits - logits.max())
        probs /= probs.sum()
        idx = int(probs.argmax())
        out = (self.config["labels"][idx], float(probs[idx]))
        if len(self._cache) >= CACHE_MAX:
            self._cache.pop(next(iter(self._cache)))
        self._cache[key] = out
        return out

    def judge(self, claim: str, evidence: list[dict]) -> SemanticJudgement:
        if not self.available():
            return SemanticJudgement(status="UNAVAILABLE", reason="팩트체크 판정 모델을 찾지 못했습니다.", provider=self.name)
        try:
            text = (evidence[0].get("sentence") or evidence[0].get("text") or "") if evidence else ""
            label, confidence = self._classify(claim, text)
        except Exception as exc:
            return SemanticJudgement(status="UNAVAILABLE", reason=f"판정기 호출 실패: {type(exc).__name__}",
                                     provider=self.name)
        reason = REASON[label]
        if label == "REVIEW_EXTERNAL" or confidence < self.config["min_confidence"]:
            status = "EXTERNAL_REQUIRED"
        elif label == "SUPPORTED_LOCAL" and confidence < self.config["supported_min_confidence"]:
            status = "REVIEW"  # 확신이 낮은 '일치'는 확정하지 않는다(틀린 '일치'가 가장 위험)
            reason += f" (확신도 {confidence:.2f} — 사람 확인 필요)"
        else:
            status = STATUS[label]
        return SemanticJudgement(status=status, reason=reason, confidence=confidence, provider=self.name,
                                 metadata={"raw_class": label, "model_id": self.config.get("model_id")})
