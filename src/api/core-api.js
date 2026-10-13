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
  signUp: "/api/session/signup",
  sessionKeep: "/api/session/keep",
  signOut: "/api/session/signout",
  sessionAuto: "/api/session/auto",
  settings: "/api/settings",
  diagnostics: "/api/diagnostics",
  backupKey: "/api/backup-key",
  backup: "/api/backup",
  backupList: "/api/backup/list",
  backupNow: "/api/backup/now",
  backupRestore: "/api/backup/restore",
  backupDisable: "/api/backup/disable",
  transfer: "/api/transfer",
  transferUpload: "/api/transfer/upload",
  transferDownload: "/api/transfer/download",
  transferDelete: "/api/transfer/delete",
  models: "/api/models",
  modelsInstall: "/api/models/install",
  modelsCancel: "/api/models/cancel",
  assist: "/api/assist",
  articlesSave: "/api/articles/save",
  articlesPublish: "/api/articles/publish",
  articleSnapshots: (id) => "/api/articles/" + encodeURIComponent(id) + "/snapshots",
  articles: "/api/articles",
  // version 없음 = 그 기사의 최신 원고 | "saved"(마지막 수동 저장본) | "published"(송고본, 사진은 참조로)
  article: (id, version) => "/api/articles/" + encodeURIComponent(id.replaceAll("-", ""))
    + (version ? "?version=" + encodeURIComponent(version) + "&photos=ref" : ""),
  articlesLatest: "/api/articles/latest?photos=ref", // 사진은 'media:<id>' 참조로 받고 바이트는 mediaBytes 로 따로
  media: (id) => "/api/media/" + encodeURIComponent(id),
  mediaAssets: "/api/media-assets",
  mediaAsset: (id) => "/api/media-assets/" + encodeURIComponent(id),
  job: (id) => "/api/jobs/" + encodeURIComponent(id),
  jobCancel: (id) => "/api/jobs/" + encodeURIComponent(id) + "/cancel",
  snapshot: (id) => "/api/snapshots/" + encodeURIComponent(id),
  articleRevisions: (id) => "/api/articles/" + encodeURIComponent(id) + "/revisions",
  articleRevision: (id, no) => "/api/articles/" + encodeURIComponent(id) + "/revisions/" + encodeURIComponent(no),
  articleDelete: (id) => "/api/articles/" + encodeURIComponent(id.replaceAll("-", "")) + "/delete",
  articlePruneLegacy: (id) => "/api/articles/" + encodeURIComponent(id) + "/revisions/prune-legacy",
  articleRestore: (id, no) => "/api/articles/" + encodeURIComponent(id) + "/revisions/" + encodeURIComponent(no) + "/restore",
  factcheckStatus: "/api/factcheck/status",
  factcheckRun: "/api/factcheck/run",
  factcheckExternal: "/api/factcheck/external",
  semanticParse: "/api/semantic/parse",
  transcribe: "/api/interview/transcribe",
  transcripts: "/api/transcripts",
  transcript: (id) => "/api/transcripts/" + encodeURIComponent(id),
  transcriptAudio: (id) => "/api/transcripts/" + encodeURIComponent(id) + "/audio",
  cmsPublish: "/api/cms/publish",
  vaultExport: "/api/vault/export",
  vaultRestore: "/api/vault/restore",
  materialsExtract: "/api/materials/extract",
  sources: "/api/sources",
  source: (id) => "/api/sources/" + encodeURIComponent(id),
  sourceDelete: (id) => "/api/sources/" + encodeURIComponent(id) + "/delete",
  knowledgeMap: "/api/knowledge-map",
  knowledgeFilesImport: "/api/knowledge-files/import",
  knowledgeFile: (id) => "/api/knowledge-files/" + encodeURIComponent(id),
  knowledgeFileDelete: (id) => "/api/knowledge-files/" + encodeURIComponent(id) + "/delete",
  sourcesOpen: "/api/sources/open",
  sourceFile: (id) => "/api/sources/" + encodeURIComponent(id) + "/file",
  unsplashSearch: "/api/unsplash/search",
  photo: (id) => "/api/unsplash/photo/" + encodeURIComponent(id),
  photoTrack: (id) => "/api/unsplash/photo/" + encodeURIComponent(id) + "/track",
  dongaPhotos: "/api/donga/photos",
  dongaPhoto: (id) => "/api/donga/photo/" + encodeURIComponent(id),
  platformKeywords: "/api/platform/keywords",
  platformGenerate: "/api/platform/generate",
  platformRender: "/api/platform/render",
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
    signIn: (email, password, { remember = false } = {}, signal) =>
      transport.json(ROUTES.session, { email, password, remember }, signal),
    /** 로그아웃 */
    /** 회원가입. 이메일 확인이 꺼져 있으면 로그인된 session() 모양, 켜져 있으면 signedIn=false 로 오고 둘 다 needsConfirmation 이 붙는다 */
    signUp: (email, password, { remember = false } = {}, signal) =>
      transport.json(ROUTES.signUp, { email, password, remember }, signal),
    /** 이 PC 에서 로그인 유지(앱을 열면 로그인된 상태). 켜면 갱신 토큰만 OS 자격 증명 저장소에 두고, 끄면 지운다 → session() 모양 */
    setKeepLogin: (enabled, signal) => transport.json(ROUTES.sessionKeep, { enabled }, signal),
    signOut: (signal) => transport.json(ROUTES.signOut, {}, signal),
    /** 공용 테스트 계정 자동 로그인 켜기/끄기(개발 실행 전용) → session() 과 같은 모양 */
    setAutoLogin: (enabled, signal) => transport.json(ROUTES.sessionAuto, { enabled }, signal),
    /** 로컬 모델 상태(설치 여부·진행률·마지막 오류) — 첫 사용 때 내려받는다 */
    /** 작성 중 기사 서버 백업 상태 → { enabled, pending, lastUploadAt, error } */
    getBackup: (signal) => transport.json(ROUTES.backup, null, signal),
    /** 이 PC 의 모든 기사를 지금 서버에 올린다 → { uploaded, ...상태 } */
    backupNow: (signal) => transport.json(ROUTES.backupNow, {}, signal),
    /** 서버에 있는 내 백업 목록 → { backups: [{ articleId, title, savedAt, bytes }] } */
    listBackups: (signal) => transport.json(ROUTES.backupList, null, signal),
    /** 선택한 기사를 서버 백업에서 이 PC 로 복구 → { restored, skipped } */
    restoreBackups: (articleIds, signal) => transport.json(ROUTES.backupRestore, { articleIds }, signal),
    /** 백업을 끈다. deleteServer 면 서버의 내 백업도 지운다 */
    disableBackup: (deleteServer, signal) => transport.json(ROUTES.backupDisable, { deleteServer: Boolean(deleteServer) }, signal),
    /** 다른 PC로 이전(서버 경유): 서버에 내 이전 파일이 있는가 → { exists, bytes, updatedAt, maxBytes } */
    getTransfer: (signal) => transport.json(ROUTES.transfer, null, signal),
    /** 현재 계정 자료를 일회용 코드로 암호화해 서버에 올린다. 한도를 넘으면 413 code TRANSFER_TOO_LARGE */
    uploadTransfer: (code, signal) => transport.json(ROUTES.transferUpload, { code }, signal),
    /** 서버의 이전 파일을 코드로 풀어 이 PC 의 현재 계정 자료로 바꾼다(성공하면 서버 파일 삭제). 없으면 404 code TRANSFER_MISSING */
    downloadTransfer: (code, signal) => transport.json(ROUTES.transferDownload, { code }, signal),
    /** 서버의 이전 파일 지우기(보낸 것을 취소) */
    deleteTransfer: (signal) => transport.json(ROUTES.transferDelete, {}, signal),
    /** 원고 백업(브라우저 저장소) 암호화 키 → { key: base64 }. 계정별로 다르다. 화면은 메모리에만 두고 저장하지 않는다 */
    getBackupKey: (signal) => transport.json(ROUTES.backupKey, null, signal),
    /** 문제 보고용 진단 정보(앱 버전·모델 설치 상태·설정 요약). 원고·자료·이메일은 없다 */
    getDiagnostics: (signal) => transport.json(ROUTES.diagnostics, null, signal),
    /** 환경 설정(이 PC) → { cloudBackup }. 모델 설치와는 별개 */
    getSettings: (signal) => transport.json(ROUTES.settings, null, signal),
    /** 환경 설정 변경. 준 항목만 바뀐다 → 바뀐 뒤의 설정 전체 */
    saveSettings: (patch, signal) => transport.json(ROUTES.settings, patch, signal),
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
    runFactcheck: (nodes, materials, snapshotId, signal) =>
      transport.json(ROUTES.factcheckRun, snapshotId ? { nodes, materials, snapshotId } : { nodes, materials }, signal),
    /** 외부 재판정(임시·OpenAI): items=[{id, claim, evidence:[str], titles?:[str]}] → { results:[{id, verdict, reason, wrong_text, evidence_text}] }
     *  options.cachedOnly 가 참이면 저장된 재판정만 돌려주고 OpenAI 는 부르지 않는다(저장 없는 문장은 results 에서 빠짐) —
     *  원고를 다시 열 때 이미 받은 AI 판정을 화면에 복원하는 용도. items 는 클릭 재검토 때와 똑같은 형식이어야 기록을 찾는다. */
    factcheckExternal: (items, signal, { cachedOnly = false } = {}) =>
      transport.json(ROUTES.factcheckExternal, cachedOnly ? { items, cachedOnly: true } : { items }, signal),
    /** 의미 단위 청킹: source = frontend | opendart */
    semanticParse: (text, source = "frontend", signal) =>
      transport.json(ROUTES.semanticParse, { text, source }, signal),
    /** 인터뷰 녹음 전사(Whisper) → { dialogues:[{id,speaker,speakerName,timestamp,text}], text, duration } */
    transcribe: (filename, mimeType, data, signal) =>
      transport.json(ROUTES.transcribe, { filename, mimeType, data }, signal),
    listTranscripts: (signal) => transport.json(ROUTES.transcripts, null, signal),
    getTranscript: (id, signal) => transport.json(ROUTES.transcript(id), null, signal),
    transcriptAudio: (id, signal) => transport.bytes(ROUTES.transcriptAudio(id), signal),
    publishCms: (article, signal) => transport.json(ROUTES.cmsPublish, { article }, signal),
    exportVault: (password, signal) => transport.json(ROUTES.vaultExport, { password }, signal),
    restoreVault: (password, data, signal) => transport.json(ROUTES.vaultRestore, { password, data }, signal),
    /** 자료 파일(PDF·DOCX·HWP·HWPX·TXT) 텍스트 추출 → { text, chars, format } */
    createSource: (filename, data, signal) =>
      transport.json(ROUTES.materialsExtract, { filename, data }, signal),
    /** 저장된 취재자료 목록(최신순) → { sources: [{ id, name, format, size, chars, createdAt, usedBy:[{articleId,title}], index }] } */
    listSources: (signal) => transport.json(ROUTES.sources, null, signal),
    /** 취재자료 한 건의 정보(목록 항목과 같은 모양) */
    getSource: (sourceId, signal) => transport.json(ROUTES.source(sourceId), null, signal),
    /** 취재자료 삭제. 쓰는 기사가 있으면 409(code SOURCE_IN_USE, details.usedBy)로 거절하고, options.force 가 참이면 그래도 지운다 */
    deleteSource: (sourceId, { force = false } = {}, signal) =>
      transport.json(ROUTES.sourceDelete(sourceId), force ? { force: true } : {}, signal),
    /** 기사·자료·고정본과 실제 연결(읽기 모델) → { articles, sources, snapshots, entities, edges:[{source,target,relation}] } */
    getKnowledgeMap: (signal) => transport.json(ROUTES.knowledgeMap, null, signal),
    /** Markdown 파일을 앱 관리 저장소로 가져오고 링크·백링크를 다시 색인한다. */
    importKnowledgeFiles: (payload, signal) => transport.json(ROUTES.knowledgeFilesImport, payload, signal),
    /** Markdown 파일 본문과 링크·백링크를 읽는다. */
    getKnowledgeFile: (id, signal) => transport.json(ROUTES.knowledgeFile(id), null, signal),
    /** Markdown 파일을 지우고 남은 링크를 다시 해석한다. */
    deleteKnowledgeFile: (id, signal) => transport.json(ROUTES.knowledgeFileDelete(id), {}, signal),
    /** 보관한 취재자료 원본을 이 PC 의 기본 프로그램으로 열기 */
    openSource: (sourceId, signal) =>
      transport.json(ROUTES.sourcesOpen, { sourceId }, signal),
    /** 보관한 취재자료 원본 바이트(앱 안 뷰어용) → Blob */
    sourceBytes: (sourceId, signal) => transport.bytes(ROUTES.sourceFile(sourceId), signal),
    /** 원고를 코어의 암호화 저장소에 저장. kind: "auto"(자동 임시 저장 — 최근 작업본 한 칸을 덮어씀) | "manual"(저장 버튼 — 새 버전) */
    saveArticle: (draft, expectedRevisionNo, replaceLatest = false, signal, kind) =>
      transport.json(ROUTES.articlesSave, {
        draft,
        ...(Number.isInteger(expectedRevisionNo) ? { expectedRevisionNo } : {}),
        ...(replaceLatest ? { replaceLatest: true } : {}),
        ...(kind ? { kind } : {}),
      }, signal),
    /** 송고 = 수동 저장 + 송고본(기사당 하나, 다시 송고하면 덮어쓰고 시각 갱신) → { published, articleId, revisionNo, republished } */
    publishArticle: (draft, signal) => transport.json(ROUTES.articlesPublish, { draft }, signal),
    /** 가장 최근에 저장된 원고(앱을 열면 이어서 작업) → { draft | null }. 사진(data/original)은 "media:<id>" 참조 */
    latestArticle: (signal) => transport.json(ROUTES.articlesLatest, null, signal),
    listArticles: (signal) => transport.json(ROUTES.articles, null, signal),
    /** 기사 하나 — version 없음(최신 원고) | "saved" | "published" → latestArticle 과 같은 모양 */
    getArticle: (id, version, signal) => transport.json(ROUTES.article(id, version), null, signal),
    /** 원고의 저장 이력 목록(최신이 위) → { revisions: [{ revisionNo, id, createdAt, title, excerpt, chars, ... }] } */
    listRevisions: (articleId, signal) => transport.json(ROUTES.articleRevisions(articleId), null, signal),
    /** 저장 이력 한 건의 미리보기(읽기 전용) → { title, subtitle, content, ... } */
    getRevision: (articleId, revisionNo, signal) => transport.json(ROUTES.articleRevision(articleId, revisionNo), null, signal),
    /** 보관소에서 기사 지우기(보관소·이어서 작업에서 빠지고 더 저장되지 않는다) → { deleted, articleId } */
    deleteArticle: (articleId, signal) => transport.json(ROUTES.articleDelete(articleId), {}, signal),
    /** 수동 저장 도입 전의 옛 자동 저장 이력 정리 → { deleted } */
    pruneLegacyRevisions: (articleId, signal) => transport.json(ROUTES.articlePruneLegacy(articleId), {}, signal),
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
    /** 동아일보 DB(포토파노라마) 사진 검색 — sort: all|latest|oldest, 3장씩 → { photos:[{id,image,thumb,date,title,summary}], page, totalPages, total } */
    searchDongaPhotos: (query, sort = "all", page = 1, signal) =>
      transport.json(`${ROUTES.dongaPhotos}?q=${encodeURIComponent(query || "")}&sort=${encodeURIComponent(sort)}&page=${page}`, null, signal),
    /** 동아일보 DB 사진 원본 바이트 → Blob */
    dongaPhotoBytes: (id, signal) => transport.bytes(ROUTES.dongaPhoto(id), signal),
    /** 원고 사진("media:<id>")의 바이트 → Blob */
    mediaBytes: (mediaId, signal) => transport.bytes(ROUTES.media(mediaId), signal),
    /** 사진을 암호화 저장소에 한 번 올리고 자산으로 등록 → { id, object_ref: "media:<id>", ... } */
    registerMediaAsset: (payload, signal) => transport.json(ROUTES.mediaAssets, payload, signal),
    /** 미디어 자산 한 건의 정보 → { id, kind, mime_type, filename, caption, generated, local_uri, usages, ... } */
    getMediaAsset: (assetId, signal) => transport.json(ROUTES.mediaAsset(assetId), null, signal),
    /** 처리 작업(색인 등)의 상태 → { id, type, status, progress, ... }. status: queued | running | succeeded | failed | cancelled */
    getJob: (jobId, signal) => transport.json(ROUTES.job(jobId), null, signal),
    /** 처리 작업 취소 요청(작업이 다음 확인 지점에서 멈춘다) */
    cancelJob: (jobId, signal) => transport.json(ROUTES.jobCancel(jobId), {}, signal),
    /** 다운로드 추적(Unsplash 가이드라인) */
    trackPhoto: (id, signal) => transport.json(ROUTES.photoTrack(id), null, signal),
    /** 플랫폼 콘텐츠용 핵심 키워드 후보 */
    platformKeywords: (article, snapshotId, signal) =>
      transport.json(ROUTES.platformKeywords, snapshotId ? { snapshotId } : { article }, signal),
    /** platform-generator 실제 생성 엔진 호출 */
    generatePlatform: (platform, payload, snapshotId, signal) =>
      transport.json(ROUTES.platformGenerate, snapshotId ? { platform, payload, snapshotId } : { platform, payload }, signal),
    /** 원고의 최신 저장 이력을 고정본(ArticleSnapshot)으로 만든다 → { id, article_id, revision_no, title, body_text, content_hash, created_at }.
     *  내용이 같으면 새로 만들지 않고 같은 고정본을 돌려준다 */
    createSnapshot: (articleId, signal) => transport.json(ROUTES.articleSnapshots(articleId), {}, signal),
    /** 원고의 고정본 목록(최신이 위) */
    listSnapshots: (articleId, signal) => transport.json(ROUTES.articleSnapshots(articleId), null, signal),
    /** 고정본 한 건(제목·본문 사본 포함) */
    getSnapshot: (snapshotId, signal) => transport.json(ROUTES.snapshot(snapshotId), null, signal),
    /** 카드뉴스 카드 하나를 이미지로 그려 코어(암호화 저장소)에 등록 → { cardId, asset:{ id, local_uri, mime_type, ... } }.
     *  payload: { card_id, template, content:{ keyword, headline, body }, image?:{ url, photographer } }. 결과 이미지는 asset.local_uri 로 보여 준다 */
    renderPlatformCard: (payload, snapshotId, signal) =>
      transport.json(ROUTES.platformRender, snapshotId ? { payload, snapshotId } : { payload }, signal),
  };
}
