// 실제 설정된 AI로만 실행하는 수동 검증입니다. 단위 테스트에서 자동 호출하지 않습니다.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {generateCardNews}=require('../card-news-generator');
const AI=require('../ai-provider');
const {checkBasicRules,extractDraft,createQuoteChecker}=require('../draft-validator');
const {validateDraft}=require('../draft-validator');
const {getPlatformRules}=require('../platform-rules');
const article={article_id:'fictional-ai-check',title:'서울시 도서관 주말 운영 확대 계획',content:'서울시는 다음 달부터 중앙·동부·서부 도서관의 주말 운영 시간을 두 시간 늘릴 계획입니다. 평일 운영 시간은 유지합니다. 시는 인력 배치를 마친 뒤 시행일을 확정할 예정이라고 밝혔습니다.'};
async function main(){
 if(!AI.apiKey){console.log(JSON.stringify({verified:false,reason:'AI key is not configured'}));return;}
 const dir=path.resolve(__dirname,'../output/qa-card-news');await fs.mkdir(dir,{recursive:true});
 for(const closing_type of ['automatic-four']){
  if(process.argv.includes('--review-existing')){
   const saved=JSON.parse(await fs.readFile(path.join(dir,'real-ai-'+closing_type+'.json'),'utf8'));
   const validation=await validateDraft({platform:'card_news',article:saved.article,selected_keywords:saved.draft.selected_keywords,requirements:saved.draft.requirements,draft:saved.draft});
   await fs.writeFile(path.join(dir,'real-ai-'+closing_type+'-validation.json'),JSON.stringify(validation,null,2));
   console.log(JSON.stringify({realSemanticReview:true,type:closing_type,status:validation.status,factIssues:validation.fact.issue_count,requirementIssues:validation.requirement.issue_count}));continue;
  }
  const draft=await generateCardNews({article,selected_keywords:['도서관'],requirements:'가상 테스트 기사입니다. 정확히 4장으로 만들고 계획을 확정된 시행으로 바꾸지 마세요.'});
  const basic=checkBasicRules('card_news',extractDraft('card_news',draft),getPlatformRules('card_news'),createQuoteChecker(article));
  assert.equal(basic.fact.length,0);assert.equal(basic.requirement.length,0);
  await fs.writeFile(path.join(dir,'real-ai-'+closing_type+'.json'),JSON.stringify({article,draft},null,2));
  console.log(JSON.stringify({verified:true,realAI:true,type:closing_type,cards:draft.cards.length,quotePresence:true,semanticAIReview:true,reviewStatus:draft.generation_review.status,factIssues:draft.generation_review.fact.issue_count,requirementIssues:draft.generation_review.requirement.issue_count}));
 }
}
main().catch(e=>{console.error(JSON.stringify({verified:false,error:e.provider==='gemini'?e.message:e.status?'AI request failed: '+e.status:e.message}));process.exitCode=1;});
