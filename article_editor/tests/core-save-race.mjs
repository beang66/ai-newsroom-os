import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../assets/article-workspace.js',import.meta.url),'utf8');
const methods=source.slice(source.indexOf('  async persistArticle()'),source.indexOf('  showCandidates(type)'));
const W=vm.runInNewContext('class W {'+methods+'};W',{structuredClone,stored:async()=>{},CustomEvent:class{}});
const w=new W();w.state={articleId:'a'.repeat(32),bodyHtml:'처음',core_context:{revision_no:7}};w.editRevision=0;
w.getAttribute=()=>'';w.dispatchEvent=()=>{};w.shadowRoot={querySelectorAll:()=>[]};
Object.defineProperty(w,'value',{get:()=>structuredClone(w.state)});
let release;let calls=0;
w.api=async(path,payload)=>{
    calls++;
    if(calls===1){await new Promise(resolve=>release=resolve);return{articleId:w.state.articleId,storageDraft:{...payload.draft,core_context:{revision_no:8}}};}
    assert.equal(payload.draft.core_context.revision_no,8);
    assert.equal(payload.draft.bodyHtml,'입력 계속');
    return{articleId:w.state.articleId,storageDraft:{...payload.draft,core_context:{revision_no:9}}};
};
const promise=w.persistArticle();w.state.bodyHtml='입력 계속';w.editRevision=1;release();await promise;
assert.equal(calls,2);assert.equal(w.state.core_context.revision_no,9);assert.equal(w.state.bodyHtml,'입력 계속');
console.log('PASS typing during Core save preserves latest text and advances expected revision');
