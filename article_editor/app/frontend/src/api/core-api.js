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
  assist: "/api/assist",
  articlesSave: "/api/articles/save",
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
    /** AI 편집 보조: kind = metadata | flow | photo_keywords | image | captions */
    assist: (payload, signal) => transport.json(ROUTES.assist, payload, signal),
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
