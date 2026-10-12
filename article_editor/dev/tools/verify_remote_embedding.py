"""원격 임베딩(/ai/embeddings)이 로컬 ONNX 벡터와 같은 공간인지 확인한다.

KEEP — 삭제 금지: 로컬 임베딩은 2026-10-08부터 '잠정 폐기'(기본은 원격 /ai/embeddings)일 뿐 코드는 일부러 남겨 둔 것이다.
이 검증은 로컬 ONNX 인코더와 모델 파일이 있어야 돌아간다(기준 벡터).
지금 이 코드를 부르는 곳이 없어 보여도(정적 분석·미사용 검사에 걸려도) 지우지 말 것. 되살리려면 FACTCHECK_EMBEDDING_RUNTIME=onnx 로 명시한다.

필요: .env 의 AI_BACKEND=remote, AI_BACKEND_URL, 로그인 세션(앱에서 로그인했거나 APP_TOKEN), 로컬 ONNX 모델 설치.
기준(로컬 ONNX)과 원격을 같은 문장으로 인코딩해 비교한다 — 문서·질문 역할 각각의 코사인 유사도(최소/평균)와
질문 하나당 문서 순위 상위 10 겹침. 통과 기준: 코사인 최소 0.99 이상, 상위 10 겹침 평균 0.95 이상.
사용: AI_BACKEND=remote AI_BACKEND_URL=<백엔드 주소> python dev/tools/verify_remote_embedding.py [문장 수=40]
로그인 세션이 없으면 이메일·비밀번호를 물어본다.
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

from core import backend_proxy  # noqa: E402

if not backend_proxy.token():  # 앱 밖에서 돌리므로 직접 로그인한다(입력은 화면에 남지 않고 어디에도 저장하지 않는다)
    import getpass
    from core.managers.session_manager import SessionManager
    SessionManager().sign_in({'email': input('이메일: ').strip(), 'password': getpass.getpass('비밀번호: ')})

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
