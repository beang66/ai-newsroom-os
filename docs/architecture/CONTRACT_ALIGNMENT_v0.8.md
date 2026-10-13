# AI-Newsroom OS — 팀 공통 개발 규칙 v0.8

상태: **팀 검토용 초안 / v1.0 확정 전**  
작성일: 2026-10-04  
통합 설계 담당: 안정빈

> 이 문서는 **강창희가 만든 App Core를 공통 실행 기반으로 두고, 각 담당 기능을 HTTP 통합 단계와 최종 IPC 전환에서 같은 규칙으로 연결하기 위한 문서**입니다.

> **구현 상태 확인 (2026-10-13):** Snapshot, 공통 ID 변환(UUID v5), SourceChunk(색인), 작업 조회(`ProcessingJob`: 자료 색인), KnowledgeMap, MediaAsset, Transcript 저장은 **구현됐다**. 아직 구현되지 않은 것은 **Claim/EvidenceLink/VerificationRun 의 정규화 저장**(판정 결과는 `factcheck_memo` 캐시와 응답으로만 있음), 검색·검증 실행·플랫폼 결과 목록 조회 계약 4개(`x-status: deferred`), 다중 작업공간(`/workspaces/...` 경로)이다. 호출은 `core-api.js` named method → `/api/*` → Python managers 이며, 창에서는 pywebview IPC 브리지, `--browser`·시험에서는 HTTP 로 **같은 응답**을 준다. 계약 operation 별 실제 경로·본문은 `OPENAPI_v0.8.yaml` 의 `x-implementation` 과 [계약과 구현의 차이](./CONTRACT_VS_IMPLEMENTATION_v0.8.md)에 있고, 저장·누락 점검은 [Core 구현 점검](./CORE_REALITY_AUDIT_2026-10-07.md)을 따른다.

## 0. 현재 Core와 목표 실행 구조

| 구분 | 현재 코드에서 확인 | v0.8 목표 / 확인 필요 |
|---|---|---|
| UI 호출 | `createAppApi()` → `core-api.js` named methods → (창) IPC 브리지 / (브라우저·시험) HTTP `/api/*` → Python `Handler`/managers. 같은 `Handler`를 거쳐 두 전송의 응답·오류가 같다 | 호출 이름은 계약 operationId 와 통일(2026-10-12). 경로·본문은 앱 구현이 정본 |
| 로컬 저장 | **계정별** SQLCipher 파일(`vault-<계정 id>.db`): 기사·수정 이력(UUID id)·고정본(Snapshot)·자료·SourceChunk·색인 상태·미디어 자산·작업·녹취·팩트체크 기록. 기기 키는 OS 보안 저장소 | 다중 작업공간·접근 권한은 없음(계정 안에서 작업공간 하나) |
| EXE/IPC | `desktop/ipc_bridge.py`(`core`/`coreBytes`)를 pywebview `js_api`로 연결. EXE 빌드(IPC·HTTP 두 변형)와 실제 창 스모크 통과 | 팀 브랜치 병합 뒤 통합 점검에서 HTTP/IPC 동일 응답 재확인 |
| 클라우드/외부 기능 | Supabase 는 **인증(회원가입·로그인·갱신 토큰)** 만. 기사·자료는 서버에 저장하지 않음. AI·임베딩은 백엔드(Render) 프록시 경유(무저장) | 서버 저장·공유(S1)는 미구현. "클라우드 백업" 설정은 값만 저장 |

기사 본문과 자료 원본은 로그인한 계정의 로컬 암호화 DB에 저장된다. OpenAPI의 `/api/core/v0.8/*` 경로는 다중 작업공간을 도입할 때의 목표 형태이며 지금 호출하는 경로는 `/api/*` 이다(각 operation 의 `x-implementation` 참조). 상세 호출과 누락·중복 점검은 [Core 구현 점검](./CORE_REALITY_AUDIT_2026-10-07.md)을 따른다.

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
- [x] Core 구현: 고정본(Snapshot)·ID 변환·SourceChunk 색인·작업 조회·KnowledgeMap·MediaAsset·Transcript (2026-10)
- [x] 호출 이름·경로 통일과 대응표(`CONTRACT_VS_IMPLEMENTATION_v0.8.md`), 계약에 `x-implementation` 기록 (2026-10-12)
- [x] HTTP/IPC 동일 응답 시험과 EXE 스모크(IPC·HTTP 빌드), 팀원 PC 첫 실행 확인 (2026-10-12)
- [ ] 팀원 브랜치 병합 후 실제 기사 1건 끝까지 통합 점검, 팀 리뷰 5가지 질문 답변, Contract v1.0 확정

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
