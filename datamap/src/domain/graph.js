export function indexGraph(graph) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const adjacent = new Map(graph.nodes.map((n) => [n.id, new Set()]));
  for (const e of graph.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    adjacent.get(e.source).add(e.target);
    adjacent.get(e.target).add(e.source);
  }
  return { byId, adjacent };
}
export function getContext(selectedId, index) {
  const direct = new Set(),
    indirect = new Set();
  if (!selectedId || !index.byId.has(selectedId)) return { direct, indirect };
  direct.add(selectedId);
  for (const id of index.adjacent.get(selectedId)) direct.add(id);
  for (const id of direct)
    for (const next of index.adjacent.get(id))
      if (!direct.has(next)) indirect.add(next);
  return { direct, indirect };
}
export function rankRelated(selected, graph, index) {
  if (!selected || selected.placeholder) return { projects: [], files: [] };
  const direct = index.adjacent.get(selected.id) || new Set();
  const bridgeIds = new Set(
    graph.edges
      .filter(
        (edge) =>
          edge.relation === "cross-project" &&
          (edge.source === selected.id || edge.target === selected.id),
      )
      .map((edge) => (edge.source === selected.id ? edge.target : edge.source)),
  );
  const files = graph.nodes
    .filter(
      (n) =>
        !n.placeholder &&
        n.id !== selected.id &&
        !["article", "person"].includes(n.kind),
    )
    .map((n) => {
      const common = n.tags.filter((t) => selected.tags.includes(t));
      const linked = direct.has(n.id),
        bridge = bridgeIds.has(n.id),
        sameArticle = Boolean(n.articleId && selected.articleId && n.articleId === selected.articleId),
        sameProject = Boolean(n.projectId && selected.projectId && n.projectId === selected.projectId);
      const score = Math.min(
        99,
        (bridge ? 72 : linked ? 65 : sameArticle ? 48 : sameProject ? 28 : 0) +
          common.length * 9,
      );
      const reason = bridge
        ? `프로젝트 간 직접 연결 · ${common.join(", ")}`
        : linked
          ? "직접 연결된 취재 자료"
          : sameArticle
            ? "같은 기사에서 파생"
            : sameProject
              ? "같은 프로젝트의 자료"
              : `공통 맥락 · ${common.join(", ")}`;
      return {
        ...n,
        score,
        reason,
        priority: linked || sameArticle ? "direct" : "related",
      };
    })
    .filter((n) => n.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const projects = graph.projects
    .map((p) => {
      const common = p.tags.filter((t) => selected.tags.includes(t));
      const bridgeCount = files.filter(
        (file) => file.projectId === p.id && bridgeIds.has(file.id),
      ).length;
      return {
        ...p,
        score:
          p.id === selected.projectId
            ? 100
            : Math.min(99, common.length * 22 + Math.min(bridgeCount, 3) * 16),
        reason:
          p.id === selected.projectId
            ? "이 노드가 속한 프로젝트"
            : bridgeCount
              ? `직접 연결된 자료 ${bridgeCount}개 · ${common.join(", ")}`
              : `공통 주제 · ${common.join(", ")}`,
      };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);
  return { projects, files };
}
export function filterNodes(
  graph,
  { query = "", project = "all", kind = "all", showPlaceholders = true } = {},
) {
  const q = query.trim().toLocaleLowerCase();
  return graph.nodes.filter(
    (n) =>
      (project === "all" || n.projectId === project) &&
      (kind === "all" || n.kind === kind) &&
      (showPlaceholders || !n.placeholder) &&
      (!q ||
        `${n.label} ${n.tags.join(" ")} ${n.author}`
          .toLocaleLowerCase()
          .includes(q)),
  );
}
