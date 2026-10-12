"""옛 v14 세트(C:\\TEST\\experiments\\semantic_training)에서 REVIEW_LOCAL / REVIEW_EXTERNAL 만 뽑는다.

실제 문서로는 아직 이 두 클래스를 만들지 못해서 임시로 쓴다(틀로 만든 문장이라 비중을 낮게 섞는다).
근거 여러 개는 앱처럼 청크 1개로 판정하므로 한 줄로 이어 붙인다.

    python research/factcheck-judge/scripts/extract_legacy_review.py
"""
import json
from pathlib import Path

SRC = Path(r'C:\TEST\experiments\semantic_training')
OUT = Path(__file__).resolve().parents[1] / 'data' / 'legacy_review.jsonl'

with open(OUT, 'w', encoding='utf-8') as f:
    for split, name in (('train', 'train_v14_rebalanced.jsonl'), ('dev', 'dev_v14_mixed.jsonl')):
        for line in open(SRC / name, encoding='utf-8'):
            row = json.loads(line)
            if row['target_class'] in ('REVIEW_LOCAL', 'REVIEW_EXTERNAL'):
                f.write(json.dumps({'split': split, 'claim': row['claim'], 'evidence': ' '.join(row['evidence'][:4]),
                                    'label': row['target_class'], 'origin': f"legacy/{row.get('origin', 'v14')}"},
                                   ensure_ascii=False) + '\n')
print(OUT, sum(1 for _ in open(OUT, encoding='utf-8')))
