// 생성기 내부 인용 선택표. 본문을 고치거나 공통 기사/고정본 ID를 만들지 않는다.
function sourceExcerpts(content) {
  if (typeof content !== 'string') throw new TypeError('기사 본문 텍스트가 필요합니다.');
  const segmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('ko', { granularity: 'sentence' }) : null;
  const excerpts = content.split(/\r?\n+/).flatMap(paragraph =>
    segmenter ? Array.from(segmenter.segment(paragraph), item => item.segment) : [paragraph]);
  return [...new Set(excerpts.map(text => text.trim()).filter(Boolean))];
}

// AI가 고른 내부 배열 번호를 실제 원문 구절로 바꾼다. 저장/반환 형식은 기존 문자열 배열이다.
function resolvePlanEvidence(plan, excerpts) {
  if (!plan || !Array.isArray(plan.points)) return plan;
  return { ...plan, points: plan.points.map((point, pointIndex) => {
    if (!point || !Array.isArray(point.source_evidence)) return point;
    return { ...point, source_evidence: point.source_evidence.map(reference => {
      // 이전 응답의 문자열은 기존 인용 검사에 그대로 맡긴다. 잘못된 인용을 유사 문장으로 덮지 않는다.
      if (typeof reference === 'string') return reference;
      if (!Number.isInteger(reference) || reference < 0 || reference >= excerpts.length) {
        throw Object.assign(new Error('주요 정보의 원문 구절 선택 번호가 올바르지 않습니다.'),
          { code: 'INVALID_INFORMATION_PLAN', fieldCode: 'EVIDENCE_REFERENCE_INVALID', pointIndex });
      }
      return excerpts[reference];
    }) };
  }) };
}
module.exports = { sourceExcerpts, resolvePlanEvidence };
