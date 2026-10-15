const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{chromium}=require('playwright');
const {createThreadsService}=require('../threads-local-service');
test('Threads 합성 DOM: 선택 브라우저 유지·로그인 상태·원고/첨부 보존·창과 페이지 닫힘·게시 없음',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'threads-connection-'));let context,page,gotos=0;
 const html=`<html><body><button onclick="document.body.insertAdjacentHTML('beforeend',document.querySelector('template').innerHTML)">New thread</button>
 <template><section role="dialog"><div role="textbox" contenteditable="true"></div><input type="file" multiple onchange="for(const f of this.files){const img=document.createElement('img');img.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';img.width=32;img.height=32;this.parentElement.append(img);}"><button onclick="window.posted=true">Post</button></section></template></body></html>`;
 const service=createThreadsService({profileDir:dir,chromium:{launchPersistentContext:async(_,options)=>{
  assert.equal(options.channel,'msedge');const browser=await chromium.launch({headless:true});context=await browser.newContext();context.on('close',()=>browser.close());
  await context.route('https://www.threads.com/**',route=>route.fulfill({contentType:'text/html',body:html}));
  const create=context.newPage.bind(context);context.newPage=async()=>{page=await create();page.on('pageerror',error=>console.log('합성 DOM 오류:',error.message));const goto=page.goto.bind(page);page.goto=(...args)=>{gotos++;return goto(...args);};return page;};return context;
 }}});
 const identify=()=>page.evaluate(()=>{const a=document.createElement('a');a.href='/@synthetic/';a.textContent='Profile';document.body.append(a);});
 try {
  await service.connect({browser:'msedge'});assert.equal(gotos,1);
  assert.equal((await service.status()).reason,'profile_not_identified');
  await identify();assert.equal((await service.status()).connected,true);assert.equal((await service.status()).browser,'msedge');
  const text='합성 Threads 원고\n필수 조건 유지';
  const first=await service.prepare({text,assets:[]});assert.equal(first.status,'ready');assert.equal(first.image_count,0);
  await service.connect({browser:'msedge'});assert.equal(gotos,1);assert.equal(await page.getByRole('textbox').innerText(),text);
  assert.equal((await service.status()).pending.id,first.id);assert.equal(await page.evaluate(()=>!!window.posted),false);
  await page.close();assert.equal((await service.status()).pending,null);assert.equal((await service.status()).reason,'browser_closed');
  await service.connect({browser:'msedge'});await identify();
  const second=await service.prepare({text,assets:[{mime:'image/jpeg',order:1,data_url:'data:image/jpeg;base64,/9j/2Q=='}]});
  assert.equal(second.status,'ready');assert.equal(second.image_count,1);
  assert.equal(await page.locator('input[type=file]').evaluate(el=>el.files.length),1);
  await service.connect({browser:'msedge'});assert.equal(gotos,2);assert.equal((await service.status()).pending.id,second.id);
  assert.equal(await page.evaluate(()=>!!window.posted),false);
  await page.close();await service.connect({browser:'msedge'});await identify();
  const insert=page.keyboard.insertText.bind(page.keyboard);page.keyboard.insertText=async value=>{await insert(value);await page.close();};
  await assert.rejects(service.prepare({text:'합성',assets:[]}),/창 또는 페이지가 닫혔습니다/);assert.equal((await service.status()).pending,null);
  await context.close();const ended=await service.status();assert.equal(ended.browser,null);assert.equal(ended.pending,null);
  await service.connect({browser:'msedge'});await service.close();await service.connect({browser:'msedge'});
  assert.equal((await service.status()).browser,'msedge');
 }finally{await service.close();await fs.rm(dir,{recursive:true,force:true});}
});
