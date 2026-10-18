// Offline A/B0/B1 connection exercise. No server route, Core call, or paid AI call.
process.env.PLATFORM_AI_BRIDGE = 'core'; // Prevent loading the platform .env in the validator.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { validateDraft } = require('../draft-validator');
const { bindReview, reviewMatches, serialize } = require('../lib/review-binding');
const fixture = require('./mock-fixture.cjs');

const root = path.resolve(__dirname, '../..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const hashJson = value => sha(serialize(value));
const now = () => performance.now();
const elapsed = (start, clock) => Math.max(0, Number((clock() - start).toFixed(3)));
const codeFiles = [
  'platform-generator/draft-validator.js', 'platform-generator/lib/quote-context.js',
  'platform-generator/platform-rules.js', 'platform-generator/ai-provider.js',
  'platform-generator/instagram-generator.js', 'platform-generator/text-generator.js',
  'platform-generator/card-news-generator.js', 'platform-generator/core-adapter.js',
  'platform-generator/package.json',
  'platform-generator/experiments/mock-fixture.cjs',
  'platform-generator/experiments/mock-search-compare.cjs',
  'platform-generator/tests/mock-search-compare.test.cjs',
];

// Fixture output belongs to this experiment only; it is deliberately not a Core API shape.
async function preparedMockSearch(article, fixtureRef) {
  const text = fixture.candidateText;
  const start = article.content.indexOf(text);
  if (start < 0) throw new Error('fixture_missing');
  return { fixtureRef, articleHash: hashJson(article), candidates: [
    { source: 'synthetic_article_body', start_utf16: start, end_utf16: start + text.length, excerpt: text },
  ] };
}

function checkedCandidates(found, article, fixtureRef) {
  if (found?.fixtureRef !== fixtureRef || found.articleHash !== hashJson(article)
    || !Array.isArray(found.candidates) || found.candidates.length > 5) throw new Error('candidate_invalid');
  let chars = 0;
  return found.candidates.map(candidate => {
    const { start_utf16: start, end_utf16: end, excerpt } = candidate;
    if (candidate.source !== 'synthetic_article_body' || !Number.isInteger(start)
      || !Number.isInteger(end) || start < 0 || end <= start || end > article.content.length
      || article.content.slice(start, end) !== excerpt) throw new Error('candidate_invalid');
    chars += excerpt.length;
    if (chars > 8000) throw new Error('candidate_invalid');
    return { source: candidate.source, start_utf16: start, end_utf16: end, excerpt };
  });
}

async function runArm(platform, arm, selected, { mockSearch, onRequest, clock }) {
  const start = clock(); // Fixture selection stands in for article selection in this offline run.
  const input = structuredClone({ platform, article: selected.article, draft: selected.drafts[platform],
    selected_keywords: [], requirements: '' });
  const inputHash = hashJson(input);
  const experiment = { arm };
  let fallbackReason = null, searchMs = null, candidateCount = 0;
  if (arm === 'B1') {
    const searchStart = clock();
    try {
      const found = await mockSearch(input.article, selected.fixtureRef);
      experiment.mockCandidates = checkedCandidates(found, input.article, selected.fixtureRef);
      candidateCount = experiment.mockCandidates.length;
    } catch (error) {
      fallbackReason = error?.message === 'candidate_invalid' ? 'candidate_invalid' : 'mock_search_error';
      experiment.arm = 'B0';
    }
    searchMs = elapsed(searchStart, clock);
  }
  const requests = [];
  const client = { responses: { create: async request => {
    const requestStart = clock();
    const body = JSON.parse(request.input);
    const recorded = {
      kind: request.text.format.name, input_hash: sha(request.input),
      same_article: hashJson(body.article) === hashJson(input.article),
      has_evidence_context: Object.hasOwn(body, 'evidence_context'),
      has_mock_candidates: Object.hasOwn(body, 'mock_search_candidates'),
      mock_candidate_count: body.mock_search_candidates?.length || 0,
      has_b0_instruction: request.instructions.includes('evidence_context는 기존 인용'),
      duration_ms: null, usage_tokens: null,
    };
    if (onRequest) onRequest({ platform, arm, request, input });
    // The response is a fixed schema fixture, not an AI verdict.
    const response = { status: 'completed', output: [{ type: 'message', content: [
      { type: 'output_text', text: '{"issues":[]}' },
    ] }] };
    recorded.duration_ms = elapsed(requestStart, clock);
    requests.push(recorded);
    return response;
  } } };
  const result = await validateDraft(input, { apiKey: 'offline-fixture', client, experiment });
  if (requests.length !== 2 || requests.some(request => !request.same_article
    || request.has_evidence_context !== (experiment.arm !== 'A')
    || request.has_b0_instruction !== (experiment.arm !== 'A')
    || request.has_mock_candidates !== (experiment.arm === 'B1')
    || request.mock_candidate_count !== (experiment.arm === 'B1' ? candidateCount : 0))) {
    throw new Error('모의 검수 입력 또는 호출 횟수가 예상과 다릅니다.');
  }
  return { platform, requested_arm: arm, effective_arm: experiment.arm, input_hash: inputHash,
    article_hash: hashJson(input.article), draft_hash: hashJson(input.draft),
    final_review_forced: true, final_review_calls: requests.length,
    request_kinds: requests.map(request => request.kind), requests,
    mock_search_calls: arm === 'B1' ? 1 : 0, mock_search_ms: searchMs,
    mock_candidate_count: candidateCount, fallback_reason: fallbackReason,
    selection_to_review_ms: elapsed(start, clock), mock_validation_status: result.status,
    provider_usage_tokens: null, quality_measured: false };
}

async function cardReuseObservation(selected, clock) {
  const input = structuredClone({ platform: 'card_news', article: selected.article,
    draft: selected.drafts.card_news, selected_keywords: [], requirements: '' });
  const draft = { ...input.draft, generation_review: { platform: 'card_news', status: 'passed',
    fact: { issues: [] }, requirement: { issues: [] } } };
  draft.generation_review_binding = bindReview(input, draft, sha);
  const start = clock();
  const eligible = await reviewMatches(input, draft);
  return { eligible, eligibility_check_ms: elapsed(start, clock),
    final_review_calls_if_reused: eligible ? 0 : 2,
    actual_ui_completion_ms: null, separate_from_forced_comparison: true };
}

function manifest() {
  const fileHashes = Object.fromEntries(codeFiles.map(file => [file,
    sha(fs.readFileSync(path.join(root, file)))]));
  return { git_head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    git_branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(),
    experiment_version: 'offline-mock-compare-v1', context_version: 'quote-context-v1',
    trigger_policy_version: 'prepared-fixture-v1',
    model_setting: 'mock-only; .env not loaded; request model is the core-managed placeholder',
    file_sha256: fileHashes };
}

async function runMockComparison({ selected = fixture, mockSearch = preparedMockSearch,
  onRequest, clock = now } = {}) {
  const runs = [];
  for (const platform of ['instagram', 'threads', 'card_news']) {
    for (const arm of ['A', 'B0', 'B1']) {
      runs.push(await runArm(platform, arm, selected, { mockSearch, onRequest, clock }));
    }
  }
  for (const platform of ['instagram', 'threads', 'card_news']) {
    const group = runs.filter(run => run.platform === platform);
    if (new Set(group.map(run => run.input_hash)).size !== 1
      || new Set(group.map(run => run.article_hash)).size !== 1
      || new Set(group.map(run => run.draft_hash)).size !== 1) {
      throw new Error(`${platform}: 비교 입력이 서로 다릅니다.`);
    }
  }
  return { kind: 'offline_connection_test_only', generated_at: new Date().toISOString(),
    manifest: manifest(), fixture_ref: selected.fixtureRef,
    limits: { core_search_called: false, paid_ai_called: false, real_quality_measured: false,
      real_search_speed_measured: false, real_completion_time_measured: false },
    runs, card_news_reuse_observation: await cardReuseObservation(selected, clock) };
}

module.exports = { runMockComparison, preparedMockSearch, checkedCandidates };
if (require.main === module) {
  runMockComparison().then(report => {
    const reportPath = path.join(root, 'platform-generator/output/mock-search-result.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`Offline mock report: ${path.relative(root, reportPath)}; ${report.runs.length} runs`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
