const excluded = new Set(["validation_status", "evidence_status", "validation_review", "rendered_image", "generation_review", "evidence_valid", "block_evidence_valid"]);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().filter(key => !excluded.has(key)).map(key => [key, canonical(value[key])])) : value;
export const fingerprint = value => JSON.stringify(canonical(value));
// 부제·출처가 바뀌어도 기존 플랫폼 결과는 별도로 남고 새 원문의 결과로 재사용하지 않는다.
export const sourceText = article => JSON.stringify([String(article?.title || "").trim(), String(article?.subtitle || "").trim(),
  typeof article?.content === "string" ? article.content : "", String(article?.url || "").trim()]);
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
export const selectedCardPhoto = (card, article) => card?.photoId ? (article?.photos || []).find(photo => photo.id === card.photoId) || null : card?.image || null;
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
