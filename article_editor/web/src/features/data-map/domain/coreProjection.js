import { MAP_CENTER, insideCircle } from "./layout.js";

// 화면 그래프는 코어 읽기 모델(GET /api/knowledge-map, core/read_models.py)을 옮겨 그린 것이다.
// id 와 연결은 코어가 준 그대로 쓰고, 코어에 없는 관계(근거·유사도)는 만들지 않는다.
// ponytail: 고정본(snapshots·has_snapshot)과 entities 는 아직 그리지 않는다 — 화면에서 쓸 곳이 생기면 노드 종류를 더한다.

function date(value) {
  return typeof value === "string" ? value.slice(0, 10).replaceAll("-", ".") : "";
}

// 관계망 중심(MAP_CENTER) 둘레에 황금각 나선으로 놓는다. 첫 노드는 중심에 온다.
function position(index) {
  if (index === 0) return { ...MAP_CENTER };
  const angle = (index * 2.399963229728653 + Math.PI) % (Math.PI * 2);
  const radius = 80 + 18 * Math.sqrt(index);
  return insideCircle({
    x: MAP_CENTER.x + Math.cos(angle) * radius,
    y: MAP_CENTER.y + Math.sin(angle) * radius,
  });
}

function node(id, kind, index, fields) {
  return {
    id,
    kind,
    author: "",
    tags: [],
    pages: [],
    projectId: null,
    placeholder: false,
    ...position(index),
    ...fields,
  };
}

export function projectKnowledgeMap(payload) {
  if (!payload || !Array.isArray(payload.articles) || !Array.isArray(payload.sources) || !Array.isArray(payload.edges))
    throw new Error("Core knowledge-map 응답 형식이 올바르지 않습니다.");
  const nodes = [];
  const byId = new Set();
  const add = (id, kind, fields) => {
    if (typeof id !== "string" || !id || byId.has(id)) return;
    byId.add(id);
    nodes.push(node(id, kind, nodes.length, fields));
  };
  for (const article of payload.articles)
    add(article.id, "article", {
      label: article.title || "제목 없는 기사",
      summary: article.subtitle || "",
      updated: date(article.updated_at),
      articleId: article.id,
    });
  for (const source of payload.sources) {
    const chars = Number.isFinite(source.chars) ? `${source.chars.toLocaleString("ko-KR")}자` : "";
    add(source.id, "source", {
      label: source.name || source.id,
      summary: [String(source.format || "").toUpperCase(), chars].filter(Boolean).join(" · "),
      updated: date(source.created_at),
      articleId: Array.isArray(source.used_by) ? source.used_by[0] || null : null,
    });
  }
  const seen = new Set();
  const edges = [];
  for (const edge of payload.edges) {
    if (edge?.relation !== "uses_source" || !byId.has(edge.source) || !byId.has(edge.target)) continue;
    const id = `${edge.source}:${edge.target}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, source: edge.source, target: edge.target, relation: "article-source" });
  }
  return { nodes, edges, projects: [], meta: { mode: "knowledge-map", workspaceId: payload.workspace_id || null } };
}

// 코어 원고 id(32자리 hex) → 읽기 모델이 쓰는 하이픈 UUID 표기. 이미 하이픈이면 그대로.
export function articleUuid(id) {
  if (typeof id !== "string") return null;
  const hex = id.toLowerCase();
  return /^[0-9a-f]{32}$/.test(hex)
    ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    : hex;
}
