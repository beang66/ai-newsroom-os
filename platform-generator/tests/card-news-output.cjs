// 실제 Chromium으로 편집 화면과 JPG 경로를 확인합니다. AI·SNS 게시를 호출하지 않습니다.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright');
const {createApp}=require('../server');
const Model=require('../lib/card-model');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'output','qa-card-news');
const article={article_id:'output-test',title:'서울시 도서관 주말 운영 확대 계획',content:'서울시는 다음 달부터 중앙·동부·서부 도서관의 주말 운영 시간을 두 시간 늘릴 계획입니다. 평일 운영 시간은 유지합니다. 시는 인력 배치를 마친 뒤 시행일을 확정할 예정이라고 밝혔습니다.'};
const design=layout=>({layout,highlights:['두 시간'],compact:false});
const make=(role,headline,answer,detail,layout='standard')=>({card_id:role+Math.random(),role,content_version:2,keyword:'도서관',headline,answer,detail,body:'',show_keyword:false,source_evidence:[article.content],design:design(layout)});
const sample={platform:'card_news',draft_version:2,card_news_options:{closing_type:'summary',service_message:''},core_text:{headline:article.title,summary:article.content,source_evidence:[article.content]},recommended_card_count:5,card_count_reason:'계획·대상·조건을 역할별로 설명합니다.',cards:[
 make('cover','서울시 도서관\n주말 운영 확대 계획','',''),
 make('body','주말 운영은 얼마나 늘어나나요?','주말 운영을 두 시간 늘릴 계획입니다.','중앙·동부·서부 도서관이 대상입니다.\n\n시행일은 인력 배치를 마친 뒤 확정할 예정이라고 서울시는 밝혔습니다.'),
 make('body','주말 확대와 평일 유지','주말만 운영 확대를 계획합니다.','주말: 운영 시간 두 시간 확대 계획\n평일: 현재 운영 시간 유지','comparison'),
 make('body','대상 도서관 세 곳','중앙·동부·서부 도서관이 대상입니다.','중앙 도서관\n동부 도서관\n서부 도서관','list'),
 make('closing','인력 배치 후 시행일 확정','','서울시는 인력 배치를 마친 뒤 시행일을 확정할 예정이라고 밝혔습니다.'),
]};
async function main(){
 process.env.PLATFORM_LOCAL_STORAGE="1";
 await fs.mkdir(qa,{recursive:true});
 const app=createApp({storageOptions:{rootDir:path.join(qa,'storage')}}),server=app.listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 let browser;const checks=[];
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1100}});
  page.on('dialog',d=>d.accept());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // 사진 추천 등 외부 AI 요청은 출력 검증에서 사용하지 않습니다.
  await page.route('**/api/photo/keywords',route=>route.fulfill({contentType:'application/json',body:'{"keywords":[]}'}));
  await page.goto(base);await page.waitForFunction(()=>!!window.TextEditor&&!!window.CardEditor);
  await page.evaluate(({sample,article})=>{sample.cards=sample.cards.map(c=>({...c,content:{keyword:c.keyword,headline:c.headline,body:c.body,answer:c.answer,detail:c.detail,show_keyword:c.show_keyword}}));CardEditor.applyCardNewsDraft(sample,CardEditor.getRevision(),{article,selected_keywords:[]});TextEditor.showPlatform('card_news');}, {sample,article});
  await page.evaluate(()=>document.fonts.ready);
  async function inspect(name,index){
   await page.getByRole('button',{name:`${index+1}번 카드 선택`,exact:true}).click();
   const fit=await page.evaluate(()=>CardTemplate.fitCard(document.querySelector('#canvas .news-card')));assert.equal(fit.overflow,false,name);assert.equal(fit.overlap,false,name);
   await page.locator('#canvas .news-card').screenshot({path:path.join(qa,name+'-preview.png')});
   const card=await page.evaluate(()=>displayCard(current(),active));
   const sameHeight=await page.evaluate(card=>{
    const wrapper=document.createElement('div');wrapper.style.cssText='position:absolute;left:-10000px;top:0;width:1080px';wrapper.innerHTML=CardTemplate.markup(card,false);document.body.append(wrapper);
    CardTemplate.fitCard(wrapper.querySelector('.news-card'));
    const equal=document.querySelector('#canvas .words').scrollHeight===wrapper.querySelector('.words').scrollHeight;wrapper.remove();return equal;
   },card);assert.equal(sameHeight,true,'미리보기와 JPG 글 영역: '+name);
   const response=await page.request.post(base+'/editor/render',{data:{card}});assert.equal(response.status(),200,await response.text());
   const rendered=await response.json();assert(rendered.success);const jpg=await page.request.get(base+rendered.image_url);assert.equal(jpg.status(),200);
   await fs.writeFile(path.join(qa,name+'.jpg'),await jpg.body());
   checks.push({name,fit,jpg:true});
  }
  await inspect('cover-no-photo',0);await inspect('body-no-photo',1);await inspect('comparison',2);await inspect('list',3);await inspect('summary-closing',4);
  // 여러 줄 답변의 실제 높이만큼 상세 설명을 아래에 배치합니다.
  await page.evaluate(()=>{state.cards[1].answer='주말 운영 시간을 두 시간 늘릴 계획입니다.\n중앙·동부·서부 도서관이 대상입니다.\n평일 운영 시간은 유지합니다.';active=1;draw();});
  assert(await page.evaluate(()=>{const a=document.querySelector('#canvas [data-field="answer"]').getBoundingClientRect(),b=document.querySelector('#canvas [data-field="detail"]').getBoundingClientRect();return b.top>a.bottom;}));
  await inspect('multiline-answer',1);
  await page.evaluate(answer=>{state.cards[1].answer=answer;draw();},sample.cards[1].answer);
  // 테스트용 사진 비트맵을 첨부해 사진·확대·위치·그라데이션도 함께 검증합니다.
  const photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1080;c.height=1350;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,1080,1350);g.addColorStop(0,'#639abc');g.addColorStop(1,'#194338');x.fillStyle=g;x.fillRect(0,0,c.width,c.height);x.fillStyle='#97af73';for(let i=0;i<7;i++)x.fillRect(100+i*140,300,55,750);return c.toDataURL('image/png');});
  await page.evaluate(photo=>{state.cards[1].image={url:photo,presentation:{zoom:1.4,x:35,y:45,strength:85,direction:'bottom'}};active=1;draw();},photo);
  await inspect('body-with-photo',1);
  await page.getByRole('button',{name:'5번 카드 선택',exact:true}).click();await page.evaluate(()=>{current().farewell='읽어주셔서 감사합니다.';dirty();draw();});await inspect('farewell-closing',4);
  // 전체 실제 저장·복원 경로를 통과한 뒤 같은 필드를 확인합니다.
  const snapshot=await page.evaluate(()=>structuredClone(state));
  const stored=await page.request.post(base+'/api/local/drafts',{data:{draft:snapshot}});assert.equal(stored.status(),201);const saved=await stored.json();
  const restored=await(await page.request.get(base+'/api/local/drafts/'+saved.id)).json();
  await page.evaluate(draft=>CardEditor.loadDraft(draft),restored.draft);
  assert.equal(await page.locator('#card-closing-type').count(),0);assert.equal(await page.evaluate(()=>state.cards.at(-1).farewell),'읽어주셔서 감사합니다.');
  assert.equal(await page.evaluate(()=>state.cards[1].answer),sample.cards[1].answer);assert.equal(await page.evaluate(()=>state.cards[1].image.presentation.zoom),1.4);
  // 첨부 미리보기는 두 플랫폼 모두 편집 가능한 요소 없이 같은 카드를 사용합니다.
  await page.evaluate(({article})=>{for(const platform of ['instagram','threads'])state.text_drafts[platform]={opening:'도서관 운영 확대 계획',paragraphs:['도서관 주말 운영 확대를 계획합니다.'],closing:'',hashtags:['#도서관','#운영','#서울시'],generation_input:{article,selected_keywords:[]}};TextEditor.showPlatform('instagram');},{article});
  assert.equal(await page.locator('#platform-panel .news-card [contenteditable=true]').count(),0);
  await page.evaluate(()=>TextEditor.showPlatform('threads'));assert.equal(await page.locator('#platform-panel .news-card [contenteditable=true]').count(),0);
  await page.evaluate(()=>TextEditor.showPlatform('card_news'));
  // 긴 설명과 긴 비교·목록은 같은 화면 측정과 서버 측정 모두에서 차단합니다.
  for(const layout of ['standard','comparison','list']){
   const detail=layout==='standard'?'긴 설명입니다. '.repeat(150):Array(layout==='comparison'?2:3).fill('상세 항목입니다. '.repeat(70)).join('\n');
   const card={...sample.cards[1],detail,design:design(layout)};
   await page.evaluate(card=>{Object.assign(state.cards[1],card);active=1;draw();},card);
   const fit=await page.evaluate(()=>CardTemplate.fitCard(document.querySelector('#canvas .news-card')));assert.equal(fit.overflow,true,layout);
   const response=await page.request.post(base+'/editor/render',{data:{card}});assert.equal(response.status(),400,layout);assert.match((await response.json()).error,/넘/);
   checks.push({name:'overflow-'+layout,fit,blocked:true});
  }
  // 이동으로 겹친 박스는 JPG를 차단하고 기본 배치로 복원하면 정상 표시합니다.
  const overlapCard={...sample.cards[1],text_positions:{detail:{x:0,y:-200}}};
  await page.evaluate(card=>{Object.assign(state.cards[1],card);active=1;draw();},overlapCard);
  assert.equal(await page.evaluate(()=>checkCardFit().overlap),true);assert.match(await page.locator('#card-fit-status').textContent(),/겹/);
  const overlapResponse=await page.request.post(base+'/editor/render',{data:{card:overlapCard}});assert.equal(overlapResponse.status(),400);assert.match((await overlapResponse.json()).error,/겹/);
  await page.locator('#reset-text-positions').click();assert.equal(await page.evaluate(()=>checkCardFit().overlap),false);checks.push({name:'drag-overlap',blocked:true});
  const emptyNotice=await page.request.post(base+'/editor/render',{data:{card:{role:'closing',closing_type:'service',service_message:''}}});assert.equal(emptyNotice.status(),400);
  // 실제 AI 확인 파일이 있을 때도 같은 편집기와 출력 경로를 통과합니다.
  for(const type of ['automatic-four']){
   let result;try{result=JSON.parse(await fs.readFile(path.join(qa,'real-ai-'+type+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
   await page.evaluate(({draft,article})=>{CardEditor.applyCardNewsDraft(draft,CardEditor.getRevision(),{article,selected_keywords:[]});TextEditor.showPlatform('card_news');},result);
   for(let i=0;i<result.draft.cards.length;i++)await inspect('real-ai-'+type+'-'+(i+1),i);
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(qa,'report.json'),JSON.stringify({validation:'synthetic fixture; no real AI or SNS publishing',checks,errors},null,2));
  console.log(JSON.stringify({checks:checks.length,jpg_count:checks.filter(c=>c.jpg).length,overflow_blocked:checks.filter(c=>c.blocked).length,page_errors:errors.length,output:qa}));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
