# 코어 호출 경계 통일 — IPC 전환 준비

- 상태: **적용(2026-10-02)** · 결정: **개발 단계는 HTTP, 출시는 IPC**, 연결 지점은 지금부터 하나로 통일
- 관련: `../web/src/api/README.md`, `DESKTOP_SHELL.md`, `../ARCHITECTURE.md`(frontend/core 경계)

## 1. 결정

| 항목 | 내용 |
|---|---|
| 지금(개발) | HTTP. `python app/launcher.py`(브라우저)와 창 모드 모두 동작 → 브라우저 개발 편의 유지 |
| 출시(IPC) | pywebview 브리지. **포트 점유 없음** |
| 전환 지점 | `web/src/api/index.js` 의 `createAppApi({ mode })` **한 곳** |
| 절대 규칙 | UI는 `web/src/api/` 밖에서 코어와 직접 대화하지 않는다 (`npm run check:api-boundary`) |

```
UI ──(api.이름(...))──▶ index.js ──▶ http.js ─▶ client.js ─▶ app/core/api.py
                              └─────▶ ipc.js  ─▶ pywebview 브리지 ─▶ app/core/api.py
```

## 2. 지금까지 정리한 것

- 코어 호출 7곳(웹컴포넌트) → `core-api.js` 계약 6개 메서드로 흡수. 컴포넌트에 `/api/` 문자열 0건.
- `client.js`(전송 구현)는 **유일**하게 유지. IPC 추가 시에도 HTTP 구현을 복사하지 않는다.
- 실행 코드는 `app/` 아래로 격리(`app/core`, `app/desktop`, `app/frontend`), 개발 도구는 `dev/`.
- 위반 검사 스크립트: `dev/checks/check-api-boundary.mjs` (fetch/XHR/EventSource/WebSocket/`"/api/"` 스캔, `npm test` 에 포함).
- 사진은 경로 참조(`<img src="/api/...">`) 금지 → `photoBytes()`로 Blob. HTTP에서도 이미 그렇게 되어 있고, IPC에서도 그대로 통한다.

## 3. IPC로 바꾸면 문제될 수 있는 지점 (미리 정리)

| # | 위험 | 왜 | 대응(미리 할 일 / 전환 시 할 일) |
|---|---|---|---|
| 1 | **임시저장(IndexedDB)의 origin** | 저장소가 `http_127.0.0.1_<포트>` 단위. 무포트(파일/불투명 origin)에서는 IndexedDB가 제한될 수 있고, origin이 바뀌면 원고가 "사라져" 보인다 | 실측 스파이크 1순위. 안 되면 초안 저장을 코어 Storage Manager(SQLite)로 이전 — `api.saveDraft()` 계약을 **미리** 만들어 두면 UI 변경 없이 이동 가능 |
| 2 | **사진/본문 대용량 전송** | 브리지는 base64 문자열 → 메모리 +33%, 15MB 원본 ≈ 20MB 문자열 | `photoBytes`는 이미 Blob 경계. 전환 시 base64→Blob 변환 위치만 `ipc.js`. 필요하면 임시 파일 경로 방식으로 대체 |
| 3 | **취소(AbortSignal)** | 브리지 호출은 중간 취소 불가 | UI는 이미 `signal`을 넘김 → IPC에서는 "결과 무시"로 처리(계약 유지, 동작만 완화) |
| 4 | **긴 작업이 UI를 막는지** | AI 호출은 최대 210초 | pywebview가 JS API 호출을 별도 스레드에서 처리하는지 **스파이크로 확인**. 막히면 진행률/폴링 구조로 조정 |
| 5 | **브라우저 개발 모드 상실** | IPC는 창 안에서만 동작 | `mode:"auto"` 유지 → 브라우저에서는 자동으로 HTTP, 창에서는 IPC |
| 6 | **팀 백엔드로의 이전 통로** | `api-base`로 원격 백엔드에 붙이던 이음매가 좁아짐 | `core-api.js` 계약을 백엔드 계약(`docs/BACKEND_INTEGRATION.md`)과 1:1로 유지해 두면 HTTP 전송으로 원격 base 를 쓰는 길은 계속 열려 있다 |
| 7 | **외부 도구 호출(자동화/MCP)** | 로컬 HTTP API가 사라짐 | 필요해지면 `server.py`(HTTP)를 **옵션으로 유지**하고 IPC는 창 전용으로 둔다(둘 다 같은 코어) |
| 8 | **인쇄/다운로드/드래그** | 브라우저 기능 | 영향 없음(클라이언트 기능). `window.print()`, Blob 다운로드는 그대로 |
| 9 | **보안 표면** | IPC는 창 내부만 호출 가능(개선) | 대신 웹뷰에 원격 콘텐츠를 로드하지 않는다(브리지 노출 방지). 개발자 도구는 `--debug`로만 |
| 10 | **진단/로그** | 포트·HTTP 로그가 사라짐 | `--check`/`--smoke`는 계약 메서드 기준으로 유지. `app.log` 그대로 |
| 11 | **셸 준비 확인 마커** | `app/desktop/runtime.py:wait_ready()`가 응답에 `<article-workspace` 문자열이 있는지로 "우리 서버가 맞는지"를 판별한다 | UI 엔트리를 React 등으로 교체하면 **마커도 함께 갱신**한다(또는 `/api/status` 계약 기반 확인으로 대체). 안 바꾸면 실행이 "시작 화면 확인 실패"로 죽는다 |

## 4. 스파이크 실행 (`dev/spikes/ipc_transport/spike.py`)

```
python dev/spikes/ipc_transport/spike.py --mode http|file|html|bridge
```

## 5. 측정 결과 (2026-10-02, Windows · WebView2 154.0.4258.48 · pywebview 6.2.1)

| 로드 방식 | UI 모듈 로딩 | IndexedDB | 로컬 코어(HTTP) | 외부 백엔드 |
|---|---|---|---|---|
| `http://127.0.0.1:<포트>` (지금) | ✓ | ✓ (origin = 포트) | ✓ 200 | ✓ 200 (프리플라이트 + `Authorization` 통과) |
| `file://` (로컬 파일 직접) | **✓** | **✓** (origin = `file://`) | ✗ `Failed to fetch` (Origin 검사 403) | ✓ 200 (백엔드가 `file://` 허용 시) |
| `html=` (HTML 문자열) | ✗ 엘리먼트 미승격 | **✗ denied** ("access to the Indexed Database API is denied") | ✗ | ✓ 200 (`Origin: null`) |

브리지(`--mode bridge`)

| 항목 | 결과 | 판정 |
|---|---|---|
| 작은 왕복(`ping`) | **9 ms** | HTTP와 사실상 동일 |
| 15MB 상행(JS→Python) | **381 ms** | 충분 |
| 15MB 하행(Python→JS, base64 20MB) | **2,010 ms** | 사진 1장 가져올 때 2초 — 수용 |
| 5초짜리 Python 호출 중 UI 타이머 | **314 ticks / 5.17s (정상 ≈312)** | **UI·렌더링 멈춤 없음** (pywebview가 별도 스레드에서 처리) |

`window.pywebview` 는 **`js_api` 없이도 생성된다**(실측) → 브리지 존재 판단은 메서드로 해야 한다.
(`index.js` 는 `typeof api.core === "function"` 으로 수정함)

## 6. 결정 (측정 기반)

| 항목 | 결정 | 근거 |
|---|---|---|
| 출시(IPC) 로드 방식 | **`file://` + IPC 브리지** | 모듈 로딩 ✓, IndexedDB ✓, 포트 불필요 |
| `html=` 모드 | **폐기** | 모듈 해석 불가 + IndexedDB 차단 |
| **초안(IndexedDB) 이전** | **불필요(보류)** | `file://` origin에서 그대로 동작. 게다가 origin에 포트가 없어 **"포트가 바뀌면 원고가 안 보이는" 문제가 원천 제거**됨 |
| 대용량 사진 | 현행 유지(`photoBytes` → Blob) | 15MB 2초. 필요 시 파일 경로 방식으로 대체 |
| 긴 AI 호출 | 현행 유지(단일 호출) | UI 멈춤 없음(실측) |
| 취소(AbortSignal) | IPC에서는 "결과 무시"로 완화 | 브리지 호출은 중단 불가 |
| 개발 모드 | HTTP 유지(`mode:"http"`), 브라우저에서도 동작 | 개발 편의 + 스파이크/자동화 재사용 |
| 외부 백엔드 연결 | **코어가 프록시**(권장) — 프론트는 계약만 호출 | CORS 불필요, 토큰/키를 코어가 보관(`ARCHITECTURE.md` 원칙). 프론트 직접 호출도 가능하지만 백엔드가 `file://`/`null` Origin을 **명시 허용**해야 함 |
| macOS | 미검증(별도 스파이크) | WKWebView는 `file://`에서 로컬 파일 접근/IndexedDB 정책이 다를 수 있음 |

## 7. 남은 전환 작업

1. 파이썬 브리지 노출: `bridge.core(path, payload)` / `bridge.coreBytes(path)` — `app/core/api.py` 라우팅 재사용
2. `ipc.js` 실제 구현 검증(현 스텁 그대로 동작 예상) → `createAppApi({ mode: "ipc" })`
3. 셸: 창을 `file://`(app/frontend/index.html)로 열고 `js_api=CoreBridge()` 전달. `wait_ready` 마커는 `file://` 로드에서는 HTTP 확인이 불가하므로 계약 기반 확인으로 교체
4. 외부 백엔드 프록시 계약 추가(`ARCHITECTURE.md`의 백엔드 프록시 교체 지점)
5. 창 스모크 7항목을 IPC 기준으로 확장 + macOS 스파이크
