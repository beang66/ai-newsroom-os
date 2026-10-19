// FormatConverter 전용 얇은 API 층.
// UI는 platform-generator의 구현/경로를 모르고 App Core 계약만 사용한다.
import { core } from "./core.js";
import { saveDraft, bodyHtmlOf, loadStoredArticle } from "./editorial.js";
import { articleId, renderKey, selectedCardPhoto, sourceText } from "../lib/platformState.js";
import { attachCurrentReview } from '../lib/platformState.js';
import {toStudioArticle} from '../lib/studioArticle.js';
import '../../platform-generator/lib/review-binding.js';

// Core 본문 텍스트를 그대로 전달한다. 화면의 부제·사진·캡션을 생성 원문에 합치지 않는다.
const cleanArticle = (article = {}) => ({
  article_id: articleId(article),
  title: typeof article.title === "string" ? article.title : "",
  content: typeof article.content === "string" ? article.content : "",
});

export const startPlatformRun = payload => core.startPlatformRun(payload);
export const listPlatformRuns = articleIdValue => core.listPlatformRuns(articleIdValue);
export const getPlatformRun = runId => core.getPlatformRun(runId);

// 편집실 목록·미리보기: 기존 Core API와 공개된 팀 본문/사진 복원기를 재사용한다.
export async function listStudioArticles(signal) {
  const result=await core.listArticles(signal);
  if(!Array.isArray(result?.articles))throw Error("기사 목록 응답을 확인할 수 없습니다.");
  return result.articles.map(row=>{
    if(typeof row.id!=="string"||typeof row.title!=="string")throw Error("저장 기사 목록 형식을 확인할 수 없습니다.");
    return row;
  });
}
export async function getStudioArticle(id, signal) {
  const response=await core.getArticle(id,undefined,signal);
  const raw=response?.draft;
  if(!raw||typeof raw.articleId!=="string")throw Error("기사가 삭제되었거나 조회되지 않습니다.");
  const loaded=await loadStoredArticle(id,{},signal);
  // 표시용 부제 존재 여부는 원래 응답에서 보존한다. 공통 복원기는 수정하지 않는다.
  if(loaded.articleId!==raw.articleId||loaded.revisionNo!==raw.revisionNo||loaded.title!==raw.title
    ||loaded.subtitle!==(raw.subtitle||'')||loaded.url!==(raw.url||'')
    ||(typeof raw.content==='string'&&loaded.content!==raw.content))
    throw Error("조회 중 기사가 변경됐습니다. 다시 선택해 주세요.");
  return {article:toStudioArticle(loaded), subtitle:raw.subtitle};
}

/** 지금 글을 저장하고 고정본(그 시점의 글을 얼린 사본)으로 만든다. 키워드·원고·카드 이미지를 이 고정본 기준으로 만들면
 *  나중에 "어느 글로 만들었는지"를 정확히 알 수 있다. → { snapshotId, articleId, revisionNo } | null.
 *  플랫폼 생성은 strict:true로 실패를 표시하고 중단한다. 기존 편집 보조 호출은 null 반환을 유지한다. */
export async function freezeArticle(article, { flush, strict = false } = {}) {
  try {
    // 팀 화면은 기존 자동 저장 큐를 먼저 비운다. 편집 보조의 기존 호출도 유지한다.
    const articleId = flush ? await flush() : await saveDraft(article, article?.articleId);
    if (!articleId) throw Error("저장된 기사 ID를 확인할 수 없습니다.");
    const snapshot = await core.createSnapshot(articleId);
    if (!snapshot?.id) throw Error("기사 고정본을 만들지 못했습니다.");
    if (strict && (snapshot.article_id !== articleId || snapshot.title !== (article.title || "")
      || typeof snapshot.body_text !== "string" || snapshot.body_html !== bodyHtmlOf(article.content, article.photos || []))) {
      throw Error("저장 중 원문이 변경됐습니다. 현재 기사를 확인한 뒤 다시 실행해 주세요.");
    }
    return { snapshotId: snapshot.id, articleId, revisionNo: snapshot.revision_no,
      article: {article_id:snapshot.article_id, title:snapshot.title, content:snapshot.body_text},
      ...(typeof snapshot.url === "string" ? {source_url:snapshot.url} : {}) };
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}

export async function suggestPlatformKeywords(article, snapshotId) {
  const result = await core.platformKeywords(cleanArticle(article), snapshotId);
  return Array.isArray(result?.candidates) ? result.candidates : [];
}

/** snapshotId 가 있으면 코어가 그 고정본의 제목·본문으로 만들고, 돌려주는 초안에 snapshot_id 를 함께 담는다 */
export async function generatePlatform(platform, article, selectedKeywords, requirements = "", snapshotId, sourceArticle, sourceUrl) {
  if (!["instagram", "threads", "card_news"].includes(platform)) throw Error("지원하지 않는 플랫폼입니다.");
  const payload = {
    article: cleanArticle(article),
    selected_keywords: [...new Set((selectedKeywords || []).map((value) => String(value).trim()).filter(Boolean))],
    requirements: String(requirements || "").trim(),
    ...(typeof sourceUrl === "string" ? {source_url:sourceUrl} : {}),
  };
  const result = await core.generatePlatform(platform, payload, snapshotId);
  const draft = result?.draft || null;
  // 화면 편집 최신성 서명은 로컬 보호용이다. Core 공통 ID나 고정본 계약을 대신하지 않는다.
  if (!draft) return null;
  const generated = { ...draft, ...(result?.snapshotId ? {snapshot_id:result.snapshotId} : {}), generation_input:payload,
    ...(sourceArticle ? {generation_source:sourceText(sourceArticle)} : {}) };
  return sourceArticle && await globalThis.ContentReviewBinding.reviewMatches({ ...payload, platform }, draft)
    ? attachCurrentReview(platform, generated, sourceArticle, draft.generation_review) : generated;
}

export async function validatePlatformDraft(platform, draft) {
  if (!["instagram", "threads", "card_news"].includes(platform)) throw Error("지원하지 않는 검수 플랫폼입니다.");
  const input = draft?.generation_input;
  if (!input?.article) throw Error("검수 기준 원문이 없습니다. 현재 기사로 다시 생성해 주세요.");
  const {validation_review:_review,rendered_image:_render,generation_input:_input,generation_run:_run,...reviewDraft}=draft;
  if(reviewDraft.cards)reviewDraft.cards=reviewDraft.cards.map(({rendered_image:_render,validation_review:_review,image,...card})=>({...card,...(image?{image:{photographer:image.photographer}}:{})}));
  const result = await core.validatePlatform({ ...input, article:cleanArticle(input.article), platform, draft:reviewDraft }, draft.snapshot_id);
  if (!result?.success || result.validation?.platform !== platform) throw Error("검수 결과를 확인하지 못했습니다.");
  return result.validation;
}

/** 카드 한 장 → 렌더 입력. 표지는 cover, 사진이 있으면 photo_body, 없으면 text_only 템플릿(platform-generator 의 buildHtml 이 아는 이름) */
export const cardRenderPayload = (card, photo) => ({
  ...card,
  card_id: String(card?.card_id || "card"),
  template: photo?.url ? (card?.role === "cover" ? "cover" : "photo_body") : "text_only",
  content: {
    ...(card?.content || card),
  },
  ...(photo?.url ? { image: { ...photo, url: photo.url, photographer: photo.photographer || photo.source || "", profile:photo.sourceUrl || photo.profile || "" } } : {}),
});

/** 카드뉴스 카드 하나를 이미지로 그려 코어(암호화 저장소)에 등록한다 → asset { id, local_uri, mime_type, ... } | null.
 *  card: 카드뉴스 초안의 카드 한 장, photo: 그 카드에 쓸 기사 사진(없으면 사진 없는 카드). 화면은 asset.local_uri 로 보여 준다 */
export async function renderCardImage(card, photo, snapshotId) {
  const image = photo ? {...photo, url:await photoDataUrl(photo)} : null;
  const result = await core.renderPlatformCard(cardRenderPayload(card, image), snapshotId);
  return result?.asset || null;
}

export async function photoDataUrl(photo) {
  const url = photo.url || photo.data || "";
  if (url.startsWith("data:image/")) return url;
  if (!url.startsWith("media:") && !url.startsWith("blob:") && !/^\/api\/(media|media-assets)\//.test(url)) throw Error("팀 사진 가져오기 또는 업로드로 저장한 사진을 사용해 주세요.");
  const media=/^\/api\/media\/([a-f0-9]{32})$/.exec(url),asset=/^\/api\/media-assets\/([a-f0-9-]{36})\/file$/.exec(url);
  const blob = url.startsWith("media:") ? await core.mediaBytes(url.slice(6)) : media ? await core.mediaBytes(media[1]) : asset ? await assetBytes({id:asset[1]}) : await fetch(url).then(response => {
    if (!response.ok) throw Error("저장된 사진을 읽지 못했습니다.");
    return response.blob();
  });
  return blobToDataUrl(blob);
}
export const blobToDataUrl = blob => new Promise((resolve,reject) => {
  const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error("이미지를 읽지 못했습니다."));reader.readAsDataURL(blob);
});
export async function renderStoredCard(card, article, draft) {
  const photo=selectedCardPhoto(card,article);
  if(card.photoId&&!photo)throw Error("선택한 사진이 기사에서 삭제됐습니다. 사진을 다시 선택해 주세요.");
  const key=renderKey(card,photo,draft);
  const payload=cardRenderPayload(card,photo?{...photo,url:await photoDataUrl(photo)}:null);
  payload.page=draft.cards.findIndex(item=>item.card_id===card.card_id)+1;
  payload.total_pages=draft.cards.length;
  payload.article_id=draft.article_id;
  payload.render_key=key;
  const result=await core.renderPlatformCard(payload,draft.snapshot_id);
  if (!result?.asset?.local_uri) throw Error("카드 이미지 보관에 실패했습니다.");
  return {id:result.asset.id,uri:result.asset.local_uri,object_ref:result.asset.object_ref,key,article_id:draft.article_id,snapshot_id:draft.snapshot_id||null};
}
async function assetBytes(rendered) {
  const asset=rendered.object_ref?rendered:await core.getMediaAsset(rendered.id);
  const media=/^media:([a-f0-9]{32})$/.exec(asset?.object_ref||'');
  if(!media)throw Error('암호화 저장소의 이미지 참조를 확인하지 못했습니다. 다시 렌더해 주세요.');
  return core.mediaBytes(media[1]);
}
export async function storedJpg(rendered) {
  const blob=await assetBytes(rendered);
  if (blob.type!=="image/jpeg") throw Error("카드 JPG 형식을 확인해 주세요.");
  return blob;
}
export const snsAction=(platform,action,payload={},draft={})=>core.platformSns(platform,action,payload,draft.article_id,draft.snapshot_id);
