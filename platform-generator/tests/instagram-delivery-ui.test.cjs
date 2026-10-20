const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
test('SNS 화면: Instagram·Threads 두 버튼·자동 직렬 조회·busy/pending·작성창 보호·닫힘·늦은 응답 정리',async()=>{
 const {createServer}=await import(pathToFileURL(path.join(root,'node_modules/vite/dist/node/index.js')));
 const mock=`import {renderKey,selectedCardPhoto} from '/src/lib/platformState.js';
 window.igTest={calls:[],active:0,max:0,delay:20,status:{success:true,connected:false,reason:'browser_closed',browser:null},prepareReady:true};
 export const snsAction=async(platform,action,payload={})=>{
  const t=window.igTest;t.calls.push({platform,action,payload});
  if(action==='status'){t.active++;t.max=Math.max(t.max,t.active);const value=structuredClone(t.status);await new Promise(r=>setTimeout(r,t.delay));t.active--;if(t.busyError){t.busyError=false;throw Error('이전 SNS 작업이 진행 중입니다.');}return value;}
  if(action==='connect'){t.status={success:true,connected:false,browser:platform==='instagram'?'chrome':payload.browser==='auto'?'msedge':payload.browser,reason:platform==='threads'?'profile_not_identified':'login_required'};return {success:true};}
  if(action==='prepare'){await new Promise(r=>setTimeout(r,120));t.status={success:true,browser:platform==='threads'?'msedge':'chrome',connected:true,username:null,pending:{id:'synthetic',status:'ready'}};return t.prepareReady?{success:true,status:'ready',id:'synthetic',image_count:payload.assets.length,message:'카드 첨부와 캡션 입력을 확인했습니다.'}:{success:true,message:'확인되지 않음'};}
  return {success:true};
 };
 export const renderStoredCard=async(card,article,draft)=>({id:'synthetic',uri:'synthetic.jpg',article_id:draft.article_id,snapshot_id:draft.snapshot_id,key:renderKey(card,selectedCardPhoto(card,article),draft)});
 export const storedJpg=async()=>{};`;
 const html=`<html><body><div id="root"></div><script type="module">
 import React from 'react';import ReactDOM from 'react-dom/client';import Delivery from '/src/components/PlatformDelivery.jsx';
 const article={articleId:'synthetic',content:'합성 원문',photos:[]},draft={article_id:'synthetic',snapshot_id:'snapshot',generation_source:JSON.stringify(['','','합성 원문','']),generation_input:{article:{content:'합성 원문'}},opening:'합성 캡션',paragraphs:[],closing:'합성 마무리'};
 function App(){const [platform,setPlatform]=React.useState('instagram'),[visible,setVisible]=React.useState(true),[preparing,setPreparing]=React.useState(false);
 const [cards,setCards]=React.useState({...draft,cards:[{card_id:'C1',content:{headline:'합성 제목'},image:{},design:{}}]});
 window.changeCardSnapshot=()=>setCards(cards=>({...cards,snapshot_id:'other-snapshot'}));
 window.setPlatform=setPlatform;window.setVisible=setVisible;window.setPreparing=setPreparing;
 return visible?React.createElement(Delivery,{key:platform,platform,draft,cards,article,onCards:setCards,preparing}):null;}
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`;
 let vite,browser;
 try{
  vite=await createServer({root,cacheDir:path.join(root,'node_modules/.vite-ig-ui-test'),configFile:path.join(root,'vite.config.js'),server:{host:'127.0.0.1',port:0},plugins:[{name:'ig-ui-test',enforce:'pre',resolveId(source,importer){if(importer?.replaceAll('\\','/').includes('/src/components/')&&source.startsWith('../api/platform'))return '\0ig-api';},load(id){if(id==='\0ig-api')return mock;},configureServer(server){server.middlewares.use('/__ig-test',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__ig-test',html));});}}]});
  await vite.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));await page.goto(vite.resolvedUrls.local[0]+'__ig-test',{waitUntil:'domcontentloaded',timeout:60000});
  const connection=page.getByTestId('instagram-connection-status');
  await page.getByTestId('instagram-connect').waitFor();
  assert.equal(await page.getByTestId('cards-jpg-status').count(),0);
  assert.equal(await page.getByTestId('cards-export').count(),0);
  await page.getByText('02. Instagram 작성창 채우기').waitFor();
  await page.getByText('03. 게시 준비 완료').waitFor();
  assert.equal(await page.getByRole('combobox').count(),0);assert.equal(await page.getByRole('button',{name:'전용 창 닫기',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Instagram 작성창 채우기',exact:true}).count(),1);
  // 설치/로그인된 Chrome 여부를 확인하기 전에는 연결 완료로 표시하지 않는다.
  await page.getByTestId('instagram-connect').dblclick();await connection.getByText(/로그인 완료를 자동/).waitFor();
  assert.equal(await page.evaluate(()=>window.igTest.calls.filter(x=>x.action==='connect').length),1);
  await page.evaluate(()=>window.igTest.status={success:true,connected:true,browser:'chrome',username:null});
  await connection.getByText(/로그인 연결됨.*계정 이름 확인 필요/).waitFor();
  // 이미 연결된 창은 connect 재호출 없이 기존 상태만 확인한다.
  await page.getByTestId('instagram-connect').click();await connection.getByText(/계정 이름 확인 필요/).waitFor();
  assert.equal(await page.evaluate(()=>window.igTest.calls.filter(x=>x.action==='connect').length),1);
  await page.evaluate(()=>window.igTest.status={success:true,connected:true,browser:'chrome',username:null,pending:{status:'ready',id:'existing'}});
  await connection.getByText(/기존 작성창을 유지/).waitFor();
  await page.getByTestId('sns-prepare').click();await page.getByTestId('delivery-status').getByText(/게시 버튼은 누르지 않았습니다/).waitFor();
  assert.equal(await page.evaluate(()=>window.igTest.calls.filter(x=>x.action==='prepare').length),1);
  await page.evaluate(()=>window.igTest.status={success:true,connected:false,browser:'chrome',reason:'browser_closed',pending:null});
  await connection.getByText(/페이지가 닫혔습니다/).waitFor();assert.equal(await page.getByTestId('delivery-status').count(),0);
  // 다른 브라우저의 세션은 Chrome 연결로 표시하거나 자동으로 교체하지 않는다.
  const before=await page.evaluate(()=>window.igTest.calls.filter(x=>x.action==='connect').length);
  await page.evaluate(()=>window.igTest.status={success:true,connected:true,browser:'msedge',username:null});await page.getByTestId('instagram-connect').click();
  await connection.getByText(/Chrome 연결이 아닙니다/).waitFor();assert.equal(await page.evaluate(()=>window.igTest.calls.filter(x=>x.action==='connect').length),before);
  // Core 잠금은 로그인 실패가 아닌 대기 후 재조회로 처리한다.
  await page.evaluate(()=>{window.igTest.busyError=true;window.igTest.status={success:true,connected:false,reason:'browser_closed',browser:null};});
  await page.getByTestId('instagram-connect').click();await connection.getByText(/연결 실패가 아닙니다/).waitFor();await connection.getByText(/로그인 완료를 자동/).waitFor();
  // pending/busy 응답에서도 로그인 실패로 처리하지 않으며, 생성 작업 중에는 조회를 멈춘다.
  await page.evaluate(()=>window.igTest.status={success:true,busy:true,browser:'chrome',pending:{status:'preparing'}});
  await connection.getByText(/작업이 진행 중/).waitFor();
  await page.evaluate(()=>window.setPreparing(true));await page.waitForTimeout(100);
  const pausedCalls=await page.evaluate(()=>window.igTest.calls.length);await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(()=>window.igTest.calls.length),pausedCalls);
  await page.evaluate(()=>{window.setPreparing(false);window.igTest.status={success:true,connected:true,browser:'chrome'};window.igTest.prepareReady=false;});
  await page.getByTestId('sns-prepare').click();await page.getByTestId('delivery-status').getByText(/완료를 확인하지 못했습니다/).waitFor();
  assert.doesNotMatch(await page.getByTestId('delivery-status').innerText(),/게시 버튼은 누르지 않았습니다/);
  // 진행 중 조회가 늦게 끝나도 화면 이탈 후 connect를 호출하지 않는다.
  await page.evaluate(()=>{window.igTest.delay=700;window.igTest.status={success:true,connected:true,browser:'chrome'};});
  await page.waitForFunction(()=>window.igTest.active===1);const count=await page.evaluate(()=>window.igTest.calls.length);
  await page.evaluate(()=>window.setVisible(false));await page.waitForTimeout(2300);
  assert.equal(await page.evaluate(()=>window.igTest.calls.length),count);assert.equal(await page.evaluate(()=>window.igTest.max),1);
  await page.evaluate(()=>{window.setPlatform('threads');window.setVisible(true);});
  await page.getByRole('combobox',{name:'SNS 브라우저'}).waitFor();assert.equal(await page.getByRole('button',{name:'전용 창 닫기',exact:true}).count(),0);
  assert.equal(await page.getByTestId('cards-jpg-status').count(),0);
  assert.equal(await page.getByTestId('cards-export').count(),0);
  await page.getByText('02. Threads 작성창 채우기').waitFor();
  assert.equal(await page.getByRole('button',{name:'Threads 로그인 연결',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Threads 작성창 채우기',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'로그인 연결 확인',exact:true}).count(),0);
  await page.getByRole('combobox',{name:'SNS 브라우저'}).selectOption('msedge');
  await page.evaluate(()=>{window.igTest.delay=20;window.igTest.status={success:true,connected:false,browser:null,reason:'browser_closed'};window.igTest.prepareReady=true;});
  await page.getByTestId('threads-connect').dblclick();
  const threadsConnection=page.getByTestId('threads-connection-status');
  await threadsConnection.getByText(/계정 이름을 확인하지 못했습니다.*로그인 여부를 단정할 수 없습니다/).waitFor();
  assert.equal(await page.evaluate(()=>window.igTest.calls.filter(x=>x.platform==='threads'&&x.action==='connect').length),1);
  assert.equal(await page.evaluate(()=>window.igTest.calls.find(x=>x.platform==='threads'&&x.action==='connect').payload.browser),'msedge');
  await page.evaluate(()=>window.igTest.status={success:true,browser:'msedge',connected:true,username:'synthetic',pending:{status:'ready'}});
  await threadsConnection.getByText(/Edge 로그인 연결됨.*기존 작성창을 유지/).waitFor();
  await page.getByTestId('threads-connect').click();await threadsConnection.getByText(/기존 작성창을 유지/).waitFor();
  assert.equal(await page.evaluate(()=>window.igTest.calls.filter(x=>x.platform==='threads'&&x.action==='connect').length),1);
  // Threads는 카드 없이도 작성할 수 있다. 준비 완료 응답을 확인한 뒤에만 안내한다.
  await page.getByRole('checkbox').uncheck();await page.getByTestId('sns-prepare').click();
  await page.getByTestId('delivery-status').getByText(/게시 버튼은 누르지 않았습니다/).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.igTest.calls.find(x=>x.platform==='threads'&&x.action==='prepare').payload.assets),[]);
  await page.evaluate(()=>window.igTest.status={success:true,connected:false,browser:'msedge',reason:'browser_closed'});
  await threadsConnection.getByText(/Threads 창 또는 페이지가 닫혔습니다/).waitFor();assert.equal(await page.getByTestId('delivery-status').count(),0);
  await page.evaluate(()=>window.changeCardSnapshot());await page.getByRole('checkbox').check();
  await page.getByRole('alert').getByText(/원문은 같지만 원고와 카드의 고정본이 다릅니다/).waitFor();assert.equal(await page.getByTestId('sns-prepare').isEnabled(),false);
  await page.getByRole('checkbox').uncheck();assert.equal(await page.getByTestId('sns-prepare').isEnabled(),true,'Threads의 카드 없는 준비는 유지');
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(vite)await vite.close();}
});
