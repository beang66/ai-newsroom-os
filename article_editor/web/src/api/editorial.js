// 편집 보조 기능 — 옛 시험용 UI(article-workspace, 기능 담당자 제작)가 쓰던 코어 기능을 새 UI 용으로 옮긴 얇은 층.
// 응답 모양 차이(원격 AI / 로컬 모델)를 여기서 흡수해 컴포넌트는 문자열 목록만 받는다.
import { core } from "./core.js";
import { claimDetails } from "./claim-details.js";
import { createTranscriptModel } from "../models/transcriptModel.js";

// 로그인·설치 화면도 같은 코어 계약을 사용한다. 자격 증명은 요청 동안만 전달한다.
export const signIn = (email, password) => core.signIn(email, password);
export const signOut = () => core.signOut();
export const modelStatus = (signal) => core.models(signal);
export const installModels = (modelId, signal) => core.installModels({ modelId }, signal);
export const cancelModelInstall = (signal) => core.cancelModelInstall(signal);

const clean = (values) => [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];

/** 제목 후보(최대 3) — kind=metadata, requested=headline */
export async function suggestHeadlines(body, currentHeadline = "") {
  const d = await core.assist({ kind: "metadata", requested: "headline", body, current_headline: currentHeadline });
  const values = (d.headline_candidates || []).map((x) => (typeof x === "string" ? x : x.headline || x.title || x.text));
  return clean(values.length ? values : [d.headline]);
}

/** 부제 후보 — 원격 AI 는 subtitle_candidates, 로컬 모델 경로는 subtitle 한 개 */
export async function suggestSubtitles(body, currentHeadline = "") {
  const d = await core.assist({ kind: "metadata", requested: "subheadline", body, current_headline: currentHeadline });
  return clean([d.subtitle, ...(d.subtitle_candidates || [])].map((v) => String(v || "").replace(/\n+/g, " / ")));
}

/** 기사에 맞는 사진 검색어(영어 3개) */
export async function photoKeywords(body) {
  return clean((await core.assist({ kind: "photo_keywords", body })).keywords || []);
}

/** Unsplash 검색 — 한 페이지 3장 */
export const searchPhotos = (query, page = 1) => core.searchPhotos(query, page);

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

/** 인터뷰 녹음 파일 전사 — 파일을 data URL 로 읽어 코어로 보낸다(25MB 이하). CLOVA Diarization / Whisper 통합 */
export async function transcribeAudio(file) {
  const result = await core.transcribe(file.name, await readDataUrl(file));
  if (result && !result.transcript) {
    result.transcript = createTranscriptModel(result);
  }
  return result;
}

/** 취재자료 등록 — 코어가 텍스트를 뽑고 원본·텍스트를 내 문서\AI Newsroom\sources 에 보관한다(30MB 이하).
 *  → 기사 sources 항목 {id, name, format, size, chars, path, addedAt, text} */
export async function registerSource(file) {
  const d = await core.extractText(file.name, await readDataUrl(file));
  return {
    id: d.sourceId,
    name: file.name,
    format: d.format,
    size: file.size,
    chars: d.chars,
    path: d.path,
    addedAt: new Date().toLocaleString("sv-SE", { hour12: false }).slice(0, 16),
    text: d.text,
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
export async function factcheckArticle(content, files, cache = new Map()) {
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
    const d = await core.factcheckRun(todo.map((n) => ({ id: n.id, type: "TEXT", text: n.text })), materials);
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

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** 원고 저장. 사진은 코어의 data/original 필드로 보내 암호화 media 저장소에서 중복 없이 보관한다. */
export async function saveDraft(article, articleId) {
  const bodyHtml = (article.content || "")
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const photos = await Promise.all((article.photos || []).map(async ({ url, ...meta }) => ({
    ...meta,
    data: await toMediaRef(url?.startsWith("data:") ? url : meta.data),
    original: await toMediaRef(meta.original),
    url: url?.startsWith("data:") ? "" : url,
  })));
  const d = await core.saveArticle({
    ...(articleId ? { articleId } : {}),
    title: article.title || "",
    subtitle: article.subtitle || "",
    bodyHtml,
    photos,
    content: article.content || "", // 다시 열 때 그대로 복원(bodyHtml 은 발행·변환용)
    linkedSources: article.linkedSources || [],
    sources: (article.sources || []).map(({ text: _text, ...meta }) => meta), // 본문 텍스트는 sources/<id>/text.txt 에 있다
    status: article.status || "",
    createdAt: article.createdAt || "",
    platformDrafts: article.platformDrafts || {},
    cardNews: article.cardNews || null,
    platformGeneration: article.platformGeneration || {},
  });
  return d.articleId;
}

/** 코어의 원고(draft) → 화면의 기사 객체. content 가 없는 옛 원고는 bodyHtml 에서 글자만 */
function articleFromDraft(draft, empty) {
  const content = draft.content ?? new DOMParser()
    .parseFromString((draft.bodyHtml || "").replace(/<br\s*\/?>/g, "\n").replace(/<\/p>/g, "\n\n"), "text/html")
    .body.textContent.trim();
  return {
    ...empty,
    articleId: draft.articleId,
    title: draft.title || "",
    subtitle: draft.subtitle || "",
    content,
    status: draft.status || empty.status,
    createdAt: draft.createdAt || empty.createdAt,
    updatedAt: (draft.savedAt || "").replace("T", " ").slice(0, 16) || empty.updatedAt,
    linkedSources: draft.linkedSources || [],
    sources: draft.sources || [],
    photos: (draft.photos || []).map((photo) => ({ ...photo, url: photo.data || photo.url || "" })),
    platformDrafts: draft.platformDrafts || {},
    cardNews: draft.cardNews && !Array.isArray(draft.cardNews) ? draft.cardNews : null,
    platformGeneration: draft.platformGeneration || {},
  };
}

/** 앱을 열 때 이어서 작업할 가장 최근 원고 → 기사 객체(없으면 null). 사진은 참조로 받아 바이트를 따로(병렬) 받는다 */
export async function loadLatestArticle(empty) {
  const { draft } = await core.latestArticle();
  if (!draft) return null;
  const loaded = new Map();
  const photos = await Promise.all((draft.photos || []).map(async (photo) => ({
    ...photo,
    data: await fromMediaRef(photo.data, loaded),
    original: await fromMediaRef(photo.original, loaded),
  })));
  return articleFromDraft({ ...draft, photos }, empty);
}

/** 원고의 저장 이력(최신이 위) */
export async function listRevisions(articleId) {
  return (await core.listRevisions(articleId)).revisions || [];
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
