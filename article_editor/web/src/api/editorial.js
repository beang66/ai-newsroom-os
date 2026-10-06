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

const VERDICT = { SUPPORTED: "verified", CONFLICT: "conflict" };

/** 기사 문장을 등록 자료(텍스트)에 비춰 팩트체크 → 팩트체크 서랍 카드 목록
 *  files: [{ id, name, text }] */
export async function factcheckArticle(content, files) {
  const nodes = (content || "")
    .split(/\n+/)
    .flatMap((p) => p.split(/(?<=[.?!])\s+/))
    .map((t) => t.trim())
    .filter((t) => t.length >= 10)
    .slice(0, 200)
    .map((text, i) => ({ id: `s${i + 1}`, type: "TEXT", text }));
  if (!nodes.length) throw Error("검증할 본문 문장이 없어요. 본문을 먼저 작성해 주세요.");
  const materials = files.map((f) => ({ id: f.id, title: f.name, content: f.text }));
  const d = await core.factcheckRun(nodes, materials);
  return (d.results || []).map((r) => ({
    id: r.node_id,
    claimText: r.claim,
    verdict: r.status, // SUPPORTED | CONFLICT | EVIDENCE_GAP | REVIEW …
    status: VERDICT[r.status] || "unverified",
    matchRate: r.confidence == null ? null : Math.round(r.confidence * 100),
    sourceDoc: r.evidence?.material_title || "",
    page: "",
    quote: r.evidence?.text || "",
    comment: r.reason || "",
    suggestedFix: null,
  }));
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
    sources: (article.sources || []).map(({ text, ...meta }) => meta), // 본문 텍스트는 sources/<id>/text.txt 에 있다
    status: article.status || "",
  });
  return d.articleId;
}
