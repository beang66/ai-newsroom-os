import json, os, urllib.request, urllib.error

from ..config import TEXT_MODEL
from ..errors import RequestError
def openai_call(path, payload):
    key = os.environ.get('OPENAI_API_KEY', '')
    if not key: raise RequestError('서버의 .env에 OPENAI_API_KEY를 설정해 주세요.', 503)
    req = urllib.request.Request('https://api.openai.com/v1/' + path, data=json.dumps(payload).encode(), headers={'Content-Type':'application/json','Authorization':'Bearer '+key}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=210) as response: return json.load(response)
    except urllib.error.HTTPError as error:
        messages={401:'API 키를 확인해 주세요.',403:'이 모델을 사용할 권한이 없습니다. OpenAI 계정과 모델 설정을 확인해 주세요.',429:'API 사용 한도 또는 요청 한도에 도달했어요. 결제·사용량을 확인해 주세요.'}
        raise RequestError(messages.get(error.code, 'OpenAI 요청이 실패했습니다. 모델 설정을 확인한 뒤 다시 시도해 주세요.'),502) from None
    except (TimeoutError, urllib.error.URLError):
        raise RequestError('OpenAI에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',504) from None

def output_text(result):
    return ''.join(part.get('text','') for output in result.get('output',[]) for part in output.get('content',[]) if part.get('type')=='output_text')

def structured_call(name, instructions, schema, content):
    payload={'model':TEXT_MODEL,'store':False,'instructions':instructions,'input':[{'role':'user','content':[{'type':'input_text','text':content}]}],'text':{'format':{'type':'json_schema','name':name,'strict':True,'schema':schema}}}
    try:return json.loads(output_text(openai_call('responses',payload)))
    except (ValueError,TypeError,json.JSONDecodeError):raise RequestError('AI가 유효한 편집 결과를 반환하지 않았어요. 다시 시도해 주세요.',502) from None
