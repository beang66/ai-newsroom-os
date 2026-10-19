# 2026-10-19 기사 작성·사진·보관함 안정화 기록

## 작업 개요

- 작업일: 2026-10-19 (Asia/Seoul)
- 대상: AI Newsroom 기사 작성 화면, 사진 편집 화면, 보관함, 부제목 생성 코어
- 목표: 사용자가 보고한 데이터 유실·사진 배치·표기·보관함 문제를 다른 기능을 해치지 않는 범위에서 수정하고 자동 회귀 테스트로 고정

## 같은 날 실행 환경 조치

처음 데스크톱 앱을 실행했을 때 제목 표시줄만 보이고 전체가 빈 화면인 현상은 오래되거나 손상된 WebView2 사용자 프로필에서 재현됐다. 기존 프로필을 삭제하지 않고 아래 위치로 나눠 보존한 뒤 새 프로필로 실행해 셸 스모크 테스트 8개를 통과시켰다.

- `%LOCALAPPDATA%\AI Newsroom\webview-backup-20261019-blank-screen-part1`
- `%LOCALAPPDATA%\AI Newsroom\webview-backup-20261019-blank-screen-part2`

이 조치는 아래의 보관함 `null.draft` 코드 오류와는 별개다. 후자는 실제 Edge UI 테스트에서 “빈 보관함 진입 후 앱 전체가 비는” 문제로 다시 재현되어 코드로 수정했다.

## 요청별 처리 내용

### 1. AI 추천 부제목 문구

- 화면 문구 `AI 추천 통 부제목`을 `AI 추천 부제목`으로 수정했다.
- 파일: `src/components/ArticleWriter.jsx`

### 2. “부제 길이를 확인하지 못했어요” 오류

원인은 부제 초안이 검증을 통과한 뒤 마지막 AI 편집 단계에서 다시 52자를 넘길 수 있었고, 이때 검증을 통과했던 초안까지 버리고 오류를 내던 처리였다.

- 단일 부제 생성에서 마지막 편집본이 길이 제한을 넘으면, 이미 검증된 원래 초안을 정규화해 52자 이내일 때 안전하게 사용하도록 변경했다.
- 여러 줄 부제의 기존 제한과 오류 처리는 유지했다.
- 회귀 테스트 `test_single_line_final_editor_overflow_keeps_verified_draft`를 추가했다.
- 파일: `article_editor/app/core/ai/subtitle_editorial.py`, `article_editor/dev/tests/test_subtitle_style.py`

### 3. 미리보기 사용 후 기사 본문 사라짐

원인은 미리보기로 전환할 때 `contentEditable` 본문 DOM이 제거되고, 작성 화면으로 돌아왔을 때 기사 상태값 자체는 바뀌지 않아 본문 동기화 effect가 다시 실행되지 않던 것이었다.

- 동기화 조건에 `viewMode`를 추가해 작성 화면이 다시 마운트될 때 저장된 `article.content`를 DOM에 복원한다.
- UI 테스트에서 미리보기 진입 → 작성 화면 복귀 후 본문 문장이 유지되는지 확인한다.
- 파일: `src/components/ArticleWriter.jsx`, `article_editor/dev/tests/ui-smoke-mine.mjs`

### 4. 보관함 정렬·삭제 아이콘·빈 화면

- 최근 기사 카드의 번호, 제목, 날짜를 명시적으로 왼쪽 정렬했다.
- 저장된 기사마다 오른쪽 상단에 28px 삭제 아이콘이 보이도록 위치·테두리·배경·레이어를 정리했다.
- 자동 UI 테스트 중 추가 발견: 저장된 기사가 0건이면 `undefined === undefined` 조건이 참이 되어 `null.draft`를 읽고 화면 전체가 비는 문제가 있었다. optional chaining으로 빈 보관함도 안전하게 렌더되도록 수정했다.
- 파일: `src/workspace.css`, `src/components/ArchiveView.jsx`, `article_editor/dev/tests/ui-smoke-mine.mjs`

### 5. 작업 기록

- 이 문서에 증상, 원인, 수정 범위, 검증 결과를 기록했다.
- `article_editor/WORK_LOG.md` 작업 이력에도 2026-10-19 항목을 추가했다.

### 6. 사진을 맨 위·원하는 위치로 이동하지 못함

원인은 드롭 위치를 나타내는 DOM 표시선을 사진 이동 전에 삭제한 뒤, 부정확한 캐럿 위치를 다시 계산해 `nextSibling` 쪽으로만 배치하던 것이었다. 본문 첫 노드가 텍스트 노드일 때는 요소 목록에 포함되지 않아 맨 위 배치도 불가능했다.

- 드롭 표시선을 실제 삽입 기준점으로 유지하고 사진을 그 앞에 옮긴 다음 표시선을 제거한다.
- 에디터 최상단 16px 영역은 첫 텍스트 노드를 포함한 `firstChild` 앞에 배치한다.
- 표시선이 없을 때도 대상 요소의 위·아래 절반을 기준으로 정확히 앞/뒤에 넣는다.
- 이동 완료 안내 문구를 실제 동작에 맞게 변경했다.
- UI 테스트에서 사진을 본문 맨 위로 드래그한 뒤 첫 DOM 노드가 사진인지, 본문이 유지되는지 확인한다.
- 파일: `src/components/ArticleWriter.jsx`, `article_editor/dev/tests/ui-smoke-mine.mjs`

### 7. 모자이크 도구가 한 번 사용 후 꺼짐

- 포인터를 놓을 때 `setTool(null)`을 호출하던 코드를 제거했다.
- 모달형 편집기와 실제 전체화면 편집기 두 경로를 모두 수정했다.
- 모자이크는 사용자가 모자이크 버튼을 다시 누르거나 지우개 등 다른 도구를 고를 때까지 유지된다.
- UI 테스트에서 한 번 그린 뒤에도 모자이크 버튼의 `aria-pressed`가 `true`인지 확인한다.
- 파일: `src/components/photo/ImageEditor.jsx`, `src/components/PhotoEditorView.jsx`

### 8. Unsplash 작가명·© 출처 복원

- 검색 결과와 가져오기 데이터의 출처를 `© 작가명 / Unsplash` 형식으로 통일했다.
- 검색 카드, 사진 편집 출처 입력란, 기사 삽입 캡션에서 같은 표기를 사용한다.
- 중복 ©/ⓒ 기호가 생기지 않도록 기사 마크 변환도 보완했다.
- 파일: `src/services/photoSearch.js`, `src/api/editorial.js`, `src/components/photo/PhotoSearch.jsx`, `src/components/PhotoSideDrawer.jsx`, `src/lib/photoMarks.js`

### 9. 사진 설명 자동 입력 제거

- Unsplash의 영문 `alt_description`과 `description`을 사진 설명으로 자동 복사하지 않는다.
- PC 파일명도 사진 설명으로 자동 입력하지 않는다.
- 사용자가 직접 입력하지 않은 사진 설명은 빈 문자열로 유지한다.
- 기사 캡션은 설명이 비어 있으면 출처만 표시하고 불필요한 `▲` 문구를 만들지 않는다.
- 파일: `src/services/photoSearch.js`, `src/api/editorial.js`, `src/components/PhotoSideDrawer.jsx`, `src/components/ArticleWriter.jsx`

### 10. AI 부제 추천을 한 묶음으로 제한하고 `/`를 줄바꿈으로 교정

- 증상: 3줄짜리 부제가 후보 3개로 표시됐고, 일부 후보는 실제 줄바꿈 대신 `/`가 한 줄 안에 노출됐다.
- 원인: 원격 AI 프롬프트와 스키마가 후보 3개를 요구했으며, 기사 작성 화면의 별도 `assistService`가 `/` 구분을 줄바꿈으로 정규화하지 않고 후보 배열도 모두 표시했다. API 어댑터와 화면 서비스가 중복된 구조라 한쪽만 고치면 실제 작성 화면에는 반영되지 않는 점도 확인했다.
- 서버는 부제 후보를 처음부터 1개만 요청하도록 프롬프트와 JSON 스키마를 변경했다.
- 서버와 두 프런트 응답 경로 모두 공백을 둔 `/` 구분자를 실제 `\n`으로 변환한다.
- 예전 서버나 캐시가 후보 3개를 반환해도 화면에는 첫 번째 완성형 부제 묶음 하나만 표시한다.
- 한 줄짜리 항목 2~4개를 배열로 반환하는 구형 응답은 기존처럼 한 묶음의 여러 줄로 결합한다.
- 회귀 테스트: Python 부제 테스트 11개 통과. 실제 Edge UI에서 3개 후보와 `/` 구분을 강제로 응답시켜도 추천 버튼 1개와 3개 실제 줄바꿈만 표시되고 적용되는 것을 확인했다.
- 파일: `article_editor/app/core/ai/router.py`, `article_editor/app/core/ai/subtitle_editorial.py`, `src/lib/subtitleCandidates.js`, `src/services/assistService.js`, `src/api/editorial.js`, `article_editor/dev/tests/test_subtitle_style.py`, `article_editor/dev/tests/ui-smoke-mine.mjs`

## 검증 결과

- `npm run lint`: 종료 코드 0. 기존 저장소 경고는 남아 있으나 새 오류 없음.
- 부제목 Python 회귀 테스트: 9개 통과.
- `npm test`: 73개 통과, 실패 0.
- `npm run build`: Vite production build 성공.
- `npm --prefix article_editor run test:ui:mine`: 실제 Edge UI 흐름 전체 통과.
  - 빈 보관함 진입
  - 기사 저장
  - 미리보기 복귀 후 본문 유지
  - Unsplash 설명 공란 및 `© Kim / Unsplash`
  - 모자이크 도구 유지
  - 사진 본문 삽입 및 맨 위 드래그
  - 보관함 왼쪽 정렬 및 삭제 아이콘
  - 기존 STT·화자 편집 흐름

## 빌드 산출물

`npm run build`로 `article_editor/app/frontend`의 해시 자산을 최신 소스에서 다시 생성했다. 앱 실행 시 이 산출물이 제공된다.

## 팀 공유용 요약

이번 수정은 본문 상태 복원, 사진 메타데이터 기본값, 드래그 삽입 기준점, 모자이크 도구 상태, 보관함 빈 상태 방어를 각각 분리해 처리했다. 데이터 형식이나 저장 API 계약은 바꾸지 않았고, 기존 Node 회귀 73개와 실제 UI 전체 흐름을 통과했다. 특히 보관함 빈 화면은 이번 UI 검증에서 별도로 재현해 함께 차단했다.

다른 담당자가 최신 main을 자신의 브랜치에 합칠 때 사용할 보호 프롬프트는 `docs/TEAM_POST_MERGE_PROTECTION_PROMPT.md`에 있다.
