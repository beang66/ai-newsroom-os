# AI-Newsroom OS — GitHub Projects 운영판 v1.0

작성일: 2026-10-05  
목적: **누가 무엇을 하고 있고, 무엇이 막혀 있으며, 다음 작업이 무엇인지 한눈에 보는 팀 개발 상황판**

> GitHub Projects는 기술 문서 저장소가 아니라 **업무 진행 상태를 관리하는 운영판**으로 사용한다.
> 상세 설계·API·ERD는 GitHub 문서/Issue에 두고, Projects는 상태·담당·우선순위·마일스톤·의존관계를 보여준다.

## 1. 권장 필드

| 필드 | 값 |
|---|---|
| Status | Backlog / Ready / In Progress / Review / Blocked / Done |
| Priority | P0 / P1 / P2 / P3 |
| Owner | GitHub Assignee |
| Milestone | M0 / M1 / M2 / M3 |
| Stage | Contract / Core / Feature Integration / HTTP E2E / IPC·EXE / Freeze / Stabilization / Deliverables |
| Dependency | Blocked by / Blocks 관계는 Issue 본문 기준 |

### Priority 의미
- **P0**: 최종 Vertical Slice/EXE 완성을 위해 반드시 필요한 작업
- **P1**: 핵심 사용성·안정화
- **P2**: 완성도·문서화
- **P3**: 선택적 개선

## 2. 권장 View

### View A — Team Board
- Group by: Status
- Sort: Priority → Milestone → Issue number
- 목적: 매일 팀이 보는 기본 보드

### View B — Critical Path
- Filter: Priority = P0
- Group by: Stage
- 목적: 무엇이 다음 작업을 막고 있는지 확인

### View C — By Owner
- Group by: Assignee
- Sort: Priority
- 목적: 담당자별 작업량·병목 확인

### View D — Milestones
- Group by: Milestone
- Sort: Stage
- 목적: 큰 개발 단계별 진행률 확인

## 3. 현재 Critical Path

```text
#14 Contract v0.8 + api.js 호출 경계
        ↓
#15 App Core 통합 경계
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
#20 HTTP/local server Vertical Slice
        ↓
#25 Python Core ↔ IPC + EXE 패키징
        ↓
#21 Contract v1.0 Freeze
        ↓
#22 P0/P1 안정화
        ↓
#23 최종 산출물
```

## 4. 현재 카드 배치

| Issue | Owner | Status | Priority | Stage | Milestone |
|---|---|---|---|---|---|
| #14 Contract v0.8 / api.js 경계 | 안정빈 | Review | P0 | Contract | M0 |
| #15 App Core 통합 경계 | 강창희 | In Progress | P0 | Core | M0 |
| #5 Article Revision/Snapshot | 강창희 | Blocked | P0 | Core | M0 |
| #7 RAG / Source Trace | 강창희 | Blocked | P0 | Feature Integration | M1 |
| #16 STT / Transcript | 박소현 | Ready | P0 | Feature Integration | M1 |
| #9 Structure | 고서연 | Blocked | P0 | Feature Integration | M2 |
| #10 Verification | 강창희 | Blocked | P0 | Feature Integration | M2 |
| #17 Media / Preview | 고서연 | Ready | P0 | Feature Integration | M3 |
| #18 Platform Conversion | 이정민 | Ready | P0 | Feature Integration | M3 |
| #19 Data Map / Archive | 안정빈 | In Progress | P0 | Feature Integration | M3 |
| #20 HTTP Vertical Slice | 안정빈 + 전원 | Blocked | P0 | HTTP E2E | M3 |
| #25 IPC / EXE Packaging | 강창희 | Blocked | P0 | IPC·EXE | M3 |
| #21 Contract v1.0 Freeze | 안정빈 + 강창희 | Blocked | P0 | Freeze | M3 |
| #22 P0/P1 안정화 | 안정빈 + 전원 | Backlog | P1 | Stabilization | M3 |
| #23 최종 산출물 | 안정빈 + 전원 | Backlog | P2 | Deliverables | M3 |

## 5. 팀 운영 규칙

1. 기능 구현 방식은 각 담당자에게 맡긴다.
2. 프론트의 서버/Core 요청(fetch, axios 등)은 `api.js` 한 파일의 기능별 함수로 모은다.
3. 자기 브랜치에서 동작하면 **Implemented**, Core와 연결되면 **Integrated**다.
4. 실제 기사 1건 E2E를 통과하면 **Verified**다.
5. main 기준 동작 + 복구/실패 처리 + 문서 업데이트까지 끝나야 **Done**이다.
6. 의존 작업이 끝나지 않았더라도 독립 개발이 가능하면 Ready/In Progress로 유지하고, **통합 자체가 불가능한 작업만 Blocked**로 둔다.
7. 한 카드가 2~3일 이상 In Progress에 머물면 Issue 댓글에 막힌 이유를 기록한다.
8. Slack에서 결정된 변경은 최종적으로 GitHub Issue/Projects 또는 Notion에 반영한다.

## 6. 최종 런타임 기준

- 최종 제품은 **Windows EXE + IPC 단일 런타임**
- HTTP/local server는 기능 보존·통합을 위한 임시 테스트 transport
- 팀원은 현재 기능 개발을 자유롭게 지속
- HTTP Vertical Slice 완료 후 강창희가 Python Core ↔ IPC 실제 연결
- IPC 검증 후 EXE 패키징
- 그 다음 Contract v1.0 Freeze

## 7. Source of Truth

- **Projects:** 진행 상태
- **Issues:** 해야 할 일 / 완료 조건 / 의존성
- **Milestones:** 큰 개발 단계
- **PR:** 실제 변경 검토
- **Architecture docs:** 기술 계약
- **Notion:** 기획·배경·의사결정 맥락
- **Slack:** 대화·질문·공지
