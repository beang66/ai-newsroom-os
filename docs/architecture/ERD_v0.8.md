# AI-Newsroom OS — 공통 DB 구조(ERD) v0.8

상태: **팀 검토용 초안 — 아직 DB에 바로 적용하지 않음**

> ERD는 어렵게 생각할 필요가 없습니다. **“어떤 데이터를 저장하고, 서로 어떻게 연결할 것인가”를 정한 DB 설계도**입니다.

> **현재 저장소와의 차이 (2026-10-07):** `feature/app-core`의 로컬 SQLCipher에는 `articles`, `article_revisions`, `sources`, `media`, 검증/임베딩 캐시가 구현되어 있다. 기사 ID는 32hex, Source ID는 16hex, 수정 이력 키는 `(article_id, revision_no)`다. 아래 UUID v5 alias, Snapshot, ReportingProject, SourceChunk, Claim/EvidenceLink 등은 **현재 DB 스키마가 아니라 목표 설계**다. 실제 스키마와 미정의 전환 규칙은 [Core 구현 점검](./CORE_REALITY_AUDIT_2026-10-07.md)을 참조한다.

## 1. 먼저 알아둘 핵심 용어

| 개발 용어 | 쉬운 뜻 | 우리 프로젝트 예시 |
|---|---|---|
| `Workspace` | 한 프로젝트의 공용 작업공간 | AI-Newsroom OS 팀 공간 |
| `Article` | 기사 자체 | 기사 A |
| `ArticleRevision` | 작성 중 저장된 기사 버전 | 자동저장 1회차, 2회차 |
| `ArticleSnapshot` | 특정 시점의 수정 불가능한 기사 복사본 | 검증 버튼을 누른 순간의 기사 |
| `ReportingProject` | Workspace 안의 취재건/컬렉션 | 공공자전거 이용량 취재 |
| `ArticleSource` | 기사와 사용 자료의 연결 | 기사 A가 보고서 B를 주 자료로 사용 |
| `Source` | 참고 자료 원본 | PDF, URL, 메모 |
| `SourceChunk` | 검색하기 좋게 나눈 자료 조각 | PDF 3쪽의 특정 문단 |
| `Transcript` | STT 전체 변환문 | 인터뷰 전체 녹취 |
| `TranscriptSegment` | 녹취를 시간/화자별로 나눈 조각 | 02:31~02:45 기자 발언 |
| `Claim` | 기사에서 사실 확인할 주장 | “매출이 20% 증가했다” |
| `EvidenceLink` | 주장과 근거 위치의 연결 | 위 주장 ↔ 보고서 3쪽 표 |
| `VerificationRun` | 기사 검증을 한 번 실행한 기록 | 검증 실행 #1 |
| `VerificationIssue` | 검증에서 발견한 문제 | 숫자 근거 부족, 인명 오류 |
| `VerificationSource` | 검증 실행과 검토 자료의 연결 | 검증 #1이 보고서 B를 사용 |
| `MediaAsset` | 사진·영상·생성 이미지 파일 정보 | 취재 사진, 카드뉴스 이미지 |
| `PlatformOutput` | 플랫폼에 맞게 변환된 결과 | 인스타 카드뉴스 결과 |
| `ProcessingJob` | 시간이 걸리는 작업의 실행 기록 | STT/AI 검증/렌더링 진행 상태 |
| `KnowledgeEntity` | 기사 속 주요 대상 | 사람, 기관, 장소 |
| `KnowledgeEdge` | 대상끼리의 관계 | A회사 → 인수 → B회사 |

## 2. 가장 중요한 설계 원칙 7개

1. 모든 주요 데이터는 `Workspace` 안에서 관리합니다.
2. `Article`은 기사 자체이고, 자동저장 이력은 `ArticleRevision`으로 따로 쌓습니다.
3. 검증이나 플랫폼 변환을 시작할 때는 그 순간의 기사를 `ArticleSnapshot`으로 고정합니다.
4. 자료(`Source`)와 사진(`MediaAsset`)은 한 기사에만 묶지 않습니다. 다른 기사에서도 다시 사용할 수 있습니다.
5. 검증할 주장(`Claim`)은 고정된 Snapshot을 기준으로 만들어야 나중에 같은 결과를 다시 확인할 수 있습니다.
6. 근거(`EvidenceLink`)는 “어떤 자료의 어느 문장/구간인지”까지 연결합니다.
7. AI 검증, STT, 렌더링처럼 시간이 걸리는 작업은 모두 `ProcessingJob`으로 상태를 통일합니다.

## 3. 전체 관계 — 사람 눈으로 읽는 버전

```text
작업공간 Workspace
│
├─ 취재건 ReportingProject
│   └─ 기사/자료를 묶는 컬렉션
│
├─ 기사 Article
│   ├─ 작성/자동저장 이력 ArticleRevision
│   ├─ 검증·변환용 고정본 ArticleSnapshot
│   │   ├─ 확인할 주장 Claim
│   │   │   └─ 근거 연결 EvidenceLink
│   │   ├─ 검증 결과 VerificationRun / VerificationIssue
│   │   └─ 플랫폼 변환 결과 PlatformOutput
│   └─ 기사에서 사용한 자료 ArticleSource
│
├─ 참고 자료 Source
│   └─ 검색용 자료 조각 SourceChunk
│
├─ 검증 실행 VerificationRun
│   └─ 검토에 사용한 자료 VerificationSource
│
├─ STT 녹취 Transcript
│   └─ 시간/화자별 구간 TranscriptSegment
│
├─ 사진·영상 MediaAsset
├─ 사람/기관/장소 KnowledgeEntity
│   └─ 관계 KnowledgeEdge
└─ 오래 걸리는 작업 기록 ProcessingJob
```

## 4. ID 규칙

기사·사진·출처 등 핵심 데이터에는 **팀 전체에서 겹치지 않는 공통 ID(UUID 호환 형식)** 를 사용합니다.

기존 기능에서 이미 쓰고 있는 `articleId`, `card_id`, `document_id` 등을 당장 버릴 필요는 없습니다. 기존 ID는 `legacy_id` 또는 `external_ref`로 보관하고, 기능끼리 데이터를 주고받을 때는 새 공통 ID를 사용합니다.

Adapter에서 같은 legacy ID를 여러 번 변환해도 같은 canonical ID가 나오도록 **UUID v5**를 사용합니다. 팀이 고정한 namespace UUID 아래에서 `원본시스템:엔티티종류:legacy_id` 문자열을 이름으로 사용합니다. 예: `app-core:article:9f...`. 원래 값은 반드시 `legacy_id`/`external_ref`에도 보존하며, 새 데이터는 UUID v4를 생성합니다.

쉽게 말하면:

```text
기존 기능 내부 ID → 보관 가능
팀 기능끼리 연결하는 ID → 공통 ID 사용
```

## 5. 핵심 데이터별 필요한 항목

### Article — 기사
필수: `id`, `workspace_id`, `title`, `status`  
추가: 현재 편집 버전을 가리키는 `current_revision_id`, 기존 ID를 보관하는 `legacy_id`

### ArticleRevision — 자동저장/수정 이력
필수: `id`, `article_id`, `revision_no`, 제목, 기사 본문, 저장 시간

`revision_no`는 같은 기사의 저장 순서입니다. 예: 1 → 2 → 3.

### ArticleSnapshot — 검증/변환용 고정본
필수: `id`, `article_id`, `revision_id`, 제목, 본문, `content_hash`, 생성 시간

**생성 후 기사 내용은 수정하지 않습니다.** 내용이 바뀌면 새 Snapshot을 만듭니다.

### ReportingProject / ArticleSource — 취재건과 기사 자료
`ReportingProject` 필수: `id`, `workspace_id`, `name`. 기존 critique-organizer의 `projects`를 받는 Workspace 내부 취재 컬렉션입니다.

`ArticleSource` 필수: `article_id`, `source_id`, `role`. 한 자료를 여러 기사에서 재사용할 수 있도록 다대다 연결로 둡니다. `role`은 `primary`, `supporting`, `background` 중 하나입니다.

### Source / SourceChunk — 자료와 자료 조각
`Source`에는 PDF·URL·메모 같은 원본 자료 정보를 저장합니다.  
`SourceChunk`에는 RAG 검색을 위해 나눈 문단/구간과 원본 위치를 저장합니다.

### Transcript / TranscriptSegment — STT
`Transcript`는 전체 녹취, `TranscriptSegment`는 시간·화자별 작은 구간입니다. 근거로 사용할 수 있도록 시작/끝 시간도 저장할 수 있습니다.

### Claim — 검증할 주장
필수: `id`, `snapshot_id`, `ordinal`, 주장 문장(`text`), 기사 안에서의 위치(`start_offset`, `end_offset`)

예: `“서울시 예산이 전년 대비 20% 증가했다.”`

### EvidenceLink — 주장 ↔ 근거
한 Claim이 어떤 `SourceChunk` 또는 `TranscriptSegment`를 근거로 사용하는지 연결합니다.

관계 예시:
- `support` = 주장을 뒷받침
- `contradict` = 주장과 충돌
- `context` = 판단에 필요한 참고 정보
- `unresolved` = 아직 판단하기 어려움

검색 점수(`retrieval_score`)는 **검색 결과가 질문과 얼마나 관련 있는지**를 나타내는 값이지, “이 정보가 90% 사실이다” 같은 진실 확률이 아닙니다.

### VerificationRun / VerificationIssue — 검증 실행과 문제점
`VerificationRun`은 검증 버튼을 한 번 누른 실행 기록입니다.  
`VerificationIssue`는 그 실행에서 발견한 각각의 문제입니다.

예: 숫자 근거 부족 / 인명 오기 / 출처 불일치 / 법적 위험.

`VerificationRun.status`는 공통 작업 상태 5개를 사용합니다. `VerificationIssue.category`는 `evidence_gap`, `factual_conflict`, `attribution_error`, `numeric_error`, `legal_risk`, `style`, 심각도는 `info`, `warning`, `error`만 사용합니다.

`VerificationSource` 필수: `verification_run_id`, `source_id`. 기존 `review_documents`가 나타내는 “이번 검증에서 사용한 자료” 관계를 보존합니다.

### MediaAsset — 사진·영상·이미지
기존 `photo_assets`를 장기적으로 이 구조에 연결합니다. 파일 위치, 파일명, 형식, 크기, 캡션, 출처, 촬영일, AI 생성 여부 등을 관리합니다.

### PlatformOutput — 플랫폼 변환 결과
Instagram 카드뉴스, Threads 글 등으로 변환된 결과입니다. 반드시 어떤 `ArticleSnapshot`을 변환했는지 연결합니다.

### ProcessingJob — 시간이 걸리는 작업
공통 상태는 아래 5개만 사용합니다.

```text
queued     = 대기
running    = 실행 중
succeeded  = 성공
failed     = 실패
cancelled  = 취소
```

진행률, 입력값 위치, 결과 위치, 오류 내용, 시작/종료 시간도 함께 저장할 수 있습니다.

### KnowledgeEntity / KnowledgeEdge — Data Map
`KnowledgeEntity`는 사람·기관·장소 등 주요 대상이고, `KnowledgeEdge`는 그 사이의 관계입니다.

예: `삼성전자 → 발표함 → 신규 투자 계획`

Data Map은 이 데이터를 읽어 화면에 보여주는 기능입니다. **Data Map만을 위한 별도 RAG DB를 다시 만들지 않습니다.**

## 6. 기존 기능을 새 구조에 어떻게 연결하나

| 지금 쓰는 것 | 앞으로 연결할 것 |
|---|---|
| 기존 `draft.articleId` | `Article.id` + 필요하면 `legacy_id` |
| critique-organizer `projects` | `ReportingProject` |
| 기사에서 사용한 자료 목록 | `ArticleSource` |
| JSON 전체 자동저장 | `ArticleRevision` |
| `photo_assets` | `MediaAsset` |
| RAG의 `document_id/block_id` | `Source` + `SourceChunk` |
| RAG 검색 위치 정보 | `SourceChunk` / `EvidenceLink` |
| renderer의 `card_id` | `PlatformOutput` 또는 카드별 보조 ID |
| 로컬 이미지 파일 경로 | `MediaAsset.object_ref` |
| factcheck의 검증 문장 | `Claim` |
| critique-organizer `review_documents` | `VerificationSource` |
| 기능별 제각각인 작업 상태 | `ProcessingJob` |

## 7. 팀원이 ERD를 볼 때 확인할 것

각자 자기 기능만 보고 아래를 확인하면 됩니다.

- 저장해야 하는 값이 이 문서에 빠져 있는가?
- 다른 기능으로 넘겨야 할 데이터에 공통 ID가 있는가?
- 한 기사에 여러 개가 필요한 데이터인데 1개만 저장하도록 되어 있지는 않은가?
- 기존 DB를 전부 뜯어고치지 않고 연결부(adapter)로 변환할 수 있는가?

빠진 것이 있다면 **코드부터 임의로 바꾸지 말고 PR에 먼저 의견을 남깁니다.**

## 8. 적용 시점

적용 보류 범위와 v1.0 확정 조건은 `CONTRACT_ALIGNMENT_v0.8.md` §11을 따릅니다. 이 ERD는 먼저 Vertical Slice fixture와 Adapter 검증에 사용합니다.
