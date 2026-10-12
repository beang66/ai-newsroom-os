// 실제 마우스 입력으로 배율·경계·독립 이동·저장·복원·JPG 좌표를 검증합니다.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright'),{createApp}=require('../server');
const output=path.resolve(__dirname,'../output/qa-text-position');
const article={title:'도서관 주말 운영 확대 계획',content:'시는 두 곳의 도서관 주말 운영을 두 시간 늘릴 계획입니다. 인력 배치를 마친 뒤 시행일을 확정할 예정입니다.'};
const make=(role,headline,answer,detail)=>({card_id:role,role,content_version:2,content:{keyword:'도서관',headline,answer,detail,body:'',show_keyword:true,farewell:role==='closing'?'읽어주셔서 감사합니다.':''},source_evidence:[article.content],design:{layout:'standard',highlights:[],compact:false}});
const draft={platform:'card_news',cards:[make('cover','도서관 주말\n운영 확대 계획','','두 시간 확대를 계획합니다.'),make('body','무엇이 바뀌나요?','주말 운영을 두 시간 늘릴 계획입니다.','두 곳의 도서관이 대상입니다.\n\n시행일은 인력 배치 후 확정할 예정입니다.'),make('closing','인력 배치 후 시행일 확정','','확대는 계획 단계이며 인력 배치 후 시행일을 확정할 예정입니다.')],core_text:{headline:article.title,summary:article.content,source_evidence:[article.content]},recommended_card_count:3,card_count_reason:'사건·조건·현재 상태'};
async function main(){
 process.env.PLATFORM_LOCAL_STORAGE="1";
 await fs.mkdir(output,{recursive:true});const server=createApp({storageOptions:{rootDir:path.join(output,'storage')}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/api/photo/keywords',r=>r.fulfill({contentType:'application/json',body:'{"keywords":[]}'}));
  let requested;await page.route('**/api/generate/card_news',r=>{requested=r.request().postDataJSON();return r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,draft})});});
  await page.goto(base);await page.waitForFunction(()=>!!window.CardEditor&&!!window.TextEditor);
  await page.evaluate(article=>NewsInput.restore({article,selected_keywords:[]}),article);
  await page.locator('#generate-card-news').click();await page.waitForFunction(()=>document.getElementById('generation-status').textContent.includes('3장 생성 완료'));
  assert(!Object.hasOwn(requested,'card_news_options'));assert.equal(await page.locator('#card-closing-type,#card-service-message').count(),0);
  const checks=[];
  async function select(index){await page.getByRole('button',{name:`${index+1}번 카드 선택`,exact:true}).click();}
  async function drag(field,dx,dy){
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const element=page.locator(`#canvas [data-field="${field}"]`);await element.click({position:{x:20,y:15}});
   const before=await page.evaluate(field=>({position:current().text_positions[field]||{x:0,y:0},ratio:document.querySelector('#canvas .news-card').getBoundingClientRect().width/1080}),field);
   const h=await page.locator('#canvas .text-move-handle').boundingBox();assert(h);
   const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.className,{x:h.x+h.width/2,y:h.y+h.height/2});assert.equal(hit,'text-move-handle',JSON.stringify({h,hit,field}));
   await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+dx,h.y+h.height/2+dy,{steps:8});await page.mouse.up();
   return {before,after:await page.evaluate(field=>current().text_positions[field],field)};
  }
  for(const width of [1600,1100,800]){
   await page.setViewportSize({width,height:1100});await select(1);await page.locator('#reset-text-positions').click();
   const result=await drag('headline',8,30);assert(Math.abs(result.after.y-30/result.before.ratio)<3,JSON.stringify(result));assert(Math.abs(result.after.x-8/result.before.ratio)<3);
   assert.equal(await page.evaluate(()=>Object.keys(current().text_positions).length),1);checks.push({width,ratio:result.before.ratio,position:result.after});
  }
  // 텍스트 편집과 각 박스의 위치 변경을 구분합니다.
  const position=await page.evaluate(()=>structuredClone(current().text_positions.headline));
  await page.locator('#canvas [data-field="answer"]').fill('두 곳의 도서관이 대상입니다.');
  assert.deepEqual(await page.evaluate(()=>current().text_positions.headline),position);
  await page.locator('#canvas [data-field=answer]').fill('두 곳의 도서관이 대상입니다.');
  await drag('answer',0,30);await drag('detail',0,25);await drag('keyword',0,15);assert.equal(await page.evaluate(()=>Object.keys(current().text_positions).length),4);
  // 큰 이동량에서도 박스 전체를 카드 안으로 제한합니다.
  await drag('headline',4000,4000);
  const bounds=await page.evaluate(()=>{const a=document.querySelector('#canvas .news-card').getBoundingClientRect(),b=document.querySelector('#canvas [data-field="headline"]').getBoundingClientRect();return {left:b.left-a.left,right:a.right-b.right,top:b.top-a.top,bottom:a.bottom-b.bottom};});
  assert(Object.values(bounds).every(v=>v>=-1));
  await page.locator('#reset-text-positions').click();await drag('headline',0,15);await drag('answer',0,15);await drag('detail',0,15);
  const thumbnailPosition=await page.locator('#cards .thumb.selected [data-field="headline"]').evaluate(el=>el.style.transform);
  assert.equal(thumbnailPosition,await page.locator('#canvas [data-field="headline"]').evaluate(el=>el.style.transform));
  const moved=await page.evaluate(()=>structuredClone(current().text_positions));await select(0);await select(1);assert.deepEqual(await page.evaluate(()=>current().text_positions),moved);
  const revision=await page.evaluate(()=>CardEditor.getRevision());assert(revision>0);assert.equal(await page.evaluate(()=>state.validation_status),'needs_recheck');
  const snapshot=await page.evaluate(()=>structuredClone(state));snapshot.card_news_options={closing_type:'service',service_message:'이전 설정'};
  const saved=await(await page.request.post(base+'/api/local/drafts',{data:{draft:snapshot}})).json();assert(saved.success);
  const loaded=await(await page.request.get(base+'/api/local/drafts/'+saved.id)).json();await page.evaluate(d=>CardEditor.loadDraft(d),loaded.draft);await select(1);assert.deepEqual(await page.evaluate(()=>current().text_positions),moved);
  // 출력 템플릿과 미리보기의 카드 좌표를 비교합니다.
  const card=await page.evaluate(()=>displayCard(current(),active));
  const coordinates=await page.evaluate(card=>{
   const outer=document.createElement('div');outer.style.cssText='position:absolute;left:-10000px;top:0';outer.innerHTML=CardTemplate.markup(card,false);document.body.append(outer);CardTemplate.fitCard(outer.querySelector('.news-card'));
   function points(a){const r=a.getBoundingClientRect(),s=r.width/1080;return Object.fromEntries([...a.querySelectorAll('[data-field]')].map(el=>{const b=el.getBoundingClientRect();return [el.dataset.field,{x:(b.left-r.left)/s,y:(b.top-r.top)/s}];}));}
   const result={preview:points(document.querySelector('#canvas .news-card')),jpg:points(outer.querySelector('.news-card'))};outer.remove();return result;
  },card);
  for(const key of Object.keys(coordinates.preview)){assert(Math.abs(coordinates.preview[key].x-coordinates.jpg[key].x)<1);assert(Math.abs(coordinates.preview[key].y-coordinates.jpg[key].y)<1);}
  await page.locator('#canvas .news-card').screenshot({path:path.join(output,'moved-preview.png')});
  const result=await page.request.post(base+'/editor/render',{data:{card}});assert.equal(result.status(),200,await result.text());const jpg=await result.json();await fs.writeFile(path.join(output,'moved.jpg'),await(await page.request.get(base+jpg.image_url)).body());
  const noChrome=await page.evaluate(card=>!CardTemplate.markup(card,false).includes('text-move-handle')&&!CardTemplate.markup(card,false).includes('position-selected'),card);assert(noChrome);
  await page.locator('#reset-text-positions').click();assert.deepEqual(await page.evaluate(()=>current().text_positions),{});assert.equal(await page.evaluate(()=>CardEditor.getRevision()>0),true);
  await select(2);await drag('farewell',0,30);assert(await page.evaluate(()=>!!current().text_positions.farewell));
  for(const platform of ['instagram','threads']){await page.evaluate(p=>TextEditor.showPlatform(p),platform);assert.equal(await page.locator('#platform-panel .text-move-handle,#platform-panel [contenteditable=true]').count(),0);}
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'report.json'),JSON.stringify({checks,coordinates,bounds,errors},null,2));console.log(JSON.stringify({scales:checks.length,boundaries:true,storage:true,reset:true,jpg:true,errors:errors.length,output}));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
