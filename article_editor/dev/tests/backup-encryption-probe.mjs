// 실제 브라우저(Edge) 프로필에서 강제 종료 대비 백업이 암호화돼 저장되는지 확인하는 탐침.
// 실행: node article_editor/dev/tests/backup-encryption-probe.mjs  — 표식 문장이 프로필 폴더에 평문으로 남았는지 보고한다.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const ROOT = new URL("../..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");
const PORT = "8794";
const MARK_TITLE = "ZZ-PROBE-TITLE-4711";
const MARK_BODY = "ZZ-PROBE-BODY-8123 본문 표식 문장";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "backup-probe-"));
const profile = path.join(tmp, "profile");

const server = spawn(process.env.PYTHON || "python", ["app/server.py"], {
  cwd: ROOT,
  env: { ...process.env, PORT, AI_NEWSROOM_DOCUMENTS: path.join(tmp, "docs"), AI_NEWSROOM_APPDATA: path.join(tmp, "appdata"),
    AI_NEWSROOM_SKIP_DOTENV: "1", AI_NEWSROOM_FIXED_USER: "probe-user", AI_NEWSROOM_KEY_SERVICE: "AI Newsroom (backup-probe)",
    USE_LOCAL_MODELS: "false", PYTHONIOENCODING: "utf-8" },
  stdio: "ignore",
});
await new Promise((resolve) => setTimeout(resolve, 5000));
let report = {};
try {
  const context = await chromium.launchPersistentContext(profile, { channel: process.env.PW_CHANNEL || "msedge", headless: true });
  const page = context.pages()[0] || (await context.newPage());
  const reply = (route, data) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  await page.route("**/api/session", (route) => reply(route, { signedIn: true, email: "probe@example.test", userId: "probe-user", expiresIn: 3600,
    supabase: true, backend: true, autoLogin: { available: false, enabled: false, email: "", error: "" }, keepLogin: false }));
  await page.route("**/api/articles/save", (route) => route.abort()); // 코어 저장이 실패하는 상황 → 백업이 남는다
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "기사 작성", exact: true }).first().click();
  await page.getByPlaceholder("기사 제목을 입력하거나 AI 추천을 확인하세요").fill(MARK_TITLE);
  await page.getByPlaceholder("기사 본문을 입력하세요. 자유롭게 문단을 작성할 수 있습니다...").fill(MARK_BODY);
  await page.waitForTimeout(3000);
  const stored = await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open("ai-newsroom-backup", 1);
    open.onsuccess = () => {
      const all = open.result.transaction("drafts", "readonly").objectStore("drafts").getAll();
      all.onsuccess = () => resolve(all.result.map((e) => ({ v: e.v ?? "plain", hasArticle: Boolean(e.article), bytes: e.data?.byteLength ?? 0 })));
    };
    open.onerror = () => resolve("no-db");
  }));
  report.entries = stored;
  await context.close(); // 앱을 강제로 닫은 것과 같다(저장은 막혀 있었다)
} finally {
  server.kill();
}
const hits = {};
const marks = [MARK_TITLE, MARK_BODY.slice(0, 18)].flatMap((m) => [Buffer.from(m, "utf8"), Buffer.from(m, "utf16le")]);
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else { let d; try { d = fs.readFileSync(p); } catch { continue; } if (marks.some((m) => d.includes(m))) hits[path.relative(tmp, p)] = true; } } };
walk(tmp);
report.plaintextHits = Object.keys(hits);
console.log(JSON.stringify(report, null, 1));
fs.rmSync(tmp, { recursive: true, force: true });
