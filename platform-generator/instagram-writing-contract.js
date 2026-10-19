// Instagram 출력 계약: 형식은 코드로, 사실·문단 흐름·명사형 의미는 AI 검수로 확인합니다.
const EMOJIS = ['📰','🎵','🎬','🎨','📚','📊','💡','🔎','⚽','🏛️','🌍','💻','📌'];
const hasEmoji = text => /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(text);
const EditorialDirection=require('./lib/editorial-direction');
function usesDefaultStyle(requirements='',field='closing') {
  const direction=EditorialDirection.resolve('instagram',requirements);
  return field==='opening'?!direction.explicit.opening:direction.styles[field]==='formal';
}
function checkWriting(draft,requirements='') {
  const issues=[];
  if(!EMOJIS.includes(draft.emoji))issues.push('emoji는 허용된 이모지 하나여야 합니다.');
  const blocks=[draft.opening,...(draft.paragraphs||[]),draft.closing];
  if(blocks.some(b=>hasEmoji(b?.text||'')))issues.push('이모지는 emoji 필드만 사용하고 원고 텍스트에는 넣지 마세요.');
  if(usesDefaultStyle(requirements,'opening')){
    if(/(?:니다|니까|까요|나요|세요)[.!?…]*$/u.test((draft.opening?.text||'').trim())||/[?？]$/u.test((draft.opening?.text||'').trim()))issues.push('opening은 명사형 도입이어야 합니다.');
  }
  if(usesDefaultStyle(requirements)){
    const ending=(draft.closing?.text||'').trim().replace(/[”’"'」』]+$/u,'').trim();
    if(!/(?:니다|니까|까요|나요|세요|십시오)[.!?…]*$/u.test(ending))issues.push('closing은 명사구가 아닌 서술어가 있는 완전한 습니다체 문장이어야 합니다.');
  }
  return issues;
}
module.exports={EMOJIS,hasEmoji,usesDefaultStyle,checkWriting};
