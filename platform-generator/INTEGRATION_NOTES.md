# 플랫폼 로컬 통합 및 검증 기록

## 현재 로컬 통합 기준 — 2026-10-12

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

- 루트 `npm test`: API 경계 및 21개 테스트 통과. `npm test --prefix platform-generator`: 로컬 저장 검사 및 34개 자동 테스트 통과.
- `$env:PYTHONPATH='article_editor/.runtime'; python -m unittest discover -s article_editor/dev/tests -p test_platform_connections.py`: 9개 통과. 실제 Node Core 검수, 사진 저장/복원, 다른 기사·고정본/낡은 렌더 거부, SNS 프로세스 종료·재실행·병행 요청, 데스크톱 종료 호출 포함.
- 팀 UI smoke는 실제 Python Core·암호화 저장소와 모의 AI/사진/생성/SNS 어댑터를 사용합니다. 실제 계정에 게시하지 않습니다. 검수/렌더 지연 중 편집, 업로드 편집, 카드 추천 입력, 렌더 실패·재시도, JPG 링크, snapshot 불일치 차단, 두 채널 작성 준비를 구분해 검사합니다.
- 실제 AI: 앞선 OpenAI 개발용 카드 생성·검수 검사에서 4장 생성 성공. 운영 backend 계정·과금 키로 이번 연결 전체를 반복한 결과는 아닙니다.
- 실제 팀 Core + 빌드 UI + 로그인 창: UI 로딩 오류 수정 확인. Instagram 로그인은 한 차례 연결 확인됐지만 창 종료 후 최종 이미지 순서·줄바꿈·계정/작성 준비 검증은 **미완료**입니다. 추가 상태 확인 명령이 승인되지 않아 계속 진행하지 않았습니다. 게시 버튼을 누르지 않았습니다.
- Threads 실제 계정은 로그인 자체가 검토 중이므로 사용자 지시에 따라 보류했습니다. 모의 작성 준비/자동 검증과 실제 계정 검증을 혼동하지 않습니다.
- 최신 Windows EXE 재빌드·Node/Playwright 동봉·앱 재실행 및 운영 backend 사진 실연결은 **미검증**입니다. 따라서 팀 앱/EXE 전체 전달 검증 완료 또는 즉시 배포 가능 상태로 보고하지 않습니다.

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
