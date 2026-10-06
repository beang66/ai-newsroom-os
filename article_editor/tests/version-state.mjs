import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../assets/article-workspace.js',import.meta.url),'utf8');
const methods=src.slice(src.indexOf('  async saveVersion('),src.indexOf('  showCandidates(type)'));
const C=vm.runInNewContext('class W { '+methods+' }; W',{clearTimeout,Date,stored:async()=>{},CustomEvent:class{}});
function fixture(){const c=new C();c.state={articleId:'a'.repeat(32),bodyHtml:'현재 원고'};c.pending={};c.isConnected=true;c.editRevision=0;c.nodes={};c.q=s=>c.nodes[s]||=( {inert:false} );c.capture=()=>{};c.persistArticle=async()=>{c.lastSavedArticle={contentHash:"hash"};await c.api("/api/articles/save",{draft:c.value});};Object.defineProperty(c,'value',{get(){return structuredClone(c.state)}});c.renderHistory=()=>{};c.render=()=>{};c.loadHistory=async()=>{};c.getAttribute=()=>'';c.notice=s=>c.message=s;c.dispatchEvent=()=>{};c.historySelected={versionId:'b'.repeat(32)};return c;}
const c=fixture();let call=0;c.api=async(path,payload)=>{call++;if(path.endsWith('/restore'))return{draft:{articleId:'a'.repeat(32),bodyHtml:'과거 원고'}};return{version:{contentHash:'hash'}}};await c.restoreVersion();assert.equal(call,2);assert.equal(c.state.bodyHtml,'과거 원고');assert.equal(c.restoring,false);assert.equal(c.q('[data-main]').inert,false);
const f=fixture();f.api=async()=>{throw Error('저장 실패')};await f.restoreVersion();assert.equal(f.state.bodyHtml,'현재 원고');assert.equal(f.historyError,'저장 실패');assert.equal(f.q('.toolbar').inert,false);
const a=fixture();a.persistArticle=async()=>{};let resolve;a.api=()=>new Promise(r=>resolve=r);const p=a.saveVersion();await new Promise(r=>setTimeout(r,0));const p2=a.saveVersion();resolve({created:true,version:{contentHash:'hash'}});await Promise.all([p,p2]);assert.equal(a.versionSavePromise,null);
assert.match(src,/setInterval\(\(\) => this\.automaticVersion\(\), 180000\)/);
console.log('Version state checks passed');
const back=fixture();const original=structuredClone(back.state);const applied={articleId:original.articleId,bodyHtml:'선택한 과거 버전'};let restores=0;
back.api=async(path)=>{
  if(path.endsWith('/restore')) {restores++;return{draft:restores===1?applied:original,backupVersionId:'c'.repeat(32)}}
  return{version:{contentHash:'hash'}};
};
await back.restoreVersion();assert.equal(back.historyApplied.backupVersionId,'c'.repeat(32));assert.equal(back.state.bodyHtml,'선택한 과거 버전');
await back.returnToAppliedBackup();assert.equal(back.state.bodyHtml,'현재 원고');assert.equal(back.historyApplied,null);assert.equal(restores,2);
const failedReturn=fixture();failedReturn.historyApplied={backupVersionId:'c'.repeat(32)};failedReturn.api=async()=>{throw Error('저장 실패')};await failedReturn.returnToAppliedBackup();assert.equal(failedReturn.state.bodyHtml,'현재 원고');assert.equal(failedReturn.historyApplied.backupVersionId,'c'.repeat(32));
console.log('Apply then return to pre-apply draft and failed return checks passed');
