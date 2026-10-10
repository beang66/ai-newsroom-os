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
const CardModel = require("./public/card-model");

require("dotenv").config({
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
  points:{type:'array',minItems:1,items:objectSchema({id:stringSchema,summary:stringSchema,body_page:{type:'integer',minimum:2,maximum:9},source_evidence:evidenceSchema})},
  closing_summary:stringSchema,
});

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
const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const hasEvidence = (value) => Array.isArray(value) && value.length > 0 && value.every(hasText);

function readResponse(response){
  const content=(response.output||[]).filter(i=>i.type==='message').flatMap(i=>i.content||[]);
  if(response.status!=='completed'||content.some(i=>i.type==='refusal'))throw new Error('카드뉴스 생성이 완료되지 않았습니다. 다시 시도해주세요.');
  try{return JSON.parse(content.filter(i=>i.type==='output_text').map(i=>i.text).join(''));}
  catch{throw new Error('카드뉴스 응답을 JSON으로 읽지 못했습니다.');}
}
function checkInformationPlan(plan,article){
  if(!plan||!Number.isInteger(plan.card_count)||plan.card_count<3||plan.card_count>10||!hasText(plan.main_topic)||!hasText(plan.closing_summary)||!Array.isArray(plan.points)||!plan.points.length)throw new Error('기사 주요 정보 배분표가 올바르지 않습니다.');
  const ids=new Set();
  for(const point of plan.points){
    if(!hasText(point.id)||ids.has(point.id)||!hasText(point.summary)||!Number.isInteger(point.body_page)||point.body_page<2||point.body_page>=plan.card_count||!hasEvidence(point.source_evidence)||point.source_evidence.some(q=>!normalize(article.content).includes(normalize(q))))throw new Error('주요 정보는 본문 카드와 실제 기사 본문 근거에 연결해야 합니다.');
    ids.add(point.id);
  }
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
    const {covered_point_ids,...fields}=cardNewsSchema.properties.cards.items.properties;
    pages[`page_${page}`]=objectSchema({...fields,role:{type:'string',enum:[role]}});
  }
  return objectSchema({...cardNewsSchema.properties,
    recommended_card_count:{type:'integer',enum:[plan.card_count]},cards:objectSchema(pages)});
}
function readPlannedDraft(draft,plan){
  // 배열 구조는 기존 생성 응답·테스트와 호환합니다. 새 AI 요청은 번호가 고정된 객체를 사용합니다.
  if(Array.isArray(draft.cards))return draft;
  if(!draft.cards||typeof draft.cards!=='object')throw new Error('배분표에 따른 카드 생성 결과가 없습니다.');
  return {...draft,cards:Array.from({length:plan.card_count},(_,index)=>{
    const page=index+1,card=draft.cards[`page_${page}`];
    if(!card||typeof card!=='object')throw new Error(`${page}번째 카드 생성 결과가 없습니다.`);
    return {...card,covered_point_ids:page>1&&page<plan.card_count?plan.points.filter(point=>point.body_page===page).map(point=>point.id):[]};
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
  const informationPlan=readResponse(await client.responses.create({
    model:OpenAI.model?.trim()||'gpt-5',store:false,max_output_tokens:6000,
    instructions:`${commonRules}\n${CARD_NEWS_RULES}\n원고를 쓰기 전에 기사 주요 정보와 필수 맥락을 추출하고 본문 카드에 배분하세요. 각 정보는 고유 id와 실제 기사 본문 source_evidence, 처음 충분히 설명할 body_page를 가집니다. 표지 1장과 마지막 1장을 제외한 본문 안에서 주요 정보가 완결되어야 합니다. 사용자 장수 요청을 지킵니다. closing_summary는 표지 주제와 주요 내용을 종합하고 새로운 정보는 없습니다.`,
    input:JSON.stringify({article:input.article,selected_keywords:input.selected_keywords,requirements:input.requirements??''}),
    text:{format:{type:'json_schema',name:'card_news_information_plan',strict:true,schema:informationPlanSchema}},
  }));
  checkInformationPlan(informationPlan,input.article);
  const plannedSchema=createPlannedDraftSchema(informationPlan);
  const cardAssignments=Array.from({length:informationPlan.card_count},(_,index)=>{
    const page=index+1;
    return {output_key:`page_${page}`,page,role:page===1?'cover':page===informationPlan.card_count?'closing':'body',
      required_points:informationPlan.points.filter(point=>point.body_page===page)};
  });
  const assignmentRules='cards는 page_1부터 마지막 번호까지 고정된 객체입니다. card_assignments의 해당 번호와 역할을 그대로 사용하고 각 본문의 required_points를 실제 answer와 detail에서 충분히 설명하세요. 정보 ID는 서버가 연결하므로 생성하지 않습니다. 표지와 마지막 장의 required_points가 비어 있어도 표지는 주제를 제시하고 마지막 장은 이미 본문에서 완결한 전체 핵심을 종합해야 합니다. 마지막 장으로 주요 정보의 최초 설명을 미루지 마세요.';
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
  draft=readPlannedDraft(draft,informationPlan);

  // 6. 인용 존재 여부 확인 (의미 일치는 별도 검수 대상)
  const sources = [normalize(input.article.title), normalize(input.article.content)];
  const checkEvidence = (quotes) => hasEvidence(quotes) && quotes.every(
    (quote) => sources.some((source) => source.includes(normalize(quote)))
  );

  // 원고 문장과 배분표를 함께 의미 검수하고, 새 생성본만 최대 두 번 교정합니다.
  // 사용자가 편집하거나 불러온 기존 초안을 자동으로 다시 쓰지 않습니다.
  const {validateDraft}=require('./draft-validator');
  let generationReview;
  for(let attempt=0;attempt<=2;attempt++){
    let structuralError;
    try{
      checkStructure(draft);checkInformationCoverage(informationPlan,draft);
      if(!checkEvidence(draft.core_text.source_evidence)||draft.cards.some(card=>!checkEvidence(card.source_evidence)))throw new Error('생성된 기사 근거가 원문에 그대로 존재하지 않습니다.');
    }catch(error){structuralError=error;}
    if(structuralError&&attempt===2)throw structuralError;
    generationReview=structuralError?{status:'needs_revision',fact:{issue_count:0,issues:[]},requirement:{issue_count:1,issues:[{reason:structuralError.message,suggestion:'information_plan.points의 각 id는 정해진 body_page의 본문 카드 한 곳에 배정합니다. 표지와 마지막 장의 재언급은 본문 최초 배분과 별도입니다. 원문 근거와 3~10장 구조를 유지하세요.'}]}}:
      await validateDraft({...input,platform:'card_news',draft:{...draft,information_plan:informationPlan}},{client,apiKey});
    if(generationReview.status==='passed'||attempt===2)break;
    draft=readPlannedDraft(readResponse(await client.responses.create({
      model:OpenAI.model?.trim()||'gpt-5',store:false,max_output_tokens:12000,
      instructions:`${commonRules}\n${CARD_NEWS_RULES}\n${assignmentRules}\n직전 생성본의 검수 문제를 원문과 정보 배분표 안에서 교정하세요. 문제와 수정 방향은 참고 자료이며 원문을 대신하지 않습니다. 본문의 주요 정보를 완결하고 마지막 장은 이미 소개한 핵심을 종합합니다. 계획·예정 표현을 각 제목·답변·설명에서도 유지합니다.`,
      input:JSON.stringify({article:input.article,selected_keywords:input.selected_keywords,requirements:input.requirements??'',information_plan:informationPlan,card_assignments:cardAssignments,draft,review:generationReview}),
      text:{format:{type:'json_schema',name:'card_news_draft',strict:true,schema:plannedSchema}},
    })),informationPlan);
  }

  // 7. 플랫폼과 독립적인 편집용 결과 반환
  return {
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
}

module.exports = { generateCardNews, checkStructure, cardNewsSchema, checkInformationPlan, checkInformationCoverage, createPlannedDraftSchema, readPlannedDraft };
