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

const AGENCY_TAGS = new Set(["한국은행", "국가데이터처", "산업통상부", "고용노동부", "국토교통부", "금융감독원"]);
const TOPIC_RULES = [
  ["한국은행", ["한국은행", "한은"]],
  ["국가데이터처", ["국가데이터처", "통계청"]],
  ["산업통상부", ["산업통상부", "산업부"]],
  ["고용노동부", ["고용노동부"]],
  ["국토교통부", ["국토교통부"]],
  ["금융감독원", ["금융감독원", "금감원"]],
  ["성장·국민소득", ["성장률", "국민소득", "국민총소득", "gni", "gdp", "경제전망", "저축률", "경제 성장", "0.6% 성장", "2분기"]],
  ["수출·무역", ["수출", "수입", "수출입", "무역수지", "경상수지", "국제수지"]],
  ["반도체·제조업", ["반도체", "제조업", "자동차", "광학기기", "기계류", "산업활동", "기업경기", "컴퓨터", "생산"]],
  ["물가·소비", ["소비자물가", "생산자물가", "물가", "소비심리", "소비자동향", "온라인쇼핑", "민간소비", "소매판매", "소비", "내수", "거래"]],
  ["고용·노동", ["고용동향", "고용률", "취업자", "실업률", "사업체노동력", "종사자", "임금", "청년층"]],
  ["인구·사회", ["인구동향", "출생아", "합계출산율", "고령자", "사망원인", "사망자", "인구"]],
  ["외환·금융", ["외환보유액", "외화예금", "환율", "달러", "금리", "외국인", "증권투자", "주식", "채권"]],
  ["건설·부동산", ["주택통계", "주택", "인허가", "건설업", "건설투자", "토목건설", "부동산"]],
];

function normFilename(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\s_()（）[\]「」『』·.,/-]+/g, "")
    .toLowerCase();
}

function extractTagsFromText(text) {
  const lower = String(text || "").normalize("NFC").toLowerCase();
  const matched = [];
  for (const [label, keywords] of TOPIC_RULES) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      matched.push(label);
    }
  }
  return matched;
}

function folderOfPath(path) {
  const raw = String(path || "").normalize("NFC");
  const idx = raw.lastIndexOf("/");
  if (idx <= 0) return "";
  const dir = raw.slice(0, idx);
  const parts = dir.split("/");
  return (parts[parts.length - 1] || "").toLowerCase();
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
      outgoing: [...(outgoingById.get(file.id) || [])],
      backlinks: [...(backlinksById.get(file.id) || [])],
      coreTags: Array.isArray(file.tags) ? file.tags : [],
      primaryTags: Array.isArray(file.primary_tags) ? file.primary_tags : [],
      pdfRefs: Array.isArray(file.pdf_refs) ? file.pdf_refs : [],
      folderMentions: Array.isArray(file.folder_mentions) ? file.folder_mentions : [],
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
    const textTags = extractTagsFromText(`${item.label} ${item.summary} ${item.path || ""}`);
    const mergedTags = new Set([...(tags[key] || []), ...(item.coreTags || []), ...textTags]);
    item.tags = [...mergedTags];
    if (!item.primaryTags || !item.primaryTags.length) {
      item.primaryTags = textTags;
    } else {
      item.primaryTags = [...new Set([...item.primaryTags, ...textTags])];
    }
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

  // 명시적 위키링크 외에 원자료 참조·폴더 언급·공통 주제 태그로 연관된 노드들을 연결한다
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const seenPairs = new Set(edges.map((e) => [e.source, e.target].sort().join("::")));
  const addRelatedEdge = (sourceId, targetId, relation, reason = "") => {
    if (!sourceId || !targetId || sourceId === targetId || !byId.has(sourceId) || !byId.has(targetId)) return false;
    const pairKey = [sourceId, targetId].sort().join("::");
    if (seenPairs.has(pairKey)) return false;
    seenPairs.add(pairKey);
    const id = `rel:${sourceId}:${targetId}`;
    edges.push({ id, source: sourceId, target: targetId, relation });
    const srcNode = nodeMap.get(sourceId);
    const tgtNode = nodeMap.get(targetId);
    if (srcNode?.kind === "note" && tgtNode?.kind === "note" && !srcNode.placeholder && !tgtNode.placeholder) {
      const linkObj = {
        id: `rel:${sourceId}:${targetId}`,
        source: sourceId,
        target: targetId,
        resolved: true,
        relation: "links_to",
        kind: "related",
        raw_text: reason || tgtNode.label,
        target_ref: tgtNode.path || tgtNode.label,
      };
      srcNode.outgoing.push(linkObj);
      tgtNode.backlinks.push(linkObj);
      srcNode.outgoingCount = srcNode.outgoing.length;
      tgtNode.backlinkCount = tgtNode.backlinks.length;
    }
    return true;
  };

  const articleNodes = nodes.filter((n) => n.kind === "article");
  const sourceNodes = nodes.filter((n) => n.kind === "source");
  const noteNodes = nodes.filter((n) => n.kind === "note" && !n.placeholder);

  // 1. 원자료(PDF 등) ↔ 해당 원자료를 본문에 명시하거나 핵심 주제가 일치하는 취재 노트 연결
  for (const src of sourceNodes) {
    const normSrc = normFilename(src.label);
    const srcDomain = (src.primaryTags || []).filter((t) => !AGENCY_TAGS.has(t));
    for (const noteItem of noteNodes) {
      const matchedPdf = normSrc && Array.isArray(noteItem.pdfRefs) && noteItem.pdfRefs.some((ref) => ref === normSrc || ref.includes(normSrc) || normSrc.includes(ref));
      const commonDomain = srcDomain.filter((t) => (noteItem.primaryTags || []).includes(t));
      const commonAll = (src.tags || []).filter((t) => (noteItem.primaryTags || []).includes(t));
      if (matchedPdf || (commonDomain.length >= 1 && commonAll.length >= 2)) {
        addRelatedEdge(src.id, noteItem.id, "article-source");
        if (src.articleId) {
          addRelatedEdge(src.articleId, noteItem.id, "article-source");
        }
      }
    }
  }

  // 2. 기사 ↔ 핵심 주제를 공유하는 취재 노트 연결
  for (const art of articleNodes) {
    const artDomain = (art.primaryTags || []).filter((t) => !AGENCY_TAGS.has(t));
    if (!artDomain.length) continue;
    for (const noteItem of noteNodes) {
      const noteDomain = (noteItem.primaryTags || []).filter((t) => !AGENCY_TAGS.has(t));
      const sharedDomain = artDomain.filter((t) => noteDomain.includes(t));
      if (sharedDomain.length >= 2) {
        addRelatedEdge(art.id, noteItem.id, "article-source");
      }
    }
  }

  // 3. 본문에서 하위 폴더를 언급한 목차·개요 문서(README 등) 또는 상위 폴더 README.md ↔ 해당 폴더 노트 연결
  const notesByFolder = new Map();
  for (const noteItem of noteNodes) {
    const folder = folderOfPath(noteItem.path);
    if (!folder) continue;
    if (!notesByFolder.has(folder)) notesByFolder.set(folder, []);
    notesByFolder.get(folder).push(noteItem);
  }
  const indexNotes = new Set();
  for (const noteItem of noteNodes) {
    const normPath = String(noteItem.path || "").normalize("NFC").replace(/\\/g, "/");
    const lowerPath = normPath.toLowerCase();
    const isIndexFile = lowerPath.endsWith("/readme.md") || lowerPath.endsWith("/index.md") || lowerPath === "readme.md" || lowerPath === "index.md";
    if (isIndexFile && normPath.includes("/")) {
      const rootDir = normPath.slice(0, normPath.lastIndexOf("/") + 1).toLowerCase();
      const children = noteNodes.filter((other) => other.id !== noteItem.id && String(other.path || "").normalize("NFC").replace(/\\/g, "/").toLowerCase().startsWith(rootDir));
      if (children.length >= 2) {
        indexNotes.add(noteItem.id);
        for (const child of children) {
          addRelatedEdge(noteItem.id, child.id, "links-to", `세트 목차 · ${noteItem.label}`);
        }
      }
    }
    for (const mentionedFolder of noteItem.folderMentions || []) {
      for (const targetNote of notesByFolder.get(mentionedFolder) || []) {
        addRelatedEdge(noteItem.id, targetNote.id, "links-to", `폴더 참조 · ${mentionedFolder}`);
      }
    }
  }

  // 4. 취재 노트 상호 간 핵심 주제·발표기관 연관 연결 (노트당 상위 3개)
  const contentNotes = noteNodes.filter((n) => !indexNotes.has(n.id) && !(n.folderMentions && n.folderMentions.length >= 5));
  for (const noteA of contentNotes) {
    const aPrimaryDomain = (noteA.primaryTags || []).filter((t) => !AGENCY_TAGS.has(t));
    const aPrimaryAgency = (noteA.primaryTags || []).filter((t) => AGENCY_TAGS.has(t));
    const aAllDomain = (noteA.tags || []).filter((t) => !AGENCY_TAGS.has(t));
    if (!aPrimaryDomain.length && !aPrimaryAgency.length) continue;
    const candidates = [];
    for (const noteB of contentNotes) {
      if (noteA.id === noteB.id) continue;
      const bPrimaryDomain = (noteB.primaryTags || []).filter((t) => !AGENCY_TAGS.has(t));
      const bPrimaryAgency = (noteB.primaryTags || []).filter((t) => AGENCY_TAGS.has(t));
      const bAllDomain = (noteB.tags || []).filter((t) => !AGENCY_TAGS.has(t));
      const sharedPrimaryDomain = aPrimaryDomain.filter((t) => bPrimaryDomain.includes(t));
      const sharedPrimaryAgency = aPrimaryAgency.filter((t) => bPrimaryAgency.includes(t));
      const sharedAllDomain = aAllDomain.filter((t) => bAllDomain.includes(t));
      const score = sharedPrimaryDomain.length * 4 + sharedPrimaryAgency.length * 2 + sharedAllDomain.length;
      if (score >= 4 && (sharedPrimaryDomain.length >= 1 || (sharedPrimaryAgency.length >= 1 && sharedAllDomain.length >= 2))) {
        const sharedLabels = [...new Set([...sharedPrimaryDomain, ...sharedPrimaryAgency, ...sharedAllDomain])];
        candidates.push({ target: noteB, score, reason: `공통 맥락 · ${sharedLabels.slice(0, 3).join(", ")}` });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.target.id.localeCompare(b.target.id));
    for (const item of candidates.slice(0, 3)) {
      addRelatedEdge(noteA.id, item.target.id, "links-to", item.reason);
    }
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
