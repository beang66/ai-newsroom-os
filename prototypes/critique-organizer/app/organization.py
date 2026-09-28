"""Deterministic, evidence-backed organization. No file mutation or model calls."""
import hashlib
import re
from .critique import PERSON_ROLE
from .ingest import ORG_RE

TYPES = {'unclassified':'미분류', 'press_release':'보도자료', 'interview':'인터뷰',
         'statistics':'통계', 'report':'보고서', 'note':'취재메모'}
TYPE_RULES = {
    'press_release': r'보도\s*자료|배포\s*일시',
    'interview': r'인터뷰|녹취|질문\s*:|답변\s*:',
    'statistics': r'통계|조사\s*결과|집계',
    'report': r'보고서|연구\s*보고',
    'note': r'취재\s*메모|현장\s*메모',
}
TOPICS = {'교통':r'버스|교통|철도', '경제':r'경제|금리|물가', '환경':r'환경|탄소|기후',
          '교육':r'교육|학교|대학교', '주거':r'주택|주거|아파트', '노동':r'노동|임금|고용',
          '보건':r'보건|의료|병원', '정책':r'정책|예산|조례', '기술':r'반도체|인공지능|기술'}


def evidence(block, start, end):
    return {'block_id':block['id'], 'start':start, 'end':end,
            'excerpt':block['text'][start:end], 'locator':block['locator']}


def describe(title, blocks):
    """Returns suggestions, never adjudicated facts. Summary is a literal excerpt."""
    joined = '\n'.join(b['text'] for b in blocks)
    title_hits = [kind for kind, pattern in TYPE_RULES.items() if re.search(pattern, title)]
    hits = title_hits or [kind for kind, pattern in TYPE_RULES.items() if re.search(pattern, joined)]
    kind = hits[0] if len(hits) == 1 else 'unclassified'
    type_evidence = []
    if kind != 'unclassified':
        for block in blocks:
            match = re.search(TYPE_RULES[kind], block['text'])
            if match:
                type_evidence = [evidence(block, *match.span())]
                break
    tags = []
    for label, pattern in TOPICS.items():
        for block in blocks:
            match = re.search(pattern, block['text'])
            if match:
                tags.append({'label':label, 'origin':'rule_suggestion', 'evidence':[evidence(block, *match.span())]})
                break
    summary = []
    for block in blocks[:2]:
        summary.append(evidence(block, 0, min(len(block['text']), 180)))
    mentions = []
    for block in blocks:
        matches = [(m.group(1), 'organization_candidate', m.span(1)) for m in ORG_RE.finditer(block['text'])]
        matches += [(m['name'], 'person_candidate', m.span('name')) for m in PERSON_ROLE.finditer(block['text'])]
        for name, node_kind, span in matches:
            # Occurrence identity prevents accidental merging of same-name people.
            key = hashlib.sha256(f'{block["id"]}:{span}:{node_kind}'.encode()).hexdigest()[:24]
            mentions.append({'id':'mention:'+key, 'label':name, 'kind':node_kind,
                             'evidence':evidence(block, *span)})
    return {'type':kind, 'type_origin':'rule_suggestion', 'type_evidence':type_evidence,
            'type_reason':'파일명 규칙' if len(title_hits)==1 else ('본문 규칙' if kind!='unclassified' else '분류 단서 없음 또는 복수 유형'),
            'tags':tags, 'summary':summary, 'summary_kind':'extractive_preview',
            'mentions':mentions, 'document_date':None, 'project_ids':[], 'revision':1}
