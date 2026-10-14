# Core 검색 기능 및 콘텐츠 변환 확인 기록

- 확인일: 2026-10-14 (Asia/Seoul)
- 목적: 검색 기능 담당자와의 논의를 위한 현행 코드 기록 및 플랫폼 편집기 위치 안내
- 확인 범위: 루트 `index.html` → `src/main.jsx` → `src/App.jsx`와 연결된 Core 소스의 정적 확인
- 실제 서버 실행, 외부 서비스 응답, 실계정 검색은 검증하지 않음
- 이 기록은 현행 구현 설명이며 기능 변경 또는 담당자 합의 완료를 의미하지 않음

## 1. 검색 기능 현황

| 기능 | 데이터·검색 방식 | 화면 연결 |
| --- | --- | --- |
| 팩트체크 근거 검색 | Qwen3-Embedding-0.6B 벡터, DenseFly 2개 + BM25, RRF 순위 통합 | 기사 작성 자동 팩트체크, 팩트체크 서랍, 본문 하이라이트 |
| Unsplash 사진 검색 | Core가 외부 사진 검색 요청을 전달 | 기사 사진 서랍, 카드뉴스 사진 선택 |
| 동아일보 사진 검색 | 사진 목록을 6시간 메모리 캐시하고 제목·설명에서 검색어 필터링·날짜 정렬 | 기사 사진 서랍, 카드뉴스 사진 선택 |
| 자체 취재자료 검색 | `mockSources`의 제목·요약에 `includes()` 적용, 카테고리 필터 | 검색 화면, 기사 작성 우측 검색 패널 |
| 데이터맵 검색 | Core에서 받은 그래프 목록의 이름·태그·작성자·경로를 프론트에서 필터링 | 데이터맵 |
| 기사 보관함 검색 | Core에서 받은 기사 목록의 제목·부제를 프론트에서 필터링 | 보관함 |

### 팩트체크 검색 구성

1. 파일을 `/api/materials/extract`로 업로드하면 본문을 추출하고 원본·본문을 암호화 저장한다.
2. `documents.extract_text()`가 `source_index.start_indexing()`으로 백그라운드 색인 작업을 시작한다.
3. 자료를 의미 단위 조각으로 분할하고 `source_chunks`에 저장한다. 임베딩 벡터는 암호화 저장소의 `embedding_vectors`에 캐시한다.
4. `useFactCheck()`가 기사 문장을 질의로 보내고 `rank_chunks()`가 관련 근거 상위 10개를 반환한다.
5. 기본 순위는 DenseFly 2개(seed 101, 307)와 BM25의 결과를 RRF로 합친다. `FACTCHECK_RETRIEVAL=exact`이면 임베딩 코사인 유사도 순위를 사용한다.
6. 로컬 판정은 기본적으로 검색 후보 중 최대 5개를 평가하며 조기 종료할 수 있다. 외부 판정 모드에서는 본문 근거 최대 3개를 보낸다. 자료에 동일 문장이 직접 존재하는 경우에는 직접 일치 경로를 사용한다.

호출 경로:

```text
ArticleWriter / useFactCheck
→ factcheckArticle
→ core.runFactcheck / POST /api/factcheck/run
→ AIManager.factcheck_run
→ review_workspace
→ rank_chunks
→ 근거 판정 / 팩트체크 카드 / 본문 하이라이트
```

- 현재 화면은 `article.sources` 중 본문이 있는 자료를 보낸다. 저장소 전체를 자동으로 검색하지 않는다.
- Core는 전달받은 `materials`를 검색 범위로 사용한다. 문장별 `linkedSourceIds`가 있으면 해당 자료로 후보를 좁히며, 후보가 없으면 전달된 전체 자료로 돌아간다.
- 임베딩 계산은 기본적으로 백엔드 `/ai/embeddings`를 사용한다. Core의 `create_encoder()`는 기본 원격 인코더에 로컬 폴백을 연결하지 않는다. `onnx`/`torch`는 환경변수로 명시할 때 사용하는 별도 경로다.
- 글 수정이 멈춘 뒤 약 1초 후 자동 팩트체크를 실행하며 색인 중인 자료는 완료를 기다린다.
- 코드 주석 중 과거 기본값·폴백 설명이 남아 있는 곳이 있으므로 위 설명은 실행 분기와 기본 설정을 기준으로 작성했다.

근거 파일:

- [자료 추출·색인 시작](../../article_editor/app/core/documents.py)
- [색인 저장·작업 관리](../../article_editor/app/core/source_index.py)
- [검색 엔진·벡터 캐시](../../article_editor/app/core/ai/factcheck/retrieval.py)
- [DenseFly·BM25·RRF](../../article_editor/app/core/ai/factcheck/fusion.py)
- [검색 범위·근거 판정](../../article_editor/app/core/ai/factcheck/service.py)
- [임베딩 기본 런타임](../../article_editor/app/core/ai/factcheck/paths.py)
- [자동 팩트체크 훅](../../src/components/EditorialAssist.jsx)
- [프론트 팩트체크 요청 구성](../../src/api/editorial.js)

### 자체 취재자료 검색과 Core 사이의 미연결 부분

- `src/components/SourceSearch.jsx`는 `src/data/mockData.js`의 `mockSources`를 사용하며 Core 검색 API를 호출하지 않는다.
- `src/App.jsx`의 `handleConnectSource()`는 본문에 출처 참고 문구를 추가하고 `linkedSources`에 ID를 넣는다. 팩트체크에 필요한 실제 자료 본문을 `article.sources`에 등록하지는 않는다.
- `/api/sources`는 저장된 자료 목록·사용 기사·색인 상태를 반환한다. 현재 별도의 일반 취재자료 검색 API나 `searchSources` 계약은 없다.
- 데이터맵과 보관함의 검색도 Core 의미 검색 엔진을 호출하지 않고 조회된 목록을 프론트에서 필터링한다.

근거 파일:

- [취재자료 검색 화면](../../src/components/SourceSearch.jsx)
- [기사 출처 연결 처리](../../src/App.jsx)
- [Core API 라우트](../../article_editor/app/core/api.py)
- [저장 자료 목록](../../article_editor/app/core/sources.py)
- [프론트 Core 계약](../../src/api/core-api.js)
- [데이터맵 필터](../../src/features/data-map/domain/graph.js)
- [기사 보관함 필터](../../src/components/ArchiveView.jsx)
- [동아일보 사진 검색](../../article_editor/app/core/integrations/donga_archive.py)

### 담당자와 논의할 항목 — 미결정

- 자체 취재자료 검색을 실제 저장 자료와 연결할지, 검색 범위를 현재 기사 또는 저장소 전체 중 어디로 정할지
- 검색 방식으로 제목·본문 키워드 검색, 기존 의미 검색 엔진, 또는 둘의 결합 중 무엇을 사용할지
- 검색 결과에서 '기사에 연결'할 때 `linkedSources`와 팩트체크용 `article.sources`를 어떻게 함께 구성할지
- 검색 API 입력·결과 형식, 색인 대기·실패 상태 표시 및 담당 범위

## 2. 현재 콘텐츠 변환 위치

명칭 합의: 2026-10-14부터 이 문서에서 기사 선택·채널별 원고 생성/편집·카드뉴스·검수·배포 영역 전체를 **콘텐츠 변환**이라고 부른다. 기존 코드의 `PlatformStudio` 등 식별자는 변경하지 않는다.

루트 앱의 '콘텐츠 변환' 메뉴는 `activeTab === "convert"`에서 `PlatformStudio`를 렌더링한다.

| 역할 | 현재 파일 |
| --- | --- |
| 앱 진입·화면 연결 | [src/App.jsx](../../src/App.jsx) |
| 편집실 전체 화면·기사 적용·키워드·생성·결과 전환 | [PlatformStudio.jsx](../../src/components/PlatformStudio.jsx) |
| Instagram 도입·본문·마무리·해시태그 편집 | `PlatformStudio.jsx` 내부 `PlatformDraftEditor()` |
| Threads 편집 | [ThreadsEditor.jsx](../../src/components/ThreadsEditor.jsx) |
| 카드뉴스 편집·사진 선택 | [PlatformCardEditor.jsx](../../src/components/PlatformCardEditor.jsx) |
| 원본 기사 선택 | [PlatformArticlePicker.jsx](../../src/components/PlatformArticlePicker.jsx) |
| 결과 검수 | [PlatformReview.jsx](../../src/components/PlatformReview.jsx) |
| 결과 배포·출력 | [PlatformDelivery.jsx](../../src/components/PlatformDelivery.jsx) |
| 프론트 생성·검수·렌더·SNS API | [src/api/platform.js](../../src/api/platform.js) |
| 기사 적용·초안 상태 관리 | [platformSource.js](../../src/lib/platformSource.js), [platformState.js](../../src/lib/platformState.js) |
| Core와 Node 생성 엔진 연결 | [platform_manager.py](../../article_editor/app/core/managers/platform_manager.py) |
| Node 생성·검수·이미지 렌더 호출 어댑터 | [core-adapter.js](../../platform-generator/core-adapter.js) |

```text
콘텐츠 변환 메뉴 / App.jsx
→ PlatformStudio.jsx
→ src/api/platform.js / src/api/core-api.js
→ Core /api/platform/*
→ PlatformManager
→ Node core-adapter.js (stdin/stdout JSON)
→ platform-generator의 생성·검수·렌더 엔진
```

- `src/components/FormatConverter.jsx`도 존재하지만 현재 루트 `src/App.jsx`는 이 컴포넌트를 불러오지 않는다.
- 별도 `article_editor/web/src/App.jsx`에서는 `FormatConverter`를 사용한다. 루트 `index.html`에서 시작하는 현재 앱의 편집 위치와 구분해야 한다.
- `platform-generator/public/`에는 별도 웹 화면 코드가 있으나, 현재 루트 앱의 편집 UI는 `src/components/PlatformStudio.jsx`와 그 하위 컴포넌트다.

## 3. 콘텐츠 변환 AI API 및 교체·혼합 가능 여부

확인일: 2026-10-14. 소스와 기본 설정을 확인한 결과이며 실제 실행 환경의 비밀 설정이나 유료 API 응답은 확인하지 않았다. AI 호출·설정·제품 코드는 변경하지 않았다.

### 현재 연결

- 현재 루트 앱의 콘텐츠 변환은 OpenAI Responses API 경로를 사용한다. 키워드 추천, Instagram/Threads 원고 생성, 카드뉴스 정보 배분·원고 생성, AI 검수·생성 보완이 이 경로로 연결된다.
- `PlatformManager._ai()`가 모든 Node AI 요청의 모델을 `config.TEXT_MODEL`로 덮어쓴다. 이 값은 `OPENAI_TEXT_MODEL`을 읽으며 코드 기본값은 `gpt-4.1-mini`다. 생성기 안의 `gpt-5` 기본값은 Core 연결에서 실제 모델을 결정하지 않는다.
- `AI_BACKEND=remote`는 우리 백엔드 `/ai/responses`를 통해 OpenAI로 전달하고, `local`은 로컬 키로 OpenAI에 직접 요청한다. 이 설정은 제공사 선택이 아니라 호출 경로 선택이다.
- 콘텐츠 변환의 카드 사진 추천·한글 사진 검색어 변환도 Core `assist`의 OpenAI 텍스트 경로를 사용한다. Unsplash/동아일보 사진 검색과 카드 JPEG 렌더 자체는 AI 텍스트 생성이 아니다.
- 통합 실행의 Node 자식 프로세스에는 `AI_PROVIDER`, `OPENAI_MODEL`, `GEMINI_MODEL`, OpenAI/Gemini 키를 전달하지 않고 `PLATFORM_AI_BRIDGE=core`를 지정한다.

근거: [PlatformManager](../../article_editor/app/core/managers/platform_manager.py), [공통 모델 설정](../../article_editor/app/core/config.py), [Core AI 호출](../../article_editor/app/core/ai/client.py), [provider 선택](../../article_editor/app/core/ai/providers/__init__.py), [백엔드 AI 중계](../../backend/server.py), [Node AI 어댑터](../../platform-generator/ai-provider.js).

### 프로젝트의 다른 AI 경로

| AI 경로 | 역할 | 콘텐츠 변환과의 관계 |
| --- | --- | --- |
| OpenAI Responses | 기사 제목·부제·요약·흐름·사진 설명·사진 검색어·팩트체크 외부 판정 | 콘텐츠 변환과 Core 공통 호출 경로 및 `TEXT_MODEL` 공유 |
| Gemini | `platform-generator/ai-provider.js`의 독립 실행용 대체 제공사 | 기존 어댑터는 있지만 현재 Core 연결에서는 사용하지 않음 |
| OpenAI Chat Completions | `backend/stt/interviewAnalyzer.js`의 인터뷰 요약·핵심 내용·키워드 분석 | 별도 서버 경로이며 코드에서 `gpt-4o-mini`를 지정함 |
| CLOVA Speech / OpenAI Whisper | 녹음 전사, CLOVA 화자 분리 및 Whisper 대체 경로 | 음성 처리 단계에서 함께 쓸 수 있으나 텍스트 생성 API를 직접 대체하지 않음 |
| Cloudflare Workers AI / Qwen3 임베딩 | 팩트체크 근거 검색용 벡터 생성 | 검색 단계에 붙일 수 있으나 채널별 원고 생성 API를 직접 대체하지 않음 |
| 로컬 KeT5·KoBART·ONNX 판정 모델 | 제목·부제 초안, 요약 초안, 팩트체크 판정 | 전처리·검증 단계로 재사용 가능. 콘텐츠 변환 출력 스키마를 바로 생성하는 공통 어댑터는 없음 |
| OpenAI 이미지 생성 | Core `assist(kind=image)`의 이미지 생성 | 카드 사진 자산 생성 등 별도 단계로 조합 가능. 카드 JPEG 렌더와는 다른 기능 |

기사 요약에는 `FLOW_SUMMARY_PROVIDER=kobart`로 KoBART 초안을 만든 후 OpenAI가 최종 결과를 만드는 혼합 경로가 이미 있다. 음성 전사에도 CLOVA/Whisper 선택·폴백이 있다. 다만 이것들이 콘텐츠 변환의 제공사 선택 기능으로 연결된 것은 아니다.

근거: [Core assist 라우터](../../article_editor/app/core/ai/router.py), [인터뷰 분석](../../backend/stt/interviewAnalyzer.js), [음성 전사 선택](../../article_editor/app/core/ai/transcribe.py), [원격 임베딩](../../article_editor/app/core/ai/factcheck/remote_embedding.py), [로컬 초안 모델](../../article_editor/app/core/ai/local_models.py).

### 가능 여부와 필요한 변경

| 요청 방식 | 판단 | 현재 지원·필요 작업 |
| --- | --- | --- |
| Core 공통 OpenAI 텍스트 모델 변경 | 설정으로 가능 | `OPENAI_TEXT_MODEL` 변경 후 Core 재시작. 공유하는 다른 텍스트 기능에도 영향. 대상 모델의 Responses·요청 옵션·JSON 스키마 호환 검증 필요 |
| 콘텐츠 변환만 다른 OpenAI 모델 사용 | 구현 가능, 현재 별도 설정 없음 | 콘텐츠 변환 전용 모델 설정과 `PlatformManager._ai()` 분기 추가 |
| 독립 생성 엔진의 OpenAI ↔ Gemini 전환 | 어댑터 코드 존재 | Core 브리지 없이 독립 실행할 때 `AI_PROVIDER` 및 해당 제공사 키·모델 설정으로 선택. 실제 Gemini 성공은 이번에 미검증 |
| 현재 앱 콘텐츠 변환을 Gemini로 전환 | 구현 가능, 설정만으로 불가 | Core 또는 백엔드에 Gemini 제공사 라우팅과 응답 변환 연결. `AI_PROVIDER=gemini`만으로는 현재 통합 앱이 전환되지 않음 |
| 생성은 Gemini, 검수는 OpenAI 등 작업별 혼합 | 구현 가능, 현재 콘텐츠 변환에서는 미지원 | 생성/검수/키워드 등 작업별 제공사·모델 라우팅 추가. 기존 JSON 스키마, 원문 근거 검증, 거절·미완료·오류 처리를 유지해야 함 |
| 실패 시 다른 AI로 자동 전환 | 구현 가능, 현재 콘텐츠 변환에서는 미지원 | 명시적 대체 정책과 제공사별 오류·재시도 처리 추가 |
| Cloudflare 임베딩·CLOVA를 원고 생성 API로 치환 | 직접 치환 불가 | 각각 검색·음성 인식의 역할로 조합하고 별도 텍스트 생성기를 사용 |
| Claude 등 다른 제공사 | 현재 Core·생성 엔진의 호출 어댑터 없음 | 제공사별 요청·응답 어댑터와 라우팅 신규 구현 필요 |

백엔드에는 `OPENAI_BASE_URL` 변경 지점도 있지만 OpenAI 요청/응답을 그대로 중계한다. 대체 서버가 실제 사용하는 Responses 경로·입력·구조화 출력·오류 형식을 지원해야 하며, Chat Completions 호환만으로 바로 교체 가능하다고 볼 수 없다. 공통 주소 변경은 이미지·Whisper 경로에도 영향을 줄 수 있다.

콘텐츠 변환 요청에는 `text.format.name`으로 `article_keywords`, `instagram_caption`, `threads_draft`, `card_news_information_plan`, `card_news_draft`, `*_validation` 등 작업 식별자가 있다. 작업별 라우팅에 활용할 수 있지만 정식 제공사 선택 정책은 아직 구현돼 있지 않다.

OpenAI 공식 문서도 JSON 모드와 JSON 스키마 준수를 구분한다. 대체 제공사 연결 시 JSON 파싱 성공만으로 현재 콘텐츠 변환의 출력 계약을 만족한다고 판단하면 안 된다. 참고: [OpenAI Docs — Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

## 4. 정확도·품질·처리시간을 위한 논의 기준 및 권고

> 재검토 상태: 이 절의 모델 분리·입력 축소는 초기 평가 제안이다. 플랫폼 규칙을 반영한 현재 우선 제안은 아래 6절이며, 기존 제안을 채택하거나 구현한 것은 아니다.

사용자 요구(2026-10-14): 정확도와 품질, 실행 시간 단축을 중요 목표로 삼는다. 앞으로 논의에서는 확인된 사실과 추정을 구분하고 객관성·실용성·실행 가능성·비판적 검토를 적용한다. 효과뿐 아니라 비용, 한계, 영향 범위와 검증 방법을 함께 설명한다. 이 절은 제안이며 구현·성능 검증 완료 기록이 아니다.

### 코드에서 확인한 개선 후보

- `PlatformStudio.runGeneration()`은 선택한 채널을 `for ... await`로 순차 생성한다. 동일한 고정본을 사용하는 채널 생성은 제한된 병렬 실행으로 바꿀 후보이다.
- Core HTTP AI 작업 한도는 `BoundedSemaphore(3)`이며 자리가 없으면 대기시키지 않고 429를 반환한다. 단순히 모든 요청을 동시에 보내면 다른 AI 작업과 충돌할 수 있다. 초기에는 채널 동시 실행 2개와 작업 대기·오류 처리를 검토한다. IPC 경로도 별도 검증이 필요하다.
- `draft-validator.validateDraft()`는 사실 검수와 요구사항 검수를 순차 호출한다. 요구사항 검수에 사실 검수의 문제 목록을 전달하므로 그대로 병렬화하면 현재 중복 방지 정책을 깨뜨린다. 병렬화하려면 결과 병합·중복 제거를 재설계하고 누락 여부를 검증해야 한다.
- 카드뉴스의 정상 생성·검수 경로는 정보 배분표 1회 + 원고 1회 + 사실 검수 1회 + 요구사항 검수 1회로 4회 AI 호출이다. 배분표 재시도 또는 최대 두 차례 원고 교정이 추가될 수 있다.
- 카드뉴스는 생성 중 `generation_review`를 저장하지만 프론트 `reviewStatus()`는 `validation_review`를 기준으로 상태를 계산한다. 검수 계약·입력·버전을 일치시키면 편집되지 않은 생성본의 검수 결과를 재사용할 수 있을지 검토할 수 있다. 검수를 자동으로 생략해도 된다는 의미는 아니다.

근거: [채널 생성 흐름](../../src/components/PlatformStudio.jsx), [검수 의존성](../../platform-generator/draft-validator.js), [카드뉴스 생성·교정](../../platform-generator/card-news-generator.js), [검수 상태 판정](../../src/lib/platformState.js), [Core 작업 한도](../../article_editor/app/core/config.py), [HTTP 실행 제한](../../article_editor/app/core/api.py).

### 추천 API 운영 방식 — 평가용 후보

OpenAI Responses 경로를 유지하면서 작업별 모델·추론 강도를 분리하고, 확정적으로 검사할 수 있는 항목은 코드로 처리하는 방식을 우선 권고한다.

| 역할 | 초기 평가 후보 | 제한·판단 기준 |
| --- | --- | --- |
| 기사 의미를 보존하는 원고·카드 구성, 사실·맥락 검수 | `gpt-6.1-sol`, `reasoning.effort=medium` | 정확도·편집 품질을 평가하고 `low`와 비교. 공식 문서상의 균형형 후보이지 한국어 뉴스 성능 확인 결과는 아님 |
| 사진 검색어 변환·후보 키워드 등 범위가 좁은 보조 작업 | `gpt-6-luna`, `reasoning.effort=low` | 핵심어 누락·의미 확대가 기존보다 늘지 않을 때 채택 |
| 복잡한 수치·조건·인용 오류나 검수 불일치의 재검토 | `gpt-6-astra` | 어려운 항목의 추가 확인에 한정해 평가. 강한 모델을 써도 오류가 없다는 보장은 없음 |
| JSON 형식·필수 항목·인용 문자열 존재·장수·이미지 렌더 | 기존 코드 검사·렌더 | 의미 정확성까지 코드 검사로 대체할 수는 없음 |

현재 `PlatformManager._ai()`의 공통 모델 덮어쓰기와 보조 기능의 공통 `TEXT_MODEL` 사용을 역할별 라우팅으로 분리해야 한다. 공통 환경변수만 바꾸면 콘텐츠 변환 밖의 기능도 영향을 받는다. 새 모델·요청 옵션은 실제 계정 권한, JSON 스키마, 출력 한도와 거절·미완료 처리를 검증해야 한다.

공식 API에는 Sol/Astra의 `service_tier="ultrafast"`도 있다. 더 높은 비용을 감수하고 대기 시간을 줄이는 비교 후보다. 현재 프록시는 요청 본문을 전달하므로 HTTP 호출을 통한 평가가 가능한 구조이나, 옵션 추가·실계정 호출 확인은 아직 하지 않았다. 실제 단축 폭과 계정 한도는 별도로 측정한다.

### 정확도를 보존하면서 시간을 줄일 우선순위

1. AI 호출별 시간·토큰·재시도와 최종 사용 가능한 결과까지의 시간을 기록해 기준선을 만든다.
2. 공통 원문 고정본을 유지한 채 독립 채널을 제한적으로 병렬 생성한다. 생성 중 편집·기사 전환 보호와 저장 상태를 유지한다.
3. 검수 결과 캐시는 원문·초안·사진·요구사항·플랫폼·제공사/모델·프롬프트/검사 버전이 일치할 때만 재사용한다. 사용자 편집 결과를 덮어쓰지 않는다.
4. 검수 설명의 반복과 생성기의 불필요한 출력 필드를 줄인다. 사실·조건·근거를 잘라내거나 `max_output_tokens`만 과도하게 낮추는 방법은 피한다.
5. 모델별 프롬프트 캐시 조건에 맞춰 공통 규칙·원문을 재사용한다. 입력 prefix와 설정이 일치해야 하며 반복 요청이 충분한지 실제 캐시 사용량을 확인한다. 결과 캐시와는 별개이다.
6. 역할별 모델을 동일 기사로 비교한 뒤 채택한다. Gemini 등 다른 제공사와의 혼합은 같은 평가를 통과하는 경우에 추가한다. 제공사 혼합 자체가 품질을 보증하지 않는다.

### 평가 방법과 한계

- 초기 비교용으로 짧은 기사·긴 기사·수치·직접 인용·계획/확정 구분·민감한 주제를 포함하는 대표 기사 30~50건을 제안한다. 설정 조정에 쓴 기사와 최종 비교용 기사는 분리한다. 이것만으로 운영 전체의 무오류를 증명할 수는 없다.
- 측정: 중대한 사실 왜곡, 필수 정보 누락, 문장·구성의 수동 수정량, 검수의 실제 오류 누락/잘못된 지적, 첫 결과와 최종 검수 완료 시간의 중앙값·p95, 실패·재시도율, 호출 수·토큰·비용.
- 사람의 원문 대조·블라인드 품질 평가를 포함한다. AI 검수의 '통과'만으로 정확도를 평가하지 않는다.
- 콘텐츠 변환 정확도는 입력 기사의 의미를 보존하는지에 관한 것이다. 입력 기사 자체의 사실 오류는 별도의 취재자료 검증이 필요하다.
- 이번에는 유료 API를 호출하거나 모델을 바꾸지 않았다. 한국어 품질 우열·초 단위 처리시간·단축 비율은 미확인이다.

참고한 OpenAI 공식 문서(2026-10-14 확인): [모델 선택](https://developers.openai.com/api/docs/guides/model-selection), [Sol 모델](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Luna 모델](https://developers.openai.com/api/docs/models/gpt-6-luna), [Astra 모델](https://developers.openai.com/api/docs/models/gpt-6-astra), [지연 시간 최적화](https://developers.openai.com/api/docs/guides/latency-optimization), [프롬프트 캐시](https://developers.openai.com/api/docs/guides/prompt-caching), [Ultrafast 모드](https://developers.openai.com/api/docs/guides/ultrafast-mode).

## 5. 버섯체 검색을 콘텐츠 변환에 적용할 수 있는가

> 재검토 상태: 검색 알고리즘과 현행 코드에 관한 확인 내용은 유지한다. 근거 선별로 검수 입력을 줄이는 제안은 아래 6절의 품질 보존 방안으로 대체한다. 현재 제안은 원문 전체를 유지하고 검색을 보조로 사용하는 것이다.

확인일: 2026-10-14. 사용자 제공 설명, 실제 Core 검색 코드 및 DenseFly 연구 논문을 대조했다. 결론은 **문장별 원문 근거 검수와 보유 문서 탐색에는 적용할 여지가 크지만, 전체 정보 누락·구성 검수를 대체할 수 없고 현재 콘텐츠 변환에 연결돼 있지는 않다**는 것이다. 성능은 미측정이며 이 절의 연결 방식은 설계 제안이다.

### 용어와 구현 구분

- 현재 의미 벡터는 Qwen3-Embedding-0.6B가 만든다. 버섯체 방식은 이 벡터의 유사 후보를 찾는 검색 알고리즘이며 원고 생성기나 사실 판정 모델 자체가 아니다.
- `fusion.py`는 1024차원 벡터를 2560차원으로 랜덤 투영하고 양수 여부로 이진화한다. seed 101, 307의 해밍 거리 순위 두 개와 BM25 순위를 RRF로 합친다.
- 사용자 설명의 '소수의 강한 신호만 남김'은 FlyHash의 상위 활성 선택 설명에 가깝다. 현재 DenseFly 구현은 상위 몇 %를 선택하는 WTA가 아니라 투영값의 부호를 사용한다. 연결 행렬의 10% 희소성과 출력에서 활성화되는 비율은 서로 다른 개념이다.
- 코드는 후보 전체의 코사인 점수도 계산하고 전체 이진 코드를 비교한다. 버킷 검색으로 대부분의 후보를 건너뛰는 구현이 아니므로 현재 코드만으로 코사인 검색보다 빠르다고 단정할 수 없다.
- 코드 주석에 있는 Hit@10 28/30은 특정 연구 실험의 기록이다. 이번 PC에는 해당 연구 산출물 경로가 없어 재현하지 못했으며 콘텐츠 변환의 품질·속도 성능으로 일반화할 수 없다.

근거: [융합 검색 구현](../../article_editor/app/core/ai/factcheck/fusion.py), [검색·후보 인덱스](../../article_editor/app/core/ai/factcheck/retrieval.py), [연구 순위 동일성 시험](../../article_editor/dev/tests/test_factcheck.py), [DenseFly/FlyHash 원 논문, III-C](https://arxiv.org/html/1812.01844v1).

### 설명에서 보완할 사항

| 제공 설명 | 코드 기준 판단 |
| --- | --- |
| 자료 전체 대신 근거 몇 개를 판정기에 보냄 | 외부 팩트체크 판정에서 적용됨. 토큰 절감은 주로 근거 선별·판정 재사용 덕분이며 DenseFly만의 효과는 아님 |
| 자료 길이와 무관하게 부담 일정 | 문장당 외부 판정 입력에 근거 개수·길이 한도는 있으나 추출·색인·검색 비용 및 기사 문장 수는 증가할 수 있음 |
| 자료 원본은 PC에만 있고 필요한 조각만 외부 전달 | 원본 파일·색인은 암호화 저장하지만 기본 원격 임베딩 시 자료 텍스트 조각과 질의를 외부로 보냄. 전체 자료 텍스트가 색인 과정에서 외부 처리될 수 있음 |
| 완전히 일치하는 문장은 AI 없이 처리 | 직접 일치 경로는 별도 판정을 생략함. 사전 청킹·임베딩 작업까지 없다는 뜻은 아님. 복사 문장이 맞더라도 문맥·배치·전체 누락의 정확성은 별도임 |

현재 콘텐츠 변환 생성과 검수는 기사 전체를 외부 AI 입력에 포함한다. 검색 엔진을 추가하는 것만으로 모든 외부 전송이 근거 조각으로 제한되는 것은 아니다.

근거: [외부 판정 입력 제한](../../article_editor/app/core/ai/factcheck/external.py), [직접 일치·후보 선별](../../article_editor/app/core/ai/factcheck/service.py), [기본 임베딩 런타임](../../article_editor/app/core/ai/factcheck/paths.py), [원격 임베딩 전송](../../article_editor/app/core/ai/factcheck/remote_embedding.py), [현재 콘텐츠 변환 검수 입력](../../platform-generator/draft-validator.js).

### 적용 적합성

| 콘텐츠 변환 작업 | 판단 | 이유 |
| --- | --- | --- |
| 생성 문장·카드 필드의 원문 근거 찾기 | 우선 적용 후보 | 바꿔 쓴 문장의 관련 원문과 숫자·고유명사를 함께 검색할 수 있음 |
| 긴 원문·다수 자료에서 사용자가 필요한 구절 찾기 | 적용 후보 | 의미 검색과 키워드 검색을 결합하는 문서 탐색 기능으로 활용 가능 |
| 기사 전체의 핵심 누락·정보 배분·전개 검수 | 검색만으로 대체 불가 | 생성 결과를 질의로 쓰면 결과에 아예 없는 필수 정보는 찾지 못할 수 있음 |
| 짧은 기사 한 편의 일회성 변환 | 효과 불확실 | 색인·질의 임베딩·청크 조립 비용이 입력 절감보다 클 수 있음 |
| Unsplash·동아일보 사진 검색 | 직접 재사용 부적합 | 현재 Core 인덱스는 문서 텍스트 대상. 사진 메타데이터 색인 또는 별도 이미지 검색 구조가 필요 |

### 권장 연결 방식

```text
현재 기사 고정본을 검색용으로 색인하고 재사용
→ 기존 플랫폼별 생성
→ 생성 문장·카드 필드별로 원문 근거 검색
→ 관련 청크와 필요한 앞뒤 문맥을 묶어 사실 검수
→ 기사 전체 핵심 정보·조건의 누락과 콘텐츠 구성은 별도 검사
```

- 현재 `source_index`는 취재자료(Source)의 저장 색인이다. 기사 고정본(ArticleSnapshot)용 청크·캐시의 수명과 소유권, Core 검색 계약, 콘텐츠 변환 검수 연결을 추가해야 한다. 설정만으로 켜지는 기능이 아니다.
- 기본 검색 범위는 변환에 사용한 기사 고정본으로 제한한다. 다른 취재자료에서 새 사실을 가져와 변환 결과를 통과시키지 않는다. 보유자료 전체 검색은 사용자가 별도로 자료를 찾는 목적과 구분한다.
- 문장별 검색은 한 번에 질의 벡터를 만들고 동일 후보 인덱스를 재사용한다. 근거 없음은 거짓으로 확정하지 않고 범위를 넓히거나 전체 원문으로 다시 검수한다.
- 상위 3개만 고정하기보다 근거 누락, 인용 주체, 기간·단위, 계획/확정, 조건·예외를 포함하는지 확인한다. 주변 청크 확장·입력 토큰 예산·복잡한 항목의 전체 문맥 확인이 필요하다.
- 카드뉴스의 기존 원문 구절 선택표와 번호→원문 문자열 연결을 활용할 수 있다. 검색 결과를 근거 후보로 제공하되 의미 판정과 전체 주요 정보 검사까지 대체하지 않는다.
- 비교는 현재 전체 원문 검수와 근거 선별 검수를 같은 모델·기사로 실행한다. 검색 방식은 동일 청크·질의·근거 개수/토큰 예산으로 평가하며 정답 근거 회수율, 실제 오류 누락·오탐, 핵심 누락, 최종 완료 시간과 전체 토큰을 측정한다.
- DenseFly 자체의 추가 효과를 구분하려면 BM25 조건을 동일하게 유지한 비교도 필요하다. 현재 `FACTCHECK_RETRIEVAL=exact`는 코사인만 사용하므로 기본 모드와의 차이가 모두 DenseFly에서 생겼다고 해석해서는 안 된다.

이 절은 생성·검색·검수의 조합 가능성을 확인한 기록이다. 구현 변경·유료 API 호출·성능 검증은 수행하지 않았다.

## 6. platform-rules.js를 기준으로 재검토한 방향

2026-10-14 사용자 피드백: 앞선 최적화 제안이 품질을 낮출 위험이 있으므로 플랫폼별 개발 의도를 먼저 이해하고 Core 검색과 AI 연결을 재검토한다. [platform-rules.js](../../platform-generator/platform-rules.js) 전체와 생성·검수 코드의 규칙 사용 경로를 확인했다. 플랫폼 규칙·제품 코드·API 설정은 변경하지 않았다.

### 플랫폼별 완성 기준

| 출력 | 지향하는 결과 | 검수에서 보존할 기준 |
| --- | --- | --- |
| Instagram | 카드와 무관하게 독립적으로 이해되는 게시글. 명사형 도입, 연결된 습니다체 본문, 기사 전체의 핵심과 최종 결론을 묶는 완전한 마무리 | 핵심 사건·주체·배경·조건·현재 상태, 문단 간 설명 관계, 결론의 적절성. 기본 2~4문단은 설계 권장값이며 필요한 정보와 완결성을 우선 |
| Threads | 핵심 쟁점 하나를 고르고 주체·사건·필수 조건을 자연스러운 반말로 전달. 짧은 명사형 제목과 서로 다른 정보를 맡는 요약 블록 | 100~180자와 1~3블록은 기본 목표. 조사·서술어·상태 구분을 유지하며 관련 없는 세부 생략은 허용. Instagram처럼 모든 주요 내용을 요구하면 안 됨 |
| 카드뉴스 | 원문에서 독립 생성한 3~10장. 주요 정보 배분표를 바탕으로 본문 카드에서 필수 내용을 완결하고 마지막 장에서 전체 주제를 종합 | headline/answer/detail의 역할·조건 표현·문법, 장간 중복·누락, 본문 정보의 완결, 표지와 마지막 장의 연결. 사진이나 짧은 글자 수보다 내용 전달 우선 |

공통 원칙은 같은 원문에서 독립적으로 생성하며 다른 플랫폼 초안을 입력으로 사용하지 않는 것이다. 전체 문장을 잘라 나열하거나 짧게 만들기 위한 과도한 압축, 원문 밖의 사실·설명 추가를 허용하지 않는다. 인용 문자열의 존재와 내용의 사실·맥락 정확성은 구분한다.

### 변경한 권고

**전체 원문 + 해당 플랫폼의 전체 공통/전용 규칙으로 생성·검수하는 경로를 유지하고, Core 검색은 근거 위치 확인을 보조하는 용도로 먼저 평가한다.** 검색 상위 몇 개만으로 최종 품질 검수를 대체하는 제안은 현재 우선 적용하지 않는다.

- 생성 입력은 전체 고정본, 키워드, 사용자 요구사항, `getPlatformRules(platform)`의 공통/해당 플랫폼 규칙을 유지한다. 규칙을 의미 검색으로 일부만 선택하거나 한 플랫폼 원고를 다른 플랫폼 입력으로 돌리지 않는다.
- 사실 검수는 원문 전체와 결과 전체를 유지한다. 편집·요구사항 검수도 원문과 결과 전체를 보고 해당 플랫폼의 완성 기준을 확인한다. 카드뉴스는 `information_plan`과 실제 카드 전체를 함께 본다. 배분표 자체가 원문 핵심을 놓쳤는지도 확인해야 한다.
- 먼저 생성기가 제공한 `source_evidence`를 해당 고정본에 대조한다. 존재하는 인용을 찾는 데에는 문자열/위치 검사를 우선하며, Core 의미 검색은 근거 연결이 불명확한 주장이나 수동 편집 항목의 후보 탐색에 선택적으로 사용한다.
- 검색 결과는 원문 위치·앞뒤 문맥을 포함하는 후보로 전달한다. 검색이 찾은 인용을 잘못된 `source_evidence` 대신 조용히 넣지 않고 문제와 후보를 구분해 보여 준다. 검색 순위나 완전 일치만으로 최종 통과시키지 않는다.
- 기본 검색 범위는 생성에 사용한 고정본이다. 저장소 다른 자료를 가져와 원문에 없던 사실을 변환 결과에 허용하지 않는다.
- 전체 원문에 근거 후보까지 추가하면 입력 토큰과 시간이 늘 수 있다. 초기 목적은 누락·오류 위치 파악의 개선이며 토큰·속도 절감을 보장하지 않는다. 품질 효과가 없는 짧은 기사에는 검색을 적용하지 않는 선택도 가능하다.
- 기존 로컬 팩트체크 판정기는 근거와 주장의 지지/충돌을 평가하는 용도다. 플랫폼별 말투·문장 리듬·정보 배분·결론의 편집 품질을 대신 판정하는 모델로 취급하지 않는다.

### AI API 연결 권고

현재 Core → Node 생성 엔진 → Core OpenAI 호출 경계를 유지한다. 플랫폼별 프롬프트는 이미 [Instagram 생성기](../../platform-generator/instagram-generator.js), [Threads 생성기](../../platform-generator/text-generator.js), [카드뉴스 생성기](../../platform-generator/card-news-generator.js)와 [검수기](../../platform-generator/draft-validator.js)가 같은 규칙 파일을 사용한다.

```text
같은 기사 고정본 + 전체 공통/해당 플랫폼 규칙
→ 플랫폼별 독립 생성 API
→ 원문 전체 대비 사실 검수 API
→ 해당 플랫폼의 편집·요구사항 검수 API
→ 오류와 근거 위치를 표시하고 필요한 수정만 수행

Core 검색: 모호한 근거의 원문 위치 확인을 보조
```

- 모델 선택은 `generation / fact_review / editorial_review` 등 역할과 플랫폼을 명시해 Core에서 관리하는 확장 후보이다. 현재는 `PlatformManager._ai()`가 공통 `TEXT_MODEL`로 덮어쓰므로 별도 라우팅 구현이 필요하다. 이 역할 구분은 이미 있는 두 검수를 설명하는 것이며 추가 AI 호출 세 개를 새로 만들자는 뜻이 아니다.
- 초기 품질 비교에서는 생성·검수의 모델을 한 번에 여러 개 바꾸지 않는다. 현재 구성과 품질 후보 하나를 같은 전체 입력·규칙·검사 조건으로 비교한다. 키워드 선택도 최종 방향을 바꿀 수 있으므로 보조 작업이라는 이유만으로 경량 모델로 자동 전환하지 않는다.
- OpenAI/Gemini 혼합은 이후 선택지다. 기존 Gemini 독립 실행 어댑터를 Core에 연결하는 수정과 전체 구조화 출력·거절·미완료 검증이 필요하며 제공사 혼합 자체가 품질 개선 근거는 아니다.
- 검색 결과를 AI의 추가 입력으로 전달하는 계약과 기사 고정본 검색 인덱스는 현재 콘텐츠 변환에 없다. 처음에는 사용자 근거 보기 기능이나 선택적 검수 보조로 연결하고 품질 개선을 확인한 뒤 자동화 범위를 늘린다.

### 품질을 보존하는 속도 개선 순서

1. 같은 고정본에서 독립 채널을 제한적으로 병렬 생성한다. 현재 Core HTTP 작업 제한 3개와 다른 AI 작업, 기사 전환·편집·저장 보호 처리를 고려한다.
2. 원문·결과·키워드·요구사항·모델·규칙/스키마·검사 버전이 같은 검수 결과를 재사용한다. 생성 중 카드뉴스 검수와 사용자의 후속 검수가 동일 조건일 때에만 중복 제거를 검토한다.
3. 규칙·출력 계약을 유지하면서 실패 원인을 분석해 재생성 횟수와 불필요한 전송·출력을 줄인다. 카드 수·본문 길이·검수 범위를 일률적으로 축소하지 않는다.

기존 사실 검수와 요구사항 검수는 의존성이 있으므로 그대로 병렬화하거나 합치지 않는다. 검색 보조·모델 교체·병렬화는 각각 비교해 어느 변화에서 효과가 발생했는지 구분한다.

평가는 플랫폼별로 다르게 한다. Instagram은 문단 연결과 결론 완결, Threads는 핵심 쟁점의 선택·자연스러운 반말·필수 조건 보존, 카드뉴스는 정보 배분·필드 역할·본문 완결·종합 마무리를 사람이 원문과 대조한다. 사실 오류·누락·과잉 지적과 수동 수정 시간을 함께 측정한다. 전체 원문을 주는 것만으로도 품질이 보장되는 것은 아니므로 길이가 다른 기사에서도 검증한다.

참고: [OpenAI 공식 정확도 최적화 문서](https://developers.openai.com/api/docs/guides/optimizing-llm-accuracy)는 검색 컨텍스트 오류와 모델의 말투·작업 수행 오류를 서로 다른 문제로 구분하며, 전체 문맥과 검색을 모두 평가해야 한다고 설명한다. 이번 재검토는 설계 의견이며 실제 API 품질·속도 시험은 수행하지 않았다.

## 7. 구현 전 분류·비교 실험·연결 계약

사용자 요청에 따라 검색 기능을 구현하지 않고 다음 문서를 별도로 작성했다.

- [비교 실험안](CONTENT_TRANSFORM_SEARCH_EXPERIMENT_2026-10-14.md): 현재 구절 검사 가능 오류, 위치 기반 주변 문맥 확인, 의미 검색 후보 탐색, 전체 편집 검수 영역을 구분한다. Instagram·Threads·카드뉴스의 현행 A / 임베딩 없는 문맥 보조 B0 / Core 검색 보조 B1을 오류·핵심 누락·호출·토큰·기사 선택부터 완료까지의 시간으로 비교한다. 미실행 양식과 최초 색인/캐시 조건, 호출 규모를 포함한다.
- [연결 계약 제안](CONTENT_TRANSFORM_SEARCH_CONTRACT_PROPOSAL_2026-10-14.md): 고정본·기사·소유 범위, 원문 위치, 색인 준비·수명, 배치 검색, 최종 검수 보조 입력, 사용량 계측을 논의한다. 제안 이름은 현재 API가 아니며 기존 팀 Core의 스키마·메서드·ID·해시 계약을 변경하지 않았다.
- [소스 기준선](CONTENT_TRANSFORM_SEARCH_BASELINE_2026-10-14.json): 관련 코드 17개의 SHA-256을 기록했다. 실제 API 응답·운영 버전·성능을 기록한 것은 아니다.

## 8. 첫 적용 변경 기록

사용자의 실행 요청에 따라 원문 위치 기반 문맥 보조(B0)와 동일 결과의 중복 검수 감소를 구현했다. Core 의미 검색/새 고정본 색인은 아직 구현하지 않았다. 사전 실험안과 실제 변경을 구분하기 위해 [팀 공유용 변경 기록](../team/CONTENT_TRANSFORM_CONTEXT_AND_REVIEW_CHANGELOG_2026-10-14.md)에 코드 범위·재사용 조건·검증·미검증 항목을 남겼다.
