// 기존 UI 스모크의 격리 Core·모의 플랫폼 엔진을 재사용하는 변경 범위 전용 시나리오.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { bindReview } = createRequire(import.meta.url)('../../../platform-generator/lib/review-binding.js');

export async function runCardNewsSmoke({ page, BASE, go, waitWorkspaceReady, snapshot }) {
  const title = '카드뉴스 병합 회귀 기사';
  const content = '스모크 테스트 본문입니다. 주말 운영을 늘릴 계획입니다. 평일 운영 시간은 유지합니다.';
  const seed = await page.request.post(`${BASE}/api/articles/save`, {
    headers: { Origin: BASE }, data: { kind: 'manual', draft: { title, subtitle: '', content,
      bodyHtml: `<p>${content}</p>`, photos: [] } },
  });
  assert.equal(seed.status(), 200);
  const articleId = (await seed.json()).articleId;
  let validateCalls = 0;
  page.on('request', request => { if (request.url().endsWith('/api/platform/validate')) validateCalls++; });
  // 모의 엔진 결과에도 실제 공유 결합 함수를 적용해 새 검수 재사용을 화면에서 확인한다.
  await page.route('**/api/platform/generate', async route => {
    const response = await route.fetch();
    const result = await response.json(), input = route.request().postDataJSON();
    if (input.platform === 'card_news' && result.draft) {
      result.draft.generation_review = { platform: 'card_news', status: 'passed',
        fact: { issues: [] }, requirement: { issues: [] } };
      result.draft.generation_review_binding = bindReview({ ...input.payload, platform: input.platform },
        result.draft, value => createHash('sha256').update(value, 'utf8').digest('hex'));
    }
    await route.fulfill({ response, json: result });
  });
  await page.goto(BASE);
  await waitWorkspaceReady();
  await go('플랫폼 변환');
  const converter = page.getByTestId('format-converter');
  await converter.getByTestId('loaded-title').getByText(title, { exact: true }).waitFor();
  await converter.getByTestId('apply-studio-article').click();
  await converter.getByTestId('applied-source').getByText(/적용 완료/).waitFor();
  await converter.getByText('카드뉴스도 생성', { exact: true }).click();
  await converter.getByRole('button', { name: '카드뉴스', exact: true }).click();
  await converter.getByTestId('generate-active').click();
  const review = converter.getByTestId('platform-review');
  await review.getByText(/검수 통과/).waitFor();
  assert.equal(validateCalls, 0, '새 생성 결과의 같은 검수를 중복 호출하지 않는다');
  assert.equal(await converter.getByTestId('platform-validate').isDisabled(), true);
  const headline = converter.getByRole('textbox', { name: 'headline', exact: true });
  await headline.fill('편집한 카드 제목');
  await review.getByText(/재검수 필요/).waitFor();
  await converter.getByTestId('platform-validate').click();
  await review.getByText(/검수 통과/).waitFor();
  assert.equal(validateCalls, 1);
  assert.equal(await converter.getByTestId('platform-validate').isDisabled(), true);
  await review.getByRole('button', { name: '다시 검수', exact: true }).click();
  await review.getByText(/현재 원고의 변환·요구사항 검수를 마쳤습니다/).waitFor();
  assert.equal(validateCalls, 2);
  // 늦은 검수 응답은 편집한 원고에 적용하지 않는다.
  let started, release;
  const waiting = new Promise(resolve => { started = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/api/platform/validate', async route => {
    const response = await route.fetch(); started(); await held; await route.fulfill({ response });
  });
  await review.getByRole('button', { name: '다시 검수', exact: true }).click();
  await waiting;
  await headline.fill('검수 중 변경한 카드 제목'); release();
  await review.getByText(/결과를 적용하지 않았습니다/).waitFor();
  await review.getByText(/재검수 필요/).waitFor();
  await page.unroute('**/api/platform/validate');
  await converter.getByTestId('platform-validate').click();
  await review.getByText(/검수 통과/).waitFor();
  await converter.getByTestId('card-image-make').click();
  const image = converter.getByTestId('card-image-preview');
  await image.waitFor();
  assert.match(await image.getAttribute('src'), /^\/api\/media-assets\/[0-9a-f-]{36}\/file$/);
  await page.waitForFunction(() => { const image = document.querySelector('[data-testid="card-image-preview"]');
    return image?.complete && image.naturalWidth > 0; });
  await snapshot('card-news-merge-smoke');
  const saved = page.waitForResponse(response => response.url().endsWith('/api/articles/save')
    && response.ok() && response.request().postDataJSON()?.kind === 'manual');
  await page.keyboard.press('Control+s'); await saved;
  const stored = (await (await page.request.get(`${BASE}/api/articles/${articleId}`)).json()).draft;
  assert.equal(stored.cardNews.cards[0].content.headline, '검수 중 변경한 카드 제목');
  await page.reload(); await waitWorkspaceReady(); await go('플랫폼 변환');
  await converter.getByRole('button', { name: /^카드뉴스\s*●?$/ }).click();
  assert.equal(await headline.inputValue(), '검수 중 변경한 카드 제목');
  assert.equal(await review.getByRole('button', { name: '다시 검수', exact: true }).count(), 0,
    '저장 복원한 이전 런타임 검수는 자동 재사용하지 않는다');
  assert.equal(await converter.getByTestId('platform-validate').isEnabled(), true);
  console.log('PASS card-news-ui-smoke: 기사 적용·생성 검수 재사용·편집 무효화·명시적 재검수·늦은 응답 차단·Core 이미지·저장/복원');
}
