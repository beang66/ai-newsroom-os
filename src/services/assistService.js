import { core } from "../api/core.js";

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

/** 제목 후보(최대 3개). */
export async function suggestHeadlines(html, currentHeadline = "") {
  const body = plainText(html);
  if (!body) throw new Error("본문을 먼저 작성해 주세요.");
  const result = await assist({ kind: "metadata", requested: "headline", body, current_headline: currentHeadline });
  const candidates = (result.headline_candidates || []).map((item) => (typeof item === "string" ? item : item.headline || item.title || item.text));
  return unique(candidates.length ? candidates : [result.headline]);
}

/** 부제 후보. 한 후보가 2~4줄이라 줄바꿈을 그대로 둔다. */
export async function suggestSubtitles(html, currentHeadline = "") {
  const body = plainText(html);
  if (!body) throw new Error("본문을 먼저 작성해 주세요.");
  const result = await assist({ kind: "metadata", requested: "subheadline", body, current_headline: currentHeadline });
  return unique([result.subtitle, ...(result.subtitle_candidates || [])].map((value) =>
    String(value || "").split(/\n+/).map((line) => line.trim()).filter(Boolean).join("\n")));
}

/** 기사에 어울리는 스톡 사진 검색어(영어 3개). */
export async function photoKeywords(html) {
  const body = plainText(html);
  if (!body) throw new Error("본문을 먼저 작성해 주세요.");
  const result = await assist({ kind: "photo_keywords", body });
  const keywords = unique(result.keywords || []);
  if (keywords.length === 0) throw new Error("추천할 검색어를 찾지 못했습니다.");
  return keywords;
}
