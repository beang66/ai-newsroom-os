// FormatConverter 전용 얇은 API 층.
// UI는 platform-generator의 구현/경로를 모르고 App Core 계약만 사용한다.
import { core } from "./core.js";
import { textWithoutPhotos } from "../lib/photoMarks.js";
import { saveDraft, bodyHtmlOf } from "./editorial.js";
import { articleId, renderKey, selectedCardPhoto } from "../lib/platformState.js";

// 본문 속 사진 자리 줄([사진:id])은 플랫폼·카드뉴스 글과 근거 검사에 들어가지 않게 뺀다
const cleanArticle = (article = {}) => ({
  article_id: articleId(article),
  title: String(article.title || "").trim(),
  subtitle: String(article.subtitle || "").trim(),
  url: typeof article.url === "string" ? article.url : "",
  content: typeof article.content === "string" ? textWithoutPhotos(article.content).trim() : "",
});

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
    if (strict && (snapshot.title !== (article.title || "") || snapshot.subtitle !== (article.subtitle || "")
      || snapshot.url !== (article.url || "") || snapshot.body_html !== bodyHtmlOf(article.content, article.photos || []))) {
      throw Error("저장 중 원문이 변경됐습니다. 현재 기사를 확인한 뒤 다시 실행해 주세요.");
    }
    return { snapshotId: snapshot.id, articleId, revisionNo: snapshot.revision_no };
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
export async function generatePlatform(platform, article, selectedKeywords, requirements = "", snapshotId) {
  const payload = {
    article: cleanArticle(article),
    selected_keywords: [...new Set((selectedKeywords || []).map((value) => String(value).trim()).filter(Boolean))],
    requirements: String(requirements || "").trim(),
  };
  const result = await core.generatePlatform(platform, payload, snapshotId);
  const draft = result?.draft || null;
  return draft ? { ...draft, ...(result?.snapshotId ? {snapshot_id:result.snapshotId} : {}), generation_input:payload } : null;
}

export async function validatePlatformDraft(platform, draft) {
  const input = draft?.generation_input;
  if (!input?.article) throw Error("검수 기준 원문이 없습니다. 현재 기사로 다시 생성해 주세요.");
  const {validation_review:_review,rendered_image:_render,generation_input:_input,...reviewDraft}=draft;
  if(reviewDraft.cards)reviewDraft.cards=reviewDraft.cards.map(({rendered_image:_render,validation_review:_review,image,...card})=>({...card,...(image?{image:{photographer:image.photographer}}:{})}));
  const result = await core.validatePlatform({ ...input, platform, draft:reviewDraft }, draft.snapshot_id);
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
  if(!media)throw Error('암호화 보관소의 이미지 참조를 확인하지 못했습니다. 다시 렌더해 주세요.');
  return core.mediaBytes(media[1]);
}
export async function storedJpg(rendered) {
  const blob=await assetBytes(rendered);
  if (blob.type!=="image/jpeg") throw Error("카드 JPG 형식을 확인해 주세요.");
  return blob;
}
export const snsAction=(platform,action,payload={},draft={})=>core.platformSns(platform,action,payload,draft.article_id,draft.snapshot_id);
