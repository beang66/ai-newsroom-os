// 통합 계약 테스트: 실제 SNS 게시/AI 과금 없이 경로·저장·프론트·게시 상태를 검증합니다.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
// Persistence tests explicitly opt into development storage; default 410 is tested separately.
process.env.PLATFORM_LOCAL_STORAGE='1';
const {createThreadsService,validateThreadsInput}=require('../threads-local-service');
const {validateInput,selectOriginalRatio}=require('../instagram-local-service');
const {getPlatformRules}=require('../platform-rules');
const template=require('../lib/card-template');
const jpg={mime:'image/jpeg',order:1,data_url:'data:image/jpeg;base64,/9j/2Q=='};
test('업로드 사진과 Unsplash 사진은 실제 출처를 미리보기·JPG 공용 템플릿에 유지',()=>{
 const card={card_id:'credit',role:'body',content_version:2,headline:'도서관',image:{url:'data:image/png;base64,YQ==',source:'직접 업로드',provider:'upload'}};
 assert(template.markup(card).includes('직접 업로드'));assert(!template.markup(card).includes('Unsplash'));
 card.image={...card.image,photographer:'사진가',provider:'unsplash',sourceUrl:'https://unsplash.com/photos/fixture'};
 const html=template.markup(card);assert(html.includes('Photo by 사진가'));assert(html.includes('on <a'));assert(html.includes('/photos/fixture?utm_source='));
 card.image={...card.image,provider:'donga',source:'동아일보 DB',photographer:'동아일보 DB',sourceUrl:'https://www.donga.com/archive/'};
 assert(template.markup(card).includes('https://www.donga.com/archive/'));assert(!template.markup(card).includes('Unsplash'));
});
function browserFixture(){
 let text='',photos=[],posted=0,closed=false;const empty={count:async()=>0,isVisible:async()=>false,waitFor:async()=>{throw Error('absent')},first(){return this;}};
 const field={count:async()=>1,isVisible:async()=>true,focus:async()=>{},fill:async value=>{text=value},evaluate:async fn=>fn({tagName:'DIV',innerText:text})};
 const images={evaluateAll:async fn=>fn(photos.map(src=>({getAttribute:()=>src}))),first(){return this;},waitFor:async()=>{}};
 const file={count:async()=>1,setInputFiles:async files=>{photos=files.map((_,i)=>'blob:fixture-'+i)}};
 const button={count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,click:async()=>{posted++}};
 const dialog={count:async()=>1,isVisible:async()=>true,waitFor:async()=>{},getByRole:(role,options)=>role==='button'&&options.name instanceof RegExp?button:empty,locator:s=>s.startsWith('[contenteditable')?field:s.startsWith('img[')?images:s==='input[type="file"]'?file:empty};
 const page={isClosed:()=>closed,url:()=> 'https://www.threads.com/',bringToFront:async()=>{},goto:async()=>{},evaluate:async()=> 'fixture_owner',getByRole:role=>role==='dialog'?dialog:empty,getByText:()=>empty,locator:()=>empty,keyboard:{press:async()=>{text+='\n'},insertText:async v=>{text+=v}}};
 let onClose;const context={newPage:async()=>page,on:(event,fn)=>{onClose=fn},close:async()=>{closed=true;onClose?.()}};
 return {chromium:{launchPersistentContext:async()=>context},get posted(){return posted;},editText:v=>{text=v;},get text(){return text;},photos:()=>photos};
}
test('지원 대상과 입력 제한',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 assert.throws(()=>getPlatformRules('blog'),/지원하지/);for(const p of ['instagram','threads','card_news'])assert(getPlatformRules(p).writing_rules);
 assert.deepEqual(validateThreadsInput({text:'📰 제목\n\n본문',assets:[]}).files,[]);
 assert.throws(()=>validateThreadsInput({text:'가'.repeat(501),assets:[]}),/500/);
 assert.throws(()=>validateThreadsInput({text:'본문',assets:[{...jpg,data_url:'invalid'}]}));
 assert.equal(validateInput({text:'본문',assets:[jpg]}).files.length,1);
 let clicks=0;await selectOriginalRatio({},async()=>{clicks++;return true});assert.equal(clicks,2);
 await assert.rejects(selectOriginalRatio({},async()=>false),/다음 단계/);
});
test('Threads 작성 준비는 게시하지 않으며 사진·줄바꿈과 중복 게시 방지',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'newsroom-profile-test-')),b=browserFixture(),s=createThreadsService({chromium:b.chromium,profileDir:dir});
 try{
  await s.connect();assert.equal((await s.status()).connected,true);
  const text='📰 제목\n\n첫 문장\n둘째 문장';const result=await s.prepare({text,assets:[jpg]});
  assert.equal(result.image_count,1);assert.equal(b.text,text);assert.equal(b.posted,0);
  await assert.rejects(s.publish({id:result.id,reviewed:false}),/확인/);
  await s.publish({id:result.id,reviewed:true});assert.equal(b.posted,1);
  await assert.rejects(s.publish({id:result.id,reviewed:true}),/준비된/);assert.equal(b.posted,1);
 }finally{await s.close();await fsp.rm(dir,{recursive:true,force:true});}
});
test('Threads 준비 후 본문 변경은 게시 차단',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'newsroom-profile-test-')),b=browserFixture(),s=createThreadsService({chromium:b.chromium,profileDir:dir});
 try{await s.connect();const r=await s.prepare({text:'원고',assets:[]});b.editText('변경된 원고');await assert.rejects(s.publish({id:r.id,reviewed:true}),/다릅니다/);assert.equal(b.posted,0);}finally{await s.close();await fsp.rm(dir,{recursive:true,force:true});}
});
test('사진 설정은 JSON 저장 후에도 공통 카드 출력에 보존',()=>{
 const card={headline:'제목',body:'본문',keyword:'핵심',image:{url:'data:image/jpeg;base64,YQ==',presentation:{zoom:1.7,x:30,y:40,direction:'bottom',strength:65}}};
 assert.equal(template.markup(JSON.parse(JSON.stringify(card))),template.markup(card));assert(template.markup(card).includes('scale(1.7)'));
});
test('Express 통합: 두 로컬 경로, 중단 경로 거부, 저장 왕복',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 const {createApp}=require('../server');const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'newsroom-storage-test-'));
 const stub={connect:async()=>({success:true}),status:async()=>({success:true,connected:true}),prepare:async()=>({success:true}),publish:async()=>({success:true}),close:async()=>({success:true})};
 const priorOrigin=process.env.NEWSROOM_EDITOR_ORIGIN;process.env.NEWSROOM_EDITOR_ORIGIN="http://localhost:5173";
 const server=createApp({instagramService:stub,threadsService:stub,storageOptions:{rootDir:dir}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(p,b,headers={})=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(b)});
 try{
  assert.equal((await fetch(base+'/health')).status,200);
  for(const name of ['instagram','threads'])assert.equal((await fetch(base+'/api/'+name+'-local/status')).status,200);
  assert.equal((await post('/api/threads-local/connect',{}, {Origin:'https://other.invalid'})).status,403);
  assert.equal((await post('/api/threads-local/connect',{}, {Origin:'http://localhost:5173'})).status,200);
  assert.equal((await post('/api/generate/blog',{})).status,400);assert.equal((await post('/api/validate',{platform:'blog'})).status,400);
  assert.equal((await fetch(base+'/sns-export-ui.js')).status,404);
  const missingCard=await post('/render',{});assert.equal(missingCard.status,400);assert.equal((await missingCard.json()).error,'card_id is required');
  const draft={cards:[{card_id:'C1',headline:'저장',image:{url:'data:image/jpeg;base64,YQ==',presentation:{zoom:1.7}}}],text_drafts:{threads:{opening:'📰 제목',paragraphs:['본문'],closing:''}}};
  const saved=await (await post('/api/local/drafts',{draft})).json();assert(saved.success);const loaded=await (await fetch(base+'/api/local/drafts/'+saved.id)).json();assert.equal(loaded.draft.cards[0].image.presentation.zoom,1.7);
 }finally{if(priorOrigin===undefined)delete process.env.NEWSROOM_EDITOR_ORIGIN;else process.env.NEWSROOM_EDITOR_ORIGIN=priorOrigin;await new Promise(r=>server.close(r));await fsp.rm(dir,{recursive:true,force:true});}
});
class LocalScripts extends ResourceLoader{fetch(url){const p=new URL(url).pathname.slice(1);const file=fs.existsSync(path.join(root,'lib',p))?path.join(root,'lib',p):path.join(root,'public',p);return fs.existsSync(file)&&fs.statSync(file).isFile()?Promise.resolve(fs.readFileSync(file)):null;}}
test('실제 화면 스크립트 로드: 두 플랫폼·독립 카드, 오류 없음',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(root,'public/index.html'),'utf8'),{url:'http://localhost:3001/',runScripts:'dangerously',resources:new LocalScripts(),pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.structuredClone=structuredClone;w.ResizeObserver=class{observe(){}disconnect(){}};w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=()=>{};}});
 try{
  await new Promise(r=>dom.window.addEventListener('load',r,{once:true}));const w=dom.window;
  assert.deepEqual([...w.document.querySelectorAll('.platform input')].map(i=>i.value),['instagram','threads']);assert(w.TextEditor);assert(w.CardEditor);
  assert.equal(w.document.getElementById('article-content'),null);
  assert.equal(w.document.getElementById('suggest-keywords'),null);
  assert.equal(w.document.getElementById('editing-notice'),null);
  assert.equal(w.document.getElementById('generate-instagram-text'),null);
  assert.equal(w.document.getElementById('generate-threads-text'),null);
  const selectedButton=w.document.getElementById('generate-selected'),cardOnly=w.document.getElementById('generate-card-news');
  assert.equal(selectedButton.nextElementSibling.id,'card-news-generation-tools');
  assert(selectedButton.nextElementSibling.contains(cardOnly));
  w.document.getElementById('include-card-news').checked=true;w.document.getElementById('include-card-news').dispatchEvent(new w.Event('change'));
  assert.equal(cardOnly.parentElement.hidden,false);
  w.document.getElementById('include-card-news').checked=false;w.document.getElementById('include-card-news').dispatchEvent(new w.Event('change'));
  assert.equal(cardOnly.parentElement.hidden,false);
  assert.equal(w.document.getElementById('generation-status').textContent,'');
  assert(w.document.getElementById('include-card-news').parentElement.textContent.includes('카드뉴스 포함'));

  assert(w.document.getElementById('stage').closest('.panel').contains(w.document.getElementById('validate-current-draft')));
  const source={article_id:'db-ready',url:'https://example.com/article',title:'기사',content:'보관 원문'};
  w.NewsInput.restore({article:source});assert.equal(w.NewsInput.getRequest().article.content,'보관 원문');assert.equal(w.NewsInput.getRequest().article.article_id,'db-ready');assert.equal(w.NewsInput.getRequest().selected_keywords.length,0);
  assert.equal(w.document.getElementById('article-url'),null);assert.equal(w.document.getElementById('import-article'),null);
  assert.equal(w.document.getElementById('article-title').textContent,'기사');assert.equal(w.document.getElementById('article-subtitle').textContent,'부제 전달 미연결');
  const component=fs.readFileSync(path.join(root,'public/assets/photo-tools.js'),'utf8').replace('import.meta.url',"'http://localhost:3001/assets/photo-tools.js'").replace('export class','class');w.eval(component);
  w.HTMLDialogElement.prototype.close=function(){this.open=false};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
  w.eval(fs.readFileSync(path.join(root,'public/assets/photo-bridge.js'),'utf8').replace("import './photo-tools.js';",''));
  assert(w.document.getElementById('card-workspace').contains(w.document.querySelector('.photo-tools')));
  assert(!w.document.getElementById('platform-panel').contains(w.document.querySelector('.photo-tools')));
  w.eval("current().image={url:'data:image/jpeg;base64,YQ=='};draw();");
  const zoom=w.document.querySelector('[data-photo="zoom"]');zoom.value='175';zoom.dispatchEvent(new w.Event('input'));assert.equal(w.eval('current().image.presentation.zoom'),1.75);assert(w.document.getElementById('canvas').innerHTML.includes('scale(1.75)'));
  w.NewsInput.restore({article:{article_id:'other',title:'다른 기사',subtitle:'실제 부제',content:''}});assert.equal(w.NewsInput.getRequest().article.content,'');assert.equal(w.document.getElementById('article-subtitle').textContent,'실제 부제');

  // 카드별 추천 4장, 자동 삽입 금지, 선택/취소/되돌리기와 캐시 확인.
  let searches=0,keywordCalls=0,blobCalls=0;
  const photos=Array.from({length:4},(_,i)=>({id:'photo'+i,alt_description:'도시',urls:{small:'https://images.unsplash.com/fixture'+i,full:'https://images.unsplash.com/fixture'+i},user:{name:'작가'+i,links:{html:'https://unsplash.com/@fixture'}},links:{html:'https://unsplash.com/photos/fixture'}}));
  w.NewsApi.suggestPhotoKeywords=async(body,signal,card)=>{keywordCalls++;assert.equal(body,[card.keyword,card.headline,card.body].filter(Boolean).join('\n'));assert(!body.includes('원문 정보'));return {keywords:['city','street','building']}};
  w.NewsApi.searchTeamPhotos=async(query,page,signal,perPage)=>{searches++;assert.equal(perPage,4);return {photos}};
  w.NewsApi.getTeamPhotoBlob=async()=>{blobCalls++;return new w.Blob(['photo'],{type:'image/jpeg'})};
  w.TextEditor.showPlatform('card_news');
  w.eval(`state.card_news={};state.card_news_generation_input={article:{title:'기사',content:'원문 정보 '.repeat(30)}};active=1;draw();`);
  await new Promise(r=>setTimeout(r,10));
  assert.equal(w.document.querySelectorAll('[data-recommendations] .recommended-photo').length,4);
  assert.equal(w.eval('current().image'),undefined);assert.equal(keywordCalls,1);assert.equal(searches,1);
  w.eval("current().keyword='edited';current().headline='short';current().body='card';draw();");
  await new Promise(r=>setTimeout(r,10));assert.equal(keywordCalls,2);assert.equal(searches,2);
  w.document.querySelector('[data-recommend-query]').value='manual search';
  w.document.querySelector('[data-recommend-search]').click();await new Promise(r=>setTimeout(r,10));assert.equal(keywordCalls,2);assert.equal(searches,3);
  w.document.querySelector('.recommended-photo').click();
  // FileReader의 실제 완료를 기다린다. CPU 부하에 따라 20ms 타이머 전에 끝난다고 가정하지 않는다.
  for(let attempt=0; !w.eval('current().image?.url') && attempt<200; attempt++)await new Promise(r=>setTimeout(r,10));
  assert.equal(blobCalls,1);assert(w.eval('current().image.url').startsWith('data:image/jpeg;base64,'));
  assert.equal(w.document.querySelector('[data-photo-edit]').hidden,false);
  const savedImage=w.eval('current().image.url');w.document.querySelector('[data-replace]').click();
  assert.equal(w.document.querySelector('[data-photo-selection]').hidden,false);
  w.document.querySelector('[data-keep-photo]').click();assert.equal(w.eval('current().image.url'),savedImage);
  w.document.querySelector('[data-remove]').click();assert.equal(w.eval('current().image'),undefined);
  w.document.querySelector('[data-photo-undo]').click();assert.equal(w.eval('current().image.url'),savedImage);
  w.document.querySelector('[data-photo-undo]').click();assert.equal(w.eval('current().image'),undefined);
  w.eval('active=0;draw();');await new Promise(r=>setTimeout(r,0));w.eval('active=1;draw();');await new Promise(r=>setTimeout(r,0));assert.equal(searches,3);
  w.eval(`state.card_news_generation_input={article:{title:'기사',content:'원문'}};`);
  w.TextEditor.applyDraft('threads',{platform:'threads',opening:'📰 제목',paragraphs:['본문'],closing:'',source_evidence:[]},{article:{title:'기사',content:'원문'}},w.CardEditor.getRevision());
  w.TextEditor.showPlatform('threads');await new Promise(r=>setTimeout(r,0));
  assert.equal(w.TextEditor.getPlatform(),'threads');assert.equal(w.document.querySelector('#local-publish-tools')?.dataset.platform,'threads');
  assert(!w.document.querySelector('script[src*="sns-export"]'));
  assert(w.document.querySelector('.sns-composer.threads'));
  assert.equal(w.document.querySelectorAll('.composer-card-mini').length,3);
  assert.equal(w.document.querySelector('.composer-card-mini [contenteditable]'),null);
  const firstText=w.document.querySelector('.composer-fields textarea');firstText.value='📰 수정된 제목';firstText.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal(w.eval('state.text_drafts.threads.opening'),'📰 수정된 제목');
  assert(w.document.getElementById('threads-post-preview').textContent.includes('📰 수정된 제목'));
  assert.equal(w.document.querySelector('.photo-tools').hidden,true);
  firstText.value='📰 제목';firstText.dispatchEvent(new w.Event('input',{bubbles:true}));
  w.document.querySelector('.composer-attachments button').click();assert.equal(w.TextEditor.getPlatform(),'card_news');assert.equal(w.document.querySelector('.photo-tools').hidden,false);
  w.TextEditor.showPlatform('threads');await new Promise(r=>setTimeout(r,0));

  // 카드뉴스가 있으면 Threads 작성 요청에 최신 카드 3장을 자동 포함합니다.
  w.eval(`state.card_news={};state.card_news_generation_input={article:{title:'기사',content:'원문'}};`);
  let sent;w.NewsApi.renderPublishCards=async cards=>cards.map((c,i)=>({...jpg,order:i+1}));
  w.NewsApi.threadsLocalPrepare=async payload=>{sent=payload;return {success:true,id:'fixture',status:'ready',message:'준비',image_count:payload.assets.length};};
  const section=w.document.querySelector('#local-publish-tools');
  [...section.querySelectorAll('button')].find(b=>b.textContent.startsWith('3.')).click();
  await new Promise(r=>setTimeout(r,10));assert(sent);assert.equal(sent.assets.length,3);assert.equal(sent.text,'📰 제목\n\n본문');
  w.TextEditor.applyDraft('instagram',{platform:'instagram',opening:'인스타 제목',paragraphs:['본문'],closing:'마무리',hashtags:['#기사','#뉴스','#핵심'],source_evidence:[]},{article:{title:'기사',content:'원문'}},w.CardEditor.getRevision());
  w.TextEditor.showPlatform('instagram');assert(w.document.querySelector('.sns-composer.instagram'));assert.equal(w.document.querySelectorAll('.composer-card-mini').length,3);
  assert.equal(w.document.querySelector('.composer-card-mini [contenteditable]'),null);
  w.TextEditor.showPlatform('threads');
  // 구형 저장본의 중단 플랫폼 데이터를 다시 켜지 않습니다.
  w.eval(`applySavedDraft({cards:state.cards,platforms:['instagram','threads','blog'],text_drafts:{threads:state.text_drafts.threads,blog:{title:'이전 자료'}},validation_results:{blog:{status:'passed'}}});`);
  assert.equal(w.eval('state.text_drafts.blog.title'),'이전 자료');assert.equal(w.eval('state.validation_results.blog.status'),'passed');assert.equal(w.eval('state.platforms.includes("blog")'),false);
  assert.equal(w.document.querySelector('[data-platform="blog"]'),null);
  // 개별 버튼 없이도 선택한 플랫폼의 일괄 생성은 유지됩니다.
  const dbArticle={article_id:'a'.repeat(32),title:'기사',subtitle:'실제 부제',content:'원문',url:''};
  w.NewsInput.restore({article:dbArticle,selected_keywords:[],requirements:''});
  [...w.document.querySelectorAll('.platform input')].forEach(el=>el.checked=true);
  const generated=[];w.NewsApi.generateDraft=async(platform,input)=>{generated.push(platform);assert.equal(input.selected_keywords.length,0);return {draft:platform==='instagram'?{platform,opening:'제목',paragraphs:['본문'],closing:'정리',hashtags:['#기사','#뉴스','#핵심'],source_evidence:[]}:{platform,opening:'📰 제목',paragraphs:['요약'],closing:'',source_evidence:[]}}};
  selectedButton.click();await new Promise(r=>setTimeout(r,10));assert.deepEqual(generated,['instagram','threads']);assert.equal(selectedButton.disabled,false);
  // 카드뉴스 포함을 체크하지 않아도 단독 카드 생성은 요청됩니다.
  w.document.getElementById('include-card-news').checked=false;
  let cardRequested=false;w.NewsApi.generateCardNews=async input=>{cardRequested=true;return {draft:{platform:'card_news',recommended_card_count:3,card_count_reason:'테스트 구성',core_text:{headline:'제목',summary:'요약',source_evidence:['원문'],evidence_valid:true},cards:Array.from({length:3},(_,i)=>({card_id:'C'+i,page:i+1,role:i===0?'cover':i===2?'closing':'body',content:{keyword:'핵심',headline:'제목',body:'본문'},source_evidence:['원문'],evidence_valid:true}))}}};
  cardOnly.click();await new Promise(r=>setTimeout(r,10));assert.equal(cardRequested,true);assert.equal(cardOnly.disabled,false);assert.equal(w.TextEditor.getPlatform(),'card_news');
  assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});
test('사진 선택은 별도 편집창 없이 원본을 카드에 전달',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 const {window:w}=new JSDOM('<body></body>',{runScripts:'outside-only',url:'http://localhost:3001'});w.structuredClone=structuredClone;
 try{
  const component=fs.readFileSync(path.join(root,'public/assets/photo-tools.js'),'utf8').replace('import.meta.url',"'http://localhost:3001/assets/photo-tools.js'").replace('export class','class');
  w.eval(component);const p=w.document.createElement('photo-tools');w.document.body.append(p);
  let result;p.addEventListener('photo-selected',e=>{result=e.detail});
  p.blobData=async()=> 'data:image/jpeg;base64,YQ==';
  await p.upload([{type:'image/jpeg',size:100,name:'사진.jpg'}]);
  assert.equal(result.original,result.data);assert.equal(result.alt,'사진.jpg');assert.equal(p.shadowRoot.querySelector('[data-image-apply]'),null);
  let tracked=0;w.NewsApi={getTeamPhotoBlob:async()=>({}),trackTeamPhoto:async()=>{tracked++}};
  await p.importPhoto({id:'test',urls:{full:'https://images.unsplash.com/test'},user:{name:'작가',links:{html:'https://unsplash.com/@author'}},links:{html:'https://unsplash.com/photos/test'}});
  assert.equal(tracked,1);assert.equal(result.photographer,'작가');
 }finally{w.close();}
});
test('생성 경로는 빈 키워드와 미지정 키워드를 허용하고 잘못된 입력은 거부',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 const paths=['card-news-generator','instagram-generator','text-generator'].map(n=>require.resolve('../'+n));
 const originals=paths.map(p=>require.cache[p]);
 const stub=async input=>({platform:'fixture',selected_keywords:input.selected_keywords,article:input.article});
 paths.forEach((p,i)=>require.cache[p]={id:p,filename:p,loaded:true,exports:i===0?{generateCardNews:stub}:i===1?{generateInstagram:stub}:{generateTextPlatform:async(_,input)=>stub(input)}});
 const route=require.resolve('../generate-routes');const prior=require.cache[route];delete require.cache[route];
 try{
  let handler;require(route)({post:(_,fn)=>handler=fn});
  for(const keywords of [undefined,[]]){
   let code=200,result;const res={status(c){code=c;return this},json(v){result=v;return this}};
   await handler({params:{platform:'card_news'},body:{article:{article_id:'db-id',title:'제목',subtitle:'DB 부제',content:'본문'},...(keywords===undefined?{}:{selected_keywords:keywords})}},res);
   assert.equal(code,200);assert.deepEqual(result.draft.selected_keywords,[]);
   assert.deepEqual(result.draft.article,{article_id:'db-id',title:'제목',content:'본문'});assert.equal(result.draft.source_url,'');
  }
  let code;await handler({params:{platform:'card_news'},body:{article:{article_id:'db-id',title:'제목',content:'본문'},selected_keywords:'invalid'}},{status(c){code=c;return this},json(){}});assert.equal(code,400);
  for(const article of [{title:'제목',content:'본문'},{article_id:'db-id',title:'제목',content:{type:'doc'}}]) {
   await handler({params:{platform:'card_news'},body:{article}},{status(c){code=c;return this},json(){}});assert.equal(code,400);
  }
 }finally{paths.forEach((p,i)=>{if(originals[i])require.cache[p]=originals[i];else delete require.cache[p]});if(prior)require.cache[route]=prior;else delete require.cache[route];}
});

test('실제 카드·Threads 생성기는 빈 키워드로 AI 호출 단계까지 진행',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 const adapter=require.resolve('../ai-provider'),saved=require.cache[adapter];
 class FakeAI {static apiKey='fixture';constructor(){this.responses={create:async options=>{assert(options.instructions.includes('선택 키워드가 비어'));throw Error('fixture-ai-called')}}}}
 require.cache[adapter]={id:adapter,filename:adapter,loaded:true,exports:FakeAI};
 const modules=['card-news-generator','text-generator'].map(n=>require.resolve('../'+n)),originals=modules.map(p=>require.cache[p]);modules.forEach(p=>delete require.cache[p]);
 try{
  const input={article:{title:'제목',content:'기사 본문'},selected_keywords:[],requirements:''};
  await assert.rejects(require(modules[0]).generateCardNews(input),/fixture-ai-called/);
  await assert.rejects(require(modules[1]).generateTextPlatform('threads',input),/fixture-ai-called/);
 }finally{if(saved)require.cache[adapter]=saved;else delete require.cache[adapter];modules.forEach((p,i)=>{if(originals[i])require.cache[p]=originals[i];else delete require.cache[p]})}
});

test('사진 검색은 기존 3장과 추천 4장을 지원하고 범위 밖 요청은 거부',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 const {createApp}=require('../server');const nativeFetch=global.fetch,key=process.env.UNSPLASH_ACCESS_KEY;process.env.UNSPLASH_ACCESS_KEY='fixture';
 const sizes=[];global.fetch=async(url,options)=>{
  const u=new URL(url);if(u.hostname!=='api.unsplash.com')return nativeFetch(url,options);
  sizes.push(Number(u.searchParams.get('per_page')));
  return new Response(JSON.stringify({results:Array.from({length:6},(_,i)=>({id:'photo'+i})),total_pages:2,total:6}),{headers:{'Content-Type':'application/json'}});
 };
 const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try {
  const defaultResult=await(await nativeFetch(base+'/api/unsplash/search?q=city')).json();assert.equal(defaultResult.photos.length,3);
  const recommendation=await(await nativeFetch(base+'/api/unsplash/search?q=city&per_page=4')).json();assert.equal(recommendation.photos.length,4);
  assert.equal((await nativeFetch(base+'/api/unsplash/search?q=city&per_page=100')).status,400);assert.deepEqual(sizes,[3,4]);
 }finally{global.fetch=nativeFetch;if(key===undefined)delete process.env.UNSPLASH_ACCESS_KEY;else process.env.UNSPLASH_ACCESS_KEY=key;await new Promise(r=>server.close(r));}
});
test('추천 요청 중 카드 전환 시 오래된 사진은 새 카드에 표시되지 않음',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(root,'public/index.html'),'utf8'),{url:'http://localhost:3001/',runScripts:'dangerously',resources:new LocalScripts(),pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.structuredClone=structuredClone;w.ResizeObserver=class{observe(){}disconnect(){}};w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=()=>{}}});
 try {
  await new Promise(r=>dom.window.addEventListener('load',r,{once:true}));const w=dom.window;
  const component=fs.readFileSync(path.join(root,'public/assets/photo-tools.js'),'utf8').replace('import.meta.url',"'http://localhost:3001/assets/photo-tools.js'").replace('export class','class');w.eval(component);
  w.HTMLDialogElement.prototype.close=function(){this.open=false};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
  let finish;let calls=0;w.NewsApi.suggestPhotoKeywords=async()=>({keywords:['city','nature','street']});
  w.NewsApi.searchTeamPhotos=async()=>{calls++;if(calls===1)return new Promise(r=>finish=r);return {photos:[]}};
  w.eval(fs.readFileSync(path.join(root,'public/assets/photo-bridge.js'),'utf8').replace("import './photo-tools.js';",''));
  w.eval(`state.card_news={};state.card_news_generation_input={article:{title:'기사',content:'원문 '.repeat(40)}};`);
  w.TextEditor.showPlatform('card_news');await new Promise(r=>setTimeout(r,0));assert(finish);
  w.eval('active=1;draw();');await new Promise(r=>setTimeout(r,0));
  finish({photos:[{id:'old',urls:{small:'https://images.unsplash.com/old'},user:{name:'이전 작가',links:{html:'https://unsplash.com/@old'}}}]});await new Promise(r=>setTimeout(r,0));
  assert.equal(w.document.querySelectorAll('.recommended-photo').length,0);assert(w.document.querySelector('[data-photo-title]').textContent.startsWith('2번'));assert.deepEqual(errors,[]);
 }finally{dom.window.close()}
});
