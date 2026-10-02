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
  app/frontend-legacy/ 옛 vanilla 프론트(비교용, gitignore)
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

1. **목업 → 코어 연결**(가장 큰 작업): `src/data/mockData.js` 를 걷어내고 계약으로 교체
   - 기사 저장/불러오기(`saveArticle`), 제목·부제(`assist` metadata), 요약(`assist` flow),
     사진 검색·선택(`searchPhotos`·`photoBytes`), 팩트체크(`factcheckRun`), 녹취 저장(`storage` 경로 추가 필요)
   - 코어에 없는 기능은 계약에 **추가**한다(예: `/api/interviews/*`, `/api/platform/convert`)
2. **녹취(STT) 정리**: `src/utils/transcribe.js` 가 브라우저에서 외부 Whisper 를 직접 호출(키 노출·CORS).
   → ① `@xenova/transformers` 는 package.json 에 없어 현재 동작 불가(의존성 추가 필요)
   → ② 클라우드 경로는 **백엔드 프록시**(`/ai/audio/transcriptions`)로 이전하는 것을 권장
3. **웹폰트 로컬 번들**: Pretendard/Inter 를 `web/public` 또는 `assets` 로 넣어 CDN 없이 동일한 타이포 확보
4. **React 테스트 도입**: 레거시 `component.mjs`/`browser.mjs` 를 대체할 스모크(Vitest+Testing Library 등)
5. **alert() 정리**: 화면 내 토스트/모달로 교체(창 모드에서 alert 은 흐름을 막는다)
6. 레거시 자산 정리: `app/frontend-legacy/` 는 비교가 끝나면 제거(현재 gitignore)
