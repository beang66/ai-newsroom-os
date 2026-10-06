// 모델·사용자 저장소·브라우저 없이 실제 API 어댑터와 카드 렌더링을 검증한다.
// 실행: node dev/tests/support-highlight.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const server = await createServer({
  root: fileURLToPath(new URL('../../web', import.meta.url)),
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { core } = await server.ssrLoadModule('/src/api/core.js');
  const { factcheckArticle, splitSentences } = await server.ssrLoadModule('/src/api/editorial.js');
  const { default: Drawer } = await server.ssrLoadModule('/src/components/FactCheckDrawer.jsx');
  const claim = '소각 예정 금액은 약 20억원 규모다.';
  const quote = '소각예정금액(원) 1,999,987,622';
  const cache = new Map([[claim, {
    claim, status: 'SUPPORTED', confidence: 0.91,
    evidence: { text: quote, material_title: '공시' },
    support_spans: [{ evidence_start: 0, evidence_end: quote.length }],
    // 예전 차이 위치가 남아 있어도 일치 근거로 잘못 쓰지 않는다.
    focus_spans: [{ claim_start: 0, claim_end: 2, evidence_start: 0, evidence_end: 2 }],
  }]]);
  core.factcheckRun = () => { throw Error('저장된 판정을 다시 실행하면 안 됩니다'); };
  const results = await factcheckArticle(claim, [], cache);
  assert.deepEqual(results[0].quoteSpans, [{ start: 0, end: quote.length }]);
  assert.deepEqual(results[0].spans, []);
  const render = (items) => renderToStaticMarkup(React.createElement(Drawer, {
    isOpen: true, article: { sources: [] },
    factCheck: { results: items, setFocus() {}, recheckCount: 0 },
  }));
  const html = render(results);
  assert.match(html, /bg-emerald-200[^>]*>소각예정금액\(원\) 1,999,987,622<\/mark>/);
  assert.match(html, /bg-emerald-200[^>]*>소각 예정 금액은 약 20억원 규모다\.<\/mark>/);
  assert.ok(!html.includes('bg-rose-200'));
  assert.ok(render([{ ...results[0], quoteSpans: [] }]).includes('대응하는 근거 구간을 특정하지 못했습니다'));
  // 외부 AI가 수치만 근거로 전체 문장을 일치 처리한 기존 결과도 세부 정보는 분리한다.
  const attribution = '27일 금융감독원 전자공시시스템에 따르면 젝시믹스는 보통주 62만7546주를 소각한다고 밝혔다.';
  const source = { id: 'm1', name: '[젝시믹스]주식소각결정(2026.08.27).html',
    text: '1. 소각할 주식의 종류와 수 보통주식(주) 627,546. 9. 이사회결의일 2026-08-27.' };
  const evidence = { text: source.text, material_title: source.name, material_id: source.id };
  const attributedCache = new Map([[attribution, {
    claim: attribution, status: 'REVIEW', evidence, evidence_candidates: [evidence],
    external: { verdict: 'SUPPORTED', reason: '주식 수 일치', evidence_text: '보통주식(주) 627,546', wrong_text: '' },
  }]]);
  const attributed = await factcheckArticle(attribution, [source], attributedCache);
  assert.deepEqual(attributed[0].details.map((d) => [d.text, d.location]), [
    ['27일', 'excerpt'], ['금융감독원', 'missing'], ['전자공시시스템', 'missing'], ['젝시믹스', 'title'],
  ]);
  assert.match(attributed[0].details[0].reference, /이사회결의일/);
  const detailsHtml = render(attributed);
  for (const term of ['27일', '금융감독원', '전자공시시스템', '젝시믹스'])
    assert.ok(detailsHtml.includes(`bg-amber-200 text-amber-950 not-italic font-bold rounded-sm px-0.5">${term}</mark>`));
  assert.ok(detailsHtml.includes('근거에서 찾지 못함'));
  assert.ok(detailsHtml.includes('자료명에만 표기 · 원문 확인 필요'));
  assert.ok(detailsHtml.includes('같은 일자 표기 · 의미 확인 필요'));
  assert.ok(detailsHtml.includes('세부 확인 필요'));
  assert.ok(!detailsHtml.includes(`bg-emerald-200 text-emerald-900 not-italic font-bold rounded-sm px-0.5">${attribution}</mark>`));
  const { claimDetails, supportedClaimRanges } = await server.ssrLoadModule('/src/api/claim-details.js');
  assert.equal(supportedClaimRanges(attribution, attributed[0].details).map((s) => attribution.slice(s.start, s.end)).join(''), attribution);
  assert.equal(claimDetails('28일 발표했다.', source.text, source)[0].location, 'missing');
  assert.equal(claimDetails('9월 27일 발표했다.', source.text, source)[0].location, 'missing');
  // 선택한 자료에 없는 기관을 다른 자료에 있다고 확인 처리하지 않는다.
  const others = await factcheckArticle(attribution, [source, { id: 'm2', name: '다른 자료', text: '금융감독원 전자공시시스템' }], attributedCache);
  assert.equal(others[0].details.find((d) => d.text === '금융감독원').location, 'missing');
  const formatted = '등록자는 계획서를 **관할 소방서장에게 제출해야 한다.**\n\n최근 화재로 어려움을 겪었다는 의견이다.';
  const split = splitSentences(formatted);
  assert.deepEqual(split.map((n) => n.text), ['등록자는 계획서를 관할 소방서장에게 제출해야 한다.', '최근 화재로 어려움을 겪었다는 의견이다.']);
  const index = split[0].text.indexOf('관할 소방서장');
  assert.equal(formatted.slice(split[0].map[index], split[0].map[index + '관할 소방서장'.length - 1] + 1), '관할 소방서장');
  const conflictCache = new Map(split.map((n) => [n.text, {
    claim: n.text, status: n === split[0] ? 'CONFLICT' : 'SUPPORTED', evidence: { text: '지방자치단체장에게 제출하도록 규정한다.' },
    conflict_spans: n === split[0] ? [{ claim_start: index, claim_end: index + '관할 소방서장'.length, evidence_start: 0, evidence_end: '지방자치단체장'.length }] : [],
  }]));
  const conflict = await factcheckArticle(formatted, [], conflictCache);
  assert.equal(formatted.slice(conflict[0].spans[0].start, conflict[0].spans[0].end), '관할 소방서장');
  assert.match(render(conflict), /bg-rose-200[^>]*>관할 소방서장<\/mark>/);
  assert.match(render(conflict), /bg-rose-200[^>]*>지방자치단체장<\/mark>/);
  console.log('PASS support-highlight: 일치 근거, 날짜/기관/주체 세부 표시, 파일명·날짜 의미 분리, 기존 외부 판정 호환');
} finally {
  await server.close();
}
