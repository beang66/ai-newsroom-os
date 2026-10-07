const axios = require('axios');
const FormData = require('form-data');
const { normalizeTranscript } = require('./normalizers/transcriptNormalizer');

/**
 * NAVER CLOVA Speech 장문 음성인식 API 호출 모듈
 * 
 * @param {Buffer} fileBuffer - 업로드된 음성 파일 버퍼
 * @param {string} originalName - 음성 파일 원본 파일명
 * @param {string} mimeType - 음성 파일 MIME 타입
 * @returns {Promise<Object>} CLOVA Speech 인식 결과 객체
 */
async function recognizeSpeech(fileBuffer, originalName, mimeType) {
  const secretKey = process.env.CLOVA_SPEECH_SECRET_KEY;
  const invokeUrl = process.env.CLOVA_SPEECH_INVOKE_URL;

  // 1. 환경변수 유효성 검사
  if (!secretKey || secretKey.trim() === '') {
    throw new Error('CLOVA Speech Secret Key가 설정되지 않았습니다. .env 파일을 확인해 주세요.');
  }

  if (!invokeUrl || invokeUrl.trim() === '') {
    throw new Error('CLOVA Speech Invoke URL이 설정되지 않았습니다. .env 파일을 확인해 주세요.');
  }

  // 2. Invoke URL 엔드포인트 정규화 (/recognizer/upload)
  const trimmedUrl = invokeUrl.trim().replace(/\/+$/, '');
  const requestUrl = trimmedUrl.endsWith('/recognizer/upload')
    ? trimmedUrl
    : `${trimmedUrl}/recognizer/upload`;

  // 3. CLOVA Speech 인식 파라미터 정의 (동기 방식, 한국어, 화자 분리, 이벤트 감지 활성화)
  const params = {
    language: 'ko-KR',
    completion: 'sync',
    wordAlignment: true,
    fullText: true,
    diarization: {
      enable: true
    },
    sed: {
      enable: true
    }
  };

  // 4. multipart/form-data 구성
  const form = new FormData();
  form.append('media', fileBuffer, {
    filename: originalName || 'audio.wav',
    contentType: mimeType || 'application/octet-stream'
  });
  form.append('params', JSON.stringify(params));

  console.log(`[CLOVA Speech] API 요청 시작: ${requestUrl}`);

  try {
    // 5. CLOVA Speech API 호출
    const response = await axios.post(requestUrl, form, {
      headers: {
        'X-CLOVASPEECH-API-KEY': secretKey.trim(),
        ...form.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120000 // 음성 분석 대기 최대 2분
    });

    console.log(`[CLOVA Speech] API 요청 성공 (상태 코드: ${response.status})`);
    
    // 디버깅: CLOVA Speech 원본 화자 및 Diarization 정보 로깅 (기능 보류 및 디버깅용 유지)
    if (response.data && Array.isArray(response.data.segments)) {
      console.log('========== [CLOVA Speech 원본 세그먼트 로그] ==========');
      response.data.segments.forEach((seg, idx) => {
        const spkStr = JSON.stringify(seg.speaker || null);
        const diaStr = JSON.stringify(seg.diarization || null);
        console.log(`[세그먼트 ${idx + 1}] start: ${seg.start}ms | end: ${seg.end}ms | confidence: ${seg.confidence} | speaker: ${spkStr} | diarization: ${diaStr} | text: "${seg.text}"`);
      });
      console.log('=======================================================');

      // 화자 분리(Diarization) 기능은 현재 보류 상태로 두고, 텍스트를 재분류하지 않습니다.
      // (보류 상태 보존: 필요 시 사용할 수 있도록 백업 유지)
      // response.data.utterances = groupSegmentsBySpeaker(response.data.segments);
    }

    // 표준 Transcript 데이터 구조화 (ai-newsroom-os 표준 규격 정규화)
    response.data.transcript = normalizeTranscript(response.data, {
      filename: originalName,
      mimeType: mimeType,
      fileSize: fileBuffer ? fileBuffer.length : 0
    });
    console.log(`[Transcript 표준 정규화 완료] 세그먼트: ${response.data.transcript.segments.length}개, 신뢰도: ${response.data.transcript.confidence}`);

    return response.data;
  } catch (error) {
    if (error.response) {
      // CLOVA Speech API 서버에서 반환한 상세 오류
      console.error('[CLOVA Speech] API 오류 응답 상태:', error.response.status);
      console.error('[CLOVA Speech] API 오류 응답 본문:', JSON.stringify(error.response.data, null, 2));
      
      const errorMessage = error.response.data?.message || error.response.data?.result || error.message;
      const apiError = new Error(`CLOVA Speech API 오류 (${error.response.status}): ${errorMessage}`);
      apiError.status = error.response.status;
      apiError.detail = error.response.data;
      throw apiError;
    } else if (error.request) {
      // 요청 전송 후 응답을 받지 못한 경우 (네트워크 오류 또는 타임아웃)
      console.error('[CLOVA Speech] 서버 응답 없음:', error.message);
      const netError = new Error('CLOVA Speech 서버에 연결할 수 없거나 응답 시간이 초과되었습니다.');
      netError.status = 504;
      netError.detail = error.message;
      throw netError;
    } else {
      // 요청 설정 중 오류 발생
      console.error('[CLOVA Speech] 요청 설정 오류:', error.message);
      throw error;
    }
  }
}

/**
 * CLOVA Speech의 세그먼트들을 연속된 동일 화자 단위(Utterance)로 묶는 함수
 * - 화자가 변경될 때만 새로운 발화 단위로 분리
 * - 동일 화자가 연속해서 말하는 경우 시간(start~end), 텍스트, 단어 정보를 유지하며 병합
 * - 원본 speaker 정보를 Source of Truth로 유지
 *
 * @param {Array} segments - CLOVA Speech 원본 segments 배열
 * @returns {Array} 병합된 발화 단위(utterances) 배열
 */
function groupSegmentsBySpeaker(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return [];
  }

  const utterances = [];
  let currentUtterance = null;

  segments.forEach((seg) => {
    // 원본 화자 식별자 추출 (우선순위: speaker.label -> diarization.label -> speaker.name)
    let speakerKey = '알 수 없음';
    let rawLabel = null;
    let rawName = null;

    if (seg.speaker) {
      rawLabel = seg.speaker.label;
      rawName = seg.speaker.name;
    }
    if (rawLabel === null && seg.diarization) {
      rawLabel = seg.diarization.label;
    }

    // 화자 키 결정: rawLabel이 있으면 그것을 키로, 없으면 rawName 사용
    if (rawLabel !== undefined && rawLabel !== null && rawLabel !== '') {
      speakerKey = String(rawLabel);
    } else if (rawName !== undefined && rawName !== null && rawName !== '') {
      speakerKey = String(rawName);
    }

    // 이전 발화와 동일 화자인지 확인
    if (currentUtterance && currentUtterance._speakerKey === speakerKey) {
      // 동일 화자 연속 발화: 종료 시간 갱신 및 텍스트/단어 병합
      currentUtterance.end = seg.end;
      currentUtterance.text = `${currentUtterance.text} ${seg.text}`.trim();
      if (Array.isArray(seg.words)) {
        currentUtterance.words = (currentUtterance.words || []).concat(seg.words);
      }
      currentUtterance.segmentCount += 1;
    } else {
      // 새로운 화자 발화 시작
      currentUtterance = {
        _speakerKey: speakerKey,
        speaker: {
          label: rawLabel,
          name: rawName,
          // 화면 표시용 기본 명칭: 원본 라벨이 숫자/문자면 '화자 {label}', 없으면 원본 name
          displayName: rawLabel !== null && rawLabel !== undefined
            ? `화자 ${rawLabel}`
            : (rawName || '화자 미식별')
        },
        start: seg.start,
        end: seg.end,
        text: seg.text,
        words: Array.isArray(seg.words) ? [...seg.words] : [],
        segmentCount: 1
      };
      utterances.push(currentUtterance);
    }
  });

  // 디버깅: 병합된 발화 단위 출력
  console.log(`[화자 연속 발화 병합 완료] 원본 세그먼트: ${segments.length}개 -> 병합된 발화: ${utterances.length}개`);
  utterances.forEach((utt, idx) => {
    console.log(`  [발화 ${idx + 1}] 화자: ${utt.speaker.displayName} (키: ${utt._speakerKey}) | 시간: ${utt.start}ms ~ ${utt.end}ms | 세그먼트수: ${utt.segmentCount}개 | 내용: "${utt.text}"`);
  });

  return utterances;
}

/**
 * CLOVA Speech 원본 응답을 표준 Transcript 구조로 정리하는 함수
 * (이후 AI 인터뷰 분석 및 기사 작성 단계에서 사용하는 표준 데이터 규격)
 * 
 * @param {Object} clovaData - CLOVA Speech 원본 응답 데이터
 * @returns {Object} 표준화된 transcript 객체
 */
function formatTranscript(clovaData) {
  if (!clovaData) {
    return {
      text: '',
      confidence: 0,
      segments: []
    };
  }

  const segments = Array.isArray(clovaData.segments)
    ? clovaData.segments.map((seg) => {
        // 단어 단위 시간 정보 표준화 ([start, end, word] 또는 객체 형식)
        const words = Array.isArray(seg.words)
          ? seg.words.map((w) => {
              if (Array.isArray(w)) {
                return {
                  start: typeof w[0] === 'number' ? w[0] : 0,
                  end: typeof w[1] === 'number' ? w[1] : 0,
                  text: String(w[2] || '')
                };
              }
              return {
                start: typeof w?.start === 'number' ? w.start : 0,
                end: typeof w?.end === 'number' ? w.end : 0,
                text: String(w?.text || '')
              };
            })
          : [];

        return {
          start: typeof seg.start === 'number' ? seg.start : 0,
          end: typeof seg.end === 'number' ? seg.end : 0,
          text: String(seg.text || ''),
          confidence: typeof seg.confidence === 'number' ? seg.confidence : 0,
          words: words
        };
      })
    : [];

  return {
    text: String(clovaData.text || ''),
    confidence: typeof clovaData.confidence === 'number' ? clovaData.confidence : 0,
    segments: segments
  };
}

module.exports = {
  recognizeSpeech,
  groupSegmentsBySpeaker,
  formatTranscript
};


