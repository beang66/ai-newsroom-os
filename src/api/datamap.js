// Data Map 이 코어와 대화하는 유일한 길 — 코어 읽기 모델 GET /api/knowledge-map.
import { core } from "./core.js";
import { createDataMapApi } from "../features/data-map/api.js";

export const dataMapApi = createDataMapApi({
  coreApi: {
    knowledgeMap: (signal) => core.knowledgeMap(signal),
    importKnowledgeFiles: (payload, signal) => core.importKnowledgeFiles(payload, signal),
    getKnowledgeFile: (id, signal) => core.getKnowledgeFile(id, signal),
    deleteKnowledgeFile: (id, signal) => core.deleteKnowledgeFile(id, signal),
  },
});
