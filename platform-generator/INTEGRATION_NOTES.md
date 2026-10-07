# App Core 통합 메모 (M2)

- `origin/feature/platform-generator`는 기존 merge commit `451cbe6`으로 편입됐다. 실제 추가 범위는 `platform-generator/**`의 Express 서버, n8n 워크플로, Playwright 카드 렌더러, 플랫폼 생성·검수와 개발용 브라우저 UI다. critique-organizer는 이번 merge의 추가 범위가 아니다.
- `PLATFORM_LOCAL_STORAGE`는 기본 꺼짐이며 정확히 `1`일 때만 개발용 Documents 초안·메타데이터·이미지 보관을 켠다. 꺼져 있으면 `/api/local/storage`, `/api/local/drafts` 및 하위 경로, `/api/local/images` 및 하위 경로는 JSON 오류와 HTTP 410을 반환한다. 기본 경로에서는 Documents를 조회하지 않고 JPG 보관 후처리도 연결하지 않는다. 초안 저장을 Core로 연결한 것은 아니며, 후속 마일스톤에서 Core의 암호화 SQLite 저장소를 사용한다. 기존 렌더러의 `output/` JPG 출력은 유지한다.
- **M4:** 현재 raw `title/content` 입력을 `snapshot_id`로 바꿔야 한다. 현재 Core에 불변 Snapshot 계약이 구현되지 않아 이번에는 변경하지 않는다.
- **M4:** 렌더 결과의 `http://localhost:...` 이미지 URL과 `card_id`를 제품 식별자로 사용하지 않고 Core에 `MediaAsset`으로 등록해 `media_asset_id`를 반환해야 한다. 공통 MediaAsset 계약이 필요하다.
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
