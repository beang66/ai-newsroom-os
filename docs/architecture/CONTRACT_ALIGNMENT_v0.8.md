# AI-Newsroom OS — 팀 공통 개발 규칙 v0.8

상태: **팀 검토용 초안 / v1.0 확정 전**  
작성일: 2026-10-04  
통합 설계 담당: 안정빈

> 이 문서는 **강창희가 만든 App Core를 공통 실행 기반으로 두고, 각 담당 기능을 HTTP 통합 단계와 최종 IPC 전환에서 같은 규칙으로 연결하기 위한 문서**입니다.

> **구현 상태 확인 (2026-10-07):** 아래의 Snapshot, 공통 UUID, SourceChunk, Claim/EvidenceLink, ProcessingJob 및 KnowledgeMap은 **v0.8 목표**이며 현재 Core의 구현 사실이 아니다. 현행 Core는 `core-api.js` named method → `/api/*` HTTP → Python managers, SQLCipher `articles/article_revisions/sources/media` 저장을 제공한다. 현재 `/api/articles/latest`는 가장 최근 기사 한 건만 조회하고, IPC 브리지는 미구현이다. 실제 메서드·저장 스키마 및 누락·미정의·중복 항목은 [Core 구현 점검](./CORE_REALITY_AUDIT_2026-10-07.md)을 따른다. 아래 실행 구조의 IPC/Supabase/Backend 연결 설명은 제품 설계와 구현 확인 범위를 구별해 읽는다.

## 0. 현재 Core와 목표 실행 구조

| 구분 | 현재 코드에서 확인 | v0.8 목표 / 확인 필요 |
|---|---|---|
| UI 호출 | `createAppApi()` → `core-api.js` named methods → HTTP `/api/*` → Python `api.py`/managers | 기능별 메서드·인자와 오류를 공통 계약으로 고정 |
| 로컬 저장 | SQLCipher의 `articles`, `article_revisions`, `sources`, `media` 및 검증 캐시. 기기 키는 OS 보안 저장소 | 공통 UUID/alias, Snapshot, 조회·자료 수명 주기 정의 |
| EXE/IPC | `ipc.js`는 브리지 호출 형태를 준비했으나, 확인한 Python 라우터에는 해당 브리지 구현이 없다. 브리지 부재 시 `mode:"ipc"`도 HTTP로 전환 | 실제 pywebview 브리지 연결과 HTTP/IPC 동일 응답 검증 |
| 클라우드/외부 기능 | 이 점검은 로컬 Core 저장·호출 파일을 기준으로 한다 | Auth·메타데이터·공유·외부 AI의 저장 경계는 기능별 통합 시 검증 |

기사 본문과 자료 원본은 현재 로컬 암호화 DB에 저장된다. OpenAPI의 `/api/core/v0.8/*` 및 ERD의 새 엔티티는 바로 호출하거나 마이그레이션할 수 있는 구현 API/스키마로 해석하지 않는다. 상세 호출과 누락·중복 점검은 [Core 구현 점검](./CORE_REALITY_AUDIT_2026-10-07.md)을 따른다.

## 1. 앞으로 개발하는 순서

기존 코드를 모두 버리고 다시 만들지 않습니다. 현재 구현을 확인한 뒤 공통 규칙에 연결합니다.

```text
① 현재 기능 확인
→ ② 공통 DB/API 초안에 맞추기
→ ③ 실제 기사 1건으로 전체 연결 테스트
→ ④ 문제 수정
→ ⑤ v1.0 규칙 확정
→ ⑥ 각 기능 개발 계속
```

개발 용어로는 다음과 같습니다.

`Reality Audit → Contract v0.8 → Vertical Slice → Contract v1.0 Freeze`

- **Reality Audit** = 지금 실제로 만들어진 기능과 저장 방식을 확인하는 작업
- **Contract** = 기능끼리 데이터를 주고받을 때 지켜야 하는 공통 약속
- **Vertical Slice** = 실제 데이터 1건을 처음부터 마지막 기능까지 통과시키는 전체 연결 테스트
- **Freeze** = 팀이 합의한 뒤 이 규칙을 함부로 바꾸지 않기로 확정하는 것

## 2. 담당 영역

| 영역 | 담당 | 실무 책임 |
|---|---|---|
| App Core / 기사 작성·자동저장 | 강창희 | Browser+EXE 공통 Core, UI↔Core 경계, 기사 저장·검증·RAG 기반 |
| 자료 등록/RAG/검색 | 강창희 | 자료 분할, 검색, 원문 위치 추적 |
| 기사 검증 | 강창희 | 주장 검증, 문제 표시, 근거 연결 |
| STT/녹취 | 박소현 | 음성 변환, 시간/화자별 문장 구간 |
| 구조/미리보기/미디어 | 고서연 | 기사 구조, 미리보기, 사진·영상 |
| 플랫폼 변환 | 이정민 | Instagram 등 플랫폼별 변환/렌더링 |
| 자료 아카이브/Data Map | 안정빈 | 자료 관계, 보관/조회, Data Map |
| 공통 DB/API/기능 연결 | 안정빈 | ERD, API 규칙, 전체 통합 점검 |
| 전체 연결 테스트 | 전원 | 실제 기사 1건 E2E 테스트 |

**중요:** Data Map 담당자가 별도의 RAG 검색 기능을 또 만들 필요는 없습니다. RAG/검증에서 만든 출처·근거·관계 데이터를 Data Map이 읽어서 보여줍니다.

## 3. 팀 공통 데이터 구조

### 기사 관련
- `Article` = 기사 자체
- `ArticleRevision` = 작성 중 자동저장된 버전
- `ArticleSnapshot` = 검증/플랫폼 변환을 시작하는 순간 고정한 기사본

### 자료/RAG 관련
- `Source` = PDF, URL, 메모 등 원본 자료
- `SourceChunk` = RAG 검색을 위해 원본을 나눈 작은 문단/구간

### STT 관련
- `Transcript` = 전체 녹취
- `TranscriptSegment` = 시간·화자별 녹취 구간

### 검증 관련
- `Claim` = 사실 확인이 필요한 기사 속 주장
- `EvidenceLink` = 그 주장과 실제 근거 문장/구간의 연결
- `VerificationRun` = 검증 한 번의 실행 기록
- `VerificationIssue` = 검증에서 발견한 개별 문제

### 미디어/플랫폼 관련
- `MediaAsset` = 사진·영상·생성 이미지 정보
- `PlatformOutput` = Instagram 카드뉴스 등 플랫폼 변환 결과

### Data Map 관련
- `KnowledgeEntity` = 사람·기관·장소 등 주요 대상
- `KnowledgeEdge` = 대상끼리의 관계

### 공통 작업 상태
- `ProcessingJob` = STT, AI 검증, 렌더링 등 시간이 걸리는 작업 기록

## 4. 왜 `Revision`과 `Snapshot`을 나누나

예를 들어 기자가 기사를 쓰면서 자동저장이 계속 되고 있다고 가정합니다.

검증 버튼을 누른 순간 기사가 A였는데, 검증이 진행되는 동안 기자가 내용을 B로 수정하면 검증 결과가 어느 문장을 기준으로 한 것인지 헷갈릴 수 있습니다.

그래서:

```text
ArticleRevision = 계속 수정 가능
ArticleSnapshot = 실행 순간 복사해 둔 수정 불가능한 버전
```

검증과 플랫폼 변환은 Snapshot ID를 받아 실행합니다.

## 5. 주장과 근거는 한 번 만들고 같이 사용

기사에 이런 문장이 있다고 가정합니다.

> “A사의 매출은 지난해보다 20% 증가했다.”

이 문장이 `Claim`입니다.

그리고 보고서 3쪽 표가 이 내용을 뒷받침한다면:

```text
Claim
  ↓ EvidenceLink
보고서(Source)의 3쪽 특정 문단(SourceChunk)
```

이 연결을 RAG, 기사 검증, Data Map, Archive가 같이 사용합니다. 기능별로 같은 출처 정보를 따로 저장하지 않습니다.

## 6. 시간이 걸리는 작업의 상태 통일

AI 검증, STT, 이미지 렌더링 작업은 실행 시간이 다릅니다. 화면과 백엔드가 같은 상태를 이해하도록 아래 5개로 통일합니다.

| 코드 | 화면에서 보여줄 뜻 |
|---|---|
| `queued` | 대기 중 |
| `running` | 처리 중 |
| `succeeded` | 완료 |
| `failed` | 실패 |
| `cancelled` | 취소 |

이 공통 실행 기록을 `ProcessingJob`이라고 부릅니다.

## 7. 실제 기사 1건으로 반드시 해볼 전체 테스트

v1.0을 확정하기 전에 실제 기사 하나를 아래 순서로 통과시킵니다.

```text
자료 업로드
→ 자료를 검색용으로 분할
→ RAG 검색
→ 기사 작성/자동저장
→ 기사 Snapshot 생성
→ 주장과 근거 연결
→ 기사 검증
→ Data Map 조회
→ 플랫폼별 변환
→ 저장/내보내기
```

중간에서 ID가 사라지거나, 필요한 값이 없거나, 다음 기능이 데이터를 읽지 못하면 그 지점이 우리가 수정할 부분입니다.

## 8. 개발할 때 지킬 팀 규칙

1. 자기 브랜치에서 DB/API 형식을 혼자 새로 정하지 않습니다.
2. 기존 코드가 잘 작동하면 가능한 한 유지하고, **App Core의 공통 호출 경계에 adapter(연결부)** 를 붙입니다.
3. 기사·출처·사진 등 다른 기능과 공유하는 데이터에는 공통 ID를 사용합니다.
4. 같은 Source/Claim/Evidence를 기능마다 별도 DB에 중복 저장하지 않습니다.
5. API나 DB 구조 변경이 필요하면 코드보다 먼저 PR에서 팀에 공유합니다.
6. “내 기능에서 된다”가 완료 기준이 아닙니다. **앞 기능의 데이터를 받고 결과를 다음 기능으로 넘기며, HTTP 통합 단계와 최종 IPC 전환에서 같은 의미로 동작해야 완료**입니다.

## 9. 지금 완료된 것

- [x] `main` 및 주요 기능 브랜치의 저장/API 방식 점검
- [x] 현재 구현 상태 점검표 작성
- [x] ERD v0.8 초안 작성
- [x] OpenAPI v0.8 초안 작성
- [x] 전체 연결 테스트용 예시 데이터 작성

## 10. 지금부터 팀원이 할 일

각자 자기 기능에서 아래 5개만 확인합니다.

1. **ID:** 공통 ID를 입력받고 결과에도 넘길 수 있는가?
2. **DB:** 내 기능에 꼭 필요한 저장 항목이 ERD에서 빠졌는가?
3. **API:** 현재 API를 공통 API 형식에 연결할 수 있는가?
4. **작업 상태:** 오래 걸리는 작업을 대기/처리/완료/실패/취소로 표현할 수 있는가?
5. **연결:** 실제 기사 하나를 받아 처리하고 다음 기능으로 결과를 넘길 수 있는가?

문제가 있으면 PR에 **“현재 방식 / 문제가 되는 이유 / 필요한 변경”** 세 가지만 적습니다.

## 11. 지금은 하지 않는 것

아래는 전체 연결 테스트가 성공한 뒤 진행합니다.

- Supabase를 전체 서비스의 메인 DB라고 가정해 바로 구조를 변경하기
- `feature/su4228-article-workspace`를 App Core에 다시 병합하기
- critique-organizer의 SQLite를 두 번째 공식 DB로 채택하기
- UI에서 node·renderer·Supabase·critique server를 직접 호출하는 새 코드 추가하기
- Vertical Slice와 팀 리뷰 전에 아키텍처 문서를 `main`에 병합하기
- Contract v1.0 확정
- 복잡한 Data Map 시각화 고도화
- 그래프 DB 도입
- 고급 RAG 재정렬/추천 기능
- CMS 고급 연동

지금의 목표는 기능을 늘리는 것이 아니라 **팀원들의 기능이 하나의 서비스처럼 연결되는 최소 공통 기반을 만드는 것**입니다. HTTP adapter와 최종 IPC가 같은 Core named method·payload로 Vertical Slice를 통과한 뒤 v1.0 확정과 `main` 병합을 검토합니다.
