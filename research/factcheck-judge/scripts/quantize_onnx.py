"""float32 ONNX 판정기를 여러 방식으로 줄이고, float32 와 예측이 같은지·속도를 비교한다.

    python quantize_onnx.py --onnx ../runs/q17b-v2/onnx
변형: dyn8pc(행렬곱만 채널별 int8, 활성값도 양자화) / w8, w4(가중치만 8·4비트 — MatMulNBits) / w8a4, w4a4(+ accuracy_level=4)
2026-10-04 결과(1.7B, 이 PC CPU): fp32 3.70s·dyn8pc 2.44s 0/48·w8 8.04s 48/48·w4 4.36s 46/48
2026-10-04: 전체 동적 int8(export_onnx.py 기본)은 dev 16쌍 중 4개만 일치 — Qwen 활성값 이상치 때문으로 본다.
"""
import argparse
import time
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from transformers import AutoTokenizer

from common import DATA, load_jsonl, render


def make(src, folder, name):
    out = folder / f'model.{name}.onnx'
    if out.exists():
        return out
    if name == 'dyn8pc':
        from onnxruntime.quantization import QuantType, quantize_dynamic
        quantize_dynamic(str(src), str(out), weight_type=QuantType.QInt8, per_channel=True,
                         op_types_to_quantize=['MatMul'], use_external_data_format=True,
                         extra_options={'MatMulConstBOnly': True})
        return out
    # w8 / w4: 가중치만 / w8a4 / w4a4: + accuracy_level=4(활성값을 int8 로 계산하는 빠른 커널)
    from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer
    bits, level = int(name[1]), (4 if name.endswith('a4') else None)
    q = MatMulNBitsQuantizer(onnx.load(str(src)), bits=bits, block_size=128, is_symmetric=True, accuracy_level=level)
    q.process()
    q.model.save_model_to_file(str(out), use_external_data_format=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--onnx', required=True)
    ap.add_argument('--n', type=int, default=48)
    ap.add_argument('--variants', default='dyn8pc,w8,w4,w8a4,w4a4')
    args = ap.parse_args()
    folder = Path(args.onnx)
    tok = AutoTokenizer.from_pretrained(folder)
    rows = load_jsonl(DATA / 'dev.jsonl')[:args.n]
    feeds = []
    for r in rows:
        enc = tok([render(r['claim'], r['evidence'])], truncation=True, max_length=512, return_tensors='np')
        feeds.append({k: enc[k].astype(np.int64) for k in ('input_ids', 'attention_mask')})

    def run(path):
        s = ort.InferenceSession(str(path), providers=['CPUExecutionProvider'])
        s.run(None, feeds[0])
        t0 = time.perf_counter()
        out = [s.run(None, f)[0][0] for f in feeds]
        return np.array(out), (time.perf_counter() - t0) / len(feeds)

    ref, t_ref = run(folder / 'model.onnx')
    print(f'model.onnx (fp32)      {t_ref:.2f}s/쌍')
    for name in args.variants.split(','):
        path = make(folder / 'model.onnx', folder, name)
        got, t = run(path)
        size = sum(p.stat().st_size for p in folder.glob(path.name + '*')) / 1e9
        print(f'{path.name:22} {t:.2f}s/쌍  예측 일치 {(got.argmax(1) == ref.argmax(1)).sum()}/{len(rows)}  '
              f'최대 logits 차 {np.abs(got - ref).max():.3f}  {size:.2f}GB', flush=True)


if __name__ == '__main__':
    main()
