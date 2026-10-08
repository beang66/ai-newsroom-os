// HTTP 전송 구현 — 실제 요청/응답을 다루는 유일한 파일.
//
// 호출 흐름: UI → web/src/api/index.js(전환 스위치) → http.js → 이 파일 → 코어
// 계약(어떤 라우트가 있는지)은 core-api.js 에 있고, 이 파일은 경로를 해석하지 않는다.
// UI 코드는 이 모듈을 직접 import 하지 말고 createAppApi()(index.js)를 쓴다.
// (경계 검사: scripts/check-api-boundary.mjs)

import { askLogin } from "./auth-gate.js";

export function createApi(base = "") {
  const url = (path) => base + path;

  async function json(path, payload, signal, retried = false) {
    const r = await fetch(url(path), {
      method: payload ? "POST" : "GET",
      headers: payload ? { "Content-Type": "application/json" } : {},
      body: payload ? JSON.stringify(payload) : undefined,
      signal,
    });
    const data = await r.json();
    if (!r.ok) {
      // 로그인이 필요하면 로그인 창을 열고, 로그인에 성공하면 같은 요청을 한 번만 다시 보낸다
      if (data.code === "AUTH_REQUIRED" && !retried && (await askLogin())) return json(path, payload, signal, true);
      throw Object.assign(Error(data.error || "요청을 완료하지 못했어요."), { status: r.status, code: data.code });
    }
    return data;
  }

  async function blob(path, signal) {
    const r = await fetch(url(path), { signal });
    if (!r.ok) {
      let data = {};
      try {
        data = await r.json();
      } catch {
        /* non-JSON error body */
      }
      throw Error(data.error || "요청을 완료하지 못했어요.");
    }
    return r.blob();
  }

  return {
    json,
    blob,
    photoPath: (id) => "/api/unsplash/photo/" + encodeURIComponent(id),
    trackPath: (id) => "/api/unsplash/photo/" + encodeURIComponent(id) + "/track",
  };
}
