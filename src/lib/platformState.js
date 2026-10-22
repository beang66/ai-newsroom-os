import {plainContent} from './studioArticle.js';
const excluded = new Set(["validation_status", "evidence_status", "validation_review", "rendered_image", "render_error", "generation_review", "generation_review_binding", "evidence_valid", "block_evidence_valid", "generation_run"]);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().filter(key => !excluded.has(key)).map(key => [key, canonical(value[key])])) : value;
export const fingerprint = value => JSON.stringify(canonical(value));
// 부제·출처가 바뀌어도 기존 플랫폼 결과는 별도로 남고 새 원문의 결과로 재사용하지 않는다.
export const sourceText = article => JSON.stringify([String(article?.title || "").trim(), String(article?.subtitle || "").trim(),
  typeof article?.content === "string" ? plainContent(article.content) : "", String(article?.url || "").trim()]);
export const articleId = article => String(article?.articleId || article?.article_id || article?.id || "");
// 부제는 화면에서 전달받은 값만 표시한다. 생성 입력에 포함됐다는 의미가 아니다.
export const subtitleLabel = article => article?.subtitle === undefined ? "부제 전달 미연결"
  : typeof article.subtitle === "string" && article.subtitle.trim() ? article.subtitle : "부제목 없음";
export const supportedPlatforms = values => Array.isArray(values) ? values.filter(value => ["instagram", "threads"].includes(value)) : [];
export const visibleDrafts = drafts => Object.fromEntries(Object.entries(drafts || {}).filter(([key]) => ["instagram", "threads"].includes(key)));
export const sameGenerationSource = (draft, article) => typeof draft?.generation_source === "string"
  ? draft.generation_source === sourceText(article) : sourceText(draft?.generation_input?.article) === sourceText(article);
export const reviewLabel = status => ({passed:"검수 통과", needs_revision:"수정 필요", needs_recheck:"재검수 필요", not_checked:"미검수"}[status] || "미검수");
export function reviewStatus(draft) {
  if(draft?.validation_status==='needs_recheck')return 'needs_recheck';
  const record = draft?.validation_review;
  return record && record.key === fingerprint(draft) ? record.result.status : draft?.validation_status === "needs_recheck" ? "needs_recheck" : "not_checked";
}
export const invalidateDraft = draft => ({...draft, validation_status:"needs_recheck", evidence_status:"needs_recheck"});
// 저장본을 복구한 뒤에는 이전 런타임의 재사용 표시를 신뢰하지 않는다.
const reviewSession = {};
export const reviewContextKey = (platform, draft, article) => JSON.stringify([
  platform, fingerprint(draft), sourceText(article), fingerprint(article?.photos || [])]);
export function attachCurrentReview(platform, draft, article, result) {
  return {...draft, validation_status:result.status, validation_review:{key:fingerprint(draft), result,
    context:reviewContextKey(platform,draft,article), session:reviewSession}};
}
export function reusableReview(platform, draft, article) {
  const record=draft?.validation_review;
  return draft?.validation_status !== 'needs_recheck' && record?.session === reviewSession
    && record.context === reviewContextKey(platform,draft,article) ? record.result : null;
}
// 같은 사진을 쓰는 다른 카드에 영향이 없도록 사진 조절값(그라데이션 등)은 카드의 photoPresentation 에 두고, 여기서 사진에 합쳐 준다.
// 같은 사진·같은 값이면 같은 객체를 돌려줘서(화면의 변경 감지·사진 불러오기가 다시 돌지 않게) 캐시한다.
const presented = new WeakMap();
const withPresentation = (photo, presentation) => {
  if (!photo || !presentation || typeof presentation !== 'object') return photo;
  const key = JSON.stringify(presentation), hit = presented.get(photo);
  if (hit?.key === key) return hit.value;
  const value = { ...photo, presentation: { ...photo.presentation, ...presentation } };
  presented.set(photo, { key, value });
  return value;
};
export const selectedCardPhoto = (card, article) => {
  if (card?.photoId) return withPresentation((article?.photos || []).find(photo => photo.id === card.photoId) || null, card.photoPresentation);
  // 생성기의 빈 image 메타데이터는 실제 사진이 아니다. 주소가 있는 사진의 검증은 API 경계에서 유지한다.
  const image = card?.image;
  return image && [image.url, image.data].some(value => typeof value === 'string' && value.trim()) ? withPresentation(image, card.photoPresentation) : null;
};
// 편집 최신성 비교용 서명. 자산의 기사·고정본 소유권은 Core가 별도로 확인한다.
// 사진 바이트를 중복 저장하지 않도록 길이와 128비트 체크섬을 보관한다.
export function renderKey(card, photo, draft) {
  const text=fingerprint({card,photo,ordinal:(draft?.cards||[]).findIndex(item=>item.card_id===card?.card_id)+1,cardCount:draft?.cards?.length,article_id:draft?.article_id,snapshot_id:draft?.snapshot_id||null});
  const values=[2166136261,2246822507,3266489909,668265263],primes=[16777619,3266489917,668265263,374761393];
  for(let i=0;i<text.length;i++)for(let j=0;j<4;j++)values[j]=Math.imul(values[j]^text.charCodeAt(i),primes[j])>>>0;
  return 'v1:'+text.length+':'+values.map(value=>value.toString(16).padStart(8,'0')).join('');
}
export function assertSameSource(draft, cards, article) {
  if (!draft) throw Error("현재 원고를 먼저 생성해 주세요.");
  const origin = draft.generation_input?.article;
  if (!articleId(article) || draft.article_id !== articleId(article)) throw Error("다른 기사 또는 출처를 확인할 수 없는 결과입니다. 현재 기사로 다시 생성해 주세요.");
  if (!origin || !sameGenerationSource(draft, article)) throw Error("원본 기사가 바뀌었거나 연결을 확인할 수 없습니다. 현재 기사로 다시 생성해 주세요. 카드 편집 변경과는 별개입니다.");
  if (cards && (cards.article_id !== draft.article_id || (cards.snapshot_id || null) !== (draft.snapshot_id || null)
    || JSON.stringify(cards.generation_input?.article) !== JSON.stringify(origin)
    || !sameGenerationSource(cards, article))) throw Error("원고와 카드뉴스의 기사·고정본이 다릅니다. 같은 고정본으로 함께 생성해 주세요.");
}
export function currentRender(card, photo, draft) {
  const rendered = card?.rendered_image;
  return rendered?.key === renderKey(card, photo, draft) && rendered.article_id === draft?.article_id
    && (rendered.snapshot_id || null) === (draft?.snapshot_id || null) ? rendered : null;
}
export function draftText(platform, draft) {
  return [draft?.opening, ...(draft?.paragraphs || []), draft?.closing, (draft?.hashtags || []).join(" ")]
    .filter(value => typeof value === "string" && value.trim()).join("\n\n");
}

/** SNS 작성창 채우기 버튼을 지금 누를 수 없는 이유(화면 안내 문구) 목록 — 비면 누를 수 있다.
 *  버튼의 disabled 도 이 목록으로 정한다(안내와 실제 동작이 어긋나지 않게). 여러 이유가 겹치면 모두 보여 준다
 *  (예: 근거 확인 체크만으로는 풀리지 않는 '이전 원문 결과'). */
export function prepareBlockers({ platform, draft, cards, article, attach, busy, preparing, checking, evidenceMismatch, evidenceAck }) {
  const name = platform === "threads" ? "Threads" : "Instagram", id = articleId(article), out = [];
  if (busy) out.push(`${name} 작성창을 채우는 중입니다.`);
  else if (preparing) out.push("플랫폼 원고를 생성하는 중입니다. 생성이 끝나면 누를 수 있습니다.");
  if (checking) out.push(`${name} 로그인 연결 상태를 확인하는 중입니다. 확인이 끝나면 누를 수 있습니다.`);
  if (!draft) out.push(`${name} 원고가 없습니다. '원고 & 설정'에서 원고를 생성해 주세요.`);
  else if (draft.article_id !== id) out.push(`이 ${name} 원고는 다른 기사에서 만든 것입니다. 지금 기사로 원고를 다시 생성해 주세요.`);
  else if (!sameGenerationSource(draft, article)) {
    out.push(`${name} 원고를 만든 뒤 기사(제목·부제·본문·URL)가 바뀌었거나, 불러온 초안이 지금 기사와 다른 원문에서 만든 결과입니다(이전 원문 결과). 원고를 다시 생성해 주세요.`);
  }
  if (attach && cards) {
    if (cards.article_id !== id || !sameGenerationSource(cards, article)) {
      out.push(`첨부할 카드뉴스가 지금 기사와 다른 원문에서 만든 결과입니다. 카드뉴스를 다시 생성해 주세요${platform === "instagram" ? "" : "('현재 카드뉴스 첨부'를 꺼도 됩니다)"}.`);
    } else if (draft && (cards.article_id !== draft.article_id || (cards.snapshot_id || null) !== (draft.snapshot_id || null))) {
      out.push("원고와 카드뉴스가 서로 다른 생성 작업(고정본)의 결과입니다. 원고와 카드뉴스를 같은 생성 작업으로 다시 만들어 주세요.");
    }
  }
  if (evidenceMismatch && !evidenceAck) out.push("원문과 일치하지 않는 근거가 표시되어 있습니다. 위 경고에서 내용을 확인한 뒤 '확인했습니다'를 체크해 주세요.");
  return out;
}
