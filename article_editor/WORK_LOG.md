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
| 2026-10-05 | Claude | 팩트체크 판정기 교체: Qwen3-0.6B+v10 LoRA(torch·peft, 입력 192) → `factcheck-judge-0.6b-v2`(ONNX 병합본, 입력 512, research/factcheck-judge q06b-v2-full). semantic_provider.py 를 OnnxJudgeProvider 로(onnxruntime+tokenizers, 연구 판정과 60/60 동일, (주장,근거) 결과 캐시 4096), '일치'는 확신도 0.9 이상만 확정(아래면 REVIEW), v10 용 assertion guard 제거. service._judge_qwen_candidates 에 조기 종료(확신 있는 지지/충돌에서 멈춤). 모델 매니페스트·상태 점검·requirements(peft 제거) 갱신. 앱 전체 경로 긴 문서 29건: 정답 7→16, '일치' 오판 6→1, 주장당 20.7→5.6초. 정책브리핑 실무 평가 '일치' 오판 126→9. 남은 것: 판정기 앞 기존 규칙(문맥 충돌·값 충돌)이 헛경보 3건 — 다음 정리 대상. 옛 models/factcheck-qwen3-0.6b-v10 폴더는 되돌리기용으로 남겨 둠 |
| 2026-10-06 | Claude | 팩트체크 판정기 v2 → `factcheck-judge-0.6b-v3`(research q06b-v3: v3 데이터 + 정책브리핑 학습분 + KLUE 학습분). 코드 변경 없이 paths.JUDGE_DIR 기본값·매니페스트·test_server 모델 id 만 교체. 정책브리핑 평가 절반 88→144/248, KLUE 826→1327/1800, 봉인·29건은 비슷(앱 경로 29건 16/29, '일치' 오판 1 동일). '일치' 오판은 실무 데이터에서 늘어 확신도 0.9 기준 유지. v2 폴더는 되돌리기용으로 남겨 둠 |
| 2026-10-06 | Claude | 팩트체크 판정기 앞단 규칙 제거: service._retrieve_contextual_conflict(값 불일치·대조·유/무·극성 반대로 판정기 전에 충돌 확정)와 판정기 결과를 덮어쓰던 값 가드 삭제, assertion.py 는 강조 위치 도우미(find_explicit_value_conflicts·find_near_copy_differences)만 남김(449→184줄). 판정기가 충돌이라 할 때만 값 불일치 위치를 강조용으로 계산. 근거(v3 판정 캐시로 재현): 봉인 386주장 정답 350→356·충돌 헛경보 13→6, 정책브리핑 평가 절반 144→144, 앱 경로 긴 문서 29건 16→17·충돌 헛경보 7→1(값 규칙 7회 발동 중 5회가 맞는 주장을 충돌로). 일치 오판 변화 없음. 테스트 48·ui-smoke 통과 |
| 2026-10-06 | Claude | 팩트체크 자료 업로드에 PDF·DOCX·HWP·HWPX 추가: 코어 `POST /api/materials/extract`(app/core/documents.py — PDF=pypdf, 옛 HWP=olefile+본문 레코드 직접 해석(압축·탭·표 제어 처리, 암호·배포용은 안내), DOCX·HWPX=zip XML 표준 라이브러리). 계약 core.extractText → editorial.extractMaterialText, FactCheckDrawer 가 텍스트 파일 외에는 코어로 추출하고 실패 사유를 파일 목록에 빨간 표시. requirements-factcheck.txt 에 pypdf·olefile. 테스트: test_documents 8개(HWP 는 합성 레코드·가짜 OLE — 실제 .hwp 파일로는 아직 미확인), test_server 라우트, ui-smoke 깨진 HWP 업로드. 실제 PDF 3·DOCX 2 추출 확인. 스캔 PDF(OCR)는 미지원 |
| 2026-10-06 | Claude | 저장 위치 변경(보통의 Windows 앱 방식): 기사·취재자료 원본 = `내 문서\AI Newsroom\{articles,sources}`(SHGetKnownFolderPath — OneDrive 리디렉션 포함), 로그·캐시·웹뷰·모델 = `%LOCALAPPDATA%\AI Newsroom\`(app_paths.DOCUMENTS/APP_DATA, 환경변수 AI_NEWSROOM_DOCUMENTS/APPDATA 로 변경 가능). 예전 `.article-workspace` 는 서버 시작 때 이전(덮어쓰기 없음, 사용 중 파일은 남김, 위치를 환경변수로 바꾼 실행에서는 이전 안 함), `article_editor/models` 는 폴더째 rename(실패 시 예전 위치 사용). 보관함 버그 수정: 팩트체크 서랍에 올린 자료가 서랍 안 상태에만 있어 보관함에 안 보였음 → 기사 `sources`[{id,name,format,size,chars,path,addedAt,text}]로 등록, 코어 extract 가 원본·text.txt 를 sources/<sha1>/ 에 보관, 자동 저장에 sources(텍스트 제외) 포함, 보관함 취재자료 건수·이름 표시. 사고 기록: 첫 ui-smoke 가 이전을 실행해 예전 기사 1건(3d1dd503…)이 스모크 임시 폴더로 옮겨짐 → 내 문서\AI Newsroomrticles 로 복구(크기 동일), 환경변수 재지정 시 이전 금지로 수정. 테스트 59(test_paths 추가)·ui-smoke(보관함 취재자료 확인 추가) 통과 |
| 2026-10-06 | Claude | 팩트체크 서랍 자료 보기: 파일 이름을 누르면 추출 본문 대화상자(팩트체크가 읽는 텍스트, body portal) + '원본 열기' = 코어 `POST /api/sources/open`(storage.open_source — 16자 hex ID 검증 후 os.startfile 로 기본 프로그램). 테스트: test_sources_open(경로 조작 400·없는 ID 404), ui-smoke 자료 보기 단계 |
| 2026-10-06 | Claude | ① 본문 불일치 하이라이트 복구(새 UI 이식 때 빠졌던 기능, 옛 archive-os EditorView 방식): factcheckArticle 이 문장 본문 위치를 기억하고 코어 conflict_spans/focus_spans 를 본문 좌표로 → ArticleWriter.HighlightedBody(투명 textarea + 뒤 글자 층 mark). 충돌은 틀린 값만 빨강, 근거 부족 노랑, 검토 보라. 본문을 고쳐 문장이 바뀐 결과는 칠하지 않음. 결과 상태를 서랍→ArticleWriter 로 올려 서랍을 닫아도 유지. 확인: '군비 9억원·총 22억원' 원고 vs '7억원·20억원' 자료 → 9억원·22억원만 표시. ② 자료 보기 창 탭: 추출 본문 / 원본 보기(PDF=Blob iframe, HWP·HWPX=@ssabrojs/hwpxjs 0.4.0 MIT 로 HTML → sandbox iframe, 처음 열 때만 지연 로드 325KB) / 청크 보기(개발 실행만, /api/status dev) — 팩트체크와 같은 공백 정리 후 semantic/parse, 청크마다 색 밑줄·종류 툴팁·개수·평균 길이. 코어 GET /api/sources/<id>/file. HWP 실제 파일 미확인 |
| 2026-10-06 | Claude | 앱을 열면 최근 작업 이어서: 코어 `GET /api/articles/latest`(storage.latest_article — 가장 최근 원고, 취재자료 본문은 sources/<id>/text.txt 에서 다시 붙임, 깨진 파일은 건너뜀). App 이 시작 때 불러온 뒤 화면을 그림, 마지막 화면(탭)은 localStorage. 자동 저장을 ArticleWriter → App 으로 올림: 어느 화면에서 바꿔도 저장, articleId 를 기사에 남겨 화면을 오가도 같은 파일(이전엔 작성 화면에 다시 들어올 때마다 새 파일이 생겼음), 저장 필드에 content 원문·linkedSources·sources·status·createdAt 추가(이전엔 sources 변경이 저장을 일으키지 않았음 — editorial.js 에 넣은 의존성 수정이 엉뚱한 파일이었다). content 없는 옛 원고는 bodyHtml 에서 글자만 복원. 팩트체크 결과(하이라이트)는 저장하지 않음 — 다시 검증 필요. 테스트: latest_article, ui-smoke 새로고침 후 보관함·제목·본문·취재자료 유지 + 저장 파일 1개 |
| 2026-10-06 | Claude | ① 자동 팩트체크: EditorialAssist.useFactCheck — 본문·취재자료가 바뀌고 1.5초 멈추면 실행(실행 중 바뀌면 끝난 뒤 한 번 더, 요청 안 겹침), 앱을 열 때도 실행돼 하이라이트 복원. 실행·결과는 ArticleWriter, 서랍은 표시만. 작성 화면 상단에 '팩트체크 중…/확인 필요 N문장/통과'. ② 틀린 부분만 하이라이트: 원인은 프론트 문장 나누기가 줄바꿈마다 잘라(PDF 붙여넣기는 문장 중간 줄바꿈) '…요건을 7천' 같은 반쪽 문장을 판정 → 코어가 값 위치를 못 줌 → 문장 전체 칠함. editorial.splitSentences(마침표 기준, 줄바꿈은 공백, 빈 줄은 제목줄 뒤에서만, 공백 정리 문장↔원문 위치 map)로 교체. 코어 service: 충돌은 값 불일치 없으면 near-copy 차이, 검토·근거 부족도 near-copy 차이를 강조 위치로(assertion.find_near_copy_differences window=True — 긴 청크 안 맞닿은 구간만 비교, 판정 경로는 기본값 그대로). 확인: 실제 원고 '7천↵만원'만 표시, 단어 바꿈 '노인을'만. test_spans 추가 |
| 2026-10-06 | Claude | ① 팩트체크 증분 실행: factcheckArticle(content, files, cache) — 문장(공백 정리본)별 코어 결과를 기억하고 새로 쓰거나 고친 문장만 /api/factcheck/run 으로(같은 문장은 한 번만), 위치는 매번 다시 계산. useFactCheck 가 취재자료 구성이 바뀌면 기억을 비움, 서랍 새로고침 버튼 = 전체 다시 검증. ② 본문 청크 밑줄(개발 실행만): 작성 화면 '청크 밑줄' 버튼 → editorial.bodyChunks(팩트체크와 같은 공백 정리 + semantic/parse, 정리본→원문 위치) → HighlightedBody 위 밑줄 층(청크마다 색). 지난번엔 자료 보기 창에만 넣었음(요청은 기사 본문). 확인: 사용자 원고 281자는 청킹 모델이 청크 1개로 묶음(표시 오류 아님). ui-smoke: 문장 하나 덧붙이면 그 문장만 전송, 청크 밑줄 층 |
| 2026-10-06 | Claude | 서랍 카드에서 본문 하이라이트와 근거 짝 표시: factcheckArticle 이 코어 span 의 evidence_start/end 를 quoteSpans 로 넘김 → FactCheckDrawer.Marked 가 근거 발췌의 대응 값(빨강)과 그 값이 든 근거 문장(노랑), 카드의 본문 문장 쪽 틀린 값(빨강)을 칠함. 확인: 본문 '7천만원' ↔ 근거 '9천 만원' |
| 2026-10-06 | Claude | 틀린 값 위치 버그 수정(화면 점검에서 발견): 바꿔 쓴 문장에서 맞는 '9천만원'을 칠하고 진짜 틀린 '19%'(자료 17%)는 못 찾음. 원인 = assertion.find_explicit_value_conflicts 가 '값 바로 앞 단어'로 항목을 맞춤('총급여 기준을 9천만원' ↔ '종합소득금액 기준을 8천만원'). 새 규칙: 본문 값마다 근거의 같은 종류(단위) 값 중 앞뒤 14자 문맥(2글자 조각 겹침)이 가장 비슷한 것을 짝으로, 그 값이 다를 때만 표시(같은 값이 다른 곳에 있어도 문맥이 다르면 틀린 값, 비기면 표시 안 함). VALUE_RE 가 '1천500만원'·'3억 2천만원'을 한 값으로. _field_before_value·_similar_field 삭제. 판정은 그대로(위치만). 확인: 화면에서 '19%'만 표시. test_spans 에 3건 추가. 남은 것: 바꿔 쓴 지지 문장 확신도 0.87 → 검토 필요(판정기 보정, v4 때), 근거 청크가 문서 첫머리 전체라 발췌가 김 |
| 2026-10-06 | Claude | HTML 자료를 태그째 비교하던 문제(화면 점검: 기사 '27일'이 근거의 width="89" 와 짝지어짐): documents._html(html.parser — 블록·표 행 줄바꿈, 표 칸 공백, script/style/head 제외, 문자 참조 해제, 소스 줄바꿈은 공백). 이미 등록된 HTML 자료 1건 text.txt 재추출. 출처·사진·기자 표기 줄('출처 : …(URL)')은 검증 문장에서 제외(editorial.splitSentences). '근거 부족'일 때 보여 줄 근거에서 '자료명:' 메타 줄 제외(service). 발견만 하고 남긴 것: 표 형태 공시(보통주식(주) 627,546)와 기사식 숫자(62만7546주)·회사명이 제목에만 있는 경우 판정기가 근거 부족/엉뚱한 회사도 일치(0.53)로 봄 → v6 데이터 후보. test_documents html 1건 추가 |
| 2026-10-06 | Claude | 외부 재판정(임시·시험용, OpenAI): 서랍의 'AI 재판정 N건 (임시)' 버튼 → 로컬 판정기가 확정 못 한 문장만 코어 `POST /api/factcheck/external`(ai/factcheck/external.py, structured_call JSON 스키마: verdict/reason/wrong_text/evidence_text) — 대상 = 검토 필요 전부 + '근거 부족' 중 검색 후보에 같은 수가 있는 문장(service.related_evidence, assertion.to_number/shares_value: 62만7546주 = 627,546). 보내는 것 = 문장 + 상위 본문 청크 3개(자료 전체 아님), 경로 = providers(local .env 키 / remote 백엔드). 결과는 문장별 기억에 붙어 문장을 고치기 전까지 유지, 카드에 'AI 재판정' 표시, wrong_text·evidence_text 가 원문에 그대로 있을 때만 하이라이트. test_external(숫자 정규화·보내는 내용·입력 검증, OpenAI 는 가짜). 같은 시각 다른 작업이 vault.py·storage.py·app_paths.py·test_server/test_documents 를 수정 중 — 이 커밋에서 제외 |
| 2026-10-06 | Claude | 공용 테스트 계정 자동 로그인(개발 실행 전용): .env TEST_ACCOUNT_EMAIL/PASSWORD(각자, 저장소 제외) → SessionManager 가 상태 조회·토큰 요청 때 Supabase 로그인, 토글은 APP_DATA/settings.json(기본 AUTO_LOGIN, 없으면 켜짐), 배포본·계정 미설정이면 비활성. `POST /api/session/auto`, 헤더 AutoLoginToggle. '토큰 내려받기' 공개 경로는 만들지 않음(아무나 토큰 = 인증 끄기와 같음). 기존 문제 수정: backend_proxy.token() 이 만료 토큰을 갱신하지 않아 로그인 1시간 뒤 외부 호출이 실패할 구조였음 → SessionManager.token()(갱신 → 실패 시 자동 로그인). 계정은 사용자가 Supabase 대시보드에서 생성. test_session_auto 3건. 참고: test_server 의 test_missing_openai_key·unsplash_key 는 실제 .env 의 AI_BACKEND 를 읽어 remote 일 때 실패(테스트 격리 문제 — 다른 작업이 수정 중인 파일이라 손대지 않음) |

## 인수인계 확인 (2026-10-06, Codex)

- 제출 대상 오류 미검출 수정: 사용자 원고의 `관할 소방서장에게 제출`을 로컬 v3가 일치(0.99915)로 오판했고, 복사된 `**` 뒤 마침표 경계 누락으로 다음 문장까지 211자에 합쳐져 있었다. 입력 토큰 475로 잘림은 없었으며 단독 수신자 관계를 판정하면 불일치가 검출됨을 실측했다. splitSentences는 Markdown 닫힘 뒤 문장도 분리하고 판정용 텍스트에서 쌍을 이룬 강조 표식을 제거하되 원문 좌표는 유지한다. assertion.recipient_assertions가 긴 문장의 명시적 목적물-수신자-제출/신고/통보/보고 관계를 분리하고 service는 전체 일치 판정 때 같은 로컬 모델로 관계를 추가 검사한다. 관계가 불일치이면 그 대상만 conflict_spans, 확정 못 하면 REVIEW. 이름 차이만으로 판정을 덮어쓰는 규칙은 아니다. memo PIPELINE v2로 예전 오판 캐시 재사용 방지. test_recipient 6·test_spans 10·test_factcheck_memo 7·support-highlight SSR(강조 표식 문장 분리/원문 좌표/대응 대상 빨강)·빌드·API 경계 통과. 서버 재시작 후 실제 자료 전체 경로에서 오답 CONFLICT(0.999879), 정답 SUPPORTED(0.999908), 본문 `관할 소방서장` ↔ 근거 `지방자치단체장` 좌표 확인. 원고 본문은 변경하지 않았다. 화면 직접 캡처는 브라우저 도구 접근 제한으로 못 했으며 저장 원고/판정 기록·로컬 모델·API로 검증했다. 관계 분해의 범위는 명시적 수신자 표현에 한정된다.
- 브라우저 후속 주석(27일·금융감독원·전자공시시스템·젝시믹스): 문장 일치 표시가 날짜/출처/주체까지 검증된 것으로 보이는 문제를 완화. claim-details.js가 날짜·기관/시스템·주체 후보의 표기 위치를 선택한 자료의 발췌/추출 본문/자료명에서 구분한다. 해당 정보는 카드와 카드 hover 본문에서 노란색, 카드에 표기 위치 및 의미/관계 확인 필요를 표시한다. 이름의 단순 언급·파일명·같은 일자만으로 항목별 검증 완료를 부여하지 않는다. 실제 자료에서 기관/시스템은 없고 회사는 자료명에만 있으며 8월27일은 이사회결의일이라는 점을 확인했다. 모델 판정/외부 호출은 추가하지 않았다. support-highlight.mjs에 기존 외부 판정·자료명·이사회일/공시일 구분·다른 자료에 같은 이름이 있을 때의 격리 검사를 추가해 통과. 빌드·API 경계·실행 서버 최신 자산 응답 확인 통과. 후속 한계: 후보 추출은 날짜 패턴/명칭 접미사/문장 주체 기반으로 모든 고유명사를 잡는 NER이 아니며, 실제 항목별 의미 판정은 별도 모델 계약 확장이 필요하다.
- 브라우저 주석 1 수정: 로컬 SUPPORTED 판정의 근거 위치가 비어 초록 표시가 없던 문제. assertion.find_support_spans가 관련 문장/번호 표 항목을 공백 제외 표현·동일 수치로 찾아 AIManager 응답의 support_spans로 전달한다(기존 판정 캐시에도 응답 때 추가, 재판정 없음). editorial은 일치 위치와 오류 위치를 분리하고 FactCheckDrawer는 대상 문장·해당 근거 항목을 초록 표시한다. 위치가 모호하면 특정하지 못했다는 안내를 표시한다. 판정 로직은 변경하지 않았다. test_spans 10개·test_factcheck_memo 7개·support-highlight.mjs(실제 카드 SSR/어댑터)·빌드·API 경계 검사 통과. 8877 독립 서버 재시작 후 사용자 원고의 저장된 일치 판정(cached=1)이 `소각예정금액(원) 1,999,987,622`만 강조 위치로 반환함을 확인했다.
- 앱 내 브라우저 후속 실행: 데스크톱 창과 함께 종료된 8877 서버를 `PORT=8877 python -u app/server.py`로 독립 실행했다. 시작 화면 및 최근 원고 조회 HTTP 200을 확인했다. 로그는 `temp/browser-server.{stdout,stderr}.log`에 둔다.
- 프로젝트 구조·최근 커밋·미커밋 변경을 확인하고 작업을 이어받을 준비를 마쳤다. 현재 브랜치는 `feature/app-core`, HEAD는 `72c4b9d`이다.
- 최근 완료된 흐름: 자료 파일 추출 → 본문 자동·증분 팩트체크 → 본문/근거 하이라이트 연결 → 불확실한 문장의 외부 AI 재판정. 앱 판정 모델은 v3를 유지하며, 연구 공간에는 v4 평가와 v5 학습 데이터가 있다.
- 미커밋 작업: `vault.py` 기반 SQLCipher 저장소 및 OS 기기 키, 기사별 최근 200개 자동저장 이력, 사진 중복 저장 방지, 임베딩/로컬 판정/외부 재판정 결과의 암호화 캐시, 원고를 다시 열 때 외부 재판정 복원. 기존 변경은 보존했으며 이번 인수인계에서 기능 코드는 수정하지 않았다.
- 최신 프론트를 `npm run build:web`로 빌드하고 `pythonw app/launcher.py --window`로 앱을 실행했다. 주소는 `http://127.0.0.1:8877/index.html`. 네이티브 창의 `코어 연결됨`, `방금 저장됨`, 기존 원고 복원 및 로컬 팩트체크 모델 3종 준비 상태를 확인했다. 기존 8765 서버 두 개는 유지했다.
- 검증: API 경계 검사 통과, 암호화 저장소 테스트 12개 통과. 전체 Python 테스트는 96개 중 5개 실패: `test_supported_claim`은 테스트에서 실제 저장소 키 접근 실패, `test_missing_openai_key`/`test_missing_unsplash_key`는 실제 remote 설정 영향(504), 세션 테스트 두 개는 개발 자동 로그인 영향. 실행 앱의 최근 원고 조회는 200으로 정상이다. 다음 작업에서 테스트를 임시 저장소·가짜 설정으로 격리할 필요가 있다.
- 다음 작업 기준: 미커밋 저장/캐시/화면 복원 변경의 검증·기록 정리 → 공통 계약의 `article_id`/snapshot/job/source chunk/result 저장 항목과 실제 코드 대조 → Python IPC 브리지 구현. `APP_CORE_CONTRACT_TODO.md`의 "revision 미구현" 등 일부 설명은 현재 미커밋 구현보다 오래됐으므로 그대로 판단하지 않는다.
- 이번 확인은 유료 외부 AI 기능의 정상 응답이나 전체 팩트체크 판정 완료를 검증한 것은 아니다. 화면 스모크는 현재 코드가 실제 암호화 저장소를 사용할 수 있으므로 격리 보완 후 실행한다.

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
