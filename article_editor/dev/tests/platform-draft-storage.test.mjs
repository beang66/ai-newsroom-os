import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toPlatformDraftSnapshot,
  fromPlatformDraftSnapshot,
} from '../../../src/api/platformDraftStorage.js';

test('toPlatformDraftSnapshot과 fromPlatformDraftSnapshot이 카드뉴스 및 플랫폼 글을 온전히 왕복 변환한다', () => {
  const state = {
    article: {
      articleId: 'art-123',
      title: '기사 제목',
      content: '기사 본문 내용',
      subtitle: '기사 부제',
      photos: [{ id: 'p1', url: 'https://example.com/p1.jpg', photographer: '작가' }],
    },
    drafts: {
      instagram: { headline: '인스타 헤드라인', body: '인스타 본문', text: '인스타 전체 본문' },
      threads: { headline: '스레드 헤드라인', body: '스레드 본문', text: '스레드 전체 본문' },
    },
    cardNews: {
      schema_version: 1,
      cards: [
        { card_id: 'c1', role: 'cover', content: { headline: '표지 제목' }, photoId: 'p1' },
        { card_id: 'c2', role: 'body', content: { headline: '본문 1', body: '내용 1' } },
      ],
      validation_status: 'not_checked',
    },
    selectedPlatforms: ['instagram', 'threads'],
    includeCardNews: true,
    selectedKeywords: ['AI', '뉴스룸'],
    requirements: '명사형 종결',
  };

  const snapshot = toPlatformDraftSnapshot(state);
  assert.equal(snapshot.schema_version, 1);
  assert.equal(snapshot.include_card_news, true);
  assert.equal(snapshot.cards.length, 2);
  assert.equal(snapshot.text_drafts.instagram, '인스타 전체 본문');
  assert.equal(snapshot.text_drafts.threads, '스레드 전체 본문');

  const restored = fromPlatformDraftSnapshot(snapshot);
  assert.deepEqual(restored.selectedPlatforms, ['instagram', 'threads']);
  assert.equal(restored.includeCardNews, true);
  assert.deepEqual(restored.selectedKeywords, ['AI', '뉴스룸']);
  assert.equal(restored.requirements, '명사형 종결');
  assert.equal(restored.cardNews.cards.length, 2);
  assert.equal(restored.cardNews.cards[0].card_id, 'c1');
  assert.equal(restored.cardNews.cards[0].photoId, 'p1');
  assert.equal(restored.drafts.instagram.headline, '인스타 헤드라인');
  assert.equal(restored.article.articleId, 'art-123');
  assert.equal(restored.article.photos[0].id, 'p1');
});

test('카드 없이 글만 있는 경우에도 snapshot 저장 및 복원이 정상 작동한다', () => {
  const state = {
    article: { articleId: 'art-456', title: '글 전용 기사', content: '본문' },
    drafts: {
      instagram: { headline: '글만 있는 인스타', body: '본문' },
    },
    cardNews: null,
    selectedPlatforms: ['instagram'],
    includeCardNews: false,
    selectedKeywords: ['정치'],
    requirements: '',
  };

  const snapshot = toPlatformDraftSnapshot(state);
  assert.equal(snapshot.cards.length, 0);
  assert.equal(snapshot.include_card_news, false);

  const restored = fromPlatformDraftSnapshot(snapshot);
  assert.equal(restored.cardNews, null);
  assert.equal(restored.includeCardNews, false);
  assert.equal(restored.drafts.instagram.headline, '글만 있는 인스타');
  assert.equal(restored.article.title, '글 전용 기사');
});

test('기존 독립 편집실 snapshot(text_drafts와 cards 1차원 배열) 형식도 정상 역직렬화한다', () => {
  const legacySnapshot = {
    schema_version: 1,
    include_card_news: true,
    platforms: ['instagram'],
    cards: [
      { card_id: 'legacy-1', keyword: '키워드', headline: '헤드라인', body: '본문' },
    ],
    text_drafts: {
      instagram: '레거시 인스타 원문 전체 텍스트',
    },
    source_input: {
      article: { id: 'leg-1', title: '레거시 기사', content: '레거시 본문' },
      selected_keywords: ['레거시'],
      requirements: '격식체',
    },
  };

  const restored = fromPlatformDraftSnapshot(legacySnapshot);
  assert.equal(restored.cardNews.cards.length, 1);
  assert.equal(restored.cardNews.cards[0].card_id, 'legacy-1');
  assert.equal(restored.drafts.instagram.text, '레거시 인스타 원문 전체 텍스트');
  assert.equal(restored.article.title, '레거시 기사');
  assert.deepEqual(restored.selectedKeywords, ['레거시']);
  assert.equal(restored.requirements, '격식체');
});
