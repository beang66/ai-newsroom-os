const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
// 근거 불일치(evidence_valid:false) 원고는 SNS 작성창 채우기를 막지 않는다. 사람이 확인 체크를 하면 진행하고, 입력이 바뀌면 다시 확인한다.
test('SNS 작성창 채우기: 근거 불일치는 막지 않고 확인 체크 뒤 진행·입력이 바뀌면 다시 확인',async()=>{
 const {createServer}=await import(pathToFileURL(path.join(root,'node_modules/vite/dist/node/index.js')));
 const mock=`window.evTest={calls:[]};
 export const snsAction=async(platform,action,payload={})=>{
  window.evTest.calls.push({platform,action});
  if(action==='status')return {success:true,connected:true,browser:'msedge',username:'synthetic'};
  if(action==='prepare')return {success:true,status:'ready',id:'synthetic',image_count:(payload.assets||[]).length,message:'작성창 입력을 마쳤습니다.',username:'synthetic'};
  return {success:true};
 };
 export const renderStoredCard=async()=>({});
 export const storedJpg=async()=>{};`;
 const html=`<html><body><div id="root"></div><script type="module">
 import React from 'react';import ReactDOM from 'react-dom/client';import Delivery from '/src/components/PlatformDelivery.jsx';
 const article={articleId:'synthetic',content:'합성 원문',photos:[]};
 const base={article_id:'synthetic',snapshot_id:'snapshot',generation_source:JSON.stringify(['','','합성 원문','']),generation_input:{article:{content:'합성 원문'}},opening:'합성 도입',paragraphs:[],closing:'합성 마무리',evidence_valid:true};
 function App(){const [draft,setDraft]=React.useState(base);window.patchDraft=patch=>setDraft(current=>({...current,...patch}));
  return React.createElement(Delivery,{platform:'threads',draft,cards:null,article,onCards:()=>{}});}
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`;
 let vite,browser;
 try{
  vite=await createServer({root,cacheDir:path.join(root,'node_modules/.vite-evidence-ack-test'),configFile:path.join(root,'vite.config.js'),server:{host:'127.0.0.1',port:0},plugins:[{name:'evidence-ack-test',enforce:'pre',resolveId(source,importer){if(importer?.replaceAll('\\','/').includes('/src/components/')&&source.startsWith('../api/platform'))return '\0ev-api';},load(id){if(id==='\0ev-api')return mock;},configureServer(server){server.middlewares.use('/__ev-test',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__ev-test',html));});}}]});
  await vite.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));await page.goto(vite.resolvedUrls.local[0]+'__ev-test');
  const prepare=page.getByTestId('sns-prepare'),ack=page.getByTestId('evidence-ack');
  await prepare.waitFor();
  // 근거가 맞으면 경고도 확인 체크도 없고 바로 진행할 수 있다.
  assert.equal(await page.getByTestId('evidence-warning').count(),0);assert.equal(await ack.count(),0);
  assert.equal(await prepare.isEnabled(),true);
  // 근거 불일치 표시: 경고와 확인 체크가 나타나고, 확인 전에는 진행하지 않는다.
  await page.evaluate(()=>window.patchDraft({evidence_valid:false}));
  await page.getByTestId('evidence-warning').getByText(/원문과 일치하지 않는 근거가 표시되어 있습니다/).waitFor();
  assert.equal(await ack.isChecked(),false);assert.equal(await prepare.isEnabled(),false,'확인 전에는 작성창 채우기를 시작할 수 없다');
  // 확인하면 막지 않고 진행한다(게시 버튼은 누르지 않는다).
  await ack.check();assert.equal(await prepare.isEnabled(),true);
  await prepare.click();
  await page.getByTestId('delivery-status').getByText(/게시 버튼은 누르지 않았습니다/).waitFor();
  assert.equal(await page.evaluate(()=>window.evTest.calls.filter(call=>call.action==='prepare').length),1);
  // 확인을 풀면 다시 막힌다.
  await ack.uncheck();assert.equal(await prepare.isEnabled(),false);
  // 확인한 뒤 원고가 바뀌면 확인이 초기화되어 다시 확인해야 한다.
  await ack.check();assert.equal(await prepare.isEnabled(),true);
  await page.evaluate(()=>window.patchDraft({opening:'수정한 도입'}));
  await page.waitForFunction(()=>document.querySelector('[data-testid="evidence-ack"]')?.checked===false);
  assert.equal(await prepare.isEnabled(),false,'원고가 바뀌면 다시 확인해야 한다');
  // 근거 불일치 표시가 사라지면(다시 생성·검수) 경고와 확인 체크가 없어진다.
  await page.evaluate(()=>window.patchDraft({evidence_valid:true}));
  await page.waitForFunction(()=>!document.querySelector('[data-testid="evidence-warning"]'));
  assert.equal(await prepare.isEnabled(),true);
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(vite)await vite.close();}
});
