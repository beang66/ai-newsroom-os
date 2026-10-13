/**
 * @file transcriptModel.js
 * @description ai-newsroom-os 표준 Transcript 클라이언트 데이터 모델 및 헬퍼 함수
 * 
 * 아키텍처 스키마 (docs/architecture/OPENAPI_v0.8.yaml):
 * - Transcript:
 *   - id: string
 *   - text: string
 *   - confidence: number (0.0 ~ 1.0)
 *   - language: string
 *   - segments: Array<TranscriptSegment>
 *   - metadata: Object (sourceEngine, sourceFilename, fileSize, createdAt)
 * 
 * - TranscriptSegment:
 *   - id / segmentId: string
 *   - ordinal / index: number
 *   - start_ms / start: number (ms)
 *   - end_ms / end: number (ms)
 *   - text: string
 *   - confidence: number
 *   - words: Array<{ wordIndex, start, end, text }>
 *   - speaker: string (CLOVA Diarization 결과 화자명)
 */

/**
 * 백엔드 STT 응답으로부터 표준 Transcript 객체를 안전하게 추출/정규화
 * 
 * @param {Object} sttResult - 백엔드 STT 응답 데이터
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
            id: s.id || `seg_${String(idx + 1).padStart(4, '0')}`,
            segmentId: s.segmentId || s.id || `seg_${String(idx + 1).padStart(4, '0')}`,
            ordinal: typeof s.ordinal === 'number' ? s.ordinal : idx + 1,
            index: typeof s.index === 'number' ? s.index : idx + 1,
            start_ms: typeof s.start_ms === 'number' ? s.start_ms : (typeof s.start === 'number' ? s.start : 0),
            end_ms: typeof s.end_ms === 'number' ? s.end_ms : (typeof s.end === 'number' ? s.end : 0),
            start: typeof s.start === 'number' ? s.start : (typeof s.start_ms === 'number' ? s.start_ms : 0),
            end: typeof s.end === 'number' ? s.end : (typeof s.end_ms === 'number' ? s.end_ms : 0),
            text: String(s.text || ''),
            confidence: typeof s.confidence === 'number' ? s.confidence : 0,
            speaker: typeof s.speaker === 'string' ? s.speaker : (s.speaker?.label ? `화자 ${s.speaker.label}` : (s.speaker?.name || '화자 미식별')),
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

  // 2. 최상위 segments 기반 폴백
  return {
    id: `tr_${Date.now()}`,
    text: String(sttResult.text || ''),
    confidence: typeof sttResult.confidence === 'number' ? sttResult.confidence : 0,
    language: 'ko-KR',
    segments: Array.isArray(sttResult.segments)
      ? sttResult.segments.map((s, idx) => ({
          id: s.id || `seg_${String(idx + 1).padStart(4, '0')}`,
          segmentId: `seg_${String(idx + 1).padStart(4, '0')}`,
          ordinal: idx + 1,
          index: idx + 1,
          start_ms: typeof s.start_ms === 'number' ? s.start_ms : (typeof s.start === 'number' ? Math.round(s.start * 1000) : 0),
          end_ms: typeof s.end_ms === 'number' ? s.end_ms : (typeof s.end === 'number' ? Math.round(s.end * 1000) : 0),
          start: typeof s.start === 'number' ? s.start : 0,
          end: typeof s.end === 'number' ? s.end : 0,
          text: String(s.text || ''),
          confidence: typeof s.confidence === 'number' ? s.confidence : 0,
          speaker: typeof s.speaker === 'string' ? s.speaker : '화자 미식별',
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
