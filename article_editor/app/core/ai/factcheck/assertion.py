"""판정 보조 — 판정(verdict)은 하지 않고 UI 강조 위치만 찾는다.

판정기 앞단 규칙(값 불일치·대조·유/무·극성 반대로 먼저 충돌 확정)은 2026-10-06 제거:
봉인 386주장·긴 문서 29건에서 헛경보가 맞힌 것보다 많았다(research/factcheck-judge README).
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher

VALUE_RE = re.compile(
    r"\d{4}\s*년\s*\d{1,2}\s*월(?:\s*\d{1,2}\s*일)?|"
    r"\d{1,2}\s*월\s*\d{1,2}\s*일|"
    r"\d[\d,]*(?:\.\d+)?\s*(?:(?:(?:조|억|천|백|만)\s*)+원|%|명|건|주|원|가구|개국|개|회)?"
)

def _field_before_value(text: str, match_start: int) -> str:
    prefix = (text or "")[max(0, match_start - 40):match_start]
    terms = re.findall(r"[가-힣A-Za-z][가-힣A-Za-z0-9_/-]{1,20}", prefix)
    if not terms:
        return ""
    generic = {"기준", "수준", "정도", "약", "대략", "최대", "최소"}
    for raw in reversed(terms):
        term = raw.lower()
        term = re.sub(r"(?:은|는|이|가|을|를|의|에|에서|으로)$", "", term)
        if term and term not in generic:
            return term
    return ""

def _similar_field(a: str, b: str) -> bool:
    if not a or not b:
        return False
    if a == b:
        return True
    if a.startswith(b) or b.startswith(a):
        return min(len(a), len(b)) >= 3
    return SequenceMatcher(None, a, b).ratio() >= 0.76


def _value_type(v: str) -> str:
    if "년" in v or "월" in v or "일" in v:
        return "date"
    for unit in ("%", "명", "건", "주", "억원", "억 원", "원", "가구", "개국", "개", "회"):
        if v.endswith(unit.replace(" ", "")):
            return unit.replace(" ", "")
    return "number"


def find_explicit_value_conflicts(claim: str, evidence: str) -> list[dict]:
    """Return precise claim/evidence spans for same-field numeric mismatches.

    Exact matches on the same field are deliberately excluded. This lets the UI
    highlight only the incorrect value (for example 총급여액 7천만원 vs 8천만원)
    while leaving other correct values in the same sentence untouched.
    """
    claim_rows = []
    evidence_rows = []
    for text, rows in ((claim, claim_rows), (evidence, evidence_rows)):
        for match in VALUE_RE.finditer(text or ""):
            raw = match.group(0)
            rows.append({
                "start": match.start(),
                "end": match.end(),
                "text": raw,
                "value": re.sub(r"\s+|,", "", raw),
                "field": _field_before_value(text, match.start()),
            })

    conflicts = []
    for claim_row in claim_rows:
        candidates = [
            row for row in evidence_rows
            if _value_type(claim_row["value"]) == _value_type(row["value"])
            and _similar_field(claim_row["field"], row["field"])
        ]
        if not candidates:
            continue

        # If the same field has an exact value in the evidence, this claim value
        # is supported and must not be highlighted merely because another value
        # exists elsewhere in the source.
        if any(row["value"] == claim_row["value"] for row in candidates):
            continue

        best = max(
            candidates,
            key=lambda row: SequenceMatcher(
                None, claim_row["field"], row["field"]
            ).ratio(),
        )
        conflicts.append({
            "claim_start": claim_row["start"],
            "claim_end": claim_row["end"],
            "claim_text": claim_row["text"],
            "evidence_start": best["start"],
            "evidence_end": best["end"],
            "evidence_text": best["text"],
            "field": claim_row["field"],
        })
    return conflicts


_TOKEN_RE = re.compile(r"[가-힣A-Za-z0-9]+")
_PARTICLES = (
    "으로는", "에게서", "에서는", "에게", "에서", "으로", "까지", "부터", "보다", "처럼",
    "이라면", "라면", "에는", "은", "는", "이", "가", "을", "를", "의", "에", "도", "와", "과",
)


def _token_key(token: str) -> str:
    token = (token or "").lower()
    for particle in _PARTICLES:
        if token.endswith(particle) and len(token) - len(particle) >= 2:
            return token[:-len(particle)]
    return token


def _word_rows(text: str) -> list[dict]:
    return [
        {
            "start": match.start(),
            "end": match.end(),
            "text": match.group(0),
            "key": _token_key(match.group(0)),
        }
        for match in _TOKEN_RE.finditer(text or "")
    ]


def find_near_copy_differences(claim: str, evidence: str, min_ratio: float = 0.72) -> list[dict]:
    """Locate small textual substitutions only when the two statements are already very similar.

    This is a localization helper, not a semantic verdict. It is intentionally
    disabled for freely paraphrased sentences so normal newsroom rewriting is
    not mistaken for a factual conflict.
    """
    claim_rows = _word_rows(claim)
    evidence_rows = _word_rows(evidence)
    if not claim_rows or not evidence_rows:
        return []

    matcher = SequenceMatcher(
        None,
        [row["key"] for row in claim_rows],
        [row["key"] for row in evidence_rows],
        autojunk=False,
    )
    if matcher.ratio() < min_ratio:
        return []

    diffs = []
    changed_claim_chars = 0
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag not in {"replace", "delete"} or i1 >= i2:
            continue
        start = claim_rows[i1]["start"]
        end = claim_rows[i2 - 1]["end"]
        claim_text = claim[start:end]
        if len(re.sub(r"\s+", "", claim_text)) < 2:
            continue

        if j1 < j2:
            evidence_start = evidence_rows[j1]["start"]
            evidence_end = evidence_rows[j2 - 1]["end"]
            evidence_text = evidence[evidence_start:evidence_end]
        else:
            evidence_start = evidence_end = 0
            evidence_text = ""

        changed_claim_chars += end - start
        diffs.append({
            "claim_start": start,
            "claim_end": end,
            "claim_text": claim_text,
            "evidence_start": evidence_start,
            "evidence_end": evidence_end,
            "evidence_text": evidence_text,
            "field": "",
            "kind": "near_copy_difference",
        })

    if changed_claim_chars > max(48, int(len(claim) * 0.35)):
        return []
    return diffs
