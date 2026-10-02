# 코어 호출 경계 통일 — IPC 전환 준비

- 상태: **적용(2026-10-02)** · 결정: **개발 단계는 HTTP, 출시는 IPC**, 연결 지점은 지금부터 하나로 통일
- 관련: `../frontend/src/api/README.md`, `DESKTOP_SHELL.md`, `../ARCHITECTURE.md`(frontend/core 경계)

## 1. 결정

| 항목 | 내용 |
|---|---|
| 지금(개발) | HTTP. `python launcher.py`(브라우저)와 창 모드 모두 동작 → 브라우저 개발 편의 유지 |
| 출시(IPC) | pywebview 브리지. **포트 점유 없음** |
| 전환 지점 | `frontend/src/api/index.js` 의 `createAppApi({ mode })` **한 곳** |
| 절대 규칙 | UI는 `frontend/src/api/` 밖에서 코어와 직접 대화하지 않는다 (`npm run check:api-boundary`) |

```
UI ──(api.이름(...))──▶ index.js ──▶ http.js ─▶ client.js ─▶ core/api.py
                              └─────▶ ipc.js  ─▶ pywebview 브리지 ─▶ core/api.py
```

## 2. 지금까지 정리한 것

- 코어 호출 7곳(웹컴포넌트) → `core-api.js` 계약 6개 메서드로 흡수. 컴포넌트에 `/api/` 문자열 0건.
- `client.js`(전송 구현)는 **유일**하게 유지. IPC 추가 시에도 HTTP 구현을 복사하지 않는다.
- 위반 검사 스크립트: `scripts/check-api-boundary.mjs` (fetch/XHR/EventSource/WebSocket/`"/api/"` 스캔, `npm test` 에 포함).
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
| 11 | **셸 준비 확인 마커** | `desktop/runtime.py:wait_ready()`가 응답에 `<article-workspace` 문자열이 있는지로 "우리 서버가 맞는지"를 판별한다 | UI 엔트리를 React 등으로 교체하면 **마커도 함께 갱신**한다(또는 `/api/status` 계약 기반 확인으로 대체). 안 바꾸면 실행이 "시작 화면 확인 실패"로 죽는다 |

## 4. 스파이크 순서 (출시 준비)

1. `create_window(html=/file://)` 로드 시 ① IndexedDB 가용 ② `pywebview.api` 왕복(15MB base64) ③ `window.print()` ④ 상대 모듈 로딩
2. JS API 호출이 UI를 막지 않는지 (3번 항목과 함께 100초짜리 더미 호출로 확인)
3. 1~2 결과로 (a) IndexedDB 유지 / (b) 저장소 이전 중 택일 → 이전이면 `core-api.saveDraft` 계약 추가
4. `ipc.js` 실제 구현 + `mode:"ipc"` 전환 → 창 스모크 7항목을 계약 기준으로 확장
