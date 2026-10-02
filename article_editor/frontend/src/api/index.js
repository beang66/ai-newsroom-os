// 코어 연결 지점 — **여기 하나만** 있다. UI 코드는 이 함수가 돌려주는 객체만 쓴다.
//
//   지금(개발) : HTTP  →  http://127.0.0.1:<포트>  (개발 편의: 브라우저에서도 동작)
//   출시(IPC)  : pywebview 브리지 (포트 없음)
//
// 전환은 아래 mode 한 곳만 바꾸면 된다(계약·UI·코어 변경 없음):
//   createAppApi({ mode: "ipc" })   또는   createAppApi({ mode: "auto" })
// "auto" 는 창 안에서 pywebview 브리지가 보이면 IPC, 아니면 HTTP(브라우저 개발 모드).
import { createHttpCoreApi } from "./http.js";
import { createIpcCoreApi } from "./ipc.js";

export function createAppApi({ base = "", mode = "http", bridge } = {}) {
  const ipcBridge =
    bridge ??
    (typeof window !== "undefined" ? window.pywebview?.api : undefined);
  if (mode !== "http" && ipcBridge) return createIpcCoreApi(ipcBridge);
  return createHttpCoreApi(base);
}
