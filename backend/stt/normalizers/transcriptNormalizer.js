/**
 * @file transcriptNormalizer.js
 * @description CLOVA Speech 원본 응답을 ai-newsroom-os 표준 Transcript 규격으로 정규화하는 모듈
 * 
 * 향후 통합 대상 아키텍처 엔티티:
 * - ProcessingJob: STT 처리 작업 상태 및 메타데이터
 * - Transcript: 취재 인터뷰/녹취 통합 텍스트 및 세그먼트 컬렉션
 * - TranscriptSegment: 발화 구간 단위의 시간(start/end), 텍스트, 신뢰도, 단어 목록
 * - Interview / Evidence: 취재 근거 자료 및 녹취 데이터베이스 인덱싱
 */

/**
 * 단어 단위 시간 정보 정규화
 * @param {Array} words - 원본 words 배열 ([start, end, text] 또는 객체 형태)
 * @returns {Array<Object>} 표준 단어 객체 배열
 */
function normalizeWords(words) {
  if (!Array.isArray(words)) return [];

  return words.map((w, index) => {
    if (Array.isArray(w)) {
      return {
        wordIndex: index,
        start: typeof w[0] === 'number' ? w[0] : 0,
        end: typeof w[1] === 'number' ? w[1] : 0,
        text: String(w[2] || '')
      };
    }
    return {
      wordIndex: index,
      start: typeof w?.start === 'number' ? w.start : 0,
      end: typeof w?.end === 'number' ? w.end : 0,
      text: String(w?.text || '')
    };
  });
}

/**
 * 발화 세그먼트 단위 정규화
 * (화자 분리 Diarization은 현재 보류 상태이므로 임의 추측/A/B 생성 없이 원본 값 보존 또는 미식별 유지)
 * @param {Array} segments - CLOVA Speech 원본 segments 배열
 * @returns {Array<Object>} 표준 TranscriptSegment 배열
 */
function normalizeSegments(segments) {
  if (!Array.isArray(segments)) return [];

  return segments.map((seg, index) => {
    const start = typeof seg.start === 'number' ? seg.start : 0;
    const end = typeof seg.end === 'number' ? seg.end : 0;
    const text = String(seg.text || '');
    const confidence = typeof seg.confidence === 'number' ? seg.confidence : 0;
    const words = normalizeWords(seg.words);

    // 원본 화자 정보는 보류 상태로 보존 (추측/변경 금지)
    const speaker = seg.speaker || (seg.diarization ? { label: seg.diarization.label } : null);

    return {
      segmentId: `seg_${String(index + 1).padStart(4, '0')}`,
      index: index + 1,
      start,
      end,
      text,
      confidence,
      words,
      speaker
    };
  });
}

/**
 * CLOVA Speech 원본 응답을 ai-newsroom-os 표준 Transcript 규격으로 변환
 * 
 * @param {Object} rawClovaResponse - CLOVA Speech API 원본 응답 본문
 * @param {Object} [metaOptions={}] - 오디오 메타데이터 및 작업 식별자
 * @returns {Object} 표준 정규화된 Transcript 객체
 */
function normalizeTranscript(rawClovaResponse, metaOptions = {}) {
  if (!rawClovaResponse) {
    return {
      id: `tr_${Date.now()}`,
      text: '',
      confidence: 0,
      language: 'ko-KR',
      segments: [],
      metadata: {
        createdAt: new Date().toISOString(),
        ...metaOptions
      }
    };
  }

  const segments = normalizeSegments(rawClovaResponse.segments);
  const text = String(rawClovaResponse.text || '');
  const confidence = typeof rawClovaResponse.confidence === 'number'
    ? rawClovaResponse.confidence
    : (segments.length > 0
        ? segments.reduce((acc, s) => acc + (s.confidence || 0), 0) / segments.length
        : 0);

  return {
    id: metaOptions.transcriptId || `tr_${Date.now()}`,
    text,
    confidence: Number(confidence.toFixed(4)),
    language: rawClovaResponse.language || 'ko-KR',
    segments,
    metadata: {
      sourceEngine: 'NAVER_CLOVA_SPEECH',
      sourceFilename: metaOptions.filename || 'unknown_audio',
      fileSize: metaOptions.fileSize || 0,
      mimeType: metaOptions.mimeType || 'audio/wav',
      createdAt: new Date().toISOString()
    }
  };
}

module.exports = {
  normalizeTranscript,
  normalizeSegments,
  normalizeWords
};
