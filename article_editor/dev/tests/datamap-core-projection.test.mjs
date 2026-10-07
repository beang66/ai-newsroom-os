// Data Map 코어 투영 — 코어 읽기 모델(GET /api/knowledge-map, core/read_models.py) 응답 모양만 검사한다.
// 실행: node --test dev/tests/datamap-*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createDataMapApi } from "../../web/src/features/data-map/api.js";
import { articleUuid, projectKnowledgeMap } from "../../web/src/features/data-map/domain/coreProjection.js";
import { MAP_CENTER, MAP_RADIUS } from "../../web/src/features/data-map/domain/layout.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const articleHex = "f".repeat(32);
const articleId = articleUuid(articleHex);
const otherArticle = articleUuid("e".repeat(32));
const legacySource = "a".repeat(16);
const newSource = articleUuid("b".repeat(32));

// core/read_models.knowledge_map() 과 같은 모양
const payload = {
  workspace_id: workspaceId,
  generated_at: "2026-10-08T00:00:00+00:00",
  articles: [
    { id: articleId, title: "초안", subtitle: "부제", status: "작성 중", created_at: "2026-10-07T01:00:00+00:00",
      updated_at: "2026-10-08T01:00:00+00:00", revision_no: 3, revision_count: 3, source_ids: [legacySource, newSource] },
    { id: otherArticle, title: "", subtitle: "", status: "", created_at: "2026-10-06T01:00:00+00:00",
      updated_at: "2026-10-06T01:00:00+00:00", revision_no: 1, revision_count: 1, source_ids: [] },
  ],
  sources: [
    { id: legacySource, name: "보고서.pdf", format: "pdf", size: 10, chars: 12345, created_at: "2026-10-05T01:00:00+00:00", used_by: [articleId] },
    { id: newSource, name: "메모.txt", format: "txt", size: 3, chars: 3, created_at: "2026-10-04T01:00:00+00:00", used_by: [articleId] },
  ],
  snapshots: [{ id: "00000000-0000-4000-8000-000000000009", article_id: articleId, revision_id: "x", revision_no: 2, content_hash: "h", created_at: "t" }],
  entities: [],
  edges: [
    { source: articleId, target: legacySource, relation: "uses_source" },
    { source: articleId, target: newSource, relation: "uses_source" },
    { source: articleId, target: newSource, relation: "uses_source" },
    { source: articleId, target: "00000000-0000-4000-8000-000000000009", relation: "has_snapshot" },
    { source: articleId, target: "deleted-source", relation: "uses_source" },
  ],
};

test("knowledge-map projection keeps core ids and only real article→source links", () => {
  const map = projectKnowledgeMap(payload);
  assert.deepEqual(map.nodes.map((n) => [n.id, n.kind]), [
    [articleId, "article"], [otherArticle, "article"], [legacySource, "source"], [newSource, "source"],
  ]);
  assert.deepEqual(map.edges.map((e) => [e.source, e.target, e.relation]), [
    [articleId, legacySource, "article-source"], [articleId, newSource, "article-source"],
  ]);
  assert.deepEqual(map.projects, []);
  assert.equal(map.meta.workspaceId, workspaceId);
  const [article, untitled, pdf] = map.nodes;
  assert.equal(article.label, "초안");
  assert.equal(article.updated, "2026.10.08");
  assert.equal(untitled.label, "제목 없는 기사");
  assert.equal(pdf.summary, "PDF · 12,345자");
  assert.equal(pdf.articleId, articleId);
});

test("nodes stay inside the map circle with the first node centred", () => {
  const sources = Array.from({ length: 40 }, (_, i) => ({ id: i.toString(16).padStart(16, "0"), name: `자료 ${i}`, format: "txt", chars: 1, used_by: [] }));
  const map = projectKnowledgeMap({ ...payload, sources, edges: [] });
  assert.deepEqual({ x: map.nodes[0].x, y: map.nodes[0].y }, MAP_CENTER);
  for (const n of map.nodes)
    assert.ok(Number.isFinite(n.x) && Math.hypot(n.x - MAP_CENTER.x, n.y - MAP_CENTER.y) <= MAP_RADIUS + 0.001);
});

test("empty vault yields an empty map; malformed responses are rejected", () => {
  assert.deepEqual(projectKnowledgeMap({ articles: [], sources: [], edges: [] }).nodes, []);
  for (const bad of [null, {}, { articles: [], sources: [] }, { draft: null }])
    assert.throws(() => projectKnowledgeMap(bad), /knowledge-map/);
});

test("articleUuid matches the core read model id format", () => {
  assert.equal(articleUuid("ABCDEF0123456789abcdef0123456789"), "abcdef01-2345-6789-abcd-ef0123456789");
  assert.equal(articleUuid(articleId), articleId);
  assert.equal(articleUuid(undefined), null);
});

test("adapter needs an injected Core method, passes the signal and honours abort", async () => {
  await assert.rejects(createDataMapApi().getKnowledgeMap(), /knowledgeMap/);
  await assert.rejects(createDataMapApi().saveSourceRevision({}), /수정본 저장/);
  assert.equal(createDataMapApi().canSaveSourceRevision, false);
  let received;
  const api = createDataMapApi({ coreApi: { knowledgeMap: async (signal) => { received = signal; return payload; } } });
  const controller = new AbortController();
  assert.equal((await api.getKnowledgeMap({ signal: controller.signal })).nodes.length, 4);
  assert.equal(received, controller.signal);
  controller.abort();
  await assert.rejects(api.getKnowledgeMap({ signal: controller.signal }), { name: "AbortError" });
});
