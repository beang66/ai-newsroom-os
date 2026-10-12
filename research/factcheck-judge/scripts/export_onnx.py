"""학습한 판정기(베이스 + LoRA 어댑터)를 앱용 ONNX 로 — LoRA 병합 → float32 ONNX → int8 동적 양자화.

    python export_onnx.py --base Qwen/Qwen3-1.7B --adapter ../runs/q17b-v2/adapter
출력: <adapter 옆>/onnx/model.onnx(+외부 데이터), model.int8.onnx, 토크나이저
torch·transformers·peft·onnx·onnxruntime 필요(CPU 로 충분). 마지막에 세 경로의 logits 를 비교한다.
"""
import argparse
import shutil
from pathlib import Path

import numpy as np
import torch
from peft import PeftModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from common import DATA, L2I, LABELS, load_jsonl, render


class Logits(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask):
        return self.model(input_ids=input_ids, attention_mask=attention_mask).logits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', required=True)
    ap.add_argument('--adapter', required=True)
    ap.add_argument('--maxlen', type=int, default=512)
    args = ap.parse_args()
    out = Path(args.adapter).resolve().parent / 'onnx'
    out.mkdir(exist_ok=True)

    tok = AutoTokenizer.from_pretrained(args.adapter)
    if tok.pad_token_id is None:
        tok.pad_token = tok.eos_token
    model = AutoModelForSequenceClassification.from_pretrained(
        args.base, num_labels=len(LABELS), id2label=dict(enumerate(LABELS)), label2id=L2I,
        dtype=torch.float32, attn_implementation='eager')
    model.config.pad_token_id = tok.pad_token_id
    model = PeftModel.from_pretrained(model, args.adapter).merge_and_unload().eval()
    model.config.use_cache = False

    sample = tok([render('예시 주장입니다.', '예시 근거 문장입니다.')], return_tensors='pt')
    fp32 = out / 'model.onnx'
    with torch.no_grad():
        torch.onnx.export(
            Logits(model), (sample['input_ids'], sample['attention_mask']), str(fp32),
            input_names=['input_ids', 'attention_mask'], output_names=['logits'],
            dynamic_axes={'input_ids': {0: 'batch', 1: 'seq'}, 'attention_mask': {0: 'batch', 1: 'seq'}, 'logits': {0: 'batch'}},
            opset_version=17, dynamo=False)
    print('exported', fp32)

    from onnxruntime.quantization import QuantType, quantize_dynamic
    int8 = out / 'model.int8.onnx'
    quantize_dynamic(str(fp32), str(int8), weight_type=QuantType.QInt8, use_external_data_format=True)
    print('quantized', int8)
    tok.save_pretrained(out)
    for name in ('adapter_config.json',):
        shutil.copy(Path(args.adapter) / name, out / name)

    # 세 경로 비교: 같은 쌍에서 예측 클래스가 같은지, logits 차이가 얼마인지
    import onnxruntime as ort
    rows = load_jsonl(DATA / 'dev.jsonl')[:16]
    sessions = {p.name: ort.InferenceSession(str(p), providers=['CPUExecutionProvider']) for p in (fp32, int8)}
    agree = {k: 0 for k in sessions}
    worst = {k: 0.0 for k in sessions}
    for r in rows:
        enc = tok([render(r['claim'], r['evidence'])], truncation=True, max_length=args.maxlen, return_tensors='np')
        with torch.no_grad():
            ref = model(input_ids=torch.from_numpy(enc['input_ids']), attention_mask=torch.from_numpy(enc['attention_mask'])).logits.numpy()
        for k, s in sessions.items():
            got = s.run(None, {'input_ids': enc['input_ids'].astype(np.int64), 'attention_mask': enc['attention_mask'].astype(np.int64)})[0]
            agree[k] += int(got.argmax() == ref.argmax())
            worst[k] = max(worst[k], float(np.abs(got - ref).max()))
    for k in sessions:
        print(f'{k}: 예측 일치 {agree[k]}/{len(rows)}, 최대 logits 차 {worst[k]:.4f}')


if __name__ == '__main__':
    main()
