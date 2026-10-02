# ADR: 데스크톱 셸 선택 — pywebview

- 상태: **채택(Adopted)** · 2026-10-02 · 스파이크 실기 검증 완료
- 관련 문서: `../../APP_CORE_ARCHITECTURE.md` §3(Frontend), `../ARCHITECTURE.md`(frontend/core 경계), `../desktop/README.md`

## 1. 맥락

| 항목 | 사실 |
|---|---|
| App Core | Python 전용 — `core/bootstrap.py`가 표준 라이브러리 `ThreadingHTTPServer`로 127.0.0.1 서빙 |
| Frontend | JS/Web Component 1,838줄 + `frontend/src/api/client.js`(단 38줄)가 **유일한 HTTP 경계** |
| 로컬 AI | `torch>=2.2`, `transformers`, KoBART/KeT5 → 모델 파일 수 GB |
| 요구 | "Desktop Shell은 React를 유지할 수 있는 구조"(설계문서 §3), **Windows/macOS**, 로컬 우선, 앱에 운영키 금지 |

핵심 제약: App Core가 Python이므로 **배포 시 Python은 어차피 동봉**해야 한다. 따라서 셸 선택의 실제 기준은 "런타임을 몇 개 더 얹는가"와 "업데이트를 어떻게 배포하는가"다.

## 2. 후보

| 기준 | **pywebview** | Tauri | Electron | 무셸(브라우저) |
|---|---|---|---|---|
| 엔진 | WebView2(Windows 내장)/WKWebView | 동일 | Chromium 동봉 | 사용자 브라우저 |
| 추가 런타임 | **없음(셸=Python)** | Rust 툴체인 | Node + Chromium | 없음 |
| 배포 스택 수 | **1(PyInstaller)** | 2(Rust+사이드카) | 2(Node+PyInstaller) | 0 |
| 자동 업데이트/트레이 | 약함(직접 구현) | 우수 | 최강(턴키) | ❌ |
| 보안 표면 | 좁음 | 가장 엄격 | 넓음(Node 권한) | 좁음 |
| 기존 코드 변경량 | **거의 0** | 중간 | 거의 0 | — |
| 유지 부담(1인 통합) | 낮음 | 높음(Rust) | 중간 | 최저 |

## 3. 결정

**pywebview** 를 채택한다.

근거:
1. 셸이 Python이면 **동봉 런타임이 하나**로 끝난다(패키징 파이프라인 1개).
2. `launcher.py`에 창 모드 한 갈래만 추가하면 되고, **프론트·코어·HTTP 계약 변경이 0**이다.
3. `client.js` 주석이 예고한 "IPC bridge 교체"를 `window.pywebview.api`로 그대로 실현할 수 있다(포트/Origin 제약 제거).
4. 설계문서의 Thin / Local-first / Minimal exposure 원칙과 일치한다.

## 4. 실기 검증 결과 (2026-10-02, Windows)

- 엔진: WebView2 `154.0.4258.48`, UA `Chrome/154.0.0.0 Edg/154.0.0.0` → **Chromium 계열** 확인
- `python desktop/smoke.py --mode write` → **7/7 PASS**
- `python desktop/smoke.py --mode read` → **7/7 PASS**
  - 1회차에서 쓴 표식 `2026-10-02T02:12:29.733Z` 를 **별도 프로세스인 2회차**에서 읽어냄 = **IndexedDB 영속 확인**
  - 프로필 폴더 `.article-workspace/webview/EBWebView` 실제 생성 확인
- 프론트 API 감사: 사용 중인 API 중 Chromium 전용 0건
  (IndexedDB, clipboard(+폴백), `window.print()`, HTML5 DnD, Blob/`<a download>`, FileReader, ResizeObserver)
- 회귀: `python launcher.py --check` → `STARTUP CHECK PASSED` (기존 브라우저 모드 그대로)
- 헤드리스 진단: `python launcher.py --window --check` → `pywebview=True, webview2=154.0.4258.48`

## 5. 채택 시 반드시 지킬 규칙

> **`webview.start(private_mode=False, storage_path=...)` 를 반드시 넘긴다.**
> 기본값 `private_mode=True` 는 저장소를 휘발성으로 만들어, 프론트의 IndexedDB
> 자동 임시저장이 재시작 때 사라진다. `desktop/shell.py:storage_dir()` 가 이 값을 관리한다.

## 6. 미해결 / 후속 과제

1. **내보내기(`<a download>`) 저장 대화상자** — 웹뷰는 다운로드를 호스트에 위임한다. 실기 확인 후, 안 되면 `POST /api/export` → Python이 파일을 쓰는 경로로 옮긴다(설계문서 Storage Manager 원칙과 일치).
2. **실제 OS 파일 드래그&드롭** — 합성 이벤트 전달은 확인했지만 OS→웹뷰 경로는 실기 확인 필요.
3. **인쇄** — `window.print()`(미리보기 iframe) 동작 확인.
4. **macOS 실기** — WKWebView는 별도 엔진. 필요 시 번들러 타깃 baseline을 낮춘다.
5. **패키징/업데이트** — PyInstaller 동봉, 모델은 별도 다운로드 팩, 앱 업데이트 방식은 미정(Update Manager와 함께 결정).
6. **트레이/단일 인스턴스/알림** — 현재 없음. 필요해지면 브리지로 추가하거나 Electron 재검토.

## 7. 되돌리기 / 영향 범위

- 기본 실행은 **브라우저 모드 그대로**다(`python launcher.py`). 창 모드는 `--window` 를 준 경우에만 동작한다.
- 셸 제거 시 `desktop/` 삭제 + `launcher.py`의 `--window` 갈래 제거로 끝난다(프론트/코어 무변경).
- `start_windows.bat` 은 인자를 그대로 전달하도록 `%*` 만 추가했다(기존 동작 동일).

## 8. 재검토 조건

- 자동 업데이트·트레이·단일 인스턴스가 **필수 요구**가 되고 직접 구현 비용이 과도해질 때 → Electron 재검토.
- 설치 용량·권한 모델이 최우선이 되고 Rust 유지보수를 감수할 수 있을 때 → Tauri 재검토.
