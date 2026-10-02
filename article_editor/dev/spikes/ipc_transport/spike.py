"""IPC 전환 스파이크 — 무포트 로드(file/html)·브리지·외부 백엔드를 실측한다. README.md / docs/IPC_MIGRATION.md 참고."""
from __future__ import annotations

import base64, json, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[3]  # article_editor/ (dev/spikes/ipc_transport → 3단계 위)
SRC = APP_DIR / "app"  # 실행 코드
sys.path.insert(0, str(SRC))

import webview
from desktop import runtime, shell

INDEX = SRC / "frontend" / "index.html"
BACKEND_PORT = 8931


class Backend(BaseHTTPRequestHandler):
    seen = []
    def log_message(self, *_): pass
    def _cors(self):
        origin = self.headers.get("Origin")
        Backend.seen.append(origin)
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
    def do_OPTIONS(self):
        self.send_response(204); self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type, authorization")
        self.send_header("Access-Control-Max-Age", "600"); self.end_headers()
    def _reply(self, payload):
        body = json.dumps(payload).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self._cors(); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        self._reply({"backend": "fake", "path": self.path, "seenOrigin": self.headers.get("Origin"), "auth": self.headers.get("Authorization")})
    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", "0")))
        self._reply({"backend": "fake", "path": self.path, "seenOrigin": self.headers.get("Origin")})


def start_backend():
    server = ThreadingHTTPServer(("127.0.0.1", BACKEND_PORT), Backend)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def poll_js(name, body):
    return ("JSON.stringify((() => { const s = (window.__spike = window.__spike || {});"
            " if (s.NAME !== undefined) return s.NAME; s.NAME = 'pending';"
            " (async () => { try { BODY } catch (e) { s.NAME = 'error:' + e.message; } })();"
            " return s.NAME; })())").replace("NAME", name).replace("BODY", body)


JS_ENV = ("JSON.stringify((() => ({ href: location.href, origin: location.origin,"
          " idb: typeof indexedDB, print: typeof window.print,"
          " componentUpgraded: !!customElements.get('article-workspace'),"
          " bridge: !!(window.pywebview && window.pywebview.api) }))())")

JS_IDB = poll_js("idb", "const o = () => new Promise((ok, no) => { const r = indexedDB.open('spike-db', 1);"
  " r.onupgradeneeded = () => r.result.createObjectStore('m'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });"
  " const d = await o();"
  " await new Promise((ok, no) => { const t = d.transaction('m', 'readwrite'); t.objectStore('m').put(new Date().toISOString(), 'k');"
  " t.oncomplete = ok; t.onerror = () => no(t.error); });"
  " const v = await new Promise((ok, no) => { const q = d.transaction('m', 'readonly').objectStore('m').get('k');"
  " q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); }); d.close();"
  " s.idb = { result: 'ok', value: v, origin: location.origin };")

JS_CORE = poll_js("core", "const r = await fetch('@CORE@/api/status'); s.core = { result: 'http' + r.status, body: await r.json() };")
JS_BACKEND = poll_js("backend", "const r = await fetch('@BACKEND@/api/status', { headers: { Authorization: 'Bearer spike-token' } });"
  " s.backend = { result: 'http' + r.status, body: await r.json() };")

JS_B_SMALL = poll_js("bSmall", "const t = performance.now(); const p = await window.pywebview.api.ping(); s.bSmall = { result: p, ms: Math.round(performance.now() - t) };")
JS_B_UP = poll_js("bUp", "const big = 'A'.repeat(15 * 1024 * 1024); const t = performance.now();"
  " const n = await window.pywebview.api.echo(big); s.bUp = { ok: n === big.length, chars: n, ms: Math.round(performance.now() - t) };")
JS_B_DOWN = poll_js("bDown", "const t = performance.now(); const text = await window.pywebview.api.make(15 * 1024 * 1024);"
  " s.bDown = { chars: text.length, ms: Math.round(performance.now() - t) };")

JS_BLOCK_START = ("JSON.stringify((() => { const s = (window.__spike = window.__spike || {}); if (s.block) return s.block;"
  " s.ticks = 0; s.t0 = performance.now(); s.block = 'running';"
  " s.timer = setInterval(() => { s.ticks += 1; }, 16);"
  " window.pywebview.api.sleep(5).then((r) => { clearInterval(s.timer);"
  " s.block = { result: r, ms: Math.round(performance.now() - s.t0), ticks: s.ticks }; }); return 'started'; })())")

JS_BLOCK_POLL = ("JSON.stringify((() => { const s = (window.__spike = window.__spike || {});"
  " return { state: s.block, ticks: s.ticks, elapsed: Math.round(performance.now() - (s.t0 || 0)) }; })())")


class Bridge:
    def ping(self): return "pong"
    def sleep(self, seconds):
        time.sleep(float(seconds)); return "slept " + str(seconds) + "s"
    def echo(self, text): return len(text)
    def make(self, size): return base64.b64encode(b"\x89PNG" + b"\x00" * (int(size) - 4)).decode()


def wait(window, script, seconds=30):
    end = time.time() + seconds
    last = None
    while time.time() < end:
        raw = window.evaluate_js(script)
        try: value = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, ValueError): value = None
        last = value
        if value and value != "pending" and not (isinstance(value, dict) and value.get("state") == "running"):
            return value
        time.sleep(.3)
    return last if last is not None else "timeout"


def main():
    mode = sys.argv[sys.argv.index("--mode") + 1] if "--mode" in sys.argv else "http"
    out = {"mode": mode}
    core = runtime.start_server()
    backend = start_backend()
    core_url = "http://127.0.0.1:" + str(core.port) + "/index.html"
    bridge = Bridge() if mode == "bridge" else None
    page = {"url": INDEX.as_uri()} if mode == "file" else ({"html": INDEX.read_text(encoding="utf-8")} if mode == "html" else {"url": core_url})

    def runner(window):
        try:
            out["env"] = wait(window, JS_ENV, 20)
            out["idb"] = wait(window, JS_IDB, 20)
            out["core"] = wait(window, JS_CORE.replace("@CORE@", "http://127.0.0.1:" + str(core.port)), 20)
            out["backend"] = wait(window, JS_BACKEND.replace("@BACKEND@", "http://127.0.0.1:" + str(BACKEND_PORT)), 20)
            if bridge:
                out["bridgeSmall"] = wait(window, JS_B_SMALL, 20)
                out["bridgeUp15MB"] = wait(window, JS_B_UP, 60)
                out["bridgeDown15MB"] = wait(window, JS_B_DOWN, 60)
                window.evaluate_js(JS_BLOCK_START)
                out["uiDuring5s"] = wait(window, JS_BLOCK_POLL, 20)
        except Exception as error:
            out["runnerError"] = type(error).__name__ + ": " + str(error)
        finally:
            window.destroy()

    try:
        window = webview.create_window("ipc-spike", js_api=bridge, width=1000, height=760, **page)
        webview.start(runner, args=(window,), private_mode=False, storage_path=str(shell.storage_dir()))
    finally:
        core.stop(); backend.shutdown(); backend.server_close()
        out["backendOriginsSeen"] = Backend.seen
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())