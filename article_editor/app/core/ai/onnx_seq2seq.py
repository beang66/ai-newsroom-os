"""제목(KeT5)·부제(KoBART) 생성 — torch/transformers 없이 onnxruntime + tokenizers 로 실행.

transformers 4.46.2 의 model.generate(빔 서치) 결과와 글자 단위로 같도록 맞춘 구현이다
(검증: dev/tools/convert_seq2seq_onnx.py --parity). 팩트체크 모듈의 transformers 버전과 충돌하지 않게
제목·부제 런타임에서 transformers 를 뺐다(2026-10-02).

- KeT5: onnxruntime BeamSearch 연산자가 들어 있는 그래프 1개(beam.onnx)를 그대로 실행한다.
- KoBART: encoder.onnx / decoder.onnx 를 돌리고 빔 서치는 아래 numpy 구현(HF 4.46.2 BeamSearchScorer 이식)이 맡는다.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer


def _session(path: Path):
    options = ort.SessionOptions()
    options.log_severity_level = 3
    return ort.InferenceSession(str(path), options, providers=['CPUExecutionProvider'])


def _clean(values):
    return list(dict.fromkeys(v.strip() for v in values if v.strip()))


class BeamGraphModel:
    """BeamSearch 연산자를 포함한 단일 그래프(KeT5). 생성 설정은 호출 인자로 넘긴다."""

    def __init__(self, folder: Path):
        self.sess = _session(folder / 'beam.onnx')
        self.tok = Tokenizer.from_file(str(folder / 'tokenizer.json'))
        self.tok.enable_truncation(512)

    def generate(self, text, *, max_new_tokens, num_beams, num_return_sequences, length_penalty=1.0):
        # no_repeat_ngram_size·early_stopping 은 변환할 때 그래프 속성으로 고정했다(convert_seq2seq_onnx.py).
        ids = self.tok.encode(text).ids
        seq = self.sess.run(None, {
            'input_ids': np.array([ids], np.int32),
            'max_length': np.array([max_new_tokens + 1], np.int32),
            'min_length': np.array([0], np.int32),
            'num_beams': np.array([num_beams], np.int32),
            'num_return_sequences': np.array([num_return_sequences], np.int32),
            'length_penalty': np.array([length_penalty], np.float32),
            'repetition_penalty': np.array([1.0], np.float32),
        })[0]
        return _clean(self.tok.decode_batch(seq[0].tolist(), skip_special_tokens=True))


class EncoderDecoderModel:
    """encoder.onnx + cross_kv.onnx + decoder.onnx(KoBART) 와 HF 4.46.2 호환 빔 서치."""

    def __init__(self, folder: Path):
        self.enc = _session(folder / 'encoder.onnx')
        self.dec = _session(folder / 'decoder.onnx')
        self.cross = _session(folder / 'cross_kv.onnx')
        self.tok = Tokenizer.from_file(str(folder / 'tokenizer.json'))
        self.tok.enable_truncation(512)
        cfg = json.loads((folder / 'generation.json').read_text(encoding='utf-8'))
        self.start, self.eos, self.pad = cfg['decoder_start_token_id'], cfg['eos_token_id'], cfg['pad_token_id']
        self.forced_eos = cfg.get('forced_eos_token_id')
        self.layers, self.heads, self.head_dim = cfg['decoder_layers'], cfg['heads'], cfg['head_dim']
        self.tok.enable_padding(pad_id=self.pad)

    def generate(self, texts, *, max_new_tokens, min_new_tokens, num_beams, num_return_sequences,
                 no_repeat_ngram_size, length_penalty=1.0):
        """texts 하나당 후보(중복 제거, 순서 유지) 목록을 돌려준다."""
        enc = self.tok.encode_batch(list(texts))
        ids = np.array([e.ids for e in enc], np.int64)
        mask = np.array([e.attention_mask for e in enc], np.int64)
        hidden = self.enc.run(None, {'input_ids': ids, 'attention_mask': mask})[0]
        keep = np.repeat(np.arange(len(texts)), num_beams)  # 빔 → 원문
        cross = self.cross.run(None, {'encoder_hidden_states': hidden})  # 문장마다 한 번
        wanted = {i.name for i in self.dec.get_inputs()}  # cross 를 캐시로 받으면 인코더 출력 입력은 그래프에서 빠진다
        feed = {k: v for k, v in {'encoder_hidden_states': hidden[keep], 'encoder_attention_mask': mask[keep],
                                  **{f'cross_{i}': c[keep] for i, c in enumerate(cross)}}.items() if k in wanted}
        past = [np.zeros((len(keep), self.heads, 0, self.head_dim), np.float32) for _ in range(2 * self.layers)]

        def step(tokens, origins):
            nonlocal past
            if origins is not None:  # 빔 재정렬에 캐시를 맞춘다
                past = [p[origins] for p in past]
            out = self.dec.run(None, {'decoder_input_ids': tokens[:, None], **feed,
                                      **{f'past_{i}': p for i, p in enumerate(past)}})
            past = out[1:]
            return out[0]

        rows = beam_search(
            step,
            batch=len(texts), start=self.start, eos=self.eos, pad=self.pad, forced_eos=self.forced_eos,
            max_length=max_new_tokens + 1, min_new_tokens=min_new_tokens, num_beams=num_beams,
            num_return=num_return_sequences, ngram=no_repeat_ngram_size, length_penalty=length_penalty)
        return [_clean(self.tok.decode_batch(group, skip_special_tokens=True)) for group in rows]


def _log_softmax(x):
    x = x - x.max(-1, keepdims=True)
    return x - np.log(np.exp(x).sum(-1, keepdims=True))


def _top_stable(x, k):
    """np.argsort(-x, kind='stable')[:, :k] 와 같은 결과(동점은 앞 인덱스 우선)를 전체 정렬 없이 구한다."""
    out = np.empty((x.shape[0], k), np.int64)
    for r, row in enumerate(x):
        kth = np.partition(row, -k)[-k]
        cand = np.flatnonzero(row >= kth)  # 경계 동점까지 포함
        out[r] = cand[np.lexsort((cand, -row[cand]))][:k]
    return out


def _banned(seq, n):
    """NoRepeatNGramLogitsProcessor: 마지막 n-1 토큰 뒤에 이미 나온 토큰을 금지."""
    cur = len(seq)
    if cur + 1 < n:
        return []
    prefix = tuple(seq[cur + 1 - n:cur])
    return [seq[i + n - 1] for i in range(cur - n + 1) if tuple(seq[i:i + n - 1]) == prefix]


def beam_search(step, *, batch, start, eos, pad, forced_eos, max_length, min_new_tokens, num_beams, num_return,
                ngram, length_penalty):
    """HF 4.46.2 _beam_search + BeamSearchScorer(early_stopping=True) 이식.
    step(마지막 토큰[N], 이전 빔 출처[N] 또는 None) → 다음 토큰 logits[N, V]."""
    seqs = [[start] for _ in range(batch * num_beams)]
    scores = np.zeros((batch, num_beams), np.float32)
    scores[:, 1:] = -1e9
    scores = scores.reshape(-1)
    hyps = [[] for _ in range(batch)]  # (score, tokens)
    worst = [1e9] * batch
    done = [False] * batch
    origins = None

    def add(b, tokens, total, gen_len):
        score = total / (gen_len ** length_penalty)
        if len(hyps[b]) < num_beams or score > worst[b]:
            hyps[b].append((score, tokens))
            if len(hyps[b]) > num_beams:
                order = sorted((s, i) for i, (s, _) in enumerate(hyps[b]))
                del hyps[b][order[0][1]]
                worst[b] = order[1][0]
            else:
                worst[b] = min(score, worst[b])

    while True:
        cur = len(seqs[0])
        logits = step(np.array([seq[-1] for seq in seqs], np.int64), origins).astype(np.float32)
        logp = _log_softmax(logits)
        if ngram:
            for i, seq in enumerate(seqs):
                logp[i, _banned(seq, ngram)] = -np.inf
        if cur - 1 < min_new_tokens:
            logp[:, eos] = -np.inf
        if forced_eos is not None and cur == max_length - 1:
            logp[:] = -np.inf
            logp[:, forced_eos] = 0
        total = (logp + scores[:, None]).reshape(batch, -1)
        vocab = logp.shape[-1]
        keep = 2 * num_beams
        top = _top_stable(total, keep)
        new_seqs, new_scores, new_origins = [], [], []
        for b in range(batch):
            if done[b]:
                new_seqs += [seqs[b * num_beams] + [pad]] * num_beams  # 끝난 배치는 패딩으로 채운다(결과에 영향 없음)
                new_scores += [0.0] * num_beams
                new_origins += [b * num_beams] * num_beams
                continue
            picked = 0
            for rank, flat in enumerate(top[b]):
                beam, token = b * num_beams + flat // vocab, int(flat % vocab)
                value = float(total[b, flat])
                if token == eos:
                    if rank >= num_beams:
                        continue
                    add(b, seqs[beam], value, cur + 1 - 1)
                else:
                    new_seqs.append(seqs[beam] + [token]); new_scores.append(value); new_origins.append(beam); picked += 1
                if picked == num_beams:
                    break
            done[b] = done[b] or len(hyps[b]) >= num_beams  # early_stopping=True
        seqs, scores, origins = new_seqs, np.array(new_scores, np.float32), np.array(new_origins)
        if all(done) or len(seqs[0]) >= max_length:
            break
    for b in range(batch):
        if not done[b]:
            for k in range(num_beams):
                tokens = seqs[b * num_beams + k]
                add(b, tokens, float(scores[b * num_beams + k]), len(tokens) - 1)
    out = []
    for b in range(batch):
        ranked = sorted(hyps[b], key=lambda x: x[0])
        out.append([ranked.pop()[1] for _ in range(num_return)])
    return out
