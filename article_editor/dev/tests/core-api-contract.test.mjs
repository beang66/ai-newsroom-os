// 계약(OPENAPI_v0.8.yaml)의 operationId 중 구현된 것은 같은 이름의 호출이 있어야 한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCoreApi } from "../../../src/api/core-api.js";

const yaml = readFileSync(new URL("../../../docs/architecture/OPENAPI_v0.8.yaml", import.meta.url), "utf8");
const ops = [...yaml.matchAll(/operationId: (\w+)([^\n]*\n\s*x-status: deferred)?/g)];
const calls = [];
const api = createCoreApi({ bytes: async () => new Uint8Array(), json: async (route, body) => { calls.push([route, body]); return {}; } });

test("계약 operationId(미구현 표시 제외)는 core-api에 같은 이름으로 있다", () => {
  const missing = ops.filter((m) => !m[2] && typeof api[m[1]] !== "function").map((m) => m[1]);
  assert.deepEqual(missing, []);
});

test("추가된 호출이 기대한 경로로 나간다", async () => {
  await api.getJob("j1"); await api.cancelJob("j1"); await api.deleteSource("s1", { force: true });
  await api.getMediaAsset("m1"); await api.listSnapshots("a1"); await api.getSnapshot("x1");
  assert.deepEqual(calls.map((c) => c[0]), ["/api/jobs/j1", "/api/jobs/j1/cancel", "/api/sources/s1/delete", "/api/media-assets/m1", "/api/articles/a1/snapshots", "/api/snapshots/x1"]);
  assert.deepEqual(calls[2][1], { force: true });
});
