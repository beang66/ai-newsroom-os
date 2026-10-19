## 무엇을 바꿨나요?

기사 작성 화면에서 사용자가 실제로 겪은 본문 유실, 부제 추천 형식, 사진 편집·배치, 보관함 표시 문제를 고쳤습니다.

### 문제 현상과 원인

- 미리보기를 본 뒤 작성 화면으로 돌아오면 기사 본문이 사라졌습니다. 작성 화면이 다시 만들어질 때 저장된 본문을 편집 영역에 되돌리는 조건이 부족했습니다(`ArticleWriter`의 편집 영역 DOM 동기화).
- AI 부제 추천이 세 묶음으로 나오거나 한 줄 안에서 `/`로 나뉘어 보였고, 최종 교열이 짧은 부제를 길게 늘리면 전체 생성이 실패했습니다. 요청 개수와 응답 정규화가 여러 경로에서 서로 달랐습니다(`subtitle_candidates`, `polish_subtitle_lines`).
- 사진을 기사 맨 위나 표시선 위치에 놓아도 다른 위치로 이동했습니다. 화면의 드롭 표시선을 지운 뒤 위치를 다시 계산해 실제 위치 정보가 사라졌습니다(`photo-drop-indicator`).
- 모자이크 도구가 한 번 칠한 뒤 자동으로 꺼졌습니다. 그리기 종료 때 선택 도구를 초기화하고 있었습니다(`setTool(null)`).
- Unsplash 작가명과 저작자 표시가 빠지고 영문 사진 설명이 자동 입력됐습니다. 검색 결과의 영문 대체 문구를 기사 사진 설명으로 사용하고 있었습니다.
- 보관함의 번호·제목·날짜 정렬과 삭제 버튼이 불분명했고, 기사가 없을 때 빈 화면이 될 수 있었습니다. 빈 선택값을 기사처럼 읽는 처리와 카드 정렬 규칙을 보완했습니다.

### 수정 내용

- 미리보기에서 돌아올 때 저장된 본문을 편집 영역에 복원합니다.
- AI 부제는 완성형 묶음 1개만 표시하고, ` / ` 구분을 실제 줄바꿈으로 바꿉니다.
- 최종 AI 교열이 글자 수 제한을 넘겨도 이미 검증된 짧은 초안이 있으면 그 초안을 유지합니다.
- 사진을 기사 맨 위를 포함해 사용자가 본 표시선 위치에 정확히 이동합니다.
- 모자이크는 다른 도구를 고르기 전까지 계속 활성화합니다.
- Unsplash 출처를 `© 작가명 / Unsplash`로 표시하고, 영문 검색 설명과 PC 파일명을 사진 설명에 자동 입력하지 않습니다.
- 보관함 번호·제목·날짜를 왼쪽 정렬하고 모든 저장 기사 오른쪽 위에 휴지통 버튼을 둡니다. 빈 보관함도 정상 화면을 유지합니다.

### 영향받는 파일과 기능

- 기사 작성·미리보기·사진 배치: `src/components/ArticleWriter.jsx`
- 보관함 표시·삭제: `src/components/ArchiveView.jsx`, `src/workspace.css`
- 사진 편집·검색·출처·설명: `src/components/PhotoEditorView.jsx`, `src/components/PhotoSideDrawer.jsx`, `src/components/photo/*`, `src/services/photoSearch.js`, `src/lib/photoMarks.js`
- 부제 추천: `src/api/editorial.js`, `src/services/assistService.js`, `src/lib/subtitleCandidates.js`, `article_editor/app/core/ai/router.py`, `article_editor/app/core/ai/subtitle_editorial.py`
- 회귀 테스트·기록·빌드 결과: `article_editor/dev/tests/*`, `article_editor/docs/*`, `article_editor/WORK_LOG.md`, `article_editor/app/frontend/**`

### 다른 기능을 보호한 방법

- 최신 `origin/main`을 담당 브랜치에 병합한 상태에서 검증했습니다.
- 원격 백엔드(`backend/**`), 데이터베이스 스키마, 콘텐츠 변환·SNS 코드는 수정하지 않았습니다.
- 원본 프런트(`src/**`)를 수정한 뒤 `npm run build`로 배포용 파일(`article_editor/app/frontend/**`)을 다시 만들었습니다.
- 저장, 보관함, 미리보기, 기사 이동, 인터뷰 화면을 함께 도는 브라우저 회귀 테스트를 유지하고 기대값을 약화하지 않았습니다.
- 팀원이 이후 작업에서 이 변경을 덮어쓰지 않도록 `article_editor/docs/TEAM_POST_MERGE_PROTECTION_PROMPT.md`를 추가했습니다.

## 테스트 결과

[TEST] 코드 기본 검사 | PASS | P1
현상: 수정한 코드가 문법·규칙 오류 때문에 실행 전에 중단되는지 확인했습니다.
재현: 저장소 루트에서 `npm run lint` 실행.
기대: 오류 없이 종료. 저장소에 원래 있던 경고는 별도 정리 대상으로 남음.
환경: Windows / Node.js / oxlint

[TEST] 공용 자동 테스트 | PASS | P0
현상: 이번 수정 때문에 저장·백업·데이터맵·플랫폼 상태 같은 다른 기능이 깨지는지 확인했습니다.
재현: 저장소 루트에서 `npm test` 실행.
기대: 전체 73개 테스트 통과.
환경: Windows / Node.js test runner

[TEST] AI 부제 처리 | PASS | P0
현상: 부제가 한 묶음만 나오고 슬래시 대신 줄바꿈되며, 마지막 교열이 길어져도 검증된 짧은 부제를 잃지 않는지 확인했습니다.
재현: `article_editor`에서 `python -m unittest discover -s dev/tests -p "test_subtitle_style.py"` 실행.
기대: 관련 11개 테스트 통과.
환경: Windows / Python 3 / 로컬 Core 단위 테스트

[TEST] 배포용 화면 빌드 | PASS | P0
현상: 프런트 수정 사항이 실제 앱이 읽는 배포용 파일로 정상 생성되는지 확인했습니다.
재현: 저장소 루트에서 `npm run build` 실행.
기대: 새 해시 자산과 `index.html` 생성, 이전 해시 자산 정리, 빌드 오류 없음.
환경: Windows / Vite production build

[TEST] 담당 기능 실제 화면 회귀 | PASS | P0
현상: 미리보기 뒤 본문 유지, 부제 1개·줄바꿈, 사진 맨 위 이동, 모자이크 연속 사용, 보관함 저장·삭제가 실제 화면에서 동작하는지 확인했습니다.
재현: 빌드 후 `npm --prefix article_editor run test:ui:mine` 실행.
기대: 전체 사용자 흐름 통과.
환경: Windows / Microsoft Edge / 임시 테스트 저장소

[TEST] 팀 공용 UI 전체 흐름 | BLOCKED | P1
현상: 공용 화면 테스트는 기사 작성 단계까지 진행했으나 팩트체크 실행에서 서버가 502를 반환해 이후 단계가 중단됐습니다(`POST /api/factcheck/run`).
재현: `npm --prefix article_editor run test:ui` 실행 후 팩트체크 자료 업로드 단계 진입.
기대: 팩트체크 결과 카드가 표시되고 나머지 공용 흐름이 계속되어야 함.
환경: Windows / Microsoft Edge / 로컬 Core. 이번 브랜치는 팩트체크 관련 파일을 변경하지 않았으며, 담당 기능 전용 UI 흐름은 별도 PASS.

[TEST] 실제 외부 AI 부제 생성 | BLOCKED | P1
현상: 응답 형식과 화면 적용은 모의 응답으로 확인했지만 실제 운영 API 키를 사용하는 외부 AI 호출은 실행하지 않았습니다.
재현: 운영 키가 연결된 환경에서 AI 추천 부제목 실행 필요.
기대: 완성형 부제 1개가 실제 줄바꿈으로 표시되고 적용돼야 함.
환경: 운영 외부 AI 환경 미사용

## 데이터·마이그레이션·배포 영향

- 데이터베이스 스키마와 마이그레이션 변경 없음.
- 기존 기사 데이터 변환 없음. 롤백 시 이 PR의 커밋을 일반 revert하면 됩니다.
- 원격 backend 변경 없음 — Render 재배포 영향 없음.
- 로컬 Core(`article_editor/app/core/**`)의 부제 생성 요청·검증 로직은 변경됐습니다.
- API 주소와 필드 이름은 유지했습니다. 부제 후보 배열(`subtitle_candidates`)의 기대 개수만 3개에서 1개로 바뀌었고, 프런트는 구형 3개 응답도 첫 묶음만 안전하게 표시합니다.

## Breaking Change

- [x] 없음

## 검토 요청

- 팀장: 사용자 화면 변경과 회귀 영향 확인
- 기사 작성·사진·보관함 담당자: 기존 담당 기능과의 동작 충돌 여부 확인
- 백엔드 담당자: 원격 backend 변경은 없지만 로컬 Core의 부제 응답 개수 변경 확인
