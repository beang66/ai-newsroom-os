"""AI 호출 파사드 — 실제 경로는 `providers/`가 고른다 (local | backend).

`openai_call` / `structured_call` / `output_text` 이름을 그대로 유지해서
router.py 와 기존 테스트가 바뀌지 않는다. 경로 선택은 `AI_BACKEND` 값 하나로 끝난다.
"""
import json

from ..config import TEXT_MODEL
from .subtitle_rules import SUBTITLE_READABILITY_RULES, SUBTITLE_STYLE_RULES
from ..errors import RequestError
from . import providers


def openai_call(path, payload):
    return providers.call(path, payload)


def output_text(result):
    return ''.join(part.get('text','') for output in result.get('output',[]) for part in output.get('content',[]) if part.get('type')=='output_text')

def structured_call(name, instructions, schema, content):
    if name != 'subtitle_fact_check' and (name.startswith('subtitle') or name in ('subtitles','headline_review','metadata_ambiguity_audit')):
        instructions += '\n' + SUBTITLE_STYLE_RULES + '\n' + SUBTITLE_READABILITY_RULES
    payload={'model':TEXT_MODEL,'store':False,'instructions':instructions,'input':[{'role':'user','content':[{'type':'input_text','text':content}]}],'text':{'format':{'type':'json_schema','name':name,'strict':True,'schema':schema}}}
    try:return json.loads(output_text(openai_call('responses',payload)))
    except (ValueError,TypeError,json.JSONDecodeError):raise RequestError('AI가 유효한 편집 결과를 반환하지 않았어요. 다시 시도해 주세요.',502) from None
