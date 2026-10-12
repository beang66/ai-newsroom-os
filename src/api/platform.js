// FormatConverter 전용 얇은 API 층.
// UI는 platform-generator의 구현/경로를 모르고 App Core 계약만 사용한다.
import { core } from "./core.js";
import { textWithoutPhotos } from "../lib/photoMarks.js";
import { saveDraft } from "./editorial.js";

// 본문 속 사진 자리 줄([사진:id])은 플랫폼·카드뉴스 글과 근거 검사에 들어가지 않게 뺀다
const cleanArticle = (article = {}) => ({
  article_id: String(article.articleId || article.id || "article_01"),
  title: String(article.title || "").trim(),
  content: textWithoutPhotos(article.content).trim(),
});

/** 지금 글을 저장하고 고정본(그 시점의 글을 얼린 사본)으로 만든다. 키워드·원고·카드 이미지를 이 고정본 기준으로 만들면
 *  나중에 "어느 글로 만들었는지"를 정확히 알 수 있다. → { snapshotId, articleId, revisionNo } | null.
 *  저장·고정본 생성이 실패해도 던지지 않고 null 을 돌려준다 — 이때는 변환이 현재 글 그대로 진행된다. */
export async function freezeArticle(article) {
  try {
    const articleId = await saveDraft(article, article?.articleId);
    const snapshot = await core.createSnapshot(articleId);
    return snapshot?.id ? { snapshotId: snapshot.id, articleId, revisionNo: snapshot.revision_no } : null;
  } catch {
    return null;
  }
}

export async function suggestPlatformKeywords(article, snapshotId) {
  const result = await core.platformKeywords(cleanArticle(article), snapshotId);
  return Array.isArray(result?.candidates) ? result.candidates : [];
}

/** snapshotId 가 있으면 코어가 그 고정본의 제목·본문으로 만들고, 돌려주는 초안에 snapshot_id 를 함께 담는다 */
export async function generatePlatform(platform, article, selectedKeywords, requirements = "", snapshotId) {
  const payload = {
    article: cleanArticle(article),
    selected_keywords: [...new Set((selectedKeywords || []).map((value) => String(value).trim()).filter(Boolean))],
    requirements: String(requirements || "").trim(),
  };
  const result = await core.generatePlatform(platform, payload, snapshotId);
  const draft = result?.draft || null;
  return draft && result?.snapshotId ? { ...draft, snapshot_id: result.snapshotId } : draft;
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
