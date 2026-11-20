import test from "node:test";
import assert from "node:assert/strict";
import { getReviewPriority, sortForReview, reviewPriorityStorageKey } from "../../../src/features/data-map/domain/reviewPriority.js";

test("user-assigned review priority does not inherit graph relevance scores", () => {
  const files = [{ id: "a", score: 99 }, { id: "b", score: 2 }, { id: "c", score: 60 }];
  assert.deepEqual(sortForReview(files, { b: "high", a: "later" }).map((n) => n.id), ["b", "c", "a"]);
  assert.equal(getReviewPriority({ a: "invalid" }, "a"), "normal");
  assert.deepEqual(sortForReview(files, {}).map((n) => n.id), ["a", "b", "c"]);
});

test("review priorities are scoped to the current workspace", () => {
  assert.notEqual(reviewPriorityStorageKey("workspace-a"), reviewPriorityStorageKey("workspace-b"));
});
