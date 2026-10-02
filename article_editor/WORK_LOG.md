# 작업 기록 (GPT ↔ Claude 인수인계)

GPT(Codex)로 작업하다 토큰 한도로 2026-09-30부터 Claude로 이어서 작업한다.
다른 AI가 이어받을 때 이 파일을 먼저 읽고, 작업할 때마다 아래 "작업 이력"에 한 줄 이상 추가한다.

## 작업 규칙

- 예상과 다른 수정·추가 작업이 생기면 바로 멈추고 사용자에게 보고한 뒤, 진행 방법을 설명하고 사용자가 정하면 진행한다.
- 결과는 VS Code가 아니라 채팅창(내장 브라우저 미리보기, 스크린샷)으로 바로 보여준다.

## 현재 상태 (2026-09-30 기준)

- 실행: `python server.py` → http://127.0.0.1:8765 (`.env`의 OpenAI 키 사용)
  - 실제로 쓰던 파이썬: `C:\Users\504-05\miniconda3\envs\fastapi_env\python.exe` (torch 2.14 CPU, transformers 4.46.3 설치됨)
  - `.venv-headline`도 torch·transformers가 설치돼 있음(GPT가 만든 가상환경)
  - 모델 캐시: `~/.cache/huggingface/hub`에 KeT5, KoBART 모두 내려받아져 있음
- 제목·부제 생성 구조: `HUGGINGFACE_HEADLINE_GUIDE.md` 참고
  - OpenAI 핵심 각도 → KeT5 제목 초안 10개 → KoBART 부제 초안 → OpenAI 편집 데스크 교열 → 제목 3개 + 부제 1~3줄
  - 관련 코드: `server.py`의 `metadata_assist()` (요청 `kind: 'metadata'`)
- 마지막 코드 수정: `server.py` 2026-09-30 17:20 (GPT), `index.html` 15:47 (GPT)
- 권장 작업 순서 문서: `C:\고서연\0928\기사_자동화_프론트_기능_개선안.docx`
  - 완료/대부분 완료: 1(작성 화면 단순화), 2(자동 제목·부제), 5 일부(동아일보·네이버 미리보기, 사진 설명)
  - 미구현: 3(자료 찾기·인터뷰 STT), 4(팩트체크 서랍), 6(보관함·발행 이력), 7(카드뉴스·영상), 8(CMS 연동)
  - A조 작업지시서 필수 기능 중 대화형 프롬프트(챗), 로우데이터 정리, 피드백 재생성 루프는 아직 화면에 없음

## 진행 중인 작업

제목·부제가 기사에 맞게 생성되는지 확인하는 중. 테스트 기사: 김포 실종 80대 치매 노인, 인천공항고속도로 7㎞ 역주행 정면충돌(3명 경상).

## 작업 이력

| 날짜 시각 | 작업자 | 내용 | 수정 파일 |
|---|---|---|---|
| 2026-09-30 ~17:20 | GPT | KeT5+KoBART+OpenAI 제목·부제 생성 구현, 테스트 기록 작성 | server.py, index.html, model_tests/, HUGGINGFACE_HEADLINE_GUIDE.md |
| 2026-09-30 | Claude | 프로젝트 현황 파악, 이 기록 파일 작성 (코드 수정 없음) | WORK_LOG.md |
| 2026-09-30 | Claude | 확인: 8765 포트에 server.py가 3개 동시에 실행 중(16:31, 17:16, 17:20 시작). 오래된 서버가 요청을 받으면 최신 코드가 반영되지 않을 수 있음 → 사용자에게 보고 | - |
| 2026-09-30 17:59 | Claude | 사용자 승인 후 기존 서버 3개 종료, 최신 server.py로 서버 1개만 재시작(fastapi_env 파이썬). Claude 앱 미리보기 도구는 K-Color 폴더 설정을 읽어서 사용 불가 → 서버를 직접 켜고 내장 브라우저로 http://127.0.0.1:8765 접속 | .claude/launch.json(서버 실행 설정만 추가) |
| 2026-09-30 18:01 | Claude | 역주행 기사로 제목·부제 생성 테스트 (코드 수정 없음). 결과와 판단은 아래 "테스트 결과" 참고 | - |

| 2026-09-30 18:20 | Claude | (사용자 승인 A) 제목 역할을 정석형·행위·결과형·수치·충격형 기준으로 변경, 역할명 "수치 강조형"→"수치·충격형", 부제 사실 선택을 "핵심 보충(경위·원인·결과) 우선, 후속 절차 후순위"로 변경. 변경 전 파일은 Claude 스크래치패드에 백업 | server.py(review_instructions 역할 3줄, angle_instructions subtitle_facts 문장), index.html(역할명), HUGGINGFACE_HEADLINE_GUIDE.md |
| 2026-09-30 18:30 | Claude | ⚠️ 변경 후 역주행 기사 3회 모두 "원문 근거와 일치하는 부제를 완성하지 못했어요" 오류. 원인: 부제 사실이 핵심 사건 쪽으로 옮겨가며 여러 문장 정보(치매·역주행·3명)를 섞게 됐고, 마지막 안전 필터가 근거 문장에 없는 단어를 가진 부제를 모두 탈락시킴. 추가 발견: 최종 교열 단계 제목 최대 46자 제한 때문에 제목이 "정면충", "3"처럼 잘림 → 사용자에게 보고, 결정 대기 | - |
| 2026-10-02 | Claude | 팩트체크·의미 청킹 이식(archive-os.v2 backend → app/core/ai/factcheck): AIManager.factcheck_status/run·semantic_parse, API `GET /api/factcheck/status`·`POST /api/factcheck/run`·`POST /api/semantic/parse`, core-api.js 메서드, 매니페스트에 임베딩·경계 모델 추가 후 3개 모델 설치(models/, 해시 검증), dev/tests/test_factcheck.py(5개, 전체 41개 통과). ⚠️ transformers 충돌: headline ==4.46.2 vs Qwen3 >=4.51 → 결정 대기 | app/core/ai/factcheck/*, app/core/managers/ai_manager.py, app/core/api.py, app/frontend/src/api/core-api.js, app/models_manifest.json, requirements-factcheck.txt, dev/tests/test_factcheck.py, ARCHITECTURE.md |
| 2026-10-02 | Claude | (1) transformers 충돌 해결: 제목 KeT5·부제 KoBART 를 ONNX 로 변환(dev/tools/convert_seq2seq_onnx.py), 빔서치는 HF 4.46.2 로직 이식(app/core/ai/onnx_seq2seq.py). 원본과 기사 30건 후보 30/30 동일(제목 1.50→0.48s, 부제 3.36→3.34s), transformers 5.17 앱 환경에서도 동일. local_models.py 는 변환본이 있으면 ONNX, 없으면 기존 경로. 공개 모델 기준 — 학습본이 생기면 같은 도구로 재변환. (2) 근거 검색을 버섯체 최적안(DenseFly 시드101·307 + BM25 RRF, benchmark_densefly_bm25_fusion_v1.py)으로 교체(app/core/ai/factcheck/fusion.py, FACTCHECK_RETRIEVAL=exact 로 이전 방식), 연구 순위 30/30 재현 테스트. 매니페스트에 ONNX 2종 추가. 전체 44개 테스트 통과 | app/core/ai/onnx_seq2seq.py, app/core/ai/local_models.py, app/core/ai/factcheck/fusion.py, app/core/ai/factcheck/retrieval.py, app/models_manifest.json, dev/tools/convert_seq2seq_onnx.py, dev/tests/test_local_models_onnx.py, dev/tests/test_factcheck.py, dev/tests/fixtures/seq2seq_reference.json, requirements-*.txt |
| 2026-10-02 | Claude | 정리(ponytail-audit 2·3·7): factcheck 이식분에서 안 쓰는 코드 삭제 — semantic_chunker_v3 의 meeting/narrative/structured/chunk_document 등(467→262줄, packed_units 경로만 유지), semantic_provider 의 Remote·Disabled provider·Protocol·모듈 전역(330→165줄, httpx 불필요), boundary_model.decide·데모(54→31줄), chunker.py 미사용 import. pyflakes 깨끗, 44개 테스트 통과. 원본은 archive-os.v2 research/backend 에 그대로 있음 | app/core/ai/factcheck/semantic_chunker_v3.py, semantic_provider.py, boundary_model.py, chunker.py |
| 2026-10-02 | Claude | 정리(ponytail-audit 4·8·9·10·12): 구현 없는 매니저 5개(Project·Collaboration·Sync·Encryption·Update) 삭제 — 구현할 때 추가, create_core 는 하위 모듈에서 직접 import. factcheck 의 retrieval.capabilities·EXPANDED_K·observability.log_path 삭제, 공백 정리 함수 4벌→semantic_chunker_v3.clean 하나, StorageManager.root 삭제, 부제 ONNX 가 중복 제거까지 반환. 보류: server.py(브라우저 테스트·시작하기.md 가 사용), supabase.upsert(BACKEND_SCOPE 예정 기능), storage.py 병합(테스트·보안 문서 참조). 44개 테스트·launcher --check 통과. ⚠️ 발견: ai/router.py 에 TEXT_MODEL·output_text 미정의(pyflakes) → 보고 | app/core/managers/*, app/core/create_core.py, app/core/ai/factcheck/{retrieval,observability,assertion,service,chunker}.py, app/core/ai/onnx_seq2seq.py, app/core/ai/local_models.py |
| 2026-10-02 | Claude | 새 UI 정리: origin/main(프론트 담당 sohyeon1628) 최신 a6b691d(플랫폼 변환 개편·디자인 통일) 5개 파일을 web/src 에 반영 → npm run build 로 app/frontend 갱신(이식 변경 api/·코어 상태 표시·CDN 제거는 유지). 레거시 UI 삭제: app/frontend-legacy/(git a5e9c94 의 app/frontend 와 동일, 복원 가능), 레거시 전용 테스트 component·geometry·browser·drag-responsive.mjs + fixtures/donga-layout-reference.css, package.json 의 test:legacy-ui·test:browser·test:drag-responsive 스크립트와 이를 위한 jsdom·playwright·react peer 의존성, .gitignore 항목. 문서(ARCHITECTURE·packaging/README·WEB_TO_LOCAL_PORT) 갱신. 검증: api-boundary PASS, 44개 테스트, launcher --check, 브라우저로 새 UI·플랫폼 변환 화면·"코어 연결됨" 확인(콘솔 오류 없음) | web/src/components/{ArticleWriter,FactCheckDrawer,FormatConverter,ProcessBar,Sidebar}.jsx, app/frontend/*, dev/tests/*.mjs, package.json, .gitignore, docs |
| 2026-10-02 | Claude | 새 UI 화면 스모크 테스트: dev/tests/ui-smoke.mjs + `npm run test:ui`(playwright devDependency 재추가, 브라우저는 기본 설치 Edge — 다운로드 없음). 실제 코어(app/server.py)를 띄워 코어 연결됨·작성·팩트체크 서랍·취재자료 검색 창·플랫폼 변환·보관함·녹취 스튜디오·모바일 폭을 확인하고 콘솔/페이지 오류·/api 5xx 를 실패로 처리. 통과 확인 + 빌드 JS 제거 시 실패 확인(실패 화면 temp/ui-smoke-failure.png) | dev/tests/ui-smoke.mjs, package.json, ARCHITECTURE.md, docs/WEB_TO_LOCAL_PORT.md |
| 2026-10-02 | Claude | 감사 5번: 제목·부제의 transformers/torch 대체 경로 삭제 — local_models.py 는 ONNX 전용(96→61줄), 미설치 시 503 "로컬 제목/부제 모델이 설치되지 않았어요". requirements-headline.txt 를 실행용(onnxruntime·tokenizers·numpy)으로 바꾸고 4.46.2 고정은 변환 도구 머리말로. 문서(packaging/README·HUGGINGFACE_HEADLINE_GUIDE·시작하기·LOCAL_MODELS·DESKTOP_SHELL) 갱신, 미설치 503 테스트 추가(45개). 남은 결정: packaging spec 이 tokenizers·numpy 를 제외 → 배포본에서 로컬 제목·부제를 쓰려면 포함 필요 | app/core/ai/local_models.py, requirements-headline.txt, dev/tests/test_local_models_onnx.py, docs |
| 2026-10-02 | Claude | 옛 시험용 UI(제목생성 기능 담당자 제작) 기능을 새 UI 에 연결: 제목 "다시 생성"(목업 무작위 → 코어 추천 후보 3개), 부제 "AI 추천", 사진 창 Unsplash 찾기(기사 기반 검색어·3장씩·원본 가져오기), 본문 "흐름 요약" 창, 자동 저장(1.5초, 툴바 상태 표시). 새 파일 web/src/api/editorial.js(응답 모양 흡수)·web/src/components/EditorialAssist.jsx, ArticleWriter.jsx 는 배치 몇 줄만(main 동기화 충돌 최소화). ui-smoke 에 가짜 백엔드 추가 — 키·인터넷 없이 추천·요약·검색·저장까지 검사, 테스트 원고 파일은 자동 삭제. 실제 Unsplash 검색·가져오기 화면 확인. 미이식: 사진 편집기(자르기·모자이크·붓, 코어 호출 없는 화면 기능) | web/src/api/editorial.js, web/src/components/{EditorialAssist,ArticleWriter}.jsx, app/frontend/*, dev/tests/ui-smoke.mjs, docs/WEB_TO_LOCAL_PORT.md |
| 2026-10-02 | Claude | 새 UI 기본 목업 제거: mockData.js 삭제 → data/article.js `createEmptyArticle()`(빈 원고). 제목·본문·사진·팩트체크 이슈·근거/업로드 목록·취재자료·녹취 전사·플랫폼 변환 초안/해시태그·보관함 이력 모두 빈 상태에서 시작. 플랫폼 변환·보관함은 현재 기사(article prop)를 쓴다. 가짜 초안 생성·가짜 근거 추출·"테스트 샘플 추가" 제거(초안 생성은 "코어 미연결" 안내). 렌더되지 않던 목업 컴포넌트 삭제: InterviewAudio, PublishPrep, Navigation, PreInterviewModal. ui-smoke 는 빈 시작을 확인한 뒤 본문을 입력하고 진행 — 통과 |
| 2026-10-02 | Claude | 정리: 예전 exe 시험 산출물 build/·dist/ 삭제(56MB, gitignore 대상). 코드·문서의 옛 경로 `app/frontend/src/api` → `web/src/api` 정정(api/*.js 주석, README, desktop/shell.py, DESKTOP_SHELL, IPC_MIGRATION, ARCHITECTURE) |
| 2026-10-02 | Claude | 녹취 STT 코어 이식: 브라우저가 키를 들고 Groq/OpenAI 를 직접 부르던 utils/transcribe.js 를 core/ai/transcribe.py + `POST /api/interview/transcribe` 로 옮김(whisper-1, 25MB 한도, 문장 합치기·질문/침묵 기준 화자 교대 규칙 이식). providers/backend_proxy 가 bytes(multipart) 본문도 보내도록 확장. 백엔드 server.py·express/ai-proxy.ts 에 `/ai/audio/transcriptions`(multipart 그대로 중계) 추가 + 테스트. 녹음 파일 화면 업로드 → 전사 → 화자별 대화. 쓰이지 않던 옛 녹취 컴포넌트 7개·interviewStudio.css(3.5천 줄)·transcribe.js 삭제. 시험: dev/tests/test_transcribe.py, backend/test_server.py, ui-smoke 녹취 전사 단계 |
| 2026-10-02 | Claude | 팩트체크 서랍 ↔ 코어 factcheckRun 연결: 텍스트 자료(TXT·MD·CSV·JSON·HTML) 업로드 → 본문 문장(최대 200) 판정 → 카드(일치/불일치/근거 부족/검토 필요, 신뢰도, 출처, 발췌, 사유). 다시 검증 버튼, 미설치(503) 안내. PDF·HWP·DOCX 추출은 미구현. ui-smoke: 미설치면 안내, 설치면 카드 확인. 주의: 시스템 python 에 peft·onnxruntime 이 없어 start_windows.bat 실행 시 팩트체크·ONNX 제목/부제가 503 — requirements-factcheck/headline 설치 필요 |
| 2026-10-03 | Claude | 판정기 연구 공간 신설: 저장소 루트 `research/factcheck-judge/`(앱 밖, runs/·봉인 test 는 gitignore). 실제 문서(OpenDART 80 + 보도자료 440, 평가 문서 7건 제외) → 앱 청커·검색으로 seed 1455 → (주장, 청크 1개) 학습쌍 train 5188 / dev 873. 기준선: 긴 문서 29건에서 앱 0.6B v10 9/29(입력 512로 늘려도 10/29), qwen3:4b-instruct 무학습 22/29, Claude 26/29. 4060 Ti 8GB 학습 스크립트(Qwen3-1.7B LoRA / 4B QLoRA)·평가 스크립트 포함 |

## 테스트 결과

### 2026-09-30 역주행 기사 (분류: 사회, 첫 요청 약 40초)

- 핵심 각도: 80대 치매 노인의 인천공항고속도로 역주행 및 사고
- 제목 후보
  1. 정석형: 80대 치매 노인, 인천공항고속도로 7㎞ 역주행 후 정면 충돌
  2. 행위·결과형: 80대 치매 환자, 인천공항고속도로서 역주행 중 정면 충돌 사고
  3. 수치 강조형: 인천공항고속도로에서 7㎞ 역주행한 80대 노인, 차량과 정면 충돌
- 부제 (2줄)
  1. 경기 김포경찰서, 사고 10분 전 80대 실종 신고 접수
  2. 경찰, 신병 확보한 80대 사고 경위 조사 후 입건 여부 결정 예정
- 판단
  - 좋음: 사실 오류 없음. 1번 제목은 바로 써도 될 수준. 부제 1은 제목에 없는 실종신고 사실을 잘 보충함.
  - 문제 1: 제목 3개 모두 이 기사만의 새 사실인 "실종신고 직후"를 빠뜨림(각도 설명에는 있음).
  - 문제 2: 세 후보가 같은 핵심어(80대·인천공항고속도로·역주행·정면 충돌)를 반복해 선택지 차이가 작음.
  - 문제 3: 부제 2는 후속 절차라 정보 가치가 낮음. 요금소 앞 유턴, 음주·무면허 아님 같은 경위가 더 적합.
  - 사용자 피드백: 핵심은 "실종신고된 80대 노인이 7㎞ 역주행"이며 부제는 이 핵심을 보충해야 함. 제목 역할 기준은 정석형(가장 중요한 사실 바로 전달)·행위·결과형(무엇을 하면 어떤 처분/결과)·수치·충격형(눈에 띄는 수치 강조).
  - 원인 분석(Claude): server.py 지시문과 후처리 정규식이 TOPIK 기사·역주행 기사 예시에 맞춰 누적 수정돼 있음(과적합). 부제 사실 선택 지시가 "제목과 같은 내용 제외"라서 핵심 보충보다 주변 사실을 고르고, 부제는 원문 한 문장만 근거로 쓰게 강제됨.
  - 표기: 정면충돌은 한 단어(표준국어대사전). 행위·결과형의 "충돌 사고"는 중복. "치매"는 원문상 "알려졌다" 수준이라 단정 표현 주의.

### 2026-10-01 Codex — v2 독립 컴포넌트 개편

- 최신 업로드 ZIP의 소스만 별도 v2 폴더에서 개편. 기존 파일·키·모델 패키지는 변경하거나 복사하지 않음.
- 기능 Web Component + Shadow DOM, 편집 테마 CSS, 동아일보 iframe CSS/폰트 분리. React 래퍼와 article-change 원고 전달 추가.
- 제목/부제 연관검색 형태 추천 및 입력 멈춤 3.5초 처리, 선택 문구 보존, 늦은 응답 제외. 기술 설명 UI 제거.
- 동아일보만 같은 화면에서 읽기 전용 미리보기. 최근 코드 교정값 제목676/34, 본문684/18, 본문 줄높이32.4 유지. 작은 화면은 전체 스케일만 조정.
- AI 이미지 생성 UI 대신 Pexels 검색어 추천·검색·원본 가져오기, 별도 비율/범위/모자이크 편집 화면, 원본/편집본 보관·다운로드.
- OpenAI 단독 추천을 기본값으로 추가. 이전 KeT5/KoBART 파이프라인은 USE_LOCAL_MODELS=true로 선택 가능하며 제거하지 않음.
- 자동 저장·사진 설명 3개·출처·흐름 팝업·서식·드래그 재사용 및 이동 유지. 사진 인스턴스 ID로 중복 삽입/이동 분리.
- 검증: Python 서버 테스트10개, 자르기 계산50케이스, jsdom 컴포넌트 검증, Chromium 실제 로컬 실행 및 화면 캡처. 미리보기 전환 직후 blur 오류 수정. 실제 OpenAI/Pexels 인증 호출 및 실시간 동아일보 페이지 픽셀 대조는 미실시.
- 실행/팀 CSS·React·백엔드 통합 방법은 README.md, 검증 결과는 TEST_REPORT.md 참고.

### 2026-10-01 실행 경로 개선
- 사용자가 이전 디자인을 보고 있다고 전달하여 배포 ZIP의 index.html과 소스 목록 재확인. 새 편집기 코드 포함 확인. 사용자 화면의 실제 원인은 확인하지 못했음.
- start_windows.bat / launcher.py 추가: 이 폴더의 서버만 실행하고 8877~8899 빈 포트 선택, 새 index 확인 후 브라우저 자동 열기. 기존 8765 서버와 혼동 방지. PNG와 실행 화면 구분 안내 추가.
- python launcher.py --check로 새 편집기 시작 경로 확인.

### 2026-10-01 v3 — 확인·저장·Unsplash·사진 편집 단순화
- v2를 별도 v3 폴더에 복사해 수정. 사용자 요청 안내 문구, 제목/부제 체크 확정·재생성, 클릭 전용/바깥 클릭 닫힘 추천창. 확정 상태는 임시/파일 저장에 유지하며 추천창이 다른 칸을 덮지 않게 문서 흐름에서 펼침.
- 저장하기 → 로컬 백엔드 local_data/articles JSON 저장 API. IndexedDB 자동 저장은 '임시 저장'으로 구분. 로그인·회원·인스타그램은 새로 구현하지 않음.
- Pexels 연동 대신 Unsplash Access Key, 검색 결과3장, API hotlink 원본/썸네일 및 사진가 크레딧·다운로드 추적. 사진 넣기 메뉴는 검색/첨부 두 가지.
- 사진 설명 추천 제거. 비율 선택·모서리 조절·모자이크 생성/이동/크기/선택 삭제. 확대 레버와 범위 이동 버튼 제거.
- 흐름 팝업은 짧은 핵심문장3~5개. OpenAI 기본, KoBART 요약초안+OpenAI 정리 선택 경로 추가.
- Python14개, 영역계산54케이스, 컴포넌트검사, Chromium실행검사 통과. 개인 API 키와 실모델 가중치는 사용하지 않음.

## 2026-10-01 v4
AI 로봇 아이콘, 확정된 제목·부제 입력 잠금과 명시적 해제, 요약 보기 중앙 모달, 사진 검색 중앙 모달, 배경 클릭/Esc 종료와 포커스 관리, 동아일보 분야 청록색, Unsplash 세 가지 설정값 설명을 반영했습니다. 기존 Shadow DOM 테마 분리와 미리보기 본문 설정을 유지했습니다.

## 2026-10-01 v5
사각형 모자이크 추가 대신 크기 조절 가능한 브러시와 획 되돌리기를 구현했습니다. 원본 좌표의 획을 저장하고 편집 화면 및 내보내기에 동일한 렌더러를 사용합니다. 기존 사각형 모자이크는 호환됩니다. 새 사진 상단 삽입, 테두리 제거와 클릭 도구 모음, 잠금 아이콘과 회색 확정 입력을 반영했습니다.

## 2026-10-01 v6
큰 드래그 영역을 자리 차지 없는 2px 청록색 삽입선으로 변경했습니다. 공유 이미지 렌더러를 가우시안 흐림으로 교체하고 전체 획의 투명도 슬라이더를 추가했습니다. 경로의 합집합을 한 번만 합성해 겹치는 부분도 동일 투명도를 유지합니다.

## 2026-10-01 v7
브라우저 임시 저장과 1.5초 지연 로컬 파일 자동 저장을 함께 제공하고 저장 요청을 직렬화했습니다. 저장 실패 표시와 재시도, 화면 하단 고정 상태바, 바이트가 아닌 grapheme 기준 본문 글자 수를 추가했습니다.

## 2026-10-01 v8
사진 도구 삭제 문구 간소화, document 범위에서 바깥 클릭과 Esc로 메뉴 닫기, 활성화 aria-expanded 동기화, 검색 결과 이전·다음 페이지 탐색과 캐시를 추가했습니다. Unsplash 페이지 파라미터 검증과 메타데이터 응답을 추가했습니다.

## 2026-10-01 v9
브러시 지우개를 각 모자이크 영역의 삭제 경로로 저장해 원본을 보존하고, 개별 칠하기 영역 이동 시 지우개 경로도 함께 옮기도록 했습니다. 편집 이력으로 칠하기·지우기·이동 되돌리기를 지원합니다. 경계 선명도 기본 20%와 슬라이더를 추가해 영역·지우개 경계를 부드럽게 합성합니다.

## 2026-10-01 v10
검색 사진 바로 삽입, 모자이크 완성 후 직접 드래그, 편집 화면 압축과 슬라이더 값 오른쪽 표시, 본문 클립보드 복사, `.article-workspace/articles` 저장 및 Windows 숨김 속성을 추가했습니다. 사용자 원고 폴더를 ZIP에서 제외합니다.

## 2026-10-01 v11
사진 도구에 사진 교체하기를 추가했습니다. 새 파일은 편집 후 해당 사진 인스턴스 위치에 적용하며, 설명·출처 편집값은 이어서 제공하고 자르기·흐림 영역은 초기화합니다.

## 2026-10-01 v12
교체 메뉴 검색·첨부 및 사진 위치 문맥 전달, 본문 도구 아이콘과 툴팁, 기사 프레임 인쇄, 768px 높이 편집 화면, 포인터 기반 사진 이동과 연속 자동 스크롤을 반영했습니다.

## v13
교체 메뉴 앵커를 교체 아이콘에 연결. 사진 도구 아이콘/호버 안내. 키보드 삭제는 마지막 작업 취소 대신 선택된 모자이크 삭제. 사진 이동 위치는 직접 자식 박스의 중간점 대신 명시적 BR 및 중첩 문단 경계에서 선택하며 Range 추출로 텍스트/인라인 서식을 보존. 삽입선은 절대 위치로 표시해 글의 위치를 바꾸지 않음.

## v14
raw text/inline/BR을 드래그 시작 시 DIV로 묶어 첫 줄 위치 누락 수정. 스크롤 조상 탐색으로 페이지/독립 패널 양방향 이동. 고정738px iframe 축소 제거, 뷰포트와 스크롤바 기준 렌더링. 동아일보 원본 반응형 CSS 규칙을 제목/본문 별도 영역에 적용하고 10개 폭에서 참조 CSS와 줄 문자열 비교.
