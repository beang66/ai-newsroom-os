// 내 UI(기사 작성·콘텐츠 변환·보관함·STT 등) 화면 스모크 테스트 — main 의 ui-smoke.mjs 는 main 화면(본문 textarea, 설정 창 등)을
// 기준으로 쓰여 있어 이 UI 에서는 맞지 않는다. 같은 방식(실제 코어를 임시 데이터 폴더로 띄우고 브라우저로 돌린다)으로 내 화면을 확인한다.
//
//   루트에서 npm run build 한 뒤  node article_editor/dev/tests/ui-smoke-mine.mjs   (article_editor 에서 npm run test:ui:mine)
//
// 외부 서비스는 쓰지 않는다: AI(제목·검색어)·Unsplash·STT 서버·플랫폼 생성은 브라우저 요청을 가로채 가짜로 답한다.
// 브라우저: 기본은 Windows 기본 설치 Edge(channel=msedge). PW_CHANNEL=chrome 또는 CHROMIUM_PATH=<실행 파일> 로 바꾼다. 파이썬은 PYTHON.
// 실패하면 temp/ui-smoke-mine-failure.png 에 마지막 화면을 남긴다.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "../../app");
const PORT = process.env.UI_SMOKE_PORT || "8798";
const BASE = `http://127.0.0.1:${PORT}`;
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// ── 임시 데이터 폴더로 코어 실행 ─────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ui-smoke-mine-"));
const core = spawn(process.env.PYTHON || "python", ["server.py"], {
  cwd: APP_DIR,
  env: {
    ...process.env,
    PORT,
    AI_NEWSROOM_APPDATA: path.join(tmp, "appdata"),
    AI_NEWSROOM_DOCUMENTS: path.join(tmp, "documents"),
    AI_NEWSROOM_FIXED_USER: "ui-smoke-mine",
    AI_NEWSROOM_KEY_SERVICE: `ui-smoke-mine-${process.pid}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let coreLog = "";
core.stdout.on("data", (chunk) => { coreLog += chunk; });
core.stderr.on("data", (chunk) => { coreLog += chunk; });
const stopCore = () => { try { core.kill(); } catch { /* 이미 끝남 */ } };
process.on("exit", stopCore);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForCore() {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${BASE}/api/status`)).ok) return; } catch { /* 아직 */ }
    await sleep(500);
  }
  throw new Error(`코어가 시작되지 않았습니다.\n${coreLog.slice(-800)}`);
}

// ── 가짜 STT 서버 응답(저장된 전사: 같은 화자 연속 발언 → 한 단락) ──────────────────────
const STT_SEGMENTS = [
  { start: 0, end: 6000, text: "AI 기자가 나온다는 얘기 들어보셨죠.", speaker: { label: "1", name: "A" } },
  { start: 6500, end: 9000, text: "네, 들어봤습니다.", speaker: { label: "2", name: "B" } },
  { start: 9500, end: 14000, text: "근데 취재는 사람이 해야 합니다.", speaker: { label: "2", name: "B" } },
];

let browser;
try {
  await waitForCore();
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: process.env.PW_CHANNEL || "msedge" });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  page.setDefaultTimeout(15_000);

  const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const assistCalls = [];
  await page.route("**/api/session", (route) => (route.request().method() === "GET"
    ? json(route, { signedIn: true, email: "smoke@example.com", userId: "smoke-user" }) : route.continue()));
  await page.route("**/api/assist", (route) => {
    const kind = JSON.parse(route.request().postData() || "{}").kind;
    assistCalls.push(kind);
    if (kind === "photo_keywords") return json(route, { keywords: ["semiconductor factory", "ai chip", "research lab"] });
    if (kind === "photo_query") return json(route, { query: "chip" });
    return route.continue();
  });
  const unsplashQueries = [];
  await page.route("**/api/unsplash/search**", (route) => {
    unsplashQueries.push(new URL(route.request().url()).searchParams.get("q"));
    return json(route, { photos: [{ id: "a1", urls: { regular: PIXEL, small: PIXEL }, alt_description: "chip", user: { name: "Kim" } }] });
  });
  await page.route("**/api/stt/transcripts", (route) => json(route, { success: true, transcripts: [
    { id: "t1", filename: "smoke.m4a", engine: "NAVER_CLOVA_SPEECH", createdAt: "2026-10-13T04:16:31.168Z", segmentCount: 3, durationSec: 14, preview: "AI 기자가 나온다는" },
  ] }));
  await page.route("**/api/stt/transcripts/t1", (route) => json(route, { success: true, id: "t1", transcript: { id: "tr_1", language: "ko-KR", text: "", confidence: 0.9, segments: STT_SEGMENTS, metadata: { sourceEngine: "NAVER_CLOVA_SPEECH", sourceFilename: "smoke.m4a" } } }));

  const step = (name) => console.log(`  ✓ ${name}`);
  const nav = async (title) => page.locator(`button[title="${title}"]`).first().click();
  const heading = (text) => page.getByTestId("page-heading").filter({ hasText: text }).waitFor();

  // 1. 첫 화면은 오늘의 데스크
  await page.goto(BASE);
  await heading("오늘의 데스크");
  await page.getByTestId("desk-view").waitFor();
  step("처음 열면 오늘의 데스크");

  // 2. 화면 이동: 제목이 맞는지
  await nav("콘텐츠 변환"); await heading("콘텐츠 변환");
  await nav("데이터 맵"); await heading("데이터맵");
  await nav("기사 보관함"); await heading("보관함");
  await page.getByTestId("archive-view").waitFor();
  await nav("인터뷰 & 오디오");
  await page.getByText("저장된 전사 불러오기").waitFor();
  step("콘텐츠 변환·데이터맵·보관함·인터뷰 화면 이동");

  // 3. 기사 작성: 분류·세부 분류, 제목·본문, 수동 저장(Ctrl+S)
  await nav("기사 작성");
  const title = page.locator('.writer-workspace input[class*="text-2xl"]');
  await title.waitFor();
  await title.fill("스모크 테스트 기사");
  await page.locator('[contenteditable="true"]').first().fill(`반도체 수출이 크게 늘었다. ${"본문 문장입니다. ".repeat(12)}`);
  await page.locator('button[title="기사 카테고리 선택"]').click();
  await page.getByRole("button", { name: "사회", exact: true }).click();
  await page.getByTestId("article-subcategory").selectOption("교육");
  const saveText = page.locator("p[role=status]");
  await page.waitForFunction(() => /임시 저장됨|저장됨/.test(document.querySelector("p[role=status]")?.textContent || ""), null, { timeout: 15_000 });
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => /저장됨 · \d+번째 이력/.test(document.body.innerText), null, { timeout: 15_000 });
  assert.match(await saveText.textContent(), /저장됨/);
  step("분류·세부 분류 선택, 자동 저장, Ctrl+S 수동 저장(이력 번호)");

  // 4. 기사 미리보기(main 의 DongaPreview)
  await page.getByRole("button", { name: /독자 화면 미리보기/ }).click();
  await page.getByTestId("donga-preview").waitFor();
  const frame = page.frameLocator('iframe[title="동아일보 기사 미리보기"]');
  await frame.locator("h1.title").filter({ hasText: "스모크 테스트 기사" }).waitFor();
  assert.match(await frame.locator(".category").textContent(), /사회 > 교육/);
  await page.getByRole("button", { name: /기사작성으로 돌아가기/ }).click();
  await title.waitFor();
  step("미리보기: 제목·분류(사회 > 교육) 표시, 돌아가기");

  // 5. 사진 첨부: 열면 검색어 자동 추천, Unsplash 는 검색·키워드를 눌러야 표시
  await page.getByRole("button", { name: /사진 첨부/ }).click();
  await page.getByTestId("photo-keyword-chips").waitFor();
  assert.ok(assistCalls.includes("photo_keywords"), "열면 검색어 추천이 자동으로 요청된다");
  assert.equal(await page.locator("img[src^='https://images.unsplash']").count(), 0, "처음에는 Unsplash 사진이 없다");
  assert.equal(unsplashQueries.length, 0, "누르기 전에는 검색하지 않는다");
  await page.getByTestId("photo-keyword-chips").getByRole("button").first().click();
  await page.waitForFunction(() => /검색 결과 \(1\)/.test(document.body.innerText));
  assert.equal(unsplashQueries.length, 1);
  await page.getByRole("button", { name: "동아일보DB" }).click();
  for (const label of ["전체", "최신순", "오래된순"]) await page.getByRole("button", { name: label, exact: true }).waitFor();
  step("사진 첨부: 자동 추천 → 키워드 클릭 시 검색, 동아일보 DB 정렬(전체·최신순·오래된순)");

  // 6. 보관함: 저장한 기사가 보이고 삭제
  await nav("기사 보관함");
  await page.getByTestId("archive-view").waitFor();
  await page.locator(".archive-item", { hasText: "스모크 테스트 기사" }).first().waitFor();
  await page.getByTestId("archive-delete").first().click();
  await page.waitForFunction(() => !document.body.innerText.includes("스모크 테스트 기사"), null, { timeout: 15_000 });
  step("보관함: 저장한 기사 표시, 삭제(×)");

  // 7. 인터뷰 STT: 저장된 전사 → 화자·단락 구분 / 통글 / 복사
  await nav("인터뷰 & 오디오");
  await page.getByText("저장된 전사 불러오기").click();
  await page.getByText("smoke.m4a").first().click();
  await page.getByTestId("unified-text").waitFor();
  const unified = page.getByTestId("unified-text");
  await page.waitForFunction(() => /\(2개 단락\)/.test(document.body.innerText));
  await page.getByTestId("text-mode-plain").click();
  assert.equal(await unified.locator("p").count(), 1, "통글은 한 덩어리");
  await page.getByTestId("text-mode-speaker").click();
  await page.getByRole("button", { name: "전체 복사" }).click();
  // Windows 클립보드는 줄바꿈을 CRLF 로 돌려준다
  const copied = (await page.evaluate(() => navigator.clipboard.readText())).split("\r\n").join("\n");
  assert.match(copied, /\[화자 1\] 00:00:00\nAI 기자가/);
  assert.match(copied, /\[화자 2\] 00:00:06\n네, 들어봤습니다\. 근데 취재는/);
  step("STT: 같은 화자 발언을 한 단락으로 묶고, 통글 전환과 화자·단락 복사");

  assert.deepEqual(pageErrors, [], `브라우저 오류: ${pageErrors.join(" | ")}`);
  console.log("PASS ui-smoke-mine: 데스크·이동·기사 작성·저장·미리보기·사진 첨부·보관함·STT 화면");
} catch (error) {
  console.error("FAIL ui-smoke-mine:", error?.message || error);
  try {
    fs.mkdirSync(path.resolve(HERE, "../../temp"), { recursive: true });
    const pages = browser?.contexts()[0]?.pages() || [];
    if (pages[0]) await pages[0].screenshot({ path: path.resolve(HERE, "../../temp/ui-smoke-mine-failure.png") });
  } catch { /* 스크린샷 실패는 무시 */ }
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  stopCore();
}
