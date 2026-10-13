"""인터뷰 녹음 전사 — CLOVA Speech(화자분리 Diarization) 및 Whisper(OpenAI) 통합 전사 모듈.

- CLOVA Speech 연동 키(CLOVA_SPEECH_SECRET_KEY, CLOVA_SPEECH_INVOKE_URL)가 설정되어 있으면
  CLOVA Speech 장문 음성 인식 및 음향 화자 분리(Diarization)를 우선 실행합니다.
- 키가 없거나 미설정된 경우 기존 Whisper(providers 경로)로 안전하게 폴백합니다.
- KEEP — 삭제 금지: 기존 merge_segments 및 to_dialogues 화자 교대 규칙 호환성을 그대로 유지합니다.
"""
import base64
import re
import uuid

from ..errors import RequestError
from . import clova_speech
from . import providers

MAX_AUDIO = 25_000_000  # 전사 API 파일 한도 (25MB)
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
    """짧게 끊긴 STT 조각을 문장 단위로 합친다(40자 미만이면 계속 붙인다). KEEP — 삭제 금지"""
    merged = []
    for seg in segments:
        text = (seg.get('text') or '').strip()
        if not text:
            continue
        start = seg.get('start') if isinstance(seg.get('start'), (int, float)) else 0
        end = seg.get('end') if isinstance(seg.get('end'), (int, float)) else start + 3
        speaker = seg.get('speaker')
        speaker_name = seg.get('speakerName')

        if merged:
            prev = merged[-1]
            # 화자 정보가 명시되어 있고 서로 다른 화자면 분리
            is_diff_speaker = speaker and prev.get('speaker') and speaker != prev.get('speaker')
            ends = bool(re.search(r'[.?!…]$', prev['text']) or _CLOSING.search(prev['text'])
                        or re.search(r'[?？]', prev['text']) or start - prev['end'] > 1.8)
            if not is_diff_speaker and not (ends and len(prev['text']) >= 40):
                prev['text'] += ('' if prev['text'][-1].isspace() else ' ') + text
                prev['end'] = max(prev['end'], end)
                continue
        item = {'start': start, 'end': end, 'text': text}
        if speaker is not None:
            item['speaker'] = speaker
        if speaker_name is not None:
            item['speakerName'] = speaker_name
        merged.append(item)
    return merged


def to_dialogues(segments):
    """세그먼트 목록을 대화 목록으로 변환합니다. KEEP — 삭제 금지

    - CLOVA Diarization으로 화자 정보(seg['speaker'])가 이미 존재하면 해당 화자를 그대로 사용합니다.
    - 화자 정보가 없는 경우 기존 질문·침묵(2.5초) 기반 규칙 교대(기자 ↔ 취재원)를 적용합니다.
    """
    dialogues, speaker = [], 1
    merged = merge_segments(segments)
    for i, seg in enumerate(merged):
        if seg.get('speaker') is not None:
            role = str(seg['speaker'])
            name = str(seg.get('speakerName') or (f'화자 {role}' if role.isdigit() else role))
        else:
            if i:
                prev = merged[i - 1]
                if re.search(r'[?？]', prev['text']) or _ASKS.search(prev['text']) or seg['start'] - prev['end'] > 2.5:
                    speaker = 3 - speaker
            role, name = _SPEAKERS[speaker]
        dialogues.append({
            'id': f'seg-{i + 1}',
            'speaker': role,
            'speakerName': name,
            'timestamp': int(seg['start'] + 0.5),
            'text': seg['text']
        })
    return dialogues


def transcribe(payload):
    """payload: {filename, data(base64 또는 data URL), engine?} → {dialogues, text, duration, transcript, segments}"""
    data = payload.get('data')
    if not isinstance(data, str) or not data:
        raise RequestError('녹음 파일(data)을 보내 주세요.')
    try:
        audio = base64.b64decode(data.split(',', 1)[-1], validate=True)
    except ValueError:
        raise RequestError('녹음 파일을 읽지 못했어요.') from None
    if len(audio) > MAX_AUDIO:
        raise RequestError('녹음 파일은 25MB 이하만 전사할 수 있어요. 나눠서 올려 주세요.', 413)

    filename = str(payload.get('filename') or 'audio.wav')
    mime_type = 'audio/wav'
    if data.startswith('data:'):
        header_mime = data.split(';', 1)[0].replace('data:', '').strip()
        if header_mime:
            mime_type = header_mime

    engine_pref = (payload.get('engine') or '').lower()

    # 1. CLOVA Speech 엔진 우선 호출 (설정되어 있거나 명시적으로 요청된 경우)
    if engine_pref == 'clova' or (clova_speech.is_clova_configured() and engine_pref != 'whisper'):
        try:
            return clova_speech.recognize_speech(audio, filename=filename, mime_type=mime_type)
        except Exception:
            # 명시적 clova 지정이 아니면 Whisper 로 폴백 시도
            if engine_pref == 'clova':
                raise

    # 2. Whisper 엔진 폴백 (기존 경로: providers -> audio/transcriptions)
    body, content_type = _multipart(
        {'model': 'whisper-1', 'language': 'ko', 'response_format': 'verbose_json'},
        filename, audio
    )
    result = providers.call('audio/transcriptions', body, content_type)
    segments = result.get('segments') or ([{'start': 0, 'end': 10, 'text': result['text']}] if result.get('text') else [])
    dialogues = to_dialogues(segments)

    # 표준 Transcript 구조화 폴백
    transcript = clova_speech.normalize_transcript(
        {'text': result.get('text', ''), 'segments': segments, 'language': 'ko'},
        {'filename': filename, 'fileSize': len(audio), 'mimeType': mime_type}
    )

    return {
        'dialogues': dialogues,
        'text': result.get('text', ''),
        'duration': result.get('duration'),
        'transcript': transcript,
        'segments': segments,
        'engine': 'whisper'
    }

