const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
test('원문 수명 회귀: HTML 적용·같은 ID 교체·조건 격리/재사용·늦은 응답·부분 실패·복원',async()=>{
 const {createServer}=await import(pathToFileURL(path.join(root,'node_modules/vite/dist/node/index.js')));
 const mock=`import {sourceText} from '/src/lib/platformState.js';
 window.sourceTest={calls:[],hold:false,failInstagram:false,resolvers:[],snapshots:0};
 export const getStudioArticle=async()=>({article:{...window.sourceArticle,content:'<p>'+window.sourceArticle.content+'</p>'},subtitle:undefined});
 export const listStudioArticles=async()=>[{id:'A',title:'합성 기사'}];export const suggestPlatformKeywords=async()=>[];
 export const freezeArticle=async article=>({articleId:article.articleId,revisionNo:3,snapshotId:'snapshot-'+(++window.sourceTest.snapshots),article:{article_id:article.articleId,title:article.title,content:article.content}});
 export const generatePlatform=async(platform,article,keywords,requirements,snapshot,source)=>{
 const t=window.sourceTest;t.calls.push({platform,article_id:article.article_id,title:article.title,keywords,requirements,snapshot});
 if(t.hold)await new Promise(resolve=>t.resolvers.push(resolve));
 if(t.failInstagram&&platform==='instagram')throw Error('해시태그 형식 오류');
 return {platform,article_id:article.article_id,snapshot_id:snapshot,generation_input:{article,selected_keywords:keywords,requirements},generation_source:sourceText(source),opening:article.title+' 생성본',paragraphs:[article.content],closing:'마무리입니다.',hashtags:[],validation_status:'not_checked'};};
 export const renderStoredCard=async()=>{throw Error('이번 시험에는 카드 렌더가 없어야 함');};
 export const validatePlatformDraft=async()=>{throw Error('자동 AI 검수가 없어야 함');};
 export const snsAction=async()=>{throw Error('자동 SNS 호출이 없어야 함');};export const storedJpg=async()=>{};export const blobToDataUrl=async()=>{};export const photoDataUrl=async photo=>photo.url;
 `;
 const html=`<html><body><div id="root"></div><script type="module">
 import React from 'react';import ReactDOM from 'react-dom/client';import Studio from '/src/components/PlatformStudio.jsx';
 import {sourceText} from '/src/lib/platformState.js';import {sourceVersion} from '/src/lib/platformLifecycle.js';
 import {fromCoreDraft} from '/src/services/editorialStore.js';
 const initial={articleId:'A',title:'이전 제목',content:'이전 본문',photos:[],platformGeneration:{selectedPlatforms:['instagram','threads'],includeCardNews:false,selectedKeywords:['이전키워드'],requirements:'이전조건'}};
 initial.platformGeneration.source_version=sourceVersion(initial);initial.platformDrafts={instagram:{article_id:'A',snapshot_id:'old-snapshot',generation_source:sourceText(initial),generation_input:{article:{article_id:'A',title:initial.title,content:initial.content}},opening:'이전 생성 원고',paragraphs:['이전 본문'],closing:'마무리입니다.'}};
 function App(){const [article,setArticle]=React.useState(initial),[mount,setMount]=React.useState(0);window.sourceArticle=article;
 window.replaceSource=()=>setArticle(a=>({...a,title:'현재 제목',content:'현재 본문'}));
 window.changeRevision=()=>setArticle(a=>({...a,title:'같은 ID의 다음 원문',content:'다음 원문의 본문'}));
 window.otherArticle=()=>setArticle(a=>fromCoreDraft({articleId:'B',title:'다른 기사',content:'다른 본문',photos:[]},a));
 window.reloadStudio=()=>{setArticle(a=>JSON.parse(JSON.stringify(a)));setMount(n=>n+1);};
 return React.createElement(Studio,{key:article.articleId+':'+mount,article,setArticle,flush:async()=>article.articleId});}
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`;
 let vite,browser;
 try {
  vite=await createServer({root,cacheDir:path.join(root,'node_modules/.vite-platform-source-test'),configFile:path.join(root,'vite.config.js'),server:{host:'127.0.0.1',port:0},plugins:[{name:'source-ui-test',enforce:'pre',resolveId(source,importer){if(importer?.replaceAll('\\','/').includes('/src/components/')&&source.startsWith('../api/platform'))return '\0source-api';},load(id){if(id==='\0source-api')return mock;},configureServer(server){server.middlewares.use('/__source-test',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__source-test',html));});}}]});
  await vite.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',error=>{errors.push(error.message);console.log('합성 편집실 예외:',error.message);});await page.goto(vite.resolvedUrls.local[0]+'__source-test');
  await page.getByTestId('apply-studio-article').click();await page.getByTestId('applied-source').getByText(/적용 완료/).waitFor();
  assert.equal(await page.getByTestId('previous-conditions').count(),0);
  await page.evaluate(()=>window.replaceSource());
  await page.getByTestId('draft-origin-status').getByText(/이전 원문 결과/).waitFor();
  assert.equal(await page.getByTestId('sns-prepare').isEnabled(),false);
  assert.equal(await page.getByTestId('platform-validate').isEnabled(),false);
  await page.getByTestId('previous-conditions').waitFor();
  assert.equal(await page.evaluate(()=>window.sourceArticle.platformGeneration.selectedKeywords.length),0);
  assert.equal(await page.getByPlaceholder('톤, 분량, 반드시 포함할 조건 등을 입력').inputValue(),'');
  await page.getByTestId('reuse-conditions').click();
  assert.equal(await page.getByPlaceholder('톤, 분량, 반드시 포함할 조건 등을 입력').inputValue(),'이전조건');
  await page.getByTestId('apply-studio-article').click();await page.getByTestId('applied-source').getByText(/적용 완료.*현재 제목/).waitFor();
  // 한 플랫폼 실패가 현재 Threads 성공이나 이전 Instagram 보존본을 지우지 않는다.
  await page.evaluate(()=>window.sourceTest.failInstagram=true);
  await page.getByRole('button',{name:'선택 항목 생성',exact:true}).click();
  await page.getByText(/1\/2개 결과/).waitFor();
  assert.equal(await page.evaluate(()=>window.sourceArticle.platformDrafts.instagram.opening),'이전 생성 원고');
  assert.equal(await page.evaluate(()=>window.sourceArticle.platformDrafts.threads.opening),'현재 제목 생성본');
  const first=await page.evaluate(()=>window.sourceTest.calls);assert.equal(first[0].snapshot,first[1].snapshot);
  assert.deepEqual(first[1].keywords,['이전키워드']);
  assert.equal(await page.evaluate(()=>window.sourceArticle.platformGeneration.run_history.some(x=>x.code==='HASHTAG_FORMAT')),true);
  await page.getByRole('button',{name:'Instagram●',exact:true}).click();await page.getByTestId('draft-origin-status').getByText(/이전 원문/).waitFor();
  await page.evaluate(()=>window.reloadStudio());await page.getByTestId('draft-origin-status').getByText(/이전 원문/).waitFor();await page.getByTestId('generation-history').waitFor();
  // 재시도는 선택 항목 하나만, 이미 생성된 Threads 결과는 보존한다.
  await page.evaluate(()=>window.sourceTest.failInstagram=false);await page.getByTestId('generate-active').click();await page.getByText(/1\/1개 결과/).waitFor();
  assert.equal(await page.evaluate(()=>window.sourceTest.calls.filter(x=>x.platform==='threads').length),1);
  // 같은 ID의 원문이 바뀌어도 늦은 응답을 적용하지 않고 다음 호출을 중단한다.
  await page.evaluate(()=>window.sourceTest.hold=true);await page.getByRole('button',{name:'선택 항목 생성',exact:true}).click();
  await page.waitForFunction(()=>window.sourceTest.resolvers.length===1);const sameIdCalls=await page.evaluate(()=>window.sourceTest.calls.length);
  await page.evaluate(()=>window.changeRevision());await page.getByTestId('loaded-title').getByText('같은 ID의 다음 원문',{exact:true}).waitFor();
  await page.evaluate(()=>{window.sourceTest.hold=false;window.sourceTest.resolvers.shift()();});await page.getByText(/이전 작업의 후속 호출과 결과 적용을 중단/).waitFor();
  assert.equal(await page.evaluate(()=>window.sourceTest.calls.length),sameIdCalls);
  assert.equal(await page.evaluate(()=>window.sourceArticle.platformDrafts.instagram.opening),'현재 제목 생성본');
  assert.equal(await page.evaluate(()=>window.sourceArticle.platformGeneration.selectedKeywords.length),0);
  await page.getByTestId('apply-studio-article').click();await page.getByTestId('applied-source').getByText(/적용 완료/).waitFor();
  // 생성 중 다른 기사로 이동하면 늦은 응답을 새 기사에 적용하거나 다음 플랫폼을 호출하지 않는다.
  await page.evaluate(()=>window.sourceTest.hold=true);await page.getByRole('button',{name:'선택 항목 생성',exact:true}).click();
  await page.waitForFunction(()=>window.sourceTest.resolvers.length===1);
  const before=await page.evaluate(()=>window.sourceTest.calls.length);
  await page.evaluate(()=>window.otherArticle());
  await page.getByTestId('loaded-title').getByText('다른 기사',{exact:true}).waitFor();
  await page.evaluate(()=>{window.sourceTest.hold=false;window.sourceTest.resolvers.shift()();});await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.sourceTest.calls.length),before);assert.deepEqual(await page.evaluate(()=>window.sourceArticle.platformDrafts),{});
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(vite)await vite.close();}
});
