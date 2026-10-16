const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runMockComparison, preparedMockSearch } = require('../experiments/mock-search-compare.cjs');
const { validateDraft } = require('../draft-validator');
const fixture = require('../experiments/mock-fixture.cjs');

test('three platforms share each platform input across A/B0/B1 and force two final reviews', async () => {
  const seen = [];
  const report = await runMockComparison({ onRequest: row => seen.push(row) });
  assert.equal(report.runs.length, 9);
  assert.equal(seen.length, 18);
  assert.equal(report.limits.core_search_called, false);
  assert.equal(report.limits.paid_ai_called, false);
  for (const platform of ['instagram', 'threads', 'card_news']) {
    const group = report.runs.filter(row => row.platform === platform);
    assert.equal(new Set(group.map(row => row.input_hash)).size, 1);
    assert.equal(new Set(group.map(row => row.article_hash)).size, 1);
    assert.equal(new Set(group.map(row => row.draft_hash)).size, 1);
    for (const run of group) {
      assert.equal(run.final_review_calls, 2);
      assert.deepEqual(run.request_kinds, ['fact_validation', 'requirement_validation']);
      assert.equal(run.final_review_forced, true);
      assert.ok(run.selection_to_review_ms >= 0);
      assert.equal(run.provider_usage_tokens, null);
      assert.equal(run.quality_measured, false);
    }
    const [a, b0, b1] = group;
    assert.ok(a.requests.every(request => !request.has_evidence_context && !request.has_b0_instruction));
    assert.ok(b0.requests.every(request => request.has_evidence_context && request.has_b0_instruction));
    assert.ok(b1.requests.every(request => request.has_evidence_context && request.has_mock_candidates));
    assert.equal(b1.mock_candidate_count, 1);
    assert.equal(b1.fallback_reason, null);
    assert.ok(b1.mock_search_ms >= 0);
  }
  assert.equal(report.card_news_reuse_observation.eligible, true);
  assert.equal(report.card_news_reuse_observation.final_review_calls_if_reused, 0);
  assert.equal(report.card_news_reuse_observation.actual_ui_completion_ms, null);
});

test('B1 mock search failure uses the B0 prompt and records the failure', async () => {
  const report = await runMockComparison({ mockSearch: async () => { throw new Error('offline failure'); } });
  for (const platform of ['instagram', 'threads', 'card_news']) {
    const b0 = report.runs.find(run => run.platform === platform && run.requested_arm === 'B0');
    const b1 = report.runs.find(run => run.platform === platform && run.requested_arm === 'B1');
    assert.equal(b1.effective_arm, 'B0');
    assert.equal(b1.fallback_reason, 'mock_search_error');
    assert.equal(b1.final_review_calls, 2);
    assert.deepEqual(b1.requests.map(request => request.input_hash), b0.requests.map(request => request.input_hash));
  }
});

test('a mock candidate from a different article is rejected before review', async () => {
  const report = await runMockComparison({ mockSearch: async (article, ref) => {
    const found = await preparedMockSearch(article, ref);
    found.articleHash = 'wrong-article';
    return found;
  } });
  assert.ok(report.runs.filter(run => run.requested_arm === 'B1').every(run =>
    run.effective_arm === 'B0' && run.fallback_reason === 'candidate_invalid'));
});

test('production default validator request stays identical to experimental B0', async () => {
  const input = { platform: 'instagram', article: fixture.article, draft: fixture.drafts.instagram,
    selected_keywords: [], requirements: '' };
  const requests = [];
  const client = { responses: { create: async request => {
    requests.push(request);
    return { status: 'completed', output: [{ type: 'message', content: [
      { type: 'output_text', text: '{"issues":[]}' },
    ] }] };
  } } };
  await validateDraft(input, { apiKey: 'offline-fixture', client });
  const productionRequests = structuredClone(requests);
  requests.length = 0;
  await validateDraft(input, { apiKey: 'offline-fixture', client, experiment: { arm: 'B0' } });
  assert.deepEqual(requests, productionRequests);
});
