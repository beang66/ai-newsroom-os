import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertSameSource,currentRender,fingerprint,invalidateDraft,renderKey,reviewStatus} from '../../../src/lib/platformState.js';
const article={articleId:'fixture-article',title:'도서관 운영 계획',content:'주말 운영을 늘릴 계획이며 평일 시간은 유지합니다.',photos:[{id:'p',url:'data:image/png;base64,original',source:'사진가 / Unsplash',sourceUrl:'https://unsplash.com/photos/fixture'}]};
const draft={article_id:article.articleId,snapshot_id:'fixture-snapshot',generation_input:{article:{article_id:article.articleId,title:article.title,content:article.content}},cards:[{card_id:'c1',role:'body',photoId:'p',content:{headline:'주말 운영 확대',answer:'확대 계획입니다.',detail:'평일은 유지합니다.'},text_positions:{detail:{x:0,y:0}}}]};
test('기사·고정본을 조용히 섞지 않고 카드 편집과 원본 변경을 구분',()=>{
 assert.doesNotThrow(()=>assertSameSource(draft,draft,article));
 assert.throws(()=>assertSameSource({...draft,article_id:'other'},draft,article),/기사/);
 assert.throws(()=>assertSameSource(draft,{...draft,snapshot_id:'other'},article),/고정본/);
 assert.throws(()=>assertSameSource(draft,draft,{...article,content:'변경된 원문입니다.'}),/원본/);
 const edited=structuredClone(draft);edited.cards[0].content.detail='사용자 편집';assert.doesNotThrow(()=>assertSameSource(edited,null,article));
});
test('본문·사진 바이트·출처·위치·순서 변경은 이전 렌더를 무효화',()=>{
 const card=draft.cards[0],photo=article.photos[0],key=renderKey(card,photo,draft);
 const ready={...card,rendered_image:{key,id:'asset',article_id:draft.article_id,snapshot_id:draft.snapshot_id}};
 assert.equal(currentRender(ready,photo,draft)?.id,'asset');
 for(const changed of [{...card,content:{...card.content,answer:'수정'}},{...card,text_positions:{detail:{x:10,y:0}}}])assert.equal(currentRender({...changed,rendered_image:ready.rendered_image},photo,draft),null);
 assert.equal(currentRender(ready,{...photo,url:'data:image/png;base64,edited'},draft),null);
 assert.equal(currentRender(ready,{...photo,source:'다른 출처'},draft),null);
 assert.equal(currentRender(ready,photo,{...draft,cards:[{card_id:'other'},card]}),null);
 assert.equal(currentRender(ready,photo,{...draft,snapshot_id:'other'}),null);
});
test('검수 상태는 편집 뒤 재검수 필요이고 렌더 메타데이터만으로 무효화하지 않음',()=>{
 const ready={...draft,validation_status:'passed',validation_review:{key:fingerprint(draft),result:{status:'passed'}}};
 assert.equal(reviewStatus(ready),'passed');assert.equal(reviewStatus(invalidateDraft(ready)),'needs_recheck');
 const edited=structuredClone(ready);edited.cards[0].content.detail='수정';assert.equal(reviewStatus(edited),'not_checked');
 assert.equal(fingerprint({...ready,rendered_image:{id:'x'}}),fingerprint(ready));
});
