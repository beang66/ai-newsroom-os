"""틀린 용어 평가(data/eval_termswap60.jsonl, 평가 전용) — 바꿔 쓴 정답 문장 60 + 핵심 명사 하나를 틀린 말로 바꾼 60.
근거는 각 seed 의 정답 청크. 앱과 같은 '일치' 기준(0.9)으로 셉니다.

    python eval_termswap.py --onnx ../runs/q06b-v3/onnx                          # 이 PC(ONNX)
    python eval_termswap.py --base Qwen/Qwen3-0.6B --adapter ../runs/q06b-v5/adapter   # Colab·학습 PC(어댑터)
"""
import argparse
import json
from pathlib import Path

from common import DATA, load_jsonl

SUP_MIN = 0.9


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--onnx')
    ap.add_argument('--base')
    ap.add_argument('--adapter')
    args = ap.parse_args()
    if args.onnx:
        from transformers import AutoTokenizer
        from bench_judge import Judge
        judge = Judge(Path(args.onnx) / 'model.onnx', AutoTokenizer.from_pretrained(args.onnx), 512)
    else:
        from evaluate import load_model, predict
        tok, model = load_model(args.base, args.adapter, False)
        judge = lambda c, evs: predict(tok, model, [(c, e) for e in evs], 512)  # noqa: E731
    seeds = {s['sid']: s for s in load_jsonl(DATA / 'seeds.jsonl')}
    rows = load_jsonl(DATA / 'eval_termswap60.jsonl')
    out = {'swap': {}, 'para': {}}
    for r in rows:
        ev = seeds[r['sid']]['pos']
        for kind, claim in (('swap', r['swapped']), ('para', r['paraphrase'])):
            label, conf = judge(claim, [ev])[0]
            key = ('SUPPORTED' if conf >= SUP_MIN else 'REVIEW(<0.9)') if label == 'SUPPORTED_LOCAL' else label.replace('_LOCAL', '')
            out[kind][key] = out[kind].get(key, 0) + 1
    report = {'틀린 용어 60 (SUPPORTED 가 적을수록 좋음)': out['swap'],
              '정답 바꿔쓰기 60 (SUPPORTED 가 많을수록 좋음)': out['para']}
    print(json.dumps(report, ensure_ascii=False, indent=1))
    if args.adapter:  # 어댑터 옆에 남겨 Claude 가 받아 간다
        json.dump(report, open(Path(args.adapter).resolve().parent / 'eval_termswap.json', 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
