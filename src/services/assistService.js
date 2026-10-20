import { core } from "../api/core.js";
import { normalizeSubtitleCandidate } from "../lib/subtitleCandidates.js";

const unique = (values) => [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];

// 본문 HTML에서 태그를 걷어 Core에 글만 보낸다(사진 data URL 등이 요청을 키우지 않게).
function plainText(html) {
  return (html || "")
    .replace(/<\/(p|div|h[1-6]|li)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();
}

const assist = (payload) => core.assist(payload);

// Core 는 AI 요청을 동시에 3개까지만 받고 나머지는 429 로 돌려보낸다. 사진 창은 요청 3개를 한꺼번에 보내고,
// 개발 모드(StrictMode)에서는 창이 두 번 그려져 6개가 되므로 429 면 잠깐 기다렸다 다시 보낸다.
const assistWhenFree = async (payload) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await assist(payload);
    } catch (error) {
      if (error?.status !== 429 || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
};

/** 제목 후보(최대 3개). */
export async function suggestHeadlines(html, currentHeadline = "") {
  const body = plainText(html);
  if (!body) throw new Error("본문을 먼저 작성해 주세요.");
  const result = await assist({ kind: "metadata", requested: "headline", body, current_headline: currentHeadline });
  const candidates = (result.headline_candidates || []).map((item) => (typeof item === "string" ? item : item.headline || item.title || item.text));
  return unique(candidates.length ? candidates : [result.headline]);
}

/** 부제 후보. 부제 하나는 2~4줄이라 줄바꿈을 그대로 둔다.
 *  원격 AI 는 부제 한 개의 줄들을 subtitle_candidates 에 줄마다 한 항목씩(2~4개) 돌려주는 경우가 있다.
 *  이때 항목을 따로 후보로 보이면 한 줄만 적용되므로, 한 줄짜리 항목들은 하나의 부제(여러 줄)로 묶어 한꺼번에 적용한다.
 *  subtitle 에 이미 여러 줄 부제가 있으면 그것을 첫 후보로 쓴다. */
export async function suggestSubtitles(html, currentHeadline = "") {
  const body = plainText(html);
  if (!body) throw new Error("본문을 먼저 작성해 주세요.");
  const result = await assist({ kind: "metadata", requested: "subheadline", body, current_headline: currentHeadline });
  const asLines = (value) => normalizeSubtitleCandidate(value).split("\n").filter(Boolean);
  const items = (result.subtitle_candidates || []).map(asLines).filter((lines) => lines.length);
  const oneLinePerItem = items.length >= 2 && items.length <= 4 && items.every((lines) => lines.length === 1);
  const candidates = oneLinePerItem ? [items.flat().join("\n")] : items.map((lines) => lines.join("\n"));
  return unique([asLines(result.subtitle).join("\n"), ...candidates]).slice(0, 1);
}

/** 기사에 어울리는 스톡 사진 검색어(영어, 최대 6개).
 *  Core 는 한 번에 3개만 돌려주므로, 본문 전체와 본문 앞·뒤 절반에서 따로 받아 합쳐 5~6개를 보여 준다(짧은 글은 전체만 → 3개).
 *  본문 전체에서 받은 검색어가 앞에 오고, 일부 요청이 실패해도 받은 것은 보여 준다. */
export async function photoKeywords(html) {
  const body = plainText(html);
  if (!body) throw new Error("본문을 먼저 작성해 주세요.");
  const half = Math.floor(body.length / 2);
  const parts = body.length >= 400 ? [body, body.slice(0, half), body.slice(half)] : [body];
  const results = await Promise.allSettled(parts.map((part) => assistWhenFree({ kind: "photo_keywords", body: part })));
  const keywords = unique(results.flatMap((r) => (r.status === "fulfilled" ? r.value.keywords || [] : []))).slice(0, 6);
  if (keywords.length === 0) {
    const failed = results.find((r) => r.status === "rejected");
    throw failed ? failed.reason : new Error("추천할 검색어를 찾지 못했습니다.");
  }
  return keywords;
}
