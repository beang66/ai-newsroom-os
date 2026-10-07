/**
 * @file sttService.js
 * @description 백엔드 STT 및 AI 인터뷰 분석 API 통신 서비스 모듈
 */

/**
 * 백엔드 서버 헬스 체크 요청
 * @returns {Promise<boolean>} 서버 정상 연결 여부
 */
export async function checkServerHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    return false;
  }
}

/**
 * 음성 파일 STT 변환 요청
 * 
 * @param {File|Blob} fileOrBlob - 음성 파일 또는 Blob
 * @param {string} filename - 파일 이름
 * @returns {Promise<Object>} 백엔드 STT 결과 객체 ({ transcript, raw, job })
 */
export async function requestSTT(fileOrBlob, filename) {
  if (!fileOrBlob) {
    throw new Error('변환할 음성 파일이 없습니다.');
  }

  const formData = new FormData();
  formData.append('audio', fileOrBlob, filename || 'audio.wav');

  const response = await fetch('/api/stt', {
    method: 'POST',
    body: formData
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    const err = new Error(data.error || 'STT 처리에 실패했습니다.');
    err.cause = data.detail;
    throw err;
  }

  return data.result;
}

/**
 * AI 인터뷰 분석 요청
 * 
 * @param {Object} transcript - 표준화된 Transcript 객체
 * @returns {Promise<Object>} AI 분석 결과 ({ summary, keyPoints, keywords })
 */
export async function requestAnalyzeInterview(transcript) {
  if (!transcript || !transcript.text || transcript.text.trim() === '') {
    throw new Error('분석할 Transcript 데이터가 없습니다.');
  }

  const response = await fetch('/api/analyze-interview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ transcript })
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    const err = new Error(data.error || 'AI 인터뷰 분석에 실패했습니다.');
    err.cause = data.detail;
    throw err;
  }

  return data.result;
}
