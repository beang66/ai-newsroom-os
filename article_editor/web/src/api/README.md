# web/src/api/ — 코어 연결 지점 (한 곳)

UI가 코어(App Core)와 대화하는 방법은 **여기 하나뿐**입니다.

```
UI (assets/*.js, react/*.tsx)
        │  이름 붙은 메서드만 호출:  api.assist(...), api.searchPhotos(...)
        ▼
index.js        ← 연결 지점(스위치). HTTP ↔ IPC 를 여기서만 고른다
        │
        ├─ http.js → client.js   (지금: 개발 단계, fetch)
        └─ ipc.js                (출시: pywebview 브리지, 포트 없음)
        ▼
core-api.js     ← 계약: 라우트와 인자 모양 (UI가 아는 코어의 전부)
        ▼
        코어 (app/core/api.py)
```

| 파일 | 역할 | 고칠 수 있나 |
|---|---|---|
| `core-api.js` | **계약** — 라우트 6개와 이름 붙은 메서드. UI는 이 인터페이스만 안다 | 코어 계약이 바뀔 때만 |
| `http.js` | HTTP 전송 어댑터 (client.js 위임) | 전송 방식이 바뀔 때 |
| `ipc.js` | IPC 전송 (출시용, 현재 미사용) | 출시 전환 시 |
| `client.js` | **전송 구현** — fetch/에러/취소/blob | 거의 안 고침 |
| `index.js` | **연결 지점** — `createAppApi()` | 전환 시 1줄 |

## 규칙 (팀 공통)

1. 코어 호출은 `createAppApi()`가 돌려준 객체의 **이름 붙은 메서드**로만 한다.
2. `fetch(`, `XMLHttpRequest`, `"/api/..."` 경로 문자열을 UI 코드에서 쓰지 않는다.
   - 검사: `npm run check:api-boundary` (위반 시 실패)
   - 부득이한 예외는 그 줄 끝에 `// api-boundary-allow` 주석을 남긴다.
3. 코어 주소(`base`)는 **여기서만** 정한다. 컴포넌트는 `api-base` 속성으로 넘기기만 한다.
4. 새 기능이 필요하면: `core-api.js`에 메서드를 **먼저** 추가하고(코어 라우트와 1:1), UI에서 사용한다.
5. **`<img src="/api/...">` 같은 참조는 금지.** 이미지가 필요하면 `photoBytes()`로 받아 Blob URL을 만든다
   (IPC 전환 시 경로 참조는 동작하지 않는다).

## IPC 전환 (출시 시)

```js
// index.js — 이 한 곳
return createAppApi({ mode: "ipc" });   // 또는 { mode: "auto" }
```
그때 해야 할 일은 `ipc.js`가 요구하는 브리지를 파이썬 쪽에 노출하는 것뿐입니다
(`bridge.core(path, payload)`, `bridge.coreBytes(path)` → `app/core/api.py` 라우팅 재사용).
UI·계약·컴포넌트는 손대지 않습니다. 자세한 위험 목록은 `docs/IPC_MIGRATION.md`.
