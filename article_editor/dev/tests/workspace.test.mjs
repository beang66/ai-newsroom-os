import { test } from "node:test";
import assert from "node:assert/strict";
import { destinations } from "../../../src/data/navigation.js";
import { formatArticleTime } from "../../../src/data/article.js";
import { readFile } from "node:fs/promises";
import { createCoreApi } from "../../../src/api/core-api.js";
import { escapeHtml } from "../../../src/lib/studioArticle.js";

test("six prototype destinations keep desk, map and archive separate", () => {
  assert.deepEqual(destinations.map((item) => item.id), ["desk", "writer", "interview", "convert", "map", "archive"]);
  assert.equal(new Set(destinations.map((item) => item.number)).size, 6);
});

test("URL route restores pages and authentication screens with a safe fallback", async () => {
  const { routeFromHash } = await import("../../../src/data/navigation.js");
  assert.equal(typeof routeFromHash, "function");
  assert.deepEqual(routeFromHash("#writer", "desk"), { page: "writer", auth: null });
  assert.deepEqual(routeFromHash("#settings", "desk"), { page: "settings", auth: null });
  assert.deepEqual(routeFromHash("#signup", "archive"), { page: "archive", auth: "signup" });
  assert.deepEqual(routeFromHash("#unknown", "archive"), { page: "archive", auth: null });
  assert.deepEqual(routeFromHash("#unknown", "unknown"), { page: "desk", auth: null });
});

test("stored UTC timestamps are shown in Korean time without changing unsaved local dates", () => {
  assert.equal(formatArticleTime("2026-10-11T11:12:00+00:00"), "2026-10-11 20:12");
  assert.equal(formatArticleTime("2026-10-11 20:12"), "2026-10-11 20:12");
  assert.equal(formatArticleTime(""), "아직 저장 전");
  assert.equal(formatArticleTime("T-invalid"), "날짜 확인 필요");
});

test("dirty drafts install close and background-save protection", async () => {
  const app = await readFile(new URL("../../../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /beforeunload/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /void flush\(\)/);
});

test("article saves send the loaded revision to prevent silent overwrites", async () => {
  let request;
  const api = createCoreApi({
    json: async (path, payload) => { request = { path, payload }; return { articleId: "a".repeat(32), revisionNo: 4 }; },
    bytes: async () => new Blob(),
  });
  await api.saveArticle({ articleId: "a".repeat(32), bodyHtml: "<p>x</p>" }, 3, true);
  assert.equal(request.path, "/api/articles/save");
  assert.equal(request.payload.expectedRevisionNo, 3);
  assert.equal(request.payload.replaceLatest, true);
});

test("desk counts, focus and checks come only from stored article facts", async () => {
  const { countByStage, deliveryPendingArticles, focusStory, issuesOf, writingStep, articlesInRange, nextAction } = await import("../../../src/data/desk.js");
  const base = { revision_no: 1, revision_count: 1, linkedSources: ["s"], linkedInterviews: [], snapshot_count: 0 };
  const items = [
    { ...base, id: "pub", state: "published", updated_at: "2026-10-18T01:00:00+00:00", snapshot_count: 1 },
    { ...base, id: "old", state: "draft", updated_at: "2026-10-17T01:00:00+00:00" },
    { ...base, id: "new", state: "editing", updated_at: "2026-10-18T02:00:00+00:00", unsaved_changes: true },
    { id: "unsaved", state: "draft", updated_at: "2026-10-18T03:00:00+00:00" }, // 저장 전(현재 원고)은 세지 않는다
    { ...base, id: "ready", state: "draft", updated_at: "2026-10-16T01:00:00+00:00", snapshot_count: 1 },
  ];
  assert.deepEqual(countByStage(items.filter((i) => i.revision_no)), [["편집 중", 0], ["검증 대기", 1], ["송고 준비", 1], ["출고 완료", 2]]);
  assert.equal(focusStory(items).id, "new", "송고를 마치지 않은 기사 중 가장 최근 것");
  assert.deepEqual(issuesOf(items[2]).map((i) => i.kind), ["save", "verify"]);
  assert.deepEqual(issuesOf({ ...base, linkedSources: [] }).map((i) => i.kind), ["evidence"]);
  assert.equal(writingStep(items[1]), 2, "자료·저장은 끝났고 고정본(검증)이 없다");
  assert.equal(writingStep(items[0]), 4);
  assert.deepEqual(articlesInRange(items, "2026-10-18").map((i) => i.id), ["new", "pub"], "서울 날짜 기준, 저장된 기사만");
  assert.equal(nextAction(items[1]).to, "evidence");
  assert.equal(focusStory([items[0]]), null);
  assert.deepEqual(deliveryPendingArticles(items).map((item) => item.id), ["unsaved", "new", "old", "ready"].filter((id) => id !== "unsaved"));
});

test("every desk action opens a real destination", async () => {
  const { issuesOf, nextAction } = await import("../../../src/data/desk.js");
  const targets = new Set([...destinations.map((item) => item.id), "evidence"]);
  const sample = { revision_no: 1, state: "editing", unsaved_changes: true, linkedSources: [] };
  for (const issue of issuesOf(sample)) assert.ok(targets.has(issue.to), issue.title);
  for (const step of [0, 1, 2, 3]) {
    const article = { revision_no: 1, state: step === 3 ? "draft" : "draft", linkedSources: step > 0 ? ["s"] : [], revision_count: step > 1 ? 1 : 0, snapshot_count: step > 2 ? 1 : 0 };
    assert.ok(targets.has(nextAction(article).to));
  }
});

test("desk metrics and pending delivery articles open the archive with a matching filter", async () => {
  const desk = await readFile(new URL("../../../src/components/DeskView.jsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../../../src/App.jsx", import.meta.url), "utf8");
  const archive = await readFile(new URL("../../../src/components/ArchiveView.jsx", import.meta.url), "utf8");
  assert.match(desk, /onArchive\(\{ scope: "type:article", stage: label \}\)/);
  assert.match(desk, /onArchive\(\{ scope: "type:article", stage: "pending" \}\)/);
  assert.match(desk, /송고 대기 기사/);
  assert.match(desk, /onOpen\(item\.id, "writer"\)/);
  assert.match(app, /dashboardFilter=\{archiveFilter\}/);
  assert.match(archive, /item\.deskStage !== deskStage/);
  assert.match(archive, /aria-label="데스크 단계 필터"/);
});

test("photo captions from outside sources cannot inject HTML into the article body", () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">&'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;");
  assert.equal(escapeHtml(undefined), "");
});
