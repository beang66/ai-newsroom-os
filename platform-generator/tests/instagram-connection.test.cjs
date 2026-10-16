const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright');
const {createInstagramService}=require('../instagram-local-service');

test('Instagram: Chrome 누락/실행 실패는 한 번만 시도하고 대체 브라우저를 열지 않음',async()=>{
 for(const reason of ["Executable doesn't exist",'profile locked','launch failed']){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ig-connection-')),calls=[];
  const service=createInstagramService({profileDir:dir,chromium:{launchPersistentContext:async(_,options)=>{calls.push(options);throw Error(reason);}}});
  try {
   await assert.rejects(service.connect({browser:'msedge'}),/Chrome.*|전용 Chrome/);
   assert.deepEqual(calls.map(x=>x.channel),['chrome']);
   assert.equal((await service.status()).connected,false);
   assert.equal((await fs.readdir(dir)).includes('newsroom-owner.json'),false);
  }finally{await service.close();await fs.rm(dir,{recursive:true,force:true});}
 }
});

test('합성 Instagram DOM: 로그인 자동 조회용 상태·작성창 보존·페이지/창 닫힘·공유하지 않음',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ig-connection-'));
 let context,page,gotos=0;
 const html=`<html><body><button id="create" onclick="document.body.insertAdjacentHTML('beforeend',document.querySelector('template').innerHTML)">Create</button>
 <template><section role="dialog"><input type="file" multiple><button aria-label="Select crop">Crop</button><button>Original</button>
 <div role="textbox" contenteditable="true"></div><button onclick="window.shared=true">Share</button></section></template></body></html>`;
 const service=createInstagramService({profileDir:dir,chromium:{launchPersistentContext:async(_,options)=>{
  assert.equal(options.channel,'chrome');
  const browser=await chromium.launch({headless:true});context=await browser.newContext();
  context.on('close',()=>browser.close());
  await context.route('https://www.instagram.com/**',route=>route.fulfill({contentType:'text/html',body:html}));
  const newPage=context.newPage.bind(context);
  context.newPage=async()=>{page=await newPage();const goto=page.goto.bind(page);page.goto=(...args)=>{gotos++;return goto(...args);};return page;};
  return context;
 }}});
 try {
  await service.connect({browser:'auto'});assert.equal(gotos,1);
  assert.equal((await service.status()).reason,'login_required');
  await context.addCookies([{name:'sessionid',value:'synthetic',domain:'.instagram.com',path:'/'},{name:'ds_user_id',value:'synthetic-id',domain:'.instagram.com',path:'/'}]);
  const connected=await service.status();assert.equal(connected.connected,true);assert.equal(connected.username,null);assert.equal(connected.browser,'chrome');
  const text='합성 캡션\n조건을 유지합니다.';
  const result=await service.prepare({text,assets:[{mime:'image/jpeg',order:1,data_url:'data:image/jpeg;base64,/9j/2Q=='}]});
  assert.equal(result.status,'ready');assert.equal(result.image_count,1);
  assert.equal(await page.locator('input[type=file]').evaluate(el=>el.files.length),1);
  assert.equal(await page.getByRole('textbox').innerText(),text);
  await service.connect();assert.equal(gotos,1,'연결 버튼이 작성창을 홈으로 이동시키지 않음');
  assert.equal(await page.getByRole('textbox').innerText(),text);
  assert.equal((await service.status()).pending.id,result.id);
  assert.equal(await page.evaluate(()=>!!window.shared),false);
  await page.close();assert.equal((await service.status()).pending,null);assert.equal((await service.status()).reason,'browser_closed');
  await service.connect();assert.equal(gotos,2);
  const insert=page.keyboard.insertText.bind(page.keyboard);
  page.keyboard.insertText=async value=>{await insert(value);await page.close();};
  await assert.rejects(service.prepare({text:'합성 캡션',assets:[{mime:'image/jpeg',order:1,data_url:'data:image/jpeg;base64,/9j/2Q=='}]}),/창 또는 페이지가 닫혔습니다/);
  assert.equal((await service.status()).pending,null);
  await service.connect();await context.close();
  const ended=await service.status();assert.equal(ended.pending,null);assert.equal(ended.browser,null);assert.equal(ended.reason,'browser_closed');
 }finally{await service.close();await fs.rm(dir,{recursive:true,force:true});}
});
