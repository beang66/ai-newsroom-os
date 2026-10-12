"""외부 공개 데이터로 실무에 가까운 평가 — 사람이 쓴(또는 실제 보도에서 나온) 주장. 평가 전용, 학습에 쓰지 않는다.

    python eval_external.py --onnx ../runs/q06b-v2-full/onnx --name q06b-v2-full
    python eval_external.py --v10 --name app-v10          # 지금 앱 판정기(PyTorch, 입력 192)

① policy: 정책브리핑 「사실은 이렇습니다」(data/external/korean-factcheck-dataset, 공공누리 1유형·CC BY 4.0)
   언론 보도 주장 ↔ 정부 해명. 해명자료마다 정부 입장 근거 문장을 모아 자료로 두고, 앱 검색 순서대로 판정.
   라벨은 데이터셋 저자가 LLM 으로 붙였고 20건만 사람이 검수 — 정답에도 오류가 있을 수 있다.
② klue: KLUE-NLI 검증(뉴스·정책·위키 1,350쌍, CC BY-SA 4.0). 문장 하나 ↔ 문장 하나.
조기 종료 + '일치' 최소 확신도(0 / 0.9) 로 정답·근거 없이 '일치'·외부 판정 수를 센다.
"""
import argparse
import json
import sys
import time
from pathlib import Path

from common import DATA, HERE, policy_side
from evaluate import aggregate
from safety_check import status

EXT = DATA / 'external'
GOLD = {'SUPPORTED': 'SUPPORTED', 'REFUTED': 'CONFLICT', 'NEI': 'NOT_ENOUGH_INFO'}
KLUE = {0: 'SUPPORTED', 1: 'NOT_ENOUGH_INFO', 2: 'CONFLICT'}
K = 5


def policy_rows(heldout_only=False):
    """해명자료마다 정부 입장 근거 문장 묶음 → 앱 검색(rank_chunks) 순서의 후보 목록."""
    sys.path.insert(0, str(HERE.parents[1] / 'article_editor' / 'app'))
    from core.ai.factcheck.retrieval import rank_chunks
    rows = []
    for line in open(EXT / 'korean-factcheck-dataset' / 'data' / 'dataset.jsonl', encoding='utf-8'):
        b = json.loads(line)
        if heldout_only and policy_side(b['briefing_id']) != 'heldout':
            continue  # v3 부터 나머지 절반은 학습에 쓴다(build_pairs.policy_pairs)
        pool = list(dict.fromkeys(c['evidence_sentence'].strip() for c in b['claims'] if c['evidence_sentence'].strip()))
        for c in b['claims']:
            ranked = [x['text'] for x in rank_chunks(c['claim_sentence'], [{'text': t} for t in pool], limit=K)] if pool else []
            rows.append({'id': c['claim_id'], 'claim': c['claim_sentence'], 'evidence': ranked,
                         'gold': GOLD[c['label']], 'type': c['claim_type']})
    return rows


def klue_rows():
    rows = []
    for line in open(EXT / 'klue-nli' / 'validation.jsonl', encoding='utf-8'):
        x = json.loads(line)
        if x['source'] in ('wikinews', 'policy', 'wikitree', 'wikipedia'):
            rows.append({'id': x['guid'], 'claim': x['hypothesis'], 'evidence': [x['premise']],
                         'gold': KLUE[x['label']], 'type': x['source']})
    return rows


def score(rows, cache, sup_min):
    out = {'n': len(rows), 'correct': 0, 'unsafe_false_supported': 0, 'escalated': 0, 'by_gold': {}}
    for r in rows:
        statuses = []
        for e in r['evidence']:
            statuses.append(status(*cache[(r['claim'], e)], sup_min))
            if statuses[-1] in ('SUPPORTED', 'CONFLICT'):
                break
        v = aggregate(statuses) if statuses else 'NOT_ENOUGH_INFO'  # 근거 후보가 없으면 근거 없음
        out['correct'] += v == r['gold']
        out['unsafe_false_supported'] += v == 'SUPPORTED' and r['gold'] != 'SUPPORTED'
        out['escalated'] += v == 'EXTERNAL'
        g = out['by_gold'].setdefault(r['gold'], {})
        g[v] = g.get(v, 0) + 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--onnx', help='export_onnx.py 출력 폴더')
    ap.add_argument('--v10', action='store_true', help='지금 앱 판정기(Qwen3-0.6B v10, PyTorch, 입력 192)')
    ap.add_argument('--name', required=True)
    args = ap.parse_args()
    if args.v10:
        from evaluate import load_model, predict
        sys.path.insert(0, str(HERE.parents[1] / 'article_editor' / 'app'))
        from core.config import MODELS_DIR  # 앱 모델 폴더(%LOCALAPPDATA%/AI Newsroom/models, 2026-10-06)
        models = MODELS_DIR / 'factcheck-qwen3-0.6b-v10'
        tok, model = load_model(str(models / 'base' / 'Qwen3-0.6B'), str(models / 'adapters' / 'v10-paraphrase'), False)
        judge = lambda c, e: predict(tok, model, [(c, e)], 192)[0]  # noqa: E731
    else:
        from transformers import AutoTokenizer
        from bench_judge import Judge
        j = Judge(Path(args.onnx) / 'model.onnx', AutoTokenizer.from_pretrained(args.onnx), 512)
        judge = lambda c, e: j(c, [e])[0]  # noqa: E731

    sets = {'policy': policy_rows(), 'policy_heldout': policy_rows(heldout_only=True), 'klue': klue_rows()}
    store = HERE / 'runs' / f'external_{args.name}.json'
    cache = {}
    if store.exists():
        cache = {tuple(k.split('\x1f')): tuple(v) for k, v in json.load(open(store, encoding='utf-8')).items()}
    todo = sorted({(r['claim'], e) for rows in sets.values() for r in rows for e in r['evidence']} - cache.keys())
    print({k: len(v) for k, v in sets.items()}, '새로 판정할 쌍', len(todo), flush=True)
    t0 = time.perf_counter()
    for i, (c, e) in enumerate(todo, 1):
        cache[(c, e)] = tuple(judge(c, e))
        if i % 200 == 0 or i == len(todo):
            el = time.perf_counter() - t0
            print(f'  {i}/{len(todo)}  {el / i:.2f}s/쌍  남은 약 {el / i * (len(todo) - i) / 60:.0f}분', flush=True)
            json.dump({'\x1f'.join(k): v for k, v in cache.items()}, open(store, 'w', encoding='utf-8'), ensure_ascii=False)

    report = {name: {f'sup{t}': score(rows, cache, t) for t in (0.0, 0.9)} for name, rows in sets.items()}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    json.dump(report, open(HERE / 'runs' / f'external_{args.name}_report.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
