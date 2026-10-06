import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const base=process.argv[2];
const src=fs.readFileSync(new URL('../assets/article-workspace.js',import.meta.url),'utf8');
const pending=[];
const C=vm.runInNewContext('class W { '+src.slice(src.indexOf('  async persistArticle()'),src.indexOf('  showCandidates(type)'))+' }; W',{
  crypto:webcrypto,Date,CustomEvent:class{},stored:async()=>{},clearTimeout:()=>{},setTimeout:(fn)=>{pending.push(fn);return pending.length;}
});
const c=new C();c.state={articleId:webcrypto.randomUUID().replaceAll('-',''),title:'저장 시험',bodyHtml:'<p>첫 원고</p>',photos:[]};c.editRevision=0;c.isConnected=true;c.historyOpen=true;
c.capture=()=>{};c.getAttribute=()=>'';c.dispatchEvent=()=>{};c.updateStatus=()=>{};c.renderHistory=()=>{};c.notice=(s)=>{c.message=s;};c.q=()=>({isConnected:true});
Object.defineProperty(c,'value',{get:()=>structuredClone(c.state)});
c.api=async(path,data)=>{const res=await fetch(base+path,{method:data?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const payload=await res.json();if(!res.ok)throw Error(payload.error);return payload;};
await c.saveArticle();assert.equal(c.historyVersions.length,1);assert.equal(c.historyVersions[0].versionNumber,1);assert.match(c.saveStatus,/v1 저장됨/);
await c.saveArticle();assert.equal(c.historyVersions.length,2);assert.equal(c.historyVersions[0].versionNumber,2); // unchanged manual click creates checkpoint
await c.automaticVersion();assert.equal(c.historyVersions.length,2); // unchanged automatic doesn't
c.state.bodyHtml='<p>변경 원고</p>';c.editRevision++;
await c.automaticVersion();assert.equal(c.historyVersions.length,3);
const real=c.api;c.state.bodyHtml='<p>응답 유실 시험</p>';c.editRevision++;let lost=false;
c.api=async(path,data)=>{const value=await real(path,data);if(path.endsWith('/versions')&&data?.kind==='manual'&&!lost){lost=true;throw Error('응답 유실');}return value;};
await c.saveArticle();assert.match(c.saveStatus,/원고 저장됨 · 버전 기록 실패/);assert.ok(c.manualSaveId);
await c.saveArticle();assert.equal(c.historyVersions.length,4);assert.equal(c.historyVersions[0].versionNumber,4);assert.equal(c.manualSaveId,null);
console.log('Real HTTP + editor save: v1/v2 manual, unchanged auto skipped, v3 changed auto, v4 lost-response retry once');
