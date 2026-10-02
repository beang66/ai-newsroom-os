"""모델·런타임 데이터 위치 — 매니페스트(models_manifest.json)의 dir 이름과 맞춘다.

모델은 MODELS_DIR(설치 폴더 안), 캐시·로그는 사용자 작업공간(.article-workspace)에 둔다.
"""
import json
import os
from pathlib import Path

from app_paths import WORKSPACE
from ... import config

FACTCHECK_DIR = config.MODELS_DIR / 'factcheck-qwen3-0.6b-v10'  # base + LoRA adapter
EMBEDDING_DIR = Path(os.environ.get('ARCHIVE_EMBEDDING_MODEL_PATH') or config.MODELS_DIR / 'embedding-qwen3-0.6b')
BOUNDARY_DIR = Path(os.environ.get('BOUNDARY_MODEL_DIR') or config.MODELS_DIR / 'boundary-roberta-base-v3')
RUNTIME_DIR = WORKSPACE / 'factcheck'  # 임베딩 캐시·라우팅 로그


def _active() -> dict:
    try:
        return json.loads((FACTCHECK_DIR / 'active_model.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


class _Settings:
    """backend core.config.settings 대역 (service.py 가 쓰는 필드만)."""

    def __init__(self):
        active = _active()
        self.model_id = active.get('model_id', 'unconfigured')
        self.base_model_path = FACTCHECK_DIR / active.get('base_model', 'base/Qwen3-0.6B')
        self.adapter_path = FACTCHECK_DIR / active.get('adapter', 'adapters/v10-paraphrase')


settings = _Settings()
