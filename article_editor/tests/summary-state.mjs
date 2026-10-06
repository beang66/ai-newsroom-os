import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../assets/article-workspace.js',import.meta.url),'utf8');
const methods=src.slice(src.indexOf('  updateFlowStatus() {'),src.indexOf('\n}\ncustomElements.define'));
const C=vm.runInNewContext('class W { '+methods+' }; W',{plain:v=>v,esc:v=>v,stored:async()=>{},CustomEvent:class{}});
function fixture(){const c=new C(),nodes={};for(const k of ['result','message','refresh','stale','model'])nodes[k]={isConnected:true,textContent:'',disabled:false,hidden:false,innerHTML:''};c.state={bodyHtml:'원래 본문'};c.editRevision=0;c.q=s=>nodes[s.match(/flow-(\w+)/)[1]];c.capture=()=>{};c.getAttribute=()=>'';c.saveArticle=()=>{c.saved=c.state.summary};c.dispatchEvent=()=>{};c.updateStatus=()=>{};return {c,nodes}}
const response={paragraphs:['첫 핵심','둘째 핵심','셋째 핵심'],metadata:{models:[{model:'test-model'}]}};
const {c,nodes}=fixture();let resolve;c.api=()=>new Promise(r=>resolve=r);const pending=c.refreshFlow();c.state.bodyHtml='수정 본문';resolve(response);await pending;
assert.equal(c.state.summary.inputText,'원래 본문');assert.equal(nodes.stale.hidden,false);assert.match(nodes.model.textContent,/test-model/);assert.ok(c.saved);
const previous=c.state.summary;c.api=async()=>{throw Error('연결 실패')};await c.refreshFlow();assert.equal(c.state.summary,previous);assert.equal(nodes.refresh.textContent,'다시 시도');assert.equal(nodes.refresh.disabled,false);
c.api=async()=>response;await c.refreshFlow();assert.equal(nodes.stale.hidden,true);assert.equal(nodes.refresh.textContent,'새로고침');
for(const close of [true,false]){const {c,nodes}=fixture();let resolve;c.api=()=>new Promise(r=>resolve=r);const p=c.refreshFlow();if(close)nodes.result.isConnected=false;else c.state={bodyHtml:'다른 원고'};resolve(response);await p;assert.equal(Boolean(c.saved),close)}
console.log('Summary state checks passed');
