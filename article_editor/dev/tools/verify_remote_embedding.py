"""원격 임베딩(/ai/embeddings)이 로컬 ONNX 벡터와 같은 공간인지 확인한다.

필요: .env 의 AI_BACKEND=remote, AI_BACKEND_URL, 로그인 세션(앱에서 로그인했거나 APP_TOKEN), 로컬 ONNX 모델 설치.
기준(로컬 ONNX)과 원격을 같은 문장으로 인코딩해 비교한다 — 문서·질문 역할 각각의 코사인 유사도(최소/평균)와
질문 하나당 문서 순위 상위 10 겹침. 통과 기준: 코사인 최소 0.99 이상, 상위 10 겹침 평균 0.95 이상.
사용: python dev/tools/verify_remote_embedding.py [문장 수=40]
"""
import os
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'app'))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from verify_embedding_onnx import corpus  # noqa: E402
from core.ai.factcheck import paths, retrieval  # noqa: E402
from core.ai.factcheck.onnx_embedding import OnnxQwenEncoder  # noqa: E402
from core.ai.factcheck.remote_embedding import RemoteQwenEncoder  # noqa: E402

count = int(sys.argv[1]) if len(sys.argv) > 1 else 40
texts = [t for t in corpus(count) if len(t) <= 1500][:count]
local = OnnxQwenEncoder(paths.EMBEDDING_DIR, retrieval.query_input)
remote = RemoteQwenEncoder(retrieval.TASK)  # 폴백 없이 — 서버 결과만 본다
assert local.available(), '로컬 ONNX 모델이 필요합니다(기준 벡터).'

report, ok = {}, True
for role in ('document', 'query'):
    t = time.time()
    a = local.encode(texts, role)
    t_local = time.time() - t
    t = time.time()
    b = remote.encode(texts, role)
    t_remote = time.time() - t
    cos = (a * b).sum(axis=1)
    report[role] = (float(cos.min()), float(cos.mean()), t_local, t_remote)
    ok &= cos.min() >= 0.99
    print(f'{role}: cosine min {cos.min():.5f} mean {cos.mean():.5f} | local {t_local:.1f}s remote {t_remote:.1f}s ({len(texts)} texts)')

docs_l, docs_r = local.encode(texts, 'document'), remote.encode(texts, 'document')
queries_l, queries_r = local.encode(texts[:20], 'query'), remote.encode(texts[:20], 'query')
overlap = [len(set(np.argsort(-(docs_l @ ql))[:10]) & set(np.argsort(-(docs_r @ qr))[:10])) / 10
           for ql, qr in zip(queries_l, queries_r)]
print(f'top-10 overlap mean {np.mean(overlap):.3f} min {np.min(overlap):.2f}')
ok &= np.mean(overlap) >= 0.95
print('PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
