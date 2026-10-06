# App Core 실제 구현과 Data Map 연결 점검 (2026-10-06)

검토 기준: `feature/app-core@ef03e337`, Data Map `feat/datamap-circular-file-library-api@9a1719c`. 이 문서는 실행된 코드와 v0.8 목표 계약을 구분한다.

## 현재 Core의 호출·저장 방식

| 항목 | 구현 확인 | v0.8과 차이 |
|---|---|---|
| UI 호출 | `web/src/api/core-api.js`의 named method → `http.js/client.js` 또는 `ipc.js` → `app/core/api.py`. HTTP는 `/api/*`, IPC 브리지는 자리만 잡혀 있으며 실제 pywebview 메서드는 별도 확인 필요 | `/v1/workspaces/*` OpenAPI는 실행 중인 라우트가 아님 |
| 기사 저장 | `saveArticle(draft)` → `POST /api/articles/save`, `latestArticle()` → `GET /api/articles/latest`. 원고는 SQLCipher `articles`와 `article_revisions`에 저장; `revision_no`는 기사별 정수이며 최신 200건 유지 | `ArticleRevision.id` UUID와 불변 `ArticleSnapshot` 없음 |
| 자료 | `sources`에 원본 BLOB·추출 텍스트 저장. `draft.sources[]`에 자료 참조. `openSource(sourceId)`와 `sourceBytes(sourceId)`만 공개; 원본 ID는 SHA1 앞 16자리 hex | UUID `Source.id`, SourceChunk, Source 목록·생성 API 없음 |
| 사진 | 원고의 base64 사진을 `media` 테이블에 중복 제거 저장하고 원고에는 `media:<32hex>` 참조 | 공통 `MediaAsset` 계약 및 목록 API 없음 |
| 검증·STT | `factcheckRun(nodes, materials)`, `transcribe(filename, data)` 등 실행 메서드는 있음 | Snapshot 기반 `Claim/EvidenceLink/VerificationRun`, `ProcessingJob`, Transcript ID 저장 계약과 다름 |
| 작업공간 | vault 상수 `WORKSPACE_ID=10000000-0000-4000-8000-000000000001`; 자료·원고 레코드에 저장 | 다중 Workspace 권한·프로젝트 조회 API 없음 |
| Data Map | Core에 `getKnowledgeMap` 메서드와 `GET /v1/workspaces/{workspace_id}/knowledge/map` 없음 | OpenAPI v0.8의 KnowledgeMap은 목표 계약 |

근거 파일: `article_editor/app/core/{api,storage,vault}.py`, `article_editor/web/src/api/{core-api,client,http,ipc,index}.js`. 저장 위치를 과거 평문 JSON 폴더로 설명하는 주석은 구버전 설명이다. 실제 저장 함수와 SQLCipher 스키마를 기준으로 한다.

## Data Map 연결 가능 범위

- **지금 가능:** Core `latestArticle()`의 가장 최근 draft와 명시적인 `draft.sources[]`를 화면 그래프로 투영. 기존 32hex Article ID와 16hex Source ID를 그대로 보존한다. 이는 단일 기사와 참조 자료의 부분 조회이며, 공통 UUID 계약의 충족을 뜻하지 않는다.
- **규격 응답이 준비되면 가능:** `KnowledgeMap.entities/edges`를 UI의 `nodes/edges/projects`로 변환. 선택적 `articles/sources/source_chunks/claims/evidence_links/article_sources/projects`가 제공될 때만 해당 노드·연결을 추가한다. 연결을 추론해 만들지 않는다.
- **정의 필요:** Workspace 인증·선택 기사 범위, 프로젝트 목록, 공통 ID와 legacy ID 매핑, Source/SourceChunk 조회, Claim/EvidenceLink 소유·위치, 원본 열기, Source revision 저장·삭제, 대량 그래프 페이지 처리. 현재 OpenAPI의 KnowledgeMap 필수 필드는 엔티티·엣지뿐이라 기사·파일 목록을 그릴 데이터가 부족하다.
- **중복 금지:** Data Map 전용 Source/Claim/Evidence 저장소, 별도 RAG/검증 엔진, 독립된 자료 업로드 API, 가짜 프로젝트·근거 연결. 프로토타입의 세션 업로드와 브라우저 수정본은 시연 데이터다.

## 다음 계약 변경 순서

1. Core 담당자와 실제 `Article`·`Source` ID 전환 및 기존 값의 alias 규칙을 정한다.
2. Core의 named `getKnowledgeMap({workspaceId, articleId})`와 HTTP/IPC 대응을 정하고, 기사·자료·근거·프로젝트 목록을 어디서 조회할지 결정한다. v0.8 `KnowledgeMap`을 확장하거나 별도 조회 계약을 명시한다.
3. 자료 수정은 원본 BLOB과 SourceChunk를 덮지 않는 Revision 계약으로 별도 합의한다.
4. 실제 기사 하나로 동일 ID의 저장 → 자료 참조 → 검증 → 지도 조회를 확인한 뒤 문서와 Core를 함께 v1.0으로 확정한다.
