// State/race tests using a minimal DOM shim. These are NOT browser-rendering tests.
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
class Element {
  constructor(){this.value='';this.textContent='';this.children=[];this.events={};this.dataset={};this.classList={add(){},remove(){},toggle(){}};this.checked=false;this.open=false;}
  addEventListener(name,handler){this.events[name]=handler;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;this.textContent='';}
  getBoundingClientRect(){return {width:0,height:0};}
  close(){this.open=false;}
  showModal(){this.open=true;}
  scrollIntoView(){}
  focus(){}
  setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
  removeAttribute(){}
}
async function setup(){
  const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const data={revision:0,pending:null,connection:'not_tested'};
  const response=value=>({ok:true,json:async()=>value});
  const fetch=async(url)=>{
    if(url==='/api/reviews')return new Promise(resolve=>{data.pending=result=>resolve(response(result));});
    if(url==='/api/health')return response({openai_configured:true,openai_connection:data.connection,corpus_revision:data.revision});
    if(url==='/api/openai/check'){data.connection='connected';return response({status:'connected',reason:''});}
    if(url==='/api/documents')return response({documents:[],corpus_revision:data.revision});
    if(url==='/api/graph')return response({nodes:[],edges:[]});
    throw new Error('Unexpected URL '+url);
  };
  const context={document:{getElementById:get,querySelectorAll:()=>[],createElement:()=>new Element(),createTextNode:text=>({textContent:text})},
    window:{addEventListener(){}},fetch,crypto:{randomUUID},sessionStorage:{getItem(){return null},setItem(){}},
    AbortController,URL,console,setTimeout,clearTimeout,devicePixelRatio:1,alert(){},confirm(){return true}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  return {get,data,context};
}
const result=()=>({article_version:1,corpus_revision:0,claims:[],coverage:{processed_sentences:0,total_sentences:0,omitted_sentences:0,evaluated_pairs:0,unevaluated_pairs:0}});

test('late response is ignored after article edit even if transport ignores abort',async()=>{
  const {get,data}=await setup();get('article').value='원고의 첫 버전입니다.';
  const pending=get('analyze').events.click();
  get('article').value='수정한 원고입니다.';get('article').events.input();
  data.pending(result());await pending;
  assert.equal(get('claimCount').textContent,'—');
  assert.match(get('reviewResults').children[0].textContent,/원고가 변경/);
  assert.equal(get('analyze').disabled,false);
});
test('editing a completed review immediately removes its result',async()=>{
  const {get,data}=await setup();get('article').value='첫 원고입니다.';
  const pending=get('analyze').events.click();data.pending(result());await pending;
  assert.equal(get('claimCount').textContent,'0건 남음');
  get('article').value='두 번째 원고입니다.';get('article').events.input();
  assert.equal(get('claimCount').textContent,'—');
});
test('response is rejected when source corpus revision has changed',async()=>{
  const {get,data}=await setup();get('article').value='원고입니다.';
  const pending=get('analyze').events.click();data.revision=1;data.pending(result());await pending;
  assert.equal(get('claimCount').textContent,'—');
  assert.match(get('reviewResults').children[0].textContent,/자료가 변경/);
});

test('spelling correction uses code-point offsets and undo restores the draft',async()=>{
  const {get,context}=await setup();get('article').value='😀 몇일 뒤';
  context.applyCorrection({anchor:{field:'body',start:2,end:4,text:'몇일'},replacement:'며칠'},1);
  assert.equal(get('article').value,'😀 며칠 뒤');
  assert.equal(get('article').selectionStart,3); // UTF-16 position after emoji and space
  get('undoEdit').onclick();assert.equal(get('article').value,'😀 몇일 뒤');
});
test('manual edit prevents a previous correction undo from overwriting new work',async()=>{
  const {get,context}=await setup();get('article').value='몇일 뒤';
  context.applyCorrection({anchor:{field:'body',start:0,end:2,text:'몇일'},replacement:'며칠'},1);
  get('article').value='새로 작성한 문장';get('article').events.input();get('undoEdit').onclick();
  assert.equal(get('article').value,'새로 작성한 문장');
});
test('stale correction cannot edit a newer draft',async()=>{
  const {get,context}=await setup();get('article').value='몇일 뒤';get('article').events.input();
  context.applyCorrection({anchor:{field:'body',start:0,end:2,text:'몇일'},replacement:'며칠'},1);
  assert.equal(get('article').value,'몇일 뒤');
});
test('connection check verifies the API state only after explicit click',async()=>{
  const {get,data}=await setup();
  assert.equal(data.connection,'not_tested');
  await get('checkOpenAI').onclick();
  assert.equal(get('mode').textContent,'API 연결 성공');
});
test('AI spelling findings appear in the spelling tab and article mirror',async()=>{
  const {get,data}=await setup();get('article').value='잇다.';
  const pending=get('analyze').events.click();
  data.pending({...result(),findings:[{rule_id:'spell.model',categories:['spelling'],group:'spelling',status:'open',
    anchor:{field:'body',start:0,end:2,text:'잇다'},replacement:'있다',message:'맞춤법 후보',action:'확인',evidence:[]}],
    summary:{priority:0,spelling:1},model_proofreading:{state:'evaluated',reason:'',rejected:0}});
  await pending;
  assert.equal(get('countSpelling').textContent,1);
  assert.match(get('spellStatus').textContent,/AI 제안 1건/);
  assert.ok(get('spellMirror').children.some(n=>n.textContent==='잇다'));
});
