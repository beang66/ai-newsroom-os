// 편집 보조 기능 — 옛 시험용 UI(article-workspace, 기능 담당자 제작)가 쓰던 코어 기능을 새 UI 용으로 옮긴 얇은 층.
// 응답 모양 차이(원격 AI / 로컬 모델)를 여기서 흡수해 컴포넌트는 문자열 목록만 받는다.
import { core } from "./core.js";
import { claimDetails } from "./claim-details.js";
import { captionText, photoOfLine, textWithoutPhotos } from "../lib/photoMarks.js";
import { escapeHtml } from "../lib/studioArticle.js";

// 로그인·설치 화면도 같은 코어 계약을 사용한다. 자격 증명은 요청 동안만 전달한다.
export const signIn = (email, password, remember = false) => core.signIn(email, password, { remember });
export const signUp = (email, password, remember = false) => core.signUp(email, password, { remember });
export const setKeepLogin = (enabled) => core.setKeepLogin(enabled);
export const signOut = () => core.signOut();
export const getBackup = (signal) => core.getBackup(signal);
export const listBackups = (signal) => core.listBackups(signal);
export const restoreBackups = (articleIds, signal) => core.restoreBackups(articleIds, signal);
export const disableBackup = (deleteServer, signal) => core.disableBackup(deleteServer, signal);
export const getTransfer = (signal) => core.getTransfer(signal);
export const uploadTransfer = (code, signal) => core.uploadTransfer(code, signal);
export const downloadTransfer = (code, signal) => core.downloadTransfer(code, signal);
export const deleteTransfer = (signal) => core.deleteTransfer(signal);
export const getBackupKey = (signal) => core.getBackupKey(signal);
export const getDiagnostics = (signal) => core.getDiagnostics(signal);
export const getSettings = (signal) => core.getSettings(signal);
export const saveSettings = (patch, signal) => core.saveSettings(patch, signal);
export const modelStatus = (signal) => core.models(signal);
export const installModels = (modelId, signal) => core.installModels({ modelId }, signal);
export const cancelModelInstall = (signal) => core.cancelModelInstall(signal);

const clean = (values) => [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];

/** 제목 후보(최대 3) — kind=metadata, requested=headline */
export async function suggestHeadlines(body, currentHeadline = "") {
  const d = await core.assist({ kind: "metadata", requested: "headline", body: textWithoutPhotos(body), current_headline: currentHeadline });
  const values = (d.headline_candidates || []).map((x) => (typeof x === "string" ? x : x.headline || x.title || x.text));
  return clean(values.length ? values : [d.headline]);
}

/** 부제 후보 — 원격 AI 는 subtitle_candidates, 로컬 모델 경로는 subtitle 한 개.
 *  동아일보 부제는 2~4줄이므로 줄바꿈을 그대로 둔다(부제 칸·미리보기가 줄 단위로 보여 준다). */
export async function suggestSubtitles(body, currentHeadline = "") {
  const d = await core.assist({ kind: "metadata", requested: "subheadline", body: textWithoutPhotos(body), current_headline: currentHeadline });
  return clean([d.subtitle, ...(d.subtitle_candidates || [])].map((v) =>
    String(v || "").split(/\n+/).map((line) => line.trim()).filter(Boolean).join("\n")));
}

/** 기사에 맞는 사진 검색어(영어 3개) */
export async function photoKeywords(body, card) {
  return clean((await core.assist({ kind: "photo_keywords", body: textWithoutPhotos(body), ...(card ? {card} : {}) })).keywords || []);
}

/** 한글 사진 검색어 → Unsplash 에서 잘 찾히는 영어 검색어(영어·숫자만이면 그대로) */
export async function photoSearchQuery(query) {
  const q = String(query || "").trim();
  if (!/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(q)) return q;
  const d = await core.assist({ kind: "photo_query", body: q });
  return String(d.query || "").trim() || q;
}

/** Unsplash 검색 — 한 페이지 3장 */
export const searchPhotos = (query, page = 1) => core.searchPhotos(query, page);

/** Unsplash 사진 원본을 코어로 받아 data URL 로(코어가 다운로드 집계도 한다 — Unsplash 가이드라인) */
export async function unsplashPhotoData(photo) {
  return readDataUrl(await core.photoBytes(photo.id));
}

/** 동아일보 DB(포토파노라마) 사진 검색 — 검색어(제목·설명)로 거르고 정렬(all 전체 | latest 최신순 | oldest 오래된순), 3장씩 */
export const searchDongaPhotos = (query, sort = "all", page = 1) => core.searchDongaPhotos(query, sort, page);

/** 고른 동아일보 DB 사진 → data URL(편집기·본문에 넣기용) */
export async function dongaPhotoData(photo) {
  return readDataUrl(await core.dongaPhotoBytes(photo.id));
}

/** 편집 화면의 원본·편집본 다운로드 집계(Unsplash 가이드라인) */
export const trackPhotoDownload = (unsplashId) => core.trackPhoto(unsplashId);

/** 고른 사진을 코어로 받아(다운로드 기록 포함) 기사 사진 항목으로 만든다 */
export async function importPhoto(photo) {
  const blob = await core.photoBytes(photo.id);
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return {
    id: `unsplash-${photo.id}`,
    url,
    caption: photo.alt_description || photo.description || "",
    source: `${photo.user?.name || "Unsplash"} / Unsplash`,
    provider: "Unsplash",
    sourceUrl: photo.links?.html ? `${photo.links.html}?utm_source=article_workspace&utm_medium=referral` : "",
    unsplashId: photo.id,
    ratio: "16:9",
  };
}

const readDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

/** 인터뷰 녹음 파일 전사 — 파일을 data URL 로 읽어 코어로 보낸다(25MB 이하) */
export async function transcribeAudio(file) {
  return core.transcribe(file.name, file.type || "application/octet-stream", await readDataUrl(file));
}
export const listTranscripts = (signal) => core.listTranscripts(signal);
export async function loadTranscript(id, signal) {
  const [transcript, audio] = await Promise.all([core.getTranscript(id, signal), core.transcriptAudio(id, signal)]);
  return { ...transcript, audioUrl: URL.createObjectURL(audio) };
}
export const publishCms = (article, signal) => core.publishCms(article, signal);
export const getTransferFile = (signal) => core.getTransferFile(signal);
export const makeTransferFile = (code, signal) => core.makeTransferFile(code, signal);
export const deleteTransferFile = (signal) => core.deleteTransferFile(signal);
export const exportVault = (password, signal) => core.exportVault(password, signal);
export const restoreVault = (password, data, signal) => core.restoreVault(password, data, signal);

/** 취재자료 등록 — 코어가 텍스트를 뽑고 원본·텍스트를 암호화 저장소에 보관한다(30MB 이하).
 *  → 기사 sources 항목 {id, name, format, size, chars, path, addedAt, text} */
export async function registerSource(file) {
  const d = await core.createSource(file.name, await readDataUrl(file));
  return {
    id: d.sourceId,
    name: file.name,
    format: d.format,
    size: file.size,
    chars: d.chars,
    path: d.path,
    addedAt: new Date().toLocaleString("sv-SE", { hour12: false }).slice(0, 16),
    text: d.text,
    indexError: d.indexError || "",
  };
}

/** 취재자료 원본을 기본 프로그램(PDF 뷰어·한글 등)으로 연다 */
export const openSourceFile = (sourceId) => core.openSource(sourceId);

/** 앱 안 원본 보기: PDF 는 Blob URL, HWP·HWPX 는 HTML(@ssabrojs/hwpxjs, MIT — 처음 쓸 때만 불러온다).
 *  → { kind: "pdf", url } | { kind: "html", html } */
export async function sourcePreview(source) {
  const blob = await core.sourceBytes(source.id);
  if (source.format === "pdf") return { kind: "pdf", url: URL.createObjectURL(new Blob([blob], { type: "application/pdf" })) };
  const { HwpxReader, hwpToHwpx } = await import("@ssabrojs/hwpxjs");
  let bytes = new Uint8Array(await blob.arrayBuffer());
  if (source.format === "hwp") bytes = await hwpToHwpx(bytes);
  const reader = new HwpxReader();
  await reader.loadFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const style = "<meta charset='utf-8'><style>body{font-family:'Malgun Gothic',sans-serif;padding:24px 32px;line-height:1.6}" +
    "table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #bbb;padding:4px 8px;vertical-align:top}img{max-width:100%}</style>";
  return { kind: "html", html: style + (await reader.extractHtml({ embedImages: true })) };
}

/** 개발 실행(파이썬)인지 — 청크 보기 같은 개발용 화면만 켠다 */
export const isDevMode = async () => Boolean((await core.status()).dev);

const nonSpaceCount = (text, upTo) => text.slice(0, upTo).replace(/\s/g, "").length;
/** text 에서 공백 아닌 글자를 k 개 지난 위치 — 시작 위치는 다음 글자 앞(공백 건너뜀), 끝 위치(end)는 k 번째 글자 바로 뒤 */
function respacedAt(text, k, end) {
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (/\s/.test(text[i])) continue;
    if (!end && seen === k) return i;
    seen += 1;
    if (end && seen === k) return i + 1;
  }
  return text.length;
}

/** 팩트체크와 똑같이 자료를 청크로 나눈다(공백 정리 → 의미 청킹) → [{text, kind, field}] */
export async function sourceChunks(text) {
  return (await core.semanticParse((text || "").replace(/\s+/g, " ").trim())).units || [];
}

const VERDICT = { SUPPORTED: "verified", CONFLICT: "conflict" };

/** 본문 → 문장 [{raw, start, end, text(공백 정리), map(정리된 글자 → 원문 위치)}].
 *  마침표·물음표·느낌표에서 나눈다. PDF 에서 붙여 넣은 글은 문장 중간에 줄바꿈이 있으므로 줄바꿈은 공백으로 보고,
 *  빈 줄은 제목줄(줄바꿈 없는 40자 미만 한 줄) 뒤에서만 문장을 끊는다. 10자 미만 조각은 검증하지 않는다. */
export function splitSentences(content) {
  const out = [];
  const push = (from, to) => {
    while (from < to && /\s/.test(content[from])) from += 1;
    while (to > from && /\s/.test(content[to - 1])) to -= 1;
    if (to - from < 10) return;
    // 출처·사진·기자 표기 줄은 사실 주장이 아니다(예: '출처 : 주주경제신문(https://…)', '홍길동 기자 hong@…')
    const piece = content.slice(from, to);
    if (/^\s*(출처|사진|자료|그래픽|영상|제공)\s*[:：]/.test(piece) || /^[^.?!]{0,30}기자\s*[\w.+-]*@[\w.-]+$/.test(piece)) return;
    let text = "";
    const map = [];
    // 채팅에서 복사한 굵게/취소선 표시는 화면 원문에 남기되 판정 문장에서는 제외한다.
    const decorations = new Set();
    for (const m of piece.matchAll(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/g)) {
      for (let j = 0; j < m[1].length; j += 1) {
        decorations.add(from + m.index + j);
        decorations.add(from + m.index + m[0].length - m[1].length + j);
      }
    }
    for (let i = from; i < to; i += 1) {
      if (decorations.has(i)) continue;
      if (/\s/.test(content[i])) {
        if (text.endsWith(" ")) continue;
        text += " ";
      } else text += content[i];
      map.push(i);
    }
    out.push({ raw: content.slice(from, to), start: from, end: to, text, map });
  };
  const boundary = /([.?!](?:["'”’)\]]|\*{1,2}|_{1,2}|~~)*)(?=\s|$)|\n[ \t]*\n/g;
  let start = 0;
  let m;
  while ((m = boundary.exec(content || ""))) {
    if (!m[1]) { // 빈 줄: 앞 덩어리가 줄바꿈 없는 짧은 한 줄(제목줄)일 때만 끊는다 — PDF 줄바꿈 중간의 빈 줄은 문장이 이어진다
      const before = content.slice(start, m.index).trim();
      if (before.includes("\n") || before.length >= 40) continue;
    }
    const end = m[1] ? m.index + m[1].length : m.index;
    push(start, end);
    start = end;
  }
  push(start, (content || "").length);
  return out;
}

/** 기사 문장을 등록 자료(텍스트)에 비춰 팩트체크 → 팩트체크 서랍 카드 목록. files: [{ id, name, text }]
 *  cache(Map: 공백 정리된 문장 → 코어 결과)를 주면 **이미 검증한 문장은 다시 보내지 않는다** — 새로 쓰거나 고친 문장만.
 *  자료가 바뀌면 cache 를 비워야 한다(useFactCheck). */
export async function factcheckArticle(content, files, cache = new Map(), snapshotId) {
  // 문장마다 본문 위치를 기억해 두면 결과를 원고에 하이라이트할 수 있다(위치는 매번 새로 — 앞 문장이 바뀌면 밀린다)
  const nodes = splitSentences(content).slice(0, 200).map((s, i) => ({ ...s, id: `s${i + 1}` }));
  if (!nodes.length) throw Error("검증할 본문 문장이 없어요. 본문을 먼저 작성해 주세요.");
  // 띄어쓰기만 바뀐 문장은 이전 판정을 그대로 쓴다(공백을 모두 뺀 글자가 같으면 같은 문장). 위치 정보(claim)는 달라져 문장 전체로 표시된다
  const squash = (t) => t.replace(/\s+/g, "");
  const bySquash = new Map([...cache].map(([t, r]) => [squash(t), r]));
  for (const n of nodes) if (!cache.has(n.text) && bySquash.has(squash(n.text))) cache.set(n.text, bySquash.get(squash(n.text)));
  const todo = [...new Map(nodes.filter((n) => !cache.has(n.text)).map((n) => [n.text, n])).values()];
  if (todo.length) {
    const materials = files.map((f) => ({ id: f.id, title: f.name, content: f.text }));
    const d = await core.runFactcheck(todo.map((n) => ({ id: n.id, type: "TEXT", text: n.text })), materials, snapshotId);
    const byId = Object.fromEntries(todo.map((n) => [n.id, n]));
    for (const r of d.results || []) if (byId[r.node_id]) cache.set(byId[r.node_id].text, r);
  }
  return nodes.filter((n) => cache.has(n.text)).map((node) => {
    const r = cache.get(node.text);
    if (r.external) return externalItem(node, r, files);
    // 틀린 값 위치(코어 conflict_spans/focus_spans, 공백 정리된 문장 기준) → 원문 위치로 되돌린다
    // 띄어쓰기만 바뀐 문장(r.claim 과 글자는 같고 공백만 다름)은 공백 아닌 글자 수로 위치를 옮겨 온다
    const respaced = node.text !== r.claim && r.claim && squash(r.claim) === squash(node.text);
    const moved = (spans) => spans.map((x) => ({ ...x, claim_start: respacedAt(node.text, nonSpaceCount(r.claim, x.claim_start), false), claim_end: respacedAt(node.text, nonSpaceCount(r.claim, x.claim_end), true) }));
    const found = r.status !== "SUPPORTED" && (node.text === r.claim || respaced) ? (r.conflict_spans?.length ? r.conflict_spans : r.focus_spans || []) : [];
    const pairs = (respaced ? moved(found) : found)
      .filter((x) => x.claim_end > x.claim_start && x.claim_end <= node.map.length);
    const spans = pairs.map((x) => ({ start: node.map[x.claim_start], end: node.map[x.claim_end - 1] + 1 }));
    // 같은 짝의 근거 쪽 위치(근거 발췌 quote 기준) — 서랍 카드에서 본문 하이라이트와 짝을 맞춰 표시
    const quote = r.evidence?.text || "";
    const quoteSpans = (r.status === "SUPPORTED" ? r.support_spans || [] : pairs)
      .filter((x) => x.evidence_end > x.evidence_start && x.evidence_end <= quote.length)
      .map((x) => ({ start: x.evidence_start, end: x.evidence_end }));
    return {
      id: node.id,
      key: node.text,
      claimText: node.raw,
      start: node.start,
      spans,
      quoteSpans,
      verdict: r.status, // SUPPORTED | CONFLICT | EVIDENCE_GAP | REVIEW …
      status: VERDICT[r.status] || "unverified",
      matchRate: r.confidence == null ? null : Math.round(r.confidence * 100),
      sourceDoc: r.evidence?.material_title || "",
      page: "",
      quote,
      details: claimDetails(node.raw, quote, files.find((f) => f.id === r.evidence?.material_id || f.name === r.evidence?.material_title)),
      comment: r.reason || "",
      suggestedFix: null,
      needsRecheck: needsRecheck(r),
    };
  });
}

/** 외부 재판정 대상: 로컬 판정기가 확정 못 한 문장 — 검토 필요, 그리고 관련 근거(같은 수)가 있는데 '근거 부족'인 것 */
export const needsRecheck = (r) =>
  !r.external && (["REVIEW", "EXTERNAL_REQUIRED"].includes(r.status) || (r.status === "EVIDENCE_GAP" && r.related_evidence));

/** 재판정에 보낼 근거: 검색 상위 본문 청크 3개(자료 정보 줄 제외) */
export const recheckEvidence = (r) => {
  const top = (r.evidence_candidates || []).filter((c) => c.kind !== "metadata").slice(0, 3);
  return top.length ? top : r.evidence ? [r.evidence] : [];
};

/** 외부 재판정(임시·OpenAI) — items: [{id, claim, evidence:[str], titles:[str]}] → 결과 목록 */
export async function externalRecheck(items) {
  return (await core.factcheckExternal(items)).results || [];
}

/** 이미 받아 둔 외부 재판정만 조회(저장된 것만 — OpenAI 호출·비용 없음). 원고를 다시 열 때 AI 판정을 화면에 복원한다.
 *  items 는 externalRecheck 와 똑같은 형식이어야 저장된 기록을 찾는다 */
export async function cachedExternalRecheck(items) {
  return (await core.factcheckExternal(items, undefined, { cachedOnly: true })).results || [];
}

const EXTERNAL_VERDICT = { SUPPORTED: "SUPPORTED", CONFLICT: "CONFLICT", NOT_ENOUGH_INFO: "EVIDENCE_GAP" };

/** 외부 판정 결과 → 카드·하이라이트. wrong_text·evidence_text 는 원문에서 그대로 찾을 수 있을 때만 위치로 쓴다 */
function externalItem(node, r, files) {
  const x = r.external;
  const verdict = EXTERNAL_VERDICT[x.verdict] || "REVIEW";
  const evidence = recheckEvidence(r);
  const source = evidence.find((e) => x.evidence_text && (e.text || "").includes(x.evidence_text)) || evidence[0] || {};
  const quote = source.text || "";
  const at = x.wrong_text ? node.text.indexOf(x.wrong_text) : -1;
  const q = x.evidence_text ? quote.indexOf(x.evidence_text) : -1;
  return {
    id: node.id,
    key: node.text,
    claimText: node.raw,
    start: node.start,
    spans: at >= 0 ? [{ start: node.map[at], end: node.map[at + x.wrong_text.length - 1] + 1 }] : [],
    quoteSpans: q >= 0 ? [{ start: q, end: q + x.evidence_text.length }] : [],
    verdict,
    status: VERDICT[verdict] || "unverified",
    matchRate: null,
    sourceDoc: source.material_title || "",
    page: "",
    quote,
    details: claimDetails(node.raw, quote, files.find((f) => f.id === source.material_id || f.name === source.material_title)),
    comment: `AI 재판정(OpenAI): ${x.reason}`,
    suggestedFix: null,
    judgedBy: "external",
    needsRecheck: false,
  };
}

/** 기사 흐름 요약 3~5문장 */
export async function flowSummary(body) {
  return clean(((await core.assist({ kind: "flow", body })).paragraphs || []).map((v) => v.replace(/^\s*\d+[.)]\s*/, "")));
}

// 사진은 저장할 때마다 원본(base64)을 보내지 않는다 — 처음 한 번 코어에 올리고(registerMediaAsset) 받은
// "media:<id>" 참조만 원고에 싣는다. 화면 상태의 사진(url·original)은 그대로 data URL 이라 컴포넌트는 바뀌지 않는다.
const mediaRefs = new Map(); // data URL → "media:<id>"
const MEDIA_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]); // 코어가 자산으로 받는 형식

async function toMediaRef(value) {
  if (typeof value !== "string" || !value.startsWith("data:")) return value;
  const known = mediaRefs.get(value);
  if (known) return known;
  const mime = /^data:([^;,]+);base64,/.exec(value)?.[1];
  if (!MEDIA_MIME.has(mime)) return value; // 그 밖의 형식은 예전처럼 원고에 실어 보낸다(코어가 저장소로 옮긴다)
  try {
    const { object_ref: ref } = await core.registerMediaAsset({ kind: "image", mime_type: mime, data: value });
    mediaRefs.set(value, ref);
    return ref;
  } catch {
    return value; // 등록이 안 되면 이번 저장은 예전 방식으로
  }
}

/** "media:<id>" → data URL(코어에서 바이트를 받아). 같은 참조는 한 번만 받는다 */
async function fromMediaRef(value, loaded) {
  const id = /^media:([a-f0-9]{32})$/.exec(value || "")?.[1];
  if (!id) return value;
  if (!loaded.has(id)) loaded.set(id, core.mediaBytes(id).then(readDataUrl));
  try {
    const url = await loaded.get(id);
    mediaRefs.set(url, value);
    return url;
  } catch {
    return ""; // 사진을 못 읽으면 비워 둔다(원고 안의 참조는 그대로 남는다)
  }
}

/** 원고(content) → 발행·변환용 HTML. 문단은 빈 줄, 줄바꿈은 <br>, 사진 자리 줄은 v30 과 같은 <figure data-photo-id> */
export function bodyHtmlOf(content, photos) {
  const out = [];
  let para = [];
  const flush = () => {
    if (para.some((l) => l.trim())) out.push(`<p>${para.map((l) => escapeHtml(l.trim())).join("<br>")}</p>`);
    para = [];
  };
  for (const line of content.split("\n")) {
    const photo = photoOfLine(line, photos);
    if (photo) {
      flush();
      out.push(`<figure data-photo-id="${escapeHtml(photo.id)}"><figcaption>${escapeHtml(captionText(photo))}</figcaption></figure>`);
    } else if (!line.trim()) flush();
    else para.push(line);
  }
  flush();
  return out.join("");
}

/** 원고 저장. 사진은 코어의 data/original 필드로 보내 암호화 media 저장소에서 중복 없이 보관한다. */
/** 원고 저장 → articleId. kind: "auto"(자동 임시 저장 — 최근 작업본 한 칸 덮어쓰기, 이력·보관소에 안 보임) | "manual"(저장 버튼 — 새 버전) */
export async function saveDraft(article, articleId, expectedRevisionNo, replaceLatest = false, kind = "auto") {
  return (await saveDraftResult(article, articleId, { expectedRevisionNo, replaceLatest, kind })).articleId;
}

/** saveDraft 와 같지만 코어 응답 전체 { articleId, revisionNo, savedAt, firstSavedAt(처음 수동 저장 시각), ... } 를 돌려준다 */
export async function saveDraftResult(article, articleId, { expectedRevisionNo, replaceLatest = false, kind = "auto" } = {}) {
  return core.saveArticle(await draftOf(article, articleId), expectedRevisionNo, replaceLatest, undefined, kind);
}

/** 송고본 기록 — 코어가 수동 저장과 송고본 갱신을 한 번에 한다 → { articleId, published, republished, savedAt } */
export async function publishDraft(article, articleId) {
  return core.publishArticle(await draftOf(article, articleId));
}

async function draftOf(article, articleId) {
  const bodyHtml = bodyHtmlOf(article.content || "", article.photos || []);
  const photos = await Promise.all((article.photos || []).map(async ({ url, ...meta }) => ({
    ...meta,
    data: await toMediaRef(url?.startsWith("data:") ? url : meta.data),
    original: await toMediaRef(meta.original),
    url: url?.startsWith("data:") ? "" : url,
  })));
  return {
    ...(articleId ? { articleId } : {}),
    title: article.title || "",
    subtitle: article.subtitle || "",
    url: typeof article.url === "string" ? article.url : "", // DB 원문 링크: 수집용 입력이 아닌 출처
    bodyHtml,
    photos,
    content: article.content || "", // 다시 열 때 그대로 복원(bodyHtml 은 발행·변환용)
    category: article.category || "",
    subcategory: article.subcategory || "",
    linkedSources: article.linkedSources || [],
      linkedInterviews: article.linkedInterviews || [],
    sources: (article.sources || []).map(({ text: _text, ...meta }) => meta), // 자료 본문은 코어 sources 테이블에서 다시 붙인다
    status: article.status || "",
    cmsReceipt: article.cmsReceipt || null,
    createdAt: article.createdAt || "",
    platformDrafts: article.platformDrafts || {},
    cardNews: article.cardNews || null,
    platformGeneration: article.platformGeneration || {},
  };
}

/** 코어의 원고(draft) → 화면의 기사 객체. content 가 없는 옛 원고는 bodyHtml 에서 글자만 */
function articleFromDraft(draft, empty) {
  if (draft.content != null && typeof draft.content !== "string" && typeof draft.bodyHtml !== "string") {
    throw Error("기사 본문 형식을 읽을 수 없습니다. 기사 편집 화면에서 확인해 주세요.");
  }
  let content = draft.content;
  if (typeof content !== "string") {
    // 기존 HTML → 편집 본문 변환을 재사용한다. 사진 설명·삭제된 글을 기사 내용으로 보내지 않는다.
    const document = new DOMParser().parseFromString((draft.bodyHtml || "").replace(/<br\s*\/?>/g, "\n").replace(/<\/p>/g, "\n\n"), "text/html");
    document.querySelectorAll('s,del').forEach(element => element.remove());
    document.querySelectorAll('figure').forEach(element => {
      const id=element.getAttribute('data-photo-id');
      if(id && (draft.photos || []).some(photo=>photo.id===id)) element.replaceWith(document.createTextNode(`\n[사진:${id}]\n`));
      else element.remove();
    });
    content=document.body.textContent.trim();
  }
  return {
    ...empty,
    articleId: draft.articleId,
    revisionNo: Number.isInteger(draft.revisionNo) ? draft.revisionNo : null,
    title: draft.title || "",
    subtitle: draft.subtitle || "",
    url: typeof draft.url === "string" ? draft.url : "",
    content,
    category: draft.category || "",
    subcategory: draft.subcategory || "",
    status: draft.status || empty.status,
    cmsReceipt: draft.cmsReceipt || null,
    createdAt: draft.createdAt || empty.createdAt,
    // 코어 저장 시각(UTC ISO) → 이 PC 시간대 "YYYY-MM-DD HH:mm"(새 기사의 createdAt·updatedAt 과 같은 모양)
    updatedAt: localStamp(draft.savedAt) || empty.updatedAt,
    linkedSources: draft.linkedSources || [],
    linkedInterviews: draft.linkedInterviews || [],
    sources: draft.sources || [],
    photos: (draft.photos || []).map((photo) => ({ ...photo, url: photo.data || photo.url || "" })),
    platformDrafts: draft.platformDrafts || {},
    cardNews: draft.cardNews && !Array.isArray(draft.cardNews) ? draft.cardNews : null,
    platformGeneration: draft.platformGeneration || {},
  };
}

/** 앱을 열 때 이어서 작업할 가장 최근 원고 → 기사 객체(없으면 null). 사진은 참조로 받아 바이트를 따로(병렬) 받는다 */
export async function loadLatestArticle(empty) {
  return articleFromResponse(await core.latestArticle(), empty);
}

/** 보관소 '수정' — 마지막 수동 저장본(version "saved") 또는 발행본("published")을 편집기용 기사 객체로 */
export async function loadArticle(articleId, version, empty) {
  const article = await articleFromResponse(await core.getArticle(articleId, version), empty);
  return article && { ...article, openedFrom: version };
}

/** 보관소 목록 → [{ articleId, title, subtitle, excerpt, state, published, updatedAt, ... }] */
export async function listArchive(signal) {
  const { articles } = await core.listArticles(signal);
  return (articles || []).map((a) => ({
    articleId: a.article_id, title: a.title, subtitle: a.subtitle, excerpt: a.excerpt || "", state: a.state || "draft",
    published: a.published || null, updatedAt: a.updated_at, createdAt: a.created_at, photoCount: a.photo_count || 0,
    unsavedChanges: !!a.unsaved_changes, revisionCount: a.revision_count || 0,
  }));
}

async function articleFromResponse(response, empty) {
  if (!response?.draft) return null;
  return hydrateArticle(response, empty);
}

/** 보관소·데스크에서 고른 기사(그 기사의 최신 원고)를 편집기용 기사 객체로 */
export async function loadStoredArticle(articleId, empty, signal) {
  const response = await core.getArticle(articleId, undefined, signal);
  if (!response?.draft) throw Error("기사가 삭제되었거나 조회되지 않습니다.");
  const article = await hydrateArticle(response, empty);
  if (signal?.aborted) throw new DOMException("기사 조회가 취소됐습니다.", "AbortError");
  return article;
}

async function hydrateArticle({ draft, revisionKind, lastManual, published, editedAfterPublish, firstSavedAt }, empty) {
  const loaded = new Map();
  const photos = await Promise.all((draft.photos || []).map(async (photo) => ({
    ...photo,
    data: await fromMediaRef(photo.data, loaded),
    original: await fromMediaRef(photo.original, loaded),
  })));
  // 아래 값들은 화면 전용(저장되지 않음): 마지막 수동 저장본(보관소 '원고'), 그 뒤 임시 저장본인지, 송고본 정보, 송고 뒤 고쳤는지
  return { ...articleFromDraft({ ...draft, photos }, empty), lastManual: lastManual || null, unsavedOnOpen: revisionKind === "auto",
    published: published || null, editedAfterPublish: !!editedAfterPublish, firstSavedAt: firstSavedAt || null };
}

/** 원고의 저장 이력(최신이 위) + 정리할 수 있는 옛 자동 저장 이력 수(수동 저장 도입 전에는 고칠 때마다 이력이 남았다) */
export async function listRevisionsWithLegacy(articleId) {
  const { revisions, legacyCount } = await core.listRevisions(articleId);
  return { revisions: revisions || [], legacyCount: legacyCount || 0 };
}

/** 옛 자동 저장 이력 지우기 → 지운 개수 */
export async function pruneLegacyRevisions(articleId) {
  return (await core.pruneLegacyRevisions(articleId)).deleted || 0;
}

/** 저장 이력 한 건의 미리보기(읽기 전용) */
export const previewRevision = (articleId, revisionNo) => core.getRevision(articleId, revisionNo);

/** 옛 저장본으로 복원 → 화면에 올릴 기사 객체. 이력은 지워지지 않고 복원본이 새 최신 저장본이 된다 */
export async function restoreRevision(articleId, revisionNo, empty) {
  const result = await core.restoreRevision(articleId, revisionNo);
  return { article: articleFromDraft(result.draft, empty), revisionNo: result.revisionNo };
}

/** 저장된 취재자료 → 자료 검색 창 항목 {id, title, category(형식), date, snippet, content(쓰는 기사)} */
export async function listStoredSources(signal) {
  const { sources } = await core.listSources(signal);
  return (sources || []).map((s) => {
    const used = (s.usedBy || []).map((u) => u.title || "제목 없는 기사");
    return {
      id: s.id,
      title: s.name,
      category: (s.format || "기타").toUpperCase(),
      date: (s.createdAt || "").slice(0, 10),
      snippet: `${(s.format || "").toUpperCase()} · ${Number(s.chars || 0).toLocaleString("ko-KR")}자`,
      content: used.length ? `이 자료를 쓰는 기사: ${used.join(", ")}` : "아직 이 자료를 쓰는 기사가 없습니다.",
    };
  });
}

function localStamp(iso) {
  const d = new Date(iso || "");
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("sv-SE", { hour12: false }).slice(0, 16);
}
