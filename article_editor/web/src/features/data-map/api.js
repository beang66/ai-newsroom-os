import { projectLatestArticle } from "./domain/coreProjection.js";

// Data Map 데이터 어댑터 — 화면은 이 객체만 쓰고, 코어 호출은 주입받은 coreApi(web/src/api)가 한다.
// 코어에는 knowledge-map 라우트가 없어 "core-latest"(가장 최근 저장 기사 + 그 취재자료) 한 가지 모드만 있다.
// 프로토타입의 demo 모드(합성 데이터)와 localStorage 수정본 저장은 옮기지 않았다.
export function createDataMapApi({ mode = "core-latest", coreApi } = {}) {
  if (mode !== "core-latest") throw new Error(`지원하지 않는 모드입니다: ${mode}`);
  return {
    // 코어에 자료 수정본 저장 라우트가 없다.
    canSaveSourceRevision: false,
    async getKnowledgeMap({ workspaceId, signal } = {}) {
      signal?.throwIfAborted();
      if (typeof coreApi?.latestArticle !== "function")
        throw new Error("Core latestArticle 메서드를 연결해 주세요.");
      const latest = await coreApi.latestArticle(signal);
      signal?.throwIfAborted();
      return projectLatestArticle(latest, { workspaceId });
    },
    async saveSourceRevision() {
      throw new Error("Core는 자료 수정본 저장을 지원하지 않습니다.");
    },
  };
}
