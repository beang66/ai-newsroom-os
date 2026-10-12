// IPC 전송 — pywebview 브리지(article_editor/app/desktop/ipc_bridge.py).
//
// 파이썬 쪽은 core/api.py 의 Handler 를 그대로 재사용하므로 경로·검증·오류 본문이 HTTP 와 같다.
//   bridge.core(path, payload)  -> { status, body }  (오류도 값으로 온다: code/details 를 잃지 않으려고)
//   bridge.coreBytes(path)      -> data URL 문자열 (실패하면 예외)
//
// 데스크톱 셸이 js_api 를 붙이면 index.js 의 mode "auto" 가 이 전송을 고른다.
import { askLogin } from "./auth-gate.js";
import { createCoreApi } from "./core-api.js";

export function createIpcCoreApi(bridge) {
  if (typeof bridge?.core !== "function" || typeof bridge?.coreBytes !== "function")
    throw Error("IPC 브리지에는 core/coreBytes 가 필요합니다.");
  async function json(path, payload, retried = false) {
    const { status, body } = await bridge.core(path, payload ?? null);
    if (status >= 200 && status < 300) return body;
    // client.js 와 같은 규칙: 로그인이 필요하면 로그인 창을 열고 성공하면 한 번만 다시 보낸다
    if (body.code === "AUTH_REQUIRED" && !retried && (await askLogin())) return json(path, payload, true);
    throw Object.assign(Error(body.error || "요청을 완료하지 못했어요."), { status, code: body.code });
  }
  return createCoreApi({
    json: (path, payload) => json(path, payload),
    bytes: async (path) => base64ToBlob(await bridge.coreBytes(path)),
  });
}

function base64ToBlob(text) {
  const comma = text.indexOf(",");
  const meta = comma >= 0 ? text.slice(0, comma) : "";
  const body = comma >= 0 ? text.slice(comma + 1) : text;
  const mime = /data:([^;]+)/.exec(meta)?.[1] || "image/jpeg";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
