// App Core 와의 줄 단위 JSON 통신(stdin/stdout). 코어가 첫 줄에 작업을 보내고, 외부 AI 호출은 이 프로세스가
// {"type":"ai","id":N,"request":{...}} 줄로 코어에 요청하면 코어가 {"type":"ai_result","id":N,...} 줄로 답한다.
const readline = require('readline');
let started = false;
let ended = false;
let nextId = 1;
const lines = [];
const waiters = [];
const pending = new Map();
function start() {
  if (started) return;
  started = true;
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', line => {
    let message = null;
    try { message = JSON.parse(line); } catch { /* 작업 입력 줄은 아래에서 처리 */ }
    if (message?.type === 'ai_result' && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.ok) item.resolve(message.response);
      else item.reject(Object.assign(new Error(message.error || 'AI 요청에 실패했습니다.'), { status: Number(message.status) || 502 }));
    } else if (waiters.length) waiters.shift()(line);
    else lines.push(line);
  });
  rl.on('close', () => {
    ended = true;
    for (const item of pending.values()) item.reject(Object.assign(new Error('App Core 연결이 끊어졌습니다.'), { status: 502 }));
    pending.clear();
    for (const wake of waiters.splice(0)) wake(null);
  });
}
// 코어가 보낸 첫 줄(작업 입력). 끝까지 없으면 null
function readInput() {
  start();
  return new Promise(resolve => {
    if (lines.length) resolve(lines.shift());
    else if (ended) resolve(null);
    else waiters.push(resolve);
  });
}
// OpenAI Responses 요청 하나를 코어에 맡기고 응답(OpenAI 와 같은 모양)을 받는다
function call(request) {
  start();
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    process.stdout.write(JSON.stringify({ type: 'ai', id, request }) + '\n');
  });
}
module.exports = { readInput, call };
