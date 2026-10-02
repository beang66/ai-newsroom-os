# 웹앱 → 로컬앱 이식 (진행 중, 2026-10-02~)

프론트 담당이 `main`에 올린 **React SPA**(`e933257` → `ad63bda`)를 우리 **로컬 앱**(pywebview + 파이썬 코어)으로 다듬는 작업.
출처 요약은 `BACKEND_SCOPE.md` §9.

## 구조

```
article_editor/
  web/                 React 소스(Vite + Tailwind 4)      ← 프론트 담당 결과물
    src/api/           코어 계약(이식 완료) — UI는 여기만 거친다
    src/components/    화면(ArticleWriter·InterviewStudio·FormatConverter …)
  app/frontend/        **빌드 산출물**(npm run build 결과) ← 코어가 서빙, PyInstaller 동봉
  app/core/api.py      / · /assets/* · /favicon · /icons 정적 서빙
```

- 개발: `npm --prefix web run dev` (Vite 5173, `/api` → 코어 127.0.0.1:8765) 또는 창 모드 `python app/launcher.py`
- 배포본: `npm --prefix web run build` 후 `python -m PyInstaller packaging/AINewsroom.spec`

## 완료 (2026-10-02)

- [x] 프로젝트 이식(`web/`), 빌드 → `app/frontend/` (index.html + assets 368KB JS·59KB CSS)
- [x] 코어 정적 서빙 확장(Vite 해시 자산·svg·woff2 등, 경로 탈출 차단 유지)
- [x] 코어 연결: `web/src/api/core.js` → `createAppApi({mode:"auto"})` (창=IPC, 브라우저=HTTP)
      헤더에 코어 상태 표시(연결됨/대기) — 스모크에서 `코어 연결: /api/status` PASS
- [x] 런처 준비 판정·스모크 테스트를 React 기준으로 교체 → **스모크 7/7 PASS**, 앱 테스트 40/40 OK
- [x] 외부 CDN 제거(index.html·index.css) — 오프라인 동작(폰트는 시스템 한글 폰트로 대체)
- [x] 경계 검사 대상 이동(`app/frontend` → `web/src`) + 레거시 UI 테스트 분리(`npm run test:legacy-ui`)

## 남은 일 (우선순위)

1. **목업 → 코어 연결**(가장 큰 작업): `mockData.js` 는 삭제(2026-10-02, 빈 상태 시작). 남은 화면을 계약으로 교체
   - 기사 저장/불러오기(`saveArticle`), 제목·부제(`assist` metadata), 요약(`assist` flow),
     사진 검색·선택(`searchPhotos`·`photoBytes`), 팩트체크(`factcheckRun`), 녹취 저장(`storage` 경로 추가 필요)
   - 코어에 없는 기능은 계약에 **추가**한다(예: `/api/interviews/*`, `/api/platform/convert`)
2. ~~녹취(STT) 정리~~ — 완료(2026-10-02): `transcribe.js` 를 지우고 코어 `POST /api/interview/transcribe`
   (`core/ai/transcribe.py`, Whisper `whisper-1`)로 옮김. 외부 호출은 providers 경로(local=.env 키 / remote=백엔드
   `/ai/audio/transcriptions`, multipart 그대로 중계). 문장 합치기·화자 교대 규칙도 코어로 이식.
   남은 것: 화자 분리(diarization) 없음(질문·침묵 기준 교대), 25MB 초과 파일 분할, 로컬 STT(비용 절감) 검토
3. **웹폰트 로컬 번들**: Pretendard/Inter 를 `web/public` 또는 `assets` 로 넣어 CDN 없이 동일한 타이포 확보
4. **React 테스트 도입**: 레거시 `component.mjs`/`browser.mjs` 를 대체할 스모크(Vitest+Testing Library 등)
   - 2026-10-02: 화면 스모크 추가 — `npm run build:web && npm run test:ui` (dev/tests/ui-smoke.mjs, 실제 코어 + Edge). 코어 연결 표시·작성·팩트체크 서랍·자료 검색·플랫폼 변환·보관함·녹취 스튜디오·모바일 폭, 콘솔/페이지 오류·/api 5xx 없음. 컴포넌트 단위(Vitest) 테스트는 아직
   - 2026-10-02: 옛 시험용 UI(기능 담당자 제작)의 코어 기능을 새 UI 에 연결 — 제목 "다시 생성"·부제 "AI 추천"(assist metadata), 사진 창의 Unsplash 찾기(photo_keywords·검색·원본 가져오기), 본문 "흐름 요약"(assist flow), 자동 저장(articles/save, 1.5초). 로직은 `web/src/api/editorial.js`·`web/src/components/EditorialAssist.jsx`, ArticleWriter 는 배치만. 화면 테스트는 가짜 백엔드(AI_BACKEND=remote)로 기능까지 검사
5. **alert() 정리**: 화면 내 토스트/모달로 교체(창 모드에서 alert 은 흐름을 막는다)
6. ~~레거시 자산 정리~~ — 2026-10-02 완료: `app/frontend-legacy/` 와 레거시 UI 테스트(component·geometry·browser·drag-responsive) 삭제. 복원은 git `a5e9c94`
