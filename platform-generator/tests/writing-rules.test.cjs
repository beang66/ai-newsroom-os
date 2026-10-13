// 생성 계약: 외부 AI 호출 없이 출력 항목과 사용자 요구사항 전달을 확인합니다.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('Threads 해시태그와 질문의 근거를 보존하며 새 지침을 전달',async()=>{
 const article={article_id:'fixture',title:'두 그룹 데뷔',content:'이수만이 두 그룹을 동시에 선보입니다.'};
 const tags=['#이수만','#데뷔','#케이팝'];let request;
 class FakeAI {static apiKey='fixture';static model='fixture';responses={create:async r=>{request=r;return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({presentation:{mode:'use',emoji:'📰',reason:'뉴스'},title:'이수만의 두 그룹 동시 데뷔',title_source_evidence:[article.content],summary_blocks:[{text:'각자의 매력을 어떻게 보여줄까요?',source_evidence:[article.content]}],hashtags:tags})}]}]}}};}
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'text-generator.js'),'utf8'),{module,__dirname:root,process,console,require:name=>name==='./ai-provider'?FakeAI:name==='dotenv'?{config(){}}:name.startsWith('./')?require(path.join(root,name)):require(name)});
 const draft=await module.exports.generateTextPlatform('threads',{article,selected_keywords:[],requirements:'반말로 작성'});
 assert.deepEqual(Array.from(draft.hashtags),tags);assert.equal(draft.evidence_valid,true);
 assert.match(request.instructions,/자연스럽게 설명하는 반말/);assert.match(request.instructions,/앞 문장과 실제 관계/);assert.match(request.instructions,/짧은 명사형/);
 assert.match(request.instructions,/조사와 어미를 확인/);assert.match(request.instructions,/문장 수를 맞추려고 어색하게 줄이지 않습니다/);
 assert.doesNotMatch(request.instructions,/문장 흐름 비교 예시|A2O SOUL/);
 assert.match(request.instructions,/100~180/);assert.doesNotMatch(request.instructions,/기본 4~5/);
 assert.match(request.instructions,/최소 기준 안에서 사용자/);
 assert.equal(JSON.parse(request.input).requirements,'반말로 작성');
 assert.ok(request.text.format.schema.required.includes('hashtags'));
});

test('Instagram 명사형 도입·본문 연결 지침과 사용자 조건을 실제 AI 요청에 전달',async()=>{
 const article={article_id:'fixture',title:'두 팀 데뷔',content:'두 팀을 동시에 선보입니다.'};let request;
 const block={text:'두 팀의 동시 데뷔',source_evidence:[article.content]};
 class FakeAI {static apiKey='fixture';static model='fixture';responses={create:async r=>{request=r;return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({emoji:"📰",opening:block,paragraphs:[{...block,text:'이번에는 두 팀을 동시에 선보입니다.'}],closing:{...block,text:'두 팀의 출발 방식입니다.'},hashtags:['#데뷔','#그룹','#뉴스']})}]}]}}};}
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'instagram-generator.js'),'utf8'),{module,__dirname:root,process,console,require:name=>name==='./ai-provider'?FakeAI:name==='dotenv'?{config(){}}:name.startsWith('./')?require(path.join(root,name)):require(name)});
 const draft=await module.exports.generateInstagram({article,selected_keywords:[],requirements:'쉽게 작성'});
 assert.equal(draft.opening,'📰 '+block.text);assert.equal(draft.evidence_valid,true);
 assert.match(request.instructions,/명사형 도입/);assert.match(request.instructions,/본문 연결/);
 assert.match(request.instructions,/핵심 정리와 원문의 최종 결론/);assert.match(request.instructions,/한 문장에는 하나의 주요 주장/);
 assert.match(request.instructions,/기본 2~4개 문단/);assert.match(request.instructions,/서로 연결된 사실은 한 문단에서 함께 설명/);
 assert.match(request.instructions,/같은 수치·일정·사실을 다른 표현으로 다시 설명/);assert.match(request.instructions,/마지막 본문을 다시 요약하는 칸이 아닙니다/);
 assert.match(request.instructions,/관심이 모아집니다/);assert.doesNotMatch(request.instructions,/Threads 전용 말투/);
 assert.equal(JSON.parse(request.input).requirements,'쉽게 작성');
 assert.deepEqual(Array.from(request.text.format.schema.required),['emoji','opening','paragraphs','closing','hashtags']);
});


test('Instagram 형식 계약은 명사구 마무리·중복 이모지·다른 문체를 구분',()=>{
 const {checkWriting}=require('../instagram-writing-contract');
 const draft={emoji:'📰',opening:{text:'사건 조사 착수'},paragraphs:[{text:'조사를 진행합니다.'}],closing:{text:'조사 결과는 아직 확인되지 않았습니다.'}};
 assert.deepEqual(checkWriting(draft),[]);
 assert.ok(checkWriting({...draft,closing:{text:'조사 결과'}}).length);
 assert.ok(checkWriting({...draft,opening:{text:'📰 사건 조사 착수'}}).length);
 assert.deepEqual(checkWriting({...draft,closing:{text:'아직 조사 중이야.'}},'반말로 작성'),[]);
});

test('Instagram 명사구 마무리는 한 번 재생성 후 완전한 문장 반환',async()=>{
 const article={article_id:'fixture',title:'두 팀 데뷔',content:'두 팀을 동시에 선보입니다.'};let calls=0;
 const block={text:'두 팀의 동시 데뷔',source_evidence:[article.content]};
 class FakeAI {static apiKey='fixture';static model='fixture';responses={create:async request=>{
  calls++;if(calls===2)assert.match(request.instructions,/closing은 명사구/);
  return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({emoji:'🎵',opening:block,paragraphs:[{...block,text:'이번에는 두 팀을 동시에 선보입니다.'}],closing:{...block,text:calls===1?'두 팀의 공개 일정':'두 팀이 함께 출발하는 방식입니다.'},hashtags:['#데뷔','#그룹','#뉴스']})}]}]};
 }};}
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'instagram-generator.js'),'utf8'),{module,__dirname:root,process,console,require:name=>name==='./ai-provider'?FakeAI:name==='dotenv'?{config(){}}:name.startsWith('./')?require(path.join(root,name)):require(name)});
 const draft=await module.exports.generateInstagram({article,selected_keywords:[],requirements:''});
 assert.equal(calls,2);assert.equal(draft.opening,'🎵 두 팀의 동시 데뷔');assert.match(draft.closing,/입니다\.$/);
});
