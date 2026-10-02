# Article Workspace — Frontend / Core separation

This folder is split into two layers. The split is enforced by directories and by
a single network boundary.

```
article_editor/
├─ frontend/                  ← runs in the browser. UI only.
│   ├─ index.html
│   ├─ assets/                UI bundle (<article-workspace> web component, styles, image editor)
│   │   ├─ article-workspace.js   entry web component (Shadow DOM)
│   │   ├─ image-editor.js
│   │   ├─ theme.css / donga-preview.css / donga-fonts.css
│   └─ src/
│       └─ api/                ★ the ONLY place the UI talks to the core
│           ├─ index.js        connection switch — HTTP now, IPC at release
│           ├─ core-api.js     contract: routes + named methods (api.assist…)
│           ├─ http.js         HTTP transport (delegates to client.js)
│           ├─ ipc.js          IPC transport (pywebview bridge; not wired yet)
│           └─ client.js       fetch implementation (error / cancel / blob)
├─ core/                      ← runs outside the browser (local runtime). No UI, no DOM.
│   ├─ config.py              env/keys/models/versions/limits (+ FRONTEND path)
│   ├─ errors.py              shared RequestError
│   ├─ api.py                 HTTP handler + routing + static serving
│   ├─ storage.py             article repository (local JSON files)
│   ├─ ai/                    AI Module Manager
│   │   ├─ client.py              external LLM adapter (OpenAI Responses API)
│   │   ├─ local_models.py        local models (KeT5 headline / KoBART subtitle)
│   │   ├─ headline.py            headline/subtitle task
│   │   └─ router.py              kind → task dispatch
│   ├─ integrations/unsplash.py   Unsplash adapter
│   └─ bootstrap.py           startup wiring
└─ server.py                  thin entry point (launcher target → core.bootstrap.main)
```

## Rules

- The **frontend never imports core code**. It only calls the core over HTTP,
  through `frontend/src/api/` — `createAppApi()` (see `frontend/src/api/README.md`).
- UI code must not bypass that boundary: no `fetch(`, no `"/api/…"` literals,
  no `<img src="/api/…">`. Enforced by `npm run check:api-boundary`.
- The **core never imports frontend code**. It only serves `frontend/` read-only.
- The stable interface is the HTTP surface:
  `GET /api/status`, `POST /api/assist`, `POST /api/articles/save`,
  `GET /api/unsplash/search`, `GET /api/unsplash/photo/:id[/track]`.
  Internal module layout can change freely; these contracts stay.
- **Local transport is a detail.** Development uses HTTP (works in a browser too);
  the release build switches the same contract to the pywebview IPC bridge by changing
  `frontend/src/api/index.js` only. Plan and risks: `docs/IPC_MIGRATION.md`.

## Sensitive configuration (keys) — backend-managed (hard rule)

> **운영에 필요한 민감 데이터(API 키 등)는 백엔드 서버에서만 관리한다.**
> 배포된 앱을 아무리 뜯어봐도 운영 키/비밀키를 알아낼 수 없어야 한다.

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

### 코드상 위치 (교체 지점)
현재 키를 읽는 곳을 **딱 두 곳으로 격리**해 두었고, 이 두 곳이 **백엔드 프록시 어댑터**로 교체된다:
- `core/ai/client.py`            — 현재 `OPENAI_API_KEY` 읽음
- `core/integrations/unsplash.py` — 현재 `UNSPLASH_ACCESS_KEY` 읽음

목표 구조:
```
core/ai/providers/
  ├─ local.py     (기기 실행, 키 불필요)
  └─ backend.py   (우리 백엔드 프록시 호출; JWT만 사용)
```
전환 스위치(개발 편의):
- `AI_BACKEND=local`  → 개발 전용(로컬 `.env` 키, gitignore). **배포본에 사용 금지**
- `AI_BACKEND=remote` → 배포 기본. 로컬 키 없음, 백엔드 프록시만 사용.

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

### 키 구분 (중요)
- Supabase **anon / publishable key** → **앱에 포함 가능**(공개 전제, RLS로 보호)
- Supabase **service_role / secret key** → **앱 금지**(백엔드 서버에만)

### 향후 협업 업로드 공간
공유 프로젝트는 `Encryption Manager`로 암호화 → `Sync Manager` → Supabase Storage/Postgres.
수신자는 자신의 키로 복호화(서버는 평문 보유 불가).

### 코드 위치(예정)
- `core/integrations/supabase.py`          — Auth / Postgres / Storage / Realtime 클라이언트
- `core/managers/sync_manager.py`          — 로컬 ↔ 공유 상태 동기화
- `core/managers/collaboration_manager.py` — Realtime 협업
