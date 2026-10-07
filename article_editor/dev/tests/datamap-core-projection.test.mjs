// Data Map 코어 투영(datamap/tests/core-projection.test.js 이식) — 데모 모드·fixture 없이 코어 응답 모양만 검사한다.
// 실행: node --test dev/tests/datamap-*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createDataMapApi } from "../../web/src/features/data-map/api.js";
import { projectKnowledgeMap, projectLatestArticle } from "../../web/src/features/data-map/domain/coreProjection.js";
import { MAP_CENTER, MAP_RADIUS } from "../../web/src/features/data-map/domain/layout.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const articleId = "f".repeat(32);
const sourceId = "a".repeat(16);

test("current Core latestArticle preserves legacy IDs and only explicit source links", async () => {
  const latest = { draft: {
    articleId, title: "초안", sources: [{ id: sourceId, name: "보고서.pdf", text: "자료" }],
  } };
  const api = createDataMapApi({ mode: "core-latest", coreApi: { latestArticle: async () => latest } });
  const map = await api.getKnowledgeMap({ workspaceId });
  assert.deepEqual(map.nodes.map((item) => item.id), [articleId, sourceId]);
  assert.deepEqual(map.edges.map(({ source, target }) => [source, target]), [[articleId, sourceId]]);
  assert.deepEqual(map.projects, []);
  assert.equal(map.nodes.some((item) => item.kind === "evidence"), false);
  assert.equal(map.meta.legacyIds, true);
  assert.equal(api.canSaveSourceRevision, false);
});

test("latest article projection stays inside the map circle and previews long source text", () => {
  const sources = Array.from({ length: 40 }, (_, i) => ({ id: i.toString(16).padStart(16, "0"), name: `자료 ${i}`, text: "가".repeat(1000) }));
  const map = projectLatestArticle({ draft: { articleId, title: "기사", sources } });
  assert.equal(map.nodes.length, 41);
  assert.deepEqual({ x: map.nodes[0].x, y: map.nodes[0].y }, MAP_CENTER);
  for (const n of map.nodes)
    assert.ok(Number.isFinite(n.x) && Math.hypot(n.x - MAP_CENTER.x, n.y - MAP_CENTER.y) <= MAP_RADIUS + 0.001);
  assert.ok(map.nodes[1].summary.length <= 401);
  assert.equal(new Set(map.nodes.map((n) => n.id)).size, map.nodes.length);
});

test("no saved article yields an empty map; malformed Core responses are rejected", async () => {
  assert.deepEqual(projectLatestArticle({ draft: null }).nodes, []);
  assert.throws(() => projectLatestArticle({ article: {} }), /최신 기사 응답/);
  assert.throws(() => projectLatestArticle({ draft: { title: "ID 없음", sources: [] } }), /ID/);
  const api = createDataMapApi({ coreApi: { latestArticle: async () => ({ draft: null }) } });
  assert.deepEqual((await api.getKnowledgeMap({ workspaceId })).nodes, []);
});

test("adapter has only the core-latest mode, needs an injected Core method and honours abort", async () => {
  assert.throws(() => createDataMapApi({ mode: "demo" }), /지원하지 않는 모드/);
  await assert.rejects(createDataMapApi().getKnowledgeMap(), /latestArticle/);
  await assert.rejects(createDataMapApi().saveSourceRevision({}), /수정본 저장/);
  let received;
  const api = createDataMapApi({ coreApi: { latestArticle: async (signal) => { received = signal; return { draft: null }; } } });
  const controller = new AbortController();
  await api.getKnowledgeMap({ signal: controller.signal });
  assert.equal(received, controller.signal);
  controller.abort();
  await assert.rejects(api.getKnowledgeMap({ signal: controller.signal }), { name: "AbortError" });
});

test("v0.8 bare KnowledgeMap has entities and edges without synthetic articles", () => {
  const one = "00000000-0000-4000-8000-000000000001";
  const two = "00000000-0000-4000-8000-000000000002";
  const map = projectKnowledgeMap({
    entities: [{ id: one, name: "인물", type: "person" }, { id: two, name: "기관", type: "organization" }],
    edges: [{ id: "edge", from_entity_id: one, to_entity_id: two, relation: "소속" },
      { id: "dangling", from_entity_id: one, to_entity_id: "missing" }],
  }, { workspaceId });
  assert.deepEqual(map.nodes.map((item) => item.id), [one, two]);
  assert.deepEqual(map.edges.map((item) => item.id), ["edge"]);
  assert.deepEqual(map.projects, []);
  assert.throws(() => projectKnowledgeMap({ nodes: [] }), /KnowledgeMap/);
});

test("agreed enrichment links Article/Source/Claim via shared IDs and SourceChunk", () => {
  const claimId = "00000000-0000-4000-8000-000000000003";
  const chunkId = "00000000-0000-4000-8000-000000000004";
  const map = projectKnowledgeMap({
    entities: [], edges: [],
    articles: [{ id: articleId, title: "기사" }],
    sources: [{ id: sourceId, title: "자료" }],
    source_chunks: [{ id: chunkId, source_id: sourceId, text: "원문", locator: "p. 3" }],
    claims: [{ id: claimId, article_id: articleId, text: "주장" }],
    evidence_links: [{ id: "evidence-link", claim_id: claimId, source_chunk_id: chunkId, relation: "support" }],
  });
  assert.equal(map.nodes.find((item) => item.id === sourceId).pages[0].id, chunkId);
  assert.ok(map.edges.some((item) => item.source === claimId && item.target === sourceId));
  assert.ok(map.edges.some((item) => item.source === articleId && item.target === claimId));
});
