"""판정기 속도·정확도 비교 — 엔진(ONNX fp32/int8) × 근거 수(k) × 방식(하나씩/묶어서/조기 종료).

    python bench_judge.py --onnx ../runs/q17b-v2/onnx
주장 단위 세트(eval_long29, eval_short18)로 정확도와 주장당 시간을 잰다(앱처럼 배치 1 기준).
"""
import argparse
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

from common import DATA, LABELS, load_jsonl, render
from evaluate import THRESHOLD, aggregate, to_status


class Judge:
    def __init__(self, path, tok, maxlen):
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.s = ort.InferenceSession(str(path), opts, providers=['CPUExecutionProvider'])
        self.tok, self.maxlen = tok, maxlen

    def __call__(self, claim, evidences):
        enc = self.tok([render(claim, e) for e in evidences], truncation=True, max_length=self.maxlen,
                       padding=True, return_tensors='np')
        logits = self.s.run(None, {'input_ids': enc['input_ids'].astype(np.int64),
                                   'attention_mask': enc['attention_mask'].astype(np.int64)})[0]
        p = np.exp(logits - logits.max(-1, keepdims=True))
        p /= p.sum(-1, keepdims=True)
        return [(LABELS[i], float(p[j, i])) for j, i in enumerate(p.argmax(-1))]


def verdicts(judge, row, k, mode):
    ev = row['evidence'][:k]
    if mode == 'batched':
        return [to_status(*x) for x in judge(row['claim'], ev)], len(ev)
    out = []
    for e in ev:
        out.append(to_status(*judge(row['claim'], [e])[0]))
        # 조기 종료: 순위 높은 근거에서 확신 있는 지지/충돌이 나오면 나머지는 건너뛴다
        if mode == 'early' and out[-1] in ('SUPPORTED', 'CONFLICT'):
            break
    return out, len(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--onnx', required=True, help='export_onnx.py 출력 폴더')
    ap.add_argument('--maxlen', type=int, default=512)
    ap.add_argument('--model', default='model.w8.onnx', help='모든 조합을 잴 양자화 모델(fp32 는 기준 조합 하나만 잰다)')
    args = ap.parse_args()
    folder = Path(args.onnx)
    tok = AutoTokenizer.from_pretrained(folder)
    sets = {p.stem: load_jsonl(p) for p in sorted(DATA.glob('eval_*.jsonl'))}
    print(f'threshold {THRESHOLD}')
    plan = [(args.model, [(5, 'single'), (5, 'batched'), (3, 'single'), (5, 'early'), (3, 'early')]),
            ('model.onnx', [(5, 'single')])][:1 if args.model == 'model.onnx' else 2]  # fp32 는 쌍당 수 초라 기준 조합만
    for model, combos in plan:
        judge = Judge(folder / model, tok, args.maxlen)
        judge('워밍업', ['워밍업 근거'])
        for k, mode in combos:
            line = [f'{model:17} k={k} {mode:8}']
            for name, rows in sets.items():
                t0, ok, calls = time.perf_counter(), 0, 0
                for r in rows:
                    st, n = verdicts(judge, r, k, mode)
                    calls += n
                    ok += aggregate(st) == r['gold']
                dt = (time.perf_counter() - t0) / len(rows)
                line.append(f'{name[5:]} {ok}/{len(rows)} {dt:.2f}s/주장 판정{calls / len(rows):.1f}회')
            print(' | '.join(line), flush=True)


if __name__ == '__main__':
    main()
