import importlib.util, threading

from ..config import HEADLINE_MODEL, SUBTITLE_MODEL, HEADLINE_CACHE, HEADLINE_LOCK, SUBTITLE_LOCK
from ..errors import RequestError

_headline_tokenizer = None
_headline_model = None
_subtitle_tokenizer = None
_subtitle_model = None
def headline_dependencies_ready():
    return importlib.util.find_spec('torch') is not None and importlib.util.find_spec('transformers') is not None

def load_headline_model():
    global _headline_tokenizer, _headline_model
    if _headline_model is not None:return _headline_tokenizer, _headline_model
    if not headline_dependencies_ready():raise RequestError('로컬 제목 모델 실행 패키지가 없습니다. requirements-headline.txt를 설치해 주세요.',503)
    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        options={'cache_dir':HEADLINE_CACHE} if HEADLINE_CACHE else {}
        _headline_tokenizer=AutoTokenizer.from_pretrained(HEADLINE_MODEL,**options)
        _headline_model=AutoModelForSeq2SeqLM.from_pretrained(HEADLINE_MODEL,**options)
        _headline_model.eval()
        return _headline_tokenizer,_headline_model
    except Exception as exc:
        raise RequestError('로컬 제목 모델을 불러오지 못했어요. 모델 설치와 인터넷 연결을 확인해 주세요.',503) from exc

def generate_headline_drafts(model_input):
    with HEADLINE_LOCK:
        tokenizer,model=load_headline_model()
        import torch
        inputs=tokenizer(model_input,return_tensors='pt',max_length=512,truncation=True)
        with torch.inference_mode():
            outputs=model.generate(**inputs,max_new_tokens=52,num_beams=8,num_return_sequences=6,no_repeat_ngram_size=2,length_penalty=1.0,early_stopping=True)
        values=tokenizer.batch_decode(outputs,skip_special_tokens=True)
    return list(dict.fromkeys(value.strip() for value in values if value.strip()))

def load_subtitle_model():
    global _subtitle_tokenizer, _subtitle_model
    if _subtitle_model is not None:return _subtitle_tokenizer, _subtitle_model
    if not headline_dependencies_ready():raise RequestError('로컬 부제 모델 실행 패키지가 없습니다. requirements-headline.txt를 설치해 주세요.',503)
    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        options={'cache_dir':HEADLINE_CACHE} if HEADLINE_CACHE else {}
        _subtitle_tokenizer=AutoTokenizer.from_pretrained(SUBTITLE_MODEL,**options)
        _subtitle_model=AutoModelForSeq2SeqLM.from_pretrained(SUBTITLE_MODEL,**options)
        _subtitle_model.eval()
        return _subtitle_tokenizer,_subtitle_model
    except Exception as exc:
        raise RequestError('로컬 부제 모델을 불러오지 못했어요. 모델 설치와 인터넷 연결을 확인해 주세요.',503) from exc

def generate_subtitle_drafts(facts):
    tokenizer,model=load_subtitle_model()
    if not facts:return []
    with SUBTITLE_LOCK:
        import torch
        # 같은 생성 설정을 유지하되 1~3개 근거 문장을 한 번에 처리해
        # 모델 호출 오버헤드만 줄인다.
        inputs=tokenizer(
            [fact['model_input'] for fact in facts],return_tensors='pt',padding=True,
            max_length=512,truncation=True)
        with torch.inference_mode():
            outputs=model.generate(**inputs,max_new_tokens=58,min_new_tokens=10,num_beams=6,num_return_sequences=3,no_repeat_ngram_size=2,length_penalty=1.0,early_stopping=True)
        values=tokenizer.batch_decode(outputs,skip_special_tokens=True)
        results=[]
        for index in range(len(facts)):
            group=values[index*3:(index+1)*3]
            results.append(list(dict.fromkeys(value.strip() for value in group if value.strip())))
    return results
