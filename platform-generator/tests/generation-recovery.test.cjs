// 생성 오류 회귀: 실제 기사/키/DB/SNS 없이 AI 대역과 실제 Node Core 어댑터를 사용한다.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const root=path.resolve(__dirname,'..');
const article={article_id:'generation-fixture',title:'도서관 주말 운영 계획',
  content:'도서관의 주말 운영 시간을 늘릴 계획입니다.\n인력 배치를 마친 뒤 시행일을 확정합니다.'};
const response=value=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
function load(file,answer){
  class FakeAI {static apiKey='fixture';static model='fixture';responses={create:answer};}
  const mod={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{module:mod,__dirname:root,
    process:{env:{PLATFORM_AI_BRIDGE:'core'}},console,
    require:name=>name==='./ai-provider'?FakeAI:name.startsWith('./')?require(path.join(root,name)):require(name)});
  return mod.exports;
}
function threads(presentation={mode:'use',emoji:'📰',reason:'일반 뉴스 안내'}){
  return {presentation,title:article.title,title_source_evidence:[article.content],
    summary_blocks:[{text:article.content,source_evidence:[article.content]}],hashtags:['#도서관','#운영','#뉴스']};
}
function plan(evidence=[article.content]){
  return {card_count:3,main_topic:article.title,closing_summary:'주말 운영 확대와 시행 조건',
    points:[{id:'p2',summary:article.content,body_page:2,source_evidence:evidence}]};
}
function cards(){
  const content=(keyword,headline,answer,detail,show_keyword)=>({keyword,headline,body:'',answer,detail,farewell:'',show_keyword});
  return {recommended_card_count:3,card_count_reason:'주제와 주요 내용, 시행 조건을 설명합니다.',
    core_text:{headline:article.title,summary:article.content,source_evidence:[article.content]},
    cards:[
      {role:'cover',content:content('도서관',article.title,'','',false),covered_point_ids:[]},
      {role:'body',content:content('운영 계획','무엇이 달라지나요?','도서관의 주말 운영 시간을 늘릴 계획입니다.','인력 배치를 마친 뒤 시행일을 확정합니다.',true),covered_point_ids:['p2']},
      {role:'closing',content:content('시행 조건','인력 배치 후 시행일 확정','','인력 배치를 마친 뒤 시행일을 확정합니다.',true),covered_point_ids:[]},
    ].map(card=>({...card,source_evidence:[article.content],design:{layout:'standard',highlights:[],compact:false}}))};
}

test('Threads use+빈 이모지는 표시만 한 번 보완하고 원고·근거·조건을 보존',async()=>{
  const requests=[],original=threads({mode:'use',emoji:'',reason:'뉴스'});
  const generator=load('text-generator.js',async request=>{
    requests.push(request);
    if(requests.length===1){
      const variants=request.text.format.schema.properties.presentation.anyOf;
      assert.equal(variants.length,2);
      assert(!variants[0].properties.emoji.enum.includes(''));
      assert.deepEqual(Array.from(variants[1].properties.emoji.enum),['']);
      return response(original);
    }
    assert.equal(request.text.format.name,'threads_presentation');
    assert.equal(JSON.parse(request.input).requirements,'이모지를 사용하지 마세요');
    return response({presentation:{mode:'omit',emoji:'',reason:'사용자 이모지 금지 요청'}});
  });
  const result=await generator.generateTextPlatform('threads',{article,selected_keywords:[],requirements:'이모지를 사용하지 마세요'});
  assert.equal(requests.length,2);assert.equal(result.opening,original.title);
  assert.deepEqual(Array.from(result.paragraphs),original.summary_blocks.map(block=>block.text));
  assert.deepEqual(Array.from(result.source_evidence),[article.content]);assert.equal(result.evidence_valid,true);
  assert.equal(result.emoji_status,'omit');assert.equal(result.article_id,article.article_id);
});

test('Threads variation selector·표시 공백은 같은 이모지로 정규화하고 재호출하지 않음',async()=>{
  let calls=0;
  const generator=load('text-generator.js',async()=>{calls++;return response(threads({mode:'use ',emoji:' 📰\uFE0F ',reason:' 뉴스 '}));});
  const result=await generator.generateTextPlatform('threads',{article,selected_keywords:[]});
  assert.equal(calls,1);assert.equal(result.opening,'📰 '+article.title);assert.equal(result.emoji_reason,'뉴스');
});

test('Threads 표시 보완도 잘못되면 실패하며 반복 호출·잘못된 성공을 만들지 않음',async()=>{
  let calls=0;
  const generator=load('text-generator.js',async()=>{calls++;return response(calls===1?threads({mode:'use',emoji:'',reason:'뉴스'}):{presentation:{mode:'omit',emoji:'📰',reason:'생략'}});});
  await assert.rejects(generator.generateTextPlatform('threads',{article,selected_keywords:[]}),/이모지 선택/);
  assert.equal(calls,2);
});

test('Threads 본문/태그 오류와 AI 거절은 표시 보완으로 덮어쓰지 않음',async()=>{
  for(const kind of ['body','tags','refusal']){
    let calls=0;
    const generator=load('text-generator.js',async()=>{
      calls++;const draft=threads({mode:'use',emoji:'',reason:'뉴스'});
      if(kind==='body')draft.summary_blocks=[];
      if(kind==='tags')draft.hashtags=[];
      return kind==='refusal'?{status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]}:response(draft);
    });
    await assert.rejects(generator.generateTextPlatform('threads',{article,selected_keywords:[]}));assert.equal(calls,1);
  }
});

test('본문 선택표는 숫자·사진 캡션·Unicode를 삭제/요약하지 않고 실제 연속 구절만 보존',()=>{
  const {sourceExcerpts,resolvePlanEvidence}=require('../lib/source-excerpts');
  const body='운영 비율은 19.5%입니다. 사진 설명: 현장입니다.\r\nUnicode e\u0301와 📰도 그대로입니다.';
  const excerpts=sourceExcerpts(body);
  assert(excerpts.every(text=>body.includes(text)));assert(excerpts.some(text=>text.includes('19.5%')));
  assert(excerpts.some(text=>text.includes('사진 설명:')));assert(excerpts.some(text=>text.includes('e\u0301')));
  assert.equal(resolvePlanEvidence(plan([0]),excerpts).points[0].source_evidence[0],excerpts[0]);
  for(const bad of [-1,excerpts.length,0.5,null])assert.throws(()=>resolvePlanEvidence(plan([bad]),excerpts),/선택 번호/);
  assert.throws(()=>sourceExcerpts({body:'객체'}),/본문 텍스트/);
});

test('카드뉴스 p2의 바꿔 쓴 인용 실패는 실제 본문 번호 선택으로 한 번 보완',async()=>{
  let planCalls=0,draftCalls=0;
  const generator=load('card-news-generator.js',async request=>{
    const name=request.text.format.name;
    if(name.endsWith('_validation'))return response({issues:[]});
    if(name==='card_news_information_plan'){
      planCalls++;
      if(planCalls===1)return response(plan(['시행일은 추후 결정될 예정입니다.']));
      const input=JSON.parse(request.input),catalog=input.source_excerpt_catalog;
      assert.match(input.validation_error,/EVIDENCE_NOT_IN_ARTICLE.*근거.*일치/);
      assert.deepEqual(input.validation_issue_codes,[{code:'EVIDENCE_NOT_IN_ARTICLE',point_index:1}]);
      assert.deepEqual(catalog,['도서관의 주말 운영 시간을 늘릴 계획입니다.','인력 배치를 마친 뒤 시행일을 확정합니다.']);
      assert.equal(request.text.format.schema.properties.points.items.properties.source_evidence.items.type,'integer');
      return response(plan([0,1]));
    }
    draftCalls++;return response(cards());
  });
  const result=await generator.generateCardNews({article,selected_keywords:[],requirements:''});
  assert.equal(planCalls,2);assert.equal(draftCalls,1);
  assert.deepEqual(Array.from(result.information_plan.points[0].source_evidence),article.content.split('\n'));
  assert.equal(result.generation_review.status,'passed');assert.equal(result.article_id,article.article_id);
});

test('카드뉴스 보완의 잘못된 번호/여전한 가짜 인용은 차단하고 카드 생성으로 진행하지 않음',async()=>{
  for(const evidence of [[999],['원문에 없는 인용']]){
    let calls=0,draftCalls=0;
    const generator=load('card-news-generator.js',async request=>{
      if(request.text.format.name==='card_news_information_plan'){calls++;return response(plan(calls===1?['잘못 쓴 근거']:evidence));}
      draftCalls++;return response(cards());
    });
    await assert.rejects(generator.generateCardNews({article,selected_keywords:[]}),/주요 정보 배분표/);
    assert.equal(calls,2);assert.equal(draftCalls,0);
  }
});

test('배분표 실패 항목은 원문 없이 필드별 코드와 위치로 구분',()=>{
  const {checkInformationPlan}=require('../card-news-generator');
  const cases=[
    ['POINT_ID_EMPTY',p=>{p.points[0].id='  ';}],
    ['POINT_ID_DUPLICATE',p=>{p.points.push({...p.points[0]});}],
    ['POINT_SUMMARY_EMPTY',p=>{p.points[0].summary=' ';}],
    ['BODY_PAGE_NOT_INTEGER',p=>{p.points[0].body_page='2';}],
    ['BODY_PAGE_NOT_BODY',p=>{p.points[0].body_page=p.card_count;}],
    ['EVIDENCE_EMPTY',p=>{p.points[0].source_evidence=[];}],
    ['EVIDENCE_FORMAT',p=>{p.points[0].source_evidence='근거';}],
    ['EVIDENCE_NOT_IN_ARTICLE',p=>{p.points[0].source_evidence=['원문에 없는 가상 근거'];}],
  ];
  for(const [code,mutate] of cases){
    const current=plan();mutate(current);
    assert.throws(()=>checkInformationPlan(current,article),error=>{
      assert.equal(error.code,'INVALID_INFORMATION_PLAN');
      assert(error.issues.some(issue=>issue.code===code&&issue.point_index===(code==='POINT_ID_DUPLICATE'?2:1)));
      assert(!error.message.includes(article.content));
      return true;
    });
  }
});

test('ID·요약·본문 번호 오류는 해당 형식으로 재요청하고 근거를 번호로 바꾸지 않음',async()=>{
  const cases=[
    ['POINT_ID_EMPTY',p=>{p.points[0].id='';}],
    ['POINT_ID_DUPLICATE',p=>{p.points.push({...p.points[0]});}],
    ['POINT_SUMMARY_EMPTY',p=>{p.points[0].summary='';}],
    ['BODY_PAGE_NOT_BODY',p=>{p.points[0].body_page=3;}],
  ];
  for(const [code,mutate] of cases){
    let planCalls=0;
    const generator=load('card-news-generator.js',async request=>{
      if(request.text.format.name.endsWith('_validation'))return response({issues:[]});
      if(request.text.format.name==='card_news_information_plan'){
        planCalls++;
        if(planCalls===1){const broken=plan();mutate(broken);return response(broken);}
        const input=JSON.parse(request.input);
        assert(input.validation_issue_codes.some(issue=>issue.code===code));
        assert.equal(Object.hasOwn(input,'source_excerpt_catalog'),false);
        assert.equal(request.text.format.schema.properties.points.items.properties.source_evidence.items.type,'string');
        assert.match(request.instructions,/body_page는 .*2~card_count-1/);
        assert.doesNotMatch(request.instructions,/source_excerpt_catalog에서 실제 원문 구절/);
        assert.match(request.instructions,new RegExp(code));
        return response(plan());
      }
      return response(cards());
    });
    const result=await generator.generateCardNews({article,selected_keywords:[]});
    assert.equal(planCalls,2);
    assert.equal(result.information_plan.points[0].id,'p2');
    assert.equal(result.generation_review.status,'passed');
  }
});

test('비어 있거나 잘못된 근거 형식은 원문 선택 번호로 한 번 보완',async()=>{
  for(const malformed of [[], '근거']){
    let planCalls=0;
    const generator=load('card-news-generator.js',async request=>{
      if(request.text.format.name.endsWith('_validation'))return response({issues:[]});
      if(request.text.format.name==='card_news_information_plan'){
        planCalls++;
        if(planCalls===1){
          assert.equal(request.text.format.schema.properties.points.items.properties.source_evidence.minItems,1);
          return response(plan(malformed));
        }
        const input=JSON.parse(request.input);
        assert(Array.isArray(input.source_excerpt_catalog));
        assert.equal(request.text.format.schema.properties.points.items.properties.source_evidence.items.type,'integer');
        assert.doesNotMatch(request.instructions,/복사한 문자열 배열/);
        assert(input.validation_issue_codes.some(issue=>issue.code==='EVIDENCE_EMPTY'||issue.code==='EVIDENCE_FORMAT'));
        return response(plan([0,1]));
      }
      return response(cards());
    });
    const result=await generator.generateCardNews({article,selected_keywords:[]});
    assert.equal(planCalls,2);
    assert.deepEqual(Array.from(result.information_plan.points[0].source_evidence),article.content.split('\n'));
  }
});

test('정상 배분표와 안전한 ID 공백 정리는 추가 배분표 호출이 없음',async()=>{
  let planCalls=0;
  const generator=load('card-news-generator.js',async request=>{
    if(request.text.format.name.endsWith('_validation'))return response({issues:[]});
    if(request.text.format.name==='card_news_information_plan'){
      planCalls++;
      const current=plan();current.points[0].id=' p2 ';current.points[0].summary=' '+current.points[0].summary+' ';
      return response(current);
    }
    return response(cards());
  });
  const result=await generator.generateCardNews({article,selected_keywords:[]});
  assert.equal(planCalls,1);
  assert.equal(result.information_plan.points[0].id,'p2');
});

test('재요청도 실패하면 첫 오류·재요청 오류를 각각 알리고 카드 초안을 만들지 않음',async()=>{
  let planCalls=0,draftCalls=0;
  const generator=load('card-news-generator.js',async request=>{
    if(request.text.format.name==='card_news_information_plan'){
      planCalls++;
      const current=plan();
      if(planCalls===1)current.points[0].body_page=3;
      else current.points.push({...current.points[0]});
      return response(current);
    }
    draftCalls++;return response(cards());
  });
  await assert.rejects(generator.generateCardNews({article,selected_keywords:[]}),error=>{
    assert.deepEqual(Array.from(error.firstIssueCodes),['BODY_PAGE_NOT_BODY']);
    assert.deepEqual(Array.from(error.retryIssueCodes),['POINT_ID_DUPLICATE']);
    assert.match(error.message,/첫 응답:.*BODY_PAGE_NOT_BODY.*재요청:.*POINT_ID_DUPLICATE/);
    assert.doesNotMatch(error.message,/원문을 확인/);
    assert(!error.message.includes(article.content));
    return true;
  });
  assert.equal(planCalls,2);assert.equal(draftCalls,0);
});

test('원문에 없는 근거와 잘못된 재요청 선택 번호를 별도 코드로 보고',async()=>{
  let planCalls=0;
  const generator=load('card-news-generator.js',async request=>{
    if(request.text.format.name==='card_news_information_plan'){
      planCalls++;
      return response(plan(planCalls===1?['원문에 없는 구절']:[999]));
    }
    throw Error('잘못된 배분표 뒤 카드 생성 금지');
  });
  await assert.rejects(generator.generateCardNews({article,selected_keywords:[]}),error=>{
    assert.deepEqual(Array.from(error.firstIssueCodes),['EVIDENCE_NOT_IN_ARTICLE']);
    assert.deepEqual(Array.from(error.retryIssueCodes),['EVIDENCE_REFERENCE_INVALID']);
    assert.doesNotMatch(error.message,/원문을 확인/);
    return true;
  });
  assert.equal(planCalls,2);
});

test('4장 배분표의 가짜 근거와 마지막 카드 배정은 실패값을 제외하고 유효한 번호로 재요청',async()=>{
  const first={...plan(),card_count:4,points:[
    {id:'p1',summary:'주말 운영 계획',body_page:2,source_evidence:['원문에 없는 계획']},
    {id:'p2',summary:'운영 시간',body_page:2,source_evidence:[article.content.split('\n')[0]]},
    {id:'p3',summary:'인력 배치',body_page:3,source_evidence:['원문에 없는 인력 설명']},
    {id:'p4',summary:'시행 조건',body_page:4,source_evidence:[article.content.split('\n')[1]]},
  ]};
  let planCalls=0,draftCalls=0;
  const generator=load('card-news-generator.js',async request=>{
    const name=request.text.format.name;
    if(name.endsWith('_validation'))return response({issues:[]});
    if(name==='card_news_information_plan'){
      planCalls++;
      if(planCalls===1)return response(first);
      const input=JSON.parse(request.input),schema=request.text.format.schema;
      assert.deepEqual(input.validation_issue_codes,[
        {code:'EVIDENCE_NOT_IN_ARTICLE',point_index:1},
        {code:'EVIDENCE_NOT_IN_ARTICLE',point_index:3},
        {code:'BODY_PAGE_NOT_BODY',point_index:4},
      ]);
      assert.equal(Object.hasOwn(input.previous_information_plan.points[0],'source_evidence'),false);
      assert.equal(Object.hasOwn(input.previous_information_plan.points[2],'source_evidence'),false);
      assert.equal(Object.hasOwn(input.previous_information_plan.points[3],'body_page'),false);
      assert.deepEqual(Array.from(schema.properties.card_count.enum),[4]);
      assert.deepEqual(Array.from(schema.properties.points.items.properties.body_page.enum),[2,3]);
      assert.equal(schema.properties.points.items.properties.source_evidence.items.type,'integer');
      assert.match(request.instructions,/body_page는 2, 3 중 하나/);
      assert(!JSON.stringify(input.previous_information_plan).includes('원문에 없는'));
      return response({...first,points:first.points.map((point,index)=>({...point,
        body_page:index<2?2:3,source_evidence:[index<2?0:1]}))});
    }
    draftCalls++;
    const draft=cards();draft.recommended_card_count=4;
    draft.cards.splice(2,0,{...draft.cards[1],covered_point_ids:['p3','p4']});
    draft.cards[1].covered_point_ids=['p1','p2'];
    return response(draft);
  });
  const result=await generator.generateCardNews({article,selected_keywords:[]});
  assert.equal(planCalls,2);assert.equal(draftCalls,1);
  assert.equal(result.generation_review.status,'passed');
  assert(result.information_plan.points.every(point=>point.source_evidence.every(quote=>article.content.includes(quote))));
});

test('재요청이 가짜 인용과 마지막 카드 배정을 반복하면 초안 생성 없이 두 오류를 유지',async()=>{
  const first={...plan(),card_count:4};
  first.points[0].source_evidence=['원문에 없는 근거'];
  first.points[0].body_page=4;
  let planCalls=0,draftCalls=0;
  const generator=load('card-news-generator.js',async request=>{
    if(request.text.format.name==='card_news_information_plan'){planCalls++;return response(first);}
    draftCalls++;return response(cards());
  });
  await assert.rejects(generator.generateCardNews({article,selected_keywords:[]}),error=>{
    assert.deepEqual(Array.from(error.firstIssueCodes),['BODY_PAGE_NOT_BODY','EVIDENCE_NOT_IN_ARTICLE']);
    assert.deepEqual(Array.from(error.retryIssueCodes),['BODY_PAGE_NOT_BODY','EVIDENCE_NOT_IN_ARTICLE']);
    return true;
  });
  assert.equal(planCalls,2);assert.equal(draftCalls,0);
});

test('실제 Core stdin/stdout 경로도 Threads 표시 보완의 추가 AI 요청을 처리',async t=>{
  const child=spawn(process.execPath,[path.join(root,'core-adapter.js')],{cwd:root,env:{...process.env,PLATFORM_AI_BRIDGE:'core'},stdio:['pipe','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill();});
  const lines=createInterface({input:child.stdout});let result,calls=0;
  const done=new Promise((resolve,reject)=>{
    child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error('Core 어댑터 실패')));
    lines.on('line',line=>{
      const message=JSON.parse(line);
      if(message.type==='ai'){
        calls++;const request=message.request;
        assert.deepEqual(JSON.parse(request.input).article,article);
        child.stdin.write(JSON.stringify({type:'ai_result',id:message.id,ok:true,response:response(request.text.format.name==='threads_presentation'
          ?{presentation:{mode:'omit',emoji:'',reason:'사용자 요청'}}:threads({mode:'use',emoji:'',reason:'뉴스'}))})+'\n');
      }else result=message;
    });
  });
  child.stdin.write(JSON.stringify({action:'generate',platform:'threads',payload:{article,selected_keywords:[],requirements:'이모지 금지'}})+'\n');
  await done;assert.equal(calls,2);assert.equal(result.ok,true);assert.equal(result.result.draft.opening,article.title);
});
