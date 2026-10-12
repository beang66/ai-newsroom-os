import re
from dataclasses import dataclass

SOFT_LIMIT = 420
HARD_LIMIT = 650

@dataclass
class AtomicUnit:
    id: str
    text: str
    kind: str = "narrative"
    group_id: str | None = None
    field: str | None = None

@dataclass
class ChunkResult:
    units: list[AtomicUnit]
    relations: list

def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()
STRONG_CUES = [
    ("그러나", "CONTRAST", 1.0),
    ("하지만", "CONTRAST", 1.0),
    ("그렇지만", "CONTRAST", 1.0),
    ("반면", "CONTRAST", 0.95),
    ("다만", "LIMITATION", 1.0),
    ("단,", "LIMITATION", 1.0),
    ("단 ", "LIMITATION", 0.95),
    ("실제로는", "CORRECTION", 1.0),
    ("정확히는", "CORRECTION", 1.0),
    ("그게 아니라", "CORRECTION", 1.0),
    ("다시 말하면", "CORRECTION", 0.95),
    ("정정하", "CORRECTION", 1.0),
    ("잘못 말", "CORRECTION", 1.0),
    ("잘못 기억", "CORRECTION", 1.0),
    ("이에 따라", "CAUSAL", 0.9),
    ("이로 인해", "CAUSAL", 0.95),
    ("따라서", "CAUSAL", 0.9),
    ("그러므로", "CAUSAL", 0.9),
]

REFERENCE_CUES = [
    ("이는", "REFERS_TO", 0.90),
    ("이를", "REFERS_TO", 0.90),
    ("이것은", "REFERS_TO", 0.90),
    ("그것은", "REFERS_TO", 0.90),
    ("이러한", "REFERS_TO", 0.90),
    ("그 결과", "RESULT_OF", 0.95),
    ("이 과정", "REFERS_TO", 0.90),
    ("그 과정", "REFERS_TO", 0.90),
    ("이 사업", "REFERS_TO", 0.90),
    ("그 사업", "REFERS_TO", 0.90),
    ("이 프로그램", "REFERS_TO", 0.90),
    ("그 프로그램", "REFERS_TO", 0.90),
    ("이 중", "SUBSET_OF", 0.90),
    ("이 가운데", "SUBSET_OF", 0.90),
    ("이때", "TEMPORAL_REF", 0.90),
    ("이와 관련", "REFERS_TO", 0.90),
    ("그와 관련", "REFERS_TO", 0.90),
    ("그 부분", "REFERS_TO", 0.90),
    ("해당", "REFERS_TO", 0.80),
]

def _speaker_turn(text):
    t = clean(text)
    return t.startswith("○") or bool(re.match(r"^[^:]{1,30}:\s*", t))

def _unclosed_quote(text):
    t = clean(text)
    return t.count("“") > t.count("”")

def _question_intent(text):
    t = clean(text)
    if t.endswith("?"):
        return True
    patterns = (
        "궁금합니다", "궁금한데", "알려주시면", "말씀해 주시면",
        "어떻게 되나요", "어떻게 되는지", "어느 정도", "맞습니까",
        "인가요", "입니까", "습니까", "까요", "거죠", "건가요",
    )
    if any(p in t for p in patterns):
        return True
    # 회의 발화에서는 '그럼 ... 하고 나서.'처럼 물음표 없이 질문을 생략하기도 한다.
    head = t[:80]
    return (" 그럼 " in head or " 그러면 " in head) and len(t) <= 120

def detect_relation(left, right):
    l = clean(left)
    r = clean(right)
    for cue, rel, strength in STRONG_CUES:
        if r.startswith(cue):
            return rel, strength, cue
    for cue, rel, strength in REFERENCE_CUES:
        if r.startswith(cue):
            return rel, strength, cue
    if _unclosed_quote(l):
        return "CONTINUATION", 1.0, "unclosed-quote"
    # 인터뷰/회의록의 질문-답변은 물음표가 없더라도 질문 의도가 있으면 연결한다.
    if _question_intent(l) and (_speaker_turn(l) or l.endswith("?")):
        return "ANSWERS", 0.95, "question-intent"
    return None

# 공시·보도자료의 목록 번호: 2. / 가. / Ⅳ. / II.  — 마침표지만 문장 끝이 아니라 다음 항목의 시작
_M = r"(?:\d{1,2}(?:-\d{1,2})?|[가나다라마바사아자차카타파하]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]{1,3}|[IVX]{1,4})"
LIST_MARKER = re.compile(rf"{_M}(?:\.{_M})*")  # 4-1. / II.3. 같은 연쇄 번호 포함
ABBREV = {"ltd", "bhd", "sdn", "inc", "co", "corp", "pte", "llc", "plc"}  # 회사명 약어 뒤 점

QUOTE_TAIL = re.compile(r"\s*(?:이?라고|라며|이?라는|하며|며[\s,]|고[\s,])")

def split_sentences(text):
    t = clean(text)
    if not t:
        return []

    parts = []
    start = 0
    n = len(t)
    for i, ch in enumerate(t):
        if ch not in ".!?":
            continue

        j = i + 1
        while j < n and ord(t[j]) in (34, 39, 8217, 8221):
            j += 1
        quote_end = j
        while j < n and t[j].isspace():
            j += 1

        # 인용문 끝 + 인용 조사: “…바랍니다.”라고 전했다 / “…”며, / “…”고 밝혔다 → 한 문장
        if quote_end > i + 1 and QUOTE_TAIL.match(t, quote_end):
            continue
        # 따옴표 없는 인용 조사: …준비하자! 라는 주제로 / …지원하겠다. 라고 말했다 (문장이 '라는'으로 시작할 수는 없다)
        if re.match(r"이?라(?:고|는|며)[\s,]", t[j:j + 4]):
            continue

        if ch == "." and i > 0 and j < n:
            prev = t[i - 1]
            nxt = t[j]
            # 2.0, 2026.09.30 같은 숫자 내부 점은 문장 경계가 아니다.
            if prev.isdigit() and nxt.isdigit():
                continue
            # dart.fss.or.kr 처럼 공백 없이 이어진 영문 도메인 내부 점
            if j == i + 1 and prev.isascii() and prev.isalpha() and nxt.isascii() and nxt.isalpha():
                continue

            # URL / 이메일 내부 점도 문장 경계로 취급하지 않는다.
            token_start = t.rfind(" ", start, i)
            token = t[(token_start + 1 if token_start >= 0 else start):j]
            low = token.lower()
            if "http://" in low or "https://" in low or "www." in low or "@" in token:
                continue

        if ch == ".":
            tok_start = max(start, t.rfind(" ", start, i) + 1)
            tok = t[tok_start:i]
            if j < n and "'" in t[start:i] and LIST_MARKER.fullmatch(tok.rsplit("'", 1)[-1]) and t[start:i].count("'") % 2:
                continue  # 인용된 목차 참조 안: '…서류'II. 증권의 권리내용 2. 권리의 내용'을 참조
            if j < n and (tok.lower() in ABBREV or (j == i + 1 and LIST_MARKER.fullmatch(tok))):
                continue  # Co., Ltd. / 본문 속 목차 참조 "II.3.가.에 기재된"
            if j < n and tok.isdigit() and re.search(r"\d\.\s*$", t[start:tok_start]):
                continue  # 날짜 "2023. 9. 1." / "(10. 30. ~ 11. 3.)"
            if j < n and LIST_MARKER.fullmatch(tok):
                # 번호 뒤가 아니라 번호 앞에서 자른다: "… 지점 Ⅳ. 조달된 …" → "… 지점" | "Ⅳ. 조달된 …"
                if t[start:tok_start].strip():
                    parts.append(clean(t[start:tok_start]))
                    start = tok_start
                continue

        if j >= n:
            parts.append(clean(t[start:quote_end]))
            start = n
            break

        # 공백이 없어도 다음 문장이 바로 붙어 있는 실무 원문을 인식한다.
        if re.match(r'[가-힣A-Za-z0-9“‘"◦▲]', t[j]):
            parts.append(clean(t[start:quote_end]))
            start = j

    if start < n:
        tail = clean(t[start:])
        if tail:
            parts.append(tail)
    return [x for x in parts if x]

def split_oversize_sentence(sentence, hard_limit=HARD_LIMIT):
    if len(sentence) <= hard_limit:
        return [sentence]
    # 너무 긴 한 문장은 쉼표/세미콜론 주변의 가장 가까운 안전 후보를 사용한다.
    out, rest = [], sentence
    while len(rest) > hard_limit:
        lo, hi = max(120, hard_limit - 120), hard_limit
        candidates = [m.end() for m in re.finditer(r"[,;:]\s*", rest[:hi]) if m.end() >= lo]
        cut = candidates[-1] if candidates else hard_limit
        out.append(clean(rest[:cut]))
        rest = clean(rest[cut:])
    if rest:
        out.append(rest)
    return out
def packed_units(text, boundary=None, domain="press", target=SOFT_LIMIT, hard_limit=HARD_LIMIT):
    """v3 경계 + 크기 묶기: 붙여야 하는 경계(규칙·모델 JOIN)는 자르지 않고, target을 넘을 때만
    '나눔' 확률이 가장 높은 경계에서 자른다. 의미 경계마다 자르면 청크가 너무 작아 문맥이 끊기기 때문."""
    segs = [(p, i > 0) for s in split_sentences(text) for i, p in enumerate(split_oversize_sentence(s, target))]
    if not segs:
        return ChunkResult([], [])
    # gap[i] = segs[i-1]|segs[i] 경계의 자르기 점수. None = 자르면 안 됨
    gap = [None] * len(segs)
    asks = []
    for i in range(1, len(segs)):
        if segs[i][1] or detect_relation(segs[i - 1][0], segs[i][0]):
            continue
        gap[i] = 1.0
        asks.append(i)
    if boundary and asks:
        th = boundary.threshold[domain]
        for i, p in zip(asks, boundary.probs([(segs[i - 1][0], segs[i][0]) for i in asks])):
            gap[i] = None if p[1] >= th and p[1] >= p[2] else float(p[0])  # 상속 경계는 p[0]이 낮아 덜 선호됨
    # 자르면 안 되는 경계로 묶인 원자 단위. 단 hard_limit을 넘으면 강제로 자른다
    atoms = []  # [text, 앞 경계 점수]
    for i, (s, _) in enumerate(segs):
        if atoms and gap[i] is None and len(atoms[-1][0]) + 1 + len(s) <= hard_limit:
            atoms[-1][0] += " " + s
        else:
            atoms.append([s, gap[i] if gap[i] is not None else 0.0])
    chunks, cur = [], []
    for a in atoms:
        if cur and sum(len(x[0]) + 1 for x in cur) + len(a[0]) > target:
            # 앞부분이 target의 절반 이상인 경계 중 나눔 점수가 가장 높은 곳에서 자른다 (k == len(cur): 새 원자 앞)
            ks = [k for k in range(1, len(cur) + 1) if sum(len(x[0]) + 1 for x in cur[:k]) >= target // 2] or [len(cur)]
            k = max(ks, key=lambda k: (cur[k][1] if k < len(cur) else a[1], k))
            chunks.append(" ".join(x[0] for x in cur[:k])); cur = cur[k:]
        cur.append(a)
    if cur:
        chunks.append(" ".join(x[0] for x in cur))
    return ChunkResult([AtomicUnit(f"U{i + 1:04d}", c, "narrative", f"G{i + 1:04d}") for i, c in enumerate(chunks)], [])

if __name__ == "__main__":
    # 목록 번호·도메인·인용 목차에서 문장을 자르지 않는지 확인
    assert split_sentences("라. 투자설명서 공시 1. 전자문서 : 홈페이지 → dart.fss.or.kr 2. 서면문서 : 본,지점 Ⅳ. 조달된 자금 가. 자금조달내역") == [
        "라. 투자설명서 공시", "1. 전자문서 : 홈페이지 → dart.fss.or.kr", "2. 서면문서 : 본,지점", "Ⅳ. 조달된 자금", "가. 자금조달내역"]
    assert split_sentences("자세한 내용은 본 서류'II. 증권의 권리내용 2. 권리의 내용'을 참조하시기 바랍니다. 만기시 현금결제.") == [
        "자세한 내용은 본 서류'II. 증권의 권리내용 2. 권리의 내용'을 참조하시기 바랍니다.", "만기시 현금결제."]
    assert split_sentences("ABC Co., Ltd. 및 XYZ Sdn. Bhd. 가 참여 4-1. 개요 위 II.3.가.에 기재된 사유.") == [
        "ABC Co., Ltd. 및 XYZ Sdn. Bhd. 가 참여", "4-1. 개요 위 II.3.가.에 기재된 사유."]
    assert split_sentences("희망자 신청(10. 30. ~ 11. 3.), 심의를 거쳐 선발한다. 2023. 9. 1.자 전입 교장을 소개했다.") == [
        "희망자 신청(10. 30. ~ 11. 3.), 심의를 거쳐 선발한다.", "2023. 9. 1.자 전입 교장을 소개했다."]
    assert split_sentences("교사는 “뿌듯했다.”라고 전했다. 학생은 “재밌어요!”며, “또 할래요.”고 밝혔다. 다음 행사는 “축제”다.") == [
        "교사는 “뿌듯했다.”라고 전했다.", "학생은 “재밌어요!”며, “또 할래요.”고 밝혔다.", "다음 행사는 “축제”다."]
    assert split_sentences("우리 아이의 미래를 준비하자! 라는 주제로 열었다. 장학금을 기탁하였다. 고 대표는 말했다.") == [
        "우리 아이의 미래를 준비하자! 라는 주제로 열었다.", "장학금을 기탁하였다.", "고 대표는 말했다."]
    assert split_sentences("버전 2.0이 나왔다. 그는 왜 그랬는가. 다음 사람이 왔다.") == [
        "버전 2.0이 나왔다.", "그는 왜 그랬는가.", "다음 사람이 왔다."]
    print("ok")
    # 크기 묶기: 붙여야 할 경계(다만)는 유지하고, 크기 초과 시 가장 독립적인 경계에서 자른다
    class _Stub:  # 모델 대역: '한편'만 확실한 나눔, 나머지는 애매
        threshold = {"press": 0.5}
        def probs(self, pairs):
            return [[0.99, 0.0, 0.01] if r.startswith("한편") else [0.4, 0.3, 0.3] for _, r in pairs]
    t = "가" * 150 + "였다. " + "나" * 150 + "였다. 다만 " + "다" * 100 + "였다. 한편 " + "라" * 150 + "였다."
    cs = [u.text for u in packed_units(t, _Stub(), target=420).units]
    assert len(cs) == 2 and cs[1].startswith("한편") and "다만" in cs[0], cs
    print("pack ok")
