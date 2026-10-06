export const KINDS = { article: "기사", claim: "주장", source: "출처", entity: "인물·기관" };
export const STATUSES = { verified: "검증 완료", needs_review: "확인 필요", unverified: "미검증" };

/** Projection adapter: preserve domain IDs; never infer or persist new relations. */
export function normalizeDataMap(payload, articleId) {
  if (!Array.isArray(payload?.entities) || !Array.isArray(payload?.edges)) throw new Error("데이터맵 응답 형식이 올바르지 않습니다.");
  const warnings = [];
  const nodes = [];
  const ids = new Set();
  for (const row of payload.entities) {
    if (!row || typeof row.id !== "string" || !row.id || ids.has(row.id)) { warnings.push("ID가 없거나 중복된 항목을 제외했습니다."); continue; }
    const kind = String(row.kind || row.type || "entity").toLowerCase();
    if (!KINDS[kind]) { warnings.push("지원하지 않는 노드 유형을 제외했습니다."); continue; }
    if (row.article_id && row.article_id !== articleId || kind === "article" && row.id !== articleId) { warnings.push("다른 기사의 항목을 제외했습니다."); continue; }
    ids.add(row.id);
    nodes.push({ ...row, kind, label: String(row.label || row.title || row.claim_text || row.entity_name || "이름 없는 항목"),
      verification_status: STATUSES[row.verification_status] ? row.verification_status : "unverified" });
  }
  const edgeKeys = new Set();
  const edges = payload.edges.flatMap(row => {
    if (!row || !ids.has(row.source_id) || !ids.has(row.target_id)) { warnings.push("일부 관계의 연결 대상을 찾을 수 없습니다."); return []; }
    const from = nodes.find(n => n.id === row.source_id), to = nodes.find(n => n.id === row.target_id);
    if (!(from.kind === "article" && to.kind === "claim" || from.kind === "claim" && ["source", "entity"].includes(to.kind))) {
      warnings.push("MVP 범위 밖의 관계는 표시하지 않습니다."); return [];
    }
    const key = `${row.source_id}:${row.target_id}`;
    if (edgeKeys.has(key)) return [];
    edgeKeys.add(key);
    return [{ ...row, id: key }];
  });
  const evidence = (Array.isArray(payload.evidence_links) ? payload.evidence_links : []).filter(e => {
    if (!e || !ids.has(e.claim_id)) { warnings.push("주장이 없는 근거 항목을 제외했습니다."); return false; }
    return true;
  });
  const missing = nodes.filter(n => n.kind === "claim" && !edges.some(e => e.source_id === n.id && nodes.some(s => s.id === e.target_id && s.kind === "source")));
  return { nodes, edges, evidence, missing, warnings: [...new Set(warnings)], revisionId: payload.revision_id, snapshotId: payload.snapshot_id };
}

export function neighborhood(model, id) {
  return new Set([id, ...model.edges.flatMap(e => e.source_id === id ? [e.target_id] : e.target_id === id ? [e.source_id] : [])]);
}

export function selectVisible(model, { kinds, query = "", focusId, missingOnly = false }) {
  const neighbors = focusId ? neighborhood(model, focusId) : null;
  const matches = new Set(model.nodes.filter(n => `${n.label} ${n.kind} ${n.source_type || ""}`.toLowerCase().includes(query.toLowerCase())).map(n => n.id));
  const searchContext = query ? new Set([...matches].flatMap(id => [...neighborhood(model, id)])) : null;
  const missingContext = new Set(model.missing.flatMap(n => [...neighborhood(model, n.id)]));
  const nodes = model.nodes.filter(n => (n.kind === "article" || kinds[n.kind]) && (!neighbors || neighbors.has(n.id)) && (!searchContext || searchContext.has(n.id)) && (!missingOnly || missingContext.has(n.id)));
  const visibleIds = new Set(nodes.map(n => n.id));
  return { nodes, edges: model.edges.filter(e => visibleIds.has(e.source_id) && visibleIds.has(e.target_id)), matches };
}

export function safeSourceUrl(value) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export function locationLabel(location) {
  if (typeof location === "string") return location;
  if (!location) return "위치 정보 없음";
  if (location.page != null) return `${location.page}페이지`;
  if (location.start_ms != null) return `${Math.floor(location.start_ms / 60000)}:${String(Math.floor(location.start_ms / 1000) % 60).padStart(2, "0")}`;
  if (location.paragraph != null) return `본문 ${location.paragraph}문단`;
  return location.label || "위치 정보 없음";
}
