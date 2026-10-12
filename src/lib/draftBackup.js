// 작업 중인 원고의 실시간 백업 — 앱이 강제 종료되거나 코어 저장이 실패해도 다음에 열 때 복구한다.
// 이 PC 의 브라우저 저장소(IndexedDB)에 계정마다 한 칸씩 둔다. 코어 저장(자동·수동)이 최신 내용까지 끝나면 지운다.
// 저장소를 못 쓰는 환경(사생활 보호 창 등)에서는 조용히 아무것도 하지 않는다.
const DB_NAME = "ai-newsroom-backup";
const STORE = "drafts";
const KEY = "current";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, work) {
  try {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

/** 화면 전용 값(복구 표시 등)은 빼고 원고만 남긴다 */
const draftOnly = ({ restoredFromBackup: _r, openedFrom: _o, ...article }) => article;

// 계정마다 칸이 따로다: 키에 계정 id 를 넣어, 다른 계정의 백업을 읽지도 덮어쓰지도 지우지도 않는다.
// 계정을 모르는 동안(owner 없음)에는 아무것도 하지 않는다. 계정 도입 전의 한 칸짜리 백업("current")은 주인을 알 수 없어 지운다.
let owner = "";
export const setBackupOwner = (userId) => { owner = userId || ""; };
const key = () => `current:${owner}`;

export const writeBackup = (article) => (owner ? withStore("readwrite", (store) => store.put({ article: draftOnly(article), at: Date.now() }, key())) : undefined);
/** → { article, at } | undefined */
export const readBackup = async () => {
  if (!owner) return undefined;
  await withStore("readwrite", (store) => store.delete(KEY)); // 옛 한 칸짜리 백업
  return withStore("readonly", (store) => store.get(key()));
};
export const clearBackup = () => (owner ? withStore("readwrite", (store) => store.delete(key())) : undefined);

// 사진은 data URL 대신 id·설명만 비교한다(같은 사진이 참조/바이트로 오갈 수 있다)
const comparable = (a) => JSON.stringify([
  a.articleId || null, a.title || "", a.subtitle || "", a.content || "", a.category || "", a.subcategory || "",
  (a.photos || []).map((p) => [p.id, p.caption || "", p.source || ""]),
  (a.sources || []).map((s) => s.id), a.linkedSources || [], (a.linkedInterviews || []).length,
]);

/** 백업이 지금 불러온 원고와 같은 내용인가(같으면 복구할 것이 없다) */
export const sameDraft = (a, b) => comparable(a || {}) === comparable(b || {});
