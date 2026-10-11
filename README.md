# AI Newsroom OS

기사 작성, 취재자료, 팩트체크, DataMap, 플랫폼 변환을 제공하는 로컬 뉴스룸 앱입니다.

메인 UI 소스는 루트 `src/` 하나입니다. 이전 `article_editor/web/src`의 최신 UI와 DataMap을 이곳으로 이동했습니다. `pilot/`은 별도 프로토타입입니다. Python 코어는 `article_editor/app/core/`, 플랫폼 변환기의 공용 런타임은 `platform-generator/lib/`에 있습니다.

인터페이스는 프로토타입의 6개 작업 흐름을 사용합니다: 오늘의 데스크, 기사 작성, 인터뷰·녹취, 변환·배포, 데이터맵, 보관함. 기존 디자인 시스템을 유지하며 데이터맵과 보관함은 별도 화면입니다. 새 기사와 저장 원고를 열 때는 현재 저장이 끝난 뒤 전환합니다.

편집 중 창을 닫거나 새로고침하면 저장을 먼저 시도하고, 저장되지 않은 변경이 있으면 브라우저가 확인합니다. 환경 설정에서는 기사·자료·녹음·녹취를 사용자 암호로 재암호화한 이동식 백업을 만들거나 복구할 수 있습니다. CMS 발행은 백엔드의 실제 `/cms/publish` 응답이 성공한 경우에만 완료로 표시됩니다.

## Windows에서 실행

프로젝트 폴더에서 최신 UI를 빌드하고 데스크톱 창을 엽니다. Python과 Node.js가 필요하며, 저장소 의존성은 배치 파일이 프로젝트 로컬에 설치합니다.

```powershell
cd C:\myproject\ai-newsroom-os-main
.\article_editor\start_window_fresh.bat
```

브라우저 개발은 터미널 두 개를 사용합니다.

```powershell
# 터미널 1: 코어 API (기본 포트 8765)
cd C:\myproject\ai-newsroom-os-main
cmd /c article_editor\scripts\ensure_storage_deps.bat
py -3 .\article_editor\app\server.py
```

```powershell
# 터미널 2: 메인 UI
cd C:\myproject\ai-newsroom-os-main
npm ci
npm run dev
```

브라우저에서 http://127.0.0.1:5173 을 엽니다. `npm run build` 결과는 `article_editor/app/frontend/`에 생성되고 Python 코어와 EXE 패키징이 같은 결과를 사용합니다.

## 검증

```powershell
cd C:\myproject\ai-newsroom-os-main
npm test
npm run build
npm test --prefix platform-generator
$env:PYTHONPATH = "$pwd\article_editor\.runtime"
npm --prefix article_editor run test:python
npm run test:ui
```

화면 테스트는 Edge와 가짜 백엔드, 임시 저장소를 사용합니다. AI 기능에는 별도의 로그인·모델·서버 설정이 필요합니다. EXE 배포 준비는 `article_editor/packaging/README.md`를 참고하세요.

실제 CMS 송고를 쓰려면 백엔드에 `CMS_PUBLISH_URL`과 필요 시 `CMS_BEARER_TOKEN`을 설정합니다. 비밀 토큰은 앱이나 저장소에 넣지 않습니다.

## DataMap 테스트 자료와 복구점

`sample-data/datamap/`의 마크다운 5개는 내부 링크, 백링크, 미해결 링크를 검증합니다. 보관함의 DataMap에서 가져올 수 있습니다.

GitHub `origin/main` 이력을 연결했으며, UI 정리 직전 로컬 DataMap 변경은 `backup/local-before-ui-consolidation` 브랜치에 보존했습니다. 구형 UI는 이 브랜치에서 확인할 수 있습니다. 로컬 커밋은 별도 요청 전에는 GitHub로 push하지 않습니다.
