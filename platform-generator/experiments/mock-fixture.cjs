// Entirely invented, non-user data. This is not a Core ArticleSnapshot.
const article = {
  article_id: 'mock-article-001',
  title: '가상 도서관 주말 운영 확대 계획',
  content: [
    '가상시는 세 곳의 도서관 주말 운영을 두 시간 늘릴 계획입니다.',
    '대상은 중앙·동부·서부 도서관이며 평일 운영 시간은 유지합니다.',
    '인력 배치를 마친 뒤 시행일을 확정할 예정입니다.',
    '시행일은 아직 정해지지 않았습니다.',
  ].join('\n'),
};
const quote = '인력 배치를 마친 뒤 시행일을 확정할 예정입니다.';
const drafts = {
  instagram: {
    opening: '가상시 도서관 주말 운영 확대 계획',
    paragraphs: ['세 곳의 주말 운영을 두 시간 늘릴 계획입니다.', '인력 배치 후 시행일을 확정할 예정입니다.'],
    closing: '평일 운영 시간은 유지합니다.',
    hashtags: ['#도서관', '#주말운영', '#가상시'],
    block_evidence: { opening: [article.content.split('\n')[0]], paragraphs: [[article.content.split('\n')[0]], [quote]], closing: [article.content.split('\n')[1]] },
  },
  threads: {
    draft_version: '2', opening: '가상시 도서관 주말 운영 확대 계획',
    paragraphs: ['세 곳의 도서관 주말 운영을 두 시간 늘릴 계획이야.', '인력 배치를 마친 뒤 시행일을 정할 예정이야.'],
    closing: '평일 운영 시간은 그대로야.', hashtags: ['#도서관', '#주말운영', '#가상시'],
    block_evidence: { opening: [article.content.split('\n')[0]], paragraphs: [[article.content.split('\n')[0]], [quote]], closing: [article.content.split('\n')[1]] },
  },
  card_news: {
    platform: 'card_news', draft_version: 2,
    core_text: { headline: article.title, summary: '주말 운영 확대 계획과 시행 조건', source_evidence: [quote] },
    cards: [
      { role: 'cover', content_version: 2, content: { keyword: '도서관', headline: article.title, body: '', answer: '', detail: '', show_keyword: true }, source_evidence: [article.content.split('\n')[0]] },
      { role: 'body', content_version: 2, content: { keyword: '운영 계획', headline: '무엇이 바뀌나요?', body: '', answer: '세 곳의 도서관 주말 운영을 두 시간 늘릴 계획입니다.', detail: '평일 운영 시간은 유지합니다.', show_keyword: true }, source_evidence: [article.content.split('\n')[0], article.content.split('\n')[1]] },
      { role: 'closing', closing_type: 'summary', content_version: 2, content: { keyword: '시행 조건', headline: '인력 배치 후 시행일 확정', body: '', answer: '', detail: '시행일은 아직 정해지지 않았습니다.', show_keyword: true }, source_evidence: [quote, article.content.split('\n')[3]] },
    ],
  },
};
module.exports = { fixtureRef: 'synthetic-fixture-v1', article, drafts, candidateText: article.content.split('\n')[3] };
