// Data Map 이 코어와 대화하는 유일한 길 — 코어 읽기 모델 GET /api/knowledge-map.
import { core } from "./core.js";
import { createDataMapApi } from "../features/data-map/api.js";

const META_KEY = "ai-newsroom.archive-explorer.meta.v1";

function withLocalLibrary(payload) {
  if (typeof localStorage === "undefined") return payload;
  try {
    const library = JSON.parse(localStorage.getItem(META_KEY) || "null");
    return library && typeof library === "object" ? { ...payload, library } : payload;
  } catch {
    return payload;
  }
}

export const dataMapApi = createDataMapApi({
  coreApi: {
    getKnowledgeMap: async (signal) => withLocalLibrary(await core.getKnowledgeMap(signal)),
    importKnowledgeFiles: (payload, signal) => core.importKnowledgeFiles(payload, signal),
    getKnowledgeFile: (id, signal) => core.getKnowledgeFile(id, signal),
    deleteKnowledgeFile: (id, signal) => core.deleteKnowledgeFile(id, signal),
  },
});
