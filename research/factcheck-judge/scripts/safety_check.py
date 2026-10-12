"""조기 종료 안전성 — 근거를 하나씩 다 보는 방식과 조기 종료의 '근거 없이 일치' 수를 주장 단위로 비교한다.

    python safety_check.py --onnx ../runs/q17b-v2/onnx            # 봉인 문서(로컬 전용) + eval_*.jsonl
    python safety_check.py --onnx ... --tune                      # dev 로 '일치' 확신도 기준값 표
    python safety_check.py --onnx ... --sup-min 0.9               # 고른 기준값으로 봉인·평가 세트 확인
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


def claims_from(seeds, para, written):
    """seed 마다 일치·충돌·근거 없음 주장 + 검색 순위대로 근거 후보(최대 K)."""
    rows, rng = [], random.Random(20261004)
    for seed in seeds:
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


def sealed_claims():
    return claims_from(load_jsonl(DATA / 'sealed' / 'seeds_test.jsonl'),
                       tsv(DATA / 'sealed' / 'paraphrases_test.tsv'), tsv(DATA / 'sealed' / 'conflicts_test.tsv'))


def dev_claims():
    """기준값 조정용 — 봉인 test 를 쓰지 않는다."""
    para, written = {}, {}
    for p in sorted((DATA / 'paraphrases').glob('dev_*.tsv')):
        para.update(tsv(p))
    for p in sorted((DATA / 'conflicts').glob('dev_*.tsv')):
        written.update(tsv(p))
    return claims_from([s for s in load_jsonl(DATA / 'seeds.jsonl') if s['split'] == 'dev'], para, written)


def status(label, conf, sup_min):
    """'일치'는 확신도 sup_min 이상일 때만 확정 — 아래면 검토(조기 종료하지 않고 다음 근거로, 끝까지 없으면 외부)."""
    if label == 'SUPPORTED_LOCAL' and conf < sup_min:
        return 'REVIEW'
    return to_status(label, conf)


def score(rows, cache, early, sup_min=0.0):
    out = {'n': len(rows), 'correct': 0, 'unsafe_false_supported': 0, 'escalated': 0, 'calls': 0, 'by_gold': {}}
    for r in rows:
        statuses = []
        for e in r['evidence']:
            statuses.append(status(*cache[(r['claim'], e)], sup_min))
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


def _save(cache, store):
    json.dump({'\x1f'.join(k): v for k, v in cache.items()}, open(store, 'w', encoding='utf-8'), ensure_ascii=False)


def judge_all(judge, sets, store):
    """(주장, 근거) 쌍 판정 — store(json)에 저장해 두고 이미 있는 쌍은 다시 판정하지 않는다."""
    cache = {}
    if store.exists():
        cache = {tuple(k.split('\x1f')): tuple(v) for k, v in json.load(open(store, encoding='utf-8')).items()}
    todo = sorted({(r['claim'], e) for rows in sets.values() for r in rows for e in r['evidence'][:K]} - cache.keys())
    print({k: len(v) for k, v in sets.items()}, '새로 판정할 쌍', len(todo), flush=True)
    t0 = time.perf_counter()
    for i, (c, e) in enumerate(todo, 1):
        cache[(c, e)] = tuple(judge(c, [e])[0])
        if i % 100 == 0:
            el = time.perf_counter() - t0
            print(f'  {i}/{len(todo)}  {el / i:.2f}s/쌍  남은 약 {el / i * (len(todo) - i) / 60:.0f}분', flush=True)
            _save(cache, store)
    _save(cache, store)
    return cache


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--onnx', required=True)
    ap.add_argument('--model', default='model.onnx')
    ap.add_argument('--tune', action='store_true', help="dev 로 '일치' 확신도 기준값 표만 뽑는다")
    ap.add_argument('--sup-min', type=float, default=0.0, help="'일치' 확정에 필요한 최소 확신도(조기 종료와 함께)")
    args = ap.parse_args()
    folder = Path(args.onnx)
    judge = Judge(folder / args.model, AutoTokenizer.from_pretrained(folder), 512)
    if args.tune:  # dev 로 '일치' 확신도 기준값 고르기 — 봉인 test 는 보지 않는다
        sets = {'dev': dev_claims()}
        cache = judge_all(judge, sets, folder.parent / 'judgments.json')
        print('sup_min  정답  일치오판  외부  판정/주장')
        for t in (0.0, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.98, 0.99):
            r = score(sets['dev'], cache, True, t)
            print(f'{t:6.2f}  {r["correct"]:4}/{r["n"]}  {r["unsafe_false_supported"]:4}  {r["escalated"]:4}  {r["calls"]}')
        return
    sets = {'sealed': sealed_claims(), **{p.stem: load_jsonl(p) for p in sorted(DATA.glob('eval_*.jsonl')) if p.stem != 'eval_termswap60'}}
    cache = judge_all(judge, sets, folder.parent / 'judgments.json')
    report = {}
    for name, rows in sets.items():
        rows = [{**r, 'evidence': r['evidence'][:K]} for r in rows]
        report[name] = {'all': score(rows, cache, False), 'early': score(rows, cache, True)}
        if args.sup_min:
            report[name][f'early_sup{args.sup_min}'] = score(rows, cache, True, args.sup_min)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    json.dump(report, open(folder.parent / 'safety.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
