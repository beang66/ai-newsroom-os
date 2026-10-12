// FormatConverter 전용 얇은 API 층.
// UI는 platform-generator의 구현/경로를 모르고 App Core 계약만 사용한다.
import { core } from "./core.js";
import { textWithoutPhotos } from "../lib/photoMarks.js";

// 본문 속 사진 자리 줄([사진:id])은 플랫폼·카드뉴스 글과 근거 검사에 들어가지 않게 뺀다
const cleanArticle = (article = {}) => ({
  article_id: String(article.articleId || article.id || "article_01"),
  title: String(article.title || "").trim(),
  content: textWithoutPhotos(article.content).trim(),
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
