# AI-Newsroom OS — Branch → App Core API/ERD Mapping v0.8

상태: **Reality Audit 결과 / 개발 작업표**  
기준일: 2026-10-04  
기준선: `feature/app-core`  
비교 기준 SHA: `feature/app-core@d579665`, `feature/su4228-article-workspace@fb985c2`, `feature/platform-generator@113d2fc`
통합 원칙: 기존 기능을 다시 만들지 않고 **App Core 계약에 Adapter로 연결**

## 0. 먼저 확인된 브랜치 상태

| 브랜치 | 현재 관계 | 판단 |
|---|---|---|
| `feature/app-core` | 기준선 | 통합 테스트 HTTP adapter / 최종 EXE IPC의 공통 Core로 유지 |
| `feature/su4228-article-workspace` | 위 SHA 기준 app-core보다 69 commits behind, ahead 0 | **별도 merge 금지**. 필요한 기능은 이미 app-core에 흡수됨 |
| `feature/platform-generator` | 위 SHA 기준 app-core와 diverged, 고유 4 commits | Platform + critique-organizer를 **기능 단위로 편입** |
| STT 전용 최신 브랜치 | 현재 branch 목록에서 확인되지 않음 | Core에 `/api/interview/transcribe`는 존재. 박소현 최신 구현이 별도라면 먼저 push/대조 필요 |

> 핵심: “세 브랜치를 합친다”가 아니라 **App Core에 이미 들어간 코드는 유지하고, 아직 갈라진 기능만 Core 계약에 맞춰 편입**한다.

---

# 1. Core 자체 — 현재 API → 목표 ERD

## 1-1. 기사 저장

**현재 파일**
- `article_editor/app/core/api.py`
- `article_editor/app/core/storage.py`
- `article_editor/web/src/api/core-api.js`

**현재 endpoint**
- `POST /api/articles/save`
- JS method: `saveArticle(draft)`

**현재 주요 필드**
- 입력: `draft.articleId`, `title`, `subtitle`, `bodyHtml`, 기타 draft 값
- 저장: `.article-workspace/articles/{articleId}.json`
- 반환: `saved`, `articleId`, `fileName`, `folder`

**목표 ERD**
- `Article.id`
- `Article.current_revision_id`
- `ArticleRevision.id / article_id / revision_no / title / body / created_at`
- `ArticleSnapshot`

**Gap**
1. `articleId` 32자리 hex를 Article과 Revision이 함께 사용함.
2. 자동저장이 Revision 이력으로 분리되지 않음.
3. Snapshot 생성 기능이 없음.
4. 검증/플랫폼 변환이 수정 가능한 draft를 직접 받을 위험이 있음.

**수정**
- 기존 JSON 저장은 당장 삭제하지 않고 Repository/Adapter 뒤에 둔다.
- canonical `article_id`와 별도 `revision_id`를 생성한다.
- `saveArticle()`은 ArticleRevision을 생성/갱신하는 의미로 정리한다.
- `createSnapshot(article_id, revision_id)` Core method를 추가한다.
- Snapshot은 생성 후 수정하지 않는다.

**담당**
- 강창희: Core 저장 경계/메서드
- 안정빈: ERD/ID/Snapshot Contract 검토

---

## 1-2. Core 검증

**현재 파일**
- `article_editor/app/core/api.py`
- `article_editor/app/core/managers/ai_manager.py`
- `article_editor/app/core/ai/factcheck/`
- `article_editor/web/src/api/core-api.js`

**현재 endpoint**
- `GET /api/factcheck/status`
- `POST /api/factcheck/run`
- JS: `factcheckRun(nodes, materials)`

**현재 필드**
- `nodes=[{id,type,text,linkedSourceIds?}]`
- `materials=[{id,title,content,date?,speaker?}]`

**목표 ERD**
- 입력 기준: `ArticleSnapshot.id`
- `Claim`
- `EvidenceLink`
- `VerificationRun`
- `VerificationIssue`

**Gap / 중복**
- 안정빈의 `critique-organizer`에도 별도 검증 HTTP 서버와 SQLite review 저장소가 있음.
- Core factcheck와 critique-organizer가 둘 다 “검증 엔진 + 근거”를 소유하면 중복된다.

**책임 경계**
- 강창희 Core: **검증 호출 경계, 검증 도메인 규칙, Claim/Evidence/Issue 결과 구조, AI/provider 실행 기반**
- 안정빈: **critique-organizer의 기존 검증 데이터를 공통 구조로 연결하는 Adapter와 Critique 기능**
- 강창희의 RAG: 근거 후보 탐색
- 강창희의 Verification: 작성 결과물의 사실/논리/출처/오류 판단

**수정**
- UI는 Core의 단일 `verifySnapshot(...)` 계약만 호출.
- critique-organizer의 도메인 로직은 Core에서 호출 가능한 service/adapter로 편입.
- 별도 `localhost:8765` 서버는 최종 제품 경계로 사용하지 않는다.

---

## 1-3. Source/RAG 청킹

**현재 endpoint**
- `POST /api/semantic/parse`
- JS: `semanticParse(text, source)`

**현재 필드**
- `text`
- `source = frontend | opendart`

**목표**
- `Source.id`
- `SourceChunk.id / source_id / text / locator`

**수정**
- 문자열만 반환/전달하지 말고 `source_id`, `chunk_id`, `locator`를 보존.
- critique-organizer의 `document_id/block_id/locator`는 Adapter에서 `Source/SourceChunk`로 변환.

**담당**
- 강창희: RAG/청킹
- 안정빈: Source/SourceChunk/Evidence ID 계약

---

# 2. article-workspace / Media — 현재 구현 → Core

## 2-1. ArticleWorkspace draft

**현재 파일**
- `article_editor/react/ArticleWorkspace.tsx` (과거 branch)
- 현재 기능은 app-core 쪽에 흡수된 상태

**현재 필드**
```text
schemaVersion
articleId
confirmed.headline
confirmed.subheadline
title
subtitle
bodyHtml
category
createdAt
updatedAt
photos[]
```

**매핑**
| 현재 필드 | 목표 |
|---|---|
| `articleId` | `Article.id` 또는 초기에는 `legacy_id` |
| `title` | `ArticleRevision.title` |
| `subtitle` | `ArticleRevision` 편집 payload |
| `bodyHtml` | `ArticleRevision.body` |
| `createdAt/updatedAt` | revision/article timestamps |
| `photos[]` | `MediaAsset.id[]` 참조 |
| `confirmed.*` | 편집 UI 상태. Domain 필드와 분리 |

**수정**
- article-workspace branch 자체는 merge하지 않는다.
- app-core에 들어온 작성 UI가 `api.js`를 통해서만 저장하도록 유지.

---

## 2-2. 사진 저장

**현재 파일**
- `article_editor/integration/photo_storage.js`
- `article_editor/integration/supabase_setup.sql`

> 두 파일은 article-workspace와 app-core에서 동일한 blob SHA로 확인됨. 즉 이미 Core branch에 들어와 있다.

**현재 DB: `photo_assets`**
| 현재 필드 | 목표 `MediaAsset` | 조치 |
|---|---|---|
| `id uuid` | `MediaAsset.id` | 유지 가능 |
| `owner_id` | 사용자/권한 메타 | Cloud 공유 시 유지 |
| `article_id text` | Article 연결 | canonical ID로 변환. 단독 소유 FK로 고정하지 않음 |
| `object_path` | `object_ref/shared_object_ref` | 공유된 자산에만 사용 |
| `original_filename` | filename | 유지 |
| `mime_type` | mime_type | 유지 |
| `byte_size` | byte_size | 유지 |
| `caption` | caption | 유지 |
| `source` | source metadata | 유지 |
| `shot_date` | shot_date | 유지 |
| `generated` | generated | 유지 |
| 없음 | `local_uri` | **추가 필요** |
| 없음 | workspace/project 연결 | **추가 필요** |

**현재 문제**
- `uploadOriginalPhoto()`가 UI/JS에서 Supabase Storage를 직접 호출.
- 모든 원본 사진을 Cloud에 올리는 흐름은 Local-first 원칙과 충돌.
- `article_id text`는 canonical 관계를 보장하지 않음.

**수정**
- 기본 원본 저장은 Local Media Repository.
- 공유/협업 시에만 Supabase Storage adapter 사용.
- UI는 Supabase를 직접 호출하지 않고 Core Media API를 호출.

**담당**
- 고서연: MediaAsset에 필요한 실제 미디어 필드/미리보기/자동조정
- 강창희: Core Media API + Local storage 경계
- 안정빈: ERD 관계 검토

---

# 3. STT — 현재 Core → Transcript/Segment

**현재 파일**
- `article_editor/app/core/ai/transcribe.py`
- `article_editor/app/core/managers/ai_manager.py`
- `article_editor/app/core/api.py`
- `article_editor/web/src/api/core-api.js`

**현재 endpoint**
- `POST /api/interview/transcribe`
- JS: `transcribe(filename, data)`

**현재 반환 계약**
- `dialogues=[{id,speaker,speakerName,timestamp,text}]`
- `text`
- `duration`

**목표 ERD**
- `Transcript`
- `TranscriptSegment`
- `ProcessingJob`

**부족**
- `transcript_id` / canonical segment ID 계약
- segment 시작/끝 시간의 명시적 구조
- Source/Evidence에서 같은 segment를 참조할 규칙
- 장시간 STT를 위한 ProcessingJob

**담당 — 박소현**
1. 최신 STT 코드가 Core의 `transcribe.py`와 같은지 확인.
2. 다르면 최신 구현을 먼저 GitHub에 push하고 Adapter 차이만 제출.
3. 반환을 `Transcript + TranscriptSegment[]`로 매핑.
4. segment에 `id/start_ms/end_ms/speaker/text`를 보장.
5. STT 실행을 `ProcessingJob`으로 연결.

> 현재 GitHub branch 목록에는 박소현의 별도 최신 STT branch가 보이지 않으므로, 코드가 로컬에만 있다면 이것이 첫 작업이다.

---

# 4. platform-generator → Core Platform Contract


**담당 — 강창희**
- `api.js`에 Platform Core method 추가
- Python Core에 n8n Adapter 연결

---

## 4-2. Instagram Renderer

**현재 파일**
- `platform-generator/workflows/14_Instagram_Render.json`
- `platform-generator/server.js`

**현재 endpoint**
- Node → `POST http://localhost:3001`
- Express: `POST /render`
- Express: `GET /health`
- Express static: `/output/*`

**현재 입력**
- `card_id`
- `template`
- `content.keyword/headline/body`
- `image.url`

**현재 반환**
- `card_id`
- `file_name`
- `file_path`
- `image_url=http://localhost:3000/output/...`

**목표**
- 렌더링 실행: `ProcessingJob`
- 렌더 결과: `MediaAsset`
- 플랫폼 결과: `PlatformOutput`

**수정**
- UI/n8n이 localhost 파일 URL을 제품 ID로 사용하지 않는다.
- `card_id`는 PlatformOutput 내부 보조 ID로만 사용.
- 렌더 완료 후 Core에 MediaAsset을 등록하고 `media_asset_id`를 반환.
- Express/Playwright를 당장 삭제하지 않아도 되지만 **내부 adapter 구현**으로 취급한다.

**담당 — 이정민**
- renderer payload/result adapter

**담당 — 강창희**
- EXE 패키징에서 renderer 프로세스/의존성을 어떻게 실행할지 Core 경계 결정

**담당 — 고서연**
- 렌더 결과 MediaAsset/미리보기 연결 검증

---

# 5. critique-organizer → Core Verification / Archive / Data Map

**현재 파일**
- `prototypes/critique-organizer/app/server.py`
- `contracts.py`
- `store.py`
- `knowledge.py`

## 5-1. 별도 HTTP 서버

**현재 endpoints**
- GET: `/api/catalog`, `/api/explore`, `/api/projects`, `/api/documents`, `/api/search`, `/api/reviews/{id}`, `/api/graph`
- POST: `/api/intake`, `/api/transcripts`, `/api/proofread`, `/api/reviews`, `/api/finding-status`, `/api/organization*`
- DELETE: `/api/documents/{id}`

**판단**
- 기능 로직은 재사용 가치가 높음.
- 별도 `ThreadingHTTPServer(127.0.0.1:8765)`는 최종 Core와 **중복 서버**이므로 제품 경계로 유지하지 않는다.
- `server.py`는 prototype adapter로 남기고, domain/service 함수를 Core에서 직접 호출하는 adapter를 만든다.

## 5-2. SQLite → 공통 ERD

**현재 SQLite**
| 현재 | 목표 ERD |
|---|---|
| `documents` | `Source` |
| `blocks` | `SourceChunk` |
| `entities` | `KnowledgeEntity` |
| `mentions` | `KnowledgeEdge`의 evidence-bearing mention 관계 |
| `reviews` | `VerificationRun` + 결과 |
| `review_documents` | VerificationRun ↔ Source dependency |
| `projects` | Workspace 내부 취재건/컬렉션 — v1.0에서 명칭 결정 |
| `organization` | Source 분류 metadata |
| `organization_history` | 분류 변경 이력 |
| `intake_failures` | `ProcessingJob.failed` + 원본 보존 정책 검토 |

**Candidate 필드 매핑**
| critique Candidate | 공통 구조 |
|---|---|
| `document_id` | `Source.id` |
| `document_version` | Source version/hash |
| `block_id` | `SourceChunk.id` |
| `title` | Source.title |
| `locator` | SourceChunk.locator |
| `excerpt/start/end` | `EvidenceLink` exact span |
| `retrieval_score` | Evidence/Retrieval metadata — 진실 확률 아님 |

## 5-3. 중복 검증 정리

**현재 `POST /api/reviews` 입력**
- `article`
- `article_id`
- `article_version`
- `source_document_ids`
- `title`
- `glossary`
- `use_openai`

**목표**
- `snapshot_id`
- `source_ids[]`
- 검증 옵션

Core가 Snapshot에서 article/title을 읽고 Verification service에 전달한다.

**담당 — 안정빈**
1. `contracts.py`의 Candidate/Assessment/Repository 인터페이스 유지·정리.
2. `document_id/block_id` → `Source/SourceChunk` Adapter 작성.
3. review 결과 → `Claim/EvidenceLink/VerificationRun/Issue` 매핑.
4. Knowledge graph → `KnowledgeEntity/KnowledgeEdge` 매핑.
5. `server.py`를 제품 API로 확장하지 않고 Core adapter로 편입.

**담당 — 강창희**
- Core에 Verification/Archive/Knowledge named methods를 노출할 자리 제공.
- UI가 critique 서버를 직접 호출하지 않도록 `api.js` 단일 경계 유지.

---

# 6. 중복/제거 후보

## 6-1. canonical Core named method

최종 EXE/IPC와 브라우저 통합 테스트용 HTTP adapter는 아래 이름과 payload를 공유합니다. `OPENAPI_v0.8.yaml`의 `operationId`가 이 이름의 기준입니다.

| 기능 | Core named method |
|---|---|
| 기사 저장/Revision 생성 | `saveArticle` |
| Snapshot 생성 | `createSnapshot` |
| 검증 시작 | `verifySnapshot` |
| 플랫폼 변환 | `createPlatformOutput` |
| STT | `transcribeMedia` |
| 미디어 등록 | `registerMediaAsset` |
| 작업 조회/취소 | `getJob` / `cancelJob` |

## 6-2. 중복 구현 처리

| 현재 구현 | 조치 |
|---|---|
| article-workspace의 별도 `server.py` | **병합하지 않음** — app-core가 후속 구현 |
| article-workspace branch 자체 | **merge 불필요** — app-core보다 완전히 뒤에 있음 |
| critique-organizer `server.py:8765` | prototype 테스트용 유지 가능, 제품에서는 Core adapter로 대체 |
| platform renderer `localhost:3000` | 내부 구현으로 격리. UI가 직접 알지 않게 함 |
| UI → Supabase photo 직접 호출 | Core Media API로 이동 |
| n8n 내부 원기사 Fact Check | 공통 Verification과 중복 제거. 변환 왜곡 검증만 유지 |
| 기능별 `articleId/article_id/document_id/card_id` | 내부 legacy ID 가능, 기능 간 연결은 canonical ID |
| 기능별 작업 상태 | `ProcessingJob`으로 실행 상태 통일 |

---

# 7. 담당자별 실제 개발 작업표

## P0 — Vertical Slice 전에 반드시

| 순서 | 담당 | 수정 대상 | 작업 | 완료 기준 |
|---:|---|---|---|---|
| 1 | 강창희 + 안정빈 | `core/storage.py`, ERD | Article / Revision / Snapshot ID 경계 확정 | Snapshot ID로 검증/변환 호출 가능 |
| 2 | 안정빈 | critique `contracts.py/store.py` + Core adapter | Source/Chunk/Claim/Evidence/Verification 매핑 | 별도 DB ID를 공통 ID로 변환 가능 |
| 3 | 강창희 | `api.js`, Python Core | Verification/Platform/Media named method 자리 확정 | UI가 외부 서버를 직접 호출하지 않음 |
| 4 | 이정민 | Node | `snapshot_id` 입력 + PlatformOutput 결과 계약 | 변환 원본 기사 버전 추적 가능 |
| 5 | 박소현 | STT 최신 코드 + Core transcribe | Transcript/Segment canonical ID | Evidence가 segment ID를 참조 가능 |
| 6 | 고서연 + 강창희 | photo/media integration | Local-first MediaAsset adapter | 원본 사진이 기본적으로 Local에 저장되고 ID로 재사용 |

## P1 — 전체 연결 테스트 전에

| 담당 | 수정 대상 | 작업 |
|---|---|---|
| 안정빈 | critique knowledge/store | Data Map/Archive가 Source/Entity 공통 데이터를 읽도록 adapter |
| 이정민 | workflow 14 + `server.js` | render 결과를 MediaAsset ID로 연결 |
| 고서연 | Media UI/preview | 동일 MediaAsset ID로 작성/미리보기/플랫폼 결과 표시 |
| 강창희 | Core | ProcessingJob 공통 실행 상태 제공 |
| 전원 | Browser HTTP + EXE IPC | 동일 article/snapshot/source/media ID로 E2E |

## P2 — Vertical Slice 성공 후

- legacy `articleId/document_id/card_id` 정리
- prototype 전용 HTTP 서버 제거 여부 결정
- SQLite schema migration 정식화
- Supabase 공유 자산 schema v1.0 확정
- Contract v1.0 Freeze

---

# 8. 적용 보류 범위

적용 보류와 v1.0 확정 조건은 `CONTRACT_ALIGNMENT_v0.8.md` §11을 단일 기준으로 사용합니다. 이 문서에서는 구현별 중복/제거 판단과 Adapter 작업만 관리합니다.

---

# 9. Source of Truth

이 문서와 다음 문서를 GitHub의 기술 기준으로 사용한다.

- `CONTRACT_ALIGNMENT_v0.8.md`
- `ERD_v0.8.md`
- `CURRENT_IMPLEMENTATION_MATRIX_v0.8.md`
- `OPENAPI_v0.8.yaml`
- **이 문서: `BRANCH_TO_CORE_MAPPING_v0.8.md`**

Notion은 의사결정/진행상황을 사람이 읽기 쉽게 요약하고 이 GitHub 문서를 링크한다. Slack에는 이 표를 복제하지 않는다.
