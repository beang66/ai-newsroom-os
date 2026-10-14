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

/** 부제 후보. 부제 하나는 2~4줄이라 줄바꿈을 그대로 둔다.
 *  원격 AI 는 부제 한 개의 줄들을 subtitle_candidates 에 줄마다 한 항목씩(2~4개) 돌려주는 경우가 있다.
 *  이때 항목을 따로 후보로 보이면 한 줄만 적용되므로, 한 줄짜리 항목들은 하나의 부제(여러 줄)로 묶어 한꺼번에 적용한다.
 *  subtitle 에 이미 여러 줄 부제가 있으면 그것을 첫 후보로 쓴다. */
export async function suggestSubtitles(html, currentHeadline = "") {
  const body = plainText(html);
  if (!body) throw new Error("본문을 먼저 작성해 주세요.");
  const result = await assist({ kind: "metadata", requested: "subheadline", body, current_headline: currentHeadline });
  const asLines = (value) => String(value || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const items = (result.subtitle_candidates || []).map(asLines).filter((lines) => lines.length);
  const oneLinePerItem = items.length >= 2 && items.length <= 4 && items.every((lines) => lines.length === 1);
  const candidates = oneLinePerItem ? [items.flat().join("\n")] : items.map((lines) => lines.join("\n"));
  return unique([asLines(result.subtitle).join("\n"), ...candidates]);
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
