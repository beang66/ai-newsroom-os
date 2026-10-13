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
  sessionAuto: "/api/session/auto",
  models: "/api/models",
  modelsInstall: "/api/models/install",
  modelsCancel: "/api/models/cancel",
  assist: "/api/assist",
  articlesSave: "/api/articles/save",
  articlesLatest: "/api/articles/latest?photos=ref", // 사진은 'media:<id>' 참조로 받고 바이트는 mediaBytes 로 따로
  media: (id) => "/api/media/" + encodeURIComponent(id),
  mediaAssets: "/api/media-assets",
  articleRevisions: (id) => "/api/articles/" + encodeURIComponent(id) + "/revisions",
  articleRevision: (id, no) => "/api/articles/" + encodeURIComponent(id) + "/revisions/" + encodeURIComponent(no),
  articleRestore: (id, no) => "/api/articles/" + encodeURIComponent(id) + "/revisions/" + encodeURIComponent(no) + "/restore",
  factcheckStatus: "/api/factcheck/status",
  factcheckRun: "/api/factcheck/run",
  factcheckExternal: "/api/factcheck/external",
  semanticParse: "/api/semantic/parse",
  transcribe: "/api/interview/transcribe",
  stt: "/api/stt",
  materialsExtract: "/api/materials/extract",
  sources: "/api/sources",
  knowledgeMap: "/api/knowledge-map",
  sourcesOpen: "/api/sources/open",
  sourceFile: (id) => "/api/sources/" + encodeURIComponent(id) + "/file",
  unsplashSearch: "/api/unsplash/search",
  photo: (id) => "/api/unsplash/photo/" + encodeURIComponent(id),
  photoTrack: (id) => "/api/unsplash/photo/" + encodeURIComponent(id) + "/track",
  platformKeywords: "/api/platform/keywords",
  platformGenerate: "/api/platform/generate",
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
    /** 공용 테스트 계정 자동 로그인 켜기/끄기(개발 실행 전용) → session() 과 같은 모양 */
    setAutoLogin: (enabled, signal) => transport.json(ROUTES.sessionAuto, { enabled }, signal),
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
    /** 외부 재판정(임시·OpenAI): items=[{id, claim, evidence:[str], titles?:[str]}] → { results:[{id, verdict, reason, wrong_text, evidence_text}] }
     *  options.cachedOnly 가 참이면 저장된 재판정만 돌려주고 OpenAI 는 부르지 않는다(저장 없는 문장은 results 에서 빠짐) —
     *  원고를 다시 열 때 이미 받은 AI 판정을 화면에 복원하는 용도. items 는 클릭 재검토 때와 똑같은 형식이어야 기록을 찾는다. */
    factcheckExternal: (items, signal, { cachedOnly = false } = {}) =>
      transport.json(ROUTES.factcheckExternal, cachedOnly ? { items, cachedOnly: true } : { items }, signal),
    /** 의미 단위 청킹: source = frontend | opendart */
    semanticParse: (text, source = "frontend", signal) =>
      transport.json(ROUTES.semanticParse, { text, source }, signal),
    /** 인터뷰 녹음 전사(CLOVA Speech / Whisper) → { dialogues:[{id,speaker,speakerName,timestamp,text}], text, duration, transcript } */
    transcribe: (filename, data, signal) =>
      transport.json(ROUTES.transcribe, { filename, data }, signal),
    /** STT 음성인식 계약 (/api/stt) */
    stt: (filename, data, signal) =>
      transport.json(ROUTES.stt, { filename, data }, signal),
    /** 자료 파일(PDF·DOCX·HWP·HWPX·TXT) 텍스트 추출 → { text, chars, format } */
    extractText: (filename, data, signal) =>
      transport.json(ROUTES.materialsExtract, { filename, data }, signal),
    /** 저장된 취재자료 목록(최신순) → { sources: [{ id, name, format, size, chars, createdAt, usedBy:[{articleId,title}], index }] } */
    listSources: (signal) => transport.json(ROUTES.sources, null, signal),
    /** 기사·자료·고정본과 실제 연결(읽기 모델) → { articles, sources, snapshots, entities, edges:[{source,target,relation}] } */
    knowledgeMap: (signal) => transport.json(ROUTES.knowledgeMap, null, signal),
    /** 보관한 취재자료 원본을 이 PC 의 기본 프로그램으로 열기 */
    openSource: (sourceId, signal) =>
      transport.json(ROUTES.sourcesOpen, { sourceId }, signal),
    /** 보관한 취재자료 원본 바이트(앱 안 뷰어용) → Blob */
    sourceBytes: (sourceId, signal) => transport.bytes(ROUTES.sourceFile(sourceId), signal),
    /** 원고 디스크 저장 (파일: 내 문서/AI Newsroom/articles) */
    saveArticle: (draft, signal) =>
      transport.json(ROUTES.articlesSave, { draft }, signal),
    /** 가장 최근에 저장된 원고(앱을 열면 이어서 작업) → { draft | null }. 사진(data/original)은 "media:<id>" 참조 */
    latestArticle: (signal) => transport.json(ROUTES.articlesLatest, null, signal),
    /** 원고의 저장 이력 목록(최신이 위) → { revisions: [{ revisionNo, id, createdAt, title, excerpt, chars, ... }] } */
    listRevisions: (articleId, signal) => transport.json(ROUTES.articleRevisions(articleId), null, signal),
    /** 저장 이력 한 건의 미리보기(읽기 전용) → { title, subtitle, content, ... } */
    getRevision: (articleId, revisionNo, signal) => transport.json(ROUTES.articleRevision(articleId, revisionNo), null, signal),
    /** 옛 저장본을 새 최신 저장본으로 복원(이력은 지우지 않음) → { draft, revisionNo, fromRevision } */
    restoreRevision: (articleId, revisionNo, signal) => transport.json(ROUTES.articleRestore(articleId, revisionNo), {}, signal),
    /** Unsplash 사진 검색 (1페이지 3장) */
    searchPhotos: (query, page = 1, signal) =>
      transport.json(
        `${ROUTES.unsplashSearch}?q=${encodeURIComponent(query)}&page=${page}`,
        null,
        signal,
      ),
    /** 사진 원본 바이트 (Unsplash 키는 코어가 보유) */
    photoBytes: (id, signal) => transport.bytes(ROUTES.photo(id), signal),
    /** 원고 사진("media:<id>")의 바이트 → Blob */
    mediaBytes: (mediaId, signal) => transport.bytes(ROUTES.media(mediaId), signal),
    /** 사진을 암호화 저장소에 한 번 올리고 자산으로 등록 → { id, object_ref: "media:<id>", ... } */
    registerMediaAsset: (payload, signal) => transport.json(ROUTES.mediaAssets, payload, signal),
    /** 다운로드 추적(Unsplash 가이드라인) */
    trackPhoto: (id, signal) => transport.json(ROUTES.photoTrack(id), null, signal),
    /** 플랫폼 콘텐츠용 핵심 키워드 후보 */
    platformKeywords: (article, signal) =>
      transport.json(ROUTES.platformKeywords, { article }, signal),
    /** platform-generator 실제 생성 엔진 호출 */
    generatePlatform: (platform, payload, signal) =>
      transport.json(ROUTES.platformGenerate, { platform, payload }, signal),
  };
}
