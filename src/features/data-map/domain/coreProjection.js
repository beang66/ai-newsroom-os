import { MAP_CENTER, insideCircle } from "./layout.js";

// 화면 그래프는 코어 읽기 모델(GET /api/knowledge-map, core/read_models.py)을 옮겨 그린 것이다.
// id 와 연결은 코어가 준 그대로 쓰고, 코어에 없는 관계(근거·유사도)는 만들지 않는다.
// 분류(category)는 constants.js 의 CATEGORIES — 코어가 준 종류와 노트 역할(role, 코어가 경로의 역할 폴더로 저장)·끊긴 링크로만 정한다.
// ponytail: 고정본(snapshots·has_snapshot)과 entities 는 아직 그리지 않는다 — 화면에서 쓸 곳이 생기면 노드 종류를 더한다.

function date(value) {
  return typeof value === "string" ? value.slice(0, 10).replaceAll("-", ".") : "";
}

// 관계망 중심(MAP_CENTER) 둘레에 황금각 나선으로 놓는다. 첫 노드는 중심에 온다.
// 노드 수에 맞춰 원 전체(점선 테두리 안쪽)에 고르게 펼친다.
function position(index, total) {
  if (index === 0) return { ...MAP_CENTER };
  const angle = (index * 2.399963229728653 + Math.PI) % (Math.PI * 2);
  const radius = 60 + 290 * Math.sqrt(index / Math.max(1, total - 1));
  return insideCircle({
    x: MAP_CENTER.x + Math.cos(angle) * radius,
    y: MAP_CENTER.y + Math.sin(angle) * radius,
  });
}

function node(id, kind, fields) {
  return {
    id,
    kind,
    author: "",
    tags: [],
    pages: [],
    projectId: null,
    placeholder: false,
    ...fields,
  };
}

export function projectKnowledgeMap(payload) {
  if (!payload || !Array.isArray(payload.articles) || !Array.isArray(payload.sources) || !Array.isArray(payload.edges))
    throw new Error("Core knowledge-map 응답 형식이 올바르지 않습니다.");
  const library = payload.library || {};
  const trashed = new Set(Array.isArray(library.trashed) ? library.trashed : []);
  const itemKey = (kind, id) => kind === "article" ? `article:${id.replaceAll("-", "")}`
    : kind === "source" ? `source:${id}`
      : kind === "audio" ? `audio:${id}`
        : kind === "note" ? `note:${id}` : null;
  const isTrashed = (kind, id) => trashed.has(itemKey(kind, id));
  const nodes = [];
  const byId = new Set();
  const add = (id, kind, fields) => {
    if (typeof id !== "string" || !id || byId.has(id)) return;
    byId.add(id);
    nodes.push(node(id, kind, fields));
  };
  for (const article of payload.articles) {
    if (isTrashed("article", article.id)) continue;
    add(article.id, "article", {
      category: "article",
      label: article.title || "제목 없는 기사",
      summary: article.subtitle || "",
      updated: date(article.updated_at),
      articleId: article.id,
    });
  }
  for (const source of payload.sources) {
    if (isTrashed("source", source.id)) continue;
    const chars = Number.isFinite(source.chars) ? `${source.chars.toLocaleString("ko-KR")}자` : "";
    add(source.id, "source", {
      category: "data",
      label: source.name || source.id,
      summary: [String(source.format || "").toUpperCase(), chars].filter(Boolean).join(" · "),
      updated: date(source.created_at),
      articleId: Array.isArray(source.used_by) ? source.used_by[0] || null : null,
    });
  }
  for (const interview of Array.isArray(payload.interviews) ? payload.interviews : []) {
    if (isTrashed("audio", interview.id)) continue;
    const minutes = Number.isFinite(interview.duration) ? `${Math.max(1, Math.round(interview.duration / 60))}분` : "";
    add(interview.id, "audio", {
      category: "interview",
      label: interview.filename || "녹취",
      summary: ["녹취", minutes].filter(Boolean).join(" · "),
      updated: date(interview.created_at),
      articleId: Array.isArray(interview.used_by) ? interview.used_by[0] || null : null,
    });
  }
  const fileLinks = (Array.isArray(payload.file_links) ? payload.file_links : [])
    .filter((link) => !isTrashed("note", link.source) && !isTrashed("note", link.target));
  const outgoingById = new Map();
  const backlinksById = new Map();
  for (const link of fileLinks) {
    if (!outgoingById.has(link.source)) outgoingById.set(link.source, []);
    outgoingById.get(link.source).push(link);
    if (link.resolved) {
      if (!backlinksById.has(link.target)) backlinksById.set(link.target, []);
      backlinksById.get(link.target).push(link);
    }
  }
  for (const file of Array.isArray(payload.files) ? payload.files : []) {
    if (isTrashed("note", file.id)) continue;
    add(file.id, "note", {
      category: file.role || "note",
      label: file.title || file.path || "제목 없는 노트",
      summary: file.path || "",
      updated: date(file.updated_at),
      path: file.path || "",
      outgoingCount: Number(file.outgoing_count) || 0,
      backlinkCount: Number(file.backlink_count) || 0,
      outgoing: outgoingById.get(file.id) || [],
      backlinks: backlinksById.get(file.id) || [],
    });
  }
  for (const missing of Array.isArray(payload.unresolved) ? payload.unresolved : [])
    add(missing.id, "note", {
      category: "missing",
      label: missing.label || "연결할 파일 없음",
      summary: "아직 가져오지 않은 Markdown 파일",
      placeholder: true,
      targetKey: missing.target_key || "",
      mentions: Number(missing.mentions) || 0,
      outgoing: [],
      backlinks: fileLinks.filter((link) => !link.resolved && link.target === missing.id),
    });
  const aliases = library.aliases || {};
  const tags = library.tags || {};
  const folderItems = library.folderItems || {};
  const favorites = new Set(library.favorites || []);
  for (const item of nodes) {
    const key = item.kind === "note" && item.placeholder ? null : itemKey(item.kind, item.id);
    if (!key) continue;
    item.itemKey = key;
    item.label = aliases[key] || item.label;
    item.tags = tags[key] || [];
    item.folderIds = folderItems[key] || [];
    item.favorite = favorites.has(key);
  }
  const seen = new Set();
  const edges = [];
  for (const edge of payload.edges) {
    if (!["uses_source", "uses_interview"].includes(edge?.relation) || !byId.has(edge.source) || !byId.has(edge.target)) continue;
    const id = `${edge.source}:${edge.target}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, source: edge.source, target: edge.target, relation: "article-source" });
  }
  for (const link of fileLinks) {
    if (!link?.resolved || link.relation !== "links_to" || !byId.has(link.source) || !byId.has(link.target)) continue;
    const id = `file:${link.source}:${link.target}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, source: link.source, target: link.target, relation: "links-to" });
  }
  // 끊긴 링크도 원문에 있는 실제 링크다 — 미확보 노드를 그 링크를 건 문서 곁에 두고 점선으로 그린다
  for (const link of fileLinks) {
    if (link?.resolved || !byId.has(link?.source) || !byId.has(link?.target)) continue;
    const id = `missing:${link.source}:${link.target}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, source: link.source, target: link.target, relation: "missing-link" });
  }
  nodes.forEach((n, i) => Object.assign(n, position(i, nodes.length)));
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
