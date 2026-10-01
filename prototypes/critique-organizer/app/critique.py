"""Seven explicit editorial check families. Findings are review aids, never publication gates.

Pure rules: no database/network. Source checks compare retrieved text, not external truth.
All offsets are Unicode code points into the untouched title/body.
"""
import hashlib
import re
from decimal import Decimal
from difflib import SequenceMatcher
from .retrieval import query_tokens

ENGINE_VERSION = 'critique-0.3.0'
CATEGORIES = {
    'facts':'사실관계', 'numbers':'숫자·통계', 'quotes':'인용·출처',
    'logic':'논리적 연결', 'spelling':'맞춤법·오탈자',
    'legal_ethics':'법적·윤리적 위험', 'names':'고유명사·인명·직책',
}
LIMITS = {
    'facts':'제목·본문의 확정 수준과 선택 자료의 부정/날짜 차이 후보. 외부 사실 확인은 하지 않음.',
    'numbers':'단순 단위 수치 비교, A에서 B로 변한 증감률, %와 %p, 두 항목 합계. 복합 통계 모형은 미지원.',
    'quotes':'큰따옴표 인용의 유사 원문·부정 차이. 화자 추정은 이름+직책 형식에 한정.',
    'logic':'자료와 비교한 인과 단정 및 일부→전체 확대. 포괄적인 논증 평가는 아님.',
    'spelling':'명시된 8개 오탈자·띄어쓰기 규칙. 전체 한국어 맞춤법 사전은 아니며 고유명사·인용은 자동 수정 제외.',
    'legal_ethics':'연락처/식별번호 패턴, 혐의 단정, 일부 낙인 표현, 대상 입장 확인 질문. 위법성·법적 안전 판단은 아님.',
    'names':'사용자 표기 기준과 이름+직책 형식 비교. 현직 확인·동명이인 식별은 미지원.',
}
ROLE = r'(?:시장|도지사|구청장|군수|장관|차관|대변인|대표|사장|교수|위원장|국장|원장|기자)'
PERSON_ROLE = re.compile(r'(?<![가-힣])(?P<name>[가-힣]{2,4})\s+(?P<role>'+ROLE+r')(?=은|는|이|가|의|과|와|도|\s|[.,:;]|$)')
QUOTES = re.compile(r'“([^”]+)”|"([^"\n]+)"')
UNCERTAIN = re.compile(r'검토\s*중|계획|예정|가능성|추정|의혹|주장|논의\s*중')
CERTAIN = re.compile(r'확정|시행했다|실시했다|완료했다|입증됐다|밝혀졌다')
NEGATIVE = re.compile(r'않|아니|아냐|없|못했|not\b|never\b', re.I)
QUANTITY = re.compile(r'(?<![\d.,])(?P<num>\d+(?:,\d{3})*(?:\.\d+)?)\s*(?P<scale>조|억|만|천)?\s*(?P<unit>%p|퍼센트포인트|%|퍼센트|원|명|건|개|km|㎞|kg)(?![A-Za-z])',re.I)
SCALE = {None:Decimal(1),'천':Decimal(1000),'만':Decimal(10000),'억':Decimal(100000000),'조':Decimal(1000000000000)}
SPELL_RULES = [
    ('spell.dwaet',re.compile('됬'),lambda m:'됐','‘됐’ 표기 후보'),
    ('spell.dwaeyo',re.compile(r'되요(?=\s|[.!?,…]|$)'),lambda m:'돼요','‘되어요’의 준말 표기'),
    ('spell.days',re.compile(r'몇\s?일'),lambda m:'며칠','‘며칠’ 표기'),
    ('spell.waenji',re.compile('웬지'),lambda m:'왠지','‘왜인지’의 준말 표기'),
    ('spell.eoi',re.compile('어의없'),lambda m:'어이없','‘어이없다’ 표기'),
    ('spell.how',re.compile(r'어떻해(?=\s|[.!?,…]|$)'),lambda m:'어떡해','‘어떻게 해’의 준말 표기'),
    ('spell.su',re.compile(r'(?P<verb>할|될|갈|볼|줄|살|올|알|먹을|받을|읽을|있을|없을)\s*수\s*(?P<tail>있|없)'),lambda m:m['verb']+' 수 '+m['tail'],'의존 명사 ‘수’ 띄어쓰기'),
    ('spell.geot',re.compile(r'할것(?=이다|으로|을|이|은|도|만|\s|[.!?]|$)'),lambda m:'할 것','의존 명사 ‘것’ 띄어쓰기'),
]


def validate_options(title, glossary):
    if not isinstance(title,str) or len(title)>500:
        raise ValueError('제목은 최대 500자 문자열이어야 합니다.')
    if not isinstance(glossary,list) or len(glossary)>100:
        raise ValueError('표기 기준은 최대 100개입니다.')
    for entry in glossary:
        if not isinstance(entry,dict) or set(entry)-{'canonical','variants'}:
            raise ValueError('표기 기준은 canonical/variants 형식이어야 합니다.')
        if not isinstance(entry.get('canonical'),str) or not 1<=len(entry['canonical'])<=60:
            raise ValueError('표기 기준 canonical은 1~60자입니다.')
        if not isinstance(entry.get('variants',[]),list) or len(entry.get('variants',[]))>20 or any(not isinstance(v,str) or not 1<=len(v)<=60 for v in entry.get('variants',[])):
            raise ValueError('표기 변형은 1~60자 문자열을 최대 20개 지정하세요.')


def finding(code,categories,field,start,end,text,message,action,*,group='priority',evidence=None,related=None,replacement=None,basis='rule_pattern'):
    return {'id':hashlib.sha256(f'{code}|{field}|{start}|{end}|{text}'.encode()).hexdigest()[:24],
            'rule_id':code,'categories':categories,'group':group,'status':'open',
            'anchor':{'field':field,'start':start,'end':end,'text':text},
            'message':message,'action':action,'evidence':evidence or [],'related_anchors':related or [],
            'replacement':replacement,'basis':basis,'blocking':False}


def overlap(a,b):
    # Ranking/eligibility signal only; removes numbers and common reporting predicates.
    stop={'밝혔','말했','발표했','집계됐','것으로','주장했','올해','지난해'}
    aa={t for t in query_tokens(a) if not t.isdigit() and t not in stop and len(t)>=2}
    bb={t for t in query_tokens(b) if not t.isdigit() and t not in stop and len(t)>=2}
    return len(aa&bb), len(aa&bb)/max(1,min(len(aa),len(bb)))


def source_units(candidates):
    units=[]
    for candidate in candidates:
        text=candidate['excerpt']
        for m in re.finditer(r'[^\n]+',text):
            # Preserve candidate offsets, but split sentence boundaries for tighter comparisons.
            for part in re.finditer(r'.+?(?:[.!?。](?=\s|$)|$)',m.group()):
                raw=part.group();left=len(raw)-len(raw.lstrip());clean=raw.strip()
                if clean:
                    start=candidate['start']+m.start()+part.start()+left
                    units.append({**candidate,'excerpt':clean,'start':start,'end':start+len(clean)})
    return units


def quantities(text):
    result=[]
    for match in QUANTITY.finditer(text):
        # Compound forms such as 1억 2000만원 need a dedicated parser, so abstain.
        before=text[max(0,match.start()-8):match.start()]
        if re.search(r'\d\s*(?:조|억|만|천)\s*$',before):
            continue
        unit={'퍼센트':'%','퍼센트포인트':'%p','㎞':'km'}.get(match['unit'].lower(),match['unit'].lower())
        result.append((Decimal(match['num'].replace(',',''))*SCALE[match['scale']],unit,match))
    return result


def proofreading(text, field='body', glossary=None):
    protected=[(m.start(),m.end()) for m in QUOTES.finditer(text)]
    names=[m.span('name') for m in PERSON_ROLE.finditer(text)]
    for entry in glossary or []:
        names.extend(m.span() for m in re.finditer(re.escape(entry['canonical']),text))
    results=[]
    occupied=[]
    for code,pattern,replace,title in SPELL_RULES:
        for match in pattern.finditer(text):
            if any(match.start()<end and match.end()>start for start,end in names+occupied):
                continue
            replacement=replace(match)
            if replacement==match.group():
                continue
            quote=any(match.start()<end and match.end()>start for start,end in protected)
            results.append(finding(code,['spelling'],field,match.start(),match.end(),match.group(),
                title+(' — 인용문이므로 원문을 확인하세요.' if quote else ''),
                '인용 원문을 확인한 뒤 직접 수정하세요.' if quote else f'‘{replacement}’로 바꿀지 확인하세요.',
                group='spelling',replacement=None if quote else replacement))
            occupied.append(match.span())
    return sorted(results,key=lambda f:f['anchor']['start'])


def arithmetic(text,field):
    findings=[]
    # Narrow templates avoid inferring denominator/period from arbitrary prose.
    pattern=re.compile(r'(?P<a>\d+(?:\.\d+)?)\s*(?P<u>%|원|명|건|개)에서\s*(?P<b>\d+(?:\.\d+)?)\s*(?P=u)(?:으로|로)\s*[^.!?\n]{0,25}?(?P<r>\d+(?:\.\d+)?)\s*(?P<ru>%p|퍼센트포인트|%|퍼센트)\s*(?P<dir>증가|감소|상승|하락)')
    for m in pattern.finditer(text):
        a,b,r=map(Decimal,[m['a'],m['b'],m['r']])
        if a==0:
            findings.append(finding('numbers.zero_base',['numbers'],field,m.start(),m.end(),m.group(),'기준값이 0이라 일반적인 증감률을 계산할 수 없습니다.','증감률의 정의와 기준값을 확인하세요.',group='additional'))
            continue
        point=m['ru'] in ('%p','퍼센트포인트')
        expected=abs(b-a) if point and m['u']=='%' else abs((b-a)/a*100)
        sign_ok=(b>=a if m['dir'] in ('증가','상승') else b<=a)
        tolerance=Decimal('0.5')*(Decimal(10)**(-max(0,-r.as_tuple().exponent)))
        invalid_unit=point and m['u']!='%'
        if abs(expected-r)>tolerance or not sign_ok or invalid_unit:
            explanation=(f'기재한 변화율 {r}{m["ru"]}와 단순 계산이 다릅니다. '+
                         (f'두 비율의 차이는 {abs(b-a):g}%p입니다.' if m['u']=='%' else f'기준값 대비 변화율은 {abs((b-a)/a*100):.2f}%입니다.'))
            findings.append(finding('numbers.change_rate',['numbers'],field,m.start(),m.end(),m.group(),explanation,'분모·단위·증가/감소 방향을 확인하세요.'))
    total=re.compile(r'(?P<a>\d+)\s*(?P<u>명|건|개)(?:과|와|,|\s*\+)\s*[^\d.!?\n]{0,15}(?P<b>\d+)\s*(?P=u)(?:으로|로|을|를|,)?\s*(?:합쳐\s*)?(?:총|합계|모두)\s*(?P<c>\d+)\s*(?P=u)')
    for m in total.finditer(text):
        if int(m['a'])+int(m['b'])!=int(m['c']):
            findings.append(finding('numbers.total',['numbers'],field,m.start(),m.end(),m.group(),f'두 항목의 합은 {int(m["a"])+int(m["b"])}{m["u"]}입니다.','중복 집계 여부와 합계에 포함되는 항목을 확인하세요.'))
    return findings


def risk_checks(text,field):
    result=[]
    patterns=[
        ('legal.id_pattern',r'(?<!\d)\d{6}\s*-\s*[1-8]\d{6}(?!\d)','식별번호 형태가 포함됐습니다.','priority'),
        ('legal.phone',r'(?<!\d)01[016789][- .]?\d{3,4}[- .]?\d{4}(?!\d)','휴대전화 번호 형태가 포함됐습니다. 공개 연락처인지 확인하세요.','additional'),
        ('legal.email',r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}','이메일 주소가 포함됐습니다. 공개 목적·동의·취재원 노출 가능성을 확인하세요.','additional'),
        ('legal.stigma',r'(?:장애인|이주민|노인|여성|남성)(?:들은|은|는)?\s*(?:모두|전부)\s*[^.!?\n]{0,18}(?:열등|범죄자|무능)','집단 전체에 낙인을 부여할 수 있는 표현입니다.','additional'),
    ]
    for code,pattern,message,group in patterns:
        for m in re.finditer(pattern,text):
            result.append(finding(code,['legal_ethics'],field,m.start(),m.end(),m.group(),message,'공개 필요성과 식별 가능성을 검토하세요. 위법 여부 판정은 아닙니다.',group=group))
    for m in re.finditer(r'[^.!?\n]*(?:피의자|혐의|용의자)[^.!?\n]*',text):
        sentence=m.group()
        if re.search(r'범인이다|범죄자다|사기꾼이다|범행을 저질렀다',sentence) and not re.search(r'부인|아니다|아니라|않|확정\s*판결|유죄\s*확정',sentence):
            result.append(finding('legal.allegation',['legal_ethics','facts'],field,m.start(),m.end(),sentence,'혐의·수사 단계 표현과 범행 단정이 함께 있습니다.','사법 절차와 발언 주체를 확인하고 단정 수준을 검토하세요.'))
    if field=='body' and re.search(r'의혹|혐의|비리',text) and not re.search(r'입장|해명|부인|반박|답변|응답|연락|확정\s*판결',text):
        m=re.search(r'의혹|혐의|비리',text)
        result.append(finding('legal.response_question',['legal_ethics'],field,m.start(),m.end(),m.group(),
            '본문에서 대상의 입장이나 확인 시도를 찾지 못했습니다.','실제 취재 여부를 묻는 항목입니다. 확인했다면 ‘확인함’으로 처리하세요.',group='additional'))
    return result


def name_checks(text,field,glossary,units):
    result=[]
    for entry in glossary:
        for variant in entry.get('variants',[]):
            if variant==entry['canonical']: continue
            for m in re.finditer(re.escape(variant),text):
                result.append(finding('names.glossary',['names'],field,m.start(),m.end(),m.group(),
                    f'등록한 표기 기준은 ‘{entry["canonical"]}’입니다.','대상 동일성을 확인한 뒤 직접 수정하세요.',group='spelling'))
    people=list(PERSON_ROLE.finditer(text))
    for person in people:
        for unit in units:
            references=[ref for ref in PERSON_ROLE.finditer(unit['excerpt']) if ref['name']==person['name']]
            mismatch=next((r for r in references if r['role']!=person['role']),None)
            if mismatch:
                result.append(finding('names.role',['names'],field,person.start(),person.end(),person.group(),
                    f'연결 자료에는 같은 이름이 ‘{mismatch["role"]}’로 나옵니다.','동명이인·겸직·자료 시점을 먼저 확인하세요. 현재 직책 확인은 수행하지 않았습니다.',group='additional',evidence=[unit]))
                break
    # Detect two titles in the article itself, without asserting they cannot coexist.
    seen={}
    for p in people:
        previous=seen.get(p['name'])
        if previous and previous['role']!=p['role']:
            result.append(finding('names.internal_role',['names'],field,p.start(),p.end(),p.group(),
                f'같은 이름이 앞에서는 ‘{previous["role"]}’로 표기됐습니다.','동일 인물인지, 겸직 또는 과거 직책인지 확인하세요.',group='additional',
                related=[{'field':field,'start':previous.start(),'end':previous.end(),'text':previous.group()}]))
        seen[p['name']]=p
    return result


def run(article,title,claims,glossary=None,source_count=0):
    glossary=glossary or []
    validate_options(title,glossary)
    findings=[]
    all_candidates=[]
    for claim in claims:
        all_candidates.extend(claim['candidates'])
    # Candidate deduplication preserves exact provenance.
    unique={(c['block_id'],c['start'],c['end']):c for c in all_candidates}
    all_units=source_units(list(unique.values()))
    for field,text in [('title',title),('body',article)]:
        findings+=proofreading(text,field,glossary)
        findings+=arithmetic(text,field)
        findings+=risk_checks(text,field)
        findings+=name_checks(text,field,glossary,all_units)
    # Title certainty compared with the related body sentence, not any unrelated paragraph.
    if title:
        for claim in claims:
            common,ratio=overlap(title,claim['text'])
            if common>=2 and CERTAIN.search(title) and not NEGATIVE.search(title) and UNCERTAIN.search(claim['text']):
                m=CERTAIN.search(title)
                findings.append(finding('facts.title_certainty',['facts','logic'],'title',m.start(),m.end(),m.group(),
                    '제목은 확정적으로 표현하지만 관련 본문에는 계획·검토·추정 표현이 있습니다.',
                    '제목의 확정 수준을 본문 및 원자료와 맞춰 확인하세요.',related=[{'field':'body',**{k:claim[k] for k in ('start','end','text')}}]))
                break
    # Within-article contradictions: only one comparable quantity and strongly shared wording.
    for index,claim in enumerate(claims):
        q1={(value,unit) for value,unit,_ in quantities(claim['text'])}
        if len(q1)!=1 or QUOTES.search(claim['text']): continue
        for previous in claims[:index]:
            q0={(value,unit) for value,unit,_ in quantities(previous['text'])}
            if len(q0)!=1 or q0==q1 or QUOTES.search(previous['text']): continue
            common,ratio=overlap(previous['text'],claim['text'])
            periods=lambda text:set(re.findall(r'\d{4}년|\d{1,2}월|\d{1,2}일|지난해|올해|지난달|이번달|작년',text))
            if next(iter(q0))[1]==next(iter(q1))[1] and common>=2 and ratio>=.8 and periods(previous['text'])==periods(claim['text']):
                findings.append(finding('facts.internal_quantity',['facts','numbers'],'body',claim['start'],claim['end'],claim['text'],
                    '기사 안의 유사한 문장에서 수량 값이 다르게 나옵니다.','동일한 대상·시점·집계 기준인지 확인하세요.',
                    related=[{'field':'body',**{key:previous[key] for key in ('start','end','text')}}]))
                break
    for claim in claims:
        sentence=claim['text'];start=claim['start'];end=claim['end']
        units=source_units(claim['candidates'])
        relevant=[u for u in units if overlap(sentence,u['excerpt'])[0]>=2 and overlap(sentence,u['excerpt'])[1]>=.4]
        for unit in relevant:
            src=unit['excerpt']
            # Same visible dates required before warning on numeric quantity disagreement.
            dates=lambda t:set(re.findall(r'\d{4}년|\d{1,2}월|\d{1,2}일',t))
            a,b=quantities(sentence),quantities(src)
            qa={(v,u) for v,u,_ in a};qb={(v,u) for v,u,_ in b}
            if len(qa)==len(qb)==1 and next(iter(qa))[1]==next(iter(qb))[1] and qa!=qb and dates(sentence)==dates(src):
                findings.append(finding('numbers.source_difference',['numbers','facts'],'body',start,end,sentence,
                    '관련 원문과 단순 수량 값이 다릅니다.','같은 지표·집계 기준·기간인지 확인하세요. 단어 유사성만으로 사실 오류를 확정하지 않습니다.',evidence=[unit]))
            if bool(NEGATIVE.search(sentence))!=bool(NEGATIVE.search(src)) and overlap(sentence,src)[1]>=.65:
                findings.append(finding('facts.negation',['facts'],'body',start,end,sentence,
                    '관련 원문과 부정 표현이 다릅니다.','부정의 대상과 인용 범위를 확인하세요.',evidence=[unit]))
            if dates(sentence) and dates(src) and dates(sentence)!=dates(src) and overlap(sentence,src)[1]>=.65:
                findings.append(finding('facts.date',['facts','numbers'],'body',start,end,sentence,
                    '관련 원문과 날짜 표현이 다릅니다.','같은 사건의 일정인지, 발표일과 시행일을 혼동했는지 확인하세요.',evidence=[unit]))
            if CERTAIN.search(sentence) and not NEGATIVE.search(sentence) and UNCERTAIN.search(src):
                findings.append(finding('facts.source_certainty',['facts','logic'],'body',start,end,sentence,
                    '기사의 확정 표현과 자료의 계획·추정 표현을 비교해야 합니다.','확정 여부와 원자료의 기준 시점을 확인하세요.',evidence=[unit]))
            if re.search(r'때문에|으로 인해|덕분에|초래|(?<![가-힣])야기',sentence) and re.search(r'원인.{0,20}(?:분석하지|미확인|밝히지|알 수 없)|인과.{0,15}(?:확인되지|입증되지)',src):
                findings.append(finding('logic.cause',['logic'],'body',start,end,sentence,
                    '기사에서는 인과를 단정하지만 자료에는 원인·인과가 확인되지 않았다고 나옵니다.','인과 근거를 확인하거나 관찰된 변화 수준으로 표현하세요.',evidence=[unit]))
            if re.search(r'모든|전체 시민|전체 국민|국민 모두',sentence) and re.search(r'일부|표본|설문 참가자|응답자',src):
                findings.append(finding('logic.generalization',['logic'],'body',start,end,sentence,
                    '원문의 일부·표본 범위를 전체로 확대했을 가능성이 있습니다.','조사 대상과 대표성을 확인하세요.',group='additional',evidence=[unit]))
        # An optional model contradiction is an attributed judgement, never proof.
        for candidate in claim['candidates']:
            if candidate.get('assessment',{}).get('relation')=='contradicts':
                findings.append(finding('facts.model_contradiction',['facts'],'body',start,end,sentence,
                    '판정 모델이 원문과 모순 가능성을 보고했습니다.','모델 판단을 직접 원문과 대조하세요.',evidence=[candidate],basis='model_assessment'))
    # Direct quotes compared only to sufficiently similar quoted text, no invented original.
    refs=[(m.group(1) or m.group(2),unit) for unit in all_units for m in QUOTES.finditer(unit['excerpt'])]
    for field,text in [('title',title),('body',article)]:
        for quote in QUOTES.finditer(text):
            value=quote.group(1) or quote.group(2)
            if len(value)<8: continue
            compact=lambda t:re.sub(r'\s+','',t)
            exact=[(original,unit) for original,unit in refs if compact(value)==compact(original)]
            if exact:
                article_speakers=list(PERSON_ROLE.finditer(text[max(0,quote.start()-80):quote.start()]))
                if article_speakers:
                    speaker=article_speakers[-1]['name']
                    for _,unit in exact:
                        ref_quote=next((m for m in QUOTES.finditer(unit['excerpt']) if compact(m.group(1) or m.group(2))==compact(value)),None)
                        source_speakers=list(PERSON_ROLE.finditer(unit['excerpt'][:ref_quote.start()])) if ref_quote else []
                        if source_speakers and source_speakers[-1]['name']!=speaker:
                            findings.append(finding('quotes.speaker_difference',['quotes','names'],field,quote.start(),quote.end(),quote.group(),
                                f'같은 인용문이 원문에서는 ‘{source_speakers[-1]["name"]}’의 발언으로 나옵니다.',
                                '동일 발언인지와 화자를 원문에서 확인하세요.',evidence=[unit]))
                continue
            ranked=sorted(((SequenceMatcher(None,compact(value),compact(original)).ratio(),original,unit) for original,unit in refs),key=lambda x:x[0],reverse=True)
            if ranked and ranked[0][0]>=.65:
                _,original,unit=ranked[0]
                findings.append(finding('quotes.text_difference',['quotes'],'title' if field=='title' else 'body',quote.start(),quote.end(),quote.group(),
                    '유사한 인용 원문과 문구가 다릅니다.','직접 인용의 생략·수정·부정 표현과 화자를 확인하세요.',evidence=[unit]))
            elif source_count and re.search(r'말했다|밝혔다|전했다|주장했다',text[quote.end():quote.end()+40]):
                findings.append(finding('quotes.original_not_matched',['quotes'],field,quote.start(),quote.end(),quote.group(),
                    '선택 자료의 검색 후보에서 일치하는 직접 인용 원문을 찾지 못했습니다.','녹취나 별도 자료를 확인하세요. 검색 실패는 인용 오류를 뜻하지 않습니다.',group='additional'))
    # Merge findings with the same rule and anchor; collect all compared sources.
    merged={}
    for item in findings:
        key=item['id']
        if key not in merged: merged[key]=item
        else:
            existing={(e['block_id'],e['start'],e['end']) for e in merged[key]['evidence']}
            merged[key]['evidence'] += [e for e in item['evidence'] if (e['block_id'],e['start'],e['end']) not in existing]
    findings=list(merged.values())
    order={'priority':0,'spelling':1,'additional':2}
    findings.sort(key=lambda f:(order[f['group']],f['anchor']['field']!='title',f['anchor']['start']))
    source_categories={'facts','numbers','quotes','logic','names'}
    coverage=[{'category':code,'label':label,'status':'limited_rules',
               'source_comparison':'candidates_compared' if source_count and all_candidates else ('no_matching_candidates' if source_count else 'not_requested'),
               'limitation':LIMITS[code],'finding_count':sum(code in f['categories'] for f in findings)} for code,label in CATEGORIES.items()]
    for entry in coverage:
        if entry['category'] not in source_categories: entry['source_comparison']='not_applicable'
    return {'engine_version':ENGINE_VERSION,'findings':findings,'checks':coverage,
            'completion':'check_finished','publication_blocked':False,
            'summary':{group:sum(f['group']==group for f in findings) for group in order}}
