// Boundary between the Frontend and the App Core.
//
// Every HTTP request the UI makes to the core goes through this module.
// UI code must not call fetch() against the core directly. Swapping this
// for an IPC bridge later (desktop shell) requires no changes to the UI.

export function createApi(base = "") {
  const url = (path) => base + path;

  async function json(path, payload, signal) {
    const r = await fetch(url(path), {
      method: payload ? "POST" : "GET",
      headers: payload ? { "Content-Type": "application/json" } : {},
      body: payload ? JSON.stringify(payload) : undefined,
      signal,
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || "요청을 완료하지 못했어요.");
    return data;
  }

  async function blob(path, signal) {
    const r = await fetch(url(path), { signal });
    if (!r.ok) {
      let data = {};
      try {
        data = await r.json();
      } catch (_) {
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
