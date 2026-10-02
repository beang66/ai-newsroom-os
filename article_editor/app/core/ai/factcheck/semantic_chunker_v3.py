import re
from dataclasses import dataclass, asdict

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
class SemanticRelation:
    source_id: str
    target_id: str
    type: str
    strength: float
    cue: str | None = None

@dataclass
class ChunkResult:
    units: list[AtomicUnit]
    relations: list[SemanticRelation]

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

def split_speaker_turns(text):
    t = clean(text)
    if t.count("○") < 2:
        return []
    return [clean(x) for x in re.split(r"(?=○)", t) if clean(x)]

def meeting_units(text, soft_limit=SOFT_LIMIT):
    turns = split_speaker_turns(text)
    if not turns:
        return narrative_units(text)
    units, relations = [], []
    prev_turn = None
    prev_turn_last = None
    group_seq = 0
    for turn in turns:
        group_seq += 1
        parts = split_oversize_sentence(turn, soft_limit)
        first_id = None
        last_id = None
        for idx, part in enumerate(parts):
            uid = f"U{len(units)+1:04d}"
            units.append(AtomicUnit(uid, part, "speaker_turn", f"G{group_seq:04d}"))
            if first_id is None:
                first_id = uid
            if idx > 0 and last_id:
                relations.append(SemanticRelation(uid, last_id, "CONTINUATION", 1.0, "same-turn"))
            last_id = uid
        if prev_turn is not None and prev_turn_last and first_id:
            rel = detect_relation(prev_turn, turn)
            if rel:
                rtype, strength, cue = rel
                relations.append(SemanticRelation(first_id, prev_turn_last, rtype, strength, cue))
        prev_turn = turn
        prev_turn_last = last_id
    return ChunkResult(units, relations)

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
def model_relations(boundary, segments, domain):
    # 규칙이 못 잡은 경계만 모델에 묻는다 (규칙 OR 모델). index i = segments[i-1] → segments[i]
    asks = [i for i in range(1, len(segments)) if not segments[i][1]
            and not detect_relation(segments[i - 1][0], segments[i][0])]
    out = {}
    for i, (label, p) in zip(asks, boundary.decide([(segments[i - 1][0], segments[i][0]) for i in asks], domain)):
        if label == 1:
            out[i] = ("MODEL_JOIN", 0.9, f"boundary-model p={p:.2f}")  # 0.9: expand_linked_units 대상
        elif label == 2:
            out[i] = ("INHERIT_TARGET", 0.5, f"boundary-model p={p:.2f}")  # 나누되 L의 대상 정보를 상속
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

def narrative_units(text, soft_limit=SOFT_LIMIT, hard_limit=HARD_LIMIT, meeting_mode=False, boundary=None, domain="press"):
    segments = []
    source_units = split_speaker_turns(text) if meeting_mode else split_sentences(text)
    for sentence in source_units:
        parts = split_oversize_sentence(sentence, soft_limit)
        for i, part in enumerate(parts):
            segments.append((part, i > 0))

    units, relations = [], []
    cur, cur_group = [], "G0001"
    group_seq = 1
    last_unit_id = None
    pending_link = None

    def flush():
        nonlocal cur, last_unit_id, pending_link
        if not cur:
            return None
        uid = f"U{len(units)+1:04d}"
        units.append(AtomicUnit(uid, " ".join(cur), "narrative", cur_group))
        if pending_link:
            target_id, rel, strength, cue = pending_link
            relations.append(SemanticRelation(
                source_id=uid, target_id=target_id,
                type=rel, strength=strength, cue=cue))
            pending_link = None
        cur = []
        last_unit_id = uid
        return uid

    learned = model_relations(boundary, segments, domain) if boundary else {}
    prev_sentence = None
    for idx, (sentence, continuation) in enumerate(segments):
        relation = (
            ("CONTINUATION", 1.0, "oversize-sentence")
            if continuation else
            (detect_relation(prev_sentence or "", sentence) if prev_sentence else None)
        ) or learned.get(idx)
        if relation and relation[0] == "INHERIT_TARGET":
            previous_id = flush()
            pending_link = (previous_id, *relation)
            relation = None
            cur.append(sentence)
        elif not cur:
            cur.append(sentence)
        elif relation:
            proposed = len(" ".join(cur + [sentence]))
            if proposed <= soft_limit:
                cur.append(sentence)
            else:
                previous_id = flush()
                rel, strength, cue = relation
                pending_link = (previous_id, rel, strength, cue)
                cur.append(sentence)
        else:
            flush()
            group_seq += 1
            cur_group = f"G{group_seq:04d}"
            cur.append(sentence)
        prev_sentence = sentence

    flush()
    return ChunkResult(units, relations)

FIELD_START = re.compile(r"(?<!\d)(\d{1,2}(?:-\d+)?\.\s+)")
def structured_units(text, boundary=None):
    t = clean(text)
    # 인용된 목차 참조('II. 증권의 권리내용 2. 권리의 내용'을 참조)는 필드 시작이 아니다
    marks = [m for m in FIELD_START.finditer(t)
             if not ("'" in t[max(0, m.start() - 40):m.start()] and "'" in t[m.end():m.end() + 60])]
    if not marks:
        return narrative_units(t, boundary=boundary, domain="dart")
    units, relations = [], []
    head = t[:marks[0].start()].strip()
    if head:
        units.append(AtomicUnit(f"U{len(units)+1:04d}", head, "section", f"G{len(units)+1:04d}"))
    for i, m in enumerate(marks):
        end = marks[i+1].start() if i+1 < len(marks) else len(t)
        block = clean(t[m.start():end])
        if not block:
            continue
        if len(block) <= HARD_LIMIT:
            units.append(AtomicUnit(f"U{len(units)+1:04d}", block, "field", f"G{len(units)+1:04d}"))
        else:
            sub = narrative_units(block, boundary=boundary, domain="dart")
            new_id = {}
            for u in sub.units:
                new_id[u.id] = u.id = f"U{len(units)+1:04d}"
                u.kind = "field"
                u.group_id = f"G{len(units)+1:04d}"
                units.append(u)
            for r in sub.relations:  # 필드 안 연결(모델 JOIN/INHERIT 포함)을 새 id로 보존
                r.source_id, r.target_id = new_id[r.source_id], new_id[r.target_id]
                relations.append(r)
    return ChunkResult(units, relations)

def add_adjacency_relations(result, strength=0.20):
    # 모든 물리적 경계에는 원문 순서를 복원할 수 있는 저강도 연결을 남긴다.
    # semantic expansion(min_strength=0.85)에는 포함되지 않는 안전망이다.
    for prev, cur in zip(result.units, result.units[1:]):
        result.relations.append(SemanticRelation(
            source_id=cur.id,
            target_id=prev.id,
            type="ADJACENT",
            strength=strength,
            cue="source-order",
        ))
    return result

def chunk_document(text, meta=None, boundary=None):
    # boundary: boundary_model.BoundaryModel (선택). 없으면 규칙만 사용
    meta = meta or {}
    source = (meta.get("source") or "").lower()
    if source == "opendart":
        result = structured_units(text, boundary)
    elif source in {"meeting", "transcript", "interview"}:
        result = meeting_units(text)
    else:
        result = narrative_units(text, boundary=boundary)
    return add_adjacency_relations(result)

def to_dict(result):
    return {
        "units": [asdict(x) for x in result.units],
        "relations": [asdict(x) for x in result.relations],
    }

def expand_linked_units(result, seed_ids, min_strength=0.85, max_hops=1):
    by_id = {u.id: u for u in result.units}
    adjacency = {}
    for rel in result.relations:
        if rel.strength < min_strength:
            continue
        adjacency.setdefault(rel.source_id, set()).add(rel.target_id)
        adjacency.setdefault(rel.target_id, set()).add(rel.source_id)

    selected = set(seed_ids)
    frontier = set(seed_ids)
    for _ in range(max_hops):
        nxt = set()
        for uid in frontier:
            nxt.update(adjacency.get(uid, ()))
        nxt -= selected
        if not nxt:
            break
        selected.update(nxt)
        frontier = nxt
    return [u for u in result.units if u.id in selected and u.id in by_id]

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
