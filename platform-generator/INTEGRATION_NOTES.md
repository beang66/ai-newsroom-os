# 플랫폼 로컬 통합 및 검증 기록

## 최신 main 로컬 통합 승인·담당자 확인 대기 (2026-10-13)

이번 승인은 기존 미커밋 플랫폼 기능을 커밋으로 보존한 뒤 최신 origin/main의 기존 변경을 작업 브랜치에 통합하고 필요한 검증·빌드·로컬 커밋을 수행하는 범위입니다. PR #42의 송고 중 편집 상태 보완과 PR #43의 계정 전환/백업 경쟁 조건·SNS 정리·IPC 미리보기·시험 격리 추가 보완은 별도 승인 대기이며 자동으로 실행하지 않습니다. main 직접 작업·push·PR 없음.

PR #44는 이미 포함되어 있습니다. 다음 두 항목은 플랫폼 기능을 막지 않으므로 현재 코드 그대로 보존하고 담당자 확인 대기로 기록합니다.

- 보관함의 기사 단계 필터·stageOf()와 안내문의 차이: 실제 구현은 전체/원고/송고 필터입니다. 실제 저장 기사에 없는 데스크 단계를 추정하거나 Core 상태를 변경하지 않습니다.
- 데스크 예시 ‘CMS 이관’의 플랫폼 편집실 이동 연결: 현행 링크를 유지합니다. 편집실은 실제 Core 기사의 명시적 적용 이후에만 생성하며, 데스크 예시를 실제 기사·고정본으로 적용하지 않으므로 플랫폼 사용을 막지 않습니다.

편집실 목록은 Core listArticles 결과만 사용하고, 보관함의 읽기 전용 데스크 예시 목록을 재사용하지 않습니다. 기존 기사 전환·미저장 보호·사진·Instagram/Threads·독립 카드뉴스·검수·저장/복원·렌더 경로를 보존합니다. 이후 통합 결과와 검증은 이 절에 추가 기록합니다.

## PR #41 호출 이름·API 경계 적용 확인 (2026-10-13)

- 브랜치 `feature/platform-update-20261009`, HEAD `12ca52c7bd7600edbd4157019d7cc3476aac4e32`. 적용되는 AGENTS.md 없음, merge/rebase 진행 없음, index 비어 있음. 기존 미커밋 파일 60개를 ignored `output/PR41_CHECKPOINT_20261013_123644/`에 파일 사본·삭제 목록·SHA256·작업 트리/index patch로 보존한 뒤 origin을 fetch했습니다.
- fetch 후 최신 `origin/main`은 `25e73af63116e46269452542e3df37b487e0c489` 그대로입니다. `git merge-base --is-ancestor origin/main HEAD`와 PR #41 병합 커밋 `2788ad2`의 HEAD 포함 검사가 모두 exit 0입니다. 중복 병합·보존 커밋·추가 생산 코드 수정은 필요하지 않았습니다.
- **적용 확인:** Data Map은 `getKnowledgeMap`, 자료 추출은 `createSource(filename,data,signal)`, 기사 팩트체크는 `runFactcheck(nodes,materials,snapshotId,signal)`을 사용합니다. `verifySnapshot → runFactcheck`, `createPlatformOutput → generatePlatform`, `transcribeMedia → transcribe` 문서 대응도 실제 공개 함수와 일치합니다. `core-api.js`의 `ROUTES.knowledgeMap`·`ROUTES.factcheckRun`은 내부 경로 키이며 옛 공개 호출이 아니므로 변경하지 않았습니다.
- **적용 확인:** 편집실·목록 모달·검수·카드 편집·SNS 준비는 `src/api/platform.js`와 기존 `src/api/editorial.js`의 공개 함수를 사용합니다. 편집실에 직접 Core 호출/요청 주소를 추가하지 않았으며, 사용자 허용된 App의 `changeArticle(id,"convert")` 연결을 유지합니다. 기사 팩트체크와 플랫폼 원고 검수(`validatePlatform`)의 목적은 구분되어 있습니다. Node 어댑터 내부 통신은 화면 API 경계와 별개입니다.
- `searchEvidence`, `getVerificationRun`, `listPlatformOutputs`, `getPlatformOutput`은 deferred이며 현재 화면/플랫폼 어댑터에 의존이 없습니다. 새로 공개된 호출을 확인 목적으로 사용하지 않았고 실제 자료 삭제·작업 취소도 하지 않았습니다. 계약 단위 검사 안의 삭제/취소 호출은 실제 Core가 아닌 메모리 전송 대역입니다.

### 이번 실행과 재사용 근거

- **이번 실행:** `npm run check:api-boundary` 통과. `npm test` 39개 통과, 실패/skip 0. 이전 39개 실행 뒤 편집실 전환 완료 Promise가 변경된 불확실성이 있어 현재 코드에서 한 번 재검증했습니다. 이번 사용자 지시의 팀 필수 검증에 따라 실행했고, 앞선 재실행 거절 당시에는 우회하지 않았습니다. `git diff --check`와 index 검사 통과, 미해결 충돌 없음.
- **재사용:** 직전 루트 `npm run build` 통과 결과(2026-10-13 12:25:48). 기준은 HEAD `12ca52c`에 현재 미커밋 편집실 변경을 더한 작업 트리이며 커밋된 코드만의 결과가 아닙니다. 마지막 소스 변경 12:25:21 이후 빌드되었고 이번 확인에서 루트 `src/`, package.json/lock, Vite 설정 중 빌드보다 뒤에 수정된 파일은 0개입니다. 이번 생산 코드/설정 변경 및 새 main 병합도 없어 동일 빌드를 반복하지 않았습니다. 프론트 생성 파일은 수동 수정하지 않았습니다.
- **재사용:** 위 최종 빌드의 `npm run test:ui` 통과(브라우저 오류 0). 실제 팀 편집실의 기사 선택·적용·고정본·생성·검수·렌더와 전환/늦은 응답 보호를 검사했습니다. 실제 팀 Core·임시 DB·브라우저 경로이며 AI/플랫폼 어댑터·SNS·인증은 대역입니다. 이후 관련 연결/시험 소스 변경이 없어 재사용합니다.
- **재사용:** `npm test --prefix platform-generator` 37개 및 로컬 저장 검사 통과. 이후 Node 플랫폼 코드 변경 없음. 이번 Python 생산 코드 변경이 없어 추가 Python 검사는 실행하지 않았습니다. 빌드/실계정 운영 AI/최신 EXE 검증을 혼동하지 않습니다.

이번 수정 파일은 이 기록과 ignored 로컬 상태 메모뿐입니다. 기존 팀/Core/API 구현·검사 규칙·KEEP 코드·workflows 삭제 상태·사진 기능을 유지했습니다. 후속 요청은 기존 Core 고정본 부제 전달, 원문 캡션/대체 텍스트 분리, Core Blog 허용 목록 정리와 운영 AI/EXE 검증이며 PR #41 때문에 새로 필요한 팀 코드 수정은 없습니다. commit/push/PR/main 작업 없음.

## 현재 기준 — 편집실 저장 기사 선택·미리보기·원문 적용 (2026-10-13)

이 절이 아래 과거 기사 선택·적용 지시와 기록에 우선합니다. 앞선 미커밋 통합 변경을 보존하며 같은 브랜치/HEAD에서 작업합니다.

### 실제 수정 범위와 팀 코드 보호

- 실제 팀 화면은 루트 `src/components/FormatConverter.jsx`의 ‘플랫폼 콘텐츠 편집실’입니다. 전용 API 층 `src/api/platform.js`와 편집실 전용 상태 `src/lib/platformSource.js`, 전용 목록 모달 `src/components/PlatformArticlePicker.jsx`를 수정/추가했습니다.
- `AppDialog`의 공개된 title/onClose/children 사용 방식과 `formatArticleTime`을 수정 없이 재사용합니다. 기존 `ArchiveView`는 선택 상태가 내부에 있고 데스크 예시/기사 편집 동작도 포함하여, 저장 기사 미리보기 선택 이벤트만 수정 없이 재사용할 수 없었습니다. 원래 보관함은 변경하지 않고 공통 모달 안에 Core 저장 기사 목록만 표시합니다.
- 편집실 밖 연결은 사용자에게 대상/이유/영향/대안을 설명하고 **‘기존 기사 전환 함수 연결 허용’** 답변을 받은 뒤 `src/App.jsx`에 `onApplyArticle={id => changeArticle(id, "convert")}` 한 줄만 추가했습니다. 기존 changeArticle·보관함·기사 작성·자동/수동 저장 함수는 이번 단계에서 수정하지 않았습니다.
- Core 코드, DB 스키마, 공통 API·상태 구조, 기존 본문/사진 복원기, KEEP 코드는 추가 수정하지 않았습니다. 파일명으로 담당자를 추정하지 않고 실제 호출 관계를 확인했습니다.

### 선택·표시·적용·생성의 연결

1. 왼쪽 ‘저장 기사에서 선택’ → 기존 Core `listArticles(signal)` → 내부 모달. 실제 title과 updated_at/created_at만 표시하고 기존 시간 표시 함수를 사용합니다. 검색은 불러온 목록의 제목만 대상으로 하며 Core 계약에 검색/페이지 인수가 없다는 안내를 표시합니다. 목록 없음·조회 중·오류·재시도 지원.
2. 목록 선택 → `getStudioArticle` → 기존 Core `getArticle`와 공개된 `loadStoredArticle`. 기존 본문/사진 복원기를 수정 없이 재사용하고 원래 조회 응답의 subtitle 필드 존재 여부를 표시 정보로 따로 보존합니다. 두 조회 사이 기사 ID·버전·제목·부제·출처·문자열 본문이 바뀌면 차단합니다. 실제 부제/빈 부제/미전달을 구분하며 본문 전체 입력칸이나 기사 JSON 업로드는 없습니다.
3. 미리보기는 편집실 내부 상태일 뿐 기존 작업 기사/적용 원문을 바꾸지 않습니다. 다른 기사 미리보기 중에도 적용 기사 제목과 차이를 명시합니다. 실패한 조회는 미리보기를 비우고 오류를 표시합니다.
4. ‘이 기사로 콘텐츠 제작’은 원문 적용과 기존 저장·전환 정책만 수행합니다. AI와 createSnapshot은 호출하지 않습니다. 같은 작업 기사는 기존 flush로 저장 큐를 동기화한 후 재조회하며 미저장 편집을 DB 값으로 덮지 않습니다. 기사 객체 revisionNo는 초기 조회값일 수 있어 이를 실제 저장 큐 버전으로 추정하지 않습니다. 다른 기사는 기존 changeArticle로 미저장 결과를 저장/취소 정책대로 보호한 후 전환합니다. 새 편집실 마운트의 실제 기사 ID·원문 일치가 확인되어야 적용 완료입니다. 실패/취소를 성공으로 표시하지 않습니다.
5. 적용 확인은 편집실 전용 메모리 상태이며 DB 저장소나 공통 상태/고정본 계약이 아닙니다. 원문 변경 후 재적용이 필요하고 새로고침/앱 재실행 후에도 명시적 적용이 필요합니다. 공통 ID나 고정본 ID를 만들지 않습니다.
6. 추천/생성은 적용된 현재 팀 작업 기사만 사용합니다. 기존 flush → freezeArticle/createSnapshot → Core 고정본 → Node 첫 줄 JSON 경로를 유지합니다. 키워드 `input.article`, 생성 `input.payload.article`, 기사 `{article_id,title,content}` 계약 유지. 표시 부제를 생성 입력에 합치지 않습니다. 요청 중 기사/조건/원고 변경과 늦은 응답 보호도 유지합니다.

URL 수집 없음, 사용자 키워드·제작 요구사항 유지, 내 카드 사진의 기존 별도 저장/복원/렌더/SNS 경로 유지, Blog UI/플랫폼 제거 및 과거 기록 보존 유지. Core 고정본 부제 전달·원문 캡션/대체 텍스트 분리·Blog 허용 목록 제거는 담당자 후속 요청입니다. 이번 모달 조회에서는 원래 JSON의 부제 미전달 상태를 보존하므로 공통 조회 변환기를 추가 수정하지 않습니다.

### 검증

- `npm test`: 39개 통과. 적용/미리보기 분리, 실제 전환 원문 확인, 취소·원문 변경 차단, 기존 API/IPC·JPG·팀 화면 상태 회귀 포함. 새 IPC 시험에서 singleton이 잡은 브리지 대역의 시험 간 오염을 고쳐 다시 통과했습니다. 테스트 삭제/skip/검증 완화 없음.
- 루트 `npm run build`: 통과. `article_editor/app/frontend/**`는 실제 루트 소스 빌드 산출물이며 수동 수정하지 않습니다.
- `npm test --prefix platform-generator`: 37개 및 로컬 저장 검사 통과. 기존 사진·카드·SNS 대역 회귀 유지.
- 최종 `npm run test:ui`: 통과, 브라우저 오류 0. 목록 열기/제목 검색/선택/확인/적용/생성, 미적용 차단, 다른 기사 미리보기 중 적용 원문 유지, 실제 Core ID·본문 일치, 원문 변경 후 재적용, 기존 편집 저장/전환 취소 보존, 늦은 조회/생성, 적용 중 화면 이탈, 빈 목록/목록 오류/기사 조회 실패/삭제/본문 없음, 부제 있음/없음/원래 JSON 미전달까지 확인했습니다. 적용 버튼의 AI·고정본 요청 수가 늘지 않는 것도 검사했습니다.
- `npm test` 추가 재실행 요청 1건은 거절되어 실행하지 않았습니다. 이미 39개 통과한 결과와 이후 컴포넌트/전환 수정의 최종 build/UI 검증을 구분합니다. 해당 명령을 우회해 실행하지 않았습니다.
- Core/팀 Python 생산 코드는 이번 단계에서 추가 변경하지 않았습니다. UI smoke는 실제 팀 빌드·Core·임시 SQLCipher 저장소·브라우저를 사용하며 AI/플랫폼 어댑터·SNS·인증 응답은 대역입니다. 운영 AI·실계정 게시·최신 EXE 성공으로 확대해 보고하지 않습니다.

이번 단계에서도 commit/push/PR/main 병합 없음. 기존 미커밋 수정과 workflows 삭제 상태를 유지합니다.

검증 중 보완: 초기 기사 객체 revisionNo와 실제 저장 큐 버전을 혼동하던 비교를 제거하고 기존 flush로 동기화합니다. 다른 기사 전환 완료는 프레임/시간 추정 없이 새 편집실 마운트의 기사 ID·원문 확인 Promise로 확정합니다. 적용 조회 도중 화면을 떠나면 요청을 즉시 취소하고 오래된 콜백을 실행하지 않습니다. 기존 전환 확인 취소 시 원고와 적용 원문을 유지하는 회귀도 포함합니다. 팀 전환/저장 함수 자체는 변경하지 않았습니다.

최종 `git diff --check` 통과, 미해결 충돌 없음, index 비어 있음. 이전 작업의 개발용 DB 중계 제거 외에 팀 소스 삭제 없음. 변경 파일 lint 오류 0이며 App의 기존 로그인 effect 경고 2개와 편집실 ref/state effect 관련 경고 5개가 남아 있습니다. 경고를 숨기지 않았고 해당 전환·취소·편집 동작은 최종 UI 회귀에서 검사했습니다. 이번 기능 연결에 필요한 편집실 밖 후속 수정은 없습니다. Core 계약/EXE/운영 AI·SNS 후속 검증은 위에 명시한 범위로 남습니다.

## 과거 기록 — Core 기사 계약·부제 표시 분리·Blog 제거 (2026-10-13)

이번 지시가 아래 과거 기사 입력·부제 기록을 대체합니다. 브랜치 `feature/platform-update-20261009`, 시작 HEAD `12ca52c`, 기존 `25e73af` 통합을 유지합니다. 이번 변경은 미커밋입니다. merge·abort·reset·clean·commit·push·PR·main 작업을 하지 않았습니다. 적용되는 AGENTS.md와 변경 대상의 KEEP 표시는 발견되지 않았습니다.

### 기사 데이터 출처와 생성 입력

현재 플랫폼 입력 계약은 **`{ article_id, title, content }`**이며 content는 Core 고정본의 기사 본문 텍스트입니다. `core-adapter.js` 첫 줄 JSON에서 키워드는 `input.article`, 생성은 `input.payload.article`, 검수는 기존 `input.payload.article`을 사용합니다. 새 DB·기사 저장소·JSON 기사 업로드·기사 선택 UI·공통 ID·snapshot_id를 만들지 않습니다.

| 항목 | 화면/데이터 출처 | 생성 입력 |
|---|---|---|
| 기사 선택 | 기존 보관함 → 수정 → 기사 작성 → 변환·배포. Workspace.changeArticle의 조회·전환 저장 정책 재사용 | 변환 화면의 중복 기사 선택기 제거 |
| 제목 | 현재 선택·편집 중인 팀 article.title | 저장 큐 flush → 기존 createSnapshot.title → article.title. 저장 시 제목과 본문 HTML 일치 검사 |
| 부제 | 팀 화면이 제공하는 article.subtitle만 읽기 전용 표시 | **생성 원문에 넣지 않음**. 실제 값/빈 값/속성 미전달을 ‘실제 부제’/‘부제목 없음’/‘부제 전달 미연결’로 표시 |
| 본문 | 고정본 body_text | article.content에 그대로 전달. 캡션·대체 텍스트를 추측하거나 정규식으로 삭제하지 않음 |
| 기사·고정본 ID | 저장 응답 articleId, 고정본 응답 id | 생성·검수·렌더에 기존 Core ID 연결. 화면 편집 최신성 서명은 로컬 보호용이며 공통 ID·고정본 계약을 대신하지 않음 |
| 출처 URL | 기존 데이터에 제공된 값만 표시 | 고정본에서 실제 제공된 URL만 별도 source_url 메타데이터로 보존. AI 기사 입력 밖에서 처리. URL이 없어도 생성 가능 |

현재 로컬 Core의 `_from_snapshot`에는 이전 작업의 subtitle/url 전달 변경이 이미 존재합니다. 이를 되돌리거나 추가 수정하지 않았습니다. 플랫폼 `lib/article-contract.js` 및 실제 어댑터·생성·검수 경계에서 세 필드만 선택하므로 이전 Core의 부제·사진 필드가 AI 원문에 섞이지 않습니다. 키워드 모델에는 기존 구현대로 title/content만 전달됩니다. 최신 화면의 부제를 과거 고정본 본문에 합치지 않습니다.

왼쪽 최상단 ‘불러온 기사’는 플랫폼·키워드·제작 요구사항보다 위에 있습니다. 긴 제목·부제는 전체 줄바꿈 표시, 수정은 기존 기사 작성 화면에서 처리합니다. 기사 미선택·본문 없음·불러오는 중·조회 실패를 안내하며 처리 중인 기사 제목과 고정본 처리 상태를 표시합니다. 별도 전체 본문 입력칸은 없습니다. 요청 중 기사·조건·원고·사진 변경과 늦은 조회/생성/검수/렌더 결과는 기존 생존 여부·ID·서명 검사로 보호합니다. 기사 전환 전 저장 확인/flush와 동일 원문 고정본 재사용을 유지합니다.

**부제 미전달 상태의 제한:** 기존 `src/api/editorial.js` 조회 변환기가 누락된 부제도 빈 문자열로 정규화합니다. 따라서 실제 저장 기사 조회에서는 ‘없음’과 ‘미전달’을 완전히 구분할 수 없습니다. 화면 helper의 세 상태는 회귀 검사했지만 미전달의 실DB 연결 검증은 완료로 표시하지 않습니다. 화면의 부제 표시와 생성 입력의 부제 전달은 별개입니다.

### 기능별 위치·호출·저장 방식

| 기능 | UI와 호출 경로 | 저장/지원 상태 |
|---|---|---|
| Instagram·Threads·독립 카드뉴스 | 루트 src/components/FormatConverter.jsx → src/api/platform.js → 기존 Core → 실제 core-adapter.js | 기존 platformDrafts/cardNews/platformGeneration에 별도 결과 저장 |
| 변환·요구사항 검수 | PlatformReview → Core validate → validation-routes/draft-validator | 기사 전체 팩트체크와 구분. 수정 후 재검수 필요, 수정 중 검수 결과 미적용. 차단 정책 새로 만들지 않음 |
| 내 카드 사진 | PlatformCardEditor / 개발용 photo tools → 기존 팀 Core 사진 API / 개발용 사진 경로 | 추천·검색·업로드·선택·삭제, 확대·축소·위치·그라데이션, 캡션·출처 편집·보존, 저장·복원·렌더·SNS 첨부 유지. 본문/source_evidence에 자동 합치지 않음 |
| 렌더·SNS 준비 | PlatformDelivery → 기존 Core 렌더/암호화 MediaAsset/SNS 준비 | 기사·고정본·이미지 최신성 확인 유지. JPG 내보내기와 Core 암호화 보관 구분. 실제 게시 없음 |
| 개발용 편집실 | node server.js / public/article-input.js / 기존 초안 복원 | DB 선택·Core 중계 제거. 앞선 작업에서 만든 db-article-routes.js는 다른 기능 참조/KEEP가 없어 제거. 새 고정본을 만들지 않고 개발용 결과임을 표시. 카드·사진·로컬 초안 유지 |
| URL 수집 | /api/article/import 및 article-source.js 참조 점검 | 앞선 삭제 상태 유지. URL 입력·불러오기 없음. workflows 복구 없음 |
| Blog | 선택·버튼·탭·생성·초안 편집·검수·미리보기·내보내기 없음 | Node 생성/검수 요청 명시적 미지원 400. 규칙·스키마 없음. 기존 Blog 기록은 비노출 상태로 원래 값 그대로 보존, 새 지원 원고 저장 시에도 삭제하지 않음 |

**Blog 전체 시스템 제거는 미완료:** Core platform_manager.py generate 허용 목록에 blog가 남아 있으며 이번 범위에서 수정하지 않았습니다. 실제 Core→Node 요청은 400으로 거부하는 회귀를 통과했지만 Core 허용 목록 정리는 담당자 후속 작업입니다. 최신 EXE/packaging 사본은 재빌드하지 않았으므로 EXE 제거 완료로 보고하지 않습니다.

### Core 담당자 후속 요청

1. 고정본 기준 부제 전달: 공식 세 필드 입력과 화면 표시를 분리합니다. 명시적 계약과 고정본 출처를 갖춘 전달은 담당자 후속 요청입니다.
2. 원문 본문과 사진 캡션·대체 텍스트 분리: content에 혼입되면 추천 키워드·원고 주제·기사 근거·카드 정보 배분에 영향을 줄 수 있습니다. 플랫폼에서 임의 삭제하지 않습니다.
3. 조회 시 부제 필드 존재 여부 보존: 누락을 빈 값으로 정규화하는 경로 때문에 실DB ‘미전달’ 상태 연결이 남습니다.
4. Core의 Blog 허용 목록/관련 공통 계약 정리와 최신 EXE 패키징 반영.

이번 작업에서 `_from_snapshot`, platform_manager.py, storage.py, vault.py, 공통 고정본 계약, src/api/editorial.js, src/api/core-api.js를 추가 수정하지 않았습니다. 이전 Core schema v5/본문 변환/캡션 관련 변경도 되돌리지 않았습니다. 내 카드 사진은 기존 별도 경로로 유지합니다.

### 검증 결과와 한계

- `npm test`: 37개 통과, skip 0.
- `npm test --prefix platform-generator`: 37개 및 로컬 저장 검사 통과. 사진·출처·편집·저장·개발 UI·SNS 대역 검사 포함.
- 팀 `.runtime` 의존성을 지정한 `python -m unittest discover -s article_editor/dev/tests -p 'test_platform*.py'`: 25개 통과. 실제 Core→실제 Node→AI 대역 경계에서 세 필드·캡션 유지·부제 배제·출처 메타데이터·Blog 거부 확인.
- 같은 환경의 `python -m unittest discover -s article_editor/dev/tests -p 'test_snapshots.py'`: 20개 통과. 기존 저장·고정본 생성·재사용 회귀.
- 루트 `npm run build`: 통과. 실제 화면 소스는 루트 src/, article_editor/app/frontend/**는 실제 빌드 산출물만 반영하며 수동 수정 없음.
- 변경한 프론트 파일 oxlint: 오류 0, 기존 App 로그인 effect 의존성 경고 2.
- 루트 `npm run test:ui`: 통과, 브라우저 오류 0. 실제 팀 화면에서 기존 보관함 선택 → 제목/부제 → 고정본 → 생성/편집/검수 → 저장/복원 → Core 렌더 확인. 긴 메타데이터, URL/부제 유무, 기사 미선택/본문 없음, 조회 실패/DB 삭제, 늦은 조회/생성, 생성 중 조건 수정, 고정본 재사용, Blog UI 비노출/기존 기록 보존 포함. 부제 미전달 실DB 경로는 위 제한 사항으로 남음.

UI 시험의 첫 실패는 미저장 상태에서 새로고침해 기존 beforeunload 보호가 취소한 것이며, 수동 저장 완료를 확인하도록 수정했습니다. 두 번째는 DB 삭제 후 목록에서 사라진 행을 다시 누르는 시험 순서 오류였으며, 삭제 전에 미리 선택하고 실제 열기에서 삭제/404를 확인하도록 바꿨습니다. 앱 보호 정책·검증 기준을 완화하지 않았습니다. 최종 diff --check 통과, 미해결 충돌 없음, index 변경 없음, Core 담당자 파일 추가 수정 없음. 산출물 이외의 삭제는 사용처 확인 후 제거한 개발용 DB 중계 파일 1개뿐입니다.

최초 sandbox 실행은 Node spawn EPERM으로 막혀 허용 환경에서 재실행했습니다. 기본 Python에는 keyring이 없어 팀 `.runtime` 의존성 경로를 지정해 다시 실행했습니다. 테스트 삭제/skip/검증 완화로 통과시키지 않았습니다. 폐지한 개발용 DB 중계 테스트는 경로 부재·세 필드 계약·읽기 전용 복원 검증으로 대체했습니다.

UI 스모크는 실제 팀 빌드·Core·임시 SQLCipher 저장소·브라우저를 사용하지만 플랫폼 어댑터와 AI·사진·SNS·인증 응답은 대역입니다. 실제 Node 입력 경계는 별도 Python 회귀에서 검사합니다. 운영 AI·실계정 SNS·최신 EXE는 이번 변경 이후 미검증입니다. 과거 SNS 수동 확인과 개발용 편집실 성공을 현재 팀 앱·EXE 성공으로 간주하지 않습니다.

## 과거 기록 — DB 기사 입력 변경 (2026-10-12, 현재 기준 아님)

이 절은 당시의 작업 이력입니다. 현재 구현·지원 범위·검증 상태는 위 2026-10-13 절을 따릅니다. `25e73af` 통합은 `4d3ec8b`에서 완료됐고 이 과거 변경은 같은 작업 브랜치에서 이어갔습니다. 새 merge·abort·reset·clean·push·PR은 실행하지 않았습니다.

새 DB·기사 JSON 업로드·URL 수집을 만들지 않았습니다. 기존 계정별 SQLCipher 저장소의 기사 JSON을 Core `listArticles/getArticle/saveArticle/createSnapshot`으로 사용합니다. 목록의 수동 저장 요약 정책은 유지하고 선택 조회는 임시 저장을 포함한 최신 원고입니다.

| DB/화면 원고 JSON | 생성·검수 입력 | 고정본 |
|---|---|---|
| `articleId` (Core 저장 후 실제 32자리 ID) | `article.article_id` | 기존 `article_id` |
| `title` | `article.title` | `title` 사본 |
| `subtitle` (없으면 빈 문자열) | `article.subtitle` | `subtitle` 사본, 표시만 ‘부제목 없음’ |
| `content` 문자열 / 기존 `bodyHtml` HTML | 사진 자리 줄을 제외한 기사 글자 | 기존 `body_html` 및 `_text_of`의 `body_text` |
| 선택적 `url` | `article.url` (출처 링크만) | `url` 사본 |
| Core snapshot의 `id` | 생성·검수·렌더 `snapshotId`, 결과 `snapshot_id` | 기존 UUID |

실제 팀 본문은 문자열 `content` + HTML `bodyHtml`입니다. 문자열이 아닌 과거/구조화 본문은 기존 HTML 변환을 사용하고 사진 설명·삭제된 글을 기사 내용에 넣지 않습니다. HTML도 없는 알 수 없는 객체는 조회 오류로 안내합니다. 객체 문자열화·JSON 전체 전달·임의 ID/부제 생성은 하지 않습니다.

### 화면·호출·저장 및 비동기 보호

- **실제 팀 화면**: 루트 `src/App.jsx`의 기존 `Workspace.changeArticle`을 ‘변환·배포 → 왼쪽 최상단 → DB 기사 선택’에서도 재사용합니다. 전환 전 기존 수동 저장 확인/flush 정책으로 플랫폼 편집을 보호하고 선택 후 변환 화면에 머뭅니다. ‘불러온 기사’의 제목·부제는 읽기 전용이며 전체 줄바꿈으로 표시합니다. 수정은 ‘기사 편집’으로 이동합니다. 기사 미선택·본문 없음·조회 실패·불러오는 중 상태와 요청 진행 중 기준 기사 제목/부제를 표시합니다. 사용자 키워드·제작 요구사항은 유지합니다. 별도 본문 입력칸은 없습니다.
- **고정본**: `freezeArticle(article, {flush, strict:true})`가 기존 저장 큐를 끝내고 Core로 고정합니다. 표시/요청 원문과 고정본의 제목·부제·HTML·출처를 비교하며 저장/고정 실패 시 생성은 중단합니다. DB schema **v5**는 기존 `article_snapshots`에 원고의 `subtitle`, `url` 사본 열만 추가합니다. v4 고정본은 수정하지 않고 없는 메타데이터는 빈 값으로 유지합니다. 기존 `content_hash(title, body_html)` 레시피·ID·불변 트리거·명시적 `revision_id` 동작을 유지합니다. 최신 고정의 재사용은 제목·HTML 해시와 부제·출처를 함께 비교합니다. 플랫폼 결과만 저장한 이력은 같은 원문 고정본을 재사용하고 생성 정보가 바뀌면 새 고정본을 사용합니다. 수정한 플랫폼 결과는 기존 `platformDrafts/cardNews/platformGeneration`에 따로 보존합니다.
- **비동기**: 조회의 동기 잠금·AbortController·작업 영역 해제 검사로 늦은 응답이 새 화면을 덮어쓰지 않습니다. 생성은 실행 시점 원문/조건/원고 서명, 화면 생존 여부 및 반환 article/snapshot ID를 검사합니다. 기사 전환·원문/조건/플랫폼 편집 중 변경된 결과는 적용하지 않습니다. 실패한 선택은 기존 기사 유지임을 명시합니다.
- **개발용 편집실**: `public/article-input.js`도 DB 선택과 읽기 전용 제목·부제를 제공합니다. `db-article-routes.js`는 루트 `createCoreApi`를 재사용해 Core JSON API만 중계하며 DB에 직접 접근하지 않습니다. `NEWSROOM_CORE_ORIGIN=http://127.0.0.1:8765`에서 Core 실행/로그인이 필요합니다. 기존 로컬 SNS와 같은 loopback/Origin 정책과 Core POST Origin 전제조건을 지킵니다. 단일/일괄 생성은 같은 Core 고정본을 사용합니다. 실제 편집이 있으면 기존 opt-in 로컬 초안 저장이 성공한 뒤 전환하고 실패하면 보존합니다. 조회 실패 시 원문을 비워 실패 상태를 표시합니다. 개발용 JPG/Documents 저장과 팀 Core 암호화 저장은 별개입니다. 기존 플랫폼 초안 JSON 복원은 유지하지만 기사 JSON 업로드를 추가하지 않았습니다.
- **URL 정리**: `/api/article/import`·`article-source.js`의 실제 호출은 개발용 server/API/article-input뿐이었고 다른 팀 기능·CI 호출이나 KEEP 표시는 없었습니다. 수집 파일·라우트/API·URL 입력/버튼·잠금 참조/불필요 스타일만 제거했습니다. DB `url`은 저장·복원·고정·생성 입력과 출처 링크에 보존합니다. workflows와 이전 미사용 수동 테스트의 삭제 상태는 유지합니다.
- **빌드**: 화면 소스는 루트 `src/`, 명령은 루트 `npm run build`입니다. `article_editor/app/frontend/**`는 해당 소스 재빌드 결과만 포함합니다. 생성 파일 삭제는 이전 해시 자산 교체이며 팀 기능 삭제가 아닙니다.

### 이번 검증과 실행 한계

루트 `npm test` **36개**, 플랫폼 `npm test --prefix platform-generator` **37개 및 로컬 저장 검사**, 전체 Python unittest **399개(기존 skip 6개)**, 루트 `npm run build`, `npm run test:ui`가 통과했습니다. Core HTTP 중계의 실제 POST Origin/기사 ID 경로 검사와 개발용 편집 보존도 통과했습니다. 변경 파일 lint는 오류 없이 useEffect 의존성 경고 2개를 표시했습니다. 초기 spawn/네이티브 모듈/SQLCipher 읽기 실패는 샌드박스 실행 제한으로 허용된 환경에서 재실행했습니다.

실제 팀 빌드/브라우저/Core 암호화 DB를 사용한 UI smoke는 기사 선택 → 제목·부제 → 고정본 → 원고/카드 → 편집/검수 → 저장/복원 → Core 렌더를 검사합니다. URL/부제 유무, 긴 제목·부제 전체 표시, HTML 본문 호환, 본문 없음, 조회 실패/삭제, 기사 전환, 늦은 조회/생성/검수/렌더 응답, 부제 변경 시 새 고정본, 플랫폼 결과 저장 후 고정본 재사용도 포함합니다. 이전 고정본 혼합 테스트는 실제 원문 변경으로 다른 고정본을 만들어 차단을 검사하며 검증을 삭제/skip/완화하지 않았습니다. 플랫폼 UI의 수동 저장은 실제 Core manual 응답과 헤더 저장 표시로 확인합니다. UI 실패 시에도 SNS를 닫고 서버 종료 후 시험 임시 디렉터리만 정리합니다.

UI smoke의 AI·사진·SNS·인증 응답은 시험용입니다. 실제 운영 계정/AI/backend와 최신 EXE는 미검증입니다. 아래 실제 Instagram·Threads 계정/사진 순서/줄바꿈 확인은 **4d3ec8b 당시 과거 검증**이며 이번 DB 입력의 운영 계정 재검증으로 표시하지 않습니다. 실제 게시·push·PR은 실행하지 않았습니다.

추가 UI 검증에서 기사 미선택의 제목/부제 안내·생성 비활성화·플랫폼 본문 입력칸 없음과 생성 도중 제작 요구사항을 고친 경우의 결과 폐기까지 통과했습니다. 최종 UI smoke의 브라우저 오류는 0개입니다.

최종 확인은 2026-10-13(Asia/Seoul)에 마쳤습니다. 변경한 파일은 루트 기사 전환/조회/변환 UI·API·상태 서명, Core 저장/스키마/플랫폼 매니저, Node 생성 입력/인용 검사/개발용 DB 연결/입력 UI, 관련 회귀 테스트·계약 문서·본 문서, 루트 빌드 생성물입니다. 확인용 실제 팀 Core `http://127.0.0.1:8765`와 Chrome 창을 열어 두었습니다. 이 실행 환경에는 팀 로그인이 없으므로 사용자가 로그인한 뒤 ‘변환·배포’에서 DB 기사를 선택해야 합니다. 이 창에는 시험용 인증을 삽입하지 않았습니다. .env·세션·runtime·QA DB·이미지·서버 로그는 커밋에서 제외합니다.

## DB 입력 변경 전 통합 기록 (과거 상태)

## 로컬 통합 기준 — 2026-10-12 (DB 입력 변경 전)

현재 기준 main은 `25e73af63116e46269452542e3df37b487e0c489`입니다. 초기 `8ee7a3b` 병합은 `1762e61`, 원래 작업 보존은 `6fd20c6` 및 `backup/platform-before-main-20261012-openai`입니다. 추가 연결 작업은 `6e663a2`에 보존했고 추가 main 병합 전 백업은 `backup/platform-before-main-25e73af-20261012`입니다. main에 직접 커밋하거나 push·PR을 실행하지 않았습니다.

아래 과거 마일스톤의 n8n 설명은 당시 기록입니다. 현재 플랫폼 기능은 Node 코드로 전환했으며 `workflows/**`를 실행하거나 복구하지 않습니다. 팀 앱은 `PlatformManager` → `core-adapter.js` → 생성기·렌더러를 사용하고, 개발용 편집실은 `server.js`의 Express 경로를 사용합니다. 팀 메인 UI와 개발용 편집실을 함께 유지하며 공용 API·카드 모델·템플릿은 `lib/`에서 제공합니다. 팀 Core의 AI 브리지, 스냅샷 입력과 암호화 이미지 저장 계약은 유지합니다.

`origin/main`의 이전 수동 테스트를 파일별로 검토했습니다. 현재 및 main의 package.json, 전체 코드·팀 문서에 이 파일들을 호출하는 참조가 없고 `.github/workflows` CI도 없습니다. 아래 파일과 제거한 n8n 워크플로에는 KEEP 표시가 없으며 모두 삭제 상태로 유지합니다.

| 이전 파일 | 삭제 유지 이유 | 보존한 검증 경로 |
|---|---|---|
| `test-gemini.cjs` (`test-gemini.js`는 없음) | 이전 수동 연결 점검. 현재 OpenAI 경로에 필요한 model·JSON format type/name이 없는 요청 | `tests/card-news-ai.cjs`의 명시적 실제 AI 생성·검수 |
| `test-instagram.js` | 개발 서버를 호출해 응답을 출력하는 수동 예제. 자동 수집·assertion 없음 | `tests/writing-rules.test.cjs`, `tests/platform.test.cjs`, 팀 UI 스모크 |
| `test-keywords.js` | 응답을 출력하는 수동 예제. 자동 수집·assertion 없음 | 팀 `test_platform_manager.py`의 키워드·스냅샷 전달 검사, UI 스모크의 키워드 경계 |
| `test-text-platforms.js` | 현재 생성기에서 지원하지 않는 blog를 포함하는 이전 수동 예제 | 현재 Instagram·Threads·독립 카드뉴스 회귀 테스트와 UI 스모크 |
| `test-validation.js` | 이전 초안 형식의 수동 요청. 사실 오류가 검출됐는지 assertion 없음 | `tests/card-news.test.cjs`, `tests/writing-rules.test.cjs`의 검수·근거·교정 회귀 검사 |

플랫폼 자동 검증은 `npm test --prefix platform-generator`로 팀의 `test-local-storage.js`와 `tests/*.test.cjs`를 모두 실행합니다. 팀 공통 검증은 루트 `npm test`, `npm run build`, `npm run test:ui`와 `python -m unittest discover -s article_editor/dev/tests -p 'test_*.py'`입니다. Python 저장·문서 추출·팩트체크 의존성은 팀 requirements 파일을 따릅니다. 개발용 저장은 기존 팀 정책대로 `PLATFORM_LOCAL_STORAGE=1`일 때만 켭니다.

실제 AI 확인(`node tests/card-news-ai.cjs`)은 API 키와 과금이 필요한 수동 검증이며 자동 테스트에 포함하지 않습니다. 실제 SNS 로그인·작성창 준비는 모의 브라우저 검사와 구분합니다. 자동 검증에서는 실제 게시물을 발행하지 않습니다.

### 현재 화면·호출·저장 경로

실제 팀 화면 소스는 저장소 루트 `src/`입니다. **루트** `npm run build`가 `article_editor/app/frontend/`를 재생성하며 생성 파일은 수동 병합하지 않습니다. 개발용 편집실은 `npm start --prefix platform-generator`의 `http://localhost:3001`입니다. 개발용 편집실의 성공은 팀 앱이나 EXE의 성공을 뜻하지 않습니다.

| 기능 / 팀 UI 위치 | 실제 호출 경로 | 저장·현재성 / 검증 |
|---|---|---|
| 기사 입력, 변환·배포 → 키워드·선택 항목 생성 | `src/api/platform.js` → Core 저장·snapshot → `/api/platform/keywords`, `/generate` → `PlatformManager` → `core-adapter.js` | 실제 저장소의 기사 ID만 사용. 한 생성 작업의 Instagram·Threads·독립 카드뉴스는 같은 snapshot. 자동 UI·Core 테스트 검증 |
| 변환·배포 → 현재 원고 검수 | `/api/platform/validate` → adapter → 기존 `validation-routes.js` → `draft-validator.js` → Core AI 브리지 | 변환 왜곡·근거·요구사항 검수. 작성 화면의 취재자료 기반 기사 전체 팩트체크와 구분. 편집 후 재검수 필요, 실행 중 변경된 결과 폐기. 생성 원문·검수 결과는 원고 저장에 포함 |
| 카드뉴스 → 텍스트·배치·위치·사진 편집 | `PlatformCardEditor.jsx` → 공용 `lib/card-model.js`, `card-template.js`; 기존 팀 `ImageEditor` 재사용 | 현대 answer/detail 및 이전 body 초안 호환. 텍스트·사진·출처·위치·카드 순서 변경은 렌더 최신성 무효화. 실제 화면 회귀 검증 |
| 카드뉴스 → 현재 카드 사진 찾기·업로드 | `/api/assist(photo_keywords)` → Core AI/backend; 검색·가져오기·다운로드 기록은 기존 팀 Unsplash/Core 경로 | 추천 입력은 현재 카드 keyword/headline/answer/detail/body, 기사 전체는 보조 맥락. 운영 UI는 Unsplash 키를 직접 사용하지 않음. 사진의 data/original 및 출처·provider·sourceUrl·unsplashId는 기존 암호화 저장 계약 유지 |
| 초안 저장·불러오기 | 기존 기사 자동/수동 저장 → `platformDrafts`, `cardNews`, `photos`, `platformGeneration` | Core 암호화 vault와 MediaAsset. 사진 바이트·출처·카드 photoId 연결 복원 검증. 개발용 Documents 저장은 명시적 opt-in이며 별개 |
| 카드 이미지 만들기·전체 JPG 내보내기 | `/api/platform/render` → adapter → 공용 템플릿·Playwright → Core MediaAsset → `/api/media-assets/<id>/file` | Core 보관 성공 이후 표시. 사용자 JPG 다운로드 요청은 별도 안내. 수정 중 렌더 결과 폐기, 현재 카드 재렌더 이미지로 미리보기/첨부. 중간 실패는 카드 번호·재시도 방법 표시, 성공한 Core 자산 유지, 일부 SNS 첨부 없음 |
| Instagram·Threads → 전용 로그인·현재 원고/카드로 작성창 준비 | `/api/platform/sns` → `SnsService` 소유 Node → `sns-adapter.js` → 기존 두 로컬 SNS 서비스 | Core가 암호화 JPG를 읽고 article/snapshot/render_key 출처를 확인해 순서대로 전달. 텍스트·카드 검수 상태 표시. 준비 중 변경되면 이전 작성창일 수 있음을 안내하며 재준비 요구. Core 경로에는 게시 작업 없음 |
| 앱 종료·SNS 창 재연결 | `desktop/runtime.LocalServer.stop`, `core/bootstrap.main finally` → `PlatformManager.close` → Node stdin EOF → 두 SNS 창 종료 | 프로필은 APP_DATA/sns에 보존. 병행 최초 요청·중복 프로필 실행 방지, 소유 프로세스 종료·재실행 자동 검증. 실제 EXE 수명은 미검증 |

### 브라우저와 검수 정책

- SNS 로그인은 화면에서 자동/Chrome/Edge/Chromium을 선택합니다. 자동은 **Chrome → Edge → Chromium**이며 실행 파일 누락일 때만 대체합니다. 프로필 잠금·일반 실행 오류는 다른 브라우저로 우회하지 않습니다. 브라우저를 바꾸려면 전용 창을 먼저 닫습니다. 설치 안내는 실패 메시지와 `.env.example`에 있습니다. 렌더의 별도 fallback을 로그인 지원으로 간주하지 않습니다.
- 저장·내보내기·SNS 준비에 새로운 일괄 검수 차단 정책을 만들지 않았습니다. 팀 Core는 검수 상태와 최종 사람 검토를 표시합니다. 기존 개발용 JPG의 `CardValidation.ensureForExport`와 기존 로컬 SNS의 확인/중복 처리 정책은 유지합니다.
- 원본 기사 변경과 카드 편집 변경을 구분합니다. 다른 기사 또는 다른 snapshot의 원고·이미지는 첨부하지 않습니다. 서로 다른 저장 버전에서 개별 생성해 snapshot이 달라졌다면 ‘선택 항목 생성’으로 원고·카드를 함께 생성합니다. ID를 임의 생성하거나 덮어써 맞추지 않습니다.
- 기존 Blog 생성은 현재 Node 생성기에서 지원하지 않습니다. 생성 선택/실행을 비활성화하고 저장된 Blog 원고 열람·편집은 보존했습니다.

### 2026-10-12 검증과 남은 항목

- 루트 `npm test`: API 경계 및 36개 테스트 통과. `npm test --prefix platform-generator`: 로컬 저장 검사 및 34개 자동 테스트 통과. 새 main의 IPC·암호화 백업·데이터맵 테스트를 모두 보존하고 플랫폼 상태 테스트도 함께 실행합니다.
- `$env:PYTHONIOENCODING='utf-8'; $env:PYTHONPATH='article_editor/.runtime'; python -m unittest discover -s article_editor/dev/tests -p 'test_*.py'`: **396개, OK (기존 skipped=6)**. 실제 Node Core 검수, 사진 저장/복원, 다른 기사·고정본/낡은 렌더 거부, 동일 JPG 중복 보관 시 복수 렌더 출처 유지, SNS 프로세스 종료·재실행·병행 요청, 데스크톱 종료 호출 포함. 경계 모델 파일 부재 안내와 일부 ResourceWarning은 있었으며 테스트 실패는 없었습니다.
- 루트 `npm run build`, `npm run test:ui`: 통과. 팀 UI smoke는 실제 Python Core·암호화 저장소와 모의 AI/사진/생성/SNS 어댑터를 사용합니다. 실제 계정에 게시하지 않습니다. 최신 main의 강제 로그인·회원가입·로그인 유지·설정 검사와 검수/렌더 지연 중 편집, 업로드 편집, 카드 추천 입력, 렌더 실패·재시도, JPG 링크, snapshot 불일치 차단, 두 채널 작성 준비·서비스 종료 검사를 함께 유지합니다. 재시작 뒤 세션이 헤더에 반영되는 전제조건을 기다려 설정 검사를 시작합니다. 검증을 skip하거나 완화하지 않았습니다.
- `node tests/card-news-output.cjs` (platform-generator에서): 16개 화면 검사, JPG 12장, 넘침 차단 4개, 브라우저 오류 0. `node tests/text-position-output.cjs`: 배율 3개·경계·저장·초기화·JPG 검사 통과, 오류 0. 모두 개발용 편집실의 실제 브라우저/JPG 검증입니다.
- JPG 바이트는 기존 MediaAsset의 `object_ref`와 Core `mediaBytes` 계약을 사용하므로 HTTP·IPC에서 같은 경로를 유지합니다. HTTP 주소가 없는 IPC mock에서도 JPG 읽기 회귀 검증을 통과했습니다. 실제 EXE 실행 검증을 대신하지 않습니다.
- 실제 AI: 앞선 OpenAI 개발용 카드 생성·검수 검사에서 4장 생성 성공. 운영 backend 계정·과금 키로 이번 연결 전체를 반복한 결과는 아닙니다.
- 실제 팀 Core + 빌드 UI + Instagram 공식 Chrome 창: 앞선 중단 시점에는 최종 작성 준비가 미완료였으나, 2026-10-12 재개 후 보존된 프로필의 로그인 연결과 JPG 3장·원고 작성 준비에 성공했습니다. 사용자가 계정·1번→2번→3번 카드 순서·문단 줄바꿈이 정상임을 확인했습니다. 게시/공유 버튼은 누르지 않았습니다.
- Threads 실제 계정은 앞선 중단 때 검토 중이어서 보류했으나, 2026-10-12 재개 요청으로 다시 확인했습니다. Chrome의 보존된 프로필에서 로그인 연결 → 실제 Core/빌드 UI의 JPG 3장·원고 작성 준비에 성공했습니다. 사용자가 계정·1번→2번→3번 카드 순서·문단 줄바꿈이 정상임을 확인했습니다. 작성창 종료 후 SNS 서비스를 재실행해도 다시 로그인할 필요 없이 연결됐으며 마지막 검증 창은 닫았습니다. 게시 버튼은 누르지 않았습니다.
- 최신 Windows EXE 재빌드·Node/Playwright 동봉·앱 재실행 및 운영 backend 사진 실연결은 **미검증**입니다. 따라서 팀 앱/EXE 전체 전달 검증 완료 또는 즉시 배포 가능 상태로 보고하지 않습니다.
- 검증용 Instagram·Threads 전용 창은 닫았으며 로그인 프로필은 보존했습니다. 이번에 띄운 QA Core 서버도 정리했습니다. 비밀번호·세션·API 키·생성 JPG·QA 저장소·node_modules·runtime은 커밋에 포함하지 않습니다.

재개 시 HEAD/MERGE_HEAD와 전체 Git 상태가 중단 메모와 같음을 확인했습니다. 추가 소스 diff도 기록된 검증 범위와 일치했습니다. 마지막 실제 빌드의 HTML/JS/CSS 참조가 모두 존재하며 통합 API의 Core mediaBytes/object_ref 코드도 산출물에 포함됐음을 확인했습니다. 이미 통과한 테스트를 반복하거나 검증을 완화하지 않았습니다. 최종 생성물을 다시 stage해 이전 index의 빌드 파일·문서와 작업 트리 사이 차이를 정리합니다.

최종 로컬 통합은 작업 브랜치에서 `25e73af` 병합 결과를 커밋하는 범위입니다. 충돌 파일 0, diff/check 통과, stage 후보의 실제 비밀값 일치 0, 금지 산출물 0, main 대비 KEEP 삭제 0을 확인했습니다. 새 main을 다시 병합하거나 기존 merge를 abort/reset/clean하지 않았습니다. 로컬 코드/자동 검증과 두 SNS의 게시 전 작성 준비는 확인됐으며, 운영 backend·EXE 검증은 별도의 남은 작업입니다. 업로드/PR은 이번 단계에서 실행하지 않습니다.

실제 QA 브라우저를 닫을 때 완료 전의 보관함/데이터맵 읽기 요청에서 ConnectionAbortedError 로그가 발생했습니다. 두 SNS 작성 준비 응답과 사용자의 확인은 정상 완료됐고 페이지 오류는 0이었습니다. 이 로그를 숨기거나 테스트를 완화하지 않았습니다.

실제 SNS 검증은 별도 QA 저장소·공개 가상 원고·Core가 발급한 실제 기사/고정본/자산 ID를 사용했습니다. 팀 인증 화면은 개발용 고정 세션으로 분리했으며 SNS 공식 창에서는 사용자의 실제 로그인 프로필을 사용했습니다. 운영 팀 계정/backend 인증 또는 EXE 성공으로 표시하지 않습니다.

### 최신 main 추가 병합과 충돌 해결

팀 main의 계정별 vault·회원가입/로그인 유지·암호화 브라우저 백업·IPC·데스크/데이터맵/보관함 개편 및 신규 팀 파일을 유지했습니다. Core API 충돌은 팀 회원가입·로그인 유지·설정 경로와 플랫폼 검수·SNS 경로를 함께 포함했습니다. 루트 package.json 충돌은 팀 IPC/백업 테스트와 플랫폼 상태 테스트를 모두 실행하도록 해결했습니다. runtime 자동 병합은 로그인 시 이전 정책과 SNS 종료를 함께 유지합니다.

생성 파일 충돌은 최종 소스를 루트 `npm run build`로 재생성한 뒤 stage했습니다. 출력 경로는 빌드 입력이 아니므로 임시 버전 선택이 필요하지 않았고 생성 파일을 손으로 편집하지 않았습니다. main 대비 삭제는 위에서 검토한 이전 수동 테스트 5개와 n8n workflow 8개, 재빌드로 교체된 프론트 생성 파일뿐입니다. 예상하지 않은 팀 소스 삭제나 KEEP 표시 삭제를 남기지 않았습니다.

충돌 파일은 다음과 같습니다.

- `article_editor/app/core/api.py`, 루트 `package.json`
- `article_editor/app/frontend/index.html`
- frontend/assets의 AppDialog-CQo89VuZ.js, ArchiveView-0vf2sGiM.js, DataMapView-DJaQVTLR.js, DeskView-BW458Zp0.js, FormatConverter-BhxKatG-.js, InterviewStudio-Bp81mRMr.js, LoginDialog-ClJMdy5t.js, ModelsDialog-BtTCpaw3.js
- frontend/assets의 SourceSearch-AAKBMBxl.js, SourceSearch-CvZnT2mV.js, SourceSearch-DKtwVBnO.js, copy-CLdfknXy.js, copy-CMkBtcLS.js, copy-D9KllhiO.js, upload-BXmdt3m0.js, upload-CB3wXGjq.js, upload-nU3OU4-1.js

## 과거 마일스톤 기록

이하의 ‘현재’, ‘남은 것’, M2/M4/M6와 `article_editor/web/src/`는 **당시 기록**입니다. 현재 구현·소스 위치는 위 표가 우선하며, n8n 복구나 현재 완료 여부의 근거로 사용하지 않습니다.

- `origin/feature/platform-generator`는 기존 merge commit `451cbe6`으로 편입됐다. 실제 추가 범위는 `platform-generator/**`의 Express 서버, n8n 워크플로, Playwright 카드 렌더러, 플랫폼 생성·검수와 개발용 브라우저 UI다. critique-organizer는 이번 merge의 추가 범위가 아니다.
- `PLATFORM_LOCAL_STORAGE`는 기본 꺼짐이며 정확히 `1`일 때만 개발용 Documents 초안·메타데이터·이미지 보관을 켠다. 꺼져 있으면 `/api/local/storage`, `/api/local/drafts` 및 하위 경로, `/api/local/images` 및 하위 경로는 JSON 오류와 HTTP 410을 반환한다. 기본 경로에서는 Documents를 조회하지 않고 JPG 보관 후처리도 연결하지 않는다. 초안 저장을 Core로 연결한 것은 아니며, 후속 마일스톤에서 Core의 암호화 SQLite 저장소를 사용한다. 기존 렌더러의 `output/` JPG 출력은 유지한다.
- **M4:** 현재 raw `title/content` 입력을 `snapshot_id`로 바꿔야 한다. 현재 Core에 불변 Snapshot 계약이 구현되지 않아 이번에는 변경하지 않는다.
- **M4(렌더, 2026-10-12 완료):** 앱의 렌더는 `POST /api/platform/render` → 코어 `PlatformManager.render` → `core-adapter.js`의 `render` 작업(`card-renderer.js`가 Playwright로 JPEG 바이트를 만든다). 파일(`output/`)·`http://localhost:...` 주소를 만들지 않고, 코어가 받은 바이트를 암호화 저장소에 `MediaAsset`(generated=true)으로 등록해 `asset.local_uri`(`/api/media-assets/<id>/file`)로 돌려준다. 렌더 브라우저는 Playwright Chromium → 설치된 Edge → Chrome 순으로 연다(EXE 에는 Chromium 이 없으므로 Windows 기본 Edge 사용, `PLATFORM_RENDER_CHANNEL`로 하나만 지정 가능). 단독 서버(`server.js`의 `/render`, `editor-routes.js`의 `/editor/render`)는 개발 전용으로 남아 있고 여전히 `output/`·localhost 를 쓴다 — 앱은 쓰지 않는다. `buildHtml` 은 `card-renderer.js` 로 옮겼고 server.js 는 그것을 불러온다(동작 동일). 남은 것: 화면(FormatConverter)이 `renderCardImage`(src/api/platform.js)를 불러 카드 이미지를 보여 주는 일.
- **M4:** 긴 생성·검수·렌더링 실행은 `ProcessingJob`으로 연결한다. 현재 Core의 공통 작업 저장·조회 계약이 없어 기존 완료 응답을 유지한다.
- **M6:** Express/Playwright 렌더러는 내부 adapter다. Windows EXE에서 프로세스·의존성을 패키징하는 방식은 M6에서 결정한다. HTTP는 임시 통합 전송이며 최종 UI 호출 경계는 `article_editor/web/src/api/`와 Core IPC다.
- 외부 AI·Unsplash 호출과 서버 환경변수 키는 **개발 전용이며 EXE 전에 Core → backend proxy 뒤로 이동해야 한다**. 이번에는 호출 구조를 재설계하지 않는다. 운영 키와 service_role 키를 EXE에 포함하지 않는다.

## App Core 연결 시 외부 AI 호출 (2026-10-07)

App Core(`core/managers/platform_manager.py`)가 `core-adapter.js`를 띄울 때는 `PLATFORM_AI_BRIDGE=core`가 설정되고
OpenAI/Gemini 키는 환경에서 빼서 넘기지 않는다. 이때 `ai-provider.js`는 직접 호출하지 않고 `core-bridge.js`로
`{"type":"ai","id","request"}` 줄을 stdout 에 내보내며, 코어가 기존 AI 경로(`ai.client.openai_call`; `AI_BACKEND=remote`면 백엔드 프록시
`/ai/responses`)로 호출해 `{"type":"ai_result",...}` 줄을 stdin 으로 돌려준다. 모델은 코어의 `OPENAI_TEXT_MODEL`.
통신은 줄 단위 JSON: 첫 줄이 작업 입력이며 코어는 stdin 을 닫지 않는다(가짜 어댑터를 만들 때 첫 줄만 읽을 것).
단독 실행(`node server.js`)에서는 예전처럼 `AI_PROVIDER`·`GEMINI_API_KEY`·`OPENAI_API_KEY`를 쓴다(개발 전용).
