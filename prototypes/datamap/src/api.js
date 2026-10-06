import { createFixture } from "./data/fixture.js";
import { projectKnowledgeMap, projectLatestArticle } from "./domain/coreProjection.js";
// UI receives an adapter; no component owns a server route, fetch or DB client.
// HTTP paths must be supplied by the integrating application, not invented here.
export function createDataMapApi({ mode = "demo", request, routes, coreApi } = {}) {
  const revisionStorageKey = (workspaceId, sourceId) =>
    `newsroom:source-revisions:${workspaceId}:${sourceId}`;
  return {
    canSaveSourceRevision: mode === "demo" || Boolean(request && routes?.saveSourceRevision),
    async getKnowledgeMap({ workspaceId, articleId, signal } = {}) {
      signal?.throwIfAborted();
      if (mode === "core-latest") {
        if (typeof coreApi?.latestArticle !== "function")
          throw new Error("Core latestArticle 메서드를 연결해 주세요.");
        const latest = await coreApi.latestArticle(signal);
        signal?.throwIfAborted();
        return projectLatestArticle(latest, { workspaceId });
      }
      if (mode === "demo") {
        const graph = createFixture();
        const nodes = graph.nodes.map((node) => {
          const key = revisionStorageKey(
            workspaceId || "demo-workspace",
            node.id,
          );
          const revisions = JSON.parse(localStorage.getItem(key) || "[]");
          const latest = new Map(
            revisions.map((revision) => [revision.page_id, revision.changes]),
          );
          return latest.size
            ? {
                ...node,
                pages: node.pages?.map((page) => ({
                  ...page,
                  ...latest.get(page.id),
                })),
              }
            : node;
        });
        return { ...graph, nodes };
      }
      if (!workspaceId || (!coreApi?.getKnowledgeMap && (!request || !routes?.knowledgeMap)))
        throw new Error("작업공간과 데이터맵 API 어댑터를 연결해 주세요.");
      const result = coreApi?.getKnowledgeMap
        ? await coreApi.getKnowledgeMap({ workspaceId, articleId, signal })
        : await request(routes.knowledgeMap(workspaceId, articleId), {
            method: "GET",
            signal,
          });
      signal?.throwIfAborted();
      return projectKnowledgeMap(result, { workspaceId });
    },
    async saveSourceRevision({
      workspaceId = "demo-workspace",
      sourceId,
      pageId,
      changes,
    } = {}) {
      if (!sourceId || !pageId || !changes || typeof changes !== "object")
        throw new Error("자료 ID, 페이지 ID와 수정 내용을 확인해 주세요.");
      if (mode === "demo") {
        const key = revisionStorageKey(workspaceId, sourceId);
        const revisions = JSON.parse(localStorage.getItem(key) || "[]");
        const revision = {
          id: crypto.randomUUID(),
          source_id: sourceId,
          page_id: pageId,
          revision_no: revisions.length + 1,
          changes,
          created_at: new Date().toISOString(),
        };
        localStorage.setItem(key, JSON.stringify([...revisions, revision]));
        return revision;
      }
      if (!workspaceId || !request || !routes?.saveSourceRevision)
        throw new Error("자료 수정본 저장 API 어댑터를 연결해 주세요.");
      return request(routes.saveSourceRevision(workspaceId, sourceId), {
        method: "POST",
        signal: undefined,
        body: { source_chunk_id: pageId, changes },
      });
    },
  };
}
export function createHttpRequest({
  baseUrl = "",
  fetchImpl = globalThis.fetch,
} = {}) {
  return async (path, { signal, method = "GET", body } = {}) => {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      signal,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      credentials: "same-origin",
    });
    if (!response.ok)
      throw new Error(`자료를 불러올 수 없습니다. (${response.status})`);
    return response.json();
  };
}
export const dataMapApi = createDataMapApi();
