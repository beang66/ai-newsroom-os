import { projectKnowledgeMap } from "./domain/coreProjection.js";

// Data Map 데이터 어댑터 — 화면은 이 객체만 쓰고, 코어 호출은 주입받은 coreApi(web/src/api)가 한다.
// 코어 읽기 모델 knowledge-map(모든 기사·자료와 실제 연결) 하나만 읽는다.
export function createDataMapApi({ coreApi } = {}) {
  return {
    // 코어에 자료 수정본 저장 라우트가 없다.
    canSaveSourceRevision: false,
    async getKnowledgeMap({ signal } = {}) {
      signal?.throwIfAborted();
      if (typeof coreApi?.knowledgeMap !== "function")
        throw new Error("Core knowledgeMap 메서드를 연결해 주세요.");
      const payload = await coreApi.knowledgeMap(signal);
      signal?.throwIfAborted();
      return projectKnowledgeMap(payload);
    },
    async saveSourceRevision() {
      throw new Error("Core는 자료 수정본 저장을 지원하지 않습니다.");
    },
  };
}
