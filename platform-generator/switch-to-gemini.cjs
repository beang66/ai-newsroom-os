// 현재 파일을 백업한 뒤 AI 연결 부분만 변경합니다. 키 값은 읽거나 출력하지 않습니다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = __dirname;
const names = ['ai-client.js', 'card-news-generator.js', 'instagram-generator.js', 'text-generator.js', 'draft-validator.js', 'photo-routes.js'];
const edits = [];
try {
  if (!fs.existsSync(path.join(root, 'server.js'))) throw new Error('이 파일을 server.js가 있는 프로젝트 최상단에 넣어주세요.');
  if (!fs.existsSync(path.join(root, 'ai-provider.js'))) throw new Error('ai-provider.js 파일도 같은 폴더에 복사해주세요.');
  const apiName = 'public/api.js';
  let api = fs.readFileSync(path.join(root, apiName), 'utf8');
  if (!api.includes('AI_ENDPOINTS')) {
    const marker = 'module.exports = { PATHS, STORAGE_FOLDERS, getStorageRoot };';
    if (!api.includes(marker)) throw new Error('api.js 구조가 예상과 다릅니다. 앞서 전달한 내 문서 저장 버전을 먼저 적용하거나 현재 api.js를 보내주세요.');
    api = api.replace(marker, "const AI_ENDPOINTS = Object.freeze({ gemini: 'https://generativelanguage.googleapis.com/v1beta/models/' });\n    module.exports = { PATHS, STORAGE_FOLDERS, getStorageRoot, AI_ENDPOINTS };");
    edits.push([apiName, api]);
  }
  for (const name of names) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) throw new Error(name + ' 파일이 없습니다. 현재 프로젝트 파일을 확인해주세요.');
    let source = fs.readFileSync(file, 'utf8');
    const original = source;
    const migrated = /require\(['"]\.\/ai-provider['"]\)/.test(source);
    if (!migrated) {
      if (!/const\s+OpenAI\s*=\s*require\(['"]openai['"]\)/.test(source) || !source.includes('.responses.create') || source.includes('.chat.completions')) {
        throw new Error(name + '의 AI 호출 방식이 예상과 다릅니다. 파일을 보내주세요. 변경 전 상태로 중단합니다.');
      }
      source = source.replace(/require\(['"]openai['"]\)/g, 'require("./ai-provider")');
      source = source.replace(/process\.env\.OPENAI_API_KEY/g, 'OpenAI.apiKey').replace(/process\.env\.OPENAI_MODEL/g, 'OpenAI.model');
      source = '// Gemini/OpenAI 공통 어댑터 연결. OpenAI 변수 이름은 기존 코드와의 호환을 위해 유지합니다.\n' + source;
    }
    source = source.replace(/\.env의 OPENAI_API_KEY/g, '.env의 선택한 AI API 키').replace(/OpenAI API/g, 'AI API').replace(/OpenAI 요청/g, 'AI 요청');
    if (source !== original) edits.push([name, source]);
  }
  // Gemini 오류를 OpenAI 오류 문구로 덮어쓰지 않도록 사용자 안내도 연결합니다.
  for (const name of ['server.js', 'generate-routes.js', 'validation-routes.js']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    let source = fs.readFileSync(file, 'utf8'); const original = source;
    source = source.replace(/const message =/g, (match, offset, whole) => whole.slice(offset + match.length).trimStart().startsWith('error.provider') ? match : match + ' error.provider === "gemini" ? error.message :');
    source = source.replace(/OpenAI API/g, 'AI API').replace(/OpenAI 요청/g, 'AI 요청');
    if (source !== original) edits.push([name, source]);
  }
  for (const [name, source] of edits) new vm.Script(source, { filename: name });
  if (!edits.length) { console.log('이미 전환된 파일입니다. .env 설정 후 서버를 다시 실행해주세요.'); process.exit(0); }
  const backup = path.join(root, 'gemini-backup-' + new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(backup);
  for (const [name] of edits) {
    fs.mkdirSync(path.dirname(path.join(backup, name)), { recursive: true });
    fs.copyFileSync(path.join(root, name), path.join(backup, name));
  }
  try { for (const [name, source] of edits) fs.writeFileSync(path.join(root, name), source); }
  catch (error) { for (const [name] of edits) fs.copyFileSync(path.join(backup, name), path.join(root, name)); throw error; }
  console.log('Gemini 연결 수정 완료. 변경 파일:');
  edits.forEach(([name]) => console.log(' - ' + name));
  console.log('백업 폴더: ' + path.basename(backup));
  console.log('.env에 AI_PROVIDER=gemini, GEMINI_API_KEY, GEMINI_MODEL을 설정한 뒤 node server.js로 실행하세요.');
} catch (error) { console.error('전환 중단: ' + error.message); process.exitCode = 1; }
