// 새 생성 결과에만 사용하는 형식 복구. 저장본·사용자 편집본에는 호출하지 않는다.
function normalizeHashtags(value) {
 if(!Array.isArray(value)||value.some(tag=>typeof tag!=='string'))return null;
 const tags=value.flatMap(tag=>tag.trim().split(/[\s,;，、]+/u)).filter(Boolean);
 return tags.filter((tag,index)=>tags.findIndex(other=>other.toLowerCase()===tag.toLowerCase())===index);
}
function repairGeneratedLayouts(draft) {
 if(!Array.isArray(draft?.cards))return draft;
 return {...draft,cards:draft.cards.map((card,index)=>{
  const detail=card.content?.detail;
  if(index===0||index===draft.cards.length-1||card.role!=='body'||card.design?.layout!=='comparison'||typeof detail!=='string'||!detail.trim())return card;
  if(detail.split('\n').filter(line=>line.trim()).length===2)return card;
  return {...card,design:{...card.design,layout:'standard'}};
 })};
}
module.exports={normalizeHashtags,repairGeneratedLayouts};
