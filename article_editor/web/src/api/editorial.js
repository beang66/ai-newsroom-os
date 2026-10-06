// 편집 보조 기능 — 옛 시험용 UI(article-workspace, 기능 담당자 제작)가 쓰던 코어 기능을 새 UI 용으로 옮긴 얇은 층.
// 응답 모양 차이(원격 AI / 로컬 모델)를 여기서 흡수해 컴포넌트는 문자열 목록만 받는다.
import { core } from "./core.js";

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

/** 인터뷰 녹음 파일 전사 — 파일을 data URL 로 읽어 코어로 보낸다(25MB 이하) */
export async function transcribeAudio(file) {
  return core.transcribe(file.name, await readDataUrl(file));
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

/** 팩트체크와 똑같이 자료를 청크로 나눈다(공백 정리 → 의미 청킹) → [{text, kind, field}] */
export async function sourceChunks(text) {
  return (await core.semanticParse((text || "").replace(/\s+/g, " ").trim())).units || [];
}

/** 기사 본문을 같은 청킹 모델로 나눠 원문 위치로 → [{start, end, kind, field}] (개발 모드 밑줄용).
 *  청크 글자는 공백 정리본 기준이라, 정리본 → 원문 위치 표로 되돌린다. 원문에서 못 찾은 청크는 건너뛴다 */
export async function bodyChunks(content) {
  let clean = "";
  const map = [];
  for (let i = 0; i < (content || "").length; i += 1) {
    if (/\s/.test(content[i])) {
      if (!clean || clean.endsWith(" ")) continue;
      clean += " ";
    } else clean += content[i];
    map.push(i);
  }
  const units = await sourceChunks(content);
  const out = [];
  let cursor = 0;
  for (const u of units) {
    const at = clean.indexOf(u.text, cursor);
    if (at < 0 || !u.text) continue;
    out.push({ start: map[at], end: map[at + u.text.length - 1] + 1, kind: u.kind, field: u.field });
    cursor = at + u.text.length;
  }
  return out;
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
    for (let i = from; i < to; i += 1) {
      if (/\s/.test(content[i])) {
        if (text.endsWith(" ")) continue;
        text += " ";
      } else text += content[i];
      map.push(i);
    }
    out.push({ raw: content.slice(from, to), start: from, end: to, text, map });
  };
  const boundary = /([.?!]["'”’)\]]*)(?=\s|$)|\n[ \t]*\n/g;
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
  const todo = [...new Map(nodes.filter((n) => !cache.has(n.text)).map((n) => [n.text, n])).values()];
  if (todo.length) {
    const materials = files.map((f) => ({ id: f.id, title: f.name, content: f.text }));
    const d = await core.factcheckRun(todo.map((n) => ({ id: n.id, type: "TEXT", text: n.text })), materials);
    const byId = Object.fromEntries(todo.map((n) => [n.id, n]));
    for (const r of d.results || []) if (byId[r.node_id]) cache.set(byId[r.node_id].text, r);
  }
  return nodes.filter((n) => cache.has(n.text)).map((node) => {
    const r = cache.get(node.text);
    // 틀린 값 위치(코어 conflict_spans/focus_spans, 공백 정리된 문장 기준) → 원문 위치로 되돌린다
    const pairs = (node.text === r.claim ? (r.conflict_spans?.length ? r.conflict_spans : r.focus_spans || []) : [])
      .filter((x) => x.claim_end > x.claim_start && x.claim_end <= node.map.length);
    const spans = pairs.map((x) => ({ start: node.map[x.claim_start], end: node.map[x.claim_end - 1] + 1 }));
    // 같은 짝의 근거 쪽 위치(근거 발췌 quote 기준) — 서랍 카드에서 본문 하이라이트와 짝을 맞춰 표시
    const quote = r.evidence?.text || "";
    const quoteSpans = pairs
      .filter((x) => x.evidence_end > x.evidence_start && x.evidence_end <= quote.length)
      .map((x) => ({ start: x.evidence_start, end: x.evidence_end }));
    return {
      id: node.id,
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
      comment: r.reason || "",
      suggestedFix: null,
    };
  });
}

/** 기사 흐름 요약 3~5문장 */
export async function flowSummary(body) {
  return clean(((await core.assist({ kind: "flow", body })).paragraphs || []).map((v) => v.replace(/^\s*\d+[.)]\s*/, "")));
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** 원고 디스크 저장(내 문서/AI Newsroom/articles). 사진 원본(data URL)은 크기 때문에 빼고 출처 정보만 남긴다 */
export async function saveDraft(article, articleId) {
  const bodyHtml = (article.content || "")
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const photos = (article.photos || []).map(({ url, ...meta }) => ({ ...meta, url: url?.startsWith("data:") ? "" : url }));
  const d = await core.saveArticle({
    ...(articleId ? { articleId } : {}),
    title: article.title || "",
    subtitle: article.subtitle || "",
    bodyHtml,
    photos,
    content: article.content || "", // 다시 열 때 그대로 복원(bodyHtml 은 발행·변환용)
    linkedSources: article.linkedSources || [],
    sources: (article.sources || []).map(({ text, ...meta }) => meta), // 본문 텍스트는 sources/<id>/text.txt 에 있다
    status: article.status || "",
    createdAt: article.createdAt || "",
  });
  return d.articleId;
}

/** 앱을 열 때 이어서 작업할 가장 최근 원고 → 기사 객체(없으면 null). content 가 없는 옛 원고는 bodyHtml 에서 글자만 */
export async function loadLatestArticle(empty) {
  const { draft } = await core.latestArticle();
  if (!draft) return null;
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
    photos: draft.photos || [],
  };
}
