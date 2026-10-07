// src/coreApiAdapter.js
/**
 * App Core HTTP API 어댑터 (코어가 실제로 제공하는 라우트만 노출).
 *   - latestArticle(signal?)  →  GET /api/articles/latest  →  { draft }
 *
 * 코어에는 knowledge-map / 자료 수정본 저장 라우트가 없으므로 만들지 않는다.
 * baseUrl 이 비어 있으면 같은 출처의 `/api`(Vite 프록시)로 요청한다.
 */
export function createCoreApiAdapter({ baseUrl = "" } = {}) {
  async function request(path, { method = "GET", body, signal } = {}) {
    const opts = { method, headers: { Accept: "application/json" }, signal };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const resp = await fetch(`${baseUrl}${path}`, opts);
    if (!resp.ok) {
      // 코어 오류 본문 형식: { "error": "..." }
      let message = "";
      try {
        message = (await resp.json())?.error || "";
      } catch {
        /* JSON 이 아닌 본문은 무시 */
      }
      throw new Error(message || `Core API 오류 (${resp.status})`);
    }
    return resp.json();
  }

  return {
    latestArticle: (signal) => request("/api/articles/latest", { signal }),
  };
}
