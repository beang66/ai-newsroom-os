// 띄어쓰기만 바뀐 문장은 팩트체크 모델을 다시 부르지 않고, 단어가 바뀐 문장만 다시 부른다.
import assert from "node:assert/strict";
import { factcheckArticle } from "../../web/src/api/editorial.js";

let calls = 0;
globalThis.fetch = async (_url, opts) => {
  calls += 1;
  const nodes = JSON.parse(opts.body).nodes;
  return { ok: true, status: 200, json: async () => ({ results: nodes.map((n) => { const at = n.text.indexOf("동결"); return { node_id: n.id, status: "CONFLICT", claim: n.text, conflict_spans: at < 0 ? [] : [{ claim_start: at, claim_end: at + 2, evidence_start: 0, evidence_end: 2 }], evidence: { text: "인상했다" } }; }) }), text: async () => "" };
};

const cache = new Map();
const files = [{ id: "a", name: "a", text: "x" }];
await factcheckArticle("한국은행이 기준금리를 동결했다고 밝혔다.", files, cache);
assert.equal(calls, 1);
const text2 = "한국 은행이  기준금리를 동결했다고 밝혔다.";
const respaced = await factcheckArticle(text2, files, cache);
assert.equal(calls, 1, "띄어쓰기만 바뀌면 다시 판정하지 않는다");
assert.equal(respaced.length, 1);
const sp = respaced[0].spans[0];
assert.equal(text2.slice(sp.start, sp.end), "동결", "하이라이트가 같은 단어를 가리킨다");
await factcheckArticle("한국은행이 기준금리를 인상했다고 밝혔다.", files, cache);
assert.equal(calls, 2, "단어가 바뀌면 다시 판정한다");
console.log("PASS respace-cache: 띄어쓰기 변경은 재판정 없음, 단어 변경은 재판정");
