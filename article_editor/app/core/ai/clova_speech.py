"""NAVER CLOVA Speech 장문 음성인식 API 연동 및 Diarization 처리 모듈.

1007_stt의 CLOVA Speech 연동 및 정규화 로직을 코어 구조에 맞게 통합했습니다.
- 화자 분리(Diarization) 활성화 (diarization.enable = True)
- CLOVA diarization 결과를 기반으로 한 화자 구분 (임의 추측/A/B 배정 금지)
- ai-newsroom-os 표준 Transcript / TranscriptSegment 엔티티 생성
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any

from ..errors import RequestError

TIMEOUT = 120  # 음성 분석 대기 최대 2분


def get_clova_config() -> tuple[str, str]:
    """CLOVA Speech 환경변수(Secret Key, Invoke URL)를 조회합니다."""
    secret_key = (os.environ.get('CLOVA_SPEECH_SECRET_KEY') or '').strip()
    invoke_url = (os.environ.get('CLOVA_SPEECH_INVOKE_URL') or '').strip()
    return secret_key, invoke_url


def is_clova_configured() -> bool:
    """CLOVA Speech 연동 필수 설정이 완료되었는지 확인합니다."""
    secret_key, invoke_url = get_clova_config()
    return bool(secret_key and invoke_url)


def _build_multipart(fields: dict[str, str], filename: str, audio_bytes: bytes, mime_type: str) -> tuple[bytes, str]:
    """multipart/form-data 요청 본문 및 Content-Type 헤더를 구성합니다."""
    boundary = f'----ClovaSpeechBoundary{uuid.uuid4().hex}'
    parts: list[bytes] = []

    for name, value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode('utf-8'))

    safe_filename = filename.replace('"', '').replace('\r', '').replace('\n', '') or 'audio.wav'
    safe_mime = mime_type or 'application/octet-stream'

    file_header = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="media"; filename="{safe_filename}"\r\n'
        f'Content-Type: {safe_mime}\r\n\r\n'
    ).encode('utf-8')
    parts.append(file_header + audio_bytes + b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode('utf-8'))

    content_type = f'multipart/form-data; boundary={boundary}'
    return b''.join(parts), content_type


def normalize_words(words_raw: list[Any] | None) -> list[dict[str, Any]]:
    """단어 단위 시간 정보 정규화 ([start, end, text] 또는 객체 형태 지원)."""
    if not isinstance(words_raw, list):
        return []

    normalized = []
    for idx, w in enumerate(words_raw):
        if isinstance(w, (list, tuple)) and len(w) >= 3:
            normalized.append({
                'wordIndex': idx,
                'start': int(w[0]) if isinstance(w[0], (int, float)) else 0,
                'end': int(w[1]) if isinstance(w[1], (int, float)) else 0,
                'text': str(w[2] or '')
            })
        elif isinstance(w, dict):
            normalized.append({
                'wordIndex': int(w.get('wordIndex', idx)),
                'start': int(w.get('start', 0)),
                'end': int(w.get('end', 0)),
                'text': str(w.get('text', ''))
            })
    return normalized


def extract_speaker_info(seg: dict[str, Any]) -> tuple[str, str]:
    """CLOVA 세그먼트로부터 화자 식별자 및 표시명을 추출합니다.

    우선순위: seg.speaker.label -> seg.diarization.label -> seg.speaker.name
    화자 식별 결과: (speaker_key, display_name)
    """
    raw_label = None
    raw_name = None

    speaker_obj = seg.get('speaker')
    if isinstance(speaker_obj, dict):
        raw_label = speaker_obj.get('label')
        raw_name = speaker_obj.get('name')

    if raw_label is None:
        dia_obj = seg.get('diarization')
        if isinstance(dia_obj, dict):
            raw_label = dia_obj.get('label')

    if raw_label is not None and str(raw_label).strip() != '':
        speaker_key = str(raw_label).strip()
        display_name = f'화자 {speaker_key}'
    elif raw_name is not None and str(raw_name).strip() != '':
        speaker_key = str(raw_name).strip()
        display_name = speaker_key
    else:
        speaker_key = '미식별'
        display_name = '화자 미식별'

    return speaker_key, display_name


def group_segments_by_speaker(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """CLOVA Speech의 세그먼트들을 연속된 동일 화자 단위(Utterance)로 묶습니다.

    - 화자가 변경될 때만 새로운 발화 단위로 분리
    - 동일 화자가 연속해서 말하는 경우 시간(start~end), 텍스트, 단어 정보를 유지하며 병합
    - CLOVA diarization 결과를 Source of Truth로 유지 (임의 추측 배제)
    """
    if not isinstance(segments, list) or not segments:
        return []

    utterances: list[dict[str, Any]] = []
    current_utt: dict[str, Any] | None = None

    for seg in segments:
        speaker_key, display_name = extract_speaker_info(seg)
        text = str(seg.get('text') or '').strip()
        if not text:
            continue

        start_ms = int(seg.get('start', 0))
        end_ms = int(seg.get('end', start_ms + 3000))
        confidence = float(seg.get('confidence', 0.0))
        words = normalize_words(seg.get('words'))

        if current_utt and current_utt['_speakerKey'] == speaker_key:
            current_utt['end'] = end_ms
            current_utt['end_ms'] = end_ms
            current_utt['text'] = f"{current_utt['text']} {text}".strip()
            current_utt['words'].extend(words)
            current_utt['segmentCount'] += 1
            current_utt['confidence'] = round((current_utt['confidence'] + confidence) / 2, 4)
        else:
            current_utt = {
                '_speakerKey': speaker_key,
                'speaker': speaker_key,
                'speakerName': display_name,
                'start': start_ms,
                'end': end_ms,
                'start_ms': start_ms,
                'end_ms': end_ms,
                'text': text,
                'confidence': confidence,
                'words': list(words),
                'segmentCount': 1
            }
            utterances.append(current_utt)

    return utterances


def normalize_transcript(clova_data: dict[str, Any], meta_options: dict[str, Any] | None = None) -> dict[str, Any]:
    """CLOVA Speech 원본 응답을 ai-newsroom-os 표준 Transcript 규격(docs/architecture)으로 정규화합니다."""
    meta = meta_options or {}
    now_iso = datetime.now(timezone.utc).isoformat()
    transcript_id = str(meta.get('transcriptId') or f"tr_{uuid.uuid4().hex[:12]}")

    raw_segments = clova_data.get('segments') if isinstance(clova_data, dict) else []
    if not isinstance(raw_segments, list):
        raw_segments = []

    segments: list[dict[str, Any]] = []
    conf_sum = 0.0

    for idx, seg in enumerate(raw_segments):
        start_ms = int(seg.get('start', 0))
        end_ms = int(seg.get('end', start_ms + 3000))
        seg_text = str(seg.get('text') or '')
        seg_conf = float(seg.get('confidence', 0.0))
        conf_sum += seg_conf

        spk_key, spk_display = extract_speaker_info(seg)

        segment_id = str(uuid.uuid4())
        segments.append({
            'id': segment_id,
            'transcript_id': transcript_id,
            'ordinal': idx + 1,
            'speaker': spk_display,
            'speaker_key': spk_key,
            'text': seg_text,
            'start_ms': start_ms,
            'end_ms': end_ms,
            'confidence': round(seg_conf, 4),
            'words': normalize_words(seg.get('words'))
        })

    avg_conf = round(conf_sum / len(segments), 4) if segments else float(clova_data.get('confidence', 0.0) if isinstance(clova_data, dict) else 0.0)
    full_text = str(clova_data.get('text') or '').strip() if isinstance(clova_data, dict) else ''
    if not full_text and segments:
        full_text = ' '.join(s['text'] for s in segments if s['text'])

    return {
        'id': transcript_id,
        'workspace_id': meta.get('workspace_id', '10000000-0000-4000-8000-000000000001'),
        'media_asset_id': meta.get('media_asset_id', str(uuid.uuid4())),
        'status': 'completed',
        'language': str(clova_data.get('language') or 'ko-KR') if isinstance(clova_data, dict) else 'ko-KR',
        'text': full_text,
        'confidence': avg_conf,
        'segments': segments,
        'created_at': now_iso,
        'metadata': {
            'sourceEngine': 'NAVER_CLOVA_SPEECH',
            'sourceFilename': meta.get('filename', 'audio.wav'),
            'fileSize': meta.get('fileSize', 0),
            'mimeType': meta.get('mimeType', 'audio/wav'),
            'createdAt': now_iso
        }
    }


def to_clova_dialogues(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """CLOVA Diarization 결과를 프론트엔드 UI 대화형 인터페이스 규격(dialogues)으로 변환합니다."""
    grouped = group_segments_by_speaker(segments)
    dialogues: list[dict[str, Any]] = []

    for i, utt in enumerate(grouped):
        start_sec = round(utt['start_ms'] / 1000.0)
        duration_sec = max(1, round((utt['end_ms'] - utt['start_ms']) / 1000.0))
        dialogues.append({
            'id': f'seg-{i + 1}',
            'speaker': utt['_speakerKey'],
            'speakerName': utt['speakerName'],
            'timestamp': start_sec,
            'duration': duration_sec,
            'text': utt['text'],
            'confidence': utt.get('confidence', 1.0)
        })

    return dialogues


def recognize_speech(audio_bytes: bytes, filename: str = 'audio.wav', mime_type: str = 'audio/wav') -> dict[str, Any]:
    """NAVER CLOVA Speech API를 호출하여 장문 음성 인식 및 화자 분리를 수행합니다."""
    secret_key, invoke_url = get_clova_config()
    if not secret_key or not invoke_url:
        raise RequestError('CLOVA Speech 연동 키(CLOVA_SPEECH_SECRET_KEY, CLOVA_SPEECH_INVOKE_URL)가 설정되지 않았습니다.', 500)

    clean_url = invoke_url.rstrip('/')
    request_url = clean_url if clean_url.endswith('/recognizer/upload') else f'{clean_url}/recognizer/upload'

    params = {
        'language': 'ko-KR',
        'completion': 'sync',
        'wordAlignment': True,
        'fullText': True,
        'diarization': {
            'enable': True
        },
        'sed': {
            'enable': True
        }
    }

    body, content_type = _build_multipart(
        {'params': json.dumps(params, ensure_ascii=False)},
        filename,
        audio_bytes,
        mime_type
    )

    req = urllib.request.Request(
        request_url,
        data=body,
        headers={
            'X-CLOVASPEECH-API-KEY': secret_key,
            'Content-Type': content_type,
            'User-Agent': 'AINewsroom/3.0'
        },
        method='POST'
    )

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            resp_bytes = response.read()
            resp_data = json.loads(resp_bytes.decode('utf-8'))
    except urllib.error.HTTPError as error:
        err_body = error.read().decode('utf-8', errors='replace')
        try:
            err_json = json.loads(err_body)
            msg = err_json.get('message') or err_json.get('result') or str(error)
        except Exception:
            msg = err_body or str(error)
        raise RequestError(f'CLOVA Speech API 오류 ({error.code}): {msg}', error.code if 400 <= error.code < 600 else 502)
    except urllib.error.URLError as error:
        raise RequestError(f'CLOVA Speech 서버에 연결할 수 없습니다: {error.reason}', 504)
    except Exception as error:
        raise RequestError(f'CLOVA Speech 요청 중 오류가 발생했습니다: {error}', 500)

    # 표준 Transcript 구조화
    transcript = normalize_transcript(resp_data, {
        'filename': filename,
        'mimeType': mime_type,
        'fileSize': len(audio_bytes)
    })

    # 프론트엔드 호환 대화 목록 생성 (CLOVA Diarization 기반)
    segments_raw = resp_data.get('segments') or []
    dialogues = to_clova_dialogues(segments_raw)

    return {
        'transcript': transcript,
        'dialogues': dialogues,
        'text': transcript.get('text', ''),
        'duration': round(float(resp_data.get('duration', 0.0) or 0.0) / 1000.0, 2),
        'engine': 'clova',
        'raw': resp_data
    }
