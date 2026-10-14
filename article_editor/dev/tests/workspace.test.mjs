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

test("desk KPIs follow the four newsroom stages and the queue is sorted by deadline", async () => {
  const { DESK_STAGES, countByStage, deadlineQueue, focusStory } = await import("../../../src/data/desk.js");
  const items = [
    { id: "late", deadline: "15:30", stage: "송고 준비" },
    { id: "done", deadline: "07:30", stage: "출고 완료" },
    { id: "soon", deadline: "09:05", stage: "검증 대기" },
    { id: "mid", deadline: "11:20", stage: "편집 중" },
  ];
  assert.deepEqual(DESK_STAGES, ["편집 중", "검증 대기", "송고 준비", "출고 완료"]);
  assert.deepEqual(countByStage(items), [["편집 중", 1], ["검증 대기", 1], ["송고 준비", 1], ["출고 완료", 1]]);
  assert.deepEqual(deadlineQueue(items).map((item) => item.id), ["soon", "mid", "late"]);
  assert.equal(focusStory(items).id, "soon");
  assert.equal(focusStory([{ id: "done", deadline: "07:30", stage: "출고 완료" }]), null);
});

test("every desk next step opens a real destination", async () => {
  const { deskSchedule } = await import("../../../src/data/desk.js");
  const targets = new Set([...destinations.map((item) => item.id), "evidence"]);
  for (const item of deskSchedule) {
    if (item.next) assert.ok(targets.has(item.next.to), `${item.slug}: ${item.next.to}`);
    for (const issue of item.issues || []) assert.ok(targets.has(issue.to), `${issue.title}: ${issue.to}`);
  }
});

test("archive shows desk schedule samples read-only inside the 원고/송고 split", async () => {
  const { deskArchiveItems, deskSchedule } = await import("../../../src/data/desk.js");
  const items = deskArchiveItems();
  assert.equal(items.length, deskSchedule.length);
  assert.ok(items.every((item) => item.sample && item.id.startsWith("desk:") && !item.revision_no), "예시는 저장본이 아니어서 삭제·수정 대상이 아니다");
  assert.equal(items.filter((item) => item.state === "published").length, 13, "출고 완료는 송고로 분류");
  assert.ok(items.filter((item) => item.state !== "published").every((item) => item.stage !== "출고 완료"));
});

test("photo captions from outside sources cannot inject HTML into the article body", () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">&'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;");
  assert.equal(escapeHtml(undefined), "");
});
