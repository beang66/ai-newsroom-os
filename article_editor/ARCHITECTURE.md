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
│       └─ api/client.js      ★ the ONLY place the UI talks to the core
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
  through `frontend/src/api/client.js`.
- The **core never imports frontend code**. It only serves `frontend/` read-only.
- The stable interface is the HTTP surface:
  `GET /api/status`, `POST /api/assist`, `POST /api/articles/save`,
  `GET /api/unsplash/search`, `GET /api/unsplash/photo/:id[/track]`.
  Internal module layout can change freely; these contracts stay.

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
