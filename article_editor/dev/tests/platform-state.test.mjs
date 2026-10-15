import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertSameSource,currentRender,fingerprint,invalidateDraft,renderKey,reviewStatus,subtitleLabel,sourceText,supportedPlatforms,visibleDrafts,selectedCardPhoto} from '../../../src/lib/platformState.js';
import {sourceReady,appliedSource,applyCurrentSource,beginSourceTransition,claimSourceTransition,cancelSourceTransition} from '../../../src/lib/platformSource.js';
import {attachCurrentReview,reusableReview} from '../../../src/lib/platformState.js';
import {restoredPlatformFields,conditionsCurrent,heldConditions,sourceVersion,generationErrorCode,generationHistory,conditionValues} from '../../../src/lib/platformLifecycle.js';

test('HTML과 일반 본문은 기존 변환기로 비교하고 숫자·조건 변경은 구분',()=>{
 const html={articleId:'same',title:'제목',content:'<p>대상은 세 곳입니다.</p><p>다음 달 시행 예정입니다.</p>'};
 const plain={...html,content:'대상은 세 곳입니다.\n\n다음 달 시행 예정입니다.'};
 assert.equal(sourceText(html),sourceText(plain));assert.equal(sourceVersion(html),sourceVersion(plain));
 assert.notEqual(sourceVersion(plain),sourceVersion({...plain,content:plain.content.replace('세 곳','네 곳')}));
 assert.notEqual(sourceVersion(plain),sourceVersion({...plain,articleId:'other'}));
 const ticket=beginSourceTransition(html);assert.equal(sourceReady(claimSourceTransition(plain).record,plain),true);assert.equal((ticket.claimed),true);
});
test('플랫폼 복원은 이전 기사 기본값을 물려주지 않고 실제 저장값·명시적 빈값 보존',()=>{
 assert.deepEqual(restoredPlatformFields({}),{platformDrafts:{},cardNews:null,platformGeneration:{}});
 const stored={platformDrafts:{instagram:{opening:'보존본'},blog:{text:'과거 기록'}},cardNews:{cards:[]},platformGeneration:{requirements:'조건'}};
 assert.deepEqual(restoredPlatformFields(stored),stored);
 assert.deepEqual(restoredPlatformFields({platformDrafts:null,cardNews:[],platformGeneration:null}),{platformDrafts:{},cardNews:null,platformGeneration:{}});
});
test('조건은 원문 버전에 묶고 구버전·연결 없는 이전 조건을 자동 적용하지 않음',()=>{
 const a={articleId:'same',title:'제목',content:'첫 본문'},b={...a,content:'새 본문'};
 const config={selectedKeywords:['첫 키워드'],requirements:'기존 조건',source_version:sourceVersion(a)};
 assert(conditionsCurrent(config,a));assert(!conditionsCurrent(config,b));
 assert.deepEqual(heldConditions(config,b).selectedKeywords,['첫 키워드']);
 assert(!conditionsCurrent({selectedKeywords:['레거시']},a));assert(conditionsCurrent({},a));
 const key=sourceVersion(a);assert(!key.includes('첫 본문'));
 assert.equal(generationErrorCode(Error('closing 오류')),'WRITING_FORMAT');assert.equal(generationErrorCode(Error('해시태그 오류')),'HASHTAG_FORMAT');
});
test('손상된 선택 조건·작업 기록은 화면을 중단시키지 않고 추적 메타데이터는 검수를 무효화하지 않음',()=>{
 assert.deepEqual(conditionValues({selectedKeywords:'잘못된 형식',requirements:{text:'객체'}}),{selectedKeywords:[],requirements:''});
 assert.deepEqual(generationHistory([null,{id:'wrong',at:'today',platform:{},stage:{}},{}]),[]);
 const source={articleId:'fixture',title:'제목',content:'본문',photos:[]},draft={article_id:'fixture',generation_input:{article:{title:'제목',content:'본문'}}};
 const reviewed=attachCurrentReview('instagram',draft,source,{status:'passed'});
 assert.equal(reusableReview('instagram',{...reviewed,generation_run:{id:'safe-id',revision_no:3}},source).status,'passed');
});

test('새 검수는 같은 런타임·원고·조건에서만 재사용하고 저장 복원·사진·원문 변경 시 다시 검사',()=>{
 const source={articleId:'fixture',title:'제목',content:'본문',photos:[]};
 const original={article_id:'fixture',opening:'도입',generation_input:{article:{title:'제목',content:'본문'},requirements:''}};
 const result={status:'needs_revision',fact:{issues:[{reason:'조건 누락'}]},requirement:{issues:[]}};
 const reviewed=attachCurrentReview('instagram',original,source,result);
 assert.equal(reusableReview('instagram',reviewed,source),result);
 assert.equal(reusableReview('threads',reviewed,source),null);
 assert.equal(reusableReview('instagram',{...reviewed,opening:'새 도입'},source),null);
 assert.equal(reusableReview('instagram',reviewed,{...source,content:'새 본문'}),null);
 assert.equal(reusableReview('instagram',reviewed,{...source,photos:[{caption:'새 사진'}]}),null);
 assert.equal(reusableReview('instagram',JSON.parse(JSON.stringify(reviewed)),source),null);
 assert.equal(reusableReview('instagram',invalidateDraft(reviewed),source),null);
 assert.equal(reusableReview('instagram',{...reviewed,generation_input:{...reviewed.generation_input,requirements:'반말'}},source),null);
});

test('실제 생성 API 어댑터는 결합이 확인된 새 카드 검수를 연결하고 다른 입력의 결과는 재사용하지 않음',async()=>{
 const previous=globalThis.window;
 const frozen={article_id:'fixture',title:'제목',content:'본문'};
 const source={articleId:'fixture',title:'제목',content:'본문',photos:[]};
 const review={platform:'card_news',status:'passed',fact:{issues:[]},requirement:{issues:[]}};
 const result={platform:'card_news',article_id:'fixture',cards:[],generation_review:review};
 // 플랫폼 모듈의 공유 연결 유틸리티는 Node와 브라우저에서 동일한 SHA-256을 사용한다.
 await import('../../../platform-generator/lib/review-binding.js');
 result.generation_review_binding=globalThis.ContentReviewBinding.bindReview(
   {platform:'card_news',article:frozen,selected_keywords:[],requirements:''},result,
   value=>createHash('sha256').update(value,'utf8').digest('hex'));
 const calls=[];
 ipcHandlers={core:async path=>{calls.push(path);return {status:200,body:{draft:result,snapshotId:'snapshot'}};}};
 globalThis.window={pywebview:{api:ipcFixture}};
 try{
  const {generatePlatform}=await import('../../../src/api/platform.js');
  const generated=await generatePlatform('card_news',frozen,[],'','snapshot',source);
  assert.equal(reusableReview('card_news',generated,source)?.status,'passed');
  assert.equal(reviewStatus(generated),'passed');
  assert.equal(calls.filter(path=>path==='/api/platform/validate').length,0);
  const changed=await generatePlatform('card_news',frozen,[],'조건 변경','snapshot',source);
  assert.equal(reusableReview('card_news',changed,source),null);
  assert.equal(reviewStatus(changed),'not_checked');
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
// core singleton이 잡은 IPC 브리지는 유지하고 시험별 응답만 교체한다. 시험 사이 브리지 캐시 오염을 방지한다.
let ipcHandlers;
const ipcFixture={core:(...args)=>ipcHandlers.core(...args),coreBytes:(...args)=>ipcHandlers.coreBytes(...args)};
const article={articleId:'fixture-article',title:'도서관 운영 계획',content:'주말 운영을 늘릴 계획이며 평일 시간은 유지합니다.',photos:[{id:'p',url:'data:image/png;base64,original',source:'사진가 / Unsplash',sourceUrl:'https://unsplash.com/photos/fixture'}]};
const draft={article_id:article.articleId,snapshot_id:'fixture-snapshot',generation_input:{article:{article_id:article.articleId,title:article.title,content:article.content}},cards:[{card_id:'c1',role:'body',photoId:'p',content:{headline:'주말 운영 확대',answer:'확대 계획입니다.',detail:'평일은 유지합니다.'},text_positions:{detail:{x:0,y:0}}}]};
test('미리보기는 원문 적용이 아니며 실제 전환·원문 일치 때만 적용 확정',()=>{
 const first={...article,articleId:'first-apply-fixture'},second={...article,articleId:'second-apply-fixture'};
 assert.equal(sourceReady(appliedSource(first),first),false);
 const record=applyCurrentSource(first);assert.equal(sourceReady(record,first),true);
 assert.equal(sourceReady(record,{...first,content:'수정 원문'}),false);
 const canceled=beginSourceTransition(second);assert.equal(claimSourceTransition(first),null);cancelSourceTransition(canceled);
 assert.equal(appliedSource(second),null);assert.equal(sourceReady(appliedSource(first),first),true);
 const accepted=beginSourceTransition(second);const result=claimSourceTransition(second);
 assert.equal(accepted.claimed,true);assert.equal(sourceReady(result.record,second),true);
 const changed=beginSourceTransition(second);assert.match(claimSourceTransition({...second,title:'조회 이후 바뀐 제목'}).error,/변경/);
 assert.equal(changed.claimed,true);assert.equal(appliedSource(second),null);
});
test('편집실 조회는 기존 Core ID·부제 존재 여부를 보존하고 조회 중 변경은 차단',async()=>{
 const previous=globalThis.window;const id='b'.repeat(32);let calls=0,changed=false;
 ipcHandlers={coreBytes:async()=>{throw Error('사진 없는 기사 조회에서 바이너리 요청 금지');},core:async()=>{calls++;return {status:200,body:{draft:{articleId:id,revisionNo:changed&&calls%2===0?2:1,title:'실제 기사',content:'실제 본문',photos:[]}}};}};
 globalThis.window={pywebview:{api:ipcFixture}};
 try{
  const {getStudioArticle}=await import('../../../src/api/platform.js');
  const result=await getStudioArticle(id);assert.equal(result.article.articleId,id);assert.equal(result.article.content,'실제 본문');assert.equal(result.subtitle,undefined);
  changed=true;await assert.rejects(getStudioArticle(id),/조회 중 기사가 변경/);
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
test('기사·고정본을 조용히 섞지 않고 카드 편집과 원본 변경을 구분',()=>{
 assert.doesNotThrow(()=>assertSameSource(draft,draft,article));
 assert.throws(()=>assertSameSource({...draft,article_id:'other'},draft,article),/기사/);
 assert.throws(()=>assertSameSource(draft,{...draft,snapshot_id:'other'},article),/고정본/);
 assert.throws(()=>assertSameSource(draft,draft,{...article,content:'변경된 원문입니다.'}),/원본/);
 assert.throws(()=>assertSameSource(draft,draft,{...article,subtitle:'새 부제'}),/원본/);
 assert.throws(()=>assertSameSource(draft,draft,{...article,url:'https://example.test/new'}),/원본/);
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
test('부제 표시와 생성 입력은 별개이고 미지원 기록은 숨김, 원본은 보존',()=>{
 assert.equal(subtitleLabel({}),'부제 전달 미연결');assert.equal(subtitleLabel({subtitle:''}),'부제목 없음');
 assert.equal(subtitleLabel({subtitle:'실제 부제'}),'실제 부제');
 const legacy={blog:{title:'과거 사용자 기록'},threads:{opening:'지원 원고'}};
 assert.deepEqual(visibleDrafts(legacy),{threads:legacy.threads});assert.equal(legacy.blog.title,'과거 사용자 기록');
 assert.deepEqual(supportedPlatforms(['blog','instagram','threads']),['instagram','threads']);
 const ui={...article,subtitle:'표시 전용',content:article.content+'\n[사진:원본]'};
 const result={...draft,generation_source:sourceText(ui)};
 assert.doesNotThrow(()=>assertSameSource(result,result,ui));
 assert.equal(result.generation_input.article.subtitle,undefined);
 assert.throws(()=>assertSameSource(result,result,{...ui,content:article.content}),/원본/);
});
test('검수 상태는 편집 뒤 재검수 필요이고 렌더 메타데이터만으로 무효화하지 않음',()=>{
 const ready={...draft,validation_status:'passed',validation_review:{key:fingerprint(draft),result:{status:'passed'}}};
 assert.equal(reviewStatus(ready),'passed');assert.equal(reviewStatus(invalidateDraft(ready)),'needs_recheck');
 const edited=structuredClone(ready);edited.cards[0].content.detail='수정';assert.equal(reviewStatus(edited),'not_checked');
 assert.equal(fingerprint({...ready,rendered_image:{id:'x'}}),fingerprint(ready));
});

test('JPG 읽기는 IPC Core의 실제 미디어 참조를 쓰고 HTTP 주소에 의존하지 않음',async()=>{
 const previous=globalThis.window,calls=[],id='a'.repeat(32),assetId='10000000-0000-4000-8000-000000000001';
 ipcHandlers={core:async path=>{calls.push(path);return {status:200,body:{object_ref:'media:'+id}};},coreBytes:async path=>{calls.push(path);return 'data:image/jpeg;base64,/9j/2Q==';}};
 globalThis.window={pywebview:{api:ipcFixture}};
 try{
  const {storedJpg}=await import('../../../src/api/platform.js');
  const direct=await storedJpg({object_ref:'media:'+id,uri:'http://unreachable.invalid/card.jpg'});
  assert.equal(direct.type,'image/jpeg');assert.equal(direct.size,4);
  const restored=await storedJpg({id:assetId,uri:'http://unreachable.invalid/card.jpg'});
  assert.equal(restored.type,'image/jpeg');assert.deepEqual(calls,['/api/media/'+id,'/api/media-assets/'+assetId,'/api/media/'+id]);
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});

test('생성 카드의 빈 사진 메타데이터는 사진 없이 렌더하고 실제 사진의 저장 경계는 유지',async()=>{
 const previous=globalThis.window,calls=[];
 ipcHandlers={core:async(path,body)=>{calls.push({path,body});return {status:200,body:{asset:{id:'rendered-fixture',local_uri:'/api/media-assets/rendered-fixture/file'}}};},coreBytes:async()=>{throw Error('사진 없는 카드에서 사진 바이트를 읽으면 안 됩니다.');}};
 globalThis.window={pywebview:{api:ipcFixture}};
 try{
  const {renderStoredCard}=await import('../../../src/api/platform.js');
  const card={...draft.cards[0],photoId:undefined,image:{editable:true,selected_image_url:''}};
  const result={...draft,cards:[card]};
  assert.equal(selectedCardPhoto(card,article),null);
  const rendered=await renderStoredCard(card,article,result);
  assert.equal(rendered.id,'rendered-fixture');assert.equal(calls.length,1);
  assert.equal(calls[0].path,'/api/platform/render');assert.equal(calls[0].body.payload.template,'text_only');
  assert.equal(calls[0].body.payload.image?.url,undefined);
  const withPhoto={...card,photoId:'p'};
  await renderStoredCard(withPhoto,article,{...result,cards:[withPhoto]});
  assert.equal(calls[1].body.payload.image.url,article.photos[0].url);
  assert.equal(calls[1].body.payload.image.photographer,article.photos[0].source);
  await assert.rejects(renderStoredCard({...card,image:{url:'https://example.invalid/unimported.jpg'}},article,result),/팀 사진/);
  await assert.rejects(renderStoredCard({...card,photoId:'deleted'},article,result),/삭제/);
  assert.equal(calls.length,2,'저장되지 않은 사진과 삭제된 사진은 렌더 요청 전에 거부');
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
