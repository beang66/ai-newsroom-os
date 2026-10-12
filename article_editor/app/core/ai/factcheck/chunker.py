import re
from dataclasses import dataclass
from functools import lru_cache
from .semantic_chunker_v3 import clean, packed_units

@dataclass
class EvidenceUnit:
    text:str
    kind:str
    field:str|None=None
    source_span:str|None=None
    priority:float=1.0

FIELD_START=re.compile(r"(?<!\d)(\d{1,2}(?:-\d+)?\.\s+)")
DART_KEYS=[
 "공시일자","정정대상 공시서류","최초제출일","이사회결의일","결정일","취득예정일",
 "매도 결정일","매도결정일","납입일","상장 예정일","사채만기일","발행일자",
 "취득금액","매도금액","처분예정금액","처분결정일","전환가액","주식수",
 "주식총수 대비비율","자산총액 대비","향후 처리계획","기타 투자판단에 참고할 사항"
]


def fmt_date(s):
    s=str(s or "")
    if len(s)==8 and s.isdigit(): return f"{int(s[:4])}년 {int(s[4:6])}월 {int(s[6:8])}일"
    return s
def normalize_report_name(s):
    s=clean(s)
    return re.sub(r"^\[[^\]]+\]", "", s).strip()


def metadata_units(meta):
    out=[]
    corp=clean(meta.get("corp_name","")); report=normalize_report_name(meta.get("report_nm",""))
    date=fmt_date(meta.get("document_date") or meta.get("date"))
    if corp or report or date:
        out.append(EvidenceUnit(
            text=f"회사: {corp}. 공시 종류: {report}. 공시일자: {date}.",
            kind="metadata",field="document_identity",priority=3.0))
    if corp: out.append(EvidenceUnit(text=f"회사명: {corp}.",kind="metadata",field="corp_name",priority=2.2))
    if report: out.append(EvidenceUnit(text=f"공시 종류: {report}.",kind="metadata",field="report_name",priority=2.2))
    if date: out.append(EvidenceUnit(text=f"공시일자: {date}.",kind="metadata",field="document_date",priority=3.0))
    return out

def _split_numbered(text):
    t=clean(text)
    marks=list(FIELD_START.finditer(t))
    if not marks:return [t] if t else []
    out=[]
    head=t[:marks[0].start()].strip()
    if head: out.append(head)
    for i,m in enumerate(marks):
        e=marks[i+1].start() if i+1<len(marks) else len(t)
        b=t[m.start():e].strip()
        if b: out.append(b)
    return out
def _field_units(block):
    positions=[]
    for key in DART_KEYS:
        for m in re.finditer(re.escape(key),block):
            positions.append((m.start(),key))
    positions=sorted(set(positions))
    if len(positions)<2:return [block]
    out=[]
    if positions[0][0]>0:
        pre=block[:positions[0][0]].strip()
        if pre: out.append(pre)
    for i,(pos,key) in enumerate(positions):
        e=positions[i+1][0] if i+1<len(positions) else len(block)
        x=block[pos:e].strip(" -:;")
        if x: out.append(x)
    return out

def dart_units(text,meta):
    out=metadata_units(meta)
    for block in _split_numbered(text):
        for x in _field_units(block):
            x=clean(x)
            if not x:continue
            if len(x)<=420:
                out.append(EvidenceUnit(text=x,kind="field" if any(k in x for k in DART_KEYS) else "section"))
            else:
                ss=[clean(z) for z in re.split(r"(?<=[.!?])\s+(?=[가-힣A-Z0-9“‘])",x) if clean(z)]
                if len(ss)<=1:
                    for i in range(0,len(x),360):
                        out.append(EvidenceUnit(text=x[max(0,i-60):i+360],kind="narrative"))
                else:
                    cur=[]
                    for s in ss:
                        if cur and len(" ".join(cur+[s]))>420:
                            out.append(EvidenceUnit(text=" ".join(cur),kind="narrative"))
                            cur=cur[-1:]+[s]
                        else: cur.append(s)
                    if cur: out.append(EvidenceUnit(text=" ".join(cur),kind="narrative"))
    return dedupe(out)
from .paths import BOUNDARY_DIR

@lru_cache(maxsize=1)
def _boundary():
    # 경계 모델(KLUE-RoBERTa ONNX, CPU). 없거나 로드 실패 시 규칙만 사용
    try:
        from .boundary_model import BoundaryModel
        return BoundaryModel(BOUNDARY_DIR)
    except Exception as exc:
        print(f"[boundary-model] disabled: {type(exc).__name__}: {exc}",flush=True)
        return None

def _source_span(t,s,cursor):
    # 청커는 붙어 있던 문장 사이에 공백을 넣어 이어붙인다("있다.사진" → "있다. 사진").
    # knowledge store가 원문 위치를 역추적하므로 공백 차이만 무시하고 원문 구간을 그대로 돌려준다.
    for i in range(cursor,len(t)):
        if t[i]!=s[0]: continue
        a,b,j=i,i,0
        while j<len(s) and b<len(t):
            if t[b]==s[j]: b+=1; j+=1
            elif s[j]==" ": j+=1
            elif t[b]==" ": b+=1
            else: break
        if j==len(s): return a,b
    return None

@lru_cache(maxsize=256)  # ponytail: 검증 요청마다 같은 자료를 다시 청킹하므로 본문 단위 캐시
def _narrative_texts(t):
    out=[]; cursor=0
    for u in packed_units(t,boundary=_boundary()).units:
        span=_source_span(t,u.text,cursor)
        if span is None: out.append(u.text); continue
        out.append(t[span[0]:span[1]]); cursor=span[1]
    return tuple(out)

def narrative_units(text,meta=None):
    t=clean(text)
    if not t: return []
    return dedupe([EvidenceUnit(text=x,kind="narrative") for x in _narrative_texts(t)])

def dedupe(units):
    seen=set(); out=[]
    for u in units:
        k=clean(u.text)
        if not k or k in seen:continue
        seen.add(k); u.text=k; out.append(u)
    return out

def chunk_document(text,meta):
    source=(meta.get("source") or "").lower()
    if source=="opendart": return dart_units(text,meta)
    return narrative_units(text,meta)
