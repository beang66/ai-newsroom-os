import { core } from "../api/core.js";
import { bodyHtmlOf } from "../api/editorial";
import { editorHtml, plainContent } from "../lib/studioArticle.js";
import { createEmptyArticle } from "../data/article";
import {restoredPlatformFields} from '../lib/platformLifecycle.js';

// 코어 호출은 main 의 계약(src/api)을 통한다. 로그인이 필요하면(AUTH_REQUIRED) 전송 계층이
// 로그인 창을 열고, 성공하면 같은 요청을 한 번만 다시 보낸다.
const ARTICLE_ID = /^[a-f0-9]{32}$/;

function asDraft(article) {
  const articleId = ARTICLE_ID.test(article.articleId || "") ? article.articleId : undefined;
  return {
    ...article,
    ...(articleId ? { articleId } : {}),
    // content 는 내 에디터 HTML(다시 열 때 그대로 복원). bodyHtml 은 변환·고정본·미리보기용으로 main 과 같은 규칙으로 만든다.
    bodyHtml: bodyHtmlOf(plainContent(article.content), []),
    // 취재자료 본문은 Core 의 sources 저장소에 있으므로 기사에는 메타만 싣는다(main 과 같은 규칙).
    sources: (article.sources || []).map(({ text: _text, ...meta }) => meta),
  };
}

export function fromCoreDraft(draft, fallback) {
  if (!draft) return fallback;
  const articleId = draft.articleId || draft.id;
  return {
    ...fallback,
    ...draft,
    // 누락된 플랫폼 필드에 이전 기사의 원고·카드·조건을 물려주지 않는다.
    ...restoredPlatformFields(draft),
    id: articleId || fallback.id,
    articleId,
    content: editorHtml(typeof draft.content === "string" ? draft.content : (draft.bodyHtml || "")),
    linkedSources: draft.linkedSources || [],
    linkedInterviews: draft.linkedInterviews || [],
    photos: draft.photos || [],
    status: draft.status || "작성 중",
  };
}

export async function loadLatestArticle(fallback) {
  const response = await core.latestArticle();
  const draft = response?.draft;
  const article = fromCoreDraft(draft, fallback);
  if (!draft?.articleId) return article;
  const targetRev = Number.isInteger(response?.revisionNo)
    ? response.revisionNo
    : (Number.isInteger(draft?.revisionNo) ? draft.revisionNo : (Number.isInteger(article.revisionNo) ? article.revisionNo : null));
  if (targetRev !== null) {
    return { ...article, revisionNo: targetRev };
  }
  const stored = await listStoredArticles().catch(() => []);
  const match = stored.find((item) => item.id === draft.articleId);
  return match ? { ...article, revisionNo: match.revision_no } : article;
}

/**
 * 원고를 Core 에 저장한다.
 * - 기본(수동 저장): 저장 이력에 남는 버전. 충돌 감지를 위해 불러온 번호(expectedRevisionNo)를 보낸다.
 * - kind "auto"(자동 임시 저장): Core 가 이력을 늘리지 않고 '마지막 수동 저장 뒤의 작업본' 한 칸을 덮어쓴다.
 */
export function saveArticle(article, expectedRevisionNo, { kind } = {}) {
  return core.saveArticle(asDraft(article), expectedRevisionNo, false, undefined, kind);
}

/** 저장된 기사 하나를 내 기사 형식으로 연다(기사 전환용). */
export async function loadArticleById(id, fallback = createEmptyArticle()) {
  const response = await core.getArticle(id);
  const draft = response?.draft;
  const article = fromCoreDraft(draft, fallback || createEmptyArticle());
  const targetRev = Number.isInteger(response?.revisionNo)
    ? response.revisionNo
    : (Number.isInteger(draft?.revisionNo) ? draft.revisionNo : null);
  if (targetRev !== null) {
    return { ...article, revisionNo: targetRev };
  }
  const stored = await listStoredArticles().catch(() => []);
  const match = stored.find((item) => item.id === (article.articleId || id));
  return match ? { ...article, revisionNo: match.revision_no } : article;
}

export async function listStoredArticles() {
  const { articles = [] } = await core.listArticles();
  return articles.map((article) => ({
    ...article,
    id: article.id?.replaceAll("-", "") || article.id,
    updatedAt: article.updated_at,
    createdAt: article.created_at,
    linkedSources: article.source_ids || [],
    linkedInterviews: article.interviews || [],
  }));
}

/** 저장된 취재자료 목록. 기사에 연결된 자료의 이름을 보여 줄 때 id(하이픈 없는 32자)로 찾는다. */
export async function listStoredSources() {
  const { sources = [] } = await core.listSources();
  return sources;
}

/** 기사의 저장 이력(최신이 위). Core가 오래된 이력을 정리하므로 전부가 아닐 수 있다. */
export async function listArticleRevisions(articleId) {
  const { revisions = [] } = await core.listRevisions(articleId);
  return revisions;
}

export async function loadStoredPreview(article) {
  const id = article.id?.replaceAll("-", "");
  const revision = await core.getRevision(id, article.revision_no);
  return { ...article, title: revision.title || article.title, subtitle: revision.subtitle || article.subtitle, content: htmlToText(revision.content || "") };
}

// 보관함 미리보기는 서식 없는 글만 보여 주므로 저장된 HTML 본문에서 태그를 걷어 낸다.
function htmlToText(html) {
  return html
    .replace(/<\/(p|div|h[1-6]|li)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
