"""조기 종료 안전성 — 근거를 하나씩 다 보는 방식과 조기 종료의 '근거 없이 일치' 수를 주장 단위로 비교한다.

    python safety_check.py --onnx ../runs/q17b-v2/onnx            # 봉인 문서(로컬 전용) + eval_*.jsonl
봉인 seed 마다 주장 3종: 일치(바꿔 쓴 문장, 없으면 원문) / 충돌(Claude 작성, 없으면 값 변형) /
근거 없음(같은 일치 주장, 후보에서 정답 청크 제거). 후보 = 검색 순위대로 정답 청크 + 검색 오답, 최대 5개.
같은 (주장, 근거) 쌍은 한 번만 판정하고 두 방식 모두 그 결과로 계산한다(조기 종료 = 앞부분).
"""
import argparse
import json
import random
import time
from pathlib import Path

from transformers import AutoTokenizer

from bench_judge import Judge
from build_pairs import conflicts
from common import DATA, load_jsonl
from evaluate import aggregate, to_status

K = 5


def tsv(path):
    out = {}
    for line in open(path, encoding='utf-8'):
        sid, _, text = line.rstrip('\n').partition('\t')
        if text.strip():
            out.setdefault(sid, text.strip())
    return out


def sealed_claims():
    para, written = tsv(DATA / 'sealed' / 'paraphrases_test.tsv'), tsv(DATA / 'sealed' / 'conflicts_test.tsv')
    rows, rng = [], random.Random(20261004)
    for seed in load_jsonl(DATA / 'sealed' / 'seeds_test.jsonl'):
        ranked = list(seed['negs'])
        ranked.insert((seed['pos_rank'] or len(ranked) + 1) - 1, seed['pos'])
        ranked = ranked[:K]
        if seed['pos'] not in ranked:
            continue  # 검색이 정답을 못 올린 seed — 판정기 시험이 아니다
        sup = para.get(seed['sid'])
        bad = written.get(seed['sid']) or next((t for t, _ in conflicts(seed['sentence'], seed, rng, set())), None)
        if not sup and not bad:
            continue
        sup = sup or seed['sentence']
        rows.append({'id': seed['sid'] + '-S', 'claim': sup, 'evidence': ranked, 'gold': 'SUPPORTED'})
        if bad:
            rows.append({'id': seed['sid'] + '-C', 'claim': bad, 'evidence': ranked, 'gold': 'CONFLICT'})
        others = [e for e in ranked if e != seed['pos']]
        if others:
            rows.append({'id': seed['sid'] + '-N', 'claim': sup, 'evidence': others, 'gold': 'NOT_ENOUGH_INFO'})
    return rows


def score(rows, cache, early):
    out = {'n': len(rows), 'correct': 0, 'unsafe_false_supported': 0, 'escalated': 0, 'calls': 0, 'by_gold': {}}
    for r in rows:
        statuses = []
        for e in r['evidence']:
            statuses.append(to_status(*cache[(r['claim'], e)]))
            if early and statuses[-1] in ('SUPPORTED', 'CONFLICT'):
                break
        v = aggregate(statuses)
        out['calls'] += len(statuses)
        out['correct'] += v == r['gold']
        out['unsafe_false_supported'] += v == 'SUPPORTED' and r['gold'] != 'SUPPORTED'
        out['escalated'] += v == 'EXTERNAL'
        g = out['by_gold'].setdefault(r['gold'], {})
        g[v] = g.get(v, 0) + 1
    out['calls'] = round(out['calls'] / len(rows), 2)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--onnx', required=True)
    ap.add_argument('--model', default='model.onnx')
    args = ap.parse_args()
    folder = Path(args.onnx)
    judge = Judge(folder / args.model, AutoTokenizer.from_pretrained(folder), 512)
    sets = {'sealed': sealed_claims(), **{p.stem: load_jsonl(p) for p in sorted(DATA.glob('eval_*.jsonl'))}}
    pairs = sorted({(r['claim'], e) for rows in sets.values() for r in rows for e in r['evidence'][:K]})
    print({k: len(v) for k, v in sets.items()}, '고유 판정 쌍', len(pairs), flush=True)
    cache, t0 = {}, time.perf_counter()
    for i, (c, e) in enumerate(pairs, 1):
        cache[(c, e)] = judge(c, [e])[0]
        if i % 100 == 0:
            el = time.perf_counter() - t0
            print(f'  {i}/{len(pairs)}  {el / i:.2f}s/쌍  남은 약 {el / i * (len(pairs) - i) / 60:.0f}분', flush=True)
    report = {}
    for name, rows in sets.items():
        rows = [{**r, 'evidence': r['evidence'][:K]} for r in rows]
        report[name] = {'all': score(rows, cache, False), 'early': score(rows, cache, True)}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    json.dump(report, open(folder.parent / 'safety.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
