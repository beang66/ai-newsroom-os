"""모델·런타임 데이터 위치 — 매니페스트(models_manifest.json)의 dir 이름과 맞춘다.

모델은 MODELS_DIR(%LOCALAPPDATA%/AI Newsroom/models), 캐시·로그는 APP_DATA/factcheck 에 둔다(app_paths).
"""
import json
import os
from pathlib import Path

from app_paths import WORKSPACE
from ... import config

JUDGE_DIR = Path(os.environ.get('FACTCHECK_JUDGE_DIR') or config.MODELS_DIR / 'factcheck-judge-0.6b-v3')  # ONNX 판정기
# KEEP — 삭제 금지: 로컬 임베딩 모델 경로(잠정 폐기, 2026-10-08). 기본 임베딩은 원격이지만 개발·검증·복귀용으로 남긴다.
EMBEDDING_DIR = Path(os.environ.get('ARCHIVE_EMBEDDING_MODEL_PATH') or config.MODELS_DIR / 'embedding-qwen3-0.6b-onnx')
TORCH_EMBEDDING_DIR = config.MODELS_DIR / 'embedding-qwen3-0.6b'
BOUNDARY_DIR = Path(os.environ.get('BOUNDARY_MODEL_DIR') or config.MODELS_DIR / 'boundary-roberta-base-v3')
RUNTIME_DIR = WORKSPACE / 'factcheck'  # 임베딩 캐시·라우팅 로그


def embedding_runtime():
    """원격(백엔드→Cloudflare) 임베딩이 기본이다(2026-10-08 로컬 임베딩 잠정 폐기).
    FACTCHECK_EMBEDDING_RUNTIME=onnx|torch 는 개발·검증용 명시 설정으로만 로컬 모델을 쓴다."""
    value = os.getenv('FACTCHECK_EMBEDDING_RUNTIME')
    return value if value in ('torch', 'onnx') else 'remote'


def embedding_dependencies():
    # 임베딩이 원격이어도 판정기·청킹 경계 모델은 로컬 ONNX 라 onnxruntime·tokenizers 가 필요하다
    names = ('onnxruntime', 'tokenizers', 'numpy')
    return names + ('torch', 'transformers') if embedding_runtime() == 'torch' else names


class _Settings:
    """backend core.config.settings 대역 (service.py 가 쓰는 필드만)."""

    @property
    def model_id(self):
        try:
            return json.loads((JUDGE_DIR / 'judge.json').read_text(encoding='utf-8'))['model_id']
        except (OSError, ValueError, KeyError):
            return 'unconfigured'


settings = _Settings()
