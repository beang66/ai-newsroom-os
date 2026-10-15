import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareCardImages,cardImageReadiness} from '../../../src/lib/cardPreparation.js';
import {renderKey,selectedCardPhoto,attachCurrentReview,reusableReview} from '../../../src/lib/platformState.js';
const article={articleId:'fixture',title:'합성',content:'합성 본문',photos:[]};
const make=()=>({article_id:'fixture',snapshot_id:'snapshot',generation_input:{article:{article_id:'fixture',title:article.title,content:article.content}},cards:['cover','body','body','closing'].map((role,i)=>({card_id:`C${i+1}`,role,content:{headline:`합성 카드 ${i+1}`,answer:'계획',detail:'조건을 유지합니다.'},image:{editable:true,selected_image_url:''}}))});
const image=(card,draft,a=article)=>({id:'asset-'+card.card_id,uri:'/api/media-assets/'+card.card_id+'/file',key:renderKey(card,selectedCardPhoto(card,a),draft),article_id:draft.article_id,snapshot_id:draft.snapshot_id});
function runner(draft,{fail,changed=()=>true}={}) {
 const calls=[];
 const run=()=>prepareCardImages({draft:structuredClone(draft),article,render:async(card,a,d)=>{calls.push(card.card_id);if(fail?.(card))throw Error('상세 설명 높이 초과');return image(card,d);},onCard:(id,patch)=>Object.assign(draft.cards.find(card=>card.card_id===id),patch),isCurrent:changed});
 return {calls,run};
}
test('생성 후 JPG를 모두 보관해야 준비 완료, 작성창 준비의 재확인은 전부 재사용',async()=>{
 const draft=make(),r=runner(draft);
 assert.equal(cardImageReadiness(draft,article).complete,false);
 const first=await r.run();assert.equal(first.complete,true);assert.equal(first.rendered,4);
 assert.deepEqual(first.assets.map(a=>a.order),[1,2,3,4]);assert.equal(cardImageReadiness(draft,article).complete,true);
 const again=await r.run();assert.equal(again.rendered,0);assert.equal(again.reused,4);assert.equal(r.calls.length,4);
});
test('문안·사진·디자인·위치 편집은 해당 카드만 준비 해제하고 다시 렌더',async()=>{
 for(const patch of [{content:{headline:'수정 제목',answer:'계획',detail:'필수 조건'}},{image:{url:'data:image/png;base64,fixture'}},{design:{layout:'list'}},{text_positions:{detail:{x:0,y:5}}}]){
  const draft=make(),r=runner(draft);await r.run();Object.assign(draft.cards[2],patch);
  assert.equal(cardImageReadiness(draft,article).ready,3);assert.equal(r.calls.length,4,'편집만으로 렌더하지 않음');
  const result=await r.run();assert.equal(result.rendered,1);assert.equal(result.reused,3);assert.equal(r.calls.at(-1),'C3');
 }
});
test('3번 실패 후에도 4번 보관, 부분 assets 금지, 재시도는 실패 카드만',async()=>{
 const draft=make();let fail=true;const r=runner(draft,{fail:card=>fail&&card.card_id==='C3'});
 const first=await r.run();assert.equal(first.complete,false);assert.deepEqual(first.assets,[]);
 assert.deepEqual(r.calls,['C1','C2','C3','C4']);assert.equal(cardImageReadiness(draft,article).ready,3);
 assert.match(cardImageReadiness(draft,article).items[2].error,/높이 초과/);
 draft.cards[2].content.detail='편집 완료';assert.equal(cardImageReadiness(draft,article).items[2].error,'');
 fail=false;const retried=await r.run();assert.equal(retried.complete,true);assert.equal(retried.rendered,1);assert.equal(retried.reused,3);
});
test('다른 고정본 자산은 재사용하지 않고 다른 기사 입력은 렌더 전 거부',async()=>{
 const draft=make();for(const card of draft.cards)card.rendered_image={...image(card,draft),snapshot_id:'other'};
 assert.equal(cardImageReadiness(draft,article).ready,0);const r=runner(draft);assert.equal((await r.run()).rendered,4);
 draft.article_id='other';await assert.rejects(r.run(),/기사/);assert.equal(r.calls.length,4);
});
test('렌더 메타데이터와 오류 기록은 기존 문안 검수를 무효화하지 않으며 변경 중 결과는 적용하지 않음',async()=>{
 const original=make(),review={status:'passed',fact:{issues:[]},requirement:{issues:[]}};
 const draft=attachCurrentReview('card_news',original,article,review),r=runner(draft,{fail:card=>card.card_id==='C3'});
 await r.run();assert.equal(reusableReview('card_news',draft,article),review);
 let current=true,applied=0;
 await assert.rejects(prepareCardImages({draft:make(),article,render:async(card,a,d)=>{current=false;return image(card,d);},isCurrent:()=>current,onCard:()=>applied++}),/변경/);
 assert.equal(applied,0);
});
test('실패 포함 실제 렌더·재사용 횟수와 경과 시간을 기록',async()=>{
 const draft=make();draft.cards[0].rendered_image=image(draft.cards[0],draft);let t=0;
 const result=await prepareCardImages({draft,article,now:()=>{t+=250;return t;},render:async(card,a,d)=>image(card,d)});
 assert.equal(result.rendered,3);assert.equal(result.reused,1);assert.equal(result.elapsed_ms,250);
});
