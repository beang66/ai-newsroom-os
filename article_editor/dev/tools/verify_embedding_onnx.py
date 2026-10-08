"""Compare local torch and ONNX embeddings, real retrieval ranks and CPU timing.

KEEP — 삭제 금지: 로컬 임베딩은 2026-10-08부터 '잠정 폐기'(기본은 원격 /ai/embeddings)일 뿐 코드는 일부러 남겨 둔 것이다.
용도: 로컬 ONNX 임베딩의 torch 대비 동일성·순위·속도 검증.
지금 이 코드를 부르는 곳이 없어 보여도(정적 분석·미사용 검사에 걸려도) 지우지 말 것. 되살리려면 FACTCHECK_EMBEDDING_RUNTIME=onnx 로 명시한다.

No vault or network access. Results can be saved as JSON; short torch reference
vectors can be written once for guarded runtime-only regression tests.
"""
import argparse
import ast
import json
import os
import re
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'app'))
os.environ.setdefault('AI_NEWSROOM_SKIP_DOTENV', '1')

from core.ai.factcheck import paths, retrieval  # noqa: E402
from core.ai.factcheck.onnx_embedding import OnnxQwenEncoder  # noqa: E402

EXTREMES = ['네.',
    '2026년 10월 7일 기준금리는 연 3.50%에서 3.25%로 0.25%포인트 내렸다. 물가는 2.1% 올랐다.',
    'The committee voted 7-2; 한국어와 English가 섞인 문장 123,456원.',
    '가' * 1500]


def corpus(count):
    texts = list(EXTREMES)
    preferred = ['test_factcheck.py', 'test_spans.py', 'test_subtitle_fact_rewrite.py',
                 'test_subtitle_readability.py', 'test_subtitle_style.py', 'test_summary_records.py']
    names = preferred + [p.name for p in sorted((ROOT / 'dev/tests').glob('test_*.py')) if p.name not in preferred]
    for name in names:
        tree = ast.parse((ROOT / 'dev/tests' / name).read_text(encoding='utf-8'))
        docstrings = {ast.get_docstring(node) for node in ast.walk(tree)
                      if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef))}
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and node.value not in docstrings:
                text = re.sub(r'\s+', ' ', node.value).strip()
                if 25 <= len(text) <= 600 and re.search(r'[가-힣]{4}', text) and text not in texts:
                    texts.append(text)
    if len(texts) < count:
        raise ValueError(f'Only {len(texts)} unique fixture texts; requested {count}')
    return texts[:count]


class MemoryCache:
    """rank_chunks adapter over already measured vectors; never opens a vault."""
    def __init__(self, texts, docs, queries, query_vectors):
        self.values = {'document': dict(zip(texts, docs)), 'query': dict(zip(queries, query_vectors))}

    def encode(self, texts, role):
        return np.stack([self.values[role][text] for text in texts])


def metrics(a, b):
    if a.shape != b.shape or a.dtype != np.float32 or b.dtype != np.float32:
        raise ValueError('Embedding shape/dtype mismatch')
    return {'min_cosine': float(np.min(np.sum(a.astype(np.float64) * b, axis=1))),
            'max_abs_difference': float(np.max(np.abs(a - b))), 'shape': list(a.shape)}


def speed(encoder, sample, batch):
    values = sample[:batch]
    started = time.perf_counter()
    encoder.encode(values, 'document')
    seconds = time.perf_counter() - started
    return {'texts': len(values), 'seconds': seconds, 'texts_per_second': len(values) / seconds}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--onnx', type=Path, default=ROOT / 'temp/embedding-onnx/embedding-qwen3-0.6b-onnx')
    parser.add_argument('--torch', type=Path, default=paths.TORCH_EMBEDDING_DIR)
    parser.add_argument('--texts', type=int, default=44)
    parser.add_argument('--skip-long-context', action='store_true')
    parser.add_argument('--json-out', type=Path)
    parser.add_argument('--reference-fixture', type=Path)
    args = parser.parse_args()
    if args.texts < 40:
        parser.error('Use at least 40 texts')
    import torch
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    texts = corpus(args.texts)
    reference = retrieval.QwenEncoder(args.torch)
    candidate = OnnxQwenEncoder(args.onnx, retrieval.query_input)
    if not candidate.available():
        raise ValueError(f'ONNX model/runtime unavailable: {args.onnx}')
    result = {'model_id': retrieval.MODEL_ID, 'onnx': str(args.onnx), 'text_count': len(texts),
              'roles': {}, 'rankings': {}, 'speed': {}, 'threads': min(4, os.cpu_count() or 1)}
    vectors = {}
    passed = True
    for role in ('document', 'query'):
        print(f'Encoding {len(texts)} {role} texts...', flush=True)
        a, b = reference.encode(texts, role), candidate.encode(texts, role)
        measured = metrics(a, b)
        result['roles'][role] = measured
        vectors[role] = (a, b)
        print(role, measured, flush=True)
        passed &= measured['min_cosine'] >= 0.9999
    query_indices = [i for i, text in enumerate(texts) if 25 <= len(text) <= 300][:25]
    queries = [texts[i] for i in query_indices]
    chunks = [{'text': text, 'material_id': str(i)} for i, text in enumerate(texts)]
    original_mode = os.environ.get('FACTCHECK_RETRIEVAL')
    try:
        for mode in ('exact', 'densefly-bm25-rrf'):
            os.environ['FACTCHECK_RETRIEVAL'] = mode
            orders = []
            for runtime in (0, 1):
                cache = MemoryCache(texts, vectors['document'][runtime], queries,
                                    vectors['query'][runtime][query_indices])
                index = retrieval.ChunkIndex(chunks, cache)
                orders.append([[row['material_id'] for row in retrieval.rank_chunks(
                    query, chunks, cache=cache, index=index, limit=10)] for query in queries])
            same = sum(a == b for a, b in zip(*orders))
            result['rankings'][mode] = {'identical': same, 'queries': len(queries),
                'agreement': same / len(queries)}
            print(mode, result['rankings'][mode], flush=True)
            passed &= same / len(queries) >= 0.99
    finally:
        if original_mode is None:
            os.environ.pop('FACTCHECK_RETRIEVAL', None)
        else:
            os.environ['FACTCHECK_RETRIEVAL'] = original_mode
    sample = [text for text in texts if len(text) < 700]
    for batch in (8, 32):
        result['speed'][str(batch)] = {name: speed(encoder, sample, batch)
            for name, encoder in [('torch', reference), ('onnx', candidate)]}
        print('speed', batch, result['speed'][str(batch)], flush=True)
    if not args.skip_long_context:
        long_text = '물류창고 등록 시 화재안전계획서를 지방자치단체에 제출해야 한다. ' * 450
        # Tokenizer parity at the actual 8192-token limit, not character length.
        for role in ('document', 'query'):
            prepared = retrieval.query_input(long_text) if role == 'query' else long_text
            tokens_t = reference.tokenizer(prepared, truncation=True, max_length=8192)['input_ids']
            tokens_o = candidate.tokenizer.encode(prepared).ids
            if tokens_t != tokens_o or len(tokens_o) != 8192:
                raise ValueError('8192-token truncation mismatch')
            print(f'Encoding {role} long context (8192 tokens)...', flush=True)
            started = time.perf_counter()
            measured = metrics(reference.encode([long_text], role), candidate.encode([long_text], role))
            measured.update(tokens=8192, seconds=time.perf_counter() - started)
            result['roles']['long_' + role] = measured
            print('long_' + role, measured, flush=True)
            passed &= measured['min_cosine'] >= 0.9999
    result['files'] = {p.name: p.stat().st_size for p in args.onnx.iterdir() if p.is_file()}
    result['bytes'] = sum(result['files'].values())
    try:
        import psutil
        result['peak_rss_bytes'] = psutil.Process().memory_info().peak_wset
    except (ImportError, AttributeError):
        pass
    result['passed'] = bool(passed)
    if args.reference_fixture:
        if args.reference_fixture.exists():
            raise FileExistsError('Reference fixture already exists; do not overwrite measured references')
        indices = [0, 1, 2]
        args.reference_fixture.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(args.reference_fixture, model_id=np.asarray(retrieval.MODEL_ID),
            texts=np.asarray([texts[i] for i in indices]),
            document=vectors['document'][0][indices], query=vectors['query'][0][indices])
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('RESULT:', 'PASS' if passed else 'FAIL', flush=True)
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main())
