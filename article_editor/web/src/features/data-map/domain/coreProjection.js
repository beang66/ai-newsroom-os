import { MAP_CENTER, insideCircle } from "./layout.js";

// The UI graph is a projection of Core records. IDs and relationships are
// copied from Core; missing records never become synthetic "evidence".
const ENTITY_KIND = {
  person: "person",
  organization: "person",
  place: "person",
  event: "note",
  topic: "note",
  other: "note",
};

function date(value) {
  return typeof value === "string" ? value.slice(0, 10).replaceAll("-", ".") : "";
}

// 관계망 중심(MAP_CENTER) 둘레에 황금각 나선으로 놓는다. 첫 노드(기사)는 중심에 온다.
function position(index) {
  if (index === 0) return { ...MAP_CENTER };
  const angle = (index * 2.399963229728653 + Math.PI) % (Math.PI * 2);
  const radius = 80 + 18 * Math.sqrt(index);
  return insideCircle({
    x: MAP_CENTER.x + Math.cos(angle) * radius,
    y: MAP_CENTER.y + Math.sin(angle) * radius,
  });
}

function node(record, kind, index, total, extra = {}) {
  return {
    id: record.id,
    kind,
    label: record.label || record.name || record.title || record.text || record.id,
    summary: record.summary || record.text || "",
    author: record.author || "",
    updated: date(record.updated_at || record.created_at),
    tags: Array.isArray(record.tags) ? record.tags : [],
    pages: [],
    projectId: record.project_id || null,
    articleId: record.article_id || null,
    placeholder: false,
    ...position(index),
    ...extra,
  };
}

export function projectKnowledgeMap(payload, { workspaceId } = {}) {
  if (!payload || !Array.isArray(payload.entities) || !Array.isArray(payload.edges))
    throw new Error("Core KnowledgeMap 응답 형식이 올바르지 않습니다.");
  for (const key of ["articles", "sources", "source_chunks", "claims", "evidence_links", "article_sources", "projects"])
    if (payload[key] != null && !Array.isArray(payload[key]))
      throw new Error(`Core KnowledgeMap ${key} 형식이 올바르지 않습니다.`);
  const nodes = [];
  const byId = new Map();
  const add = (record, kind, extra) => {
    if (!record?.id || byId.has(record.id)) return;
    const item = node(record, kind, nodes.length, 1, extra);
    nodes.push(item);
    byId.set(item.id, item);
  };
  for (const item of payload.articles || [])
    add(item, "article", { articleId: item.id });
  for (const item of payload.sources || []) {
    const chunks = (payload.source_chunks || []).filter((chunk) => chunk.source_id === item.id);
    add(item, item.kind === "note" ? "note" : "source", {
      pages: chunks.map((chunk) => ({
        id: chunk.id,
        locator: chunk.locator || "",
        title: chunk.title || item.title || item.name,
        text: chunk.text || "",
      })),
    });
  }
  for (const item of payload.claims || [])
    add(item, "evidence", { articleId: item.article_id || null });
  for (const item of payload.entities)
    add(item, ENTITY_KIND[item.type] || "note");

  const edges = [];
  const seen = new Set();
  const link = (id, from, to, relation) => {
    if (!from || !to || !byId.has(from) || !byId.has(to)) return;
    const key = id || `${from}:${to}:${relation}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ id: key, source: from, target: to, relation: relation || "related" });
  };
  for (const edge of payload.edges)
    link(edge.id, edge.from_entity_id ?? edge.source_id, edge.to_entity_id ?? edge.target_id, edge.relation);
  for (const relation of payload.article_sources || [])
    link(relation.id, relation.article_id, relation.source_id, relation.role || "article-source");
  for (const evidence of payload.evidence_links || []) {
    const chunk = (payload.source_chunks || []).find((item) => item.id === evidence.source_chunk_id);
    link(evidence.id, evidence.claim_id, evidence.source_id || chunk?.source_id, evidence.relation);
  }
  for (const claim of payload.claims || [])
    link(null, claim.article_id, claim.id, "article-claim");

  const projects = (payload.projects || []).filter((item) => item?.id).map((item) => ({
    ...item,
    tags: Array.isArray(item.tags) ? item.tags : [],
  }));
  return { nodes, edges, projects, meta: { mode: "api", workspaceId } };
}

// 취재자료 본문은 수십 MB 일 수 있다 — 요약카드에는 앞부분만 싣는다.
const PREVIEW_CHARS = 400;
function preview(text) {
  if (typeof text !== "string") return "";
  return text.length > PREVIEW_CHARS ? text.slice(0, PREVIEW_CHARS).trimEnd() + "…" : text;
}

// feature/app-core@ef03e337 only exposes the latest draft. The source IDs
// embedded in that draft are legacy 16-hex IDs; they remain unchanged here.
export function projectLatestArticle(response, { workspaceId } = {}) {
  if (response && !Object.hasOwn(response, "draft"))
    throw new Error("Core 최신 기사 응답 형식이 올바르지 않습니다.");
  const draft = response?.draft;
  if (!draft) return { nodes: [], edges: [], projects: [], meta: { mode: "core-latest", workspaceId } };
  if (typeof draft.articleId !== "string" || !Array.isArray(draft.sources))
    throw new Error("Core 기사 또는 자료 ID가 없습니다.");
  const article = node({ id: draft.articleId, title: draft.title || draft.headline || "제목 없는 기사", updated_at: draft.savedAt }, "article", 0, 1, {
    articleId: draft.articleId,
    legacy_id: draft.articleId,
  });
  const nodes = [article];
  const edges = [];
  for (const source of draft.sources) {
    if (!source?.id || nodes.some((item) => item.id === source.id)) continue;
    nodes.push(node({ id: source.id, name: source.name, text: preview(source.text), created_at: source.addedAt }, "source", nodes.length, 1, {
      articleId: draft.articleId,
      legacy_id: source.id,
    }));
    edges.push({
      id: `${draft.articleId}:${source.id}`,
      source: draft.articleId,
      target: source.id,
      relation: "article-source",
    });
  }
  return { nodes, edges, projects: [], meta: { mode: "core-latest", workspaceId, legacyIds: true } };
}
