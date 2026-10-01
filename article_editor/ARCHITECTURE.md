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

## Sensitive configuration (keys) — target design

Operational API keys must **not** live on end users' machines. The current
modules that hold keys are deliberately isolated so they can be replaced:

- `core/ai/client.py`          — the only place `OPENAI_API_KEY` is read.
- `core/integrations/unsplash.py` — the only place `UNSPLASH_ACCESS_KEY` is read.

Target: these adapters are swapped for a **backend-proxy adapter** that forwards
the request (with the user's auth) to our server, which holds the operational
keys and returns only the result. The frontend and the rest of the core do not
change — they keep calling the same local core API.
