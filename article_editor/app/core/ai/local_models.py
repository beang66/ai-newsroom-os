"""로컬 제목(KeT5)·부제(KoBART) 초안 — ONNX 변환본을 onnxruntime + tokenizers 로 실행한다.

변환본은 transformers 4.46.2 generate 와 후보 문장이 같다(기사 30건 30/30, dev/tools/convert_seq2seq_onnx.py).
2026-10-02: 예전 transformers/torch 실행 경로를 지웠다 — 팩트체크(transformers>=4.51)와 버전이 충돌하지 않게.
모델은 ModelManager 매니페스트(headline-ket5-onnx, subtitle-kobart-onnx)로 MODELS_DIR 에 설치한다.
"""
import importlib.util

from ..config import HEADLINE_LOCK, SUBTITLE_LOCK, MODELS_DIR
from ..errors import RequestError

HEADLINE_ONNX = MODELS_DIR / 'headline-ket5-onnx'
SUBTITLE_ONNX = MODELS_DIR / 'subtitle-kobart-onnx'
_MARKER = {'headline': (HEADLINE_ONNX, 'beam.onnx'), 'subtitle': (SUBTITLE_ONNX, 'decoder.onnx')}
_LABEL = {'headline': '제목', 'subtitle': '부제'}
_onnx = {}


def _ready(kind):
    folder, marker = _MARKER[kind]
    return (folder / marker).is_file() and all(importlib.util.find_spec(m) for m in ('onnxruntime', 'tokenizers'))


def _onnx_model(kind):
    """설치돼 있으면 모델(한 번만 로드), 없으면 None."""
    if kind not in _onnx:
        if not _ready(kind):
            return None
        from .onnx_seq2seq import BeamGraphModel, EncoderDecoderModel
        _onnx[kind] = (BeamGraphModel if kind == 'headline' else EncoderDecoderModel)(_MARKER[kind][0])
    return _onnx[kind]


def _model(kind):
    model = _onnx_model(kind)
    if model is None:
        raise RequestError(f'로컬 {_LABEL[kind]} 모델이 설치되지 않았어요. 모델 설치 후 다시 시도해 주세요.', 503)
    return model


def headline_dependencies_ready():
    return _ready('headline') and _ready('subtitle')


def load_headline_model():
    """시작 시 미리 불러오기(bootstrap). 설치 안 됐으면 503."""
    return _model('headline')


def generate_headline_drafts(model_input):
    with HEADLINE_LOCK:
        return _model('headline').generate(model_input, max_new_tokens=52, num_beams=8, num_return_sequences=6, length_penalty=1.0)


def generate_subtitle_drafts(facts):
    """facts 하나당 부제 초안 목록(1~3개 근거 문장을 한 번에 처리)."""
    if not facts:
        return []
    with SUBTITLE_LOCK:
        return _model('subtitle').generate([fact['model_input'] for fact in facts], max_new_tokens=58, min_new_tokens=10,
                                           num_beams=6, num_return_sequences=3, no_repeat_ngram_size=2, length_penalty=1.0)


def model_info(kind, model_id):
    """결과에 남기는 로컬 모델 출처 기록: 어떤 모델을 어떤 실행 방식으로, 설치돼 있었는지."""
    return {'kind': kind, 'model': model_id, 'runtime': 'onnx', 'installed': _ready(kind)}
