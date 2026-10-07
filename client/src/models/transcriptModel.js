/**
 * @file transcriptModel.js
 * @description ai-newsroom-os 표준 Transcript 클라이언트 데이터 모델 및 헬퍼 함수
 * 
 * 아키텍처 스키마:
 * - Transcript:
 *   - id: string
 *   - text: string
 *   - confidence: number (0.0 ~ 1.0)
 *   - language: string
 *   - segments: Array<TranscriptSegment>
 *   - metadata: Object (sourceEngine, sourceFilename, fileSize, createdAt)
 * 
 * - TranscriptSegment:
 *   - segmentId: string
 *   - index: number
 *   - start: number (ms)
 *   - end: number (ms)
 *   - text: string
 *   - confidence: number
 *   - words: Array<{ wordIndex, start, end, text }>
 *   - speaker: Object | null (화자 분리 보류)
 */

/**
 * 백엔드 STT 응답으로부터 표준 Transcript 객체를 안전하게 추출/정규화
 * 
 * @param {Object} sttResult - 백엔드 /api/stt 응답의 result 객체
 * @returns {Object|null} 표준화된 Transcript 객체
 */
export function createTranscriptModel(sttResult) {
  if (!sttResult) return null;

  // 1. 이미 transcript 객체가 존재하는 경우
  if (sttResult.transcript && typeof sttResult.transcript === 'object') {
    const t = sttResult.transcript;
    return {
      id: t.id || `tr_${Date.now()}`,
      text: String(t.text || ''),
      confidence: typeof t.confidence === 'number' ? t.confidence : 0,
      language: t.language || 'ko-KR',
      segments: Array.isArray(t.segments)
        ? t.segments.map((s, idx) => ({
            segmentId: s.segmentId || `seg_${String(idx + 1).padStart(4, '0')}`,
            index: typeof s.index === 'number' ? s.index : idx + 1,
            start: typeof s.start === 'number' ? s.start : 0,
            end: typeof s.end === 'number' ? s.end : 0,
            text: String(s.text || ''),
            confidence: typeof s.confidence === 'number' ? s.confidence : 0,
            speaker: s.speaker || null,
            words: Array.isArray(s.words)
              ? s.words.map((w, wIdx) => {
                  if (Array.isArray(w)) {
                    return {
                      wordIndex: wIdx,
                      start: typeof w[0] === 'number' ? w[0] : 0,
                      end: typeof w[1] === 'number' ? w[1] : 0,
                      text: String(w[2] || '')
                    };
                  }
                  return {
                    wordIndex: typeof w?.wordIndex === 'number' ? w.wordIndex : wIdx,
                    start: typeof w?.start === 'number' ? w.start : 0,
                    end: typeof w?.end === 'number' ? w.end : 0,
                    text: String(w?.text || '')
                  };
                })
              : []
          }))
        : [],
      metadata: t.metadata || {}
    };
  }

  // 2. 레거시 최상위 필드 폴백 지원
  return {
    id: `tr_${Date.now()}`,
    text: String(sttResult.text || ''),
    confidence: typeof sttResult.confidence === 'number' ? sttResult.confidence : 0,
    language: 'ko-KR',
    segments: Array.isArray(sttResult.segments)
      ? sttResult.segments.map((s, idx) => ({
          segmentId: `seg_${String(idx + 1).padStart(4, '0')}`,
          index: idx + 1,
          start: typeof s.start === 'number' ? s.start : 0,
          end: typeof s.end === 'number' ? s.end : 0,
          text: String(s.text || ''),
          confidence: typeof s.confidence === 'number' ? s.confidence : 0,
          speaker: s.speaker || null,
          words: Array.isArray(s.words)
            ? s.words.map((w, wIdx) => ({
                wordIndex: wIdx,
                start: Array.isArray(w) ? w[0] : (w.start || 0),
                end: Array.isArray(w) ? w[1] : (w.end || 0),
                text: String(Array.isArray(w) ? w[2] : (w.text || ''))
              }))
            : []
        }))
      : [],
    metadata: {}
  };
}
