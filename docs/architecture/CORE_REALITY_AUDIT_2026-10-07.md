# App Core 구현 현황과 계약 차이 (2026-10-07)

상태: **코드 확인 결과 / v0.8.1 목표 계약과 구분**. 기준은 `feature/app-core`의 `article_editor/app/core/{api,storage,vault}.py`, `managers/{storage_manager,ai_manager}.py` 및 `article_editor/web/src/api/{index,core-api,http,client,ipc}.js`이다. 브랜치의 현재 파일을 정적으로 확인했으며 실제 EXE·IPC·전체 기능 연결을 실행 검증한 결과는 아니다. `main`의 [OpenAPI v0.8.1](./OPENAPI_v0.8.yaml)과 [ERD v0.8](./ERD_v0.8.md)은 목표 계약이다.

## 1. 현재 실제 호출 경계

```text
UI → createAppApi({mode="http"}) → createCoreApi named methods
   → client.js fetch → Python api.py (/api/*) → Core managers
```

- `core-api.js`가 프론트의 named method와 HTTP 경로를 정의한다. `client.js`는 payload가 있으면 POST, 없으면 GET으로 호출한다. 응답은 JSON이며 원본 파일은 Blob으로 읽는다.
- `GET /api/articles/latest` → `latestArticle()` → `{draft: object|null}`. 가장 최근 저장한 **기사 한 건**을 반환하고, 참조된 `draft.sources[]`의 저장된 추출 텍스트를 붙인다.
- `POST /api/articles/save` body `{draft}` → `saveArticle(draft)` → `{saved, articleId, revisionNo, fileName, folder}`. `fileName`·`folder`는 호환용 표시값이며 실제 평문 파일 경로가 아니다.
- `POST /api/sources/open` body `{sourceId}` → 기본 프로그램 열기. `GET /api/sources/{16hex}/file` → 원본 바이트. `POST /api/materials/extract`는 텍스트 추출만 하며 공개된 Source 생성/목록 API가 아니다.
- `factcheckRun(nodes, materials)`, `factcheckExternal(items)`, `semanticParse(text, source)`, `transcribe(filename, data)` 등은 현재 실행 메서드다. `factcheck_memo` 캐시는 암호화 DB에 있으나 Snapshot에 귀속된 정규화 `Claim/EvidenceLink/VerificationRun` 저장 계약은 없다.
- `api.py`의 HTTP GET/POST 라우트가 실행 경로다. POST는 로컬 Host/Origin, JSON Content-Type, 크기 제한을 검사한다. `/api/core/v0.8/*`와 구 `/v1/*` 경로는 실행 경로가 아니다.
- `ipc.js`는 `bridge.core(path,payload)`/`coreBytes(path)`의 **예정된** 어댑터다. 확인한 Python `api.py`에는 대응 pywebview 브리지 구현이 없다. `createAppApi({mode:"ipc"})`도 브리지의 `core` 메서드가 없으면 HTTP로 돌아가므로 IPC 전환을 완료로 표시할 수 없다.

## 2. 현재 실제 저장 경계

| 대상 | 구현된 저장·ID | 목표 계약과 차이 |
|---|---|---|
| 작업공간 | `vault.WORKSPACE_ID = 10000000-0000-4000-8000-000000000001` 단일 상수, 레코드에 기록 | 다중 Workspace 선택·접근 권한·프로젝트 API 없음 |
| 기사 | SQLCipher `articles(id, workspace_id, created_at, updated_at)`. `articleId`는 UUID 하이픈 없는 32hex, 없으면 생성 | UUID 표준형 `Article.id` 및 조회·목록 계약 없음 |
| 수정 이력 | `article_revisions(article_id, revision_no, draft_json, created_at)` 복합 키. 동일 JSON은 이력을 늘리지 않고 기사별 최근 200개만 보존 | 별도 UUID `revision_id`, 충돌 버전 검사, 영구 불변 Snapshot 없음. 이전 이력은 정리되며 사진 이전 작업은 저장 JSON을 갱신할 수 있음 |
| 자료 | `sources(id, workspace_id, name, text, original BLOB, created_at)`. `save_source`는 내부 함수이며 ID는 원본 바이트 SHA1 앞 16hex. 동일 ID 재등록 시 텍스트는 갱신 | 공개 생성·목록·삭제, UUID/legacy alias, SourceChunk 및 자료 Revision 계약 없음 |
| 자료 참조 | 기사 `draft_json` 안의 `sources[]`. 읽을 때 ID가 DB에 있으면 텍스트를 덧붙임 | 외래키 기반 `ArticleSource` 테이블·참조 무결성 없음 |
| 사진 | `media` 테이블에 원본 바이트를 중복 제거, 원고에 `media:<32hex>` 참조 | 공통 `MediaAsset` 조회·메타데이터·공유 계약 없음 |
| AI 검증 | `factcheck_memo`, `embedding_vectors` 캐시. 입력 문장·자료 조합의 재계산을 피함 | `Claim`, `EvidenceLink`, `VerificationRun/Issue`와 동일한 기록으로 취급 불가 |
| STT / 작업 | 전사 실행 결과 반환 | `Transcript/Segment`, `ProcessingJob`의 공통 저장·조회 없음 |

DB는 `vault.py`의 SQLCipher로 호출마다 열며 기기 키는 OS 자격 증명 저장소에 둔다. 과거 평문 파일은 `import_legacy_files()`로 가져올 수 있지만 실제 저장 위치는 암호화 DB다. `sources` 원본과 기사 사진은 로컬 저장 대상이며, 전체 원고/자료를 Supabase 메인 DB에 저장한다는 구현 근거는 없다.

## 3. 누락·미정의·중복 점검

| 구분 | 항목 | 현재 판단과 필요한 결정 |
|---|---|---|
| 누락 | 지도/라이브러리 읽기 | `getKnowledgeMap`, 기사·자료 목록, 프로젝트 목록, SourceChunk·근거 조회 라우트와 named method가 없다. `latestArticle`은 한 기사만 보여준다. 누가 읽기 모델을 조립하고 페이징/필터·범위를 어떻게 정할지 합의 |
| 누락 | 안정된 실행 기준 | Snapshot 생성, revision UUID, 낙관적 충돌 검사와 `snapshot_id` 기반 검증/변환 입력이 없다. 현재 `revision_no`는 최대 200개 보존 정책이므로 오래된 실행을 재현할 보증이 없다 |
| 누락 | 자료 수명 주기 | Source 생성·목록·삭제 공개 계약과 SourceChunk 영속화, 원본/편집본의 Revision 소유가 없다. Data Map의 업로드·수정·삭제 UI는 현재 데모 상태로 격리 |
| 미정의 | ID 매핑 | 현재 Article 32hex, Source 16hex, media 32hex와 목표 UUID를 연결할 alias·migration·FK 규칙, 충돌·기존 링크 처리 방식 미합의. UI에서 임의 UUID를 새 공식 ID로 저장하지 않음 |
| 미정의 | 인증·전송 | 단일 로컬 workspace와 목표 bearer/workspace 권한 규칙의 대응, HTTP와 실제 pywebview IPC의 동일 응답/오류·바이트 전송 방식 미검증 |
| 미정의 | 근거와 엔티티 범위 | KnowledgeMap의 `entities/edges`만으로 기사·파일·프로젝트 목록을 제공할 수 없다. 각 컬렉션의 Core 소유자, Source/Claim/Evidence의 식별자·기사 귀속·원문 위치를 정의 |
| 중복 위험 | Source·Claim·Evidence | Data Map 또는 기능별 SQLite/Supabase에 별도 정본을 만들면 원본과 근거가 갈라진다. Core 소유 데이터의 읽기 투영으로 연결 |
| 중복 위험 | 자료 입력·파일 저장 | `/api/materials/extract`(추출), 내부 `save_source`(보관), 데모 업로드를 서로 다른 공식 Source 생성으로 취급하면 중복. 하나의 생성 절차와 자료 ID를 확정 |
| 중복 위험 | 기사 수정본/검증 캐시 | `article_revisions`와 새 Revision 저장소를 동시에 정본으로 유지하거나 `factcheck_memo`를 VerificationRun으로 복제하지 않도록 전환/소유 규칙 확정 |
| 중복 위험 | 시연 그래프 | 프로토타입의 합성 프로젝트·노드·연결은 공식 KnowledgeEdge가 아니다. 실데이터 모드에서는 명시된 참조만 표시 |

## 4. 문서 적용 규칙과 다음 합의

1. 현행 호출은 `core-api.js`의 named method + `/api/*` HTTP, 현행 저장은 `vault.py` SQLCipher 스키마로 설명한다. ERD/OpenAPI의 UUID·Snapshot·KnowledgeMap은 **목표**로 표시한다.
2. Core 담당자와 Article/Source ID alias, 자료 생성·조회, Snapshot/검증 근거, 지도 읽기 모델을 결정하고 동일 의미의 HTTP·IPC 계약을 작성한다.
3. 실제 기사 한 건으로 저장 → 자료 연결 → 검증 → 지도 조회를 확인한 뒤 v1.0을 확정한다. 현행 코드만으로 전 단계를 통과했다고 표시하지 않는다.
