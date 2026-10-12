# 프론트 안내: 새로 추가한 화면(임시)과 호출 이름

작성일: 2026-10-07 · 개정: 2026-10-12(호출 이름 통일 반영) · 기준: `main`

## 1. 이 문서의 범위

원래 있던 기능(팩트체크 화면, 자동 저장, 자료 업로드, 제목·부제 추천 등)은 다루지 않습니다. 코어 기능을 추가하면서 **개발 쪽에서 임의로 만든 화면(임시)** 과 **그 화면이 부르는 호출 이름**만 정리했습니다.
- 임시 화면의 위치·모양·문구는 현재 디자인에 맞게 자유롭게 바꿔도 됩니다.
- **호출 이름(`src/api/`)과 `data-testid`는 유지**해 주세요. UI 스모크 테스트가 사용합니다. 바꿔야 하면 알려 주세요.
- 화면 소스는 루트 `src/`이고, `npm run build`가 `article_editor/app/frontend`에 결과를 만듭니다. 이 폴더는 빌드 산출물이라 충돌이 나면 소스를 해결한 뒤 다시 빌드해 주세요.

## 2. 지킬 규칙

- 화면은 코어를 `src/api/`의 이름 붙은 메서드로만 부릅니다(`fetch(`나 `"/api/..."` 문자열을 화면 코드에 쓰지 않음). `npm run check:api-boundary`가 검사합니다.
- 외부 AI·사진 서비스를 화면에서 직접 부르지 않고, API 키를 브라우저에 저장하지 않습니다.
- 확인: 루트에서 `npm run build`, `npm test`, UI 스모크 `node article_editor/dev/tests/ui-smoke.mjs`

## 3. 새로 추가한 화면 (임시)

| # | 화면 | 위치(`src/`) | 호출 이름 | `data-testid` |
|---|---|---|---|---|
| 1 | **저장 이력**: 목록, 미리보기(읽기 전용), 이전 저장본으로 복원 | `components/VersionHistory.jsx` | `listRevisions`, `previewRevision`, `restoreRevision` (`api/editorial.js`) | `version-history`, `revision-list`, `revision-preview`, `revision-restore`, `revision-restore-confirm` |
| 2 | **로그인·회원가입 대화상자**(이메일·비밀번호, 아래쪽 링크로 회원가입 화면 전환, 가입 시 비밀번호 확인 입력, 이메일 확인이 켜져 있으면 "확인 메일을 보냈어요" 안내 후 로그인으로 복귀), 공용 대화상자 틀 | `components/LoginDialog.jsx`, `components/AppDialog.jsx` | `signIn`, `signUp`, `signOut`, 세션 상태 (`api/editorial.js`) | `login-dialog`, `login-email`, `login-password`, `login-submit`, `login-error`, `login-mode-toggle`, `signup-confirm`, `login-notice` |
| 3 | **로그인 필수**: 로그인하지 않으면 기사·자료를 볼 수 없어서 로그인 창이 열려 있고 **닫을 수 없음**("나중에"·닫기 버튼·Esc 없음). 자료 요청이 `AUTH_REQUIRED`로 거절돼도 같은 창이 열리며, 로그인하면 하던 요청을 한 번 다시 보냄. 로그아웃하면 화면을 새로고침해 이전 계정의 내용을 비움 | `App.jsx`, `api/auth-gate.js` | `setLoginHandler`, `askLogin` | |
| 4 | **모델 설치 대화상자**: 목록·크기·설치/취소·진행 (헤더의 "모델 설치" 버튼과 팩트체크 서랍의 안내 버튼에서 열림. 환경 설정과는 별개 창) | `components/ModelsDialog.jsx` | `modelStatus`, `installModels`, `cancelModelInstall` | `models-dialog`, `models-install`, `models-cancel`, `models-progress` |
| 5 | **생성 버튼 3종**: "선택 항목 생성", 지금 보는 탭만 만드는 "원고 생성/다시 생성", "카드뉴스만 생성" | `components/FormatConverter.jsx` | `suggestPlatformKeywords(article, snapshotId)`, `generatePlatform(platform, article, keywords, requirements, snapshotId)` (`api/platform.js`) | `generate-active` |
| 6 | **고정본 기준 생성 안내**: 생성이 끝나면 메시지에 "(저장 N번 버전의 글 기준)"을 표시. 고정본을 못 만들면 "(고정본을 만들지 못해 현재 글로 생성했습니다)" | `components/FormatConverter.jsx` | `freezeArticle(article)` (`api/platform.js`) | |
| 7 | **카드 이미지 만들기**: 버튼, 완성 이미지 미리보기, "카드를 고쳤어요" 안내(이미지 흐림), 오류 문구 | `components/FormatConverter.jsx` (카드뉴스 편집 영역 맨 아래) | `renderCardImage(card, photo, snapshotId)` (`api/platform.js`) | `card-image-make`, `card-image-preview`, `card-image-error` |
| 8 | **취재자료 색인 상태**: 자료 목록 항목의 배지와 서랍 위쪽 안내문 | `components/FactCheckDrawer.jsx` | `listSources` → 항목의 `index: {state, chunks, progress}` (`api/core-api.js`) | `source-index-badge`, `factcheck-indexing` |
| 9 | **전체 다시 검증의 기준 버전 표시**: 서랍 상태 줄 아래 "마지막 전체 검증: 저장 N번 버전의 글 기준" (글이 바뀌었으면 "(그 뒤 글이 바뀌었어요)") | `components/FactCheckDrawer.jsx`, `components/EditorialAssist.jsx`(`useFactCheck`의 `basis`) | `factcheckArticle(content, files, cache, snapshotId)`, `freezeArticle` | `factcheck-basis` |
| 10 | **본문 하이라이트**: 본문 안의 문장을 판정별 색으로 칠함. 글이 1초 멈추면 자동 검증 | `components/ArticleWriter.jsx`의 `HighlightedBody`, `components/EditorialAssist.jsx`의 `useFactCheck` | `useFactCheck(article)` → `factcheckArticle` (`api/editorial.js`) | `fact-highlight`, `factcheck-status`, `factcheck-error` |
| 11 | **상위모델 재검토**: 로컬 판정기가 확정 못 한 문장의 하이라이트에 마우스를 올리면 말풍선이 뜨고, 누르면 다시 판정. 결과는 카드에 "AI 재판정"으로 표시되고 하이라이트가 사라짐. 서랍의 "AI 재판정 N건(임시)" 버튼으로 한꺼번에도 가능 | `ArticleWriter.jsx`(말풍선), `FactCheckDrawer.jsx`, `useFactCheck`의 `recheck`·`restoreExternal` | `externalRecheck`, `cachedExternalRecheck` (`api/editorial.js`) | `recheck-tip` |
| 12 | **서랍의 새로고침 버튼**: 전체 문장을 다시 검증(평소에는 고친 문장만 자동 검증) | `components/FactCheckDrawer.jsx` | `useFactCheck`의 `run(true)` | |
| 13 | **환경 설정 대화상자**(사이드바 "환경 설정" 버튼): 작성 중 기사 클라우드 백업 켜기/끄기(기본 켜짐), 사용자 자료 백업·복구. 모델 설치는 여기에 없음 | `components/SettingsDialog.jsx` | `getSettings`, `saveSettings({cloudBackup})`, `exportVault`, `restoreVault` (`api/editorial.js`) | `settings-dialog`, `settings-cloud-backup`, `settings-error` |

**화면별로 알아 둘 점**
- **고정본(3-6, 9):** 키워드 추천·생성·카드 이미지·전체 다시 검증을 누르면 코어가 지금 글을 저장해 고정본(그 시점의 글을 얼린 사본)으로 만들고, 그 기준으로 요청합니다. 글이 그대로면 같은 고정본을 다시 씁니다. 글이 멈출 때마다 도는 자동 검증은 고정본을 만들지 않습니다.
- **카드 이미지(7):** 카드 값을 이미지 입력으로 바꾸는 규칙은 `api/platform.js`의 `cardRenderPayload`에 있습니다(사진이 있으면 표지는 `cover`, 나머지는 `photo_body`, 사진이 없으면 `text_only`). 이미지는 카드 데이터의 `rendered_image: {id, uri}`에 저장됩니다. 렌더에는 Edge나 Chrome이 필요합니다(Windows 기본 설치).
- **색인 상태(8):** `indexing`(색인 중 NN%, 2초마다 새로 읽음) · `ready`(완료, 조각 수) · `failed`(실패, 팩트체크 때 다시 시도) · `pending`(안 됨: 서버 연결·로그인이 안 됐거나 옛 형식 자료). 색인이 끝나기 전에는 팩트체크가 자동으로 대기합니다.
- **본문 하이라이트(10)의 판정별 색(현재 값):** 자료와 불일치(CONFLICT)는 장미색에 안쪽 테두리로 가장 강하게, 근거 부족(EVIDENCE_GAP)은 호박색, 검토 필요(REVIEW·EXTERNAL_REQUIRED)는 보라색, 일치(SUPPORTED)는 평소에 칠하지 않고 서랍 카드에 마우스를 올린 동안만 초록색, 일치 문장 안의 날짜·기관·주체 세부 값(DETAIL)은 호박색입니다. 하이라이트가 겹치면 앞의 것만 칠합니다. 재검토(11)는 한 번 받은 결과를 원고를 다시 열어도 자동으로 불러오며(비용 없음) 문장을 고치면 지워집니다.
- **클라우드 백업(13):** 지금은 설정값만 저장하고 실제 클라우드 저장은 아직 연결되지 않았습니다(안내 문구에 같은 내용이 있음). 취재자료는 이 설정과 관계없이 이 PC에만 저장됩니다.
- **계정별 자료(3):** 기사·취재자료·사진·녹취는 로그인한 계정마다 따로 보관돼, 다른 계정으로 로그인하면 보이지 않습니다. 계정 도입 전에 쓰던 자료는 처음 로그인한 계정이 이어받습니다. 이전의 "로그인 안내 띠"와 "나중에" 버튼은 없앴습니다.

## 4. 코어는 준비됐지만 화면이 없는 것

### 취재자료 삭제 (경고 후 강제 삭제)
정책: 쓰는 기사가 있으면 먼저 경고하고, 사용자가 확인하면 강제로 지울 수 있습니다.

| 동작 | 코어 | 화면에서 필요한 것 |
|---|---|---|
| 자료 목록 | `listSources` → `{sources:[{id, name, format, size, chars, createdAt, usedBy:[{articleId,title}]}]}` | 목록과 "N개 기사에서 사용 중" 표시 |
| 삭제 시도 | `deleteSource(id)` | 삭제 버튼. 쓰는 기사가 없으면 바로 삭제 |
| 경고 | 쓰는 기사가 있으면 **409** `{error, code:"SOURCE_IN_USE", details:{usedBy:[{articleId,title}]}}` | 경고 대화상자: 쓰는 기사 제목 목록 + [취소] [그래도 삭제] |
| 강제 삭제 | `deleteSource(id, {force: true})` | [그래도 삭제]를 누르면 이 요청 |
| 삭제된 자료 표시 | 기사 안의 참조는 남고 원본·본문 요청은 404 | "삭제된 자료"로 표시(원본 열기·근거 보기 비활성) |

경고 문구에 "이미 쓴 팩트체크 판정 기록은 남지만 근거 원본을 열 수 없게 된다"는 점을 한 줄로 알려 주세요. 호출은 `deleteSource(sourceId, {force})`(`api/core-api.js`)로 준비돼 있습니다. 쓰는 기사가 있으면 409 오류(`code: "SOURCE_IN_USE"`, `details.usedBy`)가 오고, `{force: true}`로 다시 부르면 지워집니다. 한 건 조회는 `getSource(sourceId)`입니다.

### 로그인 유지 (예정)
회원가입은 임시 화면으로 구현했습니다(위 2번 항목, 코어 `signUp`). 아직 없는 것은 로그인 유지입니다.
- "이 PC에서 로그인 유지" 설정: 켜면 다음 실행 때 자동 로그인, 끄면 저장된 로그인 정보 삭제 (지금의 자동 로그인 토글 `AutoLoginToggle`을 대체). 코어 기능은 구현 전이라 화면 디자인을 먼저 받고 연결합니다.
- 회원가입 화면의 디자인(비밀번호 규칙 안내, 가입 후 안내 문구 등)은 임시 화면을 보고 정해 주세요.

## 5. 호출 이름이 바뀐 것 (2026-10-12)

팀 계약 문서와 이름을 맞추면서 `src/api/core-api.js`의 호출 세 개의 이름을 바꿨습니다. 화면 코드에서 옛 이름을 쓰고 있으면 새 이름으로 바꿔 주세요(`src/api/` 안의 사용처는 이미 바꿨습니다).

| 이전 | 현재 | 하는 일 |
|---|---|---|
| `knowledgeMap()` | `getKnowledgeMap()` | 데이터 맵용 지식 지도 |
| `extractText(filename, data)` | `createSource(filename, data)` | 취재자료 파일에서 글자를 뽑아 자료로 등록 |
| `factcheckRun(nodes, materials, snapshotId)` | `runFactcheck(nodes, materials, snapshotId)` | 팩트체크 실행 |

새로 쓸 수 있게 된 호출(화면은 아직 안 씀): `getSource(sourceId)`, `deleteSource(sourceId, {force})`, `getMediaAsset(assetId)`, `getJob(jobId)`, `cancelJob(jobId)`, `listSnapshots(articleId)`, `getSnapshot(snapshotId)`. 전체 대응표는 `docs/architecture/CONTRACT_VS_IMPLEMENTATION_v0.8.md`에 있습니다.
