"""학습·평가가 같이 쓰는 약속 — 앱(article_editor/app/core/ai/factcheck/semantic_provider.py)과 반드시 같아야 한다."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
DATA = HERE / 'data'

# 앱 LocalClassifierProvider.LABELS 와 같은 순서(분류 헤드 출력 순서)
LABELS = ['SUPPORTED_LOCAL', 'CONFLICT_LOCAL', 'GAP_LOCAL', 'REVIEW_LOCAL', 'REVIEW_EXTERNAL']
L2I = {label: i for i, label in enumerate(LABELS)}


def render(claim, evidence):
    """앱 _render 와 같은 입력 — 근거는 청크 1개(앱이 후보마다 따로 판정한다), 500자에서 자른다."""
    return f'fact_relation\nCLAIM: {claim}\nEVIDENCE:\nE1: {evidence[:500]}'


def load_jsonl(path):
    return [json.loads(line) for line in open(path, encoding='utf-8') if line.strip()]
