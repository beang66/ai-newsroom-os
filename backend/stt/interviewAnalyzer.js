const { OpenAI } = require('openai');

/**
 * AI 인터뷰 분석 모듈 (OpenAI GPT-4o-mini 기반)
 * 
 * Transcript 데이터를 기반으로:
 * 1) 인터뷰 요약 (3~5문장)
 * 2) 핵심 내용 (5~10개 항목)
 * 3) 주요 키워드 (5~10개)
 * 를 추출하여 정형화된 JSON 객체로 반환합니다.
 * 
 * @param {Object} transcript - 표준 transcript 객체 ({ text, confidence, segments })
 * @returns {Promise<Object>} 분석 결과 ({ summary, keyPoints, keywords })
 */
async function analyzeInterview(transcript) {
  const apiKey = process.env.OPENAI_API_KEY;

  // 1. OpenAI API Key 유효성 검사
  if (!apiKey || apiKey.trim() === '') {
    const error = new Error('OpenAI API Key가 설정되지 않았습니다. .env 파일에 OPENAI_API_KEY를 입력해 주세요.');
    error.status = 400;
    throw error;
  }

  // 2. Transcript 유효성 검사
  if (!transcript || typeof transcript !== 'object') {
    const error = new Error('유효한 Transcript 데이터가 전달되지 않았습니다.');
    error.status = 400;
    throw error;
  }

  const interviewText = transcript.text || (Array.isArray(transcript.segments) ? transcript.segments.map(s => s.text).join(' ') : '');

  if (!interviewText || interviewText.trim() === '') {
    const error = new Error('분석할 인터뷰 텍스트 내용이 비어 있습니다.');
    error.status = 400;
    throw error;
  }

  // 3. OpenAI 클라이언트 초기화 (API Key는 보안을 위해 서버에서만 사용)
  const openai = new OpenAI({
    apiKey: apiKey.trim()
  });

  // 4. 시스템 프롬프트 및 사용자 프롬프트 구성
  const systemPrompt = `당신은 언론사 뉴스룸의 수석 에디터이자 전문 인터뷰 분석 AI입니다.
기자가 인터뷰 기사를 빠르고 정확하게 작성할 수 있도록, 제공된 STT 음성인식 녹취록(Transcript)을 정밀 분석해야 합니다.

반드시 다음 3가지 분석을 수행하고, 지정된 JSON 형식으로만 응답해야 합니다:
1. summary (인터뷰 요약):
   - 전체 인터뷰의 맥락과 핵심 주장을 3~5문장으로 명확하게 요약하십시오.
2. keyPoints (핵심 내용):
   - 기사 작성에 반드시 반영해야 할 주요 발언, 사실 관계, 논점을 5~10개의 문자열 배열로 작성하십시오.
3. keywords (주요 키워드):
   - 인터뷰에서 가장 중요하게 다뤄진 핵심 키워드를 5~10개의 단어/구 배열로 추출하십시오.

[응답 JSON 규격]
{
  "summary": "3~5문장의 요약 텍스트",
  "keyPoints": [
    "핵심 내용 1",
    "핵심 내용 2",
    "핵심 내용 3",
    "핵심 내용 4",
    "핵심 내용 5"
  ],
  "keywords": [
    "키워드 1",
    "키워드 2",
    "키워드 3",
    "키워드 4",
    "키워드 5"
  ]
}

주의사항:
- STT 원본의 사실과 발언을 왜곡하지 마십시오.
- 한국어로 명확하고 전문적인 어조로 작성하십시오.`;

  const userPrompt = `[인터뷰 녹취록 (Transcript)]
${interviewText}

위 녹취록을 분석하여 지정된 JSON 구조로 응답해 주세요.`;

  console.log(`[AI 인터뷰 분석] OpenAI API 요청 시작 (녹취록 길이: ${interviewText.length}자)`);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const rawContent = completion.choices[0]?.message?.content;
    console.log('[AI 인터뷰 분석] OpenAI API 응답 수신 완료');

    // 5. JSON 파싱 및 데이터 정규화
    let parsedResult;
    try {
      parsedResult = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error('[AI 인터뷰 분석] JSON 파싱 실패:', rawContent);
      throw new Error('AI 응답을 JSON 형식으로 해석할 수 없습니다.');
    }

    // 6. 스키마 방어적 정규화
    const sanitizedResult = {
      summary: typeof parsedResult.summary === 'string' ? parsedResult.summary.trim() : '요약 결과를 생성하지 못했습니다.',
      keyPoints: Array.isArray(parsedResult.keyPoints)
        ? parsedResult.keyPoints.filter(p => typeof p === 'string' && p.trim().length > 0).map(p => p.trim())
        : [],
      keywords: Array.isArray(parsedResult.keywords)
        ? parsedResult.keywords.filter(k => typeof k === 'string' && k.trim().length > 0).map(k => k.trim())
        : []
    };

    console.log(`[AI 인터뷰 분석] 결과 정규화 완료 (요약: ${sanitizedResult.summary.length}자, 핵심내용: ${sanitizedResult.keyPoints.length}개, 키워드: ${sanitizedResult.keywords.length}개)`);
    return sanitizedResult;
  } catch (apiError) {
    console.error('[AI 인터뷰 분석] OpenAI 호출 오류:', apiError.message);
    const error = new Error(`AI 분석 처리 중 오류가 발생했습니다: ${apiError.message}`);
    error.status = apiError.status || 500;
    error.detail = apiError.message;
    throw error;
  }
}

module.exports = {
  analyzeInterview
};
