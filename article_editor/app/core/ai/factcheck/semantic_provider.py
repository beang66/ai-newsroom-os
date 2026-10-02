from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol



@dataclass(frozen=True)
class SemanticJudgement:
    status: str
    reason: str
    confidence: float | None = None
    provider: str = "none"
    metadata: dict | None = None


class SemanticProvider(Protocol):
    name: str

    def available(self) -> bool:
        ...

    def judge(self, claim: str, evidence: list[dict]) -> SemanticJudgement:
        ...


class DisabledExternalProvider:
    name = "external-disabled"

    def available(self) -> bool:
        return False

    def judge(self, claim: str, evidence: list[dict]) -> SemanticJudgement:
        return SemanticJudgement(
            status="EXTERNAL_REQUIRED",
            reason="외부 semantic provider가 아직 연결되지 않았습니다.",
            provider=self.name,
        )


class RemoteLocalModelProvider:
    """Optional semantic judge hosted on the user's own GPU.

    Expected backend: llama.cpp compatible /completion endpoint.
    No paid API is required. Set LOCAL_SEMANTIC_URL when the server exists.
    """

    name = "remote-local-model"

    def __init__(self, url: str | None = None):
        self.url = (url or os.getenv("LOCAL_SEMANTIC_URL") or "").rstrip("/")

    def available(self) -> bool:
        return bool(self.url)

    @staticmethod
    def _prompt(claim: str, evidence: list[dict]) -> str:
        snippets = []
        for i, ev in enumerate(evidence[:5], 1):
            text = ev.get("sentence") or ev.get("text") or ""
            snippets.append(f"[E{i}] {text[:700]}")
        joined = "\n".join(snippets)
        return (
            "/no_think\n"
            "task=fact_relation\n"
            "기사 주장과 등록된 근거만 비교한다. 외부 지식은 사용하지 않는다.\n"
            f"CLAIM={claim}\n"
            f"EVIDENCE={joined}\n"
            "JSON="
        )

    @staticmethod
    def _parse(raw: str) -> dict:
        match = re.search(r"\{.*\}", raw or "", re.S)
        if not match:
            raise ValueError("local model returned no JSON object")
        out = json.loads(match.group(0))
        status = str(out.get("status", "")).upper()
        if status not in {"SUPPORTED", "CONFLICT", "EVIDENCE_GAP", "REVIEW"}:
            raise ValueError("invalid semantic status")
        out["status"] = status
        out["confidence"] = float(out.get("confidence", 0.0))
        out["needs_external"] = bool(out.get("needs_external", False))
        out["reason_code"] = str(out.get("reason_code") or "").upper()
        return out

    def judge(self, claim: str, evidence: list[dict]) -> SemanticJudgement:
        if not self.available():
            return SemanticJudgement(
                status="UNAVAILABLE",
                reason="로컬 semantic model 서버가 연결되지 않았습니다.",
                provider=self.name,
            )

        payload = {
            "prompt": self._prompt(claim, evidence),
            "n_predict": 64,
            "temperature": 0.0,
            "stop": ["\n\n"],
        }
        try:
            import httpx  # 선택: LOCAL_SEMANTIC_URL 을 쓸 때만 필요
            response = httpx.post(f"{self.url}/completion", json=payload, timeout=30)
            response.raise_for_status()
            parsed = self._parse(response.json().get("content", ""))
            min_confidence = float(os.getenv("LOCAL_SEMANTIC_MIN_CONFIDENCE", "0.80"))
            low_confidence = parsed["confidence"] < min_confidence
            expected_codes = {
                "SUPPORTED": {"DIRECT_SUPPORT"},
                "CONFLICT": {"DIRECT_CONFLICT"},
                "EVIDENCE_GAP": {"EVIDENCE_GAP"},
                "REVIEW": {
                    "ATTRIBUTED_REVIEW", "AMBIGUOUS_NEGATION", "CAUSAL",
                    "TEMPORAL", "COMPARATIVE", "MODAL", "COMPLEX_SEMANTIC",
                },
            }
            inconsistent = parsed["reason_code"] not in expected_codes.get(parsed["status"], set())
            status = (
                "EXTERNAL_REQUIRED"
                if parsed["needs_external"] or low_confidence or inconsistent
                else parsed["status"]
            )
            reason_messages = {
                "DIRECT_SUPPORT": "근거가 기사 주장과 직접 일치합니다.",
                "DIRECT_CONFLICT": "같은 사실의 값 또는 극성이 직접 충돌합니다.",
                "EVIDENCE_GAP": "등록된 근거로는 이 주장을 직접 뒷받침하지 못합니다.",
                "ATTRIBUTED_REVIEW": "반대되는 인용·평가는 있으나 직접 사실 진술은 아닙니다.",
                "AMBIGUOUS_NEGATION": "이중부정·모호한 표현이라 더 강한 의미판정이 필요합니다.",
                "CAUSAL": "인과관계 판단은 로컬 모델의 안전 범위를 벗어납니다.",
                "TEMPORAL": "여러 시점의 관계를 해석해야 해 더 강한 의미판정이 필요합니다.",
                "COMPARATIVE": "비교·최상급 판단에는 추가 의미판정이 필요합니다.",
                "MODAL": "가능성·전망·추정 표현이라 추가 의미판정이 필요합니다.",
                "COMPLEX_SEMANTIC": "복합 의미관계라 더 강한 의미판정이 필요합니다.",
            }
            reason = reason_messages.get(
                parsed["reason_code"],
                "로컬 semantic model의 구조화 판정입니다.",
            )
            if low_confidence and not parsed["needs_external"]:
                reason += (
                    f" (로컬 모델 신뢰도 {parsed['confidence']:.2f}가 "
                    f"기준 {min_confidence:.2f} 미만)"
                )
            if inconsistent:
                reason += " (status와 reason_code가 일치하지 않아 자동 판정을 보류합니다.)"
            return SemanticJudgement(
                status=status,
                reason=reason,
                confidence=parsed["confidence"],
                provider=self.name,
                metadata={
                    "needs_external": parsed["needs_external"],
                    "reason_code": parsed["reason_code"],
                    "low_confidence": low_confidence,
                    "inconsistent_output": inconsistent,
                    "min_confidence": min_confidence,
                },
            )
        except Exception as exc:
            return SemanticJudgement(
                status="UNAVAILABLE",
                reason=f"로컬 semantic model 호출 실패: {type(exc).__name__}",
                provider=self.name,
            )



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


def _select_local_provider() -> SemanticProvider:
    remote = RemoteLocalModelProvider()
    if remote.available():
        return remote
    return LocalClassifierProvider()


local_semantic_provider: SemanticProvider = _select_local_provider()
external_provider: SemanticProvider = DisabledExternalProvider()
