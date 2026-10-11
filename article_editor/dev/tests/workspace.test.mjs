import { test } from "node:test";
import assert from "node:assert/strict";
import { destinations } from "../../../src/data/navigation.js";
import { formatArticleTime } from "../../../src/data/article.js";
import { readFile } from "node:fs/promises";
import { createCoreApi } from "../../../src/api/core-api.js";

test("six prototype destinations keep desk, map and archive separate", () => {
  assert.deepEqual(destinations.map((item) => item.id), ["desk", "writer", "interview", "convert", "map", "archive"]);
  assert.equal(new Set(destinations.map((item) => item.number)).size, 6);
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
