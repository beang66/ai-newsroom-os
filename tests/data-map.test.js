import { test } from "node:test";
import assert from "node:assert/strict";
import { createDataMapApi, requestCloudTranscription } from "../src/api.js";
import {
  normalizeDataMap,
  selectVisible,
  safeSourceUrl,
} from "../src/features/data-map/model.js";

const fixture = {
  entities: [
    { id: "a", kind: "article" },
    { id: "c", kind: "claim", label: "수치 검증" },
    { id: "orphan", kind: "claim" },
    { id: "s", kind: "source", label: "인터뷰" },
  ],
  edges: [
    { source_id: "a", target_id: "c" },
    { source_id: "a", target_id: "orphan" },
    { source_id: "c", target_id: "s" },
  ],
};
test("partial graph retains claims but drops dangling relations and deduplicates", () => {
  const map = normalizeDataMap(
    {
      ...fixture,
      entities: [...fixture.entities, { id: "s", kind: "source" }],
      edges: [...fixture.edges, { source_id: "c", target_id: "gone" }],
    },
    "a",
  );
  assert.equal(map.nodes.length, 4);
  assert.equal(map.edges.length, 3);
  assert.deepEqual(
    map.missing.map((n) => n.id),
    ["orphan"],
  );
  assert.equal(map.warnings.length, 2);
});
test("filters remove incident edges; search retains context; missing filter preserves parent", () => {
  const map = normalizeDataMap(fixture, "a");
  const kinds = { claim: true, source: false, entity: true };
  const hidden = selectVisible(map, { kinds });
  assert.equal(hidden.edges.length, 2);
  assert.ok(!hidden.nodes.some((n) => n.id === "s"));
  const search = selectVisible(map, {
    kinds: { ...kinds, source: true },
    query: "인터뷰",
  });
  assert.deepEqual(
    search.nodes.map((n) => n.id),
    ["c", "s"],
  );
  const missing = selectVisible(map, { kinds, missingOnly: true });
  assert.deepEqual(
    missing.nodes.map((n) => n.id),
    ["a", "orphan"],
  );
});
test("malformed response rejected; foreign article excluded; unsafe original links blocked", () => {
  assert.throws(() => normalizeDataMap({}, "a"));
  assert.equal(
    normalizeDataMap(
      {
        ...fixture,
        entities: [
          ...fixture.entities,
          { id: "other", kind: "claim", article_id: "b" },
        ],
      },
      "a",
    ).nodes.length,
    4,
  );
  assert.equal(safeSourceUrl("javascript:alert(1)"), null);
  assert.equal(safeSourceUrl("file:///private"), null);
  assert.equal(
    safeSourceUrl("https://example.com/report#page=2"),
    "https://example.com/report#page=2",
  );
});
test("api uses scoped encoded GET and forwards signal", async () => {
  let received;
  const api = createDataMapApi({
    fetchImpl: async (url, options) => {
      received = { url, options };
      return new Response(JSON.stringify(fixture));
    },
  });
  assert.deepEqual(
    await api.getDataMap({ workspaceId: "w/a", articleId: "a&b" }),
    fixture,
  );
  assert.equal(
    received.url,
    "/v1/workspaces/w%2Fa/knowledge/map?article_id=a%26b",
  );
  assert.equal(received.options.method, "GET");
  assert.ok(received.options.signal instanceof AbortSignal);
});
test("api exposes error envelope and rejects HTML; no fixture fallback", async () => {
  const api = createDataMapApi({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "DENIED",
            message: "접근 불가",
            retryable: false,
            request_id: "r1",
          },
        }),
        { status: 403 },
      ),
  });
  await assert.rejects(
    api.getDataMap({ workspaceId: "w", articleId: "a" }),
    (e) =>
      e.status === 403 &&
      e.code === "DENIED" &&
      !e.retryable &&
      e.requestId === "r1",
  );
  const html = createDataMapApi({
    fetchImpl: async () => new Response("<html></html>"),
  });
  await assert.rejects(html.getDataMap({ workspaceId: "w", articleId: "a" }), {
    code: "INVALID_RESPONSE",
  });
  await assert.rejects(html.getDataMap({ articleId: "a" }), {
    code: "MISSING_CONTEXT",
  });
});
test("Core transport accepts same method; cancellation and timeout reject late IPC results", async () => {
  const api = createDataMapApi({
    transport: {
      json: async (path, payload) => {
        assert.ok(path.includes("knowledge/map"));
        assert.equal(payload, null);
        return fixture;
      },
    },
  });
  assert.deepEqual(
    await api.getDataMap({ workspaceId: "w", articleId: "a" }),
    fixture,
  );
  const slow = createDataMapApi({
    timeoutMs: 10,
    transport: { json: () => new Promise(() => {}) },
  });
  await assert.rejects(slow.getDataMap({ workspaceId: "w", articleId: "a" }), {
    name: "TimeoutError",
  });
  const controller = new AbortController();
  const pending = slow.getDataMap({
    workspaceId: "w",
    articleId: "a",
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("cloud transcription request is centralized and keeps the provider contract", async () => {
  const file = new Blob(["audio"], { type: "audio/webm" });
  const controller = new AbortController();
  let received;
  const data = await requestCloudTranscription({
    file,
    provider: "groq",
    apiKey: "test-key",
    signal: controller.signal,
    fetchImpl: async (url, options) => {
      received = { url, options };
      return new Response(JSON.stringify({ text: "완료" }));
    },
  });

  assert.deepEqual(data, { text: "완료" });
  assert.equal(
    received.url,
    "https://api.groq.com/openai/v1/audio/transcriptions",
  );
  assert.equal(received.options.method, "POST");
  assert.equal(received.options.headers.Authorization, "Bearer test-key");
  assert.equal(received.options.signal, controller.signal);
  assert.equal(
    await received.options.body.get("file").text(),
    await file.text(),
  );
  assert.equal(received.options.body.get("file").type, file.type);
  assert.equal(received.options.body.get("model"), "whisper-large-v3");
  assert.equal(received.options.body.get("language"), "ko");
  assert.equal(received.options.body.get("response_format"), "verbose_json");
});
