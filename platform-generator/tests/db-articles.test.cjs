const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('fs'),path=require('path');
const id='a'.repeat(32),snapshot={id:'frozen',article_id:id,title:'DB 기사',subtitle:'DB 부제',url:'',body_text:'DB 본문'};
test('개발 Core 중계는 기존 POST Origin 전제조건과 기사 ID 경로를 지킨다',async()=>{
 const http=require('http'),express=require('express');let seen;
 const coreServer=http.createServer((req,res)=>{
  seen={origin:req.headers.origin,method:req.method,path:req.url};
  const valid=req.headers.origin===`http://127.0.0.1:${coreServer.address().port}`;
  res.writeHead(valid?200:403,{'Content-Type':'application/json'});res.end(JSON.stringify(valid?snapshot:{error:'Origin required'}));
 });
 await new Promise(resolve=>coreServer.listen(0,'127.0.0.1',resolve));
 const previous=process.env.NEWSROOM_CORE_ORIGIN;process.env.NEWSROOM_CORE_ORIGIN=`http://127.0.0.1:${coreServer.address().port}`;
 const app=express();app.use(express.json());require('../db-article-routes')(app);
 const editor=app.listen(0,'127.0.0.1');await new Promise(resolve=>editor.once('listening',resolve));
 try {
  const origin=`http://127.0.0.1:${editor.address().port}`;
  const response=await fetch(origin+'/api/core/freeze',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({article:{article_id:id,title:snapshot.title,subtitle:snapshot.subtitle,url:'',content:snapshot.body_text}})});
  assert.equal(response.status,200);assert.equal((await response.json()).id,snapshot.id);
  assert.deepEqual(seen,{origin:process.env.NEWSROOM_CORE_ORIGIN,method:'POST',path:`/api/articles/${id}/snapshots`});
 } finally {
  if(previous===undefined)delete process.env.NEWSROOM_CORE_ORIGIN;else process.env.NEWSROOM_CORE_ORIGIN=previous;
  await new Promise(resolve=>editor.close(resolve));await new Promise(resolve=>coreServer.close(resolve));
 }
});
test('개발 입력도 Core DB·고정본을 사용하고 다른 기사·삭제·원문 변경은 거부',async()=>{
 const handlers=new Map(),calls=[];
 const core={listArticles:async()=>({articles:[{id,title:snapshot.title}]}),getArticle:async()=>({draft:{articleId:id}}),
  createSnapshot:async()=>snapshot,getSnapshot:async()=>snapshot,
  generatePlatform:async(...args)=>{calls.push(args);return {success:true,draft:{article_id:id}}},
  validatePlatform:async(...args)=>{calls.push(args);return {success:true}}};
 require('../db-article-routes')({get:(url,fn)=>handlers.set(url,fn),post:(url,fn)=>handlers.set(url,fn)},core);
 const invoke=async(url,body,params={},headers={})=>{let status=200,result;await handlers.get(url)({body,params,socket:{remoteAddress:'127.0.0.1'},headers:{host:'localhost:3001','content-type':'application/json',...headers}},{status(code){status=code;return this},json(value){result=value}});return {status,result}};
 const article={article_id:id,title:'DB 기사',subtitle:'DB 부제',url:'',content:'DB 본문'};
 assert.equal((await invoke('/api/core/freeze',{article})).result.id,'frozen');
 assert.equal((await invoke('/api/core/freeze',{article},{},{origin:'https://other.test'})).status,403);
 assert.equal((await invoke('/api/core/freeze',{article:{...article,subtitle:'변경 부제'}})).status,409);
 await invoke('/api/core/generate',{platform:'threads',snapshot_id:'frozen',payload:{article}});
 assert.equal(calls[0][0],'threads');assert.equal(calls[0][2],'frozen');
 assert.equal((await invoke('/api/core/generate',{snapshot_id:'frozen',payload:{article:{article_id:'other'}}})).status,409);
 core.createSnapshot=async()=>{throw Object.assign(Error('기사가 삭제됐습니다.'),{status:404})};
 assert.equal((await invoke('/api/core/freeze',{article})).status,404);
});
test('DB 화면: 제목·부제 읽기 전용, HTML 본문 호환, 느린 조회·삭제 실패와 이전 편집 보호',async()=>{
 const dom=new JSDOM('<aside class="left"><section id="platform-panel"></section></aside><input id="include-card-news" type="checkbox">',{runScripts:'outside-only',url:'http://localhost:3001/'}),w=dom.window;
 w.structuredClone=structuredClone;w.confirm=()=>true;let resets=0,saveFails=false,editorRevision=0;
 w.CardEditor={getRevision:()=>editorRevision,snapshot:()=>({edited:true}),resetForArticle:()=>{resets++;editorRevision++;}};
 w.NewsApi={listDbArticles:async()=>({articles:[]}),getDbArticle:async()=>({draft:{articleId:id,title:'실제 제목',subtitle:'',content:{type:'doc'},bodyHtml:'<p>실제 HTML 본문</p>'}}),
  saveLocalDraft:async()=>{if(saveFails)throw Error('저장 실패');return {success:true}},freezeDbArticle:async()=>snapshot};
 w.eval(fs.readFileSync(path.resolve(__dirname,'../public/article-input.js'),'utf8'));
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(w.document.getElementById('article-url'),null);assert.equal(w.document.getElementById('article-content'),null);
 await w.NewsInput.select(id);assert.equal(w.NewsInput.getRequest().article.content,'실제 HTML 본문');
 assert.equal(w.document.getElementById('article-subtitle').textContent,'부제목 없음');assert.equal(w.document.getElementById('article-title').tagName,'P');
 saveFails=true;editorRevision++;await w.NewsInput.select('b'.repeat(32));assert.equal(w.NewsInput.getRequest().article.article_id,id);assert.match(w.document.getElementById('article-import-status').textContent,/저장 실패/);
 saveFails=false;let release;w.NewsApi.getDbArticle=()=>new Promise(resolve=>release=resolve);
 const selecting=w.NewsInput.select('b'.repeat(32));await new Promise(resolve=>setTimeout(resolve,0));
 w.NewsInput.restore({article:{article_id:'c'.repeat(32),title:'현재 기사',subtitle:'현재 부제',content:'현재 본문'}});
 release({draft:{articleId:'b'.repeat(32),title:'늦은 기사',content:'옛 본문'}});await selecting;
 assert.equal(w.document.getElementById('article-title').textContent,'현재 기사');assert.equal(w.document.getElementById('article-subtitle').textContent,'현재 부제');
 w.NewsApi.getDbArticle=async()=>{throw Error('DB 기사가 삭제됐습니다.')};await w.NewsInput.select(id);
 assert.equal(w.document.getElementById('article-title').textContent,'기사 미선택');assert.equal(w.NewsInput.getRequest().article.content,'');
 assert.match(w.document.getElementById('article-import-status').textContent,/삭제/);assert.equal(resets,1);
 dom.window.close();
});
