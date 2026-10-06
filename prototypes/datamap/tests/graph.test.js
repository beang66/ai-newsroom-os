import test from "node:test";
import assert from "node:assert/strict";
import { createFixture } from "../src/data/fixture.js";
import {
  indexGraph,
  getContext,
  rankRelated,
  filterNodes,
} from "../src/domain/graph.js";
import { createDataMapApi, createHttpRequest } from "../src/api.js";
import { addSessionFiles, removeSessionFile } from "../src/domain/files.js";
import { MAP_CENTER, MAP_RADIUS } from "../src/domain/layout.js";
const graph = createFixture(),
  index = indexGraph(graph);
test("deterministic radial graph has unique finite nodes, valid deduplicated edges", () => {
  assert.equal(graph.nodes.length, 520);
  assert.deepEqual(createFixture(), graph);
  assert.equal(new Set(graph.nodes.map((n) => n.id)).size, graph.nodes.length);
  assert.equal(new Set(graph.edges.map((e) => e.id)).size, graph.edges.length);
  assert.ok(graph.edges.length > 1200);
  for (const n of graph.nodes)
    assert.ok(
      Number.isFinite(n.x) &&
        Number.isFinite(n.y) &&
        Math.hypot(n.x - MAP_CENTER.x, n.y - MAP_CENTER.y) <=
          MAP_RADIUS + 0.001,
    );
  for (const e of graph.edges)
    assert.ok(index.byId.has(e.source) && index.byId.has(e.target));
});
test("file add/remove changes only the session graph and its incident links", () => {
  let nextId = 0;
  const added = addSessionFiles(
    graph,
    [
      { name: "취재녹음.wav", size: 2048, type: "audio/wav" },
      { name: "현장자료.pdf", size: 5120, type: "application/pdf" },
    ],
    "a0",
    { idFactory: () => String(++nextId), date: new Date("2026-10-05") },
  );
  assert.equal(graph.nodes.length, 520);
  assert.equal(added.nodes.length, 522);
  assert.equal(added.edges.length, graph.edges.length + 2);
  assert.deepEqual(
    added.nodes.slice(-2).map((node) => node.kind),
    ["audio", "source"],
  );
  assert.ok(added.nodes.slice(-2).every((node) => !node.pages.length));
  const removed = removeSessionFile(added, "upload-1");
  assert.equal(removed.nodes.length, 521);
  assert.ok(
    !removed.edges.some(
      (edge) => edge.source === "upload-1" || edge.target === "upload-1",
    ),
  );
  assert.equal(removeSessionFile(graph, "a0"), graph);
});
test("article highlights every derived material and keeps indirect context disjoint", () => {
  const { direct, indirect } = getContext("a0", index);
  for (const n of graph.nodes.filter((n) => n.articleId === "a0"))
    assert.ok(direct.has(n.id));
  for (const id of direct) assert.ok(!indirect.has(id));
  assert.ok(indirect.size > 0);
  assert.equal(getContext("missing", index).direct.size, 0);
});
test("cross-project bridges connect only meaningfully related nodes", () => {
  const bridges = graph.edges.filter(
    (edge) => edge.relation === "cross-project",
  );
  assert.ok(bridges.length >= 50);
  assert.ok(
    bridges.some((edge) => index.byId.get(edge.source).kind !== "article"),
  );
  for (const edge of bridges) {
    const source = index.byId.get(edge.source);
    const target = index.byId.get(edge.target);
    assert.notEqual(source.projectId, target.projectId);
    assert.equal(source.kind, target.kind);
    assert.equal(source.placeholder, false);
    assert.equal(target.placeholder, false);
    assert.deepEqual(
      edge.sharedTags,
      source.tags.filter((tag) => target.tags.includes(tag)),
    );
    assert.ok(edge.sharedTags.length > 0);
  }
  const materialBridge = bridges.find((edge) =>
    [edge.source, edge.target].some(
      (id) => index.byId.get(id).kind === "source",
    ),
  );
  const linked = index.byId.get(materialBridge.target);
  const { files, projects } = rankRelated(
    index.byId.get(materialBridge.source),
    graph,
    index,
  );
  assert.equal(files.find((file) => file.id === linked.id).priority, "direct");
  assert.ok(projects.some((project) => project.id === linked.projectId));
});
test("direct files rank above indirect files and owning project comes first", () => {
  const { files, projects } = rankRelated(index.byId.get("a0"), graph, index);
  assert.equal(projects[0].id, "p-ai");
  assert.ok(files.some((f) => f.priority === "related"));
  assert.ok(files[0].priority === "direct");
  assert.ok(files.every((f) => !f.placeholder));
  for (let i = 1; i < files.length; i++)
    assert.ok(files[i - 1].score >= files[i].score);
  assert.deepEqual(rankRelated(index.byId.get("a0-n50"), graph, index), {
    projects: [],
    files: [],
  });
});
test("search, project, kind and meaningful-only filtering compose", () => {
  const result = filterNodes(graph, {
    query: "김서윤",
    project: "p-ai",
    kind: "audio",
    showPlaceholders: false,
  });
  assert.equal(result.length, 2);
  assert.ok(result.every((n) => n.projectId === "p-ai" && n.kind === "audio"));
  assert.equal(filterNodes(graph, { query: "존재하지않는검색어" }).length, 0);
  assert.equal(filterNodes(graph, { showPlaceholders: false }).length, 104);
});
test("page and timestamp records have stable unique IDs", () => {
  const pages = graph.nodes.flatMap((n) => n.pages || []);
  assert.equal(new Set(pages.map((p) => p.id)).size, pages.length);
  assert.equal(index.byId.get("a0-n0").pages[0].locator, "00:00–02:14");
  assert.equal(index.byId.get("a0-n1").pages[0].locator, "p. 1");
  assert.equal(index.byId.get("a0-n50").pages.length, 0);
});
test("demo uses no server; real adapter requires explicit route and never falls back", async () => {
  assert.equal((await createDataMapApi().getKnowledgeMap()).meta.mode, "demo");
  await assert.rejects(
    createDataMapApi({ mode: "api" }).getKnowledgeMap(),
    /API/,
  );
  let received;
  const api = createDataMapApi({
    mode: "api",
    routes: { knowledgeMap: (id) => `/map/${id}` },
    request: async (route, options) => {
      received = { route, options };
      return graph;
    },
  });
  const controller = new AbortController();
  assert.equal(
    await api.getKnowledgeMap({
      workspaceId: "workspace",
      signal: controller.signal,
    }),
    graph,
  );
  assert.equal(received.route, "/map/workspace");
  assert.equal(received.options.signal, controller.signal);
  controller.abort();
  await assert.rejects(
    api.getKnowledgeMap({
      workspaceId: "workspace",
      signal: controller.signal,
    }),
    { name: "AbortError" },
  );
  await assert.rejects(
    createHttpRequest({ fetchImpl: async () => ({ ok: false, status: 503 }) })(
      "/map",
    ),
    /503/,
  );
});
