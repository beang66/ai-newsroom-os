from __future__ import annotations

import json
import threading
from datetime import datetime, timezone

_LOCK = threading.Lock()
from .paths import RUNTIME_DIR
_LOG_DIR = RUNTIME_DIR
_LOG_PATH = _LOG_DIR / "factcheck_routing_events.jsonl"


def _excerpt(text: str | None, limit: int = 1600) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit]


def record_factcheck_event(
    *,
    request_id: str,
    node_id: str,
    claim: str,
    status: str,
    confidence: float | None,
    reason: str | None,
    evidence: dict | None,
    model_metadata: dict | None,
    linked_source_count: int,
) -> None:
    """Append one passive fact-check event.

    This logger must never affect the user-visible verdict. It stores only the
    claim and the selected evidence excerpt, not full source documents.
    """
    try:
        ev = evidence or {}
        row = {
            "schema_version": 1,
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "request_id": request_id,
            "node_id": node_id,
            "claim": claim,
            "current_status": status,
            "confidence": confidence,
            "reason": reason,
            "retrieval_score": ev.get("retrieval_score"),
            "evidence_excerpt": _excerpt(ev.get("text")),
            "evidence_kind": ev.get("kind"),
            "evidence_field": ev.get("field"),
            "material_id": ev.get("material_id"),
            "material_title": ev.get("material_title"),
            "material_date": ev.get("material_date"),
            "linked_source_count": int(linked_source_count or 0),
            "model_metadata": model_metadata or {},
        }
        _LOG_DIR.mkdir(parents=True, exist_ok=True)
        line = json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
        with _LOCK:
            with _LOG_PATH.open("a", encoding="utf-8") as f:
                f.write(line)
    except Exception:
        # Observability is intentionally fail-open: logging must never break
        # article review.
        return
