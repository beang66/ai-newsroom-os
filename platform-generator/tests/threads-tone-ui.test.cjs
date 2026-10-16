const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');

test('Threads 말투 안내는 개발·빌드 화면에서 표시되고 편집·요구사항에 맞게 갱신됨',async()=>{
 const {createServer,build,preview}=await import(pathToFileURL(path.join(root,'node_modules/vite/dist/node/index.js')));
 const temp=await fs.mkdtemp(path.join(root,'node_modules/.threads-tone-ui-'));
 const script=`
 import React from 'react';import ReactDOM from 'react-dom/client';import Editor from '/src/components/ThreadsEditor.jsx';
 const initial={opening:'합성 제목',paragraphs:['지원 비율은 30%다.'],block_evidence:{paragraphs:[['지원 비율은 30%다.']]},generation_input:{requirements:''}};
 function App(){const [draft,setDraft]=React.useState(initial);return <><Editor draft={draft} changed={mutate=>setDraft(d=>{const next=structuredClone(d);mutate(next);return next;})} Evidence={({quotes})=><span data-testid="evidence">{quotes?.join('')}</span>} cards={[]} article={{photos:[]}}/><button onClick={()=>setDraft({...initial,generation_input:{requirements:'기사체로 작성'}})}>지정 문체</button></>;}
 ReactDOM.createRoot(document.getElementById('root')).render(<App/>);`;
 const html='<html><body><div id="root"></div><script type="module" src="/harness.jsx"></script></body></html>';
 const config={root:temp,configFile:path.join(root,'vite.config.js'),logLevel:'error',plugins:[{name:'repo-src',enforce:'pre',resolveId(source){if(source.startsWith('/src/'))return path.join(root,source.slice(1));}}]};
 let browser,dev,prod;
 try{
  await fs.writeFile(path.join(temp,'index.html'),html);await fs.writeFile(path.join(temp,'harness.jsx'),script);browser=await chromium.launch({headless:true});
  dev=await createServer({...config,server:{host:'127.0.0.1',port:0}});await dev.listen();
  await build({...config,build:{outDir:path.join(temp,'dist'),emptyOutDir:true}});
  prod=await preview({...config,build:{outDir:path.join(temp,'dist')},preview:{host:'127.0.0.1',port:0}});
  for(const server of [dev,prod]){
   const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(server.resolvedUrls.local[0]);await page.getByTestId('threads-tone-warning').waitFor();
   const body=page.getByRole('textbox',{name:'핵심 문장 1 편집',exact:true});
   assert.equal(await body.inputValue(),'지원 비율은 30%다.','저장 원고를 자동 교체하지 않음');
   await body.fill('지원 비율은 30%야.');await page.getByTestId('threads-tone-warning').waitFor({state:'detached'});
   assert.equal(await page.getByTestId('evidence').last().textContent(),'지원 비율은 30%다.','편집 중 근거 보존');
   await body.fill('지원 비율은 30%다.');await page.getByTestId('threads-tone-warning').waitFor();
   await page.getByRole('button',{name:'지정 문체',exact:true}).click();await page.getByTestId('threads-tone-warning').waitFor({state:'detached'});
   assert.equal(await body.inputValue(),'지원 비율은 30%다.');assert.deepEqual(errors,[]);await page.close();
  }
 }finally{
  if(browser)await browser.close();if(dev)await dev.close();if(prod)await new Promise(resolve=>prod.httpServer.close(resolve));
  // Only this test's verified temporary directory inside node_modules is removed.
  assert(path.dirname(temp)===path.join(root,'node_modules')&&path.basename(temp).startsWith('.threads-tone-ui-'));
  await fs.rm(temp,{recursive:true,force:true});
 }
});
