// Instagram 출력 계약: 형식은 코드로, 사실·문단 흐름·명사형 의미는 AI 검수로 확인합니다.
const EMOJIS = ['📰','🎵','🎬','🎨','📚','📊','💡','🔎','⚽','🏛️','🌍','💻','📌'];
const hasEmoji = text => /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(text);
function usesDefaultStyle(requirements='') {
  // 명시적으로 다른 말투를 요청한 경우 습니다체 어미를 강제하지 않습니다.
  return !/(반말|해요체|한다체|해체|해라체|다체|구어체|존댓말.*(?:금지|없이)|습니다체.*(?:금지|말고|대신))/.test(requirements);
}
function checkWriting(draft,requirements='') {
  const issues=[];
  if(!EMOJIS.includes(draft.emoji))issues.push('emoji는 허용된 이모지 하나여야 합니다.');
  const blocks=[draft.opening,...(draft.paragraphs||[]),draft.closing];
  if(blocks.some(b=>hasEmoji(b?.text||'')))issues.push('이모지는 emoji 필드만 사용하고 원고 텍스트에는 넣지 마세요.');
  if(usesDefaultStyle(requirements)){
    if(/(?:니다|니까|까요|나요|세요)[.!?…]*$/u.test((draft.opening?.text||'').trim())||/[?？]$/u.test((draft.opening?.text||'').trim()))issues.push('opening은 명사형 도입이어야 합니다.');
    if(!/(?:니다|니까|까요|나요|세요|십시오)[.!?…]*$/u.test((draft.closing?.text||'').trim()))issues.push('closing은 명사구가 아닌 서술어가 있는 완전한 습니다체 문장이어야 합니다.');
  }
  return issues;
}
module.exports={EMOJIS,hasEmoji,usesDefaultStyle,checkWriting};
