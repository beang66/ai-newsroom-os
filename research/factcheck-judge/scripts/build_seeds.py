"""1단계: 실제 문서 → 앱과 같은 청킹·검색 → 사실 문장(seed)마다 정답 청크 + 검색 오답 청크.

이 PC(앱 코어 + C:\\TEST 문서가 있는 곳)에서 한 번 돌린다. 학습 PC 에서는 필요 없다.

    python research/factcheck-judge/scripts/build_seeds.py --docs C:/TEST/public_data --exclude <평가 문서 json>...

출력: data/seeds.jsonl (train·dev), data/sealed/seeds_test.jsonl (봉인 — 커밋하지 않음)
분할은 문서 단위(sha1(doc_id) 기준 80/10/10)라 같은 문서가 학습과 평가에 섞이지 않는다.
"""
import argparse
import glob
import hashlib
import json
import random
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / 'article_editor' / 'app'))

from core.ai.factcheck.chunker import chunk_document  # noqa: E402
from core.ai.factcheck.retrieval import rank_chunks  # noqa: E402
from core.ai.factcheck.semantic_chunker_v3 import clean, split_sentences  # noqa: E402

NUM = re.compile(r'\d')
SHINGLE = 20


def split_of(doc_id):
    h = int(hashlib.sha1(doc_id.encode()).hexdigest(), 16) % 10
    return 'test' if h == 0 else 'dev' if h == 1 else 'train'


def shingles(text):
    t = re.sub(r'\s+', '', text)
    return {t[i:i + SHINGLE] for i in range(0, max(1, len(t) - SHINGLE), 5)}


def load_docs(root, per_press, rng):
    docs = {}
    for f in sorted(glob.glob(f'{root}/disclosure/major_resumable/*.json')):
        d = json.load(open(f, encoding='utf-8'))
        docs[d['rcept_no']] = {'doc_id': d['rcept_no'], 'source': 'opendart', 'title': f"{d['corp_name']} {d['report_nm']}",
                               'date': d['date'], 'text': d['text'], 'meta': {'source': 'opendart', 'corp_name': d['corp_name'],
                                                                             'report_nm': d['report_nm'], 'date': d['date']}}
    for name in ('education_labeled', 'buyeo_unlabeled'):
        rows = [json.loads(line) for line in open(f'{root}/curated_press/{name}.jsonl', encoding='utf-8')]
        rows = [r for r in rows if 400 <= len(r['text']) <= 6000]
        for r in rng.sample(rows, min(per_press, len(rows))):
            docs[r['doc_id']] = {'doc_id': r['doc_id'], 'source': r['source'], 'title': r['title'], 'date': r['date'],
                                 'text': r['text'], 'meta': {'source': 'frontend', 'title': r['title'], 'date': r['date']}}
    return list(docs.values())


def fact_sentences(doc, chunks):
    """숫자가 든 문장(공시는 짧은 항목 단위)을 사실 후보로."""
    if doc['source'] == 'opendart':
        cands = [c['text'] for c in chunks if 15 <= len(c['text']) <= 200]
    else:
        cands = [s for s in split_sentences(doc['text']) if 25 <= len(s) <= 220]
    return [clean(s) for s in cands if NUM.search(s)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--docs', default='C:/TEST/public_data')
    ap.add_argument('--exclude', nargs='*', default=[], help='평가 문서 json(list of {title,text}) — 겹치면 제외')
    ap.add_argument('--per-press', type=int, default=220, help='보도자료 묶음별 표본 수')
    ap.add_argument('--per-doc', type=int, default=4)
    ap.add_argument('--k', type=int, default=5)
    args = ap.parse_args()
    rng = random.Random(20261003)

    banned = set()
    banned_titles = set()
    for f in args.exclude:
        for d in json.load(open(f, encoding='utf-8')):
            banned |= shingles(d['text'])
            banned_titles.add(re.sub(r'\s+', '', d.get('title', '')))
    docs = load_docs(args.docs, args.per_press, rng)
    kept = []
    for d in docs:
        sh = shingles(d['text'])
        if re.sub(r'\s+', '', d['title']) in banned_titles or len(sh & banned) > 0.1 * len(sh):
            continue
        kept.append(d)
    print(f'docs {len(docs)} → 평가 문서와 겹치는 {len(docs) - len(kept)}건 제외 → {len(kept)}', flush=True)

    out = {'train': [], 'dev': [], 'test': []}
    for n, d in enumerate(kept, 1):
        units = chunk_document(d['text'], d['meta'])
        chunks = [{'text': u.text, 'cid': i} for i, u in enumerate(units) if u.text.strip()]
        if len(chunks) < 2:
            continue
        facts = fact_sentences(d, chunks)
        rng.shuffle(facts)
        for s in facts[:args.per_doc]:
            key = re.sub(r'\s+', '', s)
            pos = [c for c in chunks if key in re.sub(r'\s+', '', c['text'])]
            if not pos:
                continue
            ranked = rank_chunks(s, chunks, limit=args.k)
            negs = [c['text'] for c in ranked if key not in re.sub(r'\s+', '', c['text'])]
            out[split_of(d['doc_id'])].append({
                'sid': hashlib.sha1((d['doc_id'] + s).encode()).hexdigest()[:12],
                'doc_id': d['doc_id'], 'source': d['source'], 'title': d['title'], 'date': d['date'],
                'sentence': s, 'pos': pos[0]['text'], 'negs': negs[:args.k - 1],
                'pos_rank': next((c['retrieval_rank'] for c in ranked if c['cid'] == pos[0]['cid']), None),
            })
        if n % 50 == 0:
            print(f'  {n}/{len(kept)} docs, seeds {sum(map(len, out.values()))}', flush=True)

    (HERE / 'data' / 'sealed').mkdir(parents=True, exist_ok=True)
    with open(HERE / 'data' / 'seeds.jsonl', 'w', encoding='utf-8') as f:
        for split in ('train', 'dev'):
            for r in out[split]:
                f.write(json.dumps({**r, 'split': split}, ensure_ascii=False) + '\n')
    with open(HERE / 'data' / 'sealed' / 'seeds_test.jsonl', 'w', encoding='utf-8') as f:
        for r in out['test']:
            f.write(json.dumps({**r, 'split': 'test'}, ensure_ascii=False) + '\n')
    print({k: len(v) for k, v in out.items()})


if __name__ == '__main__':
    main()
