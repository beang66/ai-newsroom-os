from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path



@dataclass(frozen=True)
class SemanticJudgement:
    status: str
    reason: str
    confidence: float | None = None
    provider: str = "none"
    metadata: dict | None = None


class LocalClassifierProvider:
    """Qwen3-0.6B sequence classifier with conservative calibration.

    This provider is fully local and lazy-loads the model on first use.
    It combines the classifier with the deterministic assertion guard so
    apparent conflicts on a different subject are not accepted as conflicts.
    """

    name = "qwen06-local-classifier"

    LABELS = [
        "SUPPORTED_LOCAL",
        "CONFLICT_LOCAL",
        "GAP_LOCAL",
        "REVIEW_LOCAL",
        "REVIEW_EXTERNAL",
    ]

    def __init__(self, adapter: str | None = None, base: str | None = None):
        from .paths import FACTCHECK_DIR
        model_root = Path(os.getenv("FACTCHECK_MODEL_ROOT") or FACTCHECK_DIR)
        self.base = Path(base or os.getenv("FACTCHECK_BASE_MODEL_PATH") or model_root / "base" / "Qwen3-0.6B")
        self.adapter = Path(
            adapter
            or os.getenv("FACTCHECK_ADAPTER_PATH")
            or os.getenv("LOCAL_CLASSIFIER_ADAPTER")
            or model_root / "adapters" / "current"
        )
        self.threshold = float(os.getenv("LOCAL_CLASSIFIER_MIN_CONFIDENCE", "0.50"))
        self._tok = None
        self._model = None

    def available(self) -> bool:
        return self.base.exists() and self.adapter.exists()

    @staticmethod
    def _render(claim: str, evidence: list[dict]) -> str:
        lines = []
        for i, ev in enumerate(evidence[:4], 1):
            text = ev.get("sentence") or ev.get("text") or ""
            lines.append(f"E{i}: {text[:500]}")
        return f"fact_relation\nCLAIM: {claim}\nEVIDENCE:\n" + "\n".join(lines)

    def _load(self):
        if self._model is not None:
            return
        import torch
        from peft import PeftModel
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        l2i = {x: i for i, x in enumerate(self.LABELS)}
        i2l = {i: x for x, i in l2i.items()}
        tok = AutoTokenizer.from_pretrained(self.base)
        if tok.pad_token_id is None:
            tok.pad_token = tok.eos_token
        model = AutoModelForSequenceClassification.from_pretrained(
            self.base,
            num_labels=len(self.LABELS),
            id2label=i2l,
            label2id=l2i,
            dtype=torch.float32,
        )
        model.config.pad_token_id = tok.pad_token_id
        model = PeftModel.from_pretrained(model, self.adapter)
        model.eval()
        self._tok = tok
        self._model = model

    def judge(self, claim: str, evidence: list[dict]) -> SemanticJudgement:
        if not self.available():
            return SemanticJudgement(
                status="UNAVAILABLE",
                reason="로컬 0.6B classifier 모델을 찾지 못했습니다.",
                provider=self.name,
            )
        try:
            import torch
            from .assertion import (
                analyze_assertion_relation,
                has_explicit_value_mismatch,
                DIRECT_CONFLICT,
            )

            self._load()
            x = self._tok(
                self._render(claim, evidence),
                truncation=True,
                max_length=192,
                return_tensors="pt",
            )
            with torch.no_grad():
                probs = torch.softmax(self._model(**x).logits[0], dim=-1)
            idx = int(torch.argmax(probs))
            pred = self.LABELS[idx]
            confidence = float(probs[idx])

            raw_pred = pred
            guard = None
            if pred == "CONFLICT_LOCAL":
                ev_text = " ".join(
                    (e.get("sentence") or e.get("text") or "") for e in evidence[:2]
                )
                relation = analyze_assertion_relation(claim, ev_text, 1.0)
                if relation.relation != DIRECT_CONFLICT:
                    if confidence >= 0.85 and has_explicit_value_mismatch(claim, ev_text):
                        guard = "semantic_conflict_with_explicit_value_mismatch"
                    else:
                        pred = "GAP_LOCAL"
                        guard = "conflict_requires_same_subject_direct_opposition"

            if raw_pred == "REVIEW_EXTERNAL" or confidence < self.threshold:
                status = "EXTERNAL_REQUIRED"
            else:
                status = {
                    "SUPPORTED_LOCAL": "SUPPORTED",
                    "CONFLICT_LOCAL": "CONFLICT",
                    "GAP_LOCAL": "EVIDENCE_GAP",
                    "REVIEW_LOCAL": "REVIEW",
                }.get(pred, "EXTERNAL_REQUIRED")

            reason = {
                "SUPPORTED_LOCAL": "0.6B 분류기가 직접 지지 근거로 판정했습니다.",
                "CONFLICT_LOCAL": "0.6B 분류기가 직접 충돌로 판정했고 assertion guard를 통과했습니다.",
                "GAP_LOCAL": "0.6B 분류기가 현재 근거로는 직접 뒷받침되지 않는다고 판정했습니다.",
                "REVIEW_LOCAL": "0.6B 분류기가 로컬 검토가 필요한 사례로 판정했습니다.",
                "REVIEW_EXTERNAL": "0.6B 분류기가 더 강한 의미판정이 필요한 사례로 판정했습니다.",
            }.get(pred, "로컬 분류기 판정입니다.")
            if confidence < self.threshold:
                reason += f" (신뢰도 {confidence:.2f} < 기준 {self.threshold:.2f})"

            return SemanticJudgement(
                status=status,
                reason=reason,
                confidence=confidence,
                provider=self.name,
                metadata={
                    "raw_class": raw_pred,
                    "post_guard_class": pred,
                    "guard": guard,
                    "threshold": self.threshold,
                },
            )
        except Exception as exc:
            return SemanticJudgement(
                status="UNAVAILABLE",
                reason=f"로컬 classifier 호출 실패: {type(exc).__name__}",
                provider=self.name,
            )
