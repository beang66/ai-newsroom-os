// HTTP 전송 — 지금(개발 단계) 쓰는 transport.
// 실제 요청은 client.js 하나만 만들고, 이 파일은 계약(createCoreApi)에 연결만 한다.
import { createApi } from "./client.js";
import { createCoreApi } from "./core-api.js";

export function createHttpCoreApi(base = "") {
  const http = createApi(base);
  return createCoreApi({
    json: (path, payload, signal) => http.json(path, payload, signal),
    bytes: (path, signal) => http.blob(path, signal),
  });
}
