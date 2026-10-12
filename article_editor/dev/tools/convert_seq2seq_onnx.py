"""제목(KeT5)·부제(KoBART) 모델 → ONNX 변환 + transformers 원본과의 동일성 검증 (개발 도구).

변환 전용 환경에서만 실행한다(앱 런타임에는 transformers 가 필요 없다):
    uv venv conv_env && uv pip install --python conv_env "transformers==4.46.2" torch sentencepiece onnx onnxruntime "numpy<2.4"

    python dev/tools/convert_seq2seq_onnx.py --out models --hf-cache models/hf            # 둘 다 변환
    python dev/tools/convert_seq2seq_onnx.py --out models --hf-cache models/hf --parity 30  # 기사 30건 비교

결과 폴더(매니페스트 dir 과 같게):
    models/headline-ket5-onnx/   beam.onnx, tokenizer.json            (BeamSearch 연산자 포함 단일 그래프)
    models/subtitle-kobart-onnx/ encoder.onnx, decoder.onnx, tokenizer.json, generation.json

생성 설정은 app/core/ai/local_models.py 와 같아야 한다. 바꾸면 이 파일의 HEADLINE/SUBTITLE 도 바꾸고 다시 검증한다.
학습된 모델로 바꿀 때는 --headline / --subtitle 에 그 경로(또는 HF id)를 넣고 같은 절차를 반복한다.
"""
from __future__ import annotations

import argparse
import json
import random
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'app'))

HEADLINE = dict(max_new_tokens=52, num_beams=8, num_return_sequences=6, no_repeat_ngram_size=2, length_penalty=1.0)
SUBTITLE = dict(max_new_tokens=58, min_new_tokens=10, num_beams=6, num_return_sequences=3, no_repeat_ngram_size=2, length_penalty=1.0)


def _snapshot_file(model_id, cache, name):
    from huggingface_hub import hf_hub_download
    return Path(model_id) / name if Path(model_id).is_dir() else Path(hf_hub_download(model_id, name, cache_dir=cache))


def convert_headline(model_id, cache, out: Path):
    """onnxruntime convert_generation(T5) — 그래프 융합만 생략(6헤드x64 != 512 라 CPU 미지원 연산자가 생긴다)."""
    import onnx
    from onnxruntime.transformers import convert_generation
    for name in [m for m in list(sys.modules) if m.endswith('t5_helper')]:
        sys.modules[name].T5Helper.optimize_onnx = staticmethod(lambda path, dst, *a, **k: shutil.copyfile(path, dst))
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        beam = Path(tmp) / 'beam.onnx'
        args = ['-m', model_id, '--model_type', 't5', '--cache_dir', cache, '--output', str(beam),
                '--num_beams', str(HEADLINE['num_beams']), '--num_return_sequences', str(HEADLINE['num_return_sequences']),
                '--no_repeat_ngram_size', str(HEADLINE['no_repeat_ngram_size']), '--length_penalty', str(HEADLINE['length_penalty']),
                '--early_stopping', '--max_length', str(HEADLINE['max_new_tokens'] + 1), '--disable_perf_test', '--disable_parity']
        try:
            convert_generation.main(args)
        except Exception:  # 내장 시험 단계는 sentencepiece 파일을 찾다 실패한다 — 그래프는 이미 저장됨
            if not beam.is_file():
                raise
        model = onnx.load(str(beam))
        model.ir_version = 10  # onnx 1.23 은 IR 14 로 저장하지만 onnxruntime 1.30 은 13 까지 읽는다
        onnx.save(model, str(out / 'beam.onnx'))
    shutil.copyfile(_snapshot_file(model_id, cache, 'tokenizer.json'), out / 'tokenizer.json')


def convert_subtitle(model_id, cache, out: Path):
    """KoBART: encoder / decoder(마지막 위치 logits) 를 따로 내보낸다. 빔 서치는 onnx_seq2seq.beam_search."""
    import torch
    from transformers import AutoModelForSeq2SeqLM
    model = AutoModelForSeq2SeqLM.from_pretrained(model_id, cache_dir=cache).eval().requires_grad_(False)

    class Encoder(torch.nn.Module):
        def __init__(self):
            super().__init__(); self.m = model  # 파라미터를 모듈에 등록해야 내보내기가 상수로 굽지 않는다

        def forward(self, input_ids, attention_mask):
            model = self.m
            return model.model.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state

    class Decoder(torch.nn.Module):
        def __init__(self):
            super().__init__(); self.m = model

        def forward(self, decoder_input_ids, encoder_hidden_states, encoder_attention_mask, *past):
            # 한 토큰씩 진행한다. past = 층마다 self k, v (자라는 캐시) + cross k, v (cross_kv.onnx 가 한 번 계산).
            # cross 길이 == 인코더 길이로 추적하므로 HF 의 '재사용' 분기가 그래프에 고정된다.
            model = self.m
            n = 2 * layers
            cache = tuple((past[2 * i], past[2 * i + 1], past[n + 2 * i], past[n + 2 * i + 1]) for i in range(layers))
            out = model.model.decoder(input_ids=decoder_input_ids, encoder_hidden_states=encoder_hidden_states,
                                      encoder_attention_mask=encoder_attention_mask, past_key_values=cache, use_cache=True)
            logits = model.lm_head(out.last_hidden_state[:, -1, :]) + model.final_logits_bias
            return (logits, *[t for layer in out.past_key_values for t in layer[:2]])

    layers, heads = model.config.decoder_layers, model.config.decoder_attention_heads
    head_dim = model.config.d_model // heads
    out.mkdir(parents=True, exist_ok=True)
    ids = torch.tensor([[0, 100, 200, 1], [0, 100, 1, 3]]); mask = (ids != 3).long()
    with torch.no_grad():
        torch.onnx.export(Encoder(), (ids, mask), out / 'encoder.onnx', input_names=['input_ids', 'attention_mask'],
                          output_names=['hidden'], opset_version=17, dynamo=False,
                          dynamic_axes={'input_ids': {0: 'b', 1: 's'}, 'attention_mask': {0: 'b', 1: 's'}, 'hidden': {0: 'b', 1: 's'}})
        hidden = Encoder()(ids, mask)
        class CrossKV(torch.nn.Module):
            def __init__(self):
                super().__init__(); self.m = model

            def forward(self, encoder_hidden_states):
                b = encoder_hidden_states.shape[0]
                outs = []
                for layer in self.m.model.decoder.layers:
                    attn = layer.encoder_attn
                    outs += [attn._shape(attn.k_proj(encoder_hidden_states), -1, b), attn._shape(attn.v_proj(encoder_hidden_states), -1, b)]
                return tuple(outs)

        cross_names = [f'cross_{i}' for i in range(2 * layers)]
        torch.onnx.export(CrossKV(), (hidden,), out / 'cross_kv.onnx', input_names=['encoder_hidden_states'],
                          output_names=cross_names, opset_version=17, dynamo=False,
                          dynamic_axes={'encoder_hidden_states': {0: 'b', 1: 's'}, **{n: {0: 'b', 2: 's'} for n in cross_names}})
        cross = list(CrossKV()(hidden))
        dec = torch.tensor([[50], [60]])
        past = [torch.zeros(2, heads, 2, head_dim) for _ in range(2 * layers)] + cross
        past_names = [f'past_{i}' for i in range(2 * layers)] + cross_names
        present_names = [f'present_{i}' for i in range(2 * layers)]
        axes = {'decoder_input_ids': {0: 'n'}, 'encoder_hidden_states': {0: 'n', 1: 's'},
                'encoder_attention_mask': {0: 'n', 1: 's'}, 'logits': {0: 'n'}}
        axes.update({n: {0: 'n', 2: 't'} for n in past_names[:2 * layers]})
        axes.update({n: {0: 'n', 2: 's'} for n in cross_names}); axes.update({n: {0: 'n', 2: 't1'} for n in present_names})
        torch.onnx.export(Decoder(), (dec, hidden, mask, *past), out / 'decoder.onnx',
                          input_names=['decoder_input_ids', 'encoder_hidden_states', 'encoder_attention_mask', *past_names],
                          output_names=['logits', *present_names], opset_version=17, dynamo=False, dynamic_axes=axes)
    g = model.generation_config
    (out / 'generation.json').write_text(json.dumps({
        'decoder_start_token_id': g.decoder_start_token_id, 'eos_token_id': g.eos_token_id,
        'pad_token_id': g.pad_token_id, 'forced_eos_token_id': g.forced_eos_token_id,
        'decoder_layers': layers, 'heads': heads, 'head_dim': head_dim}, indent=2), encoding='utf-8')
    shutil.copyfile(_snapshot_file(model_id, cache, 'tokenizer.json'), out / 'tokenizer.json')


def parity(args):
    """원본(transformers.generate)과 ONNX 의 후보 문장이 글자 단위로 같은지 기사 N건으로 비교."""
    import time
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    from core.ai.onnx_seq2seq import BeamGraphModel, EncoderDecoderModel
    docs = [json.loads(x) for f in ('education_labeled.jsonl', 'buyeo_unlabeled.jsonl')
            for x in open(Path(args.press) / f, encoding='utf-8') if x.strip()]
    random.Random(3).shuffle(docs)
    bodies = [d['text'] for d in docs if len(d.get('text', '')) > 200][:args.parity]
    clean = lambda vs: list(dict.fromkeys(v.strip() for v in vs if v.strip()))
    report = {}
    for kind, model_id in (('headline', args.headline), ('subtitle', args.subtitle)):
        if args.only and kind != args.only:
            continue
        tok = AutoTokenizer.from_pretrained(model_id, cache_dir=args.hf_cache)
        ref_model = AutoModelForSeq2SeqLM.from_pretrained(model_id, cache_dir=args.hf_cache).eval()
        same = 0; t_ref = t_onnx = 0.0
        if kind == 'headline':
            onnx_model = BeamGraphModel(Path(args.out) / 'headline-ket5-onnx')
            cfg = {k: v for k, v in HEADLINE.items()}
            for body in bodies:
                inputs = tok(body[:4000], return_tensors='pt', max_length=512, truncation=True)
                t = time.perf_counter()
                with torch.inference_mode():
                    out = ref_model.generate(**inputs, early_stopping=True, **cfg)
                t_ref += time.perf_counter() - t
                ref = clean(tok.batch_decode(out, skip_special_tokens=True))
                t = time.perf_counter()
                got = onnx_model.generate(body[:4000], max_new_tokens=cfg['max_new_tokens'], num_beams=cfg['num_beams'],
                                          num_return_sequences=cfg['num_return_sequences'], length_penalty=cfg['length_penalty'])
                t_onnx += time.perf_counter() - t
                same += got == ref
                if got != ref:
                    print('[headline] DIFF\n  ref :', ref, '\n  onnx:', got)
        else:
            onnx_model = EncoderDecoderModel(Path(args.out) / 'subtitle-kobart-onnx')
            for body in bodies:  # 부제 입력과 비슷하게: 본문 문장 1~3개를 한 묶음으로
                sents = [s.strip() + '.' for s in body.split('.') if len(s.strip()) > 20][:3] or [body[:300]]
                inputs = tok(sents, return_tensors='pt', padding=True, max_length=512, truncation=True)
                t = time.perf_counter()
                with torch.inference_mode():
                    out = ref_model.generate(**inputs, early_stopping=True, **SUBTITLE)
                t_ref += time.perf_counter() - t
                values = tok.batch_decode(out, skip_special_tokens=True)
                ref = [clean(values[i * 3:(i + 1) * 3]) for i in range(len(sents))]
                t = time.perf_counter()
                got = [clean(g) for g in onnx_model.generate(sents, **SUBTITLE)]
                t_onnx += time.perf_counter() - t
                same += got == ref
                if got != ref:
                    print('[subtitle] DIFF\n  ref :', ref, '\n  onnx:', got)
        n = len(bodies)
        report[kind] = f'{same}/{n} identical, transformers {t_ref / n:.2f}s vs onnx {t_onnx / n:.2f}s per article'
        print(kind, report[kind], flush=True)
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--out', default=str(ROOT / 'models'))
    p.add_argument('--hf-cache', default=str(ROOT / 'models' / 'hf'))
    p.add_argument('--headline', default='onebeans/keT5-news-title-gen')
    p.add_argument('--subtitle', default='gogamza/kobart-summarization')
    p.add_argument('--only', choices=['headline', 'subtitle'])
    p.add_argument('--parity', type=int, default=0, help='변환 대신 기사 N건으로 원본과 비교')
    p.add_argument('--press', default='C:/TEST/public_data/curated_press')
    args = p.parse_args()
    if args.parity:
        parity(args); return
    if args.only in (None, 'headline'):
        convert_headline(args.headline, args.hf_cache, Path(args.out) / 'headline-ket5-onnx')
    if args.only in (None, 'subtitle'):
        convert_subtitle(args.subtitle, args.hf_cache, Path(args.out) / 'subtitle-kobart-onnx')


if __name__ == '__main__':
    main()
