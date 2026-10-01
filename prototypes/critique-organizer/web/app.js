/* UI adapter: no API keys, untrusted text always uses textContent. */
const $=id=>document.getElementById(id);
const state={graph:{nodes:[],edges:[]},projected:[],angle:0,tilt:.27,dragging:false,lastX:0,
 articleId:crypto.randomUUID(),version:1,generation:0,controller:null,corpusRevision:null,
 selectedSources:new Set(),result:null,filter:'priority',showAll:false,spell:[],spellTimer:null,spellController:null,undo:null};
const categories={facts:'사실관계',numbers:'숫자·통계',quotes:'인용·출처',logic:'논리적 연결',spelling:'맞춤법·오탈자',legal_ethics:'법적·윤리적 위험',names:'고유명사·인명·직책'};
async function api(url,options={}){
 const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
 const result=await response.json();if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`);return result;
}
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node}
function glossary(){return $('glossary').value.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const [canonical,...rest]=line.split('=');return {canonical:canonical.trim(),variants:rest.join('=').split(',').map(s=>s.trim()).filter(Boolean)}})}
function saveDraft(){try{sessionStorage.setItem('newsroom-v3-draft',JSON.stringify({article:$('article').value,title:$('headline').value,glossary:$('glossary').value,sourceIds:[...state.selectedSources],id:state.articleId,version:state.version}))}catch{}}
try{const draft=JSON.parse(sessionStorage.getItem('newsroom-v3-draft')||'null');if(draft&&typeof draft.article==='string'&&typeof draft.id==='string'&&Number.isInteger(draft.version)){
 $('article').value=draft.article;$('headline').value=draft.title||'';$('glossary').value=draft.glossary||'';state.articleId=draft.id;state.version=draft.version;state.selectedSources=new Set(draft.sourceIds||[]);
}}catch{}
function invalidate(reason){
 state.generation++;state.controller?.abort();state.controller=null;state.result=null;state.showAll=false;
 $('analyze').disabled=false;$('analyze').textContent='송고 전 점검 ↗';$('claimCount').textContent='—';
 for(const id of ['countPriority','countSpelling','countAdditional'])$(id).textContent='0';
 $('reviewResults').classList.remove('empty');$('reviewResults').replaceChildren(el('p','scope-note',reason));
}
function updateInput(reason='원고가 변경됐습니다. 현재 버전으로 다시 점검하세요.'){
 state.version++;state.undo=null;$('undoEdit').disabled=true;
 state.spellController?.abort();state.spell=[];renderMirror();$('spellPopover').classList.add('hidden');
 saveDraft();$('charCount').textContent=Array.from($('article').value).length.toLocaleString()+'자';invalidate(reason);scheduleProofread();
}
function scheduleProofread(){clearTimeout(state.spellTimer);state.spellTimer=setTimeout(proofread,750)}
async function proofread(){
 const version=state.version,article=$('article').value,title=$('headline').value;
 const controller=new AbortController();state.spellController?.abort();state.spellController=controller;
 try{
  const result=await api('/api/proofread',{method:'POST',signal:controller.signal,body:JSON.stringify({article,title,glossary:glossary()})});
  if(version!==state.version)return;
  state.spell=result.findings;$('spellStatus').textContent=`기본 맞춤법 후보 ${result.findings.length}건 · 8개 규칙 · 밑줄을 클릭해 확인`;
  renderMirror();
 }catch(error){if(error.name!=='AbortError'&&version===state.version)$('spellStatus').textContent='맞춤법 검사 미완료: '+error.message}
}
function renderMirror(){
 const root=$('spellMirror'),chars=Array.from($('article').value);root.replaceChildren();let position=0;
 for(const item of state.spell.filter(f=>f.anchor.field==='body').sort((a,b)=>a.anchor.start-b.anchor.start)){
  root.append(document.createTextNode(chars.slice(position,item.anchor.start).join('')),el('mark','',chars.slice(item.anchor.start,item.anchor.end).join('')));position=item.anchor.end;
 }
 root.append(document.createTextNode(chars.slice(position).join('')+'\n'));root.scrollTop=$('article').scrollTop;
}
function focusAnchor(anchor){
 const input=anchor.field==='title'?$('headline'):$('article'),chars=Array.from(input.value);
 input.focus();input.setSelectionRange(chars.slice(0,anchor.start).join('').length,chars.slice(0,anchor.end).join('').length);
 input.scrollIntoView({block:'center',behavior:'smooth'});
}
function applyCorrection(item,version){
 const input=item.anchor.field==='title'?$('headline'):$('article');const chars=Array.from(input.value);
 if(version!==state.version||chars.slice(item.anchor.start,item.anchor.end).join('')!==item.anchor.text){alert('원고가 변경됐습니다. 다시 점검하세요.');return}
 if(item.replacement===null||item.replacement===undefined)return;
 const before={article:$('article').value,title:$('headline').value};
 input.value=chars.slice(0,item.anchor.start).join('')+item.replacement+chars.slice(item.anchor.end).join('');
 updateInput('수정했습니다. 현재 원고로 다시 점검하세요.');
 state.undo={before,version:state.version,after:{article:$('article').value,title:$('headline').value}};$('undoEdit').disabled=false;
 focusAnchor({...item.anchor,end:item.anchor.start+Array.from(item.replacement).length});
}
$('undoEdit').onclick=()=>{
 const undo=state.undo;if(!undo||undo.version!==state.version||undo.after.article!==$('article').value||undo.after.title!==$('headline').value)return;
 $('article').value=undo.before.article;$('headline').value=undo.before.title;updateInput('수정을 되돌렸습니다. 다시 점검하세요.');
};
$('article').addEventListener('input',()=>updateInput());$('headline').addEventListener('input',()=>updateInput());
$('glossary').addEventListener('input',()=>updateInput('표기 기준이 변경됐습니다. 다시 점검하세요.'));
$('useOpenAI').addEventListener('change',()=>updateInput('모델 설정이 변경됐습니다. 다시 점검하세요.'));
$('article').addEventListener('scroll',()=>{$('spellMirror').scrollTop=$('article').scrollTop});
$('article').addEventListener('click',()=>{
 const offset=Array.from($('article').value.slice(0,$('article').selectionStart)).length;
 const item=state.spell.find(f=>f.anchor.field==='body'&&offset>=f.anchor.start&&offset<=f.anchor.end);
 const root=$('spellPopover');root.replaceChildren();root.classList.toggle('hidden',!item);if(!item)return;
 const version=state.version;root.append(el('p','',item.message),el('p','',item.action));
 if(item.replacement!==null){const apply=el('button','','적용');apply.onclick=()=>applyCorrection(item,version);root.append(apply)}
 const keep=el('button','','이번에는 유지');keep.onclick=()=>{root.classList.add('hidden')};root.append(keep);
});
function switchView(view){
 document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n.dataset.view===view));document.querySelectorAll('.view').forEach(n=>n.classList.toggle('hidden',n.id!==view));
 $('pageTitle').textContent=view==='verify'?'기사 검토 보조':'취재자료 탐색';$('pageDesc').textContent=view==='verify'?'송고 전, 놓치기 쉬운 오류와 확인할 대목을 점검합니다.':'자료와 자동 추출된 이름 후보를 탐색합니다.';
 if(view==='knowledge')setTimeout(draw,30);
}
document.querySelectorAll('.nav').forEach(n=>n.addEventListener('click',()=>switchView(n.dataset.view)));
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{state.filter=button.dataset.filter;state.showAll=false;renderReview()}));
$('analyze').addEventListener('click',async()=>{
 invalidate('점검 중…');const generation=state.generation,article=$('article').value,title=$('headline').value,version=state.version;
 const controller=new AbortController();state.controller=controller;$('analyze').disabled=true;$('analyze').textContent='점검 중…';
 try{
  const result=await api('/api/reviews',{method:'POST',signal:controller.signal,body:JSON.stringify({article,title,article_id:state.articleId,article_version:version,use_openai:$('useOpenAI').checked,source_document_ids:[...state.selectedSources],glossary:glossary()})});
  const health=await api('/api/health',{signal:controller.signal});
  if(generation!==state.generation||version!==state.version||article!==$('article').value||title!==$('headline').value)return;
  if(result.corpus_revision!==health.corpus_revision){invalidate('점검 중 자료가 변경됐습니다. 다시 점검하세요.');return}
  state.corpusRevision=health.corpus_revision;state.result=result;
  clearTimeout(state.spellTimer);state.spellController?.abort();
  state.spell=(result.findings||[]).filter(f=>f.categories.includes('spelling'));
  renderMirror();
  const model=result.model_proofreading;
  $('spellStatus').textContent=model?.state==='evaluated'
    ?`맞춤법 후보 ${state.spell.length}건 · AI 제안 ${state.spell.filter(f=>f.rule_id==='spell.model').length}건 · 위치 불일치 제외 ${model.rejected}건`
    :model?.state==='unavailable'?'OpenAI 맞춤법 검사 실패 · 기본 8개 규칙만 적용됨':`기본 맞춤법 후보 ${state.spell.length}건 · 8개 규칙`;
  state.filter=result.summary?.priority?'priority':result.summary?.spelling?'spelling':'priority';renderReview();
  await checkHealth();
 }catch(error){if(error.name!=='AbortError'&&generation===state.generation)$('reviewResults').textContent=error.message}
 finally{if(generation===state.generation){$('analyze').disabled=false;$('analyze').textContent='송고 전 점검 ↗';state.controller=null}}
});
function locatorText(locator){return Object.entries(locator).filter(([key])=>key!=='kind').map(([key,value])=>`${key}: ${value}`).join(' · ')}
async function acknowledge(item,status){
 const result=state.result,generation=state.generation;if(!result)return;
 try{
  await api('/api/finding-status',{method:'POST',body:JSON.stringify({review_id:result.id,finding_id:item.id,status,input_hash:result.input_hash})});
  if(generation!==state.generation||state.result!==result)return;item.status=status;renderReview();
 }catch(error){alert(error.message)}
}
function renderReview(){
 const result=state.result;if(!result)return;const findings=result.findings||[];
 const root=$('reviewResults');root.classList.remove('empty');root.replaceChildren();
 const pending=findings.filter(f=>f.status!=='acknowledged');$('claimCount').textContent=pending.length+'건 남음';
 for(const [group,id] of Object.entries({priority:'countPriority',spelling:'countSpelling',additional:'countAdditional'}))$(id).textContent=pending.filter(f=>f.group===group).length;
 document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===state.filter));
 const coverage=result.coverage,summary=el('div','summary');summary.append(el('strong','',`이번 점검 종료 · 원고 v${result.article_version}`),document.createTextNode(`선택 자료 ${(result.source_document_ids||[]).length}개 · ${coverage.processed_sentences}/${coverage.total_sentences}문장 처리. 경고는 송고를 막지 않습니다.`));
 if(coverage.unevaluated_pairs)summary.append(el('div','',`모델 미평가 ${coverage.unevaluated_pairs}쌍 · 규칙 검사 결과와 구분됩니다.`));
 if(result.model_proofreading?.state==='unavailable')summary.append(el('div','',`OpenAI 맞춤법 검사를 마치지 못했습니다 (${result.model_proofreading.reason}). 기본 규칙 결과만 표시합니다.`));
 root.append(summary);
 const scope=el('details','scope-list');scope.append(el('summary','','7개 영역의 실제 검사 범위 보기'));
 const list=el('ul');for(const check of result.checks||[]){const status={not_requested:'자료 비교 미실시',no_matching_candidates:'자료 선택됨 · 후보 검색 실패',candidates_compared:'검색 후보만 비교',not_applicable:'기사 내부 규칙'};list.append(el('li','',`${check.label}: ${status[check.source_comparison]} · ${check.limitation}`))}scope.append(list);root.append(scope);
 const items=findings.filter(f=>f.group===state.filter).sort((a,b)=>(a.status==='acknowledged')-(b.status==='acknowledged'));
 const visible=state.filter==='priority'&&!state.showAll?items.slice(0,3):items;
 if(!items.length)root.append(el('p','scope-note','이번 검사 규칙에서 표시할 항목이 없습니다. 기사 전체의 정확성을 보장하는 뜻은 아닙니다.'));
 for(const item of visible){
  const card=el('article','finding-card'+(item.status==='acknowledged'?' done':'')),tags=el('div','claim-top');
  for(const code of item.categories)tags.append(el('span','tag',categories[code]));
  if(item.status!=='open')tags.append(el('span','tag',item.status==='acknowledged'?'확인함':'나중에'));
  card.append(tags,el('h3','',item.message),el('blockquote','',item.anchor.text),el('p','',item.action));
  const actions=el('div','finding-actions'),focus=el('button','','기사 위치로');focus.onclick=()=>focusAnchor(item.anchor);actions.append(focus);
  if(item.replacement!==null&&item.replacement!==undefined){const apply=el('button','',`‘${item.replacement}’ 적용`);apply.onclick=()=>applyCorrection(item,result.article_version);actions.append(apply)}
  for(const anchor of item.related_anchors||[]){const related=el('button','','비교 문장으로');related.onclick=()=>focusAnchor(anchor);actions.append(related)}
  for(const candidate of item.evidence){const box=el('div','evidence'),link=el('button','',candidate.title+' · '+locatorText(candidate.locator)+' ↗');link.onclick=()=>showDocument(candidate.document_id,candidate);box.append(link,el('blockquote','',candidate.excerpt));card.append(box)}
  const checked=el('button','',item.status==='acknowledged'?'다시 열기':'확인함');checked.onclick=()=>acknowledge(item,item.status==='acknowledged'?'open':'acknowledged');actions.append(checked);
  const later=el('button','','나중에');later.onclick=()=>acknowledge(item,'later');actions.append(later);card.append(actions);root.append(card);
 }
 if(visible.length<items.length){const more=el('button','primary',`나머지 ${items.length-visible.length}건 보기`);more.onclick=()=>{state.showAll=true;renderReview()};root.append(more)}
}
async function showDocument(id,candidate=null){
  try{
    const {document:doc}=await api('/api/documents/'+encodeURIComponent(id));
    if(!doc)throw new Error('자료가 삭제됐습니다.');
    $('sourceTitle').textContent=doc.title;
    $('sourceMeta').textContent=`경로: ${doc.path} · 원본 SHA-256: ${doc.id} · ${doc.parse_info.scope}\n${doc.parse_info.warnings.join(' / ')}`;
    $('sourceDownload').href='/api/documents/'+encodeURIComponent(id)+'/original';
    const root=$('sourceBlocks');root.replaceChildren();let target=null;
    for(const block of doc.blocks){
      const selected=candidate?.block_id===block.id;
      const row=el('section','source-block'+(selected?' selected':''));row.append(el('small','',locatorText(block.locator)));
      if(selected){
        const chars=Array.from(block.text);
        row.append(document.createTextNode(chars.slice(0,candidate.start).join('')),el('mark','',chars.slice(candidate.start,candidate.end).join('')),document.createTextNode(chars.slice(candidate.end).join('')));target=row;
      }else row.append(document.createTextNode(block.text));
      root.append(row);
    }
    if(!$('sourceDialog').open)$('sourceDialog').showModal();
    if(target)target.scrollIntoView({block:'center'});else $('sourceDialog').scrollTop=0;
  }catch(error){alert(error.message)}
}
$('closeSource').onclick=()=>{$('sourceDialog').close();$('sourceBlocks').replaceChildren()};
// The file organizer owns catalog, graph and upload state independently of Critique.
async function refresh(){ return window.NewsroomKnowledge.refresh(); }
function draw(){ window.NewsroomKnowledge.draw(); }
async function checkHealth(){
  try{
    const health=await api('/api/health');
    const errorLabel={invalid_api_key:'API 키가 유효하지 않음',access_denied:'모델 접근 권한 없음',
      quota_or_rate_limit:'사용 한도 또는 요청 제한',model_or_request_invalid:'모델명 또는 요청 오류',
      network_or_timeout:'네트워크 또는 시간 초과',provider_response_invalid:'응답 형식 오류',provider_http_error:'API 응답 오류'};
    const label={connected:'API 연결 성공',failed:`API 연결 실패 · ${errorLabel[health.openai_reason]||'응답 오류'}`,not_tested:'키 설정됨 · 연결 미확인'};
    $('mode').textContent=health.openai_configured?(label[health.openai_connection]||'연결 상태 미확인'):'로컬 검토 · OpenAI 키 없음';
    if(state.corpusRevision!==null&&state.corpusRevision!==health.corpus_revision){
      invalidate('다른 작업에서 자료가 변경됐습니다. 다시 검토하세요.');
      $('sourceDialog').close();$('sourceBlocks').replaceChildren();$('searchResults').replaceChildren();await refresh();
    }
  }catch{$('mode').textContent='서버 연결 실패'}
}
$('checkOpenAI').onclick=async()=>{
 const button=$('checkOpenAI');button.disabled=true;$('mode').textContent='API 연결 확인 중…';
 try{
  const result=await api('/api/openai/check',{method:'POST',body:'{}'});
  await checkHealth();
  if(result.status==='key_missing')$('mode').textContent='OpenAI 키 없음 · .env 저장 후 서버 재시작';
 }catch(error){$('mode').textContent='API 연결 확인 실패: '+error.message}
 finally{button.disabled=false}
};
window.addEventListener('focus',checkHealth);
// knowledge.js mounts after this script and starts the initial catalog request.

$('charCount').textContent=Array.from($('article').value).length.toLocaleString()+'자';
renderMirror();
