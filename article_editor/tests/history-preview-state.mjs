import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../assets/article-workspace.js',import.meta.url),'utf8');
const methods=src.slice(src.indexOf('  async saveVersion('),src.indexOf('  showCandidates(type)'));
const C=vm.runInNewContext('class W { '+methods+' }; W',{clearTimeout,setTimeout,Date,stored:async()=>{},CustomEvent:class{}});
const c=new C();c.state={bodyHtml:'현재 작성 중인 원고'};c.historyPreview=true;c.nodes={};
const field={innerHTML:'선택 버전',inert:true,setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]}};
c.historyFieldBackup=[{node:field,html:'원래 작성란',editable:'true',inert:false}];c.historyControlBackup=[{node:{disabled:true},disabled:false}];c.historyCategoryBackup={node:{value:'정치'},value:'사회'};
c.q=s=>c.nodes[s]||=({disabled:true,classList:{remove(){}},remove(){},querySelectorAll(){return[]}});c.updateStatus=()=>{};c.renderHistory=()=>{};
c.returnHistoryDraft();assert.equal(c.state.bodyHtml,'현재 작성 중인 원고');assert.equal(c.historyPreview,false);assert.equal(field.innerHTML,'원래 작성란');assert.equal(field.contenteditable,'true');assert.equal(field.inert,false);assert.equal(c.q('[data-export]').disabled,false);
const Capture=vm.runInNewContext('class W { '+src.slice(src.indexOf('  capture()'),src.indexOf('  changed()'))+' }; W');
const cap=new Capture();cap.mode='edit';cap.historyPreview=true;cap.state={bodyHtml:'현재 원고'};cap.q=()=>{throw Error('임시 버전에서 원고를 읽으면 안 됨')};cap.capture();assert.equal(cap.state.bodyHtml,'현재 원고');
assert.ok(src.includes('이 버전 적용하기'));assert.ok(!src.includes('data-history-diagnose'));assert.ok(!src.includes('data-history-refresh'));
console.log('Staged version keeps live draft and original editor checks passed');

assert.ok(!src.slice(src.indexOf('  showHistoryDraft()'),src.indexOf('  async returnToAppliedBackup()')).includes('replaceChildren'));
assert.ok(!src.includes('<span>버전</span>'));
console.log('Existing editor fields restored without replacing page checks passed');
