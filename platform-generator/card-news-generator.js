// Gemini/OpenAI 공통 어댑터 연결. OpenAI 변수 이름은 기존 코드와의 호환을 위해 유지합니다.
// ============================================================
// card-news-generator.js
// 원문에서 플랫폼과 독립적인 카드뉴스 초안을 생성합니다.
// Instagram 초안이나 다른 플랫폼 결과를 입력으로 사용하지 않습니다.
// 공통 사실 규칙만 공유하고 카드 구성 지침은 이 파일에서 관리합니다.
// ============================================================

const path = require("path");
const OpenAI = require("./ai-provider");
const { getPlatformRules } = require("./platform-rules");
const CardModel = require("./lib/card-model");
const {sourceExcerpts,resolvePlanEvidence}=require('./lib/source-excerpts');

if (process.env.PLATFORM_AI_BRIDGE !== "core") require("dotenv").config({
  path: path.join(__dirname, ".env"),
  override: true,
  quiet: true,
});

// 1. 독립 카드뉴스 편집 기준
const CARD_NEWS_RULES = getPlatformRules("card_news").writing_rules;

// 2. 기존 편집기와 호환되는 JSON 구조
function objectSchema(properties) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const stringSchema = { type: "string" };
const evidenceSchema = { type: "array", items: stringSchema };
// 원고 작성 전에 주요 정보를 본문 카드에 배분합니다. 마지막 카드는 배분된 내용만 종합합니다.
const informationPlanSchema=objectSchema({
  card_count:{type:'integer',minimum:3,maximum:10},main_topic:stringSchema,
  points:{type:'array',minItems:1,items:objectSchema({id:stringSchema,summary:stringSchema,body_page:{type:'integer',minimum:2,maximum:9},source_evidence:{type:'array',minItems:1,items:stringSchema}})},
  closing_summary:stringSchema,
});

// 인용 실패를 보완할 때는 재작성 문자열 대신 실제 본문 선택표의 번호를 받는다.
function retryPlanSchema(excerpts,cardCount){
  const pointProperties={...informationPlanSchema.properties.points.items.properties};
  if(excerpts)pointProperties.source_evidence={type:'array',minItems:1,
    items:{type:'integer',minimum:0,maximum:excerpts.length-1}};
  if(Number.isInteger(cardCount)&&cardCount>=3&&cardCount<=10){
    pointProperties.body_page={type:'integer',enum:Array.from({length:cardCount-2},(_,index)=>index+2)};
  }
  return objectSchema({...informationPlanSchema.properties,
    ...(Number.isInteger(cardCount)&&cardCount>=3&&cardCount<=10?{card_count:{type:'integer',enum:[cardCount]}}:{}),
    points:{type:'array',minItems:1,items:objectSchema(pointProperties)}});
}

const cardNewsSchema = objectSchema({
  recommended_card_count: { type: "integer", minimum:3, maximum:10 },
  card_count_reason: stringSchema,
  core_text: objectSchema({
    headline: stringSchema,
    summary: stringSchema,
    source_evidence: evidenceSchema,
  }),
  cards: {
    type: "array",
    minItems:3,maxItems:10,
    items: objectSchema({
      role: { type: "string", enum: ["cover", "body", "closing"] },
      covered_point_ids:evidenceSchema,
      content: objectSchema({
        keyword: stringSchema,
        headline: stringSchema,
        body: stringSchema,
        answer: stringSchema,
        detail: stringSchema,
        farewell: stringSchema,
        show_keyword: { type: "boolean" },
      }),
      source_evidence: evidenceSchema,
      design: objectSchema({
        layout: { type: "string", enum: ["standard", "comparison", "list", "steps", "stat"] },
        highlights: { type: "array", items: stringSchema },
        compact: { type: "boolean" },
      }),
    }),
  },
});

const hasText = (value) => typeof value === "string" && value.trim().length > 0;
const normalize = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
const hasEvidence = (value) => Array.isArray(value) && value.length > 0 && value.every(hasText);

function readResponse(response){
  const content=(response.output||[]).filter(i=>i.type==='message').flatMap(i=>i.content||[]);
  if(response.status!=='completed'||content.some(i=>i.type==='refusal'))throw new Error('카드뉴스 생성이 완료되지 않았습니다. 다시 시도해주세요.');
  try{return JSON.parse(content.filter(i=>i.type==='output_text').map(i=>i.text).join(''));}
  catch{throw new Error('카드뉴스 응답을 JSON으로 읽지 못했습니다.');}
}
// 배분표 실패 코드는 원문·AI 응답을 로그에 남기지 않고 재요청을 정확히 안내하기 위한 값이다.
const PLAN_ISSUE_TEXT=Object.freeze({
  PLAN_SHAPE:'배분표 객체가 없습니다.',
  CARD_COUNT_RANGE:'카드 수는 3~10의 정수여야 합니다.',
  MAIN_TOPIC_EMPTY:'주제가 비어 있습니다.',
  CLOSING_SUMMARY_EMPTY:'마지막 카드의 종합 내용이 비어 있습니다.',
  POINTS_EMPTY:'본문에 배분할 주요 정보가 없습니다.',
  POINT_SHAPE:'주요 정보 항목은 객체여야 합니다.',
  POINT_ID_EMPTY:'정보 ID는 빈 문자열일 수 없습니다.',
  POINT_ID_DUPLICATE:'정보 ID가 중복됩니다. 각 정보에 서로 다른 ID를 부여해야 합니다.',
  POINT_SUMMARY_EMPTY:'정보 요약은 비어 있을 수 없습니다.',
  BODY_PAGE_NOT_INTEGER:'본문 카드 번호는 정수여야 합니다.',
  BODY_PAGE_NOT_BODY:'본문 카드 번호는 표지와 마지막 카드를 제외한 번호여야 합니다.',
  EVIDENCE_FORMAT:'근거는 비어 있지 않은 문자열 배열이어야 합니다.',
  EVIDENCE_EMPTY:'근거 배열에 원문 구절이 하나 이상 있어야 합니다.',
  EVIDENCE_NOT_IN_ARTICLE:'근거가 기사 본문과 일치하지 않습니다. 본문에서 그대로 인용해야 합니다.',
  EVIDENCE_REFERENCE_INVALID:'원문 구절 선택 번호가 선택표 범위 밖이거나 정수가 아닙니다.',
});
const EVIDENCE_ISSUES=new Set(['EVIDENCE_FORMAT','EVIDENCE_EMPTY','EVIDENCE_NOT_IN_ARTICLE','EVIDENCE_REFERENCE_INVALID']);
function planIssue(code,pointIndex=null){return {code,point_index:pointIndex};}
function planIssueMessage(issue,plan){
  const prefix=issue.point_index===null?'':`${issue.point_index}번째 정보: `;
  const range=issue.code==='BODY_PAGE_NOT_BODY'&&Number.isInteger(plan?.card_count)&&plan.card_count>=3&&plan.card_count<=10
    ? ` (허용: 2~${plan.card_count-1}번째 카드)` : '';
  return `${prefix}[${issue.code}] ${PLAN_ISSUE_TEXT[issue.code]}${range}`;
}
function planIssueSummary(issues,plan){
  const shown=issues.slice(0,5).map(issue=>planIssueMessage(issue,plan)).join(' ');
  return shown+(issues.length>5?` 그 외 ${issues.length-5}건.`:'');
}
function invalidInformationPlan(issues,plan){
  return Object.assign(new Error(planIssueSummary(issues,plan)),{
    code:'INVALID_INFORMATION_PLAN',issues,
  });
}
// 앞뒤 공백만 제거한다. 정보의 의미, 페이지 배정, 근거 문자열은 만들거나 바꾸지 않는다.
function normalizeInformationPlanFormat(plan){
  if(!plan||typeof plan!=='object'||Array.isArray(plan))return plan;
  return {...plan,
    main_topic:typeof plan.main_topic==='string'?plan.main_topic.trim():plan.main_topic,
    closing_summary:typeof plan.closing_summary==='string'?plan.closing_summary.trim():plan.closing_summary,
    points:Array.isArray(plan.points)?plan.points.map(point=>point&&typeof point==='object'&&!Array.isArray(point)
      ?{...point,id:typeof point.id==='string'?point.id.trim():point.id,
        summary:typeof point.summary==='string'?point.summary.trim():point.summary}:point):plan.points,
  };
}
// 실패한 값을 재요청 입력에서 제거해 모델이 잘못된 인용·페이지를 그대로 복사하지 않도록 한다.
function retryPlanContext(plan,issues){
  if(!plan||typeof plan!=='object'||Array.isArray(plan))return {};
  const failed=new Map();
  for(const issue of issues){
    if(issue.point_index===null)continue;
    const codes=failed.get(issue.point_index)||new Set();codes.add(issue.code);failed.set(issue.point_index,codes);
  }
  const context={...plan};
  if(issues.some(issue=>issue.code==='CARD_COUNT_RANGE'))delete context.card_count;
  if(issues.some(issue=>issue.code==='MAIN_TOPIC_EMPTY'))delete context.main_topic;
  if(issues.some(issue=>issue.code==='CLOSING_SUMMARY_EMPTY'))delete context.closing_summary;
  if(Array.isArray(plan.points))context.points=plan.points.map((point,index)=>{
    if(!point||typeof point!=='object'||Array.isArray(point))return {};
    const copy={...point},codes=failed.get(index+1)||new Set();
    if([...codes].some(code=>EVIDENCE_ISSUES.has(code)))delete copy.source_evidence;
    if(codes.has('BODY_PAGE_NOT_BODY')||codes.has('BODY_PAGE_NOT_INTEGER'))delete copy.body_page;
    if(codes.has('POINT_ID_EMPTY')||codes.has('POINT_ID_DUPLICATE'))delete copy.id;
    if(codes.has('POINT_SUMMARY_EMPTY'))delete copy.summary;
    return copy;
  });
  return context;
}
function checkInformationPlan(plan,article){
  const issues=[];
  if(!plan||typeof plan!=='object'||Array.isArray(plan))throw invalidInformationPlan([planIssue('PLAN_SHAPE')],plan);
  if(!Number.isInteger(plan.card_count)||plan.card_count<3||plan.card_count>10)issues.push(planIssue('CARD_COUNT_RANGE'));
  if(!hasText(plan.main_topic))issues.push(planIssue('MAIN_TOPIC_EMPTY'));
  if(!hasText(plan.closing_summary))issues.push(planIssue('CLOSING_SUMMARY_EMPTY'));
  if(!Array.isArray(plan.points)||!plan.points.length)issues.push(planIssue('POINTS_EMPTY'));
  const ids=new Set();
  for(const [index,point] of (Array.isArray(plan.points)?plan.points:[]).entries()){
    const position=index+1;
    if(!point||typeof point!=='object'||Array.isArray(point)){
      issues.push(planIssue('POINT_SHAPE',position));continue;
    }
    const id=typeof point.id==='string'?point.id.trim():'';
    if(!id)issues.push(planIssue('POINT_ID_EMPTY',position));
    else if(ids.has(id))issues.push(planIssue('POINT_ID_DUPLICATE',position));
    else ids.add(id);
    if(!hasText(point.summary))issues.push(planIssue('POINT_SUMMARY_EMPTY',position));
    if(!Number.isInteger(point.body_page))issues.push(planIssue('BODY_PAGE_NOT_INTEGER',position));
    else if(point.body_page<2||point.body_page>=plan.card_count)issues.push(planIssue('BODY_PAGE_NOT_BODY',position));
    if(!Array.isArray(point.source_evidence))issues.push(planIssue('EVIDENCE_FORMAT',position));
    else if(!point.source_evidence.length)issues.push(planIssue('EVIDENCE_EMPTY',position));
    else if(!point.source_evidence.every(hasText))issues.push(planIssue('EVIDENCE_FORMAT',position));
    else if(point.source_evidence.some(q=>!normalize(article.content).includes(normalize(q)))){
      issues.push(planIssue('EVIDENCE_NOT_IN_ARTICLE',position));
    }
  }
  if(issues.length)throw invalidInformationPlan(issues,plan);
}
function checkInformationCoverage(plan,draft){
  if(draft.cards.length!==plan.card_count)throw new Error('정보 배분표와 카드 수가 다릅니다.');
  const known=new Set(plan.points.map(p=>p.id));
  for(const card of draft.cards)if(!Array.isArray(card.covered_point_ids)||card.covered_point_ids.some(id=>!known.has(id)))throw new Error('배분표에 없는 신규 정보가 카드에 포함되어 있습니다.');
  for(const point of plan.points){
    const bodies=draft.cards.slice(1,-1).filter(c=>c.covered_point_ids.includes(point.id));
    if(bodies.length!==1||!draft.cards[point.body_page-1].covered_point_ids.includes(point.id)){
      const pages=draft.cards.slice(1,-1).flatMap((card,index)=>card.covered_point_ids.includes(point.id)?[index+2]:[]);
      throw new Error(`주요 정보의 본문 배분에 누락 또는 중복이 있습니다. ${point.id}는 ${point.body_page}번째 카드에 배정해야 합니다. 현재 본문 배정: ${pages.join(', ')||'없음'}. 정보: ${point.summary}`);
    }
  }
}

// 배분표의 카드 번호와 정보 ID는 서버가 관리하고, AI는 정해진 카드의 실제 문장을 작성합니다.
// covered_point_ids는 작성 계약이며 내용의 충족 여부는 원문을 대조하는 의미 검수에서 확인합니다.
function createPlannedDraftSchema(plan){
  const pages={};
  for(let page=1;page<=plan.card_count;page++){
    const role=page===1?'cover':page===plan.card_count?'closing':'body';
    const fields={...cardNewsSchema.properties.cards.items.properties};
    delete fields.covered_point_ids;
    delete fields.source_evidence;
    pages[`page_${page}`]=objectSchema({...fields,role:{type:'string',enum:[role]}});
  }
  return objectSchema({...cardNewsSchema.properties,
    recommended_card_count:{type:'integer',enum:[plan.card_count]},
    core_text:objectSchema({headline:stringSchema,summary:stringSchema}),cards:objectSchema(pages)});
}
function readPlannedDraft(draft,plan){
  // 배열 구조는 기존 생성 응답·테스트와 호환합니다. 새 AI 요청은 번호가 고정된 객체를 사용합니다.
  if(!draft?.cards||typeof draft.cards!=='object')throw new Error('배분표에 따른 카드 생성 결과가 없습니다.');
  const cards=Array.isArray(draft.cards)?draft.cards:Array.from({length:plan.card_count},(_,index)=>{
    const page=index+1,card=draft.cards[`page_${page}`];
    if(!card||typeof card!=='object')throw new Error(`${page}번째 카드 생성 결과가 없습니다.`);
    return {...card,covered_point_ids:page>1&&page<plan.card_count?plan.points.filter(point=>point.body_page===page).map(point=>point.id):[]};
  });
  // 원문 존재를 검증한 배분표의 근거만 사용한다. 본문 카드에는 해당 번호의 정보 근거를 연결한다.
  // 텍스트의 의미·누락·왜곡 여부는 아래 검수에서 계속 판정한다.
  const allEvidence=[...new Set(plan.points.flatMap(point=>point.source_evidence))];
  return {...draft,core_text:{...draft.core_text,source_evidence:allEvidence},cards:cards.map((card,index)=>{
    const page=index+1,assigned=plan.points.filter(point=>point.body_page===page);
    const evidence=assigned.length?[...new Set(assigned.flatMap(point=>point.source_evidence))]:allEvidence;
    return {...card,source_evidence:evidence};
  })};
}

// 3. 카드 구성과 필수 항목 확인
function checkStructure(draft) {
  if (!Array.isArray(draft?.cards) || draft.cards.length < 3 || draft.cards.length > 10) {
    throw new Error("카드뉴스는 3~10장으로 구성해야 합니다.");
  }
  if (!Number.isInteger(draft.recommended_card_count) ||
      draft.recommended_card_count !== draft.cards.length) {
    throw new Error("추천 카드 수와 실제 카드 수가 다릅니다.");
  }
  if (!hasText(draft.card_count_reason) || !hasText(draft.core_text?.headline) ||
      !hasText(draft.core_text?.summary) || !hasEvidence(draft.core_text?.source_evidence)) {
    throw new Error("핵심 제목·요약·원문 근거 또는 구성 이유가 비어 있습니다.");
  }
  draft.cards.forEach((card, index) => {
    const expected = index === 0 ? "cover" : index === draft.cards.length - 1 ? "closing" : "body";
    const normalized = CardModel.normalize(card);
    const layoutError = CardModel.layoutError({...normalized, role:expected, closing_type:'summary'});
    if (layoutError) throw new Error(`${index + 1}번째 카드: ${layoutError}`);
    // 이전 저장 초안은 화면에서 기본 디자인으로 표시합니다. 새 생성 결과는 스키마를 지킵니다.
    if (card.design) {
      const design = card.design;
      if (!["standard","comparison","list","steps","stat"].includes(design.layout) ||
          !Array.isArray(design.highlights) || typeof design.compact !== "boolean") {
        throw new Error(`${index + 1}번째 카드의 디자인 형식이 올바르지 않습니다.`);
      }
      const lines = CardModel.details(card).split("\n").filter(line => line.trim());
      if ((design.layout === "comparison" && lines.length !== 2) ||
          (["list","steps"].includes(design.layout) && (lines.length < 2 || lines.length > 4))) {
        throw new Error(`${index + 1}번째 카드의 배치에 맞는 본문 줄바꿈이 필요합니다.`);
      }
      const text = Object.values(card.content || {}).join("\n");
      design.highlights = [...new Set(design.highlights.filter(term => typeof term === "string" && term.trim() && text.includes(term)))].slice(0, 8);
    }
    if (card?.role !== expected) throw new Error(`${index + 1}번째 카드의 역할이 올바르지 않습니다.`);
    if(expected!=='closing'&&hasText(normalized.farewell))throw new Error('끝인사는 마지막 카드에만 작성해주세요.');
    if (!hasText(card.content?.keyword) || !hasText(card.content?.headline) ||
        (expected === 'body' && (!hasText(normalized.answer) || !hasText(normalized.detail))) ||
        (expected === 'closing' && !hasText(CardModel.details(card))) || !hasEvidence(card.source_evidence)) {
      throw new Error(`${index + 1}번째 카드의 텍스트 또는 원문 근거가 비어 있습니다.`);
    }
  });
}

// 4. 카드뉴스 전용 생성 요청
async function generateCardNews(input) {
  input = require("./lib/article-contract").generationPayload(input);
  if (!hasText(input?.article?.title) || !hasText(input?.article?.content)) {
    throw new Error("기사 제목과 원문을 입력해주세요.");
  }
  if (!Array.isArray(input.selected_keywords) ||
      !input.selected_keywords.every(hasText)) {
    throw new Error("키워드 입력 형식을 확인해주세요.");
  }
  const apiKey = OpenAI.apiKey?.trim();
  if (!apiKey) throw new Error(".env의 선택한 AI API 키를 확인해주세요.");

  // 기존 파일에서 플랫폼 공통 사실 규칙만 가져옵니다.
  // Instagram 작성 규칙과 생성 함수를 사용하지 않습니다.
  const commonRules = getPlatformRules("card_news").common_rules;
  const client = new OpenAI({ apiKey, timeout: 180000, maxRetries: 0 });
  const planInstructions=`${commonRules}\n${CARD_NEWS_RULES}\n원고를 쓰기 전에 기사 주요 정보와 필수 맥락을 추출하고 본문 카드에 배분하세요. 각 정보는 고유 id와 실제 기사 본문 source_evidence, 처음 충분히 설명할 body_page를 가집니다. 정보 ID는 빈값이나 중복이 없어야 하고 요약은 비어 있지 않아야 합니다. body_page는 표지 1장과 마지막 1장을 제외한 본문 카드 번호 2~card_count-1의 정수입니다. 주요 정보는 본문 안에서 완결되어야 합니다. 사용자 장수 요청을 지킵니다. closing_summary는 표지 주제와 주요 내용을 종합하고 새로운 정보는 없습니다.`;
  const directEvidenceRule='source_evidence는 입력 article.content에서 연속된 문장 또는 구절을 글자 그대로 복사한 문자열 배열입니다. 제목, 요약, 바꿔 쓴 표현, 기사 본문에 없는 문구는 근거로 쓰지 마세요.';
  const referencedEvidenceRule='source_evidence는 source_excerpt_catalog에서 실제 원문 구절의 0부터 시작하는 번호를 하나 이상 선택하는 정수 배열입니다. 인용문을 직접 작성하지 마세요. 서버가 번호를 원문 구절로 연결합니다.';
  let informationPlan;
  let previousPlan;
  let previousPlanError;
  let excerptCatalog;
  for(let attempt=0;attempt<2;attempt++){
    const useReferences=attempt>0&&previousPlanError.issues.some(issue=>EVIDENCE_ISSUES.has(issue.code));
    const retryErrors=attempt>0?planIssueSummary(previousPlanError.issues,previousPlan):'';
    const fixedCardCount=attempt>0&&Number.isInteger(previousPlan?.card_count)&&previousPlan.card_count>=3&&previousPlan.card_count<=10
      ?previousPlan.card_count:null;
    const pageRule=fixedCardCount?`직전 선택한 ${fixedCardCount}장 구성을 유지하세요. body_page는 ${Array.from({length:fixedCardCount-2},(_,index)=>index+2).join(', ')} 중 하나만 선택하세요. ${fixedCardCount}번은 마지막 카드이므로 주요 정보의 최초 설명을 배정하지 마세요.`:'';
    if(useReferences)excerptCatalog=sourceExcerpts(input.article.content);
    const response=await client.responses.create({
      model:OpenAI.model?.trim()||'gpt-5',store:false,max_output_tokens:6000,
      instructions:attempt===0?`${planInstructions}\n${directEvidenceRule}`:`${planInstructions}\n직전 배분표가 다음 항목에서 실패했습니다. 실패한 값은 이전 배분표에서 제거했으므로 다시 선택하세요. 페이지 배분과 정보의 의미를 임의로 합치거나 생략하지 마세요.\n${pageRule}\n${useReferences?referencedEvidenceRule:directEvidenceRule}\n검증 오류: ${retryErrors}`,
      input:JSON.stringify({
        article:input.article,
        selected_keywords:input.selected_keywords,
        requirements:input.requirements??'',
        ...(attempt===0?{}:{previous_information_plan:retryPlanContext(previousPlan,previousPlanError.issues),validation_error:retryErrors,
          validation_issue_codes:previousPlanError.issues.map(issue=>({code:issue.code,point_index:issue.point_index})),
          ...(useReferences?{source_excerpt_catalog:excerptCatalog}:{})}),
      }),
      text:{format:{type:'json_schema',name:'card_news_information_plan',strict:true,
        schema:attempt===0?informationPlanSchema:retryPlanSchema(useReferences?excerptCatalog:null,fixedCardCount)}},
    });
    informationPlan=normalizeInformationPlanFormat(readResponse(response));
    try{
      if(useReferences)informationPlan=resolvePlanEvidence(informationPlan,excerptCatalog);
      checkInformationPlan(informationPlan,input.article);
      break;
    }catch(error){
      if(error.code==='INVALID_INFORMATION_PLAN'&&!Array.isArray(error.issues)){
        error=invalidInformationPlan([planIssue(error.fieldCode||'EVIDENCE_REFERENCE_INVALID',
          Number.isInteger(error.pointIndex)?error.pointIndex+1:null)],informationPlan);
      }
      if(error.code!=='INVALID_INFORMATION_PLAN'||attempt===1){
        if(error.code==='INVALID_INFORMATION_PLAN'){
          const first=planIssueSummary(previousPlanError.issues,previousPlan);
          throw Object.assign(new Error(`카드뉴스 주요 정보 배분표를 만들지 못했습니다. 첫 응답: ${first} 재요청: ${error.message} 다시 생성해 주세요.`),{
            code:'INVALID_INFORMATION_PLAN',firstIssueCodes:previousPlanError.issues.map(issue=>issue.code),
            retryIssueCodes:error.issues.map(issue=>issue.code),
          });
        }
        throw error;
      }
      previousPlan=informationPlan;
      previousPlanError=error;
    }
  }
  const plannedSchema=createPlannedDraftSchema(informationPlan);
  const cardAssignments=Array.from({length:informationPlan.card_count},(_,index)=>{
    const page=index+1;
    return {output_key:`page_${page}`,page,role:page===1?'cover':page===informationPlan.card_count?'closing':'body',
      required_points:informationPlan.points.filter(point=>point.body_page===page)};
  });
  const assignmentRules='cards는 page_1부터 마지막 번호까지 고정된 객체입니다. card_assignments의 해당 번호와 역할을 그대로 사용하고 각 본문의 required_points를 실제 answer와 detail에서 충분히 설명하세요. 본문 카드에서는 headline이 질문이면 answer에서 직접 답하고, answer가 질문이면 같은 카드의 detail에서 답하세요. 명사형·서술형 answer도 허용하되 answer가 headline의 긴 재서술이나 카드 전체의 선행 요약이 되지 않게 하세요. detail은 answer를 표현만 바꿔 반복하지 말고 필요한 근거·결과·조건을 구체적으로 설명하세요. 배정된 정보와 필수 조건을 해당 카드에서 완결하고 headline → answer → detail을 자연스럽게 연결하세요. 정보 ID와 source_evidence는 서버가 검증된 배분표에서 연결하므로 생성하지 않습니다. 표지와 마지막 장의 required_points가 비어 있어도 표지는 주제를 제시하고 마지막 장은 이미 본문에서 완결한 전체 핵심을 종합해야 합니다. 마지막 장으로 주요 정보의 최초 설명을 미루지 마세요.';
  const response = await client.responses.create({
    model: OpenAI.model?.trim() || "gpt-5",
    store: false,
    max_output_tokens: 12000,
    instructions: `${commonRules}\n${CARD_NEWS_RULES}\n${assignmentRules}`,
    input: JSON.stringify({
      article: input.article,
      selected_keywords: input.selected_keywords,
      requirements: input.requirements ?? "",
      information_plan:informationPlan,
      card_assignments:cardAssignments,
    }),
    text: { format: {
      type: "json_schema", name: "card_news_draft", strict: true, schema: plannedSchema,
    } },
  });

  // 5. 거절, 미완료, 빈 응답 처리
  const contents = (response.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || []);
  if (contents.some((item) => item.type === "refusal")) {
    throw new Error("AI가 카드뉴스 생성 요청을 처리하지 못했습니다.");
  }
  if (response.status !== "completed") {
    throw new Error(response.incomplete_details?.reason === "max_output_tokens"
      ? "출력 한도에 도달했습니다. 요청 카드 수나 기사 분량을 줄여주세요."
      : "카드뉴스 생성이 완료되지 않았습니다. 다시 시도해주세요.");
  }
  const output = contents.filter((item) => item.type === "output_text")
    .map((item) => item.text).join("");
  if (!output.trim()) throw new Error("생성된 카드뉴스 응답이 비어 있습니다.");
  let draft;
  try { draft = JSON.parse(output); }
  catch { throw new Error("카드뉴스 응답을 JSON으로 읽지 못했습니다."); }
  draft=require('./lib/generation-format').repairGeneratedLayouts(readPlannedDraft(draft,informationPlan));

  // 6. 인용 존재 여부 확인 (의미 일치는 별도 검수 대상)
  const sources = [normalize(input.article.title), normalize(input.article.content)];
  const checkEvidence = (quotes) => hasEvidence(quotes) && quotes.every(
    (quote) => sources.some((source) => source.includes(normalize(quote)))
  );
  const invalidEvidence = (quotes, location) => {
    if (checkEvidence(quotes)) return null;
    const invalidQuotes = (Array.isArray(quotes) ? quotes : [])
      .filter(quote => !hasText(quote) || !sources.some(source => source.includes(normalize(quote))));
    return {
      location,
      category:'structure_violation',
      problematic_text:invalidQuotes.join('\n'),
      reason:`${location}에 기사 제목·본문에서 그대로 확인할 수 없는 근거가 있습니다.`,
      source_evidence:[],
      suggestion:'근거를 article.title 또는 article.content에 실제로 있는 연속된 문장·구절로 교체하세요. 요약하거나 다듬은 문장을 근거로 사용하지 마세요.',
    };
  };

  // 원고 문장과 배분표를 함께 의미 검수하고, 새 생성본만 최대 두 번 교정합니다.
  // 사용자가 편집하거나 불러온 기존 초안을 자동으로 다시 쓰지 않습니다.
  const {validateDraft,validationContext}=require('./draft-validator');
  let generationReview;
  for(let attempt=0;attempt<=2;attempt++){
    draft=require('./lib/generation-format').repairGeneratedLayouts(draft);
    let structuralError;
    try{
      checkStructure(draft);checkInformationCoverage(informationPlan,draft);
      const invalidReferences=[
        invalidEvidence(draft.core_text.source_evidence,'core_text.source_evidence'),
        ...draft.cards.map((card,index)=>invalidEvidence(card.source_evidence,`cards[${index}].source_evidence`)),
      ].filter(Boolean);
      if(invalidReferences.length){
        const first=invalidReferences[0];
        throw Object.assign(new Error(`${first.reason} 문제가 된 인용: ${first.problematic_text || '(근거 누락)'}`),{evidenceIssue:first});
      }
    }catch(error){structuralError=error;}
    if(structuralError&&attempt===2)throw structuralError;
    generationReview=structuralError?{status:'needs_revision',fact:{issue_count:0,issues:[]},requirement:{issue_count:1,issues:[structuralError.evidenceIssue||{location:'information_plan',category:'structure_violation',problematic_text:'',reason:structuralError.message,source_evidence:[],suggestion:'각 정보 ID는 정해진 본문 카드 한 곳에 배정하고 근거는 기사 본문에서 그대로 인용하세요. 원문 근거와 3~10장 구조를 유지하세요.'}]}}:
      await validateDraft({...input,platform:'card_news',draft:{...draft,information_plan:informationPlan}},{client,apiKey});
    if(generationReview.status==='passed'||attempt===2)break;
    draft=readPlannedDraft(readResponse(await client.responses.create({
      model:OpenAI.model?.trim()||'gpt-5',store:false,max_output_tokens:12000,
      instructions:`${commonRules}\n${CARD_NEWS_RULES}\n${assignmentRules}\n직전 생성본의 검수 문제를 원문과 정보 배분표 안에서 교정하세요. 문제와 수정 방향은 참고 자료이며 원문을 대신하지 않습니다. 본문의 질문·명사형·서술형을 일률적으로 바꾸지 말고, 지적된 카드에서 질문의 답, 주체·상태·조건, answer와 detail의 연결을 확인해 고치세요. answer가 제목의 긴 재서술이고 detail이 같은 주장을 바꿔 말한 경우에는 사실을 삭제하지 말고 핵심 문구와 새 설명으로 역할을 나누세요. 본문의 주요 정보를 해당 카드에서 완결하고 마지막 장은 이미 소개한 핵심을 종합합니다. 계획·예정 표현을 각 제목·answer·detail에서도 유지합니다.`,
      input:JSON.stringify({article:input.article,selected_keywords:input.selected_keywords,requirements:input.requirements??'',information_plan:informationPlan,card_assignments:cardAssignments,draft,review:generationReview}),
      text:{format:{type:'json_schema',name:'card_news_draft',strict:true,schema:plannedSchema}},
    })),informationPlan);
  }

  // 7. 플랫폼과 독립적인 편집용 결과 반환
  const generated = {
    article_id: input.article.article_id,
    platform: "card_news",
    draft_version: 2,
    selected_keywords: input.selected_keywords,
    requirements: input.requirements ?? "",
    recommended_card_count: draft.recommended_card_count,
    card_count_reason: draft.card_count_reason,
    core_text: { ...draft.core_text, evidence_valid: checkEvidence(draft.core_text.source_evidence) },
    information_plan:informationPlan,
    generation_review:generationReview,
    cards: draft.cards.map((card, index) => ({
      card_id: `C${index + 1}`, page: index + 1, ...card,
      content_version: 2,
      evidence_valid: checkEvidence(card.source_evidence),
      evidence_status: 'quote_presence_only',
      image: { editable: true, selected_image_url: "" },
    })),
    validation_status: "not_checked",
  };
  // 표현·필드가 바뀐 결과나 구조 검사만 한 결과를 최종 의미 검수로 승격하지 않는다.
  if (generationReview?.review_context === validationContext({...input, platform:'card_news', draft:generated})) {
    generated.generation_review_binding = require('./lib/review-binding').bindReview(
      {...input, platform:'card_news'}, generated,
      value => require('node:crypto').createHash('sha256').update(value, 'utf8').digest('hex'));
  }
  return generated;
}

module.exports = { generateCardNews, checkStructure, cardNewsSchema, checkInformationPlan, checkInformationCoverage, createPlannedDraftSchema, readPlannedDraft };
