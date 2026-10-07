# AI-Newsroom OS Project Operating Model v1.0

> 적용일: 2026-10-05  
> 개발 Freeze 목표: 2026-10-09  
> 안정화·문서화 완료: 2026-10-16

이 문서는 AI-Newsroom OS의 **의사결정 권한, 완료 기준, 변경 관리, 이슈 의존성, 품질 지표, 문서 Source of Truth**를 정의합니다.

## 1. Decision Rights / DRI

| 영역 | DRI | 책임 |
|---|---|---|
| Product Scope / Priority / User Flow | 안정빈 | 무엇을 만들고 무엇을 하지 않을지, MVP 범위, 사용자 흐름, 우선순위 |
| Domain Contract / ERD / Integration | 안정빈 | 공통 ID·Entity·기능 간 데이터 계약, Vertical Slice 연결 기준 |
| App Core / API / Runtime / Storage implementation | 강창희 | Core 내부 구현, 최종 IPC 런타임, HTTP 통합 테스트 경계, 저장·처리 방식 |
| Workflow UI / STT | 박소현 | 녹취 사용 경험, Transcript 흐름, 공통 UI 상태 |
| Authoring / Preview / Media | 고서연 | 기사 작성, 미리보기, 헤드라인·요약, Media UX |
| Distribution / Automation | 이정민 | 플랫폼 변환, n8n, Renderer, PlatformOutput |
| QA Priority / Acceptance | 안정빈 | P0/P1 분류, 전체 E2E 수용 기준 |
| Feature Bug Fix | 각 Feature Owner | 자기 영역 오류 수정과 재검증 |

### 원칙
- 최종 제품 런타임은 **Windows EXE + IPC 단일 방식**입니다. Browser/HTTP는 별도 제품이 아니라 기능 통합을 위한 임시 테스트 경로입니다.
- DRI는 **혼자 결정하는 사람**이 아니라 결과를 끝까지 책임지는 사람입니다.
- 구현 방식은 Feature/Core Owner에게 맡기고, 다른 팀원은 인터페이스와 영향만 리뷰합니다.
- 역할 변경이나 공동 담당 추가는 개인 간 합의만으로 확정하지 않습니다.

## 2. Definition of Done

모든 기능은 다음 상태를 사용합니다.

1. **Implemented** — 담당 브랜치/로컬에서 기능이 동작
2. **Integrated** — App Core 및 앞뒤 기능과 공통 ID/API로 연결
3. **Verified** — 실제 기사 1건 E2E 시나리오에서 정상 동작
4. **Done** — main 기준 동작 + 실패/재시도 또는 복구 가능 + 문서 업데이트 완료

> **Done means integrated.**  
> 자기 브랜치에서 동작하는 것만으로는 완료가 아닙니다.

## 3. Issue Dependency Rule

모든 통합 이슈에는 다음 네 항목을 둡니다.

- **Owner**
- **Blocked by**
- **Blocks**
- **Done when**

선행 작업이 완료되지 않았으면 구현을 억지로 진행하기보다 mock/fixture로 인터페이스만 검증합니다.

현재 Critical Path:

```text
#14 Contract v0.8 Review
        ↓
#15 App Core Boundary
        ↓
#5 Article Revision/Snapshot
        ↓
#7 RAG ─┬─ #10 Verification
#16 STT │
#9 Structure
#17 Media
#18 Platform
#19 Data Map
        ↓
#20 HTTP One-Article Vertical Slice
        ↓
#24 IPC 연결·EXE 패키징
        ↓
#21 Contract v1.0 Freeze
        ↓
#22 P0/P1 Stabilization
        ↓
#23 Portfolio / Final Deliverables
```

기능별 작업은 가능한 범위에서 병렬 진행하되, #20 이전까지 공통 데이터 계약에 연결되어야 합니다.

### Runtime 정정 — 2026-10-05
- 최종 제품은 **EXE/IPC 단일 런타임**입니다.
- 현재 HTTP/local server는 팀원 기능을 보존하면서 연결하기 위한 **통합 테스트용 transport**입니다.
- 저장소의 IPC 코드는 사전 테스트본이며 Python 실제 연결은 아직 구현 전입니다.
- 개발 순서는 **각자 기능 개발 → 요청 코드를 api.js에 집중 → HTTP 통합 Vertical Slice → Python↔IPC 연결 → EXE 테스트/패키징**입니다.
- 각 담당자는 자기 기능 구현 방식을 자유롭게 유지합니다. Core 통합을 위해 미리 IPC로 다시 만들 필요가 없습니다.

### Frontend Request Boundary
프론트엔드의 `fetch`, `axios` 등 서버/Core 요청은 화면/버튼에 직접 두지 않고 **기능별 함수로 `api.js` 한 곳에 모읍니다.**

```text
UI / Button → api.js → 현재 HTTP 테스트
                      ↓ 이후 강창희가 교체
                 최종 IPC → Python Core
```

이 규칙의 목적은 HTTP와 IPC를 둘 다 운영하는 것이 아니라, 최종 IPC 전환 시 화면 코드를 다시 고치지 않게 하는 것입니다.

## 4. Change Management

팀 전체에 영향을 주는 역할/API/ERD/사용 흐름 변경은 아래 순서를 따릅니다.

1. **Proposal** — GitHub Issue/댓글에 변경 이유와 현재 문제 작성
2. **Impact** — 영향을 받는 기능·Owner·데이터/API 확인
3. **Review** — 관련 DRI에게 리뷰 요청
4. **Decision** — 채택 / 보류 / 기각 기록
5. **Update** — 코드·Issue·Contract/ERD 문서 업데이트
6. **Notify** — 다른 팀원의 작업 방식이 바뀌는 경우 Slack 공유

### 역할 변경 규칙
역할 변경 제안은 자유입니다. 다만 다음을 적은 뒤 팀 기준으로 확정합니다.
- 왜 필요한가
- 기존 담당과 무엇이 겹치는가
- 구체적으로 어떤 산출물을 맡는가
- 어떤 기존 작업을 내려놓는가
- 일정/의존성에 어떤 영향이 있는가

## 5. Quality Scorecard

10/9 이후 기능 수보다 아래 지표를 우선합니다.

| 지표 | 측정 방식 | 완료 판단 |
|---|---|---|
| Golden Path E2E | 실제 기사 1건 전체 흐름 | 핵심 흐름 100% 통과 |
| P0 | 데이터 유실·연결 실패·치명 오류 | 10/14 기준 0건 |
| P1 | 작업 중단·다음 행동 불명확 | 해결 또는 명확한 우회 방법 기록 |
| Save/Recovery | 새로고침·앱 재실행 테스트 | 최신 저장본 복구 |
| RAG usefulness | 대표 질의 테스트 | 유효/무효 결과 기록 |
| Verification quality | 대표 오류 세트 | 오탐/미탐 기록 및 원인 분류 |
| STT trace | segment→원본 위치 | 추적 가능 여부 기록 |
| Platform conversion | 동일 Snapshot 변환 | 입력/출력 추적 및 성공 여부 |
| UX friction | 주요 시나리오 | 막힘/불필요 클릭 기록 후 P등급 부여 |

정확도 수치는 임의 목표를 먼저 만들지 않고, 10/9 Vertical Slice에서 baseline을 측정한 뒤 개선 전후를 기록합니다.

## 6. Source of Truth

### GitHub = 실행 기준
- 코드
- Issues / Milestones
- ERD / API / Contract
- 테스트 fixture
- 기술적 결정과 구현 상태

### Notion = 제품·맥락 기준
- PRD / FRS
- 인터뷰
- 왜 이런 결정을 했는지
- 회의/회고
- 일정과 포트폴리오 정리

### Slack = 커뮤니케이션
- 질문
- 진행 공유
- 팀 공지
- 의사결정 알림

Slack에서 결정된 중요한 내용은 최종적으로 GitHub 또는 Notion에 반영해야 합니다. Slack 메시지만을 Source of Truth로 두지 않습니다.

## 7. 10/9~10/16 운영 원칙

- 10/9까지: **새 기능보다 HTTP 통합 Vertical Slice와 api.js 호출 경계 정리**
- 10/10~10/14: **P0 → P1 → P2 → P3 순서 안정화**
- 10/15~10/16: **증거 수집, 화면 캡처, 문제→판단→실행→결과 문서화**
- Contract v1.0 Freeze 이후 breaking change는 반드시 Change Management 절차를 거칩니다.
