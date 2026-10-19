const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { quoteContexts } = require('../lib/quote-context');
const { bindReview, reviewMatches } = require('../lib/review-binding');
const digest = value => require('node:crypto').createHash('sha256').update(value, 'utf8').digest('hex');
const root = path.resolve(__dirname, '..');

function loadWithAI(file, AI, cache = new Map()) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, __dirname: root, process: { env: { PLATFORM_AI_BRIDGE: 'core' } }, console,
    require: name => name === './ai-provider' ? AI : name === 'dotenv' ? { config() {} }
      : name === './draft-validator' ? loadWithAI('draft-validator.js', AI, cache)
      : name.startsWith('./') ? require(path.join(root, name)) : require(name),
  });
  return module.exports;
}

test('공백·CRLF·이모지 뒤 인용을 원문 좌표로 매핑하고 앞뒤 조건을 유지', () => {
  const body = '인력 확보 후 시행합니다.\r\n📰 주말  운영을\n두 시간 늘릴 계획입니다.\r\n시행일은 미정입니다.';
  const out = quoteContexts({ content: body }, { block_evidence: { paragraphs: [
    ['📰 주말 운영을 두 시간 늘릴 계획입니다.'],
  ] } });
  assert.equal(out.matches.length, 1);
  const match = out.matches[0];
  assert.equal(body.slice(match.start, match.end), match.quote);
  assert.equal(match.offset_unit, 'utf16');
  assert.match(match.context, /인력 확보/);
  assert.match(match.context, /시행일은 미정/);
});

test('반복 인용의 모든 위치를 보존하고 없는 근거를 유사 구절로 교체하지 않음', () => {
  const body = '서울시 발표입니다.\n시행일은 미정입니다.\n부산시 발표입니다.\n시행일은 미정입니다.';
  const out = quoteContexts({ content: body }, { source_evidence: ['시행일은 미정입니다.', '시행일이 확정됐습니다.'] });
  assert.equal(out.matches.length, 2);
  assert.notEqual(out.matches[0].start, out.matches[1].start);
  assert.equal(out.unmatched[0].quote, '시행일이 확정됐습니다.');
  assert.equal(out.matches.some(match => match.quote === '시행일이 확정됐습니다.'), false);
});

test('문맥 예산을 넘으면 문장을 잘라 근거로 쓰지 않고 불완전 상태 표시', () => {
  const out = quoteContexts({ content: '앞 문단입니다.\n시행일은 미정입니다.\n뒤 문단입니다.' },
    { source_evidence: ['시행일은 미정입니다.'] }, { maxChars: 2 });
  assert.equal(out.context_complete, false);
  assert.equal(out.matches.length, 0);
});

test('구절 불일치가 있어도 전체 원문과 두 의미 검수를 유지', async () => {
  const requests = [];
  class AI { static apiKey = 'fixture'; static model = 'fixture';
    responses = { create: async request => { requests.push(request); return {
      status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"issues":[]}' }] }],
    }; } }; }
  const { validateDraft } = loadWithAI('draft-validator.js', AI);
  const article = { article_id: 'fixture', title: '운영 확대 계획', content: '인력 확보가 조건입니다.\n주말 운영을 늘릴 계획입니다.\n시행일은 미정입니다.' };
  const block = ['주말 운영을 늘릴 계획입니다.'];
  const draft = { opening: '📰 운영 확대 계획', paragraphs: ['주말 운영을 늘릴 계획입니다.'],
    closing: '시행일은 확정되지 않았습니다.', hashtags: ['#운영', '#계획', '#도서관'],
    block_evidence: { opening: block, paragraphs: [block], closing: ['시행일이 확정됐습니다.'] } };
  const result = await validateDraft({ platform: 'instagram', article, draft, selected_keywords: [], requirements: '' });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    const input = JSON.parse(request.input);
    assert.equal(input.article.content, article.content);
    assert.match(input.evidence_context.matches[0].context, /인력 확보/);
    assert.match(request.instructions, /전체 원문 검토를 대신하지/);
  }
  assert.equal(result.status, 'needs_revision');
  assert.equal(result.fact.issues.length, 1);
  assert.equal(result.review_context.length, 64);
});

test('카드뉴스 네 번의 생성·검수 호출 결과를 실제 최종 카드에만 연결', async () => {
  const requests = [];
  const article = { article_id: 'fixture', title: '주말 운영 확대 계획', content: '시는 인력 확보 후 주말 운영을 늘릴 계획입니다. 시행일은 미정입니다.' };
  const evidence = [article.content];
  const plan = { card_count: 3, main_topic: article.title,
    points: [{ id: 'P1', summary: article.content, body_page: 2, source_evidence: evidence }], closing_summary: '확대 계획과 시행 조건' };
  const raw = { recommended_card_count: 3, card_count_reason: '계획과 조건 설명',
    core_text: { headline: article.title, summary: article.content, source_evidence: evidence },
    cards: ['cover', 'body', 'closing'].map((role, index) => ({ role, covered_point_ids: index === 1 ? ['P1'] : [],
      content_version: 2, content: { keyword: '운영', headline: article.title, body: '',
        answer: role === 'body' ? '운영을 늘릴 계획입니다.' : '', detail: article.content, show_keyword: true, farewell: '' },
      source_evidence: evidence, design: { layout: 'standard', highlights: [], compact: false } })) };
  class AI { static apiKey = 'fixture'; static model = 'fixture'; responses = { create: async request => {
    requests.push(request);
    const name = request.text.format.name;
    const value = name.endsWith('_validation') ? { issues: [] } : name === 'card_news_information_plan' ? plan : raw;
    return { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] };
  } }; }
  const { generateCardNews } = loadWithAI('card-news-generator.js', AI);
  const input = { article, selected_keywords: [], requirements: '' };
  const draft = await generateCardNews(input);
  assert.equal(requests.length, 4);
  assert.equal(draft.generation_review.status, 'passed');
  assert.ok(draft.generation_review_binding);
  assert.equal(await reviewMatches({ ...input, platform: 'card_news' }, draft), true);
  const edited = structuredClone(draft); edited.cards[1].content.answer = '운영이 이미 확대됐습니다.';
  assert.equal(await reviewMatches({ ...input, platform: 'card_news' }, edited), false);
  assert.equal(await reviewMatches({ ...input, platform: 'card_news', requirements: '다른 조건' }, draft), false);
  assert.equal(await reviewMatches({ ...input, platform: 'card_news', article: { ...article, content: '다른 원문' } }, draft), false);
});

test('구조 검사만 한 결과·예전 검수·다른 플랫폼 검수는 연결되지 않음', async () => {
  const input = { platform: 'card_news', article: { article_id: 'a', title: '제목', content: '본문' } };
  const draft = { platform: 'card_news', cards: [], generation_review: { status: 'passed', fact: { issues: [] }, requirement: { issues: [] } } };
  assert.equal(await reviewMatches(input, draft), false);
  draft.generation_review_binding = bindReview(input, draft, digest);
  assert.equal(await reviewMatches(input, draft), false);
  draft.generation_review.platform = 'threads';
  assert.equal(await reviewMatches(input, draft), false);
});
