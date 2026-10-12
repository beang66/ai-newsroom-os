# App Core 통합 메모 (M2)

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

## 과거 마일스톤 기록

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
