// Local review queue; editorial priority is user-assigned, not a relevance or fact-check score.
export function getReviewPriority(priorities, id) {
  return priorities?.[id] === "high" || priorities?.[id] === "later"
    ? priorities[id]
    : "normal";
}
export function sortForReview(items, priorities = {}) {
  const order = { high: 0, normal: 1, later: 2 };
  // Stable sorting retains graph-derived relevance within each user-selected bucket.
  return [...items].sort((a, b) =>
    order[getReviewPriority(priorities, a.id)] -
    order[getReviewPriority(priorities, b.id)]
  );
}
export function reviewPriorityStorageKey(workspaceId) {
  return `ai-newsroom:datamap-review:${encodeURIComponent(String(workspaceId || "local"))}`;
}
