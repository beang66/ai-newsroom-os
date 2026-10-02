"""인터뷰 녹음 전사 — Whisper(OpenAI) 결과를 녹취 스튜디오의 대화 목록으로 바꾼다.

옛 녹취 화면(web/src/utils/transcribe.js)이 브라우저에서 키를 들고 직접 부르던 것을 코어로 옮겼다.
외부 호출은 다른 AI 기능과 같은 경로(providers: local=.env 키 / remote=우리 백엔드)를 탄다.
문장 합치기·화자 교대 규칙은 transcribe.js 의 mergeFragmentedSegments / processSegmentsToDialogues 그대로다.
"""
import base64
import re
import uuid

from ..errors import RequestError
from . import providers

MAX_AUDIO = 25_000_000  # OpenAI 전사 API 파일 한도
_CLOSING = re.compile(r'(?:습니다|합니다|입니다|됩니다|않습니다|있습니다|했지요|했고요|했나요|인가요|나요|시죠|었나요|시나요'
                      r'|어요|아요|해요|게요|세요|네요|군요|지요|이죠)[.?!~…]*$')
_ASKS = re.compile(r'습니까|인가요|나요|시죠|었나요|시나요|말씀해|부탁드립니다')
_SPEAKERS = {1: ('reporter', '기자'), 2: ('interviewee', '취재원')}


def _multipart(fields, filename, audio):
    boundary = uuid.uuid4().hex
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()]
    safe = filename.replace('"', '').replace('\r', '').replace('\n', '') or 'audio'
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{safe}"\r\n'
                 f'Content-Type: application/octet-stream\r\n\r\n'.encode() + audio + b'\r\n')
    return b''.join(parts) + f'--{boundary}--\r\n'.encode(), f'multipart/form-data; boundary={boundary}'


def merge_segments(segments):
    """짧게 끊긴 STT 조각을 문장 단위로 합친다(40자 미만이면 계속 붙인다)."""
    merged = []
    for seg in segments:
        text = (seg.get('text') or '').strip()
        if not text:
            continue
        start = seg.get('start') if isinstance(seg.get('start'), (int, float)) else 0
        end = seg.get('end') if isinstance(seg.get('end'), (int, float)) else start + 3
        if merged:
            prev = merged[-1]
            ends = bool(re.search(r'[.?!…]$', prev['text']) or _CLOSING.search(prev['text'])
                        or re.search(r'[?？]', prev['text']) or start - prev['end'] > 1.8)
            if not (ends and len(prev['text']) >= 40):
                prev['text'] += ('' if prev['text'][-1].isspace() else ' ') + text
                prev['end'] = max(prev['end'], end)
                continue
        merged.append({'start': start, 'end': end, 'text': text})
    return merged


def to_dialogues(segments):
    """질문·긴 침묵(2.5초) 뒤에 화자를 바꾼다(기자 ↔ 취재원). 화자 분리(diarization)는 아직 없다."""
    dialogues, speaker = [], 1
    merged = merge_segments(segments)
    for i, seg in enumerate(merged):
        if i:
            prev = merged[i - 1]
            if re.search(r'[?？]', prev['text']) or _ASKS.search(prev['text']) or seg['start'] - prev['end'] > 2.5:
                speaker = 3 - speaker
        role, name = _SPEAKERS[speaker]
        dialogues.append({'id': f'seg-{i + 1}', 'speaker': role, 'speakerName': name,
                          'timestamp': int(seg['start'] + 0.5), 'text': seg['text']})
    return dialogues


def transcribe(payload):
    """payload: {filename, data(base64 또는 data URL)} → {dialogues, text, duration}"""
    data = payload.get('data')
    if not isinstance(data, str) or not data:
        raise RequestError('녹음 파일(data)을 보내 주세요.')
    try:
        audio = base64.b64decode(data.split(',', 1)[-1], validate=True)
    except ValueError:
        raise RequestError('녹음 파일을 읽지 못했어요.') from None
    if len(audio) > MAX_AUDIO:
        raise RequestError('녹음 파일은 25MB 이하만 전사할 수 있어요. 나눠서 올려 주세요.', 413)
    body, content_type = _multipart({'model': 'whisper-1', 'language': 'ko', 'response_format': 'verbose_json'},
                                    str(payload.get('filename') or 'audio'), audio)
    result = providers.call('audio/transcriptions', body, content_type)
    segments = result.get('segments') or ([{'start': 0, 'end': 10, 'text': result['text']}] if result.get('text') else [])
    return {'dialogues': to_dialogues(segments), 'text': result.get('text', ''), 'duration': result.get('duration')}
