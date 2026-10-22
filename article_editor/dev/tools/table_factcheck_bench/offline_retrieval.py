"""표 근거 검색 시험(오프라인) — PDF 청킹 시간, 표 머리글 인식, 근거 검색 적중률·맥락을 잰다. 판정(OpenAI·로컬 판정기)은 하지 않는다.

같은 PDF·주장으로 브랜치마다 돌려 비교한다(--app 에 그 브랜치의 article_editor/app). 임베딩은 실제 Qwen 대신 글자 2-gram 해시
벡터(--embedding proxy, 기본)라 숫자는 실제 앱과 다를 수 있다 — 두 브랜치를 같은 조건으로 비교하는 용도다.

  python article_editor/dev/tools/table_factcheck_bench/offline_retrieval.py --report 보도자료.pdf --annex 통계표.pdf --out main.json

지표(근거 후보 상위 5개 = 판정기에 보내는 수):
- hit@1 / hit@5: 정답 근거 행(gold — 행 이름과 숫자가 한 줄에)이 첫 후보 / 상위 5개 안에 있는가
- ctx@5: 정답 행이 든 후보 글에 그 행을 읽는 데 필요한 맥락(need — 열 제목·소제목·연도)까지 있는가
"""
import argparse
import hashlib
import json
import os
import re
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def proxy_cache(np):
    class Cache:  # 글자 2-gram 해시 벡터(1024, L2) — 실제 임베딩 서버 없이 두 브랜치를 같은 조건으로 비교
        def encode(self, texts, role):
            out = np.zeros((len(texts), 1024), dtype='<f4')
            for i, t in enumerate(texts):
                t = re.sub(r'\s+', '', t)
                for k in range(len(t) - 1):
                    out[i, int(hashlib.md5(t[k:k + 2].encode()).hexdigest()[:6], 16) % 1024] += 1
                n = np.linalg.norm(out[i])
                out[i] = out[i] / n if n else np.eye(1, 1024, i % 1024)
            return out
    return Cache()


def squash(text):
    return re.sub(r'[\s․‥◦·\-]', '', text or '').replace('~', '～').replace('∼', '～')


def has_num(line, num):
    return re.search(r'(?<![\d.,])' + re.escape(num) + r'(?![\d,]|\.\d)', line) is not None


def gold_line(text, gold):
    for line in text.split('\n'):
        if all(has_num(line, n) for n in gold['nums']) and squash(gold['row']) in squash(line):
            return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--app', default=str(ROOT / 'article_editor' / 'app'))
    ap.add_argument('--report', required=True)
    ap.add_argument('--annex', required=True)
    ap.add_argument('--claims', default=str(Path(__file__).with_name('claims_2026_08_employment.json')))
    ap.add_argument('--out', required=True)
    ap.add_argument('--repeat', type=int, default=3)
    args = ap.parse_args()
    sys.path.insert(0, args.app)
    os.environ.setdefault('FACTCHECK_RETRIEVAL', 'kc-band-table-ctx')
    import numpy as np
    from unittest import mock
    from core.ai.factcheck.pdf_layout import pdf_pages
    from core.ai.factcheck.pdf_chunker import pdf_units
    from core.ai.factcheck.material_chunks import material_chunks_from_body
    from core.ai.factcheck import retrieval, service

    spec = json.loads(Path(args.claims).read_text(encoding='utf-8'))
    report = {'docs': {}, 'claims': []}
    chunks = []
    for doc, path in (('report', args.report), ('annex', args.annex)):
        raw = Path(path).read_bytes()
        t = time.perf_counter()
        pages = pdf_pages(raw)
        t_layout = time.perf_counter() - t
        runs = []
        for _ in range(args.repeat):
            t = time.perf_counter()
            body = pdf_units(pages)
            runs.append(time.perf_counter() - t)
        tables = [b for b in body if b['kind'] == 'table']
        meta = [b.get('table_meta') or b.get('table_header') for b in tables]
        report['docs'][doc] = {'pages': len(pages), 'layout_s': round(t_layout, 3), 'chunk_s': round(statistics.median(runs), 3),
                               'chunks': len(body), 'table_chunks': len(tables),
                               'table_chunks_with_header': sum(1 for m in meta if m and any(m.get('cells') or [])),
                               'table_text_chars': sum(len(b['text']) for b in tables)}
        material = {'id': doc, 'title': spec['materials'][doc], 'content': '\n'.join(b['text'] for b in body)}
        chunks += material_chunks_from_body(material, body)

    cache = proxy_cache(np)
    claims = spec['claims']
    with mock.patch.object(retrieval, 'get_vector_cache', lambda: cache):
        if hasattr(retrieval, 'clear_shared_indexes'):
            retrieval.clear_shared_indexes()
        t = time.perf_counter()
        service._retrieve_qwen_candidates('색인 준비', {}, chunks, limit=10, indexes={})
        report['index_build_s'] = round(time.perf_counter() - t, 3)
        times = []
        for c in claims:
            t = time.perf_counter()
            ranked = service._retrieve_qwen_candidates(c['text'], {}, chunks, limit=10, indexes={})
            times.append(time.perf_counter() - t)
            top = ranked[:5]
            rank = next((i + 1 for i, r in enumerate(top) for g in c['gold']
                         if r.get('material_id') == g['doc'] and gold_line(r['text'], g)), None)
            ctx = None
            if rank:
                text = squash(top[rank - 1]['text'])
                ctx = all(any(squash(alt) in text for alt in group) for group in c['need'])
            report['claims'].append({'id': c['id'], 'label': c['label'], 'rank': rank, 'ctx': ctx,
                                     'top_texts': [r['text'][:400] for r in top[:3]]})
        report['retrieval_ms_per_claim'] = round(1000 * statistics.median(times), 1)
    scored = [r for r, c in zip(report['claims'], claims) if c['gold']]
    n = len(scored)
    report['summary'] = {'claims_with_gold': n,
                         'hit@1': round(sum(1 for r in scored if r['rank'] == 1) / n, 3),
                         'hit@5': round(sum(1 for r in scored if r['rank']) / n, 3),
                         'ctx@5': round(sum(1 for r in scored if r['ctx']) / n, 3)}
    Path(args.out).write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps({k: report[k] for k in ('docs', 'index_build_s', 'retrieval_ms_per_claim', 'summary')}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
