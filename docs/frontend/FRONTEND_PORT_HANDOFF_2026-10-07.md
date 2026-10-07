# 프론트 이식 인수인계 메모 — main UI에 없는 기능과 디자인 요청

작성일: 2026-10-07  
기준: `main` `fed8212`(박소현 UI 개편 포함), `feature/app-core` `84c7f4e`(2026-10-07 갱신)

## 0. 현재 진행 상태 (2026-10-07 갱신)

main의 디자인을 앱에 이식하는 작업(U1)은 아래까지 끝났습니다. 아래 항목은 이미 반영되어 있으니 **새로 디자인하지 않아도 됩니다.** 화면에서 확인하고 다듬을 부분만 알려 주세요.

- 전역 테마, 헤더, 사이드바, 레이아웃(ProcessBar 상단 탭 바는 main이 그리지 않아 삭제)
- 보관함, 취재자료 검색 (가짜 데이터는 실제 기사 데이터로 교체)
- 기사 작성 화면, 팩트체크 서랍(재검증 버튼·모바일 배치 보완)
- PhotoEditor (사진 검색은 코어 경유, 편집본·원본은 암호화 저장소에 보관)
- FormatConverter (platform-generator와 연결, 코어 경유)
  - **임시로 넣은 버튼(디자인 요청 대상):** main의 FormatConverter에는 "생성" 동작이 없었습니다(가짜 문구만 있음). 원본 `feature/platform-generator`에 있던 버튼 3종 중 화면에 없던 것을 앱에서 임시로 만들었습니다. 위치·모양을 main 톤에 맞게 다듬어 주세요(아래 8장 참고).
- **순서형 검사 패널**: 코어의 실제 판정 결과를 한 건씩 보여 줍니다(유형, 문제 문장, 사유, 근거 인용, 이전/다음). 본문 하이라이트는 전부 유지하고 지금 보는 문장만 진한 윤곽입니다. **AI 수정안 칸과 "수정 적용"은 없습니다.**
- Pretendard 폰트는 로컬 번들로 들어 있습니다(CDN 없음).
- 본문 청크 밑줄(개발용)은 **삭제**했습니다. 자료 보기 창의 "청크 보기 (개발)" 탭만 남아 있습니다.
- 팩트체크 자동 실행은 입력이 1.0초 멈추면 시작합니다. 띄어쓰기만 바뀐 문장은 다시 판정하지 않습니다.
- 아직 없는 것: 로그인·회원가입, 설정, 모델 설치 화면(병합 후 F1), Data Map(보관함 상단 자리만 비워 둠, M5).

## 1. 방향

- **main에서 가져오는 것은 UI 디자인(레이아웃, 스타일, 컴포넌트 외형)입니다. 호출 방식과 기능 로직은 가져오지 않고, 앱이 이미 하는 방식으로 다시 연결합니다.**
- 모든 외부 API 호출(Unsplash 포함)은 `화면 → web/src/api → 코어 → 백엔드 요청`으로 통일합니다. main 코드의 호출 부분은 쓰지 않습니다.
- **UI 정본은 main의 프론트엔드(루트 `src/`)입니다.**
- 앱 UI(`article_editor/web/src`)에만 있는 기능을 main UI로 **이식**합니다.
- 이식하는 기능은 코어(App Core)와 연결되어 동작하는 것들이라, 기능 코드는 앱 쪽을 그대로 가져오고 **프론트 작업자는 main의 디자인에 맞게 화면을 설계**합니다.
- 이 문서는 그 디자인 작업을 부탁하기 위한 목록입니다.

- **이번 병합 범위에서 STT(음성 전사)는 제외합니다.** main의 인터뷰·녹음 관련 변경은 이식하지 않고, 앱의 기존 인터뷰 화면은 그대로 둡니다.

## 2. 먼저 지킬 규칙 (코드가 아닌 구조 규칙)

| 규칙 | 이유 |
|---|---|
| 화면은 코어를 `web/src/api/`의 **이름 붙은 메서드**로만 호출합니다. `fetch(`, `"/api/..."` 문자열을 화면 코드에 쓰지 않습니다. | 개발은 HTTP, 최종 EXE는 IPC로 같은 계약을 쓰기 때문입니다. `npm run check:api-boundary`가 검사합니다. |
| 외부 AI/사진 서비스(Groq, OpenAI, Unsplash 등)를 화면에서 직접 호출하지 않고, API 키를 브라우저(`localStorage`)에 저장하지 않습니다. | 앱에는 운영 키를 두지 않는 보안 규칙입니다. |
| 아래 `data-testid` 값은 이름을 유지합니다. | UI 스모크 테스트(`dev/tests/ui-smoke.mjs`, `support-highlight.mjs`)가 사용합니다. |

**이식하지 않는 main 코드:** `src/services/unsplash.js`(브라우저에 키 저장, 직접 호출). 같은 기능은 아래 코어 메서드로 대체합니다. `src/api.js`의 `requestCloudTranscription`(음성 전사를 브라우저가 직접 호출)도 이식하지 않으며, STT는 이번 병합 범위에서 제외합니다.

## 3. 이식할 기능과 디자인 요청

각 항목은 **앱의 동작 → 앱 구현 위치 → 쓰는 코어 메서드 → 디자인이 필요한 상태/요청** 순서입니다. 앱 구현 위치의 경로는 모두 `article_editor/web/src/` 기준입니다.

### A. 팩트체크 (가장 큼)

#### A-1. 본문 하이라이트
- **동작:** 본문(글 입력창) 안의 문장을 판정별 색으로 칠합니다. 글이 바뀌고 1.5초 멈추면 자동으로 검증합니다.
- **구현:** `components/ArticleWriter.jsx`의 `HighlightedBody`(뒤쪽 글자 층 + 위를 덮는 textarea 구조), `components/EditorialAssist.jsx`의 `useFactCheck`
- **판정과 색(현재 값, 디자인 시스템에 맞게 조정 요청):**

| 판정 | 표시 이름 | 현재 색 | 비고 |
|---|---|---|---|
| CONFLICT | 자료와 불일치 | 장미(rose) + 안쪽 테두리 | 가장 강하게 |
| EVIDENCE_GAP | 근거 부족 | 호박(amber) | |
| REVIEW / EXTERNAL_REQUIRED | 검토 필요 | 보라(violet) | |
| 일치(SUPPORTED) | 팩트 일치 | 평소엔 칠하지 않음 | 서랍 카드에 마우스를 올린 동안 초록(FOCUS) |
| DETAIL | 날짜·기관·주체 별도 확인 | 호박 | 일치 문장 안의 세부 값 |

- **상태 디자인 요청:** 마우스를 올린 하이라이트의 외곽선(현재 진한 색 2px), 하이라이트가 겹칠 때 규칙(앞의 것만), 판정 없음(회색 또는 칠하지 않음), 검증 중(진행 표시), 오류 메시지(`data-testid="factcheck-error"`)
- **유지할 testid:** `fact-highlight`, `factcheck-status`, `factcheck-error`

#### A-2. 서랍(FactCheckDrawer)의 판정 카드
- **동작:** 문장별 카드에 판정, 일치율(%), 근거 인용문, 자료 이름을 보여 줍니다. 카드의 근거 인용문 안에서도 맞는 부분을 표시합니다.
- **구현:** `components/FactCheckDrawer.jsx`, `api/editorial.js`(`factcheckArticle`이 카드 목록을 만듦), `api/claim-details.js`
- **디자인 요청:** 판정별 카드 색과 아이콘, 일치율 표시, 근거 인용문(`data-testid="evidence-quote"`)과 세부 확인 목록(`data-testid="claim-details"`)의 시각 구분, 서랍이 닫혀 있을 때의 진입 버튼과 문제 개수 표시(`factcheck-status`)

#### A-3. 하이라이트 위에서 "상위모델로 재검토"
- **동작:** 로컬 판정기가 확정하지 못한 문장의 하이라이트에 마우스를 올리면 말풍선(`recheck-tip`)이 뜨고, 누르면 상위 모델이 다시 판정합니다. 결과는 카드에 "AI 재판정"으로 표시되고 하이라이트가 사라집니다.
- **구현:** `ArticleWriter.jsx`(말풍선 위치 계산), `EditorialAssist.jsx`의 `recheck`
- **디자인 요청:** 말풍선 모양, 재검토 중 상태("상위모델 재검토 중…"), 재검토 결과 카드의 표시(재판정임을 알리는 배지), 실패 시 안내
- **유지할 testid:** `recheck-tip`

#### A-4. 저장된 AI 판정 복원
- **동작:** 원고를 다시 열면 이전에 받은 AI 재판정을 자동으로 불러와 그 문장은 처음부터 "재판정 완료" 상태로 보입니다(비용 없음).
- **구현:** `EditorialAssist.jsx`의 `restoreExternal`(코어의 조회 전용 모드 사용)
- **디자인 요청:** 복원된 판정과 새로 받은 판정을 구분할지 여부(없어도 됨, 필요 시 작은 표시)

#### A-5. 청크 보기 (개발 모드 전용)
- **본문 청크 밑줄은 삭제했습니다**(개발용 임시 기능이었음). 자료 보기 창의 "청크 보기 (개발)" 탭만 개발 실행에서 남아 있습니다.
- **디자인 요청:** 일반 사용자 화면에는 나타나지 않게 유지
- **유지할 testid:** `chunk-view`

### B. 저장과 자료

#### B-1. 자동 저장과 이어쓰기
- **동작:** 쓰는 동안 자동 저장하고, 앱을 열면 마지막 원고를 이어서 불러옵니다.
- **구현:** `EditorialAssist.jsx`의 `useAutosave`, `api/editorial.js`의 `saveDraft`, `loadLatestArticle`
- **쓰는 문구:** "자동 저장 중…", "자동 저장됨"
- **디자인 요청:** 저장 상태 표시 위치와 모양(`data-testid="save-status"`), 저장 실패 안내, 이어쓰기로 열렸음을 알리는 표시

#### B-2. 취재자료 업로드, 추출, 보관, 원본 열기
- **동작:** PDF·HWP·HWPX·DOCX·TXT를 올리면 본문 텍스트를 추출해 보관하고, 서랍에서 원본을 앱 안 뷰어나 기본 프로그램으로 열 수 있습니다.
- **구현:** `components/FactCheckDrawer.jsx`, `api/editorial.js`의 `registerSource`, `sourcePreview`, `openSourceFile`, `sourceChunks`
- **디자인 요청:** 업로드 영역(드래그 앤 드롭), 파일별 진행·성공·실패 상태(지원하지 않는 형식, 30MB 초과, 스캔 PDF 글자 없음), 자료 목록과 삭제, 원본 보기

### C. 편집 보조

| 기능 | 동작 | 구현 | 디자인 요청 |
|---|---|---|---|
| 제목·부제 추천 | 버튼을 누르면 후보 3개가 나오고 하나를 고름 | `useSuggestions`, `SuggestionList`, `SuggestButton` | 후보 목록 모양, 로딩·실패 상태 |
| 흐름 요약 | 기사 흐름을 3~5문장으로 요약 | `FlowSummaryButton` (`data-testid="flow-summary"`) | 요약 표시 위치와 모양 |
| 사진 찾기 | 본문에서 검색어를 뽑아 사진을 검색하고 가져옴 | `PhotoFinder` (`data-testid="photo-finder"`) | 검색 결과 격자, 출처 표기(촬영자·Unsplash), 가져오기 상태 |
| 인터뷰 녹음 전사 | **이번 병합에서 제외** (앱의 기존 인터뷰 화면은 그대로 유지) | `api/editorial.js`의 `transcribeAudio` | 해당 없음 |

### D. 계정과 설정

- **자동 로그인 토글:** 개발 실행에서 코어가 가능하다고 알려줄 때만 보이는 스위치. `components/AutoLoginToggle.jsx` (`data-testid="auto-login-toggle"`). 디자인 요청: 헤더 어디에 둘지, 꺼짐·켜짐·실패 상태.
- **로그인, 모델 설치:** 코어에는 로그인(`signIn`, `signOut`, `session`)과 모델 설치(`models`, `installModels`, `cancelModelInstall`) 메서드가 있지만 **앱 UI에는 이를 쓰는 화면이 아직 없습니다.** 이식 대상이 아니라 새로 디자인해야 하는 항목입니다. 필요한 화면은 로그인(또는 팝업)과 세션 상태 표시, 로컬 판정 모델이 없을 때의 안내와 설치 진행·취소입니다.

## 4. 반대로 main에만 있는 기능 (이식 후에도 지켜야 함)

| 기능 | 내용 | 결정이 필요한 점 |
|---|---|---|
| **순서형 검사 패널** | 문제 문장을 한 건씩 보여 줌 | **이식 완료**(코어 실제 결과 사용, 본문 하이라이트와 병행). 배치와 모양은 디자인 검토 대상입니다. |
| **AI 수정안 적용** | 제안된 문구로 본문을 바꿔 줌 | **제외로 결정**(코어에 수정안 생성 기능이 없음). 나중에 "틀린 값 교체형" 수정안을 코어에 만들면 그때 패널에 칸을 추가합니다. |
| **PhotoEditor**(사진 편집기) | 사진 자르기·보정 등 | **이식 완료**(사진 검색은 코어 경유). |
| 보관함, 사이드바, 헤더 개편 | 디자인 개편 | 이식하는 기능의 위치(서랍, 저장 표시, 로그인)를 새 레이아웃에서 정해야 합니다. |

## 5. 열려 있는 디자인 질문

1. 하이라이트의 색 체계(rose/amber/violet/emerald)를 main의 따뜻한 미니멀 톤에 맞게 바꿀지, 색약 사용자를 고려한 구분(밑줄 모양 등)을 더할지
2. 서랍을 main의 새 사이드바 구조에서 어디에 둘지(오른쪽 도구 탭 접힘 기능이 새로 생김)
3. 순서형 패널과 동시 하이라이트는 현재 **병행**(패널이 현재 항목을 진한 윤곽으로 표시)입니다. 이 방향이 맞는지, 패널 위치(본문 위)가 적절한지
4. 작은 화면(390px, 1100px)에서의 동작. 참고 스크린샷: `article_editor/docs/screenshots/` (`01-editor.png`, `09-autosave-count.png`, `14-responsive-*.png` 등)

## 6. 이식이 끝났다고 보는 기준

- 위 A~D 기능이 main 기반 화면에서 앱과 같이 동작
- `npm run check:api-boundary` 통과
- UI 스모크 테스트(`ui-smoke.mjs`, `support-highlight.mjs`) 통과
- main의 직접 외부 호출 코드가 남아 있지 않음
- 실제 화면에서 하이라이트, 재검토, AI 판정 복원이 확인됨

## 7. 참고: 코어가 제공하는 메서드 (화면은 이름만 알면 됨)

`session`, `signIn`, `signOut`, `setAutoLogin`, `models`, `installModels`, `cancelModelInstall`, `assist`(제목·부제·요약·사진 검색어), `factcheckStatus`, `factcheckRun`, `factcheckExternal`(조회 전용 옵션 포함), `semanticParse`, `transcribe`, `extractText`, `openSource`, `sourceBytes`, `saveArticle`, `latestArticle`, `searchPhotos`, `photoBytes`, `trackPhoto` — 정의는 `article_editor/web/src/api/core-api.js`

> **Data Map:** 보관함(ArchiveView) 화면의 **상단 메인 작업 공간**(왼쪽 위의 큰 빈 영역)에 들어갑니다(2026-10-07 확정). 탭이 아닙니다. 지금은 이식 대상이 아니고, 이 자리는 비워 두되 모양을 바꾸지 않습니다(코드에는 `data-testid="data-map-slot"`로 표시).

## 8. FormatConverter(플랫폼 변환) 생성 버튼 — 원본과 현재, 디자인 요청

main의 FormatConverter는 화면 틀만 있고 생성 버튼이 없었습니다. 실제 기능을 만든 `feature/platform-generator` 원본에는 생성 버튼이 3종 있었고, 현재 화면에는 아래처럼 대응합니다.

| 원본 버튼 | 원본 동작 | 현재 화면 (임시) | 디자인 요청 |
|---|---|---|---|
| **선택한 항목 생성** (`generate-selected`) | 체크한 플랫폼과 카드뉴스를 한 번에 생성 | 화면 오른쪽 위 "선택 항목 생성" (main 디자인에 이미 자리 있음) | 현재 위치 유지 가능, 생성 중·진행 상태 표시 정리 |
| **Instagram / Threads / Blog 원고 생성** (`generate-<플랫폼>-text`) | 플랫폼 하나만 개별 생성 | 가운데 작업 영역 제목 줄 오른쪽의 버튼 하나("**Instagram 원고 생성**", 이미 있으면 "다시 생성"). 지금 보고 있는 탭의 항목만 만듭니다(`data-testid="generate-active"`). 체크박스와 관계없이 동작 | 위치와 모양, "다시 생성하면 수정 내용이 새 결과로 바뀜"을 알리는 방식(지금은 마우스 올림 설명만) |
| **카드뉴스만 생성** (`generate-instagram`) | 플랫폼을 체크하지 않아도 카드뉴스만 생성, 현재 카드 목록 교체 | 카드뉴스 탭에서 같은 버튼이 "카드뉴스만 생성"(있으면 "카드뉴스 다시 생성") | 위와 같음. 카드 목록이 교체됨을 알리는 방법 |

원본의 작업 흐름은 **기사 불러오기 → 키워드 제안 → 키워드 선택(또는 직접 입력) → 생성 버튼**입니다. 현재 화면에서 아직 없는 것:
- **기사 URL로 불러오기** (`import-article`): 지금은 작성 중인 기사를 그대로 씁니다. 필요한지 결정해 주세요.
- **키워드 직접 입력**: 추천 후보만 있습니다. 원본은 후보 선택 또는 직접 입력이 가능했습니다.
- 생성 전 점검 문구: 원본은 "키워드를 선택하세요", "기사 제목과 원문을 먼저 입력하세요", "진행 중인 요청이 끝난 뒤 실행하세요"를 버튼 옆에 보여 줬습니다. 현재는 화면 왼쪽 아래 메시지 한 줄로 보여 줍니다.

참고: 원본 UI 코드는 `git show origin/feature/platform-generator:platform-generator/public/batch-generate-ui.js`, `generate-ui.js`, `text-editor-ui.js`(12장 "개별 생성 버튼")에서 볼 수 있습니다.

## 9. 취재자료 삭제 UI — 경고 후 강제 삭제 (디자인 요청)

코어에 취재자료 목록·삭제 API가 생겼습니다(화면은 아직 없음). 정책(사용자 결정 2026-10-07): **쓰는 기사가 있으면 먼저 경고하고, 사용자가 확인하면 강제로 지울 수 있다.**

| 동작 | 코어 | 화면에서 해야 할 것 |
|---|---|---|
| 자료 목록 | `GET /api/sources` → `{sources:[{id, name, format, size, chars, createdAt, usedBy:[{articleId,title}]}]}` | 자료 목록(이름, 형식, 크기, 글자 수, 올린 날짜). "N개 기사에서 사용 중" 표시 |
| 삭제 시도 | `POST /api/sources/<id>/delete` 본문 `{}` | 삭제 버튼. 쓰는 기사가 없으면 바로 지워짐(확인 한 번) |
| 경고 | 쓰는 기사가 있으면 **409**, 본문 `{error, code:"SOURCE_IN_USE", details:{usedBy:[{articleId,title}]}}` | 경고 대화상자: "이 자료를 쓰는 기사가 있어요" + 기사 제목 목록 + [취소] [그래도 삭제] (파괴적 동작이라 색·문구로 구분) |
| 강제 삭제 | `POST /api/sources/<id>/delete` 본문 `{"force": true}` | [그래도 삭제]를 누르면 이 요청. 성공하면 목록에서 제거 |
| 삭제된 자료 표시 | 기사 안의 자료 참조는 남습니다. 원본·본문 요청은 404 | 기사의 자료 목록에서 지워진 자료를 "삭제된 자료"로 표시(원본 열기·팩트체크 근거 보기는 비활성) |

주의: 팩트체크에 이미 쓴 판정 기록은 남지만, 근거 원본을 열 수 없게 됩니다. 이 점을 경고 문구에 한 줄로 알려 주세요.
화면에서 쓰는 API 이름은 `web/src/api/core-api.js`에 코어와 1:1로 추가됩니다(`listSources`, `deleteSource(id, {force})`).

