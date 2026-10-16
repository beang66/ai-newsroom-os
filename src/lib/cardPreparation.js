import {assertSameSource,currentRender,renderKey,selectedCardPhoto} from './platformState.js';

// JPG 준비는 문안·AI 검수와 별도다. 저장 자산의 기사·고정본 검증은 기존 Core 경로가 담당한다.
export function cardImageReadiness(draft,article) {
  const cards=Array.isArray(draft?.cards)?draft.cards:[];
  let originError='';
  if(cards.length)try{assertSameSource(draft,null,article);}catch(error){originError=error.message;}
  const items=cards.map((card,index)=>{
    const photo=selectedCardPhoto(card,article),key=renderKey(card,photo,draft);
    const image=!originError&&currentRender(card,photo,draft);
    const ready=!!(image?.id&&image?.uri);
    return {index,card_id:card?.card_id,ready,image:ready?image:null,
      error:originError||(!ready&&card?.render_error?.key===key?card.render_error.reason:'')};
  });
  return {total:cards.length,ready:items.filter(item=>item.ready).length,
    complete:cards.length>0&&items.every(item=>item.ready),items};
}

// 기존 renderStoredCard를 주입한다. 성공 카드는 즉시 보관하고, 실패가 있어도 나머지 카드를 확인한다.
// 전체 성공일 때만 assets를 반환해 일부 카드만 SNS에 첨부되는 것을 막는다.
export async function prepareCardImages({draft,article,render,onCard=()=>{},onProgress=()=>{},isCurrent=()=>true,now=()=>performance.now()}) {
  assertSameSource(draft,null,article);
  const cards=draft.cards;
  if(!Array.isArray(cards)||!cards.length||cards.some(card=>!card?.card_id)||new Set(cards.map(card=>card.card_id)).size!==cards.length)
    throw Error('JPG를 준비할 카드 목록을 확인해 주세요.');
  const start=now(),assets=[],errors=[];
  let rendered=0,reused=0;
  const check=()=>{if(!isCurrent())throw Error('JPG 확인 중 원고·카드·사진이 변경됐습니다. 완료된 이미지는 보관했습니다. 다시 확인해 주세요.');};
  for(const [index,card] of cards.entries()) {
    check();onProgress(index+1,cards.length);
    const photo=selectedCardPhoto(card,article),key=renderKey(card,photo,draft);
    try {
      let image=currentRender(card,photo,draft);
      if(image?.id&&image?.uri)reused++;
      else {
        rendered++;
        image=await render(card,article,draft);
        check();
        if(!image?.id||!image?.uri||!currentRender({...card,rendered_image:image},photo,draft))throw Error('JPG 보관 결과의 기사·고정본·최신성을 확인하지 못했습니다.');
        onCard(card.card_id,{rendered_image:image,render_error:undefined},key);
      }
      assets.push({...image,order:index+1});
    } catch(error) {
      check();
      const reason=error.message||'JPG 출력에 실패했습니다.';
      errors.push({index,card_id:card.card_id,reason});
      onCard(card.card_id,{render_error:{key,reason}},key);
    }
  }
  check();
  return {complete:errors.length===0,assets:errors.length?[]:assets,errors,rendered,reused,elapsed_ms:Math.round(now()-start)};
}
