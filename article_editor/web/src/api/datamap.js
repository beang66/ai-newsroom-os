// Data Map 이 코어와 대화하는 유일한 길. 코어에는 knowledge-map 라우트가 없어
// 이미 있는 latestArticle(GET /api/articles/latest)만 넘겨 "core-latest" 모드로 쓴다.
import { core } from "./core.js";
import { createDataMapApi } from "../features/data-map/api.js";

export const dataMapApi = createDataMapApi({
  mode: "core-latest",
  coreApi: { latestArticle: (signal) => core.latestArticle(signal) },
});
