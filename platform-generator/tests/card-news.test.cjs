// 외부 AI·SNS 게시 없이 새 카드 구조, 저장 호환과 검수 입력을 검증합니다.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const Model=require('../lib/card-model'),Template=require('../lib/card-template');
const {getPlatformRules}=require('../platform-rules');
const root=path.resolve(__dirname,'..');
// Persistence tests explicitly opt into development storage; default 410 is tested separately.
process.env.PLATFORM_LOCAL_STORAGE='1';
const article={article_id:'card-test',title:'서울시 도서관 주말 운영 확대',content:'서울시는 다음 달부터 세 곳의 도서관 주말 운영 시간을 두 시간 늘릴 계획입니다. 대상은 중앙·동부·서부 도서관입니다. 평일 운영 시간은 유지합니다. 시는 인력 배치를 마친 뒤 시행일을 확정할 예정이라고 밝혔습니다.'};
function fixture(type='summary'){
 const evidence=[article.content];
 return {platform:'card_news',draft_version:2,card_news_options:{closing_type:type,service_message:type==='service'?'우리 편집실의 다음 카드도 확인해주세요.':''},recommended_card_count:3,card_count_reason:'계획·대상·현재 상태를 설명합니다.',core_text:{headline:article.title,summary:'주말 운영 확대는 인력 배치 후 시행일을 확정할 계획입니다.',source_evidence:evidence},cards:[
  {role:'cover',content_version:2,content:{keyword:'도서관',headline:'서울시 도서관\n주말 운영 확대 계획',body:'',answer:'',detail:'',show_keyword:false},source_evidence:evidence,design:{layout:'standard',highlights:[],compact:false}},
  {role:'body',content_version:2,content:{keyword:'운영 대상',headline:'어디에서 무엇이 바뀌나요?',body:'',answer:'세 곳의 도서관 주말 운영을 두 시간 늘릴 계획입니다.',detail:'대상은 중앙·동부·서부 도서관입니다.\n\n평일 운영은 유지하며, 인력 배치 후 시행일을 확정할 예정입니다.',show_keyword:true},source_evidence:evidence,design:{layout:'standard',highlights:['두 시간'],compact:false}},
  {role:'closing',closing_type:type,service_message:type==='service'?'우리 편집실의 다음 카드도 확인해주세요.':'',content_version:2,content:{keyword:type==='service'?'':'현재 상태',headline:type==='service'?'':'인력 배치 후 시행일 확정',body:'',answer:'',detail:type==='service'?'':'서울시는 인력 배치를 마친 뒤 시행일을 확정할 예정이라고 밝혔습니다.',show_keyword:type!=='service'},source_evidence:type==='service'?[]:evidence,design:{layout:'standard',highlights:[],compact:false}},
 ]};
}
function planFixture(){return {card_count:3,main_topic:article.title,points:[{id:'P1',summary:article.content,body_page:2,source_evidence:[article.content]}],closing_summary:'주말 확대 계획과 시행일 확정 조건'};}
function loadWithAI(file,FakeAI){const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{module:mod,__dirname:root,process,console,require:n=>n==='./ai-provider'?FakeAI:n==='dotenv'?{config(){}}:n.startsWith('./')?require(path.join(root,n)):require(n)});return mod.exports;}

test('AI가 고른 비교형의 항목 수만 맞지 않으면 설명형으로 전환하고 문안·근거·표지·마지막 장을 유지',async()=>{
 let drafts=0;const original=fixture();original.cards[1].design.layout='comparison';original.cards[1].content.detail=original.cards[1].content.detail.replace(/\n+/g,' ');
 class FakeAI{static apiKey='fixture';static model='fixture';responses={create:async request=>{
  let value;if(request.text.format.name.endsWith('_validation'))value={issues:[]};else if(request.text.format.name==='card_news_information_plan')value=planFixture();else{drafts++;value=JSON.parse(JSON.stringify(original));value.cards.forEach((card,i)=>{card.content.farewell='';card.covered_point_ids=i===1?['P1']:[];});}
  return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]};
 }};}
 const draft=await loadWithAI('card-news-generator.js',FakeAI).generateCardNews({article,selected_keywords:[],requirements:''});
 assert.equal(drafts,1);assert.equal(draft.cards[1].design.layout,'standard');assert.equal(draft.cards[1].content.detail,original.cards[1].content.detail);
 assert.equal(draft.cards[0].content.headline,original.cards[0].content.headline);assert.equal(draft.cards[2].content.detail,original.cards[2].content.detail);
 assert.deepEqual(Array.from(draft.cards[1].source_evidence),[article.content]);
 assert.match(Model.layoutError(original.cards[1]),/비교형/,'저장·사용자 배치는 기존 검사에서 계속 오류 안내');
});
test('카드뉴스 생성·검수 프롬프트는 한국어 문장 품질을 일관되게 확인',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 const requests=[];
 class FakeAI{static apiKey='fixture';static model='fixture';responses={create:async request=>{
  requests.push(request);let result;
  if(request.text.format.name.endsWith('_validation'))result={issues:[]};
  else if(request.text.format.name==='card_news_information_plan')result=planFixture();
  else{
   result=fixture();result.cards.forEach((card,index)=>{card.content.farewell='';card.covered_point_ids=index===1?['P1']:[];});
  }
  return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]};
 }};}
 const {generateCardNews}=loadWithAI('card-news-generator.js',FakeAI);
 await generateCardNews({article,selected_keywords:[],requirements:''});
 const prompts=Object.fromEntries(requests.map(request=>[request.text.format.name,request.instructions]));
 assert.match(prompts.card_news_information_plan,/모든 headline·answer·detail은 자연스러운 한국어/);
 assert.match(prompts.card_news_draft,/조사와 어미, 주어와 서술어의 호응을 확인/);
 assert.match(prompts.requirement_validation,/조사·어미 호응이 틀리거나/);
 assert.match(prompts.requirement_validation,/같은 원문 사실·조건을 유지하면서 자연스러운 한국어/);
 assert.match(prompts.card_news_draft,/headline이 질문이면 answer에서 직접 답하고/);
 assert.match(prompts.card_news_draft,/공통 \[문장\]의 완전한 문장 원칙보다 아래 \[본문\]/);
 assert.match(prompts.card_news_draft,/answer가 질문이면 같은 카드의 detail에서 답하세요/);
 assert.match(prompts.card_news_draft,/answer가 headline의 긴 재서술이나 카드 전체의 선행 요약이 되지 않게/);
 assert.match(prompts.requirement_validation,/질문형 answer는 원문에 분명한 답이 있을 때만 허용/);
 assert.match(prompts.requirement_validation,/detail이 answer의 주장을 다른 단어로 되풀이하고 필요한 새 설명을 거의 더하지 않으면/);
 assert.match(prompts.requirement_validation,/answer 자체의 확정·단정 표현을 detail이 뒤늦게 정정해도 통과시키지 않습니다/);
 assert.match(prompts.requirement_validation,/배정된 주요 정보의 답이나 필수 조건을 다음 카드·마지막 카드로 미루면/);
 assert.match(prompts.fact_validation,/질문의 사실적 전제가 원문에 있는지 검사/);
});

test('본문 표현별 모의 초안은 같은 필드·근거로 생성하고 불필요한 교정 호출 없이 검수',async()=>{
 const forms=[
  {name:'질문형 headline의 직접 답변',headline:'어디에서 무엇이 바뀌나요?',answer:'세 곳의 도서관 주말 운영을 두 시간 늘릴 계획입니다.',detail:'대상은 중앙·동부·서부 도서관입니다. 평일 운영은 유지하며 인력 배치 후 시행일을 확정할 예정입니다.',layout:'standard'},
  {name:'질문형 answer와 같은 카드의 답',headline:'주말 운영 확대 계획',answer:'언제 시행일이 정해지나요?',detail:'서울시는 인력 배치를 마친 뒤 시행일을 확정할 예정입니다. 세 곳의 도서관에서 주말 운영 시간을 두 시간 늘릴 계획이며 평일 운영은 유지합니다.',layout:'standard'},
  {name:'명사형 answer와 조건 연결',headline:'도서관 운영 변경',answer:'세 곳의 주말 운영 두 시간 확대 계획',detail:'서울시는 중앙·동부·서부 도서관의 주말 운영을 늘릴 계획입니다. 평일 운영은 유지하며 인력 배치를 마친 뒤 시행일을 확정할 예정입니다.',layout:'standard'},
  {name:'서술형 answer',headline:'도서관 운영 변경',answer:'서울시는 주말 운영을 늘릴 계획입니다.',detail:'중앙·동부·서부 도서관이 대상이며 운영 시간을 두 시간 늘릴 예정입니다. 평일 운영은 유지하고 인력 배치 뒤 시행일을 확정합니다.',layout:'standard'},
  {name:'비교형 첫 항목 연결',headline:'운영 시간의 변화',answer:'주말 운영 두 시간 확대 계획',detail:'주말: 세 곳의 도서관에서 두 시간 확대할 계획입니다.\n평일: 기존 운영 시간을 유지합니다. 인력 배치 뒤 시행일을 확정할 예정입니다.',layout:'comparison'},
  {name:'목록형 첫 항목 연결',headline:'운영 변경의 대상과 조건',answer:'도서관 세 곳의 주말 운영 확대 계획',detail:'대상: 중앙·동부·서부 도서관의 주말 시간을 두 시간 늘릴 계획입니다.\n시행: 평일 운영은 유지하고 인력 배치 뒤 시행일을 확정할 예정입니다.',layout:'list'},
 ];
 // 각 예시는 같은 합성 원문·배분표를 사용하고 응답 문안만 교체합니다.
 for(const form of forms){
  const requests=[];
  class FakeAI{static apiKey='fixture';static model='fixture';responses={create:async request=>{
   requests.push(request);
   const name=request.text.format.name;
   const value=name.endsWith('_validation')?{issues:[]}:name==='card_news_information_plan'?planFixture():(()=>{
    const copy=fixture();Object.assign(copy.cards[1].content,form);copy.cards[1].design.layout=form.layout;
    copy.cards.forEach((card,index)=>{card.content.farewell='';card.covered_point_ids=index===1?['P1']:[];});return copy;
   })();
   return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]};
  }};}
  const {generateCardNews}=loadWithAI('card-news-generator.js',FakeAI);
  const result=await generateCardNews({article,selected_keywords:[],requirements:''});
  assert.equal(result.generation_review.status,'passed',form.name);
  assert.equal(result.cards[1].content.answer,form.answer,form.name);
  assert.equal(result.cards[1].content.detail,form.detail,form.name);
  assert.deepEqual(Array.from(result.cards[1].source_evidence),[article.content],form.name);
  assert.deepEqual(requests.map(request=>request.text.format.name),['card_news_information_plan','card_news_draft','fact_validation','requirement_validation'],form.name);
 }
});

test('질문형 제목 뒤 미답변 질문은 코드 검수에서 차단하고 기존 초안은 유지',()=>{
 const {extractDraft,checkBasicRules,createQuoteChecker}=require('../draft-validator');
 const draft=fixture();draft.cards[1].content.answer='언제부터 바뀌나요?';
 const modern=checkBasicRules('card_news',extractDraft('card_news',draft),getPlatformRules('card_news'),createQuoteChecker(article));
 assert(modern.requirement.some(issue=>issue.location==='cards[1].content.answer'&&/질문을 연달아/.test(issue.reason)));
 const old=fixture();old.cards=old.cards.map(card=>({role:card.role,keyword:card.content.keyword,headline:card.content.headline,body:card.content.detail,source_evidence:card.source_evidence}));
 const legacy=checkBasicRules('card_news',extractDraft('card_news',old),getPlatformRules('card_news'),createQuoteChecker(article));
 assert(!legacy.requirement.some(issue=>/질문을 연달아/.test(issue.reason)));
});

test('모의 의미 검수는 답 없는 질문·확정 오인·조건 누락·마지막 카드 신규 정보를 전달',async()=>{
 const cases=[
  {name:'답 없는 질문',answer:'언제 시행일이 정해지나요?',detail:'주말 운영을 늘릴 계획입니다.',kind:'requirement',category:'structure_violation',location:'cards[1].content.detail',prompt:/같은 카드의 detail에서 직접 답해야/},
  {name:'미확인 상태를 단정한 명사형',answer:'주말 운영 두 시간 확대 확정',detail:'서울시는 인력 배치 뒤 시행일을 확정할 예정입니다.',kind:'fact',category:'meaning_distortion',location:'cards[1].content.answer',prompt:/명사형에서도 '확대 계획'/},
  {name:'필수 조건 누락',answer:'도서관 주말 운영 확대 계획',detail:'중앙·동부·서부 도서관의 주말 운영을 두 시간 늘릴 계획입니다.',kind:'requirement',category:'important_omission',location:'cards[1].content.detail',prompt:/point.summary의 핵심과 필수 조건/},
  {name:'마지막 카드로 신규 정보 연기',answer:'도서관 주말 운영 확대 계획',detail:'중앙·동부·서부 도서관의 주말 운영을 두 시간 늘릴 계획입니다.',closing:'평일 운영은 유지하고 인력 배치 뒤 시행일을 확정할 예정입니다.',kind:'requirement',category:'important_omission',location:'cards[1].content.detail',prompt:/다음 카드·마지막 카드로 미루면/},
 ];
 for(const scenario of cases){
  const draft=fixture();draft.cards[1].content.headline='도서관 운영 변경';draft.cards[1].content.answer=scenario.answer;draft.cards[1].content.detail=scenario.detail;
  if(scenario.closing)draft.cards[2].content.detail=scenario.closing;
  const requests=[];
  class FakeAI{static apiKey='fixture';static model='fixture';responses={create:async request=>{
   requests.push(request);
   const issues=request.text.format.name===`${scenario.kind}_validation`?[{location:scenario.location,category:scenario.category,problematic_text:scenario.location.includes('answer')?scenario.answer:scenario.detail,reason:scenario.name,source_evidence:[article.content],suggestion:'배정된 본문 카드에서 원문에 근거해 바로잡으세요.'}]:[];
   return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({issues})}]}]};
  }};}
  const {validateDraft}=loadWithAI('draft-validator.js',FakeAI);
  const result=await validateDraft({platform:'card_news',article,selected_keywords:[],draft});
  assert.equal(result.status,'needs_revision',scenario.name);
  assert(result[scenario.kind].issues.some(issue=>issue.category===scenario.category&&issue.location===scenario.location),scenario.name);
  assert.equal(requests.length,2,scenario.name);
  assert.match(requests.find(request=>request.text.format.name===`${scenario.kind}_validation`).instructions,scenario.prompt,scenario.name);
 }
});

test('답 없는 질문의 모의 검수 지적은 같은 카드 수정 요청과 재검수로 이어짐',async()=>{
 let draftCalls=0,requirementCalls=0,correction;
 class FakeAI{static apiKey='fixture';static model='fixture';responses={create:async request=>{
  const name=request.text.format.name;let value;
  if(name==='card_news_information_plan')value=planFixture();
  else if(name==='fact_validation')value={issues:[]};
  else if(name==='requirement_validation'){
   requirementCalls++;
   value={issues:requirementCalls===1?[{location:'cards[1].content.detail',category:'structure_violation',problematic_text:'주말 운영을 늘릴 계획입니다.',reason:'질문의 답인 시행일 확정 조건이 같은 카드에 없습니다.',source_evidence:[article.content],suggestion:'detail에 인력 배치 뒤 시행일을 확정할 예정이라는 답을 쓰세요.'}]:[]};
  }else{
   draftCalls++;if(draftCalls===2)correction=request;
   value=fixture();value.cards.forEach((card,index)=>{card.content.farewell='';card.covered_point_ids=index===1?['P1']:[];});
   value.cards[1].content.headline='도서관 운영 변경';value.cards[1].content.answer='언제 시행일이 정해지나요?';
   if(draftCalls===1)value.cards[1].content.detail='주말 운영을 늘릴 계획입니다.';
  }
  return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]};
 }};}
 const {generateCardNews}=loadWithAI('card-news-generator.js',FakeAI);
 const result=await generateCardNews({article,selected_keywords:[],requirements:''});
 assert.equal(draftCalls,2);assert.equal(requirementCalls,2);assert.equal(result.generation_review.status,'passed');
 assert.match(correction.instructions,/지적된 카드에서 질문의 답/);
 assert.match(JSON.parse(correction.input).review.requirement.issues[0].reason,/같은 카드/);
 assert.match(result.cards[1].content.detail,/인력 배치 후 시행일을 확정/);
});
test('긴 핵심 문구와 의미 반복을 지적한 모의 검수는 본문 카드만 다시 배분해 교정',async()=>{
 let draftCalls=0,requirementCalls=0,correction;
 class FakeAI{static apiKey='fixture';static model='fixture';responses={create:async request=>{
  const name=request.text.format.name;let value;
  if(name==='card_news_information_plan')value=planFixture();
  else if(name==='fact_validation')value={issues:[]};
  else if(name==='requirement_validation'){
   requirementCalls++;
   value={issues:requirementCalls===1?[{location:'cards[1].content.answer',category:'structure_violation',problematic_text:'서울시는 세 곳의 도서관 주말 운영 시간을 두 시간 늘릴 계획이며 평일은 유지하고 인력 배치 후 시행일을 정할 예정입니다.',reason:'제목의 내용을 길게 되풀이하고 상세 설명도 같은 계획을 다시 말합니다.',source_evidence:[],suggestion:'핵심 문구에는 계획의 중심만 남기고 상세 설명에 대상·기존 운영·시행 조건을 설명하세요.'}]:[]};
  }else{
   draftCalls++;if(draftCalls===2)correction=request;
   value=fixture();value.cards.forEach((card,index)=>{card.content.farewell='';card.covered_point_ids=index===1?['P1']:[];});
   value.cards[1].content.headline='도서관 주말 운영 확대 계획';
   value.cards[1].content.answer=draftCalls===1?'서울시는 세 곳의 도서관 주말 운영 시간을 두 시간 늘릴 계획이며 평일은 유지하고 인력 배치 후 시행일을 정할 예정입니다.':'주말 운영 두 시간 확대 계획';
   value.cards[1].content.detail=draftCalls===1?'서울시는 주말 운영을 두 시간 늘릴 계획입니다. 평일은 유지하며 인력 배치 후 시행일을 정할 예정입니다.':'대상은 중앙·동부·서부 도서관입니다. 평일 운영은 유지하며 인력 배치 후 시행일을 확정할 예정입니다.';
  }
  return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]};
 }};}
 const {generateCardNews}=loadWithAI('card-news-generator.js',FakeAI);
 const result=await generateCardNews({article,selected_keywords:[],requirements:''});
 assert.equal(draftCalls,2);assert.equal(requirementCalls,2);assert.equal(result.generation_review.status,'passed');
 assert.match(correction.instructions,/핵심 문구와 새 설명으로 역할을 나누세요/);
 assert.match(JSON.parse(correction.input).review.requirement.issues[0].reason,/길게 되풀이/);
 assert.equal(result.cards[1].content.answer,'주말 운영 두 시간 확대 계획');
 assert.match(result.cards[1].content.detail,/인력 배치 후 시행일을 확정/);
});
test('배분표의 인용 근거가 본문과 불일치하면 한 번 다시 생성해 계속 진행',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 let planCalls=0,retryRequest;
 class FakeAI{static apiKey='fixture';static model='fixture';responses={create:async request=>{
  let result;
  if(request.text.format.name.endsWith('_validation'))result={issues:[]};
  else if(request.text.format.name==='card_news_information_plan'){
   planCalls++;
   if(planCalls===1){
    result=planFixture();
    result.points[0].source_evidence=['서울시 도서관 주말 운영 확대'];
   }else{
    retryRequest=JSON.parse(request.input);
    result=planFixture();
    result.points[0].source_evidence=[0];
   }
  }else{
   result=fixture();
   result.cards.forEach((card,index)=>{card.content.farewell='';card.covered_point_ids=index===1?['P1']:[];});
  }
  return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]};
 }};}
 const {generateCardNews}=loadWithAI('card-news-generator.js',FakeAI);
 const draft=await generateCardNews({article,selected_keywords:[],requirements:''});
 assert.equal(planCalls,2);
 assert.match(retryRequest.validation_error,/근거가 기사 본문과 일치하지 않습니다/);
 assert.equal(Object.hasOwn(retryRequest.previous_information_plan.points[0],'source_evidence'),false);
 assert(Array.isArray(retryRequest.source_excerpt_catalog));
 assert.equal(draft.generation_review.status,'passed');
});
test('카드 초안의 가짜 인용은 검증된 배분표 근거로 연결하고 추가 생성 호출을 하지 않음',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 let drafts=0;
 class FakeAI{static apiKey='fixture';static model='fixture';responses={create:async request=>{
  let result;
  if(request.text.format.name.endsWith('_validation'))result={issues:[]};
  else if(request.text.format.name==='card_news_information_plan')result=planFixture();
  else{
   drafts++;
   result=fixture();
   result.cards.forEach((card,index)=>{
    card.content.farewell='';
    card.covered_point_ids=index===1?['P1']:[];
   });
   if(drafts===1)result.cards[1].source_evidence=['본문에 없는 근거 문장입니다.'];
   result.core_text.source_evidence=['본문에 없는 근거 문장입니다.'];
  }
  return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]};
 }};}
 const {generateCardNews}=loadWithAI('card-news-generator.js',FakeAI);
 const draft=await generateCardNews({article,selected_keywords:[],requirements:''});
 assert.equal(drafts,1);
 assert.deepEqual(Array.from(draft.core_text.source_evidence),[article.content]);
 assert.deepEqual(Array.from(draft.cards[1].source_evidence),[article.content]);
 assert.equal(draft.generation_review.status,'passed');
});
test('고정 카드 생성은 객체 순서와 무관하게 배분표의 번호·역할·ID를 보존',()=>{
 const {createPlannedDraftSchema,readPlannedDraft,checkInformationCoverage}=require('../card-news-generator');
 const plan=planFixture(),source=fixture(),schema=createPlannedDraftSchema(plan);
 assert.deepEqual(schema.properties.cards.required,['page_1','page_2','page_3']);
 assert.deepEqual(schema.properties.cards.properties.page_2.properties.role.enum,['body']);
 assert(!Object.hasOwn(schema.properties.cards.properties.page_2.properties,'covered_point_ids'));
 assert(!Object.hasOwn(schema.properties.cards.properties.page_2.properties,'source_evidence'));
 assert(!Object.hasOwn(schema.properties.core_text.properties,'source_evidence'));
 const pages={};for(const index of [2,0,1])pages[`page_${index+1}`]=source.cards[index];
 const generated=readPlannedDraft({...source,cards:pages},plan);
 assert.deepEqual(generated.cards.map(card=>card.role),['cover','body','closing']);
 assert.deepEqual(generated.cards.map(card=>card.covered_point_ids),[[],['P1'],[]]);
 assert.doesNotThrow(()=>checkInformationCoverage(plan,generated));
 assert.throws(()=>readPlannedDraft({...source,cards:{page_1:source.cards[0]}},plan),/2번째/);
});
test('본문 배분 오류는 실패한 정보 ID와 예정·실제 카드 번호를 교정 입력에 제공',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 let drafts=0,correction;
 class FakeAI{static apiKey='fixture';static model='fixture';responses={create:async request=>{
  let result;
  if(request.text.format.name.endsWith('_validation'))result={issues:[]};
  else if(request.text.format.name==='card_news_information_plan')result=planFixture();
  else{
   drafts++;if(drafts===2)correction=JSON.parse(request.input);
   result=fixture();result.cards.forEach(card=>{card.content.farewell='';card.covered_point_ids=[];});
   if(drafts>1)result.cards[1].covered_point_ids=['P1'];
  }
  return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]};
 }};}
 const {generateCardNews}=loadWithAI('card-news-generator.js',FakeAI);
 const draft=await generateCardNews({article,selected_keywords:[],requirements:''});
 assert.equal(drafts,2);assert.match(correction.review.requirement.issues[0].reason,/P1는 2번째/);
 assert.match(correction.review.requirement.issues[0].reason,/현재 본문 배정: 없음/);
 assert.equal(correction.card_assignments[1].required_points[0].id,'P1');
 assert.equal(draft.generation_review.status,'passed');
});
test('서버가 정보 ID를 연결해도 실제 문장 누락은 의미 검수와 교정을 거침',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 let drafts=0,requirements=0,correction,reviewInput;
 class FakeAI{static apiKey='fixture';static model='fixture';responses={create:async request=>{
  let result;
  if(request.text.format.name==='requirement_validation'){
   requirements++;reviewInput=JSON.parse(request.input);
   result={issues:requirements===1?[{location:'cards[1].content.detail',category:'structure_violation',problematic_text:'',reason:'P1의 평일 운영 유지와 시행일 확정 조건이 2번째 본문에 누락되었습니다.',source_evidence:[article.content],suggestion:'배분표의 P1을 원문 안에서 본문에 완결해주세요.'}]:[]};
  }else if(request.text.format.name==='fact_validation')result={issues:[]};
  else if(request.text.format.name==='card_news_information_plan')result=planFixture();
  else{
   drafts++;if(drafts===2)correction=JSON.parse(request.input);
   result=fixture();result.cards.forEach(card=>card.content.farewell='');
   if(drafts===1)result.cards[1].content.detail='대상은 중앙·동부·서부 도서관입니다.';
   result.cards=Object.fromEntries(result.cards.map((card,index)=>{const {covered_point_ids,...fields}=card;return [`page_${index+1}`,fields];}));
  }
  return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]};
 }};}
 const {generateCardNews}=loadWithAI('card-news-generator.js',FakeAI);
 const draft=await generateCardNews({article,selected_keywords:[],requirements:''});
 assert.equal(drafts,2);assert.equal(requirements,2);
 assert.equal(reviewInput.draft.cards[1].covered_point_ids[0],'P1');
 assert.match(correction.review.requirement.issues[0].reason,/누락/);
 assert.match(draft.cards[1].content.detail,/평일 운영은 유지/);
 assert.equal(draft.generation_review.status,'passed');
});
test('목록형 상세 설명 오류는 교정 요청 후 재검사하고 반환',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 let drafts=0,correction;
 class FakeAI{static apiKey='fixture';static model='fixture';responses={create:async r=>{
  let result;
  if(r.text.format.name.endsWith('_validation'))result={issues:[]};
  else if(r.text.format.name==='card_news_information_plan')result=planFixture();
  else{
   drafts++;if(drafts===2)correction=r;
   result=fixture();result.cards.forEach((card,i)=>{card.covered_point_ids=i?['P1']:[];card.content.farewell='';});
   result.cards[1].design.layout='list';
   result.cards[1].content.detail=drafts===1?'대상은 중앙·동부·서부 도서관입니다.':
    '대상은 중앙·동부·서부 도서관입니다.\n평일 운영은 유지하며, 인력 배치 후 시행일을 확정할 예정입니다.';
  }
  return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]};
 }};}
 const {generateCardNews}=loadWithAI('card-news-generator.js',FakeAI);
 const draft=await generateCardNews({article,selected_keywords:['도서관'],requirements:''});
 assert.equal(drafts,2);assert.match(correction.input,/2~4개 항목/);
 assert.equal(draft.cards[1].content.detail.split('\n').length,2);
 assert.equal(draft.generation_review.status,'passed');
});
test('이전 본문을 재작성하지 않고 새 필드·역할·숨긴 키워드를 보존',()=>{
 const old={keyword:'원래 키워드',headline:'원래 제목',body:'원래 본문\n줄바꿈'};
 const restored=Model.normalize(old);assert.equal(restored.content_version,1);assert.equal(restored.body,old.body);assert.equal(restored.answer,'');assert.equal(Model.details(restored),old.body);
 assert.equal(Model.normalize(restored).content_version,1);
 const fresh=Model.normalize(fixture().cards[1]);assert.equal(fresh.content_version,2);assert.equal(fresh.answer,fixture().cards[1].content.answer);
 const cover=Model.normalize(fixture().cards[0]);assert.equal(cover.keyword,'도서관');assert(!Template.markup(cover).includes('data-field="keyword"'));assert(!Template.markup(cover).includes('data-field="detail"'));
 assert(Template.markup(fresh).includes('data-field="answer"'));assert(Template.markup(fresh).includes('data-field="detail"'));
 assert(Template.markup(fresh,true).includes('aria-label="핵심 문구"'));
 assert.equal(Template.markup(JSON.parse(JSON.stringify(fresh))),Template.markup(fresh));
});
test('마지막 카드 설정 없이 생성하고 선택 끝인사는 기사 근거와 분리',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 for(const farewell of ['', '읽어주셔서 감사합니다.']){
  let request;
  class FakeAI{static apiKey='fixture';static model='fixture';responses={create:async r=>{request=r;const d=r.text.format.name.endsWith('_validation')?{issues:[]}:r.text.format.name==='card_news_information_plan'?planFixture():fixture();if(d.cards){d.cards.forEach((c,i)=>{c.content.farewell='';c.covered_point_ids=i===0?[]:['P1'];});d.cards.at(-1).content.farewell=farewell;}return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(d)}]}]};}};}
  const {generateCardNews,cardNewsSchema}=loadWithAI('card-news-generator.js',FakeAI);
  const d=await generateCardNews({article,selected_keywords:['도서관'],requirements:'조건 설명',card_news_options:{closing_type:'service',service_message:''}});
  assert.equal(d.cards.at(-1).content.farewell,farewell);assert.equal(d.cards.at(-1).evidence_valid,true);
  assert(!Object.hasOwn(JSON.parse(request.input),'card_news_options'));assert(!Object.hasOwn(d,'card_news_options'));
  assert(cardNewsSchema.properties.cards.items.properties.content.required.includes('farewell'));
  assert.match(request.instructions,/예정되지 않은 후속/);assert.equal(d.cards[0].content.detail,'');
 }
});
test('서비스 근거만 제외하고 다른 카드 누락·구버전·표지 선택 설명을 검사',()=>{
 const {extractDraft,checkBasicRules,createQuoteChecker}=require('../draft-validator');
 const d=extractDraft('card_news',fixture('service'));
 const check=()=>checkBasicRules('card_news',d,getPlatformRules('card_news'),createQuoteChecker(article));
 assert.equal(check().fact.length,0);assert.equal(check().requirement.length,0);
 d.cards[1].source_evidence=[];assert.equal(check().fact.length,1);assert.match(check().fact[0].location,/cards\[1\]/);
 d.cards[2].service_message='';assert(check().requirement.some(i=>i.location.endsWith('service_message')));
 const old=fixture();old.cards=old.cards.map((c,i)=>({role:c.role,keyword:'키워드',headline:'제목',body:i===0?'':'기존 본문',source_evidence:[article.content]}));
 assert.equal(checkBasicRules('card_news',extractDraft('card_news',old),getPlatformRules('card_news'),createQuoteChecker(article)).requirement.length,0);
});
test('AI 의미 검수 입력에서는 사용자 안내를 제외하고 기사 카드 위치를 유지',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 const requests=[];
 class FakeAI{static apiKey='fixture';static model='fixture';responses={create:async r=>{requests.push(r);return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"issues":[]}'}]}]};}};}
 const {validateDraft}=loadWithAI('draft-validator.js',FakeAI);
 const result=await validateDraft({platform:'card_news',article,selected_keywords:[],draft:fixture('service')});
 assert.equal(result.status,'passed');const fact=JSON.parse(requests[0].input),requirements=JSON.parse(requests[1].input);
 assert.equal(fact.draft.cards[2].excluded_from_article_fact_check,true);assert(!requests[0].input.includes('우리 편집실의 다음'));
 assert.equal(fact.draft.cards[1].content.answer,fixture().cards[1].content.answer);assert.equal(requirements.draft.cards[2].service_message,fixture('service').card_news_options.service_message);
});
class LocalScripts extends ResourceLoader{fetch(url){const p=new URL(url).pathname.slice(1);const file=fs.existsSync(path.join(root,'lib',p))?path.join(root,'lib',p):path.join(root,'public',p);return fs.existsSync(file)&&fs.statSync(file).isFile()?Promise.resolve(fs.readFileSync(file)):null;}}
test('실제 화면: 새 구조 저장·불러오기·순서 변경·기존 초안과 안내 편집',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(path.join(root,'public/index.html'),'utf8'),{url:'http://localhost:3001',runScripts:'dangerously',resources:new LocalScripts(),pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.structuredClone=structuredClone;w.ResizeObserver=class{observe(){}};w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=()=>{};}});
 try{
  const w=dom.window;await new Promise(r=>w.addEventListener('load',r,{once:true}));
  const draft=fixture('service');w.CardEditor.applyCardNewsDraft(draft,w.CardEditor.getRevision(),{article,selected_keywords:[]});
  w.TextEditor.showPlatform('card_news');
  assert.equal(w.document.getElementById('card-closing-type'),null);assert.equal(w.document.getElementById('card-service-message'),null);assert.equal(w.eval('state.cards.at(-1).service_message'),draft.cards.at(-1).service_message);
  const oldLast=w.eval('state.cards.at(-1).card_id');w.document.getElementById('add').click();assert.equal(w.eval('state.cards.at(-1).card_id'),oldLast);assert.equal(w.eval('current().role'),'body');
  w.document.getElementById('up').click();assert.equal(w.eval('current().role'),'body');assert.equal(w.eval('state.cards.at(-1).closing_type'),'service');
  const answer=w.document.querySelector('#canvas [data-field=answer]');answer.textContent='직접 수정한 핵심 답변';answer.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.eval('current().answer'),answer.textContent);
  const detail=w.document.querySelector('#canvas [data-field=detail]');detail.textContent='별도로 수정한 상세 설명';detail.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.eval('current().answer'),answer.textContent);
  let saved;w.NewsApi.saveLocalDraft=async d=>{saved=d;return {success:true,file_path:'fixture'}};await w.document.getElementById('save').onclick();
  assert.equal(saved.cards.at(-1).service_message,draft.cards.at(-1).service_message);
  const editedId=w.eval('current().card_id'),editedDetail=detail.textContent;w.CardEditor.loadDraft(JSON.parse(JSON.stringify(saved)));assert.equal(w.eval(`state.cards.find(c=>c.card_id==='${editedId}').detail`),editedDetail);
  w.eval('active=state.cards.findIndex(c=>c.card_id==='+JSON.stringify(editedId)+');draw();');w.document.getElementById('delete').click();assert.equal(w.eval('state.cards.length'),3);assert.equal(w.eval('state.cards.at(-1).card_id'),oldLast);assert.equal(w.eval('state.cards.at(-1).closing_type'),'service');
  w.CardEditor.loadDraft({cards:[{keyword:'이전',headline:'예전 제목',body:'기존 본문 그대로'}]});assert.equal(w.eval('current().body'),'기존 본문 그대로');assert.equal(w.eval('current().content_version'),1);assert.equal(w.eval('current().closing_type'),'summary');
  w.CardEditor.applyCardNewsDraft(fixture(),w.CardEditor.getRevision(),{article,selected_keywords:[]});assert.equal(w.document.getElementById('card-show-keyword'),null);assert.equal(w.document.getElementById('card-answer'),null);assert.equal(w.eval('current().keyword'),'도서관');
  let reviews=0;w.NewsApi.validateDraft=async()=>{reviews++;return {validation:{platform:'card_news',status:'passed',issue_count:0,fact:{issue_count:0,issues:[]},requirement:{issue_count:0,issues:[]}}};};
  await w.CardValidation.ensureForExport();await w.CardValidation.ensureForExport();assert.equal(reviews,1);
  w.eval('current().headline+=" 수정";dirty();');await w.CardValidation.ensureForExport();assert.equal(reviews,2);
  w.eval('current().headline+=" 수정";dirty();');w.NewsApi.validateDraft=async()=>({validation:{platform:'card_news',status:'needs_revision',issue_count:1,fact:{issue_count:1,issues:[]},requirement:{issue_count:0,issues:[]}}});
  await assert.rejects(w.CardValidation.ensureForExport(),/수정할 문제/);
  assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});
test('로컬 저장 API는 새 답변·설명·안내·사진 데이터를 그대로 왕복',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 const {createApp}=require('../server');const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'newsroom-card-contract-'));
 const server=createApp({storageOptions:{rootDir:dir}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const draft=fixture('service');draft.cards[1].text_positions={headline:{x:25,y:70}};draft.cards[1].image={url:'data:image/jpeg;base64,YQ==',presentation:{zoom:1.4,x:30,y:40,strength:70,direction:'bottom'}};
  const saved=await(await fetch(base+'/api/local/drafts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft})})).json();assert(saved.success);
  const loaded=await(await fetch(base+'/api/local/drafts/'+saved.id)).json();assert.deepEqual(loaded.draft,draft);

 }finally{await new Promise(r=>server.close(r));await fsp.rm(dir,{recursive:true,force:true});}
});

test('끝인사는 사실 검수에서 제외하고 마지막 정리의 근거는 계속 검사',async()=>{
 process.env.PLATFORM_LOCAL_STORAGE="1";
 const requests=[];class FakeAI{static apiKey='fixture';static model='fixture';responses={create:async r=>{requests.push(r);return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"issues":[]}'}]}]};}};}
 const d=fixture();d.cards.at(-1).content.farewell='함께 읽어주셔서 감사합니다.';
 const {validateDraft,extractDraft,checkBasicRules,createQuoteChecker}=loadWithAI('draft-validator.js',FakeAI);
 await validateDraft({platform:'card_news',article,selected_keywords:[],draft:d});
 assert(!requests[0].input.includes('함께 읽어'));assert(requests[1].input.includes('함께 읽어'));
 d.cards.at(-1).source_evidence=[];assert.equal(checkBasicRules('card_news',extractDraft('card_news',d),getPlatformRules('card_news'),createQuoteChecker(article)).fact.length,1);
});

// 배분표의 존재 확인과 실제 문장에 대한 의미 검수는 별개입니다.
test('주요 정보 배분은 본문에서 완결하고 누락·중복·마지막 신규 id를 거부',()=>{
 const {checkInformationPlan,checkInformationCoverage}=require('../card-news-generator');
 const plan=planFixture(),draft=fixture();draft.cards.forEach((c,i)=>c.covered_point_ids=i?['P1']:[]);
 assert.doesNotThrow(()=>checkInformationPlan(plan,article));assert.doesNotThrow(()=>checkInformationCoverage(plan,draft));
 plan.points[0].body_page=3;assert.throws(()=>checkInformationPlan(plan,article),/본문/);plan.points[0].body_page=2;
 draft.cards[1].covered_point_ids=[];assert.throws(()=>checkInformationCoverage(plan,draft),/누락/);
 draft.cards[1].covered_point_ids=['P1'];draft.cards[2].covered_point_ids=['new'];assert.throws(()=>checkInformationCoverage(plan,draft),/신규/);
 const rules=getPlatformRules('card_news').writing_rules;assert.match(rules,/간결하게 재언급/);assert.match(rules,/마지막 문단만/);
});
test('제목에만 있는 직접 인용은 본문 발언 근거 확인에서 거부',()=>{
 const {extractDraft,checkBasicRules,createQuoteChecker}=require('../draft-validator');
 const a={title:'시 관계자 “주말 운영을 두 시간 늘리겠습니다”',content:'시는 도서관 운영 확대 계획을 검토합니다.'},d=fixture();
 d.core_text.source_evidence=[a.content];d.cards.forEach(c=>c.source_evidence=[a.content]);d.cards[1].content.answer='“주말 운영을 두 시간 늘리겠습니다”';
 const check=()=>checkBasicRules('card_news',extractDraft('card_news',d),getPlatformRules('card_news'),createQuoteChecker(a));
 assert(check().fact.some(i=>i.category==='quote_mismatch'));
 a.content+=' 시 관계자는 “주말 운영을 두 시간 늘리겠습니다”라고 말했습니다.';assert(!check().fact.some(i=>i.category==='quote_mismatch'));
});
