# Article Workspace — Frontend / Core separation

This folder is split into two layers. The split is enforced by directories and by
a single network boundary.

```
article_editor/                ← 프로젝트 루트 (데이터·설정·문서·도구)
├─ app/                        ★ 실행에 필요한 코드 전부 (이 폴더만 복사해도 실행됨)
│   ├─ launcher.py             실행기 (브라우저 / 창 / 진단 --check / 검증 --smoke)
│   ├─ server.py               옛 진입점 (core.bootstrap.main, 8765 고정 — 비권장)
│   ├─ app_paths.py            실행 위치 해석 (BUNDLE=app/, APP_ROOT=루트)
│   ├─ core/                   ← 브라우저 밖(Python). No UI, no DOM.
│   │   ├─ config.py           env/keys/models/versions/limits (+ FRONTEND path)
│   │   ├─ errors.py           shared RequestError
│   │   ├─ api.py              HTTP handler + routing + static serving
│   │   ├─ storage.py          article repository (local JSON files)
│   │   ├─ ai/                 AI Module Manager (client/local_models/headline/router)
│   │   ├─ integrations/unsplash.py
│   │   └─ bootstrap.py        startup wiring
│   ├─ desktop/                pywebview 셸 (runtime / shell / smoke)
│   └─ frontend/               ← 브라우저·웹뷰에서 실행. UI only.
│       ├─ index.html
│       ├─ assets/             웹컴포넌트(<article-workspace>)·테마·이미지 편집기
│       └─ src/api/            ★ UI가 코어와 대화하는 유일한 지점
│           ├─ index.js        연결 스위치 — HTTP now, IPC at release
│           ├─ core-api.js     계약: routes + named methods (api.assist…)
│           ├─ http.js         HTTP transport (delegates to client.js)
│           ├─ ipc.js          IPC transport (pywebview bridge; not wired yet)
│           └─ client.js       fetch 구현 (error / cancel / blob)
├─ dev/                        ← 개발용 (앱 실행에는 불필요)
│   ├─ tests/                  회귀 테스트 (test_server.py · test_factcheck.py · test_local_models_onnx.py · ui-smoke.mjs · fixtures)
│   ├─ checks/check-api-boundary.mjs
│   └─ spikes/ipc_transport/   일회성 측정 도구 (IPC/무포트 전환)
├─ packaging/                  exe 빌드 (AINewsroom.spec · build_windows.bat · README)
├─ docs/                       DESKTOP_SHELL · IPC_MIGRATION · SECURITY_MODEL · BACKEND_INTEGRATION (+ screenshots/)
├─ temp/                       임시 스크립트 전용 (gitignore, 커밋 금지)
├─ integration/                Supabase 참고자료 (아직 미연결)
└─ start_windows.bat           개발 실행 정문 (더블클릭 → app\launcher.py)
```

## Rules

- **실행 코드는 `app/` 안에만 둔다.** 데이터·설정(`.env`, `.article-workspace/`)·문서·도구는 루트에 둔다.
- The **frontend never imports core code**. It only calls the core over HTTP,
  through `web/src/api/` — `createAppApi()` (see `web/src/api/README.md`).
- UI code must not bypass that boundary: no `fetch(`, no `"/api/…"` literals,
  no `<img src="/api/…">`. Enforced by `npm run check:api-boundary`.
- The **core never imports frontend code**. It only serves `app/frontend/` read-only.
- The stable interface is the HTTP surface:
  `GET /api/status`, `POST /api/assist`, `POST /api/articles/save`,
  `GET /api/unsplash/search`, `GET /api/unsplash/photo/:id[/track]`.
  `GET /api/factcheck/status`, `POST /api/factcheck/run`, `POST /api/semantic/parse`
  (factcheck.status / factcheck.run / semantic.parse — 구현: `app/core/ai/factcheck/`, 의존성: `requirements-factcheck.txt`).
  `POST /api/interview/transcribe` (interview.transcribe — 녹음 → 화자별 대화. 구현: `app/core/ai/transcribe.py`, 외부 호출은 providers 경로 = 백엔드 `/ai/audio/transcriptions`).
  `POST /api/materials/extract` (materials.extract — 자료 파일 PDF·DOCX·HWP·HWPX·TXT → 텍스트. 구현: `app/core/documents.py`, 로컬 처리·외부 호출 없음).
  Internal module layout can change freely; these contracts stay.
- **Local transport is a detail.** Development uses HTTP (works in a browser too);
  the release build switches the same contract to the pywebview IPC bridge by changing
  `web/src/api/index.js` only. Plan and risks: `docs/IPC_MIGRATION.md`.
- 임시 스크립트는 `temp/` 안에만 만들고, 되풀이 쓸 도구는 `dev/`(tests·checks·spikes)로 승격한다.

## Sensitive configuration (keys) — backend-managed (hard rule)

> **운영에 필요한 민감 데이터(API 키 등)는 백엔드 서버에서만 관리한다.**
> 배포된 앱을 아무리 뜯어봐도 운영 키/비밀키를 알아낼 수 없어야 한다.

> 위협 모델·자산·"나가는 경로"·구현 규칙·보안 백로그(P1~P4): **[`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)**

### 앱(배포본)이 가져도 되는 것 / 절대 가져선 안 되는 것
| 가져도 됨 | 절대 금지 |
|---|---|
| 짧은 수명의 **사용자 인증 토큰**(JWT) | 운영용 **API 키**(OpenAI 등) |
| 로컬 AI **모델 파일**(기기에서 직접 실행) | **Supabase service_role / secret key** |
| 사용자의 **로컬 데이터**(본인 PC) | 결제/외부 LLM 서버 비밀키 |

### 데이터 흐름 (외부 모델은 백엔드 프록시 경유)
```
Desktop App (키 없음)
   │  요청 + 사용자 JWT (필요 최소 컨텍스트만)
   ▼
우리 백엔드 서버  ← 운영 키/비밀키는 여기에만 존재
   ▼
External LLM / Unsplash / ...
```
- 앱은 **백엔드 주소 + 사용자 토큰**만 안다. 키가 무엇인지도 모른다.
- 로컬에서 실행 가능한 AI(임베딩·로컬 모델)는 키가 필요 없으므로 **앱 내 실행 허용**.
- 로컬에 저장되는 데이터(기사/사본)는 **Encryption Manager**가 기기에서 암·복호화한다(키는 백엔드가 아님, 사용자/프로젝트 키).

### 코드상 위치 (구현됨)

키를 읽는 곳은 **local 경로 한 곳뿐**이고, 배포 경로(remote)는 키를 아예 읽지 않는다.

```
app/core/ai/client.py          ← 파사드 (openai_call / structured_call / output_text 이름 유지)
        └─ app/core/ai/providers/
              ├─ local.py      외부 API 직접 호출 (OPENAI_API_KEY 필요, 개발 전용)
              └─ backend.py    우리 백엔드 프록시 호출 (JWT만 사용)
app/core/backend_proxy.py      프록시 공통 클라이언트 (AI·Unsplash 공용: 경로·JWT·에러 매핑)
app/core/integrations/unsplash.py   local 이면 UNSPLASH_ACCESS_KEY, remote 면 프록시
```

전환 스위치:
- `AI_BACKEND=local`  → 개발 전용(로컬 `.env` 키). **배포본에 사용 금지**
- `AI_BACKEND=remote` → 배포 기본(`AI_BACKEND_URL` + `APP_TOKEN`/JWT 필요). 로컬 키 없음
- 기본값: 개발 실행 = `local`, **배포 exe = `remote`** (frozen 감지) → 배포본은 키가 없어도 안전하게 동작하고, 없으면 안내 메시지를 낸다

백엔드 경로 규약(백엔드와 합의): `POST {AI_BACKEND_URL}/ai/<openai path>`,
`GET {AI_BACKEND_URL}/unsplash/<unsplash path>`, `GET {AI_BACKEND_URL}/unsplash/absolute?url=`.
응답 모양은 OpenAI/Unsplash와 동일하게 유지한다(코어 파싱 변경 없음).

검증: `dev/tests/test_server.py::BackendProxyTests` — 스텁 백엔드로 라우팅·JWT 헤더·503 안내를 확인한다.

## Cloud (Supabase) — Control Plane & 공유/협업 계층

클라우드는 전체 데이터의 **메인 저장소가 아니라 Control Plane + 공유 계층**이다.
기사 본문·전체 취재자료의 **평문은 클라우드에 두지 않는다**(공유용 암호화본만).

### 클라우드가 받아 저장하는 것 (인증정보 + 메타데이터)
- **Auth**: 사용자 계정 · 로그인 · 세션 관리
- **Postgres (메타데이터)**: `users`, `teams`, `team_members`, `projects`,
  `project_members`, `project_keys`, `devices`, `model_versions`, `collab_sessions`
- **Storage**: 공유가 필요한 파일만(암호화된 공유 프로젝트 / 첨부)
- **Realtime**: 협업용(접속자·커서·선택·노드 상태) — 영구 저장 불필요한 일시 상태

### 접근 경계
| 경로 | 대상 | 조건 |
|---|---|---|
| 앱 → Supabase **직접** | 일반 사용자 범위(프로젝트 목록·메타·공유) | 사용자 **JWT** + 엄격한 **RLS** + DB constraint |
| 앱 → **우리 백엔드** | service_role 작업 · 외부 LLM · 결제 · webhook · 운영키 | 서버가 비밀키 보유 |

구현 위치(2026-10-02): `app/core/managers/session_manager.py`(로그인·갱신·로그아웃),
`app/core/integrations/supabase.py`(Auth·PostgREST), `app/core/auth.py`(토큰 보관 — 프론트에는 상태만),
`app/core/backend_proxy.py`(백엔드 호출, 로그인 JWT 우선). 진단: `python dev/checks/backend_check.py`

### 키 구분 (중요)
- Supabase **anon / publishable key** → **앱에 포함 가능**(공개 전제, RLS로 보호)
- Supabase **service_role / secret key** → **앱 금지**(백엔드 서버에만)

### 향후 협업 업로드 공간
공유 프로젝트는 `Encryption Manager`로 암호화 → `Sync Manager` → Supabase Storage/Postgres.
수신자는 자신의 키로 복호화(서버는 평문 보유 불가).

### 코드 위치(예정)
- `app/core/integrations/supabase.py`          — Auth / Postgres / Storage / Realtime 클라이언트
- `app/core/managers/sync_manager.py`          — 로컬 ↔ 공유 상태 동기화
- `app/core/managers/collaboration_manager.py` — Realtime 협업
