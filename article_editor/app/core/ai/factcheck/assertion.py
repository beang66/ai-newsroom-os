"""판정 보조 — 판정(verdict)은 하지 않고 UI 강조 위치만 찾는다.

판정기 앞단 규칙(값 불일치·대조·유/무·극성 반대로 먼저 충돌 확정)은 2026-10-06 제거:
봉인 386주장·긴 문서 29건에서 헛경보가 맞힌 것보다 많았다(research/factcheck-judge README).
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher

_RECIPIENT_RE = re.compile(
    r'(?P<target>(?:관할\s+)?[가-힣A-Za-z·ㆍ]+?(?:단체장|서장|장관|기관장|기관|위원회|청장|지사|시장|군수|구청장))'
    r'\s*(?:등\s*)?에\s*게\s*(?P<action>제출|신고|통보|보고)'
)


def recipient_assertions(text: str) -> list[dict]:
    """긴 문장에서 목적물-수신자-행위를 별도 주장으로 꺼낸다. 참/거짓 판정은 모델이 한다.

    ponytail: 명시적인 수신자와 바로 이어진 제출/신고/통보/보고만 다룬다. 다른 관계는 학습·분해 확장이 필요하다.
    """
    out = []
    for m in _RECIPIENT_RE.finditer(text):
        prefix = text[max(0, m.start() - 160):m.start()]
        objects = list(re.finditer(r'(?:[가-힣A-Za-z0-9]+\s+)?[가-힣A-Za-z0-9]+[을를](?=\s)', prefix))
        if not objects:
            continue
        obj = objects[-1].group().strip()
        if obj in ('이를', '이것을', '그것을'):
            continue  # 짧은 주장에 대명사만 남으면 무엇을 보내는지 바뀔 수 있다
        tail = text[m.start():]
        stop = re.search(r'[.?!]', tail)
        if stop:
            tail = tail[:stop.end()]
        out.append({'text': obj + ' ' + tail.replace('**', '').replace('__', '').replace('~~', ''),
                    'object': obj, 'action': m['action'], 'target': m['target'],
                    'start': m.start('target'), 'end': m.end('target')})
    return out


VALUE_RE = re.compile(
    r"\d{4}\s*년\s*\d{1,2}\s*월(?:\s*\d{1,2}\s*일)?|"
    r"\d{1,2}\s*월\s*\d{1,2}\s*일|"
    # 1천500만원·3억 2천만원 같은 섞인 표기도 한 값으로
    r"\d[\d,]*(?:\.\d+)?(?:\s*(?:조|억|천|백|만)(?:\s*\d[\d,]*)?)*\s*(?:원|%|명|건|주|가구|개국|개|회)?"
)

def _value_type(v: str) -> str:
    if "년" in v or "월" in v or "일" in v:
        return "date"
    for unit in ("%", "명", "건", "주", "억원", "억 원", "원", "가구", "개국", "개", "회"):
        if v.endswith(unit.replace(" ", "")):
            return unit.replace(" ", "")
    return "number"


def _context(text: str, start: int, end: int, width: int = 14) -> set[str]:
    """값 앞뒤 글자의 2글자 조각(공백 제외) — 같은 항목인지 문맥으로 비교한다."""
    around = re.sub(r"\s+", "", text[max(0, start - width):start] + "|" + text[end:end + width])
    return {around[i:i + 2] for i in range(len(around) - 1)}


_BIG = {'조': 1e12, '억': 1e8, '만': 1e4}


def to_number(token: str) -> float | None:
    """'62만7546주'·'627,546'·'1천500만원'·'3억 2천만원' → 같은 수. 날짜·해석 불가면 None."""
    s = re.sub(r'[,\s]', '', token or '')
    if re.search(r'[년월일]', s):
        return None
    s = re.sub(r'(원|%|명|건|주|가구|개국|개|회)$', '', s)
    total = group = 0.0
    num = ''
    for ch in s + '#':
        if ch.isdigit() or ch == '.':
            num += ch
            continue
        try:
            n = float(num) if num else (1.0 if ch in '천백' else 0.0)
        except ValueError:
            return None
        if ch in '천백':
            group += n * (1000 if ch == '천' else 100)
        elif ch in _BIG:
            total += (group + n) * _BIG[ch]
            group = 0.0
        elif ch == '#':
            group += n
        else:
            return None
        num = ''
    return total + group


def shares_value(claim: str, evidence: str) -> bool:
    """문장과 근거에 표기만 다른 같은 수(100 이상, 연도 제외)가 있는가 — 관련 근거 신호(판정 아님)."""
    def values(text):
        out = set()
        for m in VALUE_RE.finditer(text or ''):
            v = to_number(m.group(0))
            if v is not None and v >= 100 and not (1900 <= v <= 2100 and float(v).is_integer() and len(m.group(0).strip()) == 4):
                out.add(v)
        return out
    return bool(values(claim) & values(evidence))


def find_support_spans(claim: str, evidence: str) -> list[dict]:
    """이미 일치로 판정된 청크에서 관련 문장/표 항목을 찾는다(판정에는 사용하지 않는다).

    띄어쓰기·조사가 다른 공시 표도 비교한다. 같은 값은 표기가 달라도 검색 신호로 쓰고,
    대응하는 표현이 부족하거나 최상위 항목이 동점이면 위치를 단정하지 않는다.
    """
    compact = lambda text: re.sub(r'[^가-힣A-Za-z0-9]', '', text).lower()
    needle = compact(claim)
    if not needle or not evidence:
        return []
    # 문장·줄·번호가 붙은 표 항목 경계. 소수점/ISO 날짜/쉼표가 있는 금액은 자르지 않는다.
    cuts = [0, *[m.end() for m in re.finditer(r'\n+|(?<=[.!?])\s+|\s+(?=\d{1,2}\.\s)', evidence)], len(evidence)]
    candidates = []
    for start, end in zip(cuts, cuts[1:]):
        part = evidence[start:end]
        start += len(part) - len(part.lstrip())
        end -= len(part) - len(part.rstrip())
        part = evidence[start:end]
        blocks = SequenceMatcher(None, needle, compact(part), autojunk=False).get_matching_blocks()
        shared = sum(b.size for b in blocks if b.size >= 2)
        if shared < 4 or shared / len(needle) < 0.2:
            continue
        score = (shares_value(claim, part), max(b.size for b in blocks), shared)
        candidates.append((score, start, end))
    candidates.sort(reverse=True)
    if not candidates or (len(candidates) > 1 and candidates[0][0] == candidates[1][0]):
        return []
    _, start, end = candidates[0]
    return [{'evidence_start': start, 'evidence_end': end}]


def find_explicit_value_conflicts(claim: str, evidence: str) -> list[dict]:
    """본문 문장에서 근거와 다른 값의 위치(화면 강조용 — 판정은 판정기가 한다).

    본문 값마다 근거에서 같은 종류(단위)의 값 중 앞뒤 문맥이 가장 비슷한 것을 짝으로 고르고,
    그 짝의 값이 다를 때만 '틀린 값'으로 본다. 같은 값이 근거 다른 곳(예: 현행법 설명)에 있어도 문맥이 다르면 틀린 값이다.
    문맥 점수가 같은 값과 비기면 표시하지 않는다(틀렸다고 단정할 근거가 약하다).
    (2026-10-06: '값 바로 앞 단어'로 항목을 맞추던 규칙은 바꿔 쓴 문장에서 맞는 값을 칠하고 틀린 값을 놓쳤다 —
    예: 본문 '총급여 기준을 9천만원'(맞음)을 근거 '종합소득금액 기준을 8천만원'과 짝지었고 '19% 공제율'은 못 찾음)
    """
    def rows(text):
        return [{"start": m.start(), "end": m.end(), "text": m.group(0), "value": re.sub(r"\s+|,", "", m.group(0))}
                for m in VALUE_RE.finditer(text or "")]

    claim_rows, evidence_rows = rows(claim), rows(evidence)
    conflicts = []
    for row in claim_rows:
        kind = _value_type(row["value"])
        candidates = [e for e in evidence_rows if _value_type(e["value"]) == kind]
        if not candidates:
            continue  # 비교할 같은 종류의 값이 근거에 없다 — 틀렸다고 할 근거가 없다
        mine = _context(claim, row["start"], row["end"])
        score = lambda e: len(mine & _context(evidence, e["start"], e["end"]))  # noqa: E731
        best = max(candidates, key=score)
        same = [score(e) for e in candidates if e["value"] == row["value"]]
        if best["value"] == row["value"] or (same and max(same) >= score(best)):
            continue  # 가장 비슷한 자리의 값이 같다 — 맞는 값
        conflicts.append({
            "claim_start": row["start"],
            "claim_end": row["end"],
            "claim_text": row["text"],
            "evidence_start": best["start"],
            "evidence_end": best["end"],
            "evidence_text": best["text"],
            "field": kind,
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


def find_near_copy_differences(claim: str, evidence: str, min_ratio: float = 0.72, window: bool = False) -> list[dict]:
    """Locate small textual substitutions only when the two statements are already very similar.

    This is a localization helper, not a semantic verdict. It is intentionally
    disabled for freely paraphrased sentences so normal newsroom rewriting is
    not mistaken for a factual conflict.

    window=True: 근거가 여러 문장짜리 청크일 때, 청크 안에서 주장과 맞닿은 구간만 잘라 비교한다(화면 강조용 —
    판정 경로(일치→검토 가드)는 기본값 False 를 그대로 쓴다).
    """
    claim_rows = _word_rows(claim)
    evidence_rows = _word_rows(evidence)
    if not claim_rows or not evidence_rows:
        return []
    if window and len(evidence_rows) > len(claim_rows) * 1.3:
        probe = SequenceMatcher(None, [r["key"] for r in claim_rows], [r["key"] for r in evidence_rows], autojunk=False)
        blocks = [b for b in probe.get_matching_blocks() if b.size >= 2]
        if not blocks:
            return []
        evidence_rows = evidence_rows[blocks[0].b:blocks[-1].b + blocks[-1].size]

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
