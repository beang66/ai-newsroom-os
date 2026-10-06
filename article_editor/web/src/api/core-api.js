// 코어(App Core) 계약 — UI가 아는 유일한 코어 인터페이스.
//
// 이 파일에는 "무엇을 요청하는가"(라우트와 인자)만 있고, "어떻게 보내는가"(HTTP/IPC)는
// transport 가 담당한다. 그래서 출시용 IPC 전환은 transport 한 곳(../src/api/index.js)만
// 바뀌고, UI 코드와 이 계약은 그대로 남는다.
//
// 규칙: 이 파일 밖에서 "/api/..." 경로를 쓰지 않는다 (scripts/check-api-boundary.mjs 가 검사).

export const ROUTES = Object.freeze({
  status: "/api/status",
  session: "/api/session",
  signOut: "/api/session/signout",
  models: "/api/models",
  modelsInstall: "/api/models/install",
  modelsCancel: "/api/models/cancel",
  assist: "/api/assist",
  articlesSave: "/api/articles/save",
  factcheckStatus: "/api/factcheck/status",
  factcheckRun: "/api/factcheck/run",
  semanticParse: "/api/semantic/parse",
  transcribe: "/api/interview/transcribe",
  materialsExtract: "/api/materials/extract",
  unsplashSearch: "/api/unsplash/search",
  photo: (id) => "/api/unsplash/photo/" + encodeURIComponent(id),
  photoTrack: (id) => "/api/unsplash/photo/" + encodeURIComponent(id) + "/track",
});

/**
 * 계약 객체를 만든다.
 * @param {{ json: (path: string, payload: any, signal?: AbortSignal) => Promise<any>,
 *           bytes: (path: string, signal?: AbortSignal) => Promise<Blob> }} transport
 */
export function createCoreApi(transport) {
  if (typeof transport?.json !== "function" || typeof transport?.bytes !== "function")
    throw Error("transport 에는 json/bytes 가 필요합니다.");

  return {
    /** 코어 준비 상태 */
    status: (signal) => transport.json(ROUTES.status, null, signal),
    /** 로그인 상태 — **토큰은 오지 않는다**(프론트는 토큰을 모른다) */
    session: (signal) => transport.json(ROUTES.session, null, signal),
    /** 로그인 (Supabase Auth). 성공하면 session() 과 같은 모양을 돌려준다 */
    signIn: (email, password, signal) =>
      transport.json(ROUTES.session, { email, password }, signal),
    /** 로그아웃 */
    signOut: (signal) => transport.json(ROUTES.signOut, {}, signal),
    /** 로컬 모델 상태(설치 여부·진행률·마지막 오류) — 첫 사용 때 내려받는다 */
    models: (signal) => transport.json(ROUTES.models, null, signal),
    /** 모델 설치 시작(백그라운드). 진행률은 models() 로 폴링한다 */
    installModels: (options, signal) =>
      transport.json(ROUTES.modelsInstall, options || {}, signal),
    /** 설치 취소 */
    cancelModelInstall: (signal) =>
      transport.json(ROUTES.modelsCancel, {}, signal),
    /** AI 편집 보조: kind = metadata | flow | photo_keywords | image | captions */
    assist: (payload, signal) => transport.json(ROUTES.assist, payload, signal),
    /** 팩트체크 준비 상태(모델·런타임 설치 여부) */
    factcheckStatus: (signal) => transport.json(ROUTES.factcheckStatus, null, signal),
    /** 팩트체크: nodes=[{id,type,text,linkedSourceIds?}], materials=[{id,title,content,date?,speaker?}] */
    factcheckRun: (nodes, materials, signal) =>
      transport.json(ROUTES.factcheckRun, { nodes, materials }, signal),
    /** 의미 단위 청킹: source = frontend | opendart */
    semanticParse: (text, source = "frontend", signal) =>
      transport.json(ROUTES.semanticParse, { text, source }, signal),
    /** 인터뷰 녹음 전사(Whisper) → { dialogues:[{id,speaker,speakerName,timestamp,text}], text, duration } */
    transcribe: (filename, data, signal) =>
      transport.json(ROUTES.transcribe, { filename, data }, signal),
    /** 자료 파일(PDF·DOCX·HWP·HWPX·TXT) 텍스트 추출 → { text, chars, format } */
    extractText: (filename, data, signal) =>
      transport.json(ROUTES.materialsExtract, { filename, data }, signal),
    /** 원고 디스크 저장 (파일: .article-workspace/articles) */
    saveArticle: (draft, signal) =>
      transport.json(ROUTES.articlesSave, { draft }, signal),
    /** Unsplash 사진 검색 (1페이지 3장) */
    searchPhotos: (query, page = 1, signal) =>
      transport.json(
        `${ROUTES.unsplashSearch}?q=${encodeURIComponent(query)}&page=${page}`,
        null,
        signal,
      ),
    /** 사진 원본 바이트 (Unsplash 키는 코어가 보유) */
    photoBytes: (id, signal) => transport.bytes(ROUTES.photo(id), signal),
    /** 다운로드 추적(Unsplash 가이드라인) */
    trackPhoto: (id, signal) => transport.json(ROUTES.photoTrack(id), null, signal),
  };
}
