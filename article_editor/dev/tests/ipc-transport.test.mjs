// ipc.js 가 브리지의 {status, body} 를 HTTP 와 같은 규칙(성공=body, 실패=status/code 가 붙은 Error)으로 바꾸는지 확인한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createIpcCoreApi } from "../../../src/api/ipc.js";

const bridge = (reply) => ({ core: async (path, payload) => reply(path, payload), coreBytes: async () => "data:image/png;base64,AA==" });

test("성공 응답은 body 를 돌려준다", async () => {
  const api = createIpcCoreApi(bridge(() => ({ status: 200, body: { draft: null } })));
  assert.deepEqual(await api.latestArticle(), { draft: null });
});

test("실패 응답은 status 와 code 가 붙은 오류가 된다", async () => {
  const api = createIpcCoreApi(bridge(() => ({ status: 409, body: { error: "충돌", code: "REVISION_CONFLICT" } })));
  await assert.rejects(() => api.latestArticle(), (e) => e.message === "충돌" && e.status === 409 && e.code === "REVISION_CONFLICT");
});

test("바이트 호출은 Blob 을 돌려준다", async () => {
  const api = createIpcCoreApi(bridge(() => ({ status: 200, body: {} })));
  const blob = await api.mediaBytes("a".repeat(32));
  assert.equal(blob.type, "image/png");
});
