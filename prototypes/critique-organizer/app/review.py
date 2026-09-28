"""Domain service: extraction and orchestration use injected ports, never SQLite or HTTP."""
import hashlib
import json
import re
import time
import uuid
from . import critique
from .contracts import API_VERSION, Assessment, Judge, Retriever, ReviewRepository

MAX_ARTICLE_CHARS=30000
MAX_CLAIMS=300
LABEL_PATTERNS={
    'numerical':r'\d+(?:[.,]\d+)?\s*(?:%|원|명|건|배|억|조|만|천|년|월|일)',
    'causal':r'때문에|으로 인해|따라서|덕분에|(?<![가-힣])(?:초래|야기)',
    'prediction':r'전망|예상|것으로 보인다',
    'attribution':r'말했다|밝혔다|주장했다',
    'opinion':r'최악|최고|무능|훌륭|실패한|실패했다|성공적|바람직|해야 한다',
}
LABEL_NOTES={
    'causal':'인과관계의 직접 근거를 확인하세요.',
    'prediction':'전망의 주체·시점·조건을 확인하세요.',
    'opinion':'평가·의견 표현 후보입니다. 사실 주장과 구분해 검토하세요.',
    'attribution':'발언의 원문·화자·시점을 확인하세요.',
}
INJECTION_RE=re.compile(r'ignore.{0,50}(?:instruction|previous)|system\s*prompt|return\s+["\']?supports|지시.{0,20}무시|무조건.{0,20}(?:참|지지|supports)',re.I|re.S)


def sentence_spans(article):
    boundaries=[0]
    for match in re.finditer(r'(?<=[.!?。])\s+|\n+',article):
        boundaries.extend([match.start(),match.end()])
    boundaries.append(len(article))
    result=[]
    for start,end in zip(boundaries[::2],boundaries[1::2]):
        raw=article[start:end]
        left=len(raw)-len(raw.lstrip())
        right=len(raw.rstrip())
        if right>left:
            result.append({'start':start+left,'end':start+right,'text':raw[left:right]})
    return result


def classify(sentence):
    return [label for label,pattern in LABEL_PATTERNS.items() if re.search(pattern,sentence)] or ['unclassified']


def numbers(text):
    return {(m.group(1).replace(',',''),m.group(2)) for m in re.finditer(r'(\d+(?:,\d{3})*(?:\.\d+)?)\s*(%|조원|억원|만원|만\s*명|명|원|건|배|년|월|일)',text)}


def negated(text):
    return bool(re.search(r'않|아니|없|못했|not\b|never\b|didn.t',text,re.I))


def pair_warnings(claim,excerpt):
    warnings=[]
    claim_numbers=numbers(claim)
    source_numbers=numbers(excerpt)
    if claim_numbers and source_numbers and claim_numbers!=source_numbers:
        warnings.append('numeric_scope_review')
    if negated(claim)!=negated(excerpt):
        warnings.append('negation_scope_review')
    return warnings


def analyze(article: str, *, article_id: str, article_version: int, corpus_revision: int,
            retriever: Retriever, judge: Judge | None, repository: ReviewRepository,
            max_decisions=12, time_budget=30, title="", glossary=None, source_document_ids=None,
            proofreader=None):
    if not isinstance(article,str) or not article.strip() or len(article)>MAX_ARTICLE_CHARS:
        raise ValueError('기사는 1~30,000자여야 합니다.')
    if not isinstance(article_id,str) or not article_id or len(article_id)>120:
        raise ValueError('article_id가 필요합니다(최대 120자).')
    if type(article_version) is not int or article_version<1:
        raise ValueError('article_version은 1 이상의 정수여야 합니다.')
    glossary = [] if glossary is None else glossary
    critique.validate_options(title,glossary)
    spans=sentence_spans(article)
    if len(spans)>MAX_CLAIMS:
        raise ValueError('최대 300개 문장입니다. 검토를 생략하지 않으므로 원고를 나누어 실행하세요.')
    digest=hashlib.sha256(article.encode()).hexdigest()
    deadline=time.monotonic()+time_budget
    calls=0
    claims=[]
    for span in spans:
        labels=classify(span['text'])
        candidates=retriever.retrieve(span['text'],4)
        flags=[LABEL_NOTES[label] for label in labels if label in LABEL_NOTES]
        if not candidates:
            flags.append('현재 검색 범위에서 후보가 없습니다. 실제 근거 부재를 의미하지 않습니다.')
        items=[]
        for candidate in candidates:
            warnings=pair_warnings(span['text'],candidate.excerpt)
            if INJECTION_RE.search(span['text']+'\n'+candidate.excerpt):
                warnings.append('instruction_like_text')
                decision=Assessment('blocked',reason='instruction_like_text')
            elif judge is None:
                decision=Assessment('unavailable',reason='provider_not_enabled')
            elif calls>=max_decisions or time.monotonic()>=deadline:
                decision=Assessment('skipped',reason='review_budget_exceeded')
            else:
                decision=judge.assess(span['text'],candidate)
                calls+=1
            items.append({**candidate.to_dict(),'role':'retrieval_candidate','assessment':decision.to_dict(),'warnings':warnings})
        relations={item['assessment']['relation'] for item in items if item['assessment']['state']=='evaluated'}
        if 'supports' in relations and 'contradicts' in relations:
            flags.append('후보 자료의 모델 판단이 엇갈립니다. 시점·범위·원출처를 비교하세요.')
        claims.append({'id':hashlib.sha256(f'{digest}:{span["start"]}:{span["end"]}'.encode()).hexdigest()[:24],
                       **span,'labels':labels,'status':'review_required','flags':flags,'candidates':items})
    evaluated=sum(c['assessment']['state']=='evaluated' for claim in claims for c in claim['candidates'])
    result={'api_version':API_VERSION,'id':uuid.uuid4().hex,'article_id':article_id,
            'article_version':article_version,'article_hash':digest,'corpus_revision':corpus_revision,
            'offset_encoding':'unicode_code_points','claims':claims,
            'mode':'model_assisted' if evaluated else 'local_review',
            'coverage':{'total_sentences':len(spans),'processed_sentences':len(claims),'omitted_sentences':0,
                        'evaluated_pairs':evaluated,'unevaluated_pairs':sum(len(c['candidates']) for c in claims)-evaluated},
            'limitations':['rule_based_sentence_labels','keyword_retrieval','no_truth_verdict','no_bias_style_context_audit']}
    selected = source_document_ids if source_document_ids is not None else sorted({c['document_id'] for claim in claims for c in claim['candidates']})
    result.update(critique.run(article,title,claims,glossary,len(selected)))
    if proofreader is not None:
        model_spelling = proofreader.check(article,title,glossary,result['findings'])
        result['model_proofreading'] = {key: model_spelling[key] for key in ('state','reason','rejected')}
        result['findings'].extend(model_spelling['findings'])
        result['summary']['spelling'] += len(model_spelling['findings'])
        for check in result['checks']:
            if check['category']=='spelling' and model_spelling['state']=='evaluated':
                check['finding_count'] += len(model_spelling['findings'])
                check['limitation'] += ' OpenAI 제안은 최대 30건이며, 원문 위치가 맞지 않으면 제외합니다.'
    else:
        result['model_proofreading'] = {'state':'not_requested','reason':'','rejected':0}
    result['title']=title
    result['source_document_ids']=selected
    result['input_hash']=hashlib.sha256(json.dumps({'article':article,'title':title,'sources':selected,'glossary':glossary},sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    result['limitations']=['limited_rule_checks','keyword_retrieval','no_external_fact_search','no_legal_verdict']
    repository.save_review(article,result,corpus_revision)
    return result
