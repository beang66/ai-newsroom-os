const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
test('선택 입력·플랫폼별 표시·재생성 버튼은 문체와 원문을 전달하고 카드 재생성은 제외',async()=>{
 const {createServer}=await import(pathToFileURL(path.join(root,'node_modules/vite/dist/node/index.js')));
 const mock=`import {sourceText} from '/src/lib/platformState.js';
 window.editorialRequests=[];
 export const freezeArticle=async article=>({articleId:article.articleId,snapshotId:'snapshot',revisionNo:1,article:{article_id:article.articleId,title:article.title,content:article.content}});
 export const generatePlatform=async(platform,article,keywords,requirements,snapshot,source)=>{window.editorialRequests.push({platform,article,requirements});return {platform,article_id:article.article_id,snapshot_id:snapshot,generation_source:sourceText(source),generation_input:{article,requirements},opening:'📰 지원 확대 계획',paragraphs:['소득 기준 충족 청년 대상'],closing:'중복 수혜자는 제외 대상',hashtags:['#지원','#청년','#계획']};};
 export const suggestPlatformKeywords=async()=>[];export const getStudioArticle=async()=>{};export const listStudioArticles=async()=>[];
 export const renderStoredCard=async()=>{throw Error('카드 렌더는 호출하면 안 됩니다.');};export const validatePlatformDraft=async()=>{};
 export const snsAction=async()=>({success:true,connected:false,browser:'chrome'});
 export const photoDataUrl=async()=>'';export const storedJpg=async()=>{};export const blobToDataUrl=async()=>'';`;
 const fixture={articleId:'fixture',title:'청년 지원 확대 계획',content:'시는 청년 지원을 확대할 계획이라고 밝혔다. 중복 수혜자는 제외된다.',photos:[],platformGeneration:{includeCardNews:true}};
 const html='<html><body><div id="root"></div><script type="module">import React from "react";import ReactDOM from "react-dom/client";import "/src/index.css";import Studio from "/src/components/PlatformStudio.jsx";import {applyCurrentSource} from "/src/lib/platformSource.js";const initial='+JSON.stringify(fixture)+';applyCurrentSource(initial);function App(){const [article,setArticle]=React.useState(initial);return React.createElement(Studio,{article,setArticle});}ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));</script></body></html>';
 let vite,browser;
 try{
  vite=await createServer({root,configFile:path.join(root,'vite.config.js'),cacheDir:path.join(root,'node_modules/.vite-editorial-ui'),optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','lucide-react']},server:{host:'127.0.0.1',port:0},plugins:[{name:'isolated-editorial-api',enforce:'pre',resolveId(source,importer){if(importer?.replaceAll('\\','/').includes('/src/components/')&&source.startsWith('../api/platform'))return '\0editorial-api';},load(id){if(id==='\0editorial-api')return mock;},configureServer(server){server.middlewares.use('/__editorial-test',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__editorial-test',html));});}}]});
  await vite.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.setDefaultTimeout(30000);page.on('pageerror',error=>{errors.push(error.message);console.log('Editorial UI error:',error.message);});
  await page.goto(vite.resolvedUrls.local[0]+'__editorial-test',{timeout:60000});
  const panel=page.getByTestId('optional-editorial-direction'),input=page.getByLabel('덧붙일 편집 방향 (선택)');
  assert.equal(await panel.getAttribute('open'),null);assert.equal(await input.isVisible(),false);
  assert.equal(await page.getByRole('button',{name:'선택 항목 생성',exact:true}).isEnabled(),true);
  await panel.locator('summary').first().click();await input.fill('인스타그램 생성시 명사체로 생성');
  await page.getByText('Instagram: 명사체',{exact:true}).waitFor();await page.getByText('Threads: 기본 반말체',{exact:true}).waitFor();
  await page.getByRole('button',{name:'편집 방향 반영해 다시 생성',exact:true}).click();
  await page.getByText(/2\/2개 결과를 실제 생성 엔진에서 받아왔습니다/).waitFor();
  const requests=await page.evaluate(()=>window.editorialRequests);
  assert.deepEqual(requests.map(request=>request.platform),['instagram','threads']);
  for(const request of requests){assert.equal(request.requirements,'인스타그램 생성시 명사체로 생성');assert.equal(request.article.content,fixture.content);}
  await page.getByRole('button',{name:'추가 방향 지우기',exact:true}).click();assert.equal(await input.inputValue(),'');
  assert.equal(await page.getByRole('button',{name:'선택 항목 생성',exact:true}).isEnabled(),true);
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(vite)await vite.close();}
});
