import test from "node:test";
import assert from "node:assert/strict";
import { createDataMapApi } from "../src/api.js";
import { projectKnowledgeMap, projectLatestArticle } from "../src/domain/coreProjection.js";

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

test("future named Core method receives article scope and validates its response", async () => {
  let options;
  const api = createDataMapApi({
    mode: "api",
    coreApi: { getKnowledgeMap: async (input) => { options = input; return { entities: [], edges: [] }; } },
  });
  await api.getKnowledgeMap({ workspaceId, articleId });
  assert.equal(options.articleId, articleId);
  await assert.rejects(
    createDataMapApi({ mode: "api", coreApi: { getKnowledgeMap: async () => ({ nodes: [] }) } })
      .getKnowledgeMap({ workspaceId }),
    /KnowledgeMap/,
  );
  assert.deepEqual(projectLatestArticle({ draft: null }).nodes, []);
});
