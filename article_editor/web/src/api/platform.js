// FormatConverter 전용 얇은 API 층.
// UI는 platform-generator의 구현/경로를 모르고 App Core 계약만 사용한다.
import { core } from "./core.js";

const cleanArticle = (article = {}) => ({
  article_id: String(article.articleId || article.id || "article_01"),
  title: String(article.title || "").trim(),
  content: String(article.content || "").trim(),
});

export async function suggestPlatformKeywords(article) {
  const result = await core.platformKeywords(cleanArticle(article));
  return Array.isArray(result?.candidates) ? result.candidates : [];
}

export async function generatePlatform(platform, article, selectedKeywords, requirements = "") {
  const payload = {
    article: cleanArticle(article),
    selected_keywords: [...new Set((selectedKeywords || []).map((value) => String(value).trim()).filter(Boolean))],
    requirements: String(requirements || "").trim(),
  };
  const result = await core.generatePlatform(platform, payload);
  return result?.draft || null;
}

/** 카드 한 장 → 렌더 입력. 표지는 cover, 사진이 있으면 photo_body, 없으면 text_only 템플릿(platform-generator 의 buildHtml 이 아는 이름) */
export const cardRenderPayload = (card, photo) => ({
  card_id: String(card?.card_id || "card"),
  template: photo?.url ? (card?.role === "cover" ? "cover" : "photo_body") : "text_only",
  content: {
    keyword: String(card?.content?.keyword || ""),
    headline: String(card?.content?.headline || ""),
    body: String(card?.content?.body || ""),
  },
  ...(photo?.url ? { image: { url: photo.url, photographer: "" } } : {}),
});

/** 카드뉴스 카드 하나를 이미지로 그려 코어(암호화 저장소)에 등록한다 → asset { id, local_uri, mime_type, ... } | null.
 *  card: 카드뉴스 초안의 카드 한 장, photo: 그 카드에 쓸 기사 사진(없으면 사진 없는 카드). 화면은 asset.local_uri 로 보여 준다 */
export async function renderCardImage(card, photo, snapshotId) {
  const result = await core.renderPlatformCard(cardRenderPayload(card, photo), snapshotId);
  return result?.asset || null;
}
