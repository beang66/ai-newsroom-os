import re
import uuid
from collections import Counter

from .paths import settings
from .assertion import (
    DIRECT_CONFLICT,
    analyze_assertion_relation,
    find_explicit_contrast_conflicts,
    find_explicit_value_conflicts,
    find_morphological_oppositions,
    find_near_copy_differences,
)
from .chunker import chunk_document
from .semantic_provider import LocalClassifierProvider
from .observability import record_factcheck_event
from .retrieval import DEFAULT_K, rank_chunks

_provider = None


def _get_provider():
    global _provider
    if _provider is None:
        _provider = LocalClassifierProvider(
            adapter=str(settings.adapter_path),
            base=str(settings.base_model_path),
        )
    return _provider


def _clean(text):
    return re.sub(r"\s+", " ", text or "").strip()


def _tokens(text):
    return re.findall(r"[가-힣A-Za-z0-9]{2,}", (text or "").lower())


def _grams(text, n=3):
    text = re.sub(r"\s+", "", (text or "").lower())
    return {text[i:i+n] for i in range(max(0, len(text)-n+1))}


def _mask_values(text):
    return re.sub(
        r"\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일|"
        r"\d{1,2}\s*월\s*\d{1,2}\s*일|"
        r"\d[\d,]*(?:\.\d+)?\s*(?:%|명|건|주|원|억\s*원|개)?",
        "<VALUE>",
        text or "",
    )
def _score(claim, chunk, linked=False):
    text = chunk["text"]
    ct, et = Counter(_tokens(claim)), Counter(_tokens(text))
    lexical = sum(min(v, et[k]) for k, v in ct.items()) / max(1, sum(ct.values()))

    cg, eg = _grams(claim), _grams(text)
    char_score = len(cg & eg) / max(1, len(cg)) if cg else 0.0

    mc, me = _grams(_mask_values(claim)), _grams(_mask_values(text))
    structure = len(mc & me) / max(1, len(mc)) if mc else 0.0

    # A journalist explicitly linking a source to a node is strong evidence about retrieval scope.
    link_bonus = 0.40 if linked else 0.0
    metadata_bonus = 0.06 if chunk.get("kind") == "metadata" else 0.0
    return lexical * 0.42 + char_score * 0.18 + structure * 0.34 + link_bonus + metadata_bonus


def _material_chunks(material):
    content = _clean(material.get("content") or material.get("summary") or "")
    if not content:
        return []

    meta = {
        "source": "frontend",
        "title": material.get("title"),
        "date": material.get("date"),
    }
    units = chunk_document(content, meta)
    rows = [
        {
            "text": u.text,
            "kind": u.kind,
            "field": u.field,
            "material_id": material.get("id"),
            "material_title": material.get("title") or "취재 자료",
            "material_date": material.get("date"),
            "speaker": material.get("speaker") or material.get("outletOrSpeaker") or "",
        }
        for u in units
    ]

    # Preserve source identity as a searchable unit without altering the original body.
    title = _clean(material.get("title") or "")
    speaker = _clean(material.get("speaker") or material.get("outletOrSpeaker") or "")
    date = _clean(material.get("date") or "")
    if title or speaker or date:
        rows.insert(0, {
            "text": f"자료명: {title}. 출처/화자: {speaker}. 날짜: {date}.",
            "kind": "metadata",
            "field": "source_identity",
            "material_id": material.get("id"),
            "material_title": title or "취재 자료",
            "material_date": date or None,
            "speaker": speaker,
        })
    return rows


def _match_key(text):
    text = re.sub(r"\s+", "", _clean(text).lower())
    return text.translate(str.maketrans("", "", "\"'“”‘’"))


def _direct_span_match(claim, node, materials):
    key = _match_key(claim)
    if len(key) < 20:
        return None
    linked_ids = set(node.get("linkedSourceIds") or [])
    candidates = [m for m in materials if m.get("id") in linked_ids] if linked_ids else materials
    for material in candidates:
        content = material.get("content") or ""
        if key and key in _match_key(content):
            return {
                "text": claim,
                "kind": "direct_span",
                "field": None,
                "material_id": material.get("id"),
                "material_title": material.get("title") or "취재 자료",
                "material_date": material.get("date"),
                "speaker": material.get("speaker") or material.get("outletOrSpeaker") or "",
                "retrieval_score": 1.0,
            }
    return None


def _candidate_chunks(node, all_chunks):
    linked_ids = set(node.get("linkedSourceIds") or [])
    candidates = [x for x in all_chunks if x.get("material_id") in linked_ids] if linked_ids else all_chunks
    return candidates or all_chunks


def _retrieve_contextual_conflict(claim, node, all_chunks):
    """Find high-confidence conflicts before asking the classifier for a verdict.

    The rules are linguistic/structural rather than document-specific: explicit
    value mismatches, direct polarity opposition, explicit A-not-B contrasts,
    and 유-/무- condition oppositions. They scan all relevant chunks so a
    lexical top-1 miss cannot hide a clear contradiction elsewhere in a source.
    """
    ranked = []
    linked_ids = set(node.get("linkedSourceIds") or [])
    for row in _candidate_chunks(node, all_chunks):
        text = row.get("text") or ""
        score = _score(claim, row, row.get("material_id") in linked_ids)
        if score < 0.12:
            continue

        spans = find_explicit_value_conflicts(claim, text)
        kind = "value_mismatch" if spans else None
        priority = 4 if spans and score >= 0.18 else 0

        if not spans:
            spans = find_explicit_contrast_conflicts(claim, text)
            if spans:
                kind = "explicit_contrast"
                priority = 4

        if not spans:
            spans = find_morphological_oppositions(claim, text)
            if spans:
                kind = "morphological_opposition"
                priority = 4

        relation = analyze_assertion_relation(claim, text, score)
        if not spans and score >= 0.72 and relation.relation == DIRECT_CONFLICT:
            # Whole-sentence polarity heuristics are only safe on highly
            # aligned text. On free paraphrases, words like '없는' and '있음'
            # may refer to different predicates and must be left to the model.
            spans = find_near_copy_differences(claim, text)
            kind = "direct_opposition"
            priority = 3

        if priority:
            ranked.append((priority, score, row, spans, kind, relation.reason))

    if not ranked:
        return None
    priority, score, row, spans, kind, reason = max(ranked, key=lambda item: (item[0], item[1]))
    return {
        **row,
        "retrieval_score": round(score, 4),
        "conflict_spans": spans,
        "conflict_kind": kind,
        "conflict_reason": reason,
    }


def _retrieve_qwen_candidates(claim, node, all_chunks, limit=DEFAULT_K):
    """Retrieve semantically related evidence in the pinned Qwen3 space."""
    candidates = _candidate_chunks(node, all_chunks)
    if not candidates:
        return []
    return rank_chunks(claim, candidates, limit=limit)


def _judge_qwen_candidates(provider, claim, node, candidates):
    """Judge Qwen candidates one at a time and conservatively aggregate them.

    The local classifier was trained for short evidence contexts, so Top-K is
    not concatenated into one long prompt. Conflicting decisive judgements are
    escalated rather than silently choosing one source.
    """
    linked_ids = set(node.get("linkedSourceIds") or [])
    judged = []

    for evidence in candidates:
        judgement = provider.judge(claim, [{"sentence": evidence["text"]}])
        status = judgement.status
        reason = judgement.reason
        confidence = judgement.confidence
        conflict_spans = []
        focus_spans = []

        # Preserve the old deterministic value guard, but keep its threshold in
        # the original lexical/structural score space. Qwen cosine is not
        # calibrated to the legacy 0.84/0.18 thresholds.
        legacy_score = _score(
            claim,
            evidence,
            evidence.get("material_id") in linked_ids,
        )
        explicit_value_spans = find_explicit_value_conflicts(
            claim,
            evidence.get("text") or "",
        )
        if explicit_value_spans and legacy_score >= 0.18:
            status = "CONFLICT"
            reason = "같은 사실 항목의 명시값이 근거 자료와 다릅니다."
            conflict_spans = list(explicit_value_spans)
            focus_spans = list(explicit_value_spans)
        elif status == "SUPPORTED":
            focus_spans = find_near_copy_differences(
                claim,
                evidence.get("text") or "",
            )
            if legacy_score >= 0.84 and focus_spans:
                status = "REVIEW"
                reason = (
                    "근거와 문장 구조는 매우 유사하지만 일부 핵심 표현이 달라 "
                    "확인이 필요합니다."
                )

        judged.append({
            "status": status,
            "reason": reason,
            "confidence": confidence,
            "evidence": evidence,
            "conflict_spans": conflict_spans,
            "focus_spans": focus_spans,
            "provider": judgement.provider,
            "model_metadata": judgement.metadata,
        })

    supported = [x for x in judged if x["status"] == "SUPPORTED"]
    conflicts = [x for x in judged if x["status"] == "CONFLICT"]

    if supported and conflicts:
        # Multiple registered sources disagree. A stronger reasoner should see
        # both sides rather than the local runtime picking a convenient source.
        first = min(
            supported + conflicts,
            key=lambda x: x["evidence"].get("retrieval_rank", 999999),
        )
        return {
            **first,
            "status": "EXTERNAL_REQUIRED",
            "confidence": None,
            "reason": (
                "상위 검색 근거 안에서 지지와 충돌 판정이 동시에 발견되어 "
                "추가 의미판정이 필요합니다."
            ),
            "provider": "qwen-topk-aggregate",
            "model_metadata": {
                "candidate_count": len(judged),
                "supported_count": len(supported),
                "conflict_count": len(conflicts),
            },
            "candidate_judgements": judged,
        }

    if conflicts:
        chosen = max(
            conflicts,
            key=lambda x: (
                x["confidence"] if x["confidence"] is not None else -1.0,
                -x["evidence"].get("retrieval_rank", 999999),
            ),
        )
    elif supported:
        chosen = max(
            supported,
            key=lambda x: (
                x["confidence"] if x["confidence"] is not None else -1.0,
                -x["evidence"].get("retrieval_rank", 999999),
            ),
        )
    else:
        reviewish = [
            x for x in judged
            if x["status"] in {"EXTERNAL_REQUIRED", "REVIEW", "UNAVAILABLE"}
        ]
        if reviewish:
            chosen = min(
                reviewish,
                key=lambda x: x["evidence"].get("retrieval_rank", 999999),
            )
            if any(x["status"] == "EXTERNAL_REQUIRED" for x in reviewish):
                chosen = {**chosen, "status": "EXTERNAL_REQUIRED"}
        elif judged:
            chosen = min(
                judged,
                key=lambda x: x["evidence"].get("retrieval_rank", 999999),
            )
            chosen = {
                **chosen,
                "status": "EVIDENCE_GAP",
                "reason": "상위 검색 후보에서 주장을 직접 뒷받침하는 근거를 찾지 못했습니다.",
            }
        else:
            return None

    return {
        **chosen,
        "candidate_judgements": judged,
    }


def _critique(node_id, status, evidence, confidence):
    source = evidence.get("material_title") if evidence else "현재 등록 자료"
    excerpt = _clean(evidence.get("text") if evidence else "")
    if len(excerpt) > 180:
        excerpt = excerpt[:177] + "..."

    if status == "CONFLICT":
        return {
            "id": f"local-conflict-{node_id}",
            "category": "fact",
            "severity": "warning",
            "title": "근거 자료와 불일치",
            "description": f"{source}의 관련 근거와 현재 문장의 사실관계가 충돌할 가능성이 높습니다. 근거: {excerpt}",
            "nodeId": node_id,
        }
    if status == "EVIDENCE_GAP":
        return {
            "id": f"local-gap-{node_id}",
            "category": "source",
            "severity": "warning",
            "title": "근거 자료 부족",
            "description": "현재 등록된 취재 자료에서 이 문장을 충분히 뒷받침하는 직접 근거를 찾지 못했습니다.",
            "nodeId": node_id,
        }
    if status in {"EXTERNAL_REQUIRED", "REVIEW"}:
        return {
            "id": f"local-review-{node_id}",
            "category": "fact",
            "severity": "suggestion",
            "title": "추가 의미 검토 필요",
            "description": f"관련 자료는 찾았지만 0.6B 로컬 판정만으로 확정하기 어려운 표현입니다. 우선 확인된 근거: {excerpt}",
            "nodeId": node_id,
        }
    if status == "UNAVAILABLE":
        return {
            "id": f"local-unavailable-{node_id}",
            "category": "source",
            "severity": "note",
            "title": "로컬 판정기 확인 필요",
            "description": "로컬 의미 판정 모델을 불러오지 못해 자동 검증을 완료하지 못했습니다.",
            "nodeId": node_id,
        }
    return None
def review_workspace(nodes, materials):
    request_id = uuid.uuid4().hex
    chunks = []
    for material in materials or []:
        chunks.extend(_material_chunks(material))

    provider = _get_provider()
    critiques = []
    results = []
    node_statuses = {}
    counts = Counter()

    for node in nodes or []:
        node_id = str(node.get("id") or "")
        node_type = node.get("type")
        claim = _clean(node.get("text") or "")
        if not node_id or not claim or node_type == "IMAGE":
            continue

        direct = _direct_span_match(claim, node, materials or [])
        contextual_conflict = (
            None
            if direct is not None
            else _retrieve_contextual_conflict(claim, node, chunks)
        )

        evidence_candidates = []
        aggregate = None
        provider_name = None
        model_metadata = None

        if direct is not None:
            evidence = direct
            status = "SUPPORTED"
            confidence = 1.0
            decision_reason = "등록 자료에 같은 문장이 직접 존재합니다."
            conflict_spans = []
            focus_spans = []
        elif contextual_conflict is not None:
            evidence = contextual_conflict
            status = "CONFLICT"
            confidence = 1.0
            decision_reason = (
                contextual_conflict.get("conflict_reason")
                or "등록 자료와 원고의 핵심 사실 요소가 직접 충돌합니다."
            )
            conflict_spans = contextual_conflict.get("conflict_spans", [])
            focus_spans = list(conflict_spans)
        else:
            evidence_candidates = _retrieve_qwen_candidates(
                claim,
                node,
                chunks,
                limit=DEFAULT_K,
            )
            aggregate = _judge_qwen_candidates(
                provider,
                claim,
                node,
                evidence_candidates,
            )
            if aggregate is None:
                evidence = None
                status = "EVIDENCE_GAP"
                confidence = None
                decision_reason = "검색 가능한 등록 자료가 없습니다."
                conflict_spans = []
                focus_spans = []
            else:
                evidence = aggregate["evidence"]
                status = aggregate["status"]
                confidence = aggregate["confidence"]
                decision_reason = aggregate["reason"]
                conflict_spans = aggregate.get("conflict_spans", [])
                focus_spans = aggregate.get("focus_spans", [])
                provider_name = aggregate.get("provider")
                model_metadata = aggregate.get("model_metadata")

        counts[status] += 1
        if status == "SUPPORTED":
            node_statuses[node_id] = "verified"
        elif status in {"CONFLICT", "EVIDENCE_GAP"}:
            node_statuses[node_id] = "unverified"
        else:
            node_statuses[node_id] = "needs_review"

        card = _critique(node_id, status, evidence, confidence)
        if card:
            if evidence and evidence.get("material_id"):
                card["sourceId"] = evidence.get("material_id")
            critiques.append(card)

        record_factcheck_event(
            request_id=request_id,
            node_id=node_id,
            claim=claim,
            status=status,
            confidence=confidence,
            reason=decision_reason,
            evidence=evidence,
            model_metadata=model_metadata,
            linked_source_count=len(node.get("linkedSourceIds") or []),
        )

        results.append({
            "node_id": node_id,
            "claim": claim,
            "status": status,
            "confidence": confidence,
            "reason": decision_reason,
            "evidence": evidence,
            "evidence_candidates": evidence_candidates,
            "candidate_judgements": (
                aggregate.get("candidate_judgements", [])
                if aggregate
                else []
            ),
            "conflict_spans": conflict_spans,
            "focus_spans": focus_spans,
            "provider": provider_name,
            "model_metadata": model_metadata,
        })

    return {
        "success": True,
        "engine": (
            f"{settings.model_id} + semantic-chunker-v3 + "
            "qwen3-embedding-0.6b-exact-top10 + contextual-guard-v1"
        ),
        "model": settings.model_id,
        "chunker": "semantic_chunker_v3+boundary-roberta-base-v3",
        "retrieval": (
            "linked-source scope + direct/contextual guard + "
            "Qwen3-Embedding-0.6B exact Top10"
        ),
        "retrieval_k": DEFAULT_K,
        "counts": dict(counts),
        "node_statuses": node_statuses,
        "critiques": critiques,
        "results": results,
    }
