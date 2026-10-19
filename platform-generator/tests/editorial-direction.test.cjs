const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const direction=require('../lib/editorial-direction');
const {checkWriting}=require('../instagram-writing-contract');
const Tone=require('../lib/threads-tone');
const root=path.resolve(__dirname,'..');
const article={article_id:'editorial-fixture',title:'지원 확대 계획',content:'시는 청년 지원을 확대할 계획이라고 밝혔다. 신청 대상은 소득 기준을 충족하는 청년이며 중복 수혜자는 제외된다.'};
const tags=['#청년','#지원','#계획'];
const result=value=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
function generator(file,answer){
 class AI{static apiKey='fixture';static model='fixture';responses={create:answer};}
 const mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{module:mod,__dirname:root,process:{env:{PLATFORM_AI_BRIDGE:'core'}},console,require:name=>name==='./ai-provider'?AI:name.startsWith('./')?require(path.join(root,name)):require(name)});
 return mod.exports;
}
test('입력 없음·강조점만 지정하면 플랫폼별 기본 문체를 유지',()=>{
 for(const request of ['', '신청 자격과 제외 대상을 먼저 설명해 주세요.']){
  assert.deepEqual(direction.resolve('instagram',request).styles,{opening:'noun',body:'formal',closing:'formal'});
  assert.deepEqual(direction.resolve('threads',request).styles,{opening:'noun',body:'casual',closing:'casual'});
 }
});
test('플랫폼·부분별 지시, 공통 지시와 부정을 구분',()=>{
 const request='인스타그램 본문은 명사체로, 마무리는 습니다체로. 쓰래드는 해요체로 작성';
 assert.deepEqual(direction.resolve('instagram',request).styles,{opening:'noun',body:'noun',closing:'formal'});
 assert.deepEqual(direction.resolve('threads',request).styles,{opening:'polite',body:'polite',closing:'polite'});
 assert.deepEqual(direction.resolve('instagram','인스타그램 본문은 명사체로 마무리는 습니다체로').styles,{opening:'noun',body:'noun',closing:'formal'});
 assert.equal(direction.resolve('threads','인스타그램 생성시 명사체로 생성').styles.body,'casual');
 assert.equal(direction.resolve('instagram','쓰레드는 명사체로').styles.closing,'formal');
 for(const platform of ['instagram','threads']){
  assert.equal(direction.resolve(platform,'두 플랫폼 모두 해요체로').styles.body,'polite');
  assert.equal(direction.resolve(platform,'Instagram과 Threads 모두 명사체로').styles.body,'noun');
  assert.equal(direction.resolve(platform,'명사체 말고 습니다체로').styles.body,'formal');
  assert.equal(direction.resolve(platform,'반말 금지').styles.body,'formal');
 }
 assert.equal(direction.resolve('threads','기사체 금지, 반말로 작성').styles.body,'casual');
});
test('명사체 요청은 기본 어미 검사에서 차단하지 않고 타 플랫폼 요청은 예외를 만들지 않음',()=>{
 const draft={emoji:'📰',opening:{text:'청년 지원 확대 계획'},paragraphs:[{text:'소득 기준 충족 청년 대상'}],closing:{text:'중복 수혜자는 제외 대상'}};
 assert(checkWriting(draft,'').some(issue=>issue.includes('closing')));
 assert.deepEqual(checkWriting(draft,'인스타그램 생성시 명사체로 생성'),[]);
 assert(checkWriting(draft,'Threads는 명사체로').some(issue=>issue.includes('closing')));
 assert.deepEqual(Tone.issues(['소득 기준 충족 청년 대상'],'Threads는 명사체로'),[]);
 assert.equal(Tone.issues(['지원한다.'],'Instagram은 한다체로').length,1);
});
test('실제 Instagram 생성 경로가 명사체 마무리를 추가 교정 없이 반환',async()=>{
 const requests=[],block=text=>({text,source_evidence:[article.content]});
 const raw='인스타그램 생성시 명사체로 생성, Threads는 해요체로';
 const draft=await generator('instagram-generator.js',async request=>{requests.push(request);return result({emoji:'📰',opening:block('청년 지원 확대 계획'),paragraphs:[block('소득 기준 충족 청년 대상, 중복 수혜자는 제외')],closing:block('청년 지원 확대 계획과 중복 수혜 제외 조건'),hashtags:tags});}).generateInstagram({article,selected_keywords:[],requirements:raw});
 assert.equal(requests.length,1);assert.match(draft.closing,/제외 조건$/);
 assert.match(requests[0].instructions,/마무리\(있는 경우\): 명사체/);
 assert.doesNotMatch(JSON.parse(requests[0].input).requirements,/Threads/);
 assert.equal(draft.requirements,raw);assert.equal(draft.evidence_valid,true);
});
test('실제 Threads 생성 경로가 사용자 명사체를 반말로 자동 교정하지 않음',async()=>{
 const requests=[];
 const draft=await generator('text-generator.js',async request=>{requests.push(request);return result({presentation:{mode:'use',emoji:'📰',reason:'뉴스'},title:'청년 지원 확대 계획',title_source_evidence:[article.content],summary_blocks:[{text:'소득 기준 충족 청년 대상, 중복 수혜자는 제외',source_evidence:[article.content]}],hashtags:tags});}).generateTextPlatform('threads',{article,selected_keywords:[],requirements:'Threads는 명사체로'});
 assert.equal(requests.length,1);assert.match(draft.paragraphs[0],/제외$/);
 assert.match(requests[0].instructions,/본문: 명사체/);
});
test('기존 원고의 코드·AI 검수가 동일한 플랫폼별 문체를 적용하고 사실 검수 유지',async()=>{
 const {validateDraft}=require('../draft-validator');
 const requests=[],evidence=[article.content];
 const draft={opening:'📰 청년 지원 확대 계획',paragraphs:['소득 기준 충족 청년 대상, 중복 수혜자는 제외'],closing:'청년 지원 확대 계획과 중복 수혜 제외 조건',hashtags:tags,block_evidence:{opening:evidence,paragraphs:[evidence],closing:evidence}};
 const review=await validateDraft({platform:'instagram',article,draft,selected_keywords:[],requirements:'Instagram은 명사체로, Threads는 해요체로'}, {apiKey:'fixture',client:{responses:{create:async request=>{requests.push(request);return result({issues:[]});}}}});
 assert.equal(review.status,'passed');assert.equal(requests.length,2,'사실·요구사항 검수 모두 유지');
 for(const request of requests){
  assert.match(request.instructions,/마무리\(있는 경우\): 명사체/);
  assert.doesNotMatch(request.instructions,/- 마무리는 명사구가 아닌 완전한 문장으로/);
  const payload=JSON.parse(request.input);assert.equal(payload.article.content,article.content);
  assert.doesNotMatch(payload.requirements,/Threads/);
 }
});
test('브라우저에서도 같은 공유 기준으로 Threads 말투를 판정',()=>{
 const context=vm.createContext({});
 for(const file of ['lib/editorial-direction.js','lib/threads-tone.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 assert.equal(vm.runInContext("ThreadsTone.issues(['지원한다.'],'인스타그램은 명사체로').length",context),1);
 assert.equal(vm.runInContext("ThreadsTone.issues(['지원한다.'],'Threads는 명사체로').length",context),0);
});
