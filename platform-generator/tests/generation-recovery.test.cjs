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
      assert.match(input.validation_error,/p2.*근거.*일치/);
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
