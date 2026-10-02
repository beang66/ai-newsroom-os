// IPC 전송 — 출시용(pywebview 브리지). 지금은 쓰지 않고 자리만 잡아 둔다.
//
// 파이썬 쪽 계획: core/api.py 의 라우팅(do_GET/do_POST)을 그대로 재사용하는 얇은 브리지를
// 노출한다. 즉 경로 지식을 다시 구현하지 않는다.
//   bridge.core(path, payload)  -> JSON 결과 (없으면 예외/에러객체)
//   bridge.coreBytes(path)      -> 이미지 바이트의 base64 문자열
//
// 전환 방법: web/src/api/index.js 의 mode 를 "ipc" 로 바꾸는 것만으로 끝난다.
import { createCoreApi } from "./core-api.js";

export function createIpcCoreApi(bridge) {
  if (typeof bridge?.core !== "function" || typeof bridge?.coreBytes !== "function")
    throw Error("IPC 브리지에는 core/coreBytes 가 필요합니다.");
  return createCoreApi({
    json: (path, payload) => bridge.core(path, payload ?? null),
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
