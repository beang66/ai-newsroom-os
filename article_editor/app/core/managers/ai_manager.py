"""AI Module Manager — single interface over AI features (doc §4, §7, §8).

Dispatches an AI task by ``kind``. Local AI is preferred; external models are
reached only through the backend proxy (see ARCHITECTURE.md — backend-managed keys).

팩트체크·의미 청킹(core/ai/factcheck)은 torch/onnxruntime 을 쓰므로 처음 호출할 때 불러온다.
"""
import importlib.util

from ..ai.router import assist as _assist
from ..ai.transcribe import transcribe as _transcribe
from ..errors import RequestError

MAX_NODES, MAX_MATERIALS, MAX_TEXT = 200, 50, 500_000


def _text(value, field, limit=MAX_TEXT):
    if not isinstance(value, str) or len(value) > limit:
        raise RequestError(f'{field}은(는) {limit:,}자 이하의 문자열이어야 합니다.')
    return value


class AIManager:
    def assist(self, payload):
        """Run an AI task. ``payload['kind']`` selects the task
        (metadata / flow / photo_keywords / image / captions)."""
        return _assist(payload)

    def transcribe(self, payload):
        """인터뷰 녹음 전사 → 녹취 스튜디오 대화 목록. payload: {filename, data(base64)}"""
        return _transcribe(payload)

    def factcheck_status(self):
        """팩트체크에 필요한 모델·런타임 준비 상태."""
        from ..ai.factcheck import paths
        deps = {name: importlib.util.find_spec(name) is not None
                for name in ('torch', 'transformers', 'onnxruntime', 'tokenizers', 'numpy')}
        models = {
            'judge': (paths.JUDGE_DIR / 'model.onnx').is_file() and (paths.JUDGE_DIR / 'judge.json').is_file(),
            'embedding': (paths.EMBEDDING_DIR / 'model.safetensors').is_file(),
            'boundary': (paths.BOUNDARY_DIR / 'model.onnx').is_file(),  # 없으면 규칙만으로 청킹
        }
        return {'ready': all(deps.values()) and models['judge'] and models['embedding'],
                'models': models, 'runtime': deps}

    def factcheck_run(self, payload):
        """원고 문장(nodes)을 등록 자료(materials)에 비춰 판정한다.
        nodes: [{id, type, text, linkedSourceIds?}], materials: [{id, title, content, date?, speaker?}]"""
        nodes, materials = payload.get('nodes'), payload.get('materials')
        if not isinstance(nodes, list) or not 0 < len(nodes) <= MAX_NODES:
            raise RequestError(f'검증할 문장(nodes)을 1~{MAX_NODES}개 보내 주세요.')
        if not isinstance(materials, list) or len(materials) > MAX_MATERIALS:
            raise RequestError(f'자료(materials)는 {MAX_MATERIALS}개 이하로 보내 주세요.')
        for node in nodes:
            if not isinstance(node, dict):
                raise RequestError('nodes 항목 형식을 확인해 주세요.')
            _text(node.get('text', ''), '문장', 4000)
        for material in materials:
            if not isinstance(material, dict):
                raise RequestError('materials 항목 형식을 확인해 주세요.')
            _text(material.get('content') or material.get('summary') or '', '자료 본문')
        if not self.factcheck_status()['ready']:
            raise RequestError('팩트체크 모델이 아직 설치되지 않았어요. 모델 설치 후 다시 시도해 주세요.', 503)
        from ..ai.factcheck.service import review_workspace
        return review_workspace(nodes, materials)

    def semantic_parse(self, payload):
        """자료 본문을 의미 단위(청크)로 나눈다. 경계 모델이 없으면 규칙만 쓴다."""
        text = _text(payload.get('text'), '본문')
        source = payload.get('source') or 'frontend'
        if source not in ('frontend', 'opendart'):
            raise RequestError('source 는 frontend 또는 opendart 여야 합니다.')
        from ..ai.factcheck.chunker import chunk_document
        meta = {'source': source, **{k: payload[k] for k in ('corp_name', 'report_nm', 'date') if payload.get(k)}}
        return {'units': [{'text': u.text, 'kind': u.kind, 'field': u.field} for u in chunk_document(text, meta)]}
