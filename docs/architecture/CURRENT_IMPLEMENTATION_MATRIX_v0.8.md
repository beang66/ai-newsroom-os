# 현재 개발 상태 점검표 v0.8

작성일: 2026-10-04  
확인한 브랜치: `main`, `feature/app-core`, `feature/su4228-article-workspace`, `feature/platform-generator`

> 이 문서는 **“지금 각자 만든 기능이 어디까지 되어 있고, 합칠 때 무엇을 맞춰야 하는지”** 한눈에 보기 위한 문서입니다. 현재 코드를 무조건 정답으로 삼는 것이 아니라, 잘 만든 부분은 살리고 서로 다른 부분만 공통 규칙에 맞춥니다.

## 한눈에 보는 결론

1. 팀원별 기능이 서로 다른 방식으로 만들어져 있습니다. 화면은 React/Vite, 핵심 기능은 Python, 사진 저장은 Supabase, 플랫폼 변환은 Node/n8n 등으로 나뉘어 있습니다.
2. `feature/app-core`의 **화면과 핵심 기능을 API로 분리한 구조**는 계속 활용하기 좋습니다.
3. 기사 저장 방식과 사진 저장 방식이 서로 달라서, 팀 전체가 함께 쓰는 DB 구조로 맞추는 작업이 필요합니다.
4. 기사 검증에서 사용하는 주장·근거·출처 위치 정보는 좋은 기반이 있습니다. 다만 기능마다 다른 이름/ID를 쓰지 않도록 공통 ID가 필요합니다.
5. 검증이나 플랫폼 변환을 시작할 때는 계속 수정되는 편집 화면을 직접 읽지 않고, **그 시점의 기사 내용을 복사해 고정한 버전(Snapshot)** 을 사용합니다.
6. Data Map은 별도 검색 DB를 새로 만들지 않고, RAG와 검증에서 이미 만든 출처·근거·인물/기관 관계 데이터를 같이 사용합니다.

## 기능별 현재 상태와 해야 할 일

| 기능 | 현재 상태 | 우리가 맞출 공통 방식 | 해야 할 일 |
|---|---|---|---|
| 전체 화면 | `main`의 React/Vite, 일부 임시 데이터 | 공통 API를 사용하는 화면 | 현재 UI는 참고해서 유지 |
| 기사 저장 | 로컬 JSON 자동저장 | `Article` + `ArticleRevision` | 기존 저장 기능에 변환 연결부(adapter) 추가 |
| 화면 ↔ 핵심 기능 | app-core의 단일 API 연결 | 버전이 있는 공통 API | 현재 구조 유지 |
| AI 호출 | 기능별 라우터/프록시 | 공통 작업 상태 `ProcessingJob` | 진행/실패 상태 표현 통일 |
| 로그인/보안 | JWT, 백엔드에서 비밀키 관리 | Workspace 단위 권한 | 현재 원칙 유지 |
| 사진/영상 | Supabase `photo_assets` | `MediaAsset` | 기사와 사진의 연결 방식 통일 |
| STT | 음성→텍스트 API | `Transcript` + `TranscriptSegment` | 문장/구간별 고정 ID 부여 |
| 기사 검증 | factcheck 기능 | `Claim` + `VerificationRun/Issue` | 주장 ID를 다른 기능에서도 재사용 |
| 근거 검색 | Candidate/Assessment 형태 | `SourceChunk` + `EvidenceLink` | 출처 ID와 근거 위치 통일 |
| 플랫폼 변환 | n8n | 고정 기사본 → `PlatformOutput` | Snapshot ID를 입력으로 받기 |
| 이미지 렌더링 | Node/Playwright, 로컬 JPEG | `MediaAsset` 결과물 | localhost 파일 경로 제거 |
| Data Map | 기능별 데이터가 흩어져 있음 | 공통 관계 데이터 조회 | 별도 RAG/DB 중복 구축 금지 |

## 지금 반드시 맞춰야 하는 4가지

### 1. ID 규칙 통일
기사·사진·출처 등 기능마다 제각각인 ID를 팀 공통 ID(UUID 호환 형식)로 맞춥니다. 모든 데이터에는 어느 작업공간의 데이터인지 알 수 있도록 `workspace_id`를 연결합니다.

### 2. 작업 중 기사와 고정 기사본 분리
- `ArticleRevision` = 작성/자동저장 중인 기사 버전
- `ArticleSnapshot` = 검증·플랫폼 변환을 시작하는 순간의 **수정되지 않는 고정본**

이렇게 해야 검증 도중 기사가 수정돼도 “어떤 문장을 검증했는지” 사라지지 않습니다.

### 3. 주장과 근거를 여러 기능이 같이 사용
- `Claim` = 기사에서 확인해야 할 주장
- `EvidenceLink` = 그 주장을 뒷받침하거나 반박하는 출처의 정확한 위치

RAG, 기사 검증, Data Map, Archive가 같은 Claim/Evidence를 사용합니다.

### 4. 오래 걸리는 작업의 상태 표현 통일
AI 검증, STT, 이미지 생성/렌더링, n8n처럼 바로 끝나지 않는 작업은 모두 `ProcessingJob`으로 관리합니다.

`대기(queued) → 실행 중(running) → 성공(succeeded) / 실패(failed) / 취소(cancelled)`

## 완료된 것 / 다음 할 일

- [x] 4개 주요 브랜치 현재 상태 점검
- [x] 공통 DB 구조 초안 `ERD_v0.8.md`
- [x] 공통 API 규칙 초안 `OPENAPI_v0.8.yaml`
- [x] 팀 공통 테스트용 예시 데이터 `vertical-slice-v0.8.json`
- [ ] 각 팀원의 기존 기능을 공통 규칙에 연결
- [ ] 실제 기사 1건으로 처음부터 끝까지 테스트
- [ ] 테스트에서 발견된 충돌 수정
- [ ] 모두 통과하면 Contract v1.0 확정

## 팀원이 자기 기능에서 할 일

기존 기능을 처음부터 다시 만들 필요는 없습니다. **기존 기능 앞뒤에 공통 형식으로 바꿔주는 연결부(adapter)를 붙이는 방식**을 우선합니다.

1. 기사 자동저장 담당: 기존 draft를 `ArticleRevision` 형식으로 연결
2. 검증/플랫폼 변환 담당: 실행 직전에 `ArticleSnapshot`을 만들고 그 ID 사용
3. RAG 담당: 기존 검색 결과를 `SourceChunk` 형식으로 연결
4. 미디어 담당: 기존 `photo_assets`를 `MediaAsset` 형식으로 연결
5. 플랫폼 변환 담당: n8n/Playwright 실행 상태를 `ProcessingJob`, 결과를 `PlatformOutput`으로 연결
6. Data Map 담당: Claim/Evidence/Entity 공통 데이터를 읽어서 시각화

## 팀 리뷰 때 딱 5가지만 확인

각 담당자는 자기 기능을 보면서 아래 질문에 **예/아니오 + 필요한 수정사항**만 남기면 됩니다.

- 내 기능이 팀 공통 ID를 입력받고 결과에도 돌려줄 수 있는가?
- 내 기능에 꼭 필요한 데이터 항목이 ERD에서 빠져 있는가?
- 현재 API를 공통 OpenAPI 형식에 연결할 수 있는가?
- 오래 걸리는 작업이라면 `ProcessingJob`의 상태 5개로 표현할 수 있는가?
- 실제 기사 1건을 공통 예시 데이터 흐름대로 내 기능에 넣고 결과를 다음 기능으로 넘길 수 있는가?

## 아직 하지 말 것

**공용 Supabase DB 구조 변경, main 병합, Contract v1.0 확정은 아직 하지 않습니다.**

먼저 실제 기사 1건이 아래 흐름을 끝까지 통과하는지 확인합니다.

`자료 등록 → RAG 검색 → 기사 작성/저장 → 기사 고정본 생성 → 검증 → Data Map → 플랫폼 변환`

이 테스트가 성공하고 팀원들이 공통 구조에 동의하면 v1.0을 확정합니다.

> 참고: 이번 점검은 모든 코드 한 줄씩을 검사한 코드 리뷰가 아니라, **각 기능을 합치기 위해 저장 방식·API·데이터 연결 구조를 확인한 통합 설계 점검**입니다.