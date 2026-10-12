> **2026-10-08 — 로컬 임베딩 잠정 폐기.** 임베딩은 이제 백엔드(`/ai/embeddings` → Cloudflare Workers AI `qwen3-embedding-0.6b`)로만 한다.
> 기본 런타임이 원격이고 로컬 폴백은 없다(오프라인이면 색인·팩트체크 불가, 색인은 `pending`으로 보류했다가 연결되면 다시 한다).
> 이 문서의 ONNX 인코더(`onnx_embedding.py`)와 변환·검증 도구는 개발·재검증용으로만 남기며 `FACTCHECK_EMBEDDING_RUNTIME=onnx`로 명시할 때만 쓴다.
> 모델 설치 목록(`models_manifest.json`)에서도 뺐다. 판정기·경계·제목·부제 모델은 계속 로컬이다.

# 임베딩 ONNX (2026-10-07)

상태: 코드 연결과 로컬 모델 설치 완료. 사용자 요청으로 추가 검증 중단, 전체 검증은 후속 작업.

## 실행 경로

- 기본 임베딩: `embedding-qwen3-0.6b-onnx`, ONNX Runtime CPU + tokenizers + NumPy.
- `retrieval.VectorCache`가 `create_encoder()`를 통해 `OnnxQwenEncoder`를 선택한다.
- `AIManager.factcheck_status()`와 `source_index._runtime_available()`도 동일한 런타임 의존성을 사용한다.
- torch/transformers가 없는 배포 환경에서 준비 상태를 막지 않는다.
- 개발 비교용으로 `FACTCHECK_EMBEDDING_RUNTIME=torch`를 설정하면 기존 `QwenEncoder`를 선택한다.
  기본 개발 체크포인트는 `models/embedding-qwen3-0.6b`이며 삭제하지 않는다.
- `ARCHIVE_EMBEDDING_MODEL_PATH`는 선택한 런타임의 모델 폴더를 지정하는 기존 재정의 값이다.
- 모델 namespace, query instruction, 마지막 토큰 pooling, 1024차원 float32 L2 정규화,
  `MODEL_ID`와 `vector_key`는 그대로다. 기존 암호화 임베딩 캐시를 무효화하지 않는다.

## 모델 파일과 배포

필수 파일은 `embedding.onnx`, `embedding.onnx.data`, `tokenizer.json`, `embedding.json`이다.
기본 설치 위치: `%LOCALAPPDATA%/AI Newsroom/models/embedding-qwen3-0.6b-onnx`.
이 PC에는 검증용 임시 폴더의 네 파일을 새 모델 폴더에 복사했다. 기존 모델과 vault는 변경하지 않았다.
FP32 모델 폴더 크기는 약 2.40 GB이다. 원본 BF16 checkpoint보다 모델 파일이 커지지만
앱 런타임에 torch/transformers를 포함할 필요가 없다.

`app/models_manifest.json`의 기존 torch 임베딩 항목을 ONNX 항목으로 교체했다.
모든 파일 크기와 SHA-256은 `dev/checks/make_model_manifest.py`로 생성했다.
2026-10-07 사용자 호스팅 완료: `base`는 `https://huggingface.co/Tig0w0/embedding-qwen3-0.6b-onnx/resolve/main`으로 연결되어 있다. 실제 다운로드 검증은 나중에 한다.
모델 파일은 Git에 넣지 않는다. EXE 재빌드는 별도 후속 작업이다.

## 입력 처리

- 문서는 원문, 질의는 기존 `Instruct: ...` / `Query:...` 형식을 사용한다.
- 최대 8192토큰, 오른쪽 절단, 왼쪽 패딩, 최대 배치 4.
- 한 배치에 2048토큰 초과 입력이 있으면 각 입력을 따로 실행해 긴 입력의 패딩 메모리를 줄인다.
- CPU 스레드는 기본 최대 4개. `FACTCHECK_EMBEDDING_THREADS`로 재정의할 수 있다.
- 불완전한 모델 파일, 호환되지 않는 metadata, 잘못된 출력 shape/값/정규화는 오류로 처리한다.

## 확인한 것과 남은 검증

사용자가 검증 중단을 요청하기 전에 확인한 결과:

- 짧은 문장 3개의 초기 비교: 코사인 약 1.0, 최대 절대 차이 약 3.13e-7.
- 테스트 자료에서 추출한 다양한 문서 44개: 최소 코사인 0.9999994048,
  최대 절대 차이 3.84e-7, 출력 `(44, 1024)` float32.
- 질의 역할 비교 도중 사용자가 테스트를 뒤로 미뤄 달라고 요청하여 해당 프로세스를 중단했다.

아직 완료하지 않은 것: 질의 벡터, exact 및 DenseFly/BM25 top-10 순위 일치,
8192토큰 실모델 추론, CPU 속도, int8/fp16 후보, 새 회귀 테스트,
torch import 차단 환경의 실제 추론, 새 EXE 실행.
FP32만 제품 기본으로 연결했으며 압축 후보를 승인하거나 성능 개선을 주장하지 않는다.

## 나중에 실행할 검증

`article_editor`에서 시스템 Python을 사용한다. 도구는 vault를 열지 않고 모델만 읽는다.

```powershell
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONDONTWRITEBYTECODE = '1'
$taskPython = 'C:/Users/504-03/AppData/Local/Programs/Python/Python313/python.exe'
& $taskPython dev/tools/verify_embedding_onnx.py --onnx "$env:LOCALAPPDATA/AI Newsroom/models/embedding-qwen3-0.6b-onnx" --json-out temp/embedding-onnx/verification-fp32.json --reference-fixture dev/tests/fixtures/embedding_reference.npz
& $taskPython -m unittest discover -s dev/tests -p 'test_onnx_embedding.py'
& $taskPython -m unittest discover -s dev/tests -p 'test_retrieval_label.py'
& $taskPython -m unittest discover -s dev/tests -p 'test_chunk_index.py'
& $taskPython -m unittest discover -s dev/tests -p 'test_embedding_cache.py'
```

수용 기준: document/query 각각 최소 코사인 >= 0.9999, 각 검색 방식의 top-10 순서 일치 >= 99%.
reference fixture는 verifier가 torch에서 한 번 생성한다. 이미 존재하면 이후 verifier 실행에서
`--reference-fixture`를 생략한다. 저장 reference 비교 테스트는 fixture가 없을 때 명시적으로 skip한다.
자료 색인은 `test_source_index.py`로 후속 확인한다. 기존 서버 업로드 테스트의 백그라운드 작업/임시 DB
정리 충돌은 이번 ONNX 연결 변경에서 해결하지 않았다.

## 변환 재현

```powershell
$env:PYTHONPATH = 'C:/ai-newsroom-os/appCoreTest/conv_deps'
& $taskPython dev/tools/convert_qwen_embedding_onnx.py --out temp/embedding-onnx-new
```

변환 도구에만 torch/transformers/onnx가 필요하다. 입력은 로컬 체크포인트이며 다운로드하지 않는다.
기존 출력 폴더를 덮어쓰지 않는다. 외부 가중치 통합 시 그래프가 참조하는 텐서 파일만 정리한다.
