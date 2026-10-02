from __future__ import annotations

import re
from difflib import SequenceMatcher
from dataclasses import dataclass

DIRECT_CONFLICT = "DIRECT_CONFLICT"
ATTRIBUTED_OPPOSITION = "ATTRIBUTED_OPPOSITION"
NO_CONFLICT = "NO_CONFLICT"

OPINION_ATTRIBUTION_RE = re.compile(
    r"지적|주장|비판|우려|견해|의견|평가|분석|전망|관측|제기|논평|해석|"
    r"밝혔|말했|전했|설명했|입장을 냈|입장을 밝혔"
)
HEDGE_RE = re.compile(
    r"가능성|추정|예상|전망|관측|검토|논의|우려|보인다|수 있다|수도 있다"
)
DOUBLE_NEG_RE = re.compile(
    r"(?:하지|되지|않은|못한)[^.!?]{0,16}(?:것은|건)?\s*아니|"
    r"(?:않다고|않았다고|못한다고|못했다고|없다고|아니라고)[^.!?]{0,20}"
    r"(?:볼|할|단정할)\s*수(?:는)?\s*없"
)
@dataclass(frozen=True)
class AssertionRelation:
    relation: str
    key: str | None = None
    attribution: str = "direct"
    reason: str = ""


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()

VALUE_RE = re.compile(
    r"\d{4}\s*년\s*\d{1,2}\s*월(?:\s*\d{1,2}\s*일)?|"
    r"\d{1,2}\s*월\s*\d{1,2}\s*일|"
    r"\d[\d,]*(?:\.\d+)?\s*(?:(?:(?:조|억|천|백|만)\s*)+원|%|명|건|주|원|가구|개국|개|회)?"
)

def _value_tokens(text: str) -> list[str]:
    out = []
    for m in VALUE_RE.finditer(text or ""):
        v = re.sub(r"\s+|,", "", m.group(0))
        if v:
            out.append(v)
    return out


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

def _value_field_pairs(text: str) -> list[tuple[str, str]]:
    out = []
    for m in VALUE_RE.finditer(text or ""):
        value = re.sub(r"\s+|,", "", m.group(0))
        out.append((_field_before_value(text, m.start()), value))
    return out

def _similar_field(a: str, b: str) -> bool:
    if not a or not b:
        return False
    if a == b:
        return True
    if a.startswith(b) or b.startswith(a):
        return min(len(a), len(b)) >= 3
    return SequenceMatcher(None, a, b).ratio() >= 0.76


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


def find_explicit_contrast_conflicts(claim: str, evidence: str) -> list[dict]:
    """Find explicit 'A가 아니라 B' style contradictions without domain rules."""
    evidence_rows = _word_rows(evidence)
    evidence_keys = {row["key"] for row in evidence_rows}
    out = []
    pattern = re.compile(r"([가-힣A-Za-z0-9]{2,})\s+아니라\s+([가-힣A-Za-z0-9]{2,})")
    for match in pattern.finditer(claim or ""):
        old_raw, new_raw = match.group(1), match.group(2)
        old_key, new_key = _token_key(old_raw), _token_key(new_raw)
        evidence_match = next((row for row in evidence_rows if row["key"] == old_key), None)
        if evidence_match and new_key not in evidence_keys:
            new_start = match.start(2)
            out.append({
                "claim_start": new_start,
                "claim_end": match.end(2),
                "claim_text": new_raw,
                "evidence_start": evidence_match["start"],
                "evidence_end": evidence_match["end"],
                "evidence_text": evidence_match["text"],
                "field": "대상/조건",
                "kind": "explicit_contrast",
            })
    return out


def find_morphological_oppositions(claim: str, evidence: str) -> list[dict]:
    """Catch direct 유-/무- oppositions such as 유주택 vs 무주택."""
    out = []
    for claim_row in _word_rows(claim):
        ck = claim_row["key"]
        if len(ck) < 3 or ck[0] not in {"유", "무"}:
            continue
        opposite = ("무" if ck[0] == "유" else "유") + ck[1:]
        for evidence_row in _word_rows(evidence):
            if evidence_row["key"] != opposite:
                continue
            out.append({
                "claim_start": claim_row["start"],
                "claim_end": claim_row["end"],
                "claim_text": claim_row["text"],
                "evidence_start": evidence_row["start"],
                "evidence_end": evidence_row["end"],
                "evidence_text": evidence_row["text"],
                "field": "조건",
                "kind": "morphological_opposition",
            })
    return out


def _has_same_field_value_conflict(claim: str, evidence: str) -> bool:
    claim_values = _value_tokens(claim)
    ev_values = _value_tokens(evidence)
    if not claim_values or not ev_values:
        return False
    if set(claim_values) == set(ev_values):
        return False
    if set(claim_values).issubset(set(ev_values)):
        return False
    claim_mask = VALUE_RE.sub("<VALUE>", _clean(claim))
    ev_mask = VALUE_RE.sub("<VALUE>", _clean(evidence))
    similarity = SequenceMatcher(None, claim_mask, ev_mask).ratio()
    shared = _anchor_terms(claim) & _anchor_terms(evidence)
    if similarity >= 0.72 and (len(shared) >= 2 or any(len(x) >= 4 for x in shared)):
        return True
    claim_pairs = _value_field_pairs(claim)
    ev_pairs = _value_field_pairs(evidence)
    for cf, cv in claim_pairs:
        for ef, ev in ev_pairs:
            if cv != ev and _similar_field(cf, ef):
                return True
    return False



def _value_type(v: str) -> str:
    if "년" in v or "월" in v or "일" in v:
        return "date"
    for unit in ("%", "명", "건", "주", "억원", "억 원", "원", "가구", "개국", "개", "회"):
        if v.endswith(unit.replace(" ", "")):
            return unit.replace(" ", "")
    return "number"

def has_explicit_value_mismatch(claim: str, evidence: str) -> bool:
    claim_values = _value_tokens(claim)
    ev_values = _value_tokens(evidence)
    if not claim_values or not ev_values:
        return False
    if set(claim_values).issubset(set(ev_values)):
        return False

    shared = _anchor_terms(claim) & _anchor_terms(evidence)
    if not (any(len(x) >= 3 for x in shared) or len(shared) >= 2):
        return False

    # High-confidence semantic conflict may bridge different wording, but only
    # when an explicit value of the same coarse type actually disagrees.
    for cv in claim_values:
        for ev in ev_values:
            if cv != ev and _value_type(cv) == _value_type(ev):
                return True
    return False

def _negative_stems(text: str) -> set[str]:
    text = _clean(text)
    if DOUBLE_NEG_RE.search(text):
        # Double-negation is semantically fragile. Do not auto-promote it
        # into a direct polarity contradiction.
        return set()

    stems: set[str] = set()
    patterns = (
        r"([가-힣A-Za-z]{2,})하지\s*않",
        r"([가-힣A-Za-z]{2,})되지\s*않",
        r"([가-힣A-Za-z]{2,})하지\s*못",
        r"([가-힣A-Za-z]{2,})되지\s*못",
        r"([가-힣A-Za-z]{2,})지\s*않",
        r"([가-힣A-Za-z]{2,})지\s*못",
    )
    for pattern in patterns:
        stems.update(m.group(1) for m in re.finditer(pattern, text))
    return stems


def _anchor_terms(text: str, key: str | None = None) -> set[str]:
    stop = {
        "현재", "최종", "해당", "관련", "자료", "기준", "대한", "그리고",
        "있다", "없다", "한다", "된다", "이다", "아니다", "것이다",
        "가능", "확정", "명확", "완료", "설치",
    }
    particles = ("으로", "에서", "에게", "까지", "부터", "보다", "처럼",
                 "에는", "으로는", "은", "는", "이", "가", "을", "를", "의", "에", "도")
    out = set()
    for token in re.findall(r"[가-힣A-Za-z][가-힣A-Za-z0-9]{1,}", text or ""):
        token = token.lower()
        for p in particles:
            if token.endswith(p) and len(token) - len(p) >= 2:
                token = token[:-len(p)]
                break
        if token in stop:
            continue
        if key and key != "존재/가능 여부" and key in token:
            continue
        if token.endswith(("하다", "했다", "된다", "됐다", "않다", "없다", "있다")):
            continue
        if len(token) >= 2:
            out.add(token)
    return out

def _same_subject_context(claim: str, evidence: str, key: str | None) -> bool:
    shared = _anchor_terms(claim, key) & _anchor_terms(evidence, key)
    if key == "존재/가능 여부":
        if any(len(x) >= 3 for x in shared):
            return True
        return len(shared) >= 2
    return bool(shared)
def _has_direct_opposition(claim: str, evidence: str) -> tuple[bool, str | None]:
    claim_neg = _negative_stems(claim)
    ev_neg = _negative_stems(evidence)

    for stem in ev_neg:
        if stem in claim and stem not in claim_neg:
            return True, stem
    for stem in claim_neg:
        if stem in evidence and stem not in ev_neg:
            return True, stem

    # Existence / availability is frequent enough to treat structurally.
    claim_none = bool(re.search(r"없다|없으며|없고|없음|없는|아니다|아니며|불가능", claim))
    ev_none = bool(re.search(r"없다|없으며|없고|없음|없는|아니다|아니며|불가능", evidence))
    claim_yes = bool(re.search(r"있다|있으며|있고|있음|있는|가능하다|가능한", claim))
    ev_yes = bool(re.search(r"있다|있으며|있고|있음|있는|가능하다|가능한", evidence))
    if (claim_none and ev_yes) or (ev_none and claim_yes):
        return True, "존재/가능 여부"

    return False, None


def analyze_assertion_relation(
    claim: str,
    evidence_text: str,
    score: float = 0.0,
) -> AssertionRelation:
    claim = _clean(claim)
    evidence_text = _clean(evidence_text)

    if DOUBLE_NEG_RE.search(claim) or DOUBLE_NEG_RE.search(evidence_text):
        return AssertionRelation(
            NO_CONFLICT,
            attribution="ambiguous",
            reason="이중부정 표현은 자동 충돌 판정에서 제외합니다.",
        )

    if _has_same_field_value_conflict(claim, evidence_text):
        if OPINION_ATTRIBUTION_RE.search(evidence_text) or HEDGE_RE.search(evidence_text):
            return AssertionRelation(
                ATTRIBUTED_OPPOSITION,
                key="same-field-different-value",
                attribution="attributed_or_hedged",
                reason="같은 속성의 값은 다르지만 근거가 평가·주장·전망 형태입니다.",
            )
        return AssertionRelation(
            DIRECT_CONFLICT,
            key="same-field-different-value",
            attribution="direct",
            reason="같은 대상·속성의 직접 값이 서로 다릅니다.",
        )

    opposite, key = _has_direct_opposition(claim, evidence_text)
    if not opposite:
        return AssertionRelation(NO_CONFLICT)

    if not _same_subject_context(claim, evidence_text, key):
        return AssertionRelation(
            NO_CONFLICT,
            key=key,
            attribution="different_context",
            reason="서술어의 극성은 반대지만 동일한 대상·속성으로 보기 어렵습니다.",
        )

    if OPINION_ATTRIBUTION_RE.search(evidence_text) or HEDGE_RE.search(evidence_text):
        return AssertionRelation(
            ATTRIBUTED_OPPOSITION,
            key=key,
            attribution="attributed_or_hedged",
            reason="근거에는 반대되는 평가·주장·전망이 있으나 직접 사실 진술로 단정할 수 없습니다.",
        )

    return AssertionRelation(
        DIRECT_CONFLICT,
        key=key,
        attribution="direct",
        reason="같은 사실에 대한 핵심 서술의 긍정/부정 방향이 반대입니다.",
    )
