import { test } from "node:test";
import assert from "node:assert/strict";
import { destinations } from "../../../src/data/navigation.js";
import { formatArticleTime } from "../../../src/data/article.js";

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
