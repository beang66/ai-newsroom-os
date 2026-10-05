"""판정기 학습 — Qwen3 + LoRA(+선택 4bit QLoRA) + 5클래스 분류 헤드. 4060 Ti 8GB 기준 설정.

    # Qwen3-1.7B, bf16 LoRA (권장 첫 실행)
    python research/factcheck-judge/scripts/train.py --base Qwen/Qwen3-1.7B --name q17b-v1
    # Qwen3-4B, 4bit QLoRA
    python research/factcheck-judge/scripts/train.py --base Qwen/Qwen3-4B --qlora --name q4b-v1

출력: research/factcheck-judge/runs/<name>/adapter (앱 models/.../adapters/ 로 옮길 대상), metrics.json
runs/ 는 git 에 올라가지 않는다.
"""
import argparse
import json
import time

import numpy as np
import torch
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (AutoModelForSequenceClassification, AutoTokenizer, DataCollatorWithPadding, Trainer,
                          TrainingArguments)

from common import DATA, HERE, L2I, LABELS, load_jsonl, render


def metrics(pred):
    p, y = np.argmax(pred.predictions, axis=-1), pred.label_ids
    recalls = {LABELS[i]: float(np.mean(p[y == i] == i)) for i in range(len(LABELS)) if np.any(y == i)}
    return {
        'accuracy': float(np.mean(p == y)),
        'macro_recall': float(np.mean(list(recalls.values()))),
        # 가장 위험한 오류: 근거가 없거나 어긋나는데 '일치' — 0 에 가까워야 한다
        'unsafe_false_supported': int(np.sum((p == L2I['SUPPORTED_LOCAL']) & (y != L2I['SUPPORTED_LOCAL']))),
        **{f'recall_{k}': v for k, v in recalls.items()},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='Qwen/Qwen3-1.7B', help='HF 모델 id 또는 로컬 경로')
    ap.add_argument('--name', required=True)
    ap.add_argument('--qlora', action='store_true', help='4bit 양자화(4B 를 8GB 에 올릴 때)')
    ap.add_argument('--maxlen', type=int, default=512)
    ap.add_argument('--epochs', type=float, default=3)
    ap.add_argument('--lr', type=float, default=1e-4)
    ap.add_argument('--batch', type=int, default=4)
    ap.add_argument('--accum', type=int, default=4)
    ap.add_argument('--lora-r', type=int, default=16)
    ap.add_argument('--fp32', action='store_true', help='bf16 이 없는 옛 GPU(예: GTX 10xx)용 — 계산을 float32 로')
    ap.add_argument('--fp16', action='store_true', help='bf16 이 없는 T4(Colab) 등 — 가중치 float32 + fp16 혼합정밀')
    ap.add_argument('--max-steps', type=int, default=-1, help='속도 시험용(몇 스텝만)')
    ap.add_argument('--resume', action='store_true', help='중단된 학습을 runs/<name>/checkpoints 의 마지막 체크포인트부터 이어서')
    args = ap.parse_args()
    out = HERE / 'runs' / args.name
    assert torch.cuda.is_available(), 'CUDA GPU 가 필요합니다(README 의 torch 설치 참고).'

    tok = AutoTokenizer.from_pretrained(args.base)
    if tok.pad_token_id is None:
        tok.pad_token = tok.eos_token

    def encode(rows):
        enc = [tok(render(r['claim'], r['evidence']), truncation=True, max_length=args.maxlen) for r in rows]
        return [{**e, 'labels': L2I[r['label']]} for e, r in zip(enc, rows)]

    train, dev = load_jsonl(DATA / 'train.jsonl'), load_jsonl(DATA / 'dev.jsonl')
    for name, rows in (('train', train), ('dev', dev)):  # KLUE-NLI 일부(CC BY-SA 4.0, 별도 파일 — LICENSES.md)
        if (DATA / f'klue_{name}.jsonl').exists():
            rows += load_jsonl(DATA / f'klue_{name}.jsonl')
    train_ds, dev_ds = encode(train), encode(dev)
    print(f'train {len(train)}  dev {len(dev)}  base {args.base}  qlora {args.qlora}', flush=True)

    dtype = torch.float32 if args.fp32 or args.fp16 else torch.bfloat16
    quant = None
    if args.qlora:
        from transformers import BitsAndBytesConfig
        quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_compute_dtype=dtype,
                                   bnb_4bit_use_double_quant=True)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.base, num_labels=len(LABELS), id2label=dict(enumerate(LABELS)), label2id=L2I,
        dtype=dtype, quantization_config=quant, device_map={'': 0})
    model.config.pad_token_id = tok.pad_token_id
    model.config.use_cache = False
    if args.qlora:
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    else:
        model.gradient_checkpointing_enable()
    model = get_peft_model(model, LoraConfig(
        r=args.lora_r, lora_alpha=args.lora_r * 2, lora_dropout=0.05, task_type='SEQ_CLS',
        target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
        modules_to_save=['score']))
    model.print_trainable_parameters()

    trainer = Trainer(
        model=model,
        args=TrainingArguments(
            output_dir=str(out / 'checkpoints'), num_train_epochs=args.epochs, learning_rate=args.lr,
            per_device_train_batch_size=args.batch, per_device_eval_batch_size=args.batch * 2,
            gradient_accumulation_steps=args.accum, warmup_steps=0.05, weight_decay=0.01, lr_scheduler_type='cosine',
            bf16=not (args.fp32 or args.fp16), fp16=args.fp16, max_steps=args.max_steps, eval_strategy='epoch', save_strategy='epoch', save_total_limit=1, load_best_model_at_end=True,
            metric_for_best_model='macro_recall', logging_steps=20, report_to=[], dataloader_num_workers=0,
            gradient_checkpointing=True, gradient_checkpointing_kwargs={'use_reentrant': False}),
        train_dataset=train_ds, eval_dataset=dev_ds, data_collator=DataCollatorWithPadding(tok),
        compute_metrics=metrics)
    t0 = time.time()
    trainer.train(resume_from_checkpoint=True if args.resume else None)
    result = trainer.evaluate()
    model.save_pretrained(out / 'adapter')
    tok.save_pretrained(out / 'adapter')
    json.dump({'args': vars(args), 'minutes': round((time.time() - t0) / 60, 1), 'dev': result},
              open(out / 'metrics.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
