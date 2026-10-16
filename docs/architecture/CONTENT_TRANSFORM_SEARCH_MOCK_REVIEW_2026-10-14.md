# 콘텐츠 변환 검색: 실제 AI 호출 전 모의 비교 결과

2026-10-14, 작업 브랜치 `work/content-transform-main-sync-20261014`. 기준 계획은 [CONTENT_TRANSFORM_SEARCH_EXECUTION_PLAN_CURRENT_2026-10-14.md](CONTENT_TRANSFORM_SEARCH_EXECUTION_PLAN_CURRENT_2026-10-14.md)이다. 상세 실행 기록과 소스·규칙·모델 설정 코드의 SHA-256은 [JSON 결과](CONTENT_TRANSFORM_SEARCH_MOCK_RESULT_2026-10-14.json)에 있다. 이 문서와 JSON에는 실제 기사 원문, API 키, 계정 정보가 없다.

## 현재 체크아웃에서 확인한 Core 경계

| 항목 | 확인된 코드와 값 | 결론 |
| --- | --- | --- |
| 기사 고정본 읽기 | `article_editor/app/core/storage.py:get_snapshot(snapshot_id)`는 `id`, `workspace_id`, `article_id`, `title`, `body_text`, `content_hash` 등을 반환한다. `api.py`의 `GET /api/snapshots/{UUID}`도 읽기 경로다. | 원문 고정본 데이터는 존재한다. 검색 결과는 아니다. |
| 플랫폼 생성·검수 입력 | `PlatformManager._from_snapshot(data)`는 `data.snapshotId`로 읽은 `article_id`, `title`, `body_text`를 플랫폼용 `article.content`로 넘긴다. `generate`/`validate`는 `snapshotId`를 결과에 덧붙인다. | Node 플랫폼 호출 입력에는 `snapshotId`, `content_hash`, `workspace_id`를 넘기지 않는다. `coreArticle`은 `article_id`, `title`, `content`만 남긴다. |
| 현재 Core 검색 | `api.py`의 `POST /api/factcheck/run` → `AIManager.factcheck_run` → `review_workspace` → `_retrieve_qwen_candidates` → `rank_chunks(query, chunks, limit, ...)`. 요청은 `nodes:[{id,type,text,linkedSourceIds?}]`, `materials:[{id,title,content,date?,speaker?}]`, 선택적 `snapshotId`를 받는다. `rank_chunks`는 넘겨받은 청크를 순위화하고 원래 청크 값에 `retrieval_rank`, `retrieval_score`, `retrieval_engine`을 붙인다. | `snapshotId`는 팩트체크 결과에 출처로 되돌려줄 뿐, 고정본을 검색 자료로 바꾸지 않는다. 외부 응답은 판정 결과(`results`, `node_statuses`, `critiques` 등)이며 플랫폼용 근거 후보 조회 응답이 아니다. |
| 저장 색인 | `source_index.py`는 `sources`와 `source_chunks`를 `source_id`, `workspace_id`로 읽고 쓴다. | 검색 대상은 취재자료 Source이다. `article_snapshots.body_text`용 색인·위치 매핑은 이 경로에 없다. |
| 플랫폼 호출 도달성 | `platform-generator/core-adapter.js`는 `keywords`, `generate`, `validate`, `render`만 처리한다. `core-bridge.js`의 역방향 요청은 Responses AI 호출이다. | 현재 플랫폼에서 Core 고정본 검색으로 도달하는 호출 경로는 없다. Python 내부 `rank_chunks`의 존재만으로 호출 가능이라고 볼 수 없다. |
| 원문 위치와 소유 범위 | B0의 `quote-context.js`는 `content` 원문에 대한 UTF-16 `start`/`end`와 인접 문맥을 만든다. Core 고정본은 `workspace_id`를 보관하고 vault가 현재 워크스페이스를 선택한다. | Core 검색 후보의 고정본 원문 span·좌표 단위·정규화 버전·계정 권한 반환값은 현재 코드에 없다. 플랫폼 Node에도 인증된 소유 범위가 전달되지 않는다. |

Core 담당자에게 확인할 계약은 **현재 작업 브랜치에서 플랫폼이 호출할 수 있는 고정본 검색 진입점의 실제 파일/함수/경로**, 인증된 고정본·기사·소유 범위 식별값, 질의 입력, 후보의 원문 위치/주변 문맥과 실패 상태다. 제공되면 모의 어댑터 경계에서 실제 계약으로 교체한다. 이번 fixture의 `fixtureRef`, `articleHash`, `start_utf16`, `excerpt`는 **실험 내부 형식이며 Core 필드명이나 API 제안이 아니다.**

## 모의 비교

`node platform-generator/experiments/mock-search-compare.cjs`는 운영 API·화면과 분리된 합성 기사 1건과 플랫폼별 고정 초안 1개로 9회 실행한다. A는 `evidence_context`와 해당 전용 지침을 뺀 비교군이고, B0는 현행 `quoteContexts` 입력, B1은 B0에 미리 준비한 합성 원문 후보 1개를 더한 연결 시험이다. 세 방식 모두 기사 전체·플랫폼 규칙·사실→요구사항 검수 순서 및 출력 스키마를 유지한다. 각 실행은 실제 `validateDraft` 경로에서 가짜 Responses 클라이언트로 최종 검수 두 요청을 강제한다. 같은 플랫폼의 기사·초안·키워드·요구사항 SHA-256이 세 방식에서 같다.

| 플랫폼 | A/B0/B1 최종 모의 AI 응답 | B1 후보 | B1 오류 시 동작 |
| --- | --- | --- | --- |
| Instagram | 각 2회 | 1개 전달 | B0 입력으로 2회 검수 |
| Threads | 각 2회 | 1개 전달 | B0 입력으로 2회 검수 |
| 카드뉴스 | 각 2회 | 1개 전달 | B0 입력으로 2회 검수 |

JSON에는 각 실행의 모의 요청 시간과 합성 입력 선택→검수 완료 시간을 밀리초로 기록했다. 공급자 사용 토큰, 실제 검색 회수율, 오류 미탐·핵심 누락·실제 완료 시간은 모두 **미측정**이다. 9회 요청의 가짜 응답은 `{issues:[]}`로 고정했으므로 `mock_validation_status`는 품질 판정이 아니다. 카드뉴스의 생성 중 검수와 실제 생성 시간은 이 고정 초안 비교에 포함되지 않는다.

카드뉴스 검수 재사용은 별도 관찰에서 동일 입력·결과의 연결 자격을 확인했다. 자격이 맞으면 최종 검수 호출 2회를 생략하는 경로이며, 실제 UI 완료 시간은 측정하지 않았다. 주 비교의 강제 검수 2회와 합산하지 않는다.

## 다음 단계와 미해결

- Core 담당자의 실제 고정본 검색 계약과 플랫폼 호출 경로를 확인해야 한다. 현재 코드에는 둘 다 확인되지 않아 실제 B1 연결은 보류한다.
- 카드뉴스의 실제 AI 제공자 생성 경로는 이번에 호출하지 않았다. 기존 모의 회귀 통과만으로 실제 생성 오류가 해결됐다고 판정할 수 없다. 실제 파일럿 전에 별도 최소 재현·수정·재검증이 필요하다.
- 모의 시간은 프로세스 내부의 가짜 응답 시간이다. 검색 정확도·속도·AI 검수 품질·사용자 완료 시간 개선의 증거로 사용하지 않는다.
