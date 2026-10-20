const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),Tone=require('../lib/threads-tone');
const article={article_id:'tone-fixture',title:'지원 계획',content:'지원 비율은 30%다. 관계자는 “시행일은 미정이다”라고 밝혔다.'};
const original={presentation:{mode:'use',emoji:'📰',reason:'일반 뉴스'},title:article.title,title_source_evidence:[article.content],summary_blocks:[{text:'지원 비율은 30%다.',source_evidence:[article.content]},{text:'관계자는 “시행일은 미정이다”라고 밝혔어.',source_evidence:[article.content]}],hashtags:['#지원','#계획','#뉴스']};
const response=value=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
function load(answer){class AI{static apiKey='fixture';static model='fixture';responses={create:answer};}const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'text-generator.js'),'utf8'),{module:mod,__dirname:root,process:{env:{PLATFORM_AI_BRIDGE:'core'}},console,require:name=>name==='./ai-provider'?AI:name.startsWith('./')?require(path.join(root,name)):require(name)});return mod.exports.generateTextPlatform;}
test('기사체·존댓말 감지, 자연스러운 반말·질문·직접 인용 및 지정 문체 예외',()=>{
 assert.equal(Tone.issues(['높다.','정부가 밝혔다.','지원했습니다.','지원해요.']).length,4);
 assert.equal(Tone.issues(['높아. 지원할 예정이야.','누가 지원할까?','“지원한다.”라고 밝혔어.','“지원한다.”']).length,0);
 for(const requirements of ['기사체로 작성','-다 체로 작성','해요체로 작성','존댓말로 작성','반말 말고 기사체'])assert.equal(Tone.issues(['지원한다.'],requirements).length,0);
 assert.equal(Tone.issues(['지원한다.'],'다체 금지, 반말로 작성').length,1);
 assert.equal(Tone.issues(['지원한다.'],'기사체를 반말로 변경해').length,1);
 assert.equal(Tone.issues(['지원한다. 지원할까?']).length,1,'중간 문장도 검사');
});
test('새 결과의 문제 문단만 한 번 교정하고 제목·정상 문단·근거·태그 유지',async()=>{
 const calls=[];const result=await load(async request=>{calls.push(request);if(calls.length===1)return response(original);assert.equal(request.text.format.name,'threads_tone_repair');const input=JSON.parse(request.input);assert.deepEqual(input.blocks.map(block=>block.index),[0]);return response({repairs:[{index:0,text:'지원 비율은 30%야.'}]});})('threads',{article,selected_keywords:[],requirements:''});
 assert.equal(calls.length,2);assert.equal(result.paragraphs[0],'지원 비율은 30%야.');assert.equal(result.paragraphs[1],original.summary_blocks[1].text);assert.equal(result.opening,'📰 '+original.title);assert.deepEqual(Array.from(result.hashtags),original.hashtags);assert.deepEqual(Array.from(result.source_evidence),[article.content]);assert.equal(result.validation_status,'not_checked');
});
test('첫 교정에서 말투가 남으면 그 문단과 문제 문장만 한 번 더 교정',async()=>{
 const requests=[];
 const result=await load(async request=>{
  requests.push(request);
  if(requests.length===1)return response(original);
  if(requests.length===2)return response({repairs:[{index:0,text:'지원 비율은 30%다.'}]});
  const next=JSON.parse(request.input);
  assert.deepEqual(next.blocks.map(block=>block.index),[0]);
  assert.match(next.blocks[0].problem_sentence,/30%다/);
  return response({repairs:[{index:0,text:'지원 비율은 30%야.'}]});
 })('threads',{article,selected_keywords:[]});
 assert.equal(requests.length,3);
 assert.equal(result.paragraphs[0],'지원 비율은 30%야.');
 assert.equal(result.paragraphs[1],original.summary_blocks[1].text);
});
test('두 번 교정해도 말투가 남으면 해당 문단을 버리지 않고 편집 가능한 초안으로 반환',async()=>{
 let calls=0;
 const draft=await load(async()=>response(++calls===1?original:{repairs:[{index:0,text:'지원 비율은 30%다.'}]}))('threads',{article,selected_keywords:[]});
 assert.equal(calls,3);
 assert.equal(draft.tone_repair_status,'needs_edit');
 assert.equal(draft.paragraphs[0],'지원 비율은 30%다.');
 assert.equal(draft.paragraphs[1],original.summary_blocks[1].text);
 assert.deepEqual(Array.from(draft.block_evidence.paragraphs[0]),[article.content]);
 assert.equal(Tone.issues(draft.paragraphs).length,1);
});
test('정상 반말·지정 다체에는 교정 호출이 추가되지 않음',async()=>{
 for(const requirements of ['', '기사체로 작성']){let calls=0;const draft=structuredClone(original);if(!requirements)draft.summary_blocks[0].text='지원 비율은 30%야.';
 await load(async()=>{calls++;return response(draft);})('threads',{article,selected_keywords:[],requirements});assert.equal(calls,1);}
});

test('교정 문단의 반환 순서가 달라도 번호로 연결하고 제한된 교정 지침을 사용',async()=>{
 const draft=structuredClone(original);draft.summary_blocks[1].text='관계자는 “시행일은 미정이다”라고 밝혔다.';let calls=0;
 const result=await load(async request=>{
  if(++calls===1)return response(draft);
  assert(request.instructions.includes('0부터 시작'));assert(request.instructions.includes('요약·재구성하지 않습니다'));
  assert.deepEqual(Array.from(request.text.format.schema.properties.repairs.items.properties.index.enum),[0,1]);
  return response({repairs:[{index:1,text:'관계자는 “시행일은 미정이다”라고 밝혔어.'},{index:0,text:'지원 비율은 30%야.'}]});
 })('threads',{article,selected_keywords:[]});
 assert.equal(calls,2);assert.equal(result.paragraphs[0],'지원 비율은 30%야.');assert.equal(result.paragraphs[1],'관계자는 “시행일은 미정이다”라고 밝혔어.');
});

test('교정 실패를 응답 원문 없이 필드별 코드로 구분',async()=>{
 for(const [repairs,code] of [[[],'REPAIR_COUNT'],[[{index:1,text:'높아.'}],'REPAIR_INDEX'],[[{index:0,text:''}],'REPAIR_EMPTY'],[[{index:0,text:'지원 비율은 20%야.'}],'NUMBER_CHANGED']]){
  let calls=0;await assert.rejects(load(async()=>response(++calls===1?original:{repairs}))('threads',{article,selected_keywords:[]}),error=>error.message.includes(`[${code}]`));assert.equal(calls,2);
 }
});
test('교정 결과 누락·중복·잘못된 번호·수치 변경은 즉시 실패하고 원본 객체 보존',async()=>{
 for(const repairs of [[],[null],[{index:1,text:'지원 비율은 30%야.'}],[{index:0,text:'지원 비율은 20%야.'}],[{index:0,text:'지원 비율은 30원이야.'}],[{index:0,text:'지원 비율은 30%야.'},{index:0,text:'중복이야.'}]]){
 let calls=0;await assert.rejects(load(async()=>response(++calls===1?original:{repairs}))('threads',{article,selected_keywords:[]}),/말투 교정/);assert.equal(calls,2);assert.equal(original.summary_blocks[0].text,'지원 비율은 30%다.');}
});
test('직접 인용을 변경한 말투 교정은 거부',async()=>{
 const draft=structuredClone(original);draft.summary_blocks[0].text='관계자는 “지원 비율은 30%다”라고 밝혔다.';let calls=0;
 await assert.rejects(load(async()=>response(++calls===1?draft:{repairs:[{index:0,text:'관계자는 “지원 비율은 30%야”라고 밝혔어.'}]}))('threads',{article,selected_keywords:[]}),/말투 교정/);assert.equal(calls,2);
});
test('말투 교정의 거절 응답은 추가 재시도하지 않음',async()=>{
 let calls=0;await assert.rejects(load(async()=>++calls===1?response(original):{status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]})('threads',{article,selected_keywords:[]}),/생성하지 못했습니다/);assert.equal(calls,2);
});
test('이모지 오류와 말투 오류가 함께 있으면 각 보완 한 번, 최대 세 번 호출',async()=>{
 let calls=0;const draft=structuredClone(original);draft.presentation.emoji='';
 const result=await load(async request=>{calls++;if(calls===1)return response(draft);if(request.text.format.name==='threads_presentation')return response({presentation:{mode:'use',emoji:'📰',reason:'뉴스'}});return response({repairs:[{index:0,text:'지원 비율은 30%야.'}]});})('threads',{article,selected_keywords:[]});
 assert.equal(calls,3);assert.equal(result.paragraphs[0],'지원 비율은 30%야.');
});
test('기존 저장 원고 검수도 기사체를 지적하고 사용자 다체 요청은 존중',()=>{
 const {checkBasicRules,extractDraft,createQuoteChecker}=require('../draft-validator'),{getPlatformRules}=require('../platform-rules');
 const draft={opening:article.title,paragraphs:['지원 비율은 30%다.'],closing:'',hashtags:original.hashtags,source_evidence:[article.content]};
 const check=requirements=>checkBasicRules('threads',extractDraft('threads',draft),getPlatformRules('threads'),createQuoteChecker(article),requirements);
 assert(check('').requirement.some(issue=>issue.location==='paragraphs[0]'&&issue.reason.includes('반말')));assert.equal(check('기사체로 작성').requirement.length,0);
});
