import { insideCircle } from "./layout.js";

export const FILE_KINDS = new Set(["source", "audio", "note"]);

function fileKind(file) {
  if (
    file.type?.startsWith("audio/") ||
    /\.(mp3|m4a|wav|ogg)$/i.test(file.name)
  )
    return "audio";
  if (/\.(md|txt)$/i.test(file.name)) return "note";
  return "source";
}

// Demo-only metadata. File bytes never leave the browser or enter graph state.
export function addSessionFiles(
  graph,
  files,
  articleId,
  { idFactory = () => crypto.randomUUID(), date = new Date() } = {},
) {
  const article = graph.nodes.find((node) => node.id === articleId);
  if (!article || article.kind !== "article") return graph;
  const names = Array.from(files).filter((file) => file?.name);
  if (!names.length) return graph;
  const count = graph.nodes.filter(
    (node) => node.articleId === articleId,
  ).length;
  const nodes = names.map((file, index) => {
    const sequence = count + index;
    const angle = sequence * 2.3999632297;
    const position = insideCircle({
      x: article.x + Math.cos(angle) * (53 + (sequence % 4) * 10),
      y: article.y + Math.sin(angle) * (53 + (sequence % 4) * 10),
    });
    return {
      id: idFactory(),
      articleId,
      projectId: article.projectId,
      cluster: article.cluster,
      kind: fileKind(file),
      label: file.name,
      summary:
        "이 세션에서 추가한 파일입니다. 내용 분석과 원본 저장은 연결되지 않았습니다.",
      author: "내 파일",
      updated: date.toISOString().slice(0, 10).replaceAll("-", "."),
      tags: article.tags,
      pages: [],
      placeholder: false,
      sessionFile: { size: file.size, type: file.type || "" },
      ...position,
    };
  });
  return {
    ...graph,
    nodes: [...graph.nodes, ...nodes],
    edges: [
      ...graph.edges,
      ...nodes.map((node) => ({
        id: crypto.randomUUID(),
        source: articleId,
        target: node.id,
        relation: "article-material",
      })),
    ],
  };
}

// Deletes only the in-memory graph entry, never a file on disk or a server.
export function removeSessionFile(graph, id) {
  const node = graph.nodes.find((entry) => entry.id === id);
  if (!node || !FILE_KINDS.has(node.kind)) return graph;
  return {
    ...graph,
    nodes: graph.nodes.filter((entry) => entry.id !== id),
    edges: graph.edges.filter(
      (edge) => edge.source !== id && edge.target !== id,
    ),
  };
}
