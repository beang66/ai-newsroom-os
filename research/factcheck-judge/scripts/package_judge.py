"""연구 결과(ONNX)를 앱 모델 폴더로 — ONNX 가중치를 파일 하나로 합치고 토크나이저·판정 설정(judge.json)을 둔다.

    python package_judge.py --onnx ../runs/q06b-v2-full/onnx --out <article_editor>/models/factcheck-judge-0.6b-v2 \
        --model-id qwen3-0.6b-judge-v2
그다음 dev/checks/make_model_manifest.py 로 매니페스트 항목을 만든다.
"""
import argparse
import json
import shutil
from pathlib import Path

import onnx

from common import LABELS


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--onnx', required=True, help='export_onnx.py 출력 폴더(model.onnx)')
    ap.add_argument('--out', required=True)
    ap.add_argument('--model-id', required=True)
    ap.add_argument('--supported-min', type=float, default=0.9, help="'일치' 확정 최소 확신도(dev 로 정함)")
    ap.add_argument('--min-confidence', type=float, default=0.5, help='이보다 낮으면 외부 판정')
    ap.add_argument('--maxlen', type=int, default=512)
    args = ap.parse_args()
    src, out = Path(args.onnx), Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    model = onnx.load(str(src / 'model.onnx'), load_external_data=True)
    onnx.save_model(model, str(out / 'model.onnx'), save_as_external_data=True, all_tensors_to_one_file=True,
                    location='model.onnx.data', size_threshold=1024)
    for name in ('tokenizer.json', 'tokenizer_config.json'):
        shutil.copy(src / name, out / name)
    json.dump({
        'model_id': args.model_id,
        'labels': LABELS,
        'max_length': args.maxlen,
        'supported_min_confidence': args.supported_min,
        'min_confidence': args.min_confidence,
        'early_stop': True,
        'source': str(src.parent.name),
    }, open(out / 'judge.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('packaged', out, sorted(p.name for p in out.iterdir()))


if __name__ == '__main__':
    main()
