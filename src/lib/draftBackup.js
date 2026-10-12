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

// 계정마다 칸이 따로고, 내용은 AES-GCM 으로 암호화해 둔다(웹뷰 저장소에 원고가 평문으로 남지 않게).
// 키는 코어가 기기 키와 계정 id 에서 파생해 주며(getBackupKey) 이 모듈의 메모리에만 둔다 — 저장하지 않는다.
// 계정·키를 모르는 동안에는 아무것도 쓰지 않는다. 계정 도입 전의 한 칸짜리 백업("current")은 주인을 알 수 없어 지운다.
let keyWaitMs = 5000; // 코어가 키를 못 주면(꺼져 있음 등) 이 시간 뒤 이번 읽기·쓰기는 포기한다

let owner = "";
let cryptoKey = null; // Promise<CryptoKey> | null
let setKeyReady = () => {};
export const setBackupOwner = (userId) => {
  const next = userId || "";
  if (next === owner) return;
  owner = next;
  cryptoKey = next ? new Promise((resolve) => { setKeyReady = resolve; }) : null; // 키가 올 때까지 읽기·쓰기는 기다린다
};
/** 코어가 준 키(base64)를 쓸 수 있게 한다(내보낼 수 없는 키로 가져옴). forOwner: 그 키를 받은 계정 */
export const setBackupKey = async (base64, forOwner) => {
  if (forOwner !== owner) return; // 계정이 바뀐 뒤에 도착한 이전 계정의 키는 버린다
  const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  setKeyReady(await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
};
const slot = () => `current:${owner}`;
const aad = () => new TextEncoder().encode(owner); // 다른 계정의 칸에 옮겨도 풀리지 않게 계정을 묶는다
const getKey = () => Promise.race([cryptoKey, new Promise((_, reject) => setTimeout(() => reject(new Error("no-key")), keyWaitMs))]);

async function seal(article) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(draftOnly(article)));
  return { v: 2, iv, data: await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad() }, await getKey(), plain), at: Date.now() };
}

/** → { article, at } | undefined. 키를 못 받으면 throw("no-key") — 백업은 그대로 둔다 */
async function open(entry) {
  if (entry?.article) return { article: entry.article, at: entry.at }; // 암호화 도입 전에 쓴 평문 백업: 이번에는 읽게 하고, 다음 저장 때 암호화본으로 바뀐다
  if (entry?.v !== 2) return undefined;
  const key = await getKey();
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: entry.iv, additionalData: aad() }, key, entry.data);
    return { article: JSON.parse(new TextDecoder().decode(plain)), at: entry.at };
  } catch {
    return undefined; // 키가 다르거나 깨진 백업 — 읽을 수 없다
  }
}

export const clearBackup = () => (owner ? withStore("readwrite", (store) => store.delete(slot())) : undefined);

export const writeBackup = async (article) => {
  if (!owner) return undefined;
  try {
    const entry = await seal(article);
    return await withStore("readwrite", (store) => store.put(entry, slot()));
  } catch { return undefined; } // 키를 못 받았으면 이번 백업은 건너뛴다(저장은 코어 자동 저장이 한다)
};

/** → { article, at } | undefined */
export const readBackup = async () => {
  if (!owner) return undefined;
  await withStore("readwrite", (store) => store.delete(KEY)); // 옛 한 칸짜리 백업
  const entry = await withStore("readonly", (store) => store.get(slot()));
  if (!entry) return undefined;
  try {
    const opened = await open(entry);
    if (!opened) await clearBackup(); // 읽을 수 없는 백업은 치운다
    return opened;
  } catch { return undefined; } // 키를 못 받았다: 지우지 않고 다음에 다시 시도
};

// 사진은 data URL 대신 id·설명만 비교한다(같은 사진이 참조/바이트로 오갈 수 있다)
const comparable = (a) => JSON.stringify([
  a.articleId || null, a.title || "", a.subtitle || "", a.content || "", a.category || "", a.subcategory || "",
  (a.photos || []).map((p) => [p.id, p.caption || "", p.source || ""]),
  (a.sources || []).map((s) => s.id), a.linkedSources || [], (a.linkedInterviews || []).length,
]);

/** 백업이 지금 불러온 원고와 같은 내용인가(같으면 복구할 것이 없다) */
export const sameDraft = (a, b) => comparable(a || {}) === comparable(b || {});

/** 시험용: 키를 기다리는 시간 */
export const setKeyWaitForTest = (ms) => { keyWaitMs = ms; };
