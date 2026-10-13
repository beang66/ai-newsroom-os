// 기존 개발용 DB 우회 검증을 폐지 경로·Core 입력 계약·읽기 전용 복원 회귀로 대체한다.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('fs'),path=require('path');
const {coreArticle,generationPayload}=require('../lib/article-contract');
test('Core 세 필드 계약은 본문 속 캡션을 그대로 유지하고 부제·사진 메타데이터를 합치지 않음',()=>{
 const article={article_id:'a'.repeat(32),title:'기사 제목',content:'본문입니다.\n사진 설명: 실제 본문에 섞인 텍스트\n[사진:원본]',subtitle:'표시 전용 부제',url:'https://example.test/source',photos:[{caption:'별도 사진 캡션'}]};
 assert.deepEqual(coreArticle(article),{article_id:article.article_id,title:article.title,content:article.content});
 const payload=generationPayload({article,selected_keywords:[],requirements:''});
 assert.deepEqual(Object.keys(payload.article),['article_id','title','content']);assert.equal(payload.source_url,article.url);
 assert(!JSON.stringify(payload.article).includes(article.subtitle));assert(!JSON.stringify(payload.article).includes('별도 사진 캡션'));
 assert.equal(generationPayload({article:{...article,url:''},source_url:'https://other.test/live'}).source_url,'','고정본의 빈 출처를 현재 화면 URL로 채우지 않는다');
});
test('개발 서버에는 DB 조회·고정본·Core 중계와 URL 수집 경로가 없음',async()=>{
 const {createApp}=require('../server'),app=createApp();
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const route of ['/api/core/articles','/api/core/articles/'+ 'a'.repeat(32)])assert.equal((await fetch(base+route)).status,404);
  for(const route of ['/api/core/freeze','/api/core/generate','/api/core/validate','/api/article/import'])assert.equal((await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{}'})).status,404);
 }finally{await app.locals.closeSns();await new Promise(resolve=>server.close(resolve));}
});
test('개발 화면은 새 기사 입력 없이 기존 초안 복원, 부제 표시 분리, 조건 변경 결과 보호',()=>{
 const dom=new JSDOM('<aside class="left"><section id="platform-panel"></section></aside><input id="include-card-news" type="checkbox">',{runScripts:'outside-only',url:'http://localhost:3001/'}),w=dom.window;
 w.structuredClone=structuredClone;w.NewsApi=new Proxy({},{get(){throw Error('개발용 DB/API 조회 금지')}});
 try{
  w.eval(fs.readFileSync(path.resolve(__dirname,'../public/article-input.js'),'utf8'));
  for(const id of ['article-url','article-content','db-article','refresh-db-articles','import-article'])assert.equal(w.document.getElementById(id),null);
  w.NewsInput.restore({article:{article_id:'actual-id',title:'긴 제목 '.repeat(50),content:'원문\n사진 캡션도 그대로'}});
  assert.equal(w.document.getElementById('article-subtitle').textContent,'부제 전달 미연결');
  const input=w.NewsInput.getRequest();assert.deepEqual(Object.keys(input.article),['article_id','title','content']);
  w.NewsInput.capture(input);assert.equal(input.development_only,true);assert.equal(input.snapshot_id,undefined);
  w.document.getElementById('article-requirements').value='변경 조건';assert.equal(w.NewsInput.isCurrent(input),false);
  w.NewsInput.restore({article:{article_id:'next-id',title:'다른 기사',content:''},article_display:{subtitle:''}});
  assert.equal(w.document.getElementById('article-subtitle').textContent,'부제목 없음');assert.equal(w.NewsInput.isCurrent(input),false);
  w.NewsInput.restore({article:{article_id:'next-id',title:'다른 기사',content:'본문',subtitle:'실제 부제'}});
  assert.equal(w.document.getElementById('article-subtitle').textContent,'실제 부제');assert.equal(w.NewsInput.getRequest().article.subtitle,undefined);
  assert.equal(w.document.getElementById('article-title').tagName,'P');
 }finally{w.close()}
});
