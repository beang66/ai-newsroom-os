// AI 호출 호환 어댑터: 기존 생성/검수 규칙과 Responses 결과 해석을 유지합니다.
// AI_PROVIDER=gemini 또는 openai. 자동으로 다른 유료 API로 전환하지 않습니다.
const { AI_ENDPOINTS } = require('./public/api');
function provider() {
  const value = (process.env.AI_PROVIDER || 'gemini').trim().toLowerCase();
  if (!['gemini', 'openai'].includes(value)) throw new Error('AI_PROVIDER는 gemini 또는 openai로 설정해주세요.');
  return value;
}
// App Core 가 띄운 경우(PLATFORM_AI_BRIDGE=core) 외부 AI 호출은 코어에 맡긴다 — 이 프로세스에는 키가 없다.
function viaCore() { return process.env.PLATFORM_AI_BRIDGE === 'core'; }
function apiKey() {
  if (viaCore()) return 'core-bridge'; // 키 확인용 자리표시자(실제 키는 코어/백엔드 쪽)
  return (provider() === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY)?.trim() || '';
}
function model() {
  if (viaCore()) return 'core-managed'; // 실제 모델은 코어가 정한다
  return (provider() === 'gemini' ? process.env.GEMINI_MODEL : process.env.OPENAI_MODEL)?.trim() ||
    (provider() === 'gemini' ? 'gemini-3.5-flash-lite' : 'gpt-5');
}
function problem(message, status, code) {
  return Object.assign(new Error(message), { provider: 'gemini', status, code });
}
// JSON 형식만 맞고 필수 항목/자료형이 틀린 결과도 그대로 화면에 보내지 않습니다.
function checkSchema(value, schema, location = 'result') {
  if (schema.anyOf) {
    if (!schema.anyOf.some(part => { try { checkSchema(value, part, location); return true; } catch { return false; } })) {
      throw new Error(location + ': 출력 형식이 올바르지 않습니다.');
    }
    return;
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type && !types.some(type => type === actual || type === 'integer' && Number.isInteger(value))) {
    throw new Error(location + ': 출력 자료형이 올바르지 않습니다.');
  }
  if (schema.enum && !schema.enum.includes(value)) throw new Error(location + ': 허용되지 않은 값입니다.');
  if (actual === 'object') {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) throw new Error(location + '.' + key + ': 필수 항목이 없습니다.');
    if (schema.additionalProperties === false && Object.keys(value).some(key => !Object.hasOwn(schema.properties || {}, key))) {
      throw new Error(location + ': 정해진 항목 외의 데이터가 포함되어 있습니다.');
    }
    for (const [key, child] of Object.entries(schema.properties || {})) if (Object.hasOwn(value, key)) checkSchema(value[key], child, location + '.' + key);
  }
  if (actual === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems || schema.maxItems !== undefined && value.length > schema.maxItems) {
      throw new Error(location + ': 항목 수가 올바르지 않습니다.');
    }
    if (schema.items) value.forEach((item, index) => checkSchema(item, schema.items, `${location}[${index}]`));
  }
}
class AiProvider {
  static get apiKey() { return apiKey(); }
  static get model() { return model(); }
  constructor(options = {}) {
    if (viaCore()) {
      this.responses = { create: request => require('./core-bridge').call(request) };
      return;
    }
    if (provider() === 'openai') {
      const OpenAI = require('openai');
      const client = new OpenAI({ ...options, apiKey: apiKey() });
      this.responses = client.responses;
      return;
    }
    this.timeout = options.timeout || 180000;
    this.responses = { create: request => this.createGeminiResponse(request) };
  }
  async createGeminiResponse(request) {
    const key = apiKey();
    if (!key) throw problem('.env에 GEMINI_API_KEY를 입력해주세요.', 503, 'MISSING_API_KEY');
    if (!AI_ENDPOINTS?.gemini) throw new Error('api.js의 AI_ENDPOINTS 설정이 없습니다. 전환 스크립트를 실행해주세요.');
    const selectedModel = model().replace(/^models\//, '');
    if (!/^[A-Za-z0-9._-]+$/.test(selectedModel)) throw new Error('GEMINI_MODEL 값을 확인해주세요.');
    const schema = request.text?.format?.schema;
    if (!schema) throw new Error('AI 요청에 JSON 스키마가 없습니다.');
    const body = {
      systemInstruction: { parts: [{ text: request.instructions || '지정한 JSON 구조로 응답하세요.' }] },
      contents: [{ role: 'user', parts: [{ text: typeof request.input === 'string' ? request.input : JSON.stringify(request.input) }] }],
      generationConfig: {
        responseMimeType: 'application/json', responseJsonSchema: schema,
        maxOutputTokens: request.max_output_tokens || 12000,
      },
    };
    let response;
    try {
      response = await fetch(AI_ENDPOINTS.gemini + encodeURIComponent(selectedModel) + ':generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body), signal: AbortSignal.timeout(this.timeout), redirect: 'error',
      });
    } catch (error) {
      throw problem(error.name === 'TimeoutError' ? 'Gemini 응답 시간이 초과되었습니다. 기사 분량을 줄여 다시 시도해주세요.' : 'Gemini 서버에 연결하지 못했습니다.', 504, 'CONNECTION_ERROR');
    }
    let data;
    try { data = await response.json(); } catch { throw problem('Gemini 응답을 읽지 못했습니다.', 502, 'INVALID_RESPONSE'); }
    if (!response.ok) {
      const code = data.error?.status || 'API_ERROR';
      const message = response.status === 429 ? 'Gemini 사용 한도 또는 요청 제한에 도달했습니다. Google AI Studio의 사용량을 확인해주세요.' :
        response.status === 401 || response.status === 403 ? 'Gemini API 키 또는 프로젝트 사용 권한을 확인해주세요.' :
        response.status === 404 ? 'GEMINI_MODEL 값과 해당 모델 사용 권한을 확인해주세요.' :
        response.status === 400 ? 'Gemini 키·모델·JSON 요청 설정을 확인해주세요.' : 'Gemini 요청에 실패했습니다. 잠시 후 다시 시도해주세요.';
      throw problem(message, response.status, code);
    }
    const candidate = data.candidates?.[0];
    if (data.promptFeedback?.blockReason || ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(candidate?.finishReason)) {
      return { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Gemini가 이 요청을 처리하지 못했습니다.' }] }] };
    }
    if (candidate?.finishReason !== 'STOP') {
      return { status: 'incomplete', incomplete_details: { reason: candidate?.finishReason === 'MAX_TOKENS' ? 'max_output_tokens' : 'generation_incomplete' }, output: [] };
    }
    const text = (candidate.content?.parts || []).filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('');
    if (!text.trim()) throw problem('Gemini 응답에 텍스트가 없습니다.', 502, 'EMPTY_RESPONSE');
    let parsed;
    try { parsed = JSON.parse(text); checkSchema(parsed, schema); }
    catch { throw problem('Gemini 결과가 지정된 JSON 형식과 다릅니다. 다시 시도해주세요.', 502, 'INVALID_JSON_SCHEMA'); }
    return { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(parsed) }] }] };
  }
}
module.exports = AiProvider;
