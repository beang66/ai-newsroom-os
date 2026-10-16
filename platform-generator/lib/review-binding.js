// 새 생성 응답에만 적용하는 검수 결과 연결. Core ID/서명이나 인증 토큰이 아니다.
(function(root) {
  const omitted = new Set(['generation_review','generation_review_binding','validation_review',
    'validation_status','evidence_status','evidence_valid','block_evidence_valid','rendered_image',
    'generation_input','generation_source','source_url','snapshot_id']);
  function canonical(value, strip = false) {
    if (Array.isArray(value)) return value.map(item => canonical(item, strip));
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
      .filter(key => !strip || !omitted.has(key)).map(key => [key, canonical(value[key], strip)]));
    return value;
  }
  const serialize = value => JSON.stringify(canonical(value));
  function inputKey(input) {
    const article = input.article || {};
    return serialize({ platform: input.platform, article: { article_id: article.article_id,
      title: article.title, content: article.content }, selected_keywords: input.selected_keywords || [],
      requirements: input.requirements || '' });
  }
  const outputKey = draft => JSON.stringify(canonical(draft, true));
  function bindReview(input, draft, digest) {
    if (typeof digest !== 'function') throw new Error('검수 연결에는 SHA-256 계산 함수가 필요합니다.');
    return { version: 'generation-review-v1', input_hash: digest(inputKey(input)), output_hash: digest(outputKey(draft)) };
  }
  async function reviewMatches(input, draft) {
    const binding = draft?.generation_review_binding, review = draft?.generation_review;
    if (binding?.version !== 'generation-review-v1' || review?.platform !== input.platform
      || !['passed', 'needs_revision'].includes(review.status)
      || !Array.isArray(review.fact?.issues) || !Array.isArray(review.requirement?.issues)) return false;
    async function browserDigest(value) {
      if (!root.crypto?.subtle) return null;
      const bytes = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
      return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    const [sourceHash, draftHash] = await Promise.all([browserDigest(inputKey(input)), browserDigest(outputKey(draft))]);
    return sourceHash === binding.input_hash && draftHash === binding.output_hash;
  }
  const api = { serialize, bindReview, reviewMatches };
  root.ContentReviewBinding = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
