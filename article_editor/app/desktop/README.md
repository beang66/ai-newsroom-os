# desktop/ — 데스크톱 셸 (pywebview)

기사 작업실을 **브라우저 대신 네이티브 창**으로 띄우는 얇은 셸입니다.
`APP_CORE_ARCHITECTURE.md` §3의 "Desktop Shell은 React를 유지할 수 있는 구조"를
따르며, **React/JS 프론트는 한 줄도 바뀌지 않습니다.**

```
app/desktop/
├─ runtime.py  코어 서버 런타임(빈 포트 선택 · 스레드 서빙 · 준비 확인)
├─ shell.py    창 생성 + WebView2 사용자 데이터 폴더(IndexedDB 영속)
├─ smoke.py    창을 실제로 띄우는 자동 검증 하네스
└─ README.md
```

## 실행

```
pip install pywebview
python app/launcher.py --window     # Windows: start_windows.bat --window
python app/desktop/shell.py         # 같은 동작(단독 실행)
python app/launcher.py              # 기존 브라우저 모드(기본값, 변경 없음)
```

- 코어 서버는 **같은 프로세스의 스레드**에서 돕니다(`app/desktop/runtime.py`). 예전처럼 `app/server.py`를
  별도 프로세스로 띄우지 않는 이유는, 배포 exe에서 `sys.executable`이 자기 자신이라 재실행 루프가
  되기 때문입니다. 창을 닫으면 서버도 함께 끝납니다.
- 창의 임시 저장(IndexedDB)은 `<앱 폴더>/.article-workspace/webview`에 남습니다(포터블).
- `python app/launcher.py --window --check` — **창을 띄우지 않고** pywebview/WebView2/저장 경로만 진단합니다.
- 배포 exe 도 같은 CLI를 씁니다: `AINewsroom-debug.exe --check`, `AINewsroom-debug.exe --smoke write`.
- `DESKTOP_STORAGE_DIR` 환경변수로 사용자 데이터 폴더를 바꿀 수 있습니다(기본 `article_editor/.article-workspace/webview`).

## 자동 검증

```
python app/desktop/smoke.py --mode write   # 표식을 IndexedDB 에 기록
python app/desktop/smoke.py --mode read    # 재시작 후에도 남아 있는지 확인
```

결과는 `article_editor/.article-workspace/desktop-shell-smoke.json`에 남습니다.

| 항목 | 확인 방법 |
|---|---|
| 창 부팅 | 커스텀 엘리먼트 승격 + Shadow DOM 렌더 |
| 코어 연결 | 창 안에서 `GET /api/status` |
| IndexedDB 영속 | write 실행 → **프로세스를 완전히 종료** → read 실행 |
| 클립보드 | `navigator.clipboard.writeText` 존재 |
| DataTransfer + File | 합성 drop 이벤트가 DOM 리스너까지 전달되는지 |

## 사람이 직접 확인해야 하는 항목

자동화로는 증명할 수 없어 실행 후 눈으로 확인해야 합니다.

1. **실제 OS 파일 드래그&드롭** — 탐색기에서 사진 파일을 창에 끌어 넣기(합성 이벤트는 전달됨을 확인했지만 OS→웹뷰 경로는 실기 확인 필요).
2. **내보내기 저장 대화상자** — `<a download>` 는 웹뷰가 호스트에 위임합니다. 대화상자가 뜨지 않으면 내보내기를 `POST /api/export` → Python이 파일을 쓰는 경로로 옮기는 것을 권장합니다(설계문서 "Storage Manager가 파일 경로를 다룬다" 원칙과 일치).
3. **인쇄 대화상자** — `window.print()`(미리보기 iframe) 동작.
4. **macOS 실기** — WKWebView는 WebView2와 다른 엔진입니다. 필요 시 번들러 타깃 baseline(예: `es2019`)을 낮춥니다.

## 배포 시 고려사항

- **패키징(완료)**: `packaging/build_windows.bat` → `dist/AINewsroom/AINewsroom.exe`. Python 설치 없이 실행되며, 앱 폴더는 exe가 놓인 폴더입니다(`.env`·`.article-workspace`가 함께 따라오는 포터블 구조). 자세한 내용은 `packaging/README.md`.
- **WebView2 런타임**: Windows 10/11은 대개 Edge와 함께 설치되어 있습니다(이 환경 확인값 `154.0.4258.48`). 없으면 Evergreen 부트스트래퍼를 설치기에 포함합니다. macOS는 WKWebView 내장.
- **자동 업데이트·트레이·단일 인스턴스**는 아직 없습니다. 필요해지면 별도 판단(ADR의 보류안 참고).
