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

require("dotenv").config({
  path: path.join(__dirname, ".env"),
  override: true,
  quiet: true,
});

// 1. 독립 카드뉴스 편집 기준
// 표본 추가 분석과 실제 화면 비교 후 이 기준을 보정합니다.
const CARD_NEWS_RULES = `
[역할]
- 플랫폼과 독립적인 사용자 편집용 카드뉴스 초안을 작성합니다.
- 기사 원문, 선택 키워드, 사용자 요구사항에서 직접 생성합니다.
- Instagram, Threads, Blog에서 생성된 결과를 참고하지 않습니다.

[구성]
- 기본 추천은 3~5장이며 허용 범위는 3~10장입니다.
- 사용자 요구사항과 서로 구분되는 정보량을 기준으로 카드 수를 정합니다.
- 허용 범위를 벗어난 요청은 범위 안에서 조정하고 이유를 설명합니다.
- 첫 장은 cover, 중간은 body, 마지막은 closing입니다.
- 표지는 주체와 핵심 사건 또는 변화를 짧은 제목으로 전달합니다.
- 중간 카드는 서로 구분되는 사실과 필요한 조건을 설명합니다.
- 마지막 카드는 앞의 핵심을 짧게 정리합니다.
- 카드 수를 채우기 위해 같은 내용을 반복하거나 사실을 추가하지 않습니다.
- 한 카드에는 하나의 중심 메시지만 담습니다.

[텍스트]
- core_text에는 전체 핵심 제목과 독립적으로 읽을 수 있는 짧은 요약을 작성합니다.
- 각 카드에는 keyword, headline, body를 작성합니다.
- keyword는 카드 주제를 나타내는 짧은 단어나 구로 작성합니다.
- headline은 가능하면 공백 포함 15~35자 안팎으로 작성합니다.
- body는 가능하면 공백 포함 40~120자 안팎의 짧은 문장으로 작성합니다.
- 위 분량은 권장값이며 원문 사실과 필수 조건을 우선합니다.
- 제목은 핵심을 전달하고 본문은 설명을 보완합니다.
- 기본은 명확한 합니다체이며 사용자 문체 요청을 반영합니다.
- 과장된 관심 유도, 근거 없는 전망, 개인적 의견을 추가하지 않습니다.
- 기본 검정 배경으로 텍스트만으로도 내용을 이해할 수 있게 작성합니다.
- 사진은 사용자가 나중에 선택하며 자동 삽입하지 않습니다.

[근거]
- core_text와 각 카드에 최소 하나의 source_evidence를 작성합니다.
- 근거는 원문 제목 또는 본문에 실제 존재하는 문장이나 연속된 구절입니다.
- 근거를 바꾸어 쓰거나 서로 떨어진 부분을 이어 붙이지 않습니다.
- 생성한 주장을 직접 뒷받침하는 근거를 선택합니다.
- 근거는 검수용 항목이며 카드 본문에 별도로 반복 삽입하지 않습니다.

[출력]
- 지정된 JSON 구조만 반환합니다.
- recommended_card_count는 실제 cards 길이와 같아야 합니다.
- card_count_reason에는 정보량과 카드 구성에 따른 이유를 작성합니다.
`;

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

const cardNewsSchema = objectSchema({
  recommended_card_count: { type: "integer" },
  card_count_reason: stringSchema,
  core_text: objectSchema({
    headline: stringSchema,
    summary: stringSchema,
    source_evidence: evidenceSchema,
  }),
  cards: {
    type: "array",
    items: objectSchema({
      role: { type: "string", enum: ["cover", "body", "closing"] },
      content: objectSchema({
        keyword: stringSchema,
        headline: stringSchema,
        body: stringSchema,
      }),
      source_evidence: evidenceSchema,
    }),
  },
});

const hasText = (value) => typeof value === "string" && value.trim().length > 0;
const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const hasEvidence = (value) => Array.isArray(value) && value.length > 0 && value.every(hasText);

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
    if (card?.role !== expected) throw new Error(`${index + 1}번째 카드의 역할이 올바르지 않습니다.`);
    if (!hasText(card.content?.keyword) || !hasText(card.content?.headline) ||
        !hasText(card.content?.body) || !hasEvidence(card.source_evidence)) {
      throw new Error(`${index + 1}번째 카드의 텍스트 또는 원문 근거가 비어 있습니다.`);
    }
  });
}

// 4. 카드뉴스 전용 생성 요청
async function generateCardNews(input) {
  if (!hasText(input?.article?.title) || !hasText(input?.article?.content)) {
    throw new Error("기사 제목과 원문을 입력해주세요.");
  }
  if (!Array.isArray(input.selected_keywords) || !input.selected_keywords.length ||
      !input.selected_keywords.every(hasText)) {
    throw new Error("키워드를 하나 이상 선택해주세요.");
  }
  const apiKey = OpenAI.apiKey?.trim();
  if (!apiKey) throw new Error(".env의 선택한 AI API 키를 확인해주세요.");

  // 기존 파일에서 플랫폼 공통 사실 규칙만 가져옵니다.
  // Instagram 작성 규칙과 생성 함수를 사용하지 않습니다.
  const commonRules = getPlatformRules("instagram").common_rules;
  const client = new OpenAI({ apiKey, timeout: 180000, maxRetries: 0 });
  const response = await client.responses.create({
    model: OpenAI.model?.trim() || "gpt-5",
    store: false,
    max_output_tokens: 12000,
    instructions: `${commonRules}\n${CARD_NEWS_RULES}`,
    input: JSON.stringify({
      article: input.article,
      selected_keywords: input.selected_keywords,
      requirements: input.requirements ?? "",
    }),
    text: { format: {
      type: "json_schema", name: "card_news_draft", strict: true, schema: cardNewsSchema,
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
  checkStructure(draft);

  // 6. 인용 존재 여부 확인 (의미 일치는 별도 검수 대상)
  const sources = [normalize(input.article.title), normalize(input.article.content)];
  const checkEvidence = (quotes) => hasEvidence(quotes) && quotes.every(
    (quote) => sources.some((source) => source.includes(normalize(quote)))
  );

  // 7. 플랫폼과 독립적인 편집용 결과 반환
  return {
    article_id: input.article.article_id,
    platform: "card_news",
    selected_keywords: input.selected_keywords,
    requirements: input.requirements ?? "",
    recommended_card_count: draft.recommended_card_count,
    card_count_reason: draft.card_count_reason,
    core_text: { ...draft.core_text, evidence_valid: checkEvidence(draft.core_text.source_evidence) },
    cards: draft.cards.map((card, index) => ({
      card_id: `C${index + 1}`, page: index + 1, ...card,
      evidence_valid: checkEvidence(card.source_evidence),
      image: { editable: true, selected_image_url: "" },
    })),
    validation_status: "not_checked",
  };
}

module.exports = { generateCardNews };
