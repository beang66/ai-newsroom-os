// 연결 확인용 소량 요청입니다. API 키와 원문 자료는 출력하지 않습니다.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true, quiet: true });
const AiProvider = require('./ai-provider');
(async () => {
  const client = new AiProvider({ timeout: 60000 });
  const response = await client.responses.create({
    instructions: '연결 확인입니다. status 값이 ok인 JSON만 반환하세요.',
    input: '연결 확인', max_output_tokens: 2048,
    text: { format: { schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] } }, required: ['status'], additionalProperties: false } } },
  });
  if (response.status !== 'completed' || response.output?.[0]?.content?.[0]?.type !== 'output_text') {
    throw new Error('응답이 완료되지 않았습니다. 다시 확인해주세요.');
  }
  console.log('AI 연결 성공:', AiProvider.model);
})().catch(error => {
  console.error('연결 실패:', { status: error.status, code: error.code, message: error.message });
  process.exitCode = 1;
});
