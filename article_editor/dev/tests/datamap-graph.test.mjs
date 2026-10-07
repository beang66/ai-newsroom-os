// Data Map 그래프 도우미(datamap/tests/graph.test.js 이식). 원본은 520개 노드짜리 데모 fixture 를 썼다 —
// 앱에는 fixture 가 없으므로 여기서 검사용 작은 그래프를 직접 만든다(테스트 안에서만 쓰는 값).
// 실행: node --test dev/tests/datamap-*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { indexGraph, getContext, rankRelated, filterNodes } from "../../web/src/features/data-map/domain/graph.js";
import { FILE_KINDS } from "../../web/src/features/data-map/domain/files.js";
import { MAP_CENTER, MAP_RADIUS, insideCircle } from "../../web/src/features/data-map/domain/layout.js";

const n = (id, kind, extra = {}) => ({ id, kind, label: id, tags: [], author: "", pages: [], placeholder: false, articleId: null, projectId: null, x: 0, y: 0, ...extra });
const graph = {
  projects: [
    { id: "p1", name: "프로젝트 1", tags: ["AI"] },
    { id: "p2", name: "프로젝트 2", tags: ["전력"] },
  ],
  nodes: [
    n("a1", "article", { projectId: "p1", articleId: "a1", tags: ["AI"] }),
    n("s1", "source", { projectId: "p1", articleId: "a1", tags: ["AI"], label: "보고서", author: "김서윤" }),
    n("s2", "audio", { projectId: "p1", articleId: "a1", tags: ["AI", "전력"], author: "김서윤" }),
    n("s3", "note", { projectId: "p1", articleId: "a1", tags: [] }),
    n("a2", "article", { projectId: "p2", articleId: "a2", tags: ["전력"] }),
    n("t1", "source", { projectId: "p2", articleId: "a2", tags: ["전력", "AI"] }),
    n("ghost", "source", { projectId: "p2", placeholder: true, tags: ["AI"] }),
  ],
  edges: [
    { id: "e1", source: "a1", target: "s1", relation: "article-source" },
    { id: "e2", source: "a1", target: "s2", relation: "article-source" },
    { id: "e3", source: "a2", target: "t1", relation: "article-source" },
    { id: "e4", source: "s2", target: "t1", relation: "cross-project" },
    { id: "dangling", source: "a1", target: "missing", relation: "article-source" },
  ],
};
const index = indexGraph(graph);

test("index keeps only edges whose both ends exist", () => {
  assert.equal(index.byId.size, graph.nodes.length);
  assert.deepEqual([...index.adjacent.get("a1")].sort(), ["s1", "s2"]);
  assert.equal(index.adjacent.has("missing"), false);
});

test("direct and indirect context are disjoint and unknown selection is empty", () => {
  const { direct, indirect } = getContext("a1", index);
  assert.deepEqual([...direct].sort(), ["a1", "s1", "s2"]);
  assert.deepEqual([...indirect], ["t1"]);
  for (const id of direct) assert.ok(!indirect.has(id));
  assert.equal(getContext("missing", index).direct.size, 0);
  assert.equal(getContext(null, index).indirect.size, 0);
});

test("direct files rank above related ones, owning project first, placeholders excluded", () => {
  const { files, projects } = rankRelated(index.byId.get("a1"), graph, index);
  assert.equal(projects[0].id, "p1");
  assert.equal(files[0].priority, "direct");
  assert.ok(files.some((f) => f.priority === "related"));
  assert.ok(files.every((f) => !f.placeholder && f.kind !== "article"));
  for (let i = 1; i < files.length; i++) assert.ok(files[i - 1].score >= files[i].score);
  assert.deepEqual(rankRelated(index.byId.get("ghost"), graph, index), { projects: [], files: [] });
  assert.deepEqual(rankRelated(undefined, graph, index), { projects: [], files: [] });
});

test("cross-project bridge is ranked as a direct link", () => {
  const { files, projects } = rankRelated(index.byId.get("s2"), graph, index);
  const bridged = files.find((f) => f.id === "t1");
  assert.equal(bridged.priority, "direct");
  assert.match(bridged.reason, /프로젝트 간 직접 연결/);
  assert.ok(projects.some((p) => p.id === "p2"));
});

test("search, project, kind and placeholder filtering compose", () => {
  assert.deepEqual(filterNodes(graph, { query: "김서윤", project: "p1", kind: "audio" }).map((x) => x.id), ["s2"]);
  assert.equal(filterNodes(graph, { query: "존재하지않는검색어" }).length, 0);
  assert.equal(filterNodes(graph, { showPlaceholders: false }).length, graph.nodes.length - 1);
  assert.equal(filterNodes(graph).length, graph.nodes.length);
});

test("file kinds and map circle helpers", () => {
  assert.deepEqual([...FILE_KINDS].sort(), ["audio", "note", "source"]);
  const far = insideCircle({ x: MAP_CENTER.x + 10_000, y: MAP_CENTER.y });
  assert.ok(Math.abs(Math.hypot(far.x - MAP_CENTER.x, far.y - MAP_CENTER.y) - MAP_RADIUS) < 1e-9);
  assert.deepEqual(insideCircle(MAP_CENTER), MAP_CENTER);
});
