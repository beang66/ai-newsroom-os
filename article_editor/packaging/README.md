# packaging/ — 데스크톱 배포본(exe) 만들기

`article_editor` 전체를 **Python 설치가 필요 없는 exe** 로 묶습니다. 셸이 Python(pywebview)이라
Node/Chromium 동봉 없이 **PyInstaller 한 갈래**로 끝납니다.

| 파일 | 역할 |
|---|---|
| `AINewsroom.spec` | 빌드 명세(리소스·제외 목록·실행 파일 정의) |
| `build_windows.bat` | 도구 설치 → 정리 → 빌드 → 안내 (더블클릭 가능) |
| `requirements-build.txt` | 빌드에만 필요한 패키지(pyinstaller, pywebview) |

## 빌드

```
packaging\build_windows.bat
```

직접 실행해도 같습니다.

```
python -m pip install -r packaging\requirements-build.txt
python -m PyInstaller --noconfirm --clean packaging\AINewsroom.spec
```

## 산출물

```
dist\AINewsroom\
├─ AINewsroom.exe          창 모드(콘솔 없음) — 사용자용
├─ AINewsroom-debug.exe    콘솔 진단용 — 지원·검증용
└─ _internal\              파이썬 런타임 + frontend\ + webview\lib(WebView2 .NET DLL)
```

- 약 28 MB. `frontend/`(화면)와 `webview/lib`(WebView2 DLL)를 포함하고 **torch/transformers는 제외**합니다(수 GB).
- **단일 파일**: `set AINEWSROOM_ONEFILE=1` 후 빌드 → `dist\AINewsroom.exe`(+ `-debug.exe`).
  실행할 때마다 임시 폴더로 풀리므로 첫 창이 몇 초 늦게 뜹니다.
- 이름 변경: `set AINEWSROOM_NAME=기사작업실`
- 아이콘: `packaging\app.ico` 파일을 두면 자동 적용됩니다.

## 실행과 CLI (개발 실행과 동일)

| 명령 | 동작 |
|---|---|
| `AINewsroom.exe` | 창 모드(기본). 창을 닫으면 종료 |
| `AINewsroom.exe --browser` | 기본 브라우저로 열기 |
| `AINewsroom-debug.exe --check` | 창 없이 진단 + `STARTUP CHECK PASSED` |
| `AINewsroom-debug.exe --smoke write` / `--smoke read` | 창 검증 하네스 7항목 |
| `--debug` | WebView2 개발자 도구 |

## 포터블 규칙 (중요)

배포본은 **exe가 놓인 폴더를 앱 폴더로 씁니다**(`app_paths.py`).

```
어디든\AINewsroom\
├─ AINewsroom.exe
├─ .env                       ← 여기에 두면 그대로 읽습니다(없으면 OS 환경변수만 사용)
└─ .article-workspace\        ← 자동 생성(첫 실행)
   ├─ articles\               ← POST /api/articles/save 로 저장한 원고
   ├─ webview\                ← 창의 IndexedDB 임시저장(WebView2 프로필)
   ├─ logs\app.log            ← 창 모드 진단 로그
   └─ desktop-shell-smoke.json
```

- 폴더째 복사해도 `.env`·임시저장·로그가 따라옵니다. 설치 프로그램 없이 압축 배포가 가능합니다.
- `.env` 탐색 순서: `exe 폴더 → 상위 3단계`(가까운 파일 우선, 실제 OS 환경변수가 최우선).
- 단일 파일 빌드에서도 앱 폴더는 **exe가 있는 폴더**입니다(임시 폴더가 아닙니다).

## 요구 환경

| 항목 | 내용 |
|---|---|
| OS | Windows 10/11 x64 |
| WebView2 런타임 | Edge와 함께 설치됨(이 환경 `154.0.4258.48`). 없으면 Evergreen 부트스트래퍼 설치 |
| .NET | pythonnet이 .NET Framework 4.6.2+ 사용(Windows 기본 포함) |
| Python | **불필요**(번들에 포함) |

## 로컬 AI 모델(선택)

배포본에는 `torch`/`transformers`가 없습니다. `USE_LOCAL_MODELS=true` 로 두면 제목·부제 추천이
"로컬 모델 패키지가 없습니다" 안내(503)로 돌아갑니다. 로컬 모델을 쓰려면 배포 환경에
`requirements-headline.txt`를 설치하고 `HEADLINE_CACHE_DIR`(모델 캐시 경로)을 지정하세요.
기본 구성은 원격 AI(`OPENAI_API_KEY`)입니다.

## 검증 기록 (2026-10-02, Windows · PyInstaller 6.22.3)

- `AINewsroom-debug.exe --check` → `STARTUP CHECK PASSED`
  (앱 폴더 = exe 폴더, 리소스 = `_internal`, 로컬 AI 미포함, WebView2 `154.0.4258.48`)
- `AINewsroom.exe` 단독 실행 → 창 제목 `AI Newsroom — 기사 작성`, `127.0.0.1:8877` 리스닝, `GET /api/status` 정상
- `--smoke write` → **7/7 PASS**, `--smoke read` → **7/7 PASS**
  (표식 `2026-10-02T02:21:41.808Z` 가 **다른 exe 프로세스에서도 유지** = 배포본 IndexedDB 영속 확인)

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 창이 뜨지 않음 | `AINewsroom-debug.exe --check` → `.article-workspace\logs\app.log` |
| "Windows의 PC 보호" 경고 | 코드 서명이 없어서 나오는 SmartScreen 안내. 인증서를 넣고 `signtool`로 서명 |
| WebView2 없음 안내 | Evergreen 부트스트래퍼 설치 |
| 내보내기·드래그·인쇄 | `desktop/README.md`의 "사람이 직접 확인해야 하는 항목" 참고 |
