"""판정기 평가 — (1) dev 학습쌍 단위 (2) 주장 단위: 검색 상위 근거를 하나씩 판정 → 앱 규칙으로 합침.

    python research/factcheck-judge/scripts/evaluate.py --base Qwen/Qwen3-1.7B --adapter research/factcheck-judge/runs/q17b-v1/adapter
    python research/factcheck-judge/scripts/evaluate.py ... --qlora           # 4bit 로 학습한 4B
    python research/factcheck-judge/scripts/evaluate.py ... --sealed          # 봉인 test(로컬 전용)

주장 단위 세트(data/eval_*.jsonl): gold = SUPPORTED | CONFLICT | NOT_ENOUGH_INFO.
기준선(같은 근거, 2026-10-03): Claude 26/29 · qwen3:4b-instruct(학습 없음) 22/29 · 앱 0.6B v10 9/29.
합치는 규칙은 앱 service._judge_qwen_candidates 를 단순화한 것(값 충돌 가드 등 결정 규칙은 빠짐):
    지지와 충돌이 함께 → EXTERNAL / 충돌 → CONFLICT / 지지 → SUPPORTED / 그 외 → 근거 없음(검토 클래스면 EXTERNAL)
"""
import argparse
import json
from pathlib import Path
from collections import Counter

import torch
from peft import PeftModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from common import DATA, L2I, LABELS, load_jsonl, render

THRESHOLD = 0.50  # 앱 LOCAL_CLASSIFIER_MIN_CONFIDENCE 기본값


def load_model(base, adapter, qlora):
    tok = AutoTokenizer.from_pretrained(base)
    if tok.pad_token_id is None:
        tok.pad_token = tok.eos_token
    quant = None
    if qlora:
        from transformers import BitsAndBytesConfig
        quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_compute_dtype=torch.bfloat16)
    cuda = torch.cuda.is_available()
    half = torch.bfloat16 if cuda and torch.cuda.get_device_capability()[0] >= 8 else torch.float16  # T4 등은 bf16 없음
    model = AutoModelForSequenceClassification.from_pretrained(
        base, num_labels=len(LABELS), id2label=dict(enumerate(LABELS)), label2id=L2I,
        dtype=half if cuda else torch.float32, quantization_config=quant,
        device_map={'': 0} if cuda else None)
    model.config.pad_token_id = tok.pad_token_id
    model = PeftModel.from_pretrained(model, adapter).eval()
    return tok, model


@torch.no_grad()
def predict(tok, model, pairs, maxlen, batch=8):
    """pairs: [(claim, evidence)] → [(label, confidence)]"""
    out = []
    for i in range(0, len(pairs), batch):
        enc = tok([render(c, e) for c, e in pairs[i:i + batch]], truncation=True, max_length=maxlen,
                  padding=True, return_tensors='pt').to(model.device)
        probs = torch.softmax(model(**enc).logits.float(), dim=-1)
        conf, idx = probs.max(dim=-1)
        out += [(LABELS[j], float(c)) for j, c in zip(idx.tolist(), conf.tolist())]
    return out


def to_status(label, conf):
    if label == 'REVIEW_EXTERNAL' or conf < THRESHOLD:
        return 'EXTERNAL'
    return {'SUPPORTED_LOCAL': 'SUPPORTED', 'CONFLICT_LOCAL': 'CONFLICT', 'GAP_LOCAL': 'GAP', 'REVIEW_LOCAL': 'REVIEW'}[label]


def aggregate(statuses):
    if 'SUPPORTED' in statuses and 'CONFLICT' in statuses:
        return 'EXTERNAL'
    if 'CONFLICT' in statuses:
        return 'CONFLICT'
    if 'SUPPORTED' in statuses:
        return 'SUPPORTED'
    return 'EXTERNAL' if {'EXTERNAL', 'REVIEW'} & set(statuses) else 'NOT_ENOUGH_INFO'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', required=True)
    ap.add_argument('--adapter', required=True)
    ap.add_argument('--qlora', action='store_true')
    ap.add_argument('--maxlen', type=int, default=512)
    ap.add_argument('--sealed', action='store_true')
    args = ap.parse_args()
    if not (Path(args.adapter) / 'adapter_config.json').is_file():
        raise SystemExit(f'어댑터가 없습니다: {Path(args.adapter).resolve()}\n'
                         f'먼저 train.py 로 학습하세요(끝나면 runs/<name>/adapter 가 생깁니다).')
    tok, model = load_model(args.base, args.adapter, args.qlora)
    report = {}

    dev = load_jsonl(DATA / 'sealed' / 'test.jsonl' if args.sealed else DATA / 'dev.jsonl')
    preds = predict(tok, model, [(r['claim'], r['evidence']) for r in dev], args.maxlen)
    confusion = Counter((r['label'], p) for r, (p, _) in zip(dev, preds))
    report['pairs'] = {
        'set': 'sealed_test' if args.sealed else 'dev', 'n': len(dev),
        'accuracy': round(sum(r['label'] == p for r, (p, _) in zip(dev, preds)) / len(dev), 4),
        'unsafe_false_supported': sum(p == 'SUPPORTED_LOCAL' and r['label'] != p for r, (p, _) in zip(dev, preds)),
        'confusion': {f'{g}->{p}': n for (g, p), n in sorted(confusion.items())},
    }
    for path in sorted(DATA.glob('eval_*.jsonl')):
        rows = load_jsonl(path)
        if 'evidence' not in rows[0]:
            continue  # eval_termswap60 은 형식이 달라 eval_termswap.py 가 따로 평가
        flat = [(r['claim'], e) for r in rows for e in r['evidence']]
        it = iter(predict(tok, model, flat, args.maxlen))
        verdicts = {r['id']: aggregate([to_status(*next(it)) for _ in r['evidence']]) for r in rows}
        report[path.stem] = {
            'correct': f"{sum(verdicts[r['id']] == r['gold'] for r in rows)}/{len(rows)}",
            'unsafe_false_supported': sum(verdicts[r['id']] == 'SUPPORTED' and r['gold'] != 'SUPPORTED' for r in rows),
            'escalated': sum(v == 'EXTERNAL' for v in verdicts.values()),
            'wrong': {r['id']: f"{r['gold']}->{verdicts[r['id']]}" for r in rows if verdicts[r['id']] != r['gold']},
        }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    out = Path(args.adapter).resolve().parent / ('eval_sealed.json' if args.sealed else 'eval.json')
    json.dump(report, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('saved', out)


if __name__ == '__main__':
    main()
