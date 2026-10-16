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
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "../../app");
const PORT = process.env.UI_SMOKE_PORT || "8798";
const BASE = `http://127.0.0.1:${PORT}`;
// 사진 편집 단계에서 캔버스로 그릴 수 있는 작은 PNG(200x150 회색)를 직접 만든다
function makePng(width, height) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body) >>> 0, body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; // 8비트 RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 150)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}
const PIXEL = makePng(200, 150);

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

// ── 가짜 코어 녹취 응답(저장된 전사: 같은 화자 연속 발언 → 한 단락) ──────────────────────
const TRANSCRIPT_ID = "a".repeat(32);
const STT_DIALOGUES = [
  { id: "seg-1", speaker: "1", speakerName: "화자 1", timestamp: 0, text: "AI 기자가 나온다는 얘기 들어보셨죠." },
  { id: "seg-2", speaker: "2", speakerName: "화자 2", timestamp: 6, text: "네, 들어봤습니다." },
  { id: "seg-3", speaker: "2", speakerName: "화자 2", timestamp: 9, text: "근데 취재는 사람이 해야 합니다." },
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
  await page.route("**/api/unsplash/photo/*/track", (route) => json(route, { ok: true })); // Unsplash 다운로드 집계
  await page.route("**/api/transcripts", (route) => json(route, { transcripts: [
    { id: TRANSCRIPT_ID, filename: "smoke.m4a", mimeType: "audio/mp4", duration: 14, createdAt: "2026-10-13T04:16:31.168Z", bytes: 4, segments: 3 },
  ] }));
  const speakerPosts = []; // 화자 수정 저장 요청(코어가 받은 내용)
  await page.route(`**/api/transcripts/${TRANSCRIPT_ID}`, (route) => json(route, { id: TRANSCRIPT_ID, filename: "smoke.m4a", mimeType: "audio/mp4", dialogues: STT_DIALOGUES, duration: 14, createdAt: "2026-10-13T04:16:31.168Z", speakerEdits: speakerPosts.at(-1) ?? {} }));
  await page.route(`**/api/transcripts/${TRANSCRIPT_ID}/speakers`, (route) => {
    speakerPosts.push(route.request().postDataJSON().speakerEdits);
    return json(route, { id: TRANSCRIPT_ID, speakerEdits: speakerPosts.at(-1) });
  });
  await page.route(`**/api/transcripts/${TRANSCRIPT_ID}/audio`, (route) => route.fulfill({ status: 200, contentType: "audio/mp4", body: Buffer.from([0, 0, 0, 0]) }));

  const step = (name) => console.log(`  ✓ ${name}`);
  const nav = async (title) => page.locator(`button[title="${title}"]`).first().click();
  const heading = (text) => page.getByTestId("page-heading").filter({ hasText: text }).waitFor();

  // 1. 첫 화면은 오늘의 데스크
  await page.goto(BASE);
  await heading("좋은 기사를 위한");
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
  assert.equal(await page.getByTestId("article-subcategory").count(), 0, "세부 분류 선택칸은 없다");
  const saveText = page.locator("p[role=status]");
  await page.waitForFunction(() => /임시 저장됨|저장됨/.test(document.querySelector("p[role=status]")?.textContent || ""), null, { timeout: 15_000 });
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => /저장됨 · \d+번째 이력/.test(document.body.innerText), null, { timeout: 15_000 });
  assert.match(await saveText.textContent(), /저장됨/);
  step("분류 선택(세부 분류칸 없음), 자동 저장, Ctrl+S 수동 저장(이력 번호)");

  // 4. 기사 미리보기(main 의 DongaPreview)
  await page.getByRole("button", { name: /독자 화면 미리보기/ }).click();
  await page.getByTestId("donga-preview").waitFor();
  const frame = page.frameLocator('iframe[title="동아일보 기사 미리보기"]');
  await frame.locator("h1.title").filter({ hasText: "스모크 테스트 기사" }).waitFor();
  assert.match(await frame.locator(".category").textContent(), /사회/);
  await page.getByRole("button", { name: /기사작성으로 돌아가기/ }).click();
  await title.waitFor();
  step("미리보기: 제목·분류(사회) 표시, 돌아가기");

  // 5. 사진 첨부: 열면 검색어 자동 추천, Unsplash 는 검색·키워드를 눌러야 표시
  await page.getByRole("button", { name: /사진 첨부/ }).click();
  await page.getByTestId("photo-keyword-chips").waitFor();
  assert.ok(assistCalls.includes("photo_keywords"), "열면 검색어 추천이 자동으로 요청된다");
  assert.equal(await page.locator("img[src^='https://images.unsplash']").count(), 0, "처음에는 Unsplash 사진이 없다");
  assert.equal(unsplashQueries.length, 0, "누르기 전에는 검색하지 않는다");
  await page.getByTestId("photo-keyword-chips").getByRole("button").first().click();
  await page.waitForFunction(() => /검색 결과 \(1\)/.test(document.body.innerText));
  assert.equal(unsplashQueries.length, 1);
  await page.locator("img[src^='data:image/png']").first().click();
  await page.getByRole("button", { name: "편집하기", exact: true }).click();
  await page.getByTestId("image-editor").waitFor();
  const canvas = page.getByTestId("crop-canvas");
  await canvas.waitFor();
  await page.getByRole("button", { name: "1:1", exact: true }).click();
  await page.getByRole("button", { name: "모자이크", exact: true }).first().click();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
  assert.equal(await page.getByRole("button", { name: "되돌리기" }).isDisabled(), false, "모자이크를 칠하면 되돌리기가 켜진다");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "편집본 다운로드" }).click()]);
  assert.match(download.suggestedFilename(), /\.jpg$/);
  await page.getByTestId("image-apply").click();
  await page.getByTestId("image-editor").waitFor({ state: "detached" });
  // "본문에 넣기": 작성 화면으로 돌아와 본문 끝에 편집한 사진이 들어가고, 쓰던 본문은 그대로 남는다
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.locator("figure[data-photo-id] img").first().waitFor();
  assert.match(await editor.innerText(), /반도체 수출이 크게 늘었다/);
  await page.getByRole("button", { name: "동아일보DB" }).click();
  for (const label of ["전체", "최신순", "오래된순"]) await page.getByRole("button", { name: label, exact: true }).waitFor();
  step("사진 첨부: 자동 추천 → 키워드 클릭 시 검색, 사진 편집(표시 범위·모자이크·편집본 파일·본문에 넣기 → 본문에 사진 삽입), 동아일보 DB 정렬");

  // 6. 보관함: 저장한 기사가 보이고 삭제
  await nav("기사 보관함");
  await page.getByTestId("archive-view").waitFor();
  await page.locator(".archive-item", { hasText: "스모크 테스트 기사" }).first().waitFor();
  await page.getByTestId("archive-delete").first().click();
  await page.waitForFunction(() => !document.body.innerText.includes("스모크 테스트 기사"), null, { timeout: 15_000 });
  step("보관함: 저장한 기사 표시, 삭제(×)");

  // 7. 인터뷰 STT: 저장된 전사 → 왼쪽은 화자 박스, 오른쪽 통합 텍스트는 통글 하나, 복사
  await nav("인터뷰 & 오디오");
  await page.getByText("저장된 전사 불러오기").click();
  await page.getByText("smoke.m4a").first().click();
  await page.getByTestId("unified-text").waitFor();
  const unified = page.getByTestId("unified-text");
  await page.waitForFunction(() => /\(2개 단락\)/.test(document.body.innerText));
  assert.equal(await page.getByTestId("text-mode-plain").count() + await page.getByTestId("text-mode-speaker").count(), 0, "통합 텍스트는 형태를 고르는 버튼이 없다");
  assert.equal(await unified.locator("p").count(), 1, "통합 텍스트는 통글 한 덩어리");
  assert.equal(await unified.getAttribute("data-mode"), null);
  assert.match(await page.getByTestId("speaker-name-seg-1").innerText(), /화자 1/, "왼쪽은 화자별 박스");
  assert.match(await page.getByTestId("speaker-name-seg-2").innerText(), /화자 2/);
  await page.getByRole("button", { name: "전체 복사" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /^AI 기자가 나온다는 얘기 들어보셨죠\. 네, 들어봤습니다\. 근데 취재는 사람이 해야 합니다\.$/, "복사도 통글(화자 표시 없음)");
  step("STT: 왼쪽은 화자별 박스, 오른쪽 통합 텍스트는 통글 하나로 고정(복사도 통글)");

  // 7-2. 다시듣기: 왼쪽 위 재생 영역의 파형을 누르면 그 위치로 이동하고, 오른쪽 통합 텍스트를 눌러도 이동·재생하지 않는다
  const wave = page.getByTestId("audio-waveform");
  const waveBox = await wave.boundingBox();
  const waveAt = (fraction) => ({ x: waveBox.x + 16 + (waveBox.width - 32) * fraction, y: waveBox.y + waveBox.height / 2 });
  await page.mouse.click(waveAt(0.5).x, waveAt(0.5).y);
  await page.getByText("00:00:07", { exact: true }).first().waitFor();            // 14초짜리 녹취의 가운데
  assert.equal(await wave.getAttribute("aria-valuenow"), "7");
  await page.mouse.click(waveAt(0.25).x, waveAt(0.25).y);
  await page.getByText("00:00:03", { exact: true }).first().waitFor();            // 3.5초(화면은 내림해서 표시)
  await page.mouse.click(waveAt(0.5).x, waveAt(0.5).y);
  await page.getByText("00:00:07", { exact: true }).first().waitFor();
  await page.locator("#unified_text_seg-1").click();                               // 오른쪽 글자(시작 0초)를 눌러도
  await page.waitForTimeout(300);
  assert.equal(await wave.getAttribute("aria-valuenow"), "7", "오른쪽 통합 텍스트를 눌러도 위치가 바뀌지 않는다");
  assert.equal(await page.getByText("재생 중", { exact: true }).count(), 0, "오른쪽 통합 텍스트를 눌러도 재생이 시작되지 않는다");
  await wave.focus();
  await page.keyboard.press("ArrowLeft");                                           // 키보드로도 이동(5초)
  await page.getByText("00:00:02", { exact: true }).first().waitFor();
  step("다시듣기: 왼쪽 위 파형을 눌러 그 위치로 이동(키보드 포함), 오른쪽 통합 텍스트는 눌러도 재생·이동하지 않음");

  // 7-3. 텍스트 수정바: 왼쪽 박스의 글을 드래그하면 형광펜·수정 막대가 뜨고, 형광펜과 고친 글이 저장된다
  const shot = (name, fullPage = true) => process.env.UI_SMOKE_SHOTS ? page.screenshot({ path: path.join(process.env.UI_SMOKE_SHOTS, `${name}.png`), fullPage }) : null; // 화면 모양 확인용(선택)
  const savedState = () => page.getByTestId("speaker-save-state").filter({ hasText: "수정 내용 저장됨" }).waitFor();
  const selectInBox = async (boxId, startChar, endChar) => {
    await page.getByTestId(`box-text-${boxId}`).evaluate((el, [from, to]) => {
      const locate = (offset) => {                                             // 형광펜으로 글 노드가 쪼개져 있어도 글자 위치로 찾는다
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node;
        let count = 0;
        while ((node = walker.nextNode())) {
          if (offset <= count + node.textContent.length) return [node, offset - count];
          count += node.textContent.length;
        }
        return [el, 0];
      };
      const range = document.createRange();
      range.setStart(...locate(from));
      range.setEnd(...locate(to));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }, [startChar, endChar]);
    await page.getByTestId(`box-text-${boxId}`).dispatchEvent("mouseup", { bubbles: true });
  };
  assert.equal(speakerPosts.length, 0, "열기만 해서는 저장하지 않는다");
  assert.equal(await page.getByTestId("text-toolbar").count(), 0, "드래그하기 전에는 수정바가 없다");
  await selectInBox("seg-1", 0, 6);                                            // "AI 기자가"
  await page.getByTestId("text-toolbar").waitFor();
  assert.equal(await page.getByTestId("mark-yellow").count() + await page.getByTestId("mark-orange").count() + await page.getByTestId("mark-blue").count(), 3);
  assert.equal(await wave.getAttribute("aria-valuenow"), "2", "글을 드래그하는 동안 박스가 재생·이동하지 않는다(앞 단계에서 2초로 옮겨 둠)");
  await shot("text-toolbar", false);                                           // 창 크기를 바꾸지 않는 사진(수정바가 닫히지 않는다)
  await page.getByTestId("mark-orange").click();
  await savedState();
  assert.deepEqual(speakerPosts.at(-1).marks, { "seg-1": [{ s: 0, e: 6, c: "orange" }] });
  assert.equal(await page.getByTestId("text-toolbar").count(), 0, "칠하면 수정바가 닫힌다");
  assert.equal(await page.getByTestId("box-text-seg-1").locator("mark").innerText(), "AI 기자가");
  assert.equal(await page.locator("#unified_text_seg-1 mark").first().innerText(), "AI 기자가", "오른쪽 통글에도 형광펜이 보인다");
  await selectInBox("seg-2", 0, 2);
  await page.getByTestId("mark-blue").click();
  await savedState();
  assert.deepEqual(speakerPosts.at(-1).marks["seg-2"], [{ s: 0, e: 2, c: "blue" }]);
  // 칠한 부분의 일부를 드래그해 지우기: "AI 기자가" 중 "기자" 부분을 지운다(주황이 둘로 나뉜다)
  await page.getByTestId("box-text-seg-1").evaluate((el) => {
    const mark = el.querySelector("mark").firstChild;
    const range = document.createRange();
    range.setStart(mark, 3);
    range.setEnd(mark, 5);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.getByTestId("box-text-seg-1").dispatchEvent("mouseup", { bubbles: true });
  await page.getByTestId("mark-clear").click();
  await savedState();
  assert.deepEqual(speakerPosts.at(-1).marks["seg-1"], [{ s: 0, e: 3, c: "orange" }, { s: 5, e: 6, c: "orange" }]);
  step("텍스트 수정바: 글을 드래그하면 형광펜 색·지우기·수정 막대가 뜨고, 칠한 형광펜이 저장되며 오른쪽 통글에도 보인다");

  // 수정: 드래그한 부분이 선택된 채 글 수정칸이 열리고, 저장하면 박스 글과 오른쪽 통글·복사가 고친 글이 된다
  await selectInBox("seg-1", 0, 3);
  await page.getByTestId("text-edit-start").click();
  const textBox = page.getByTestId("text-editor-input");
  await textBox.waitFor();
  assert.equal(await textBox.evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd)), "AI ", "드래그한 부분이 선택돼 있다");
  await textBox.fill("인공지능 기자가 나온다는 얘기 들어보셨죠.");
  await page.getByTestId("text-editor-save").click();
  await savedState();
  assert.equal(speakerPosts.at(-1).texts["seg-1"], "인공지능 기자가 나온다는 얘기 들어보셨죠.");
  assert.equal(speakerPosts.at(-1).marks?.["seg-1"], undefined, "글을 고치면 그 박스의 형광펜은 지워진다");
  assert.deepEqual(speakerPosts.at(-1).marks["seg-2"], [{ s: 0, e: 2, c: "blue" }], "다른 박스의 형광펜은 그대로");
  assert.match(await page.getByTestId("box-text-seg-1").innerText(), /^인공지능 기자가/);
  assert.match(await unified.innerText(), /^인공지능 기자가 나온다는 얘기 들어보셨죠\. 네, 들어봤습니다/);
  await page.getByRole("button", { name: "전체 복사" }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^인공지능 기자가 나온다는 얘기 들어보셨죠\. 네, 들어봤습니다/);
  await selectInBox("seg-1", 0, 2);                                            // 취소: Esc
  await page.getByTestId("text-edit-start").click();
  await page.getByTestId("text-editor-input").fill("버릴 글");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByTestId("text-editor").count(), 0);
  assert.match(await page.getByTestId("box-text-seg-1").innerText(), /^인공지능 기자가/, "Esc 로 취소하면 고치지 않는다");
  await selectInBox("seg-1", 0, 2);                                            // 원문으로
  await page.getByTestId("text-edit-start").click();
  await page.getByTestId("text-editor-original").click();
  await page.getByTestId("text-editor-save").click();
  await savedState();
  assert.equal(speakerPosts.at(-1).texts, undefined, "원문과 같아지면 고친 기록이 없다");
  assert.match(await page.getByTestId("box-text-seg-1").innerText(), /^AI 기자가 나온다는/);
  await selectInBox("seg-2", 0, 2);                                            // 남은 형광펜을 지워 다음 단계를 깨끗한 상태로 시작한다
  await page.getByTestId("mark-clear").click();
  await savedState();
  assert.equal(speakerPosts.at(-1).marks, undefined, "형광펜을 다 지우면 기록도 사라진다");
  step("텍스트 수정바: 수정(드래그한 부분 선택된 채로 열림, Ctrl 없이 저장·Esc 취소·원문으로), 글을 고치면 그 박스의 형광펜만 지워진다");

  // 8. 화자 프로필: CLOVA 가 나눈 박스는 그대로 두고 이름만 바꾼다. 프로필 아이콘에서만 작은 메뉴가 열린다.
  const boxNames = async () => [await page.getByTestId("speaker-name-seg-1").innerText(), await page.getByTestId("speaker-name-seg-2").innerText()];
  const boxesText = (n) => page.waitForFunction((count) => new RegExp(`\\(${count}개 단락\\)`).test(document.body.innerText), n);
  await page.getByTestId("speaker-edit-start").waitFor();
  assert.match(await page.getByTestId("speaker-name-seg-1").innerText(), /화자 1/, "박스 맨 앞에 프로필 아이콘과 이름");
  assert.equal(await page.getByTestId("speaker-editor").count(), 0, "누르기 전에는 메뉴가 닫혀 있다");
  assert.equal(await page.getByText("이 단락은 누가 말했나요?").count(), 0, "안내 문구는 없다");

  await page.getByTestId("speaker-badge-seg-1").click();
  await shot("speaker-dropdown");
  await page.getByTestId("speaker-name-input").fill("김 기자");
  await page.getByTestId("speaker-name-submit").click();
  await savedState();
  assert.equal(speakerPosts.at(-1).names["1"], "김 기자");
  assert.equal(await page.getByTestId("speaker-editor").count(), 0, "적용하면 메뉴가 닫힌다");
  assert.deepEqual(await boxNames(), ["김 기자", "화자 2"]);
  step("화자 프로필: 아이콘을 눌러 이름을 적으면 그 화자의 이름이 바뀌고 저장된다");

  await page.getByTestId("speaker-badge-seg-2").click();
  await page.getByTestId("speaker-name-input").fill("김 기자");
  await page.getByTestId("speaker-name-submit").click();
  await savedState();
  assert.deepEqual(speakerPosts.at(-1).merge, { 2: "1" });
  await boxesText(2);                                                          // 같은 이름이 되어도 CLOVA 박스는 합쳐지지 않는다
  assert.deepEqual(await boxNames(), ["김 기자", "김 기자"]);
  step("화자 프로필: 같은 이름을 써도 박스는 그대로이고 이름만 같아진다");

  // 이름을 고치고 합쳐도 목록에 고친 이름과 CLOVA 가 처음 붙인 이름이 함께 남는다
  await page.getByTestId("speaker-badge-seg-1").click();
  const rosterRow = await page.getByTestId("speaker-roster-1").innerText();
  assert.match(rosterRow, /김 기자/);
  assert.match(rosterRow, /원래 화자 1·화자 2/);
  assert.equal(await page.getByTestId("speaker-roster-2").count(), 0, "같은 사람이 된 화자는 한 줄로 보인다");
  await page.getByTestId("speaker-badge-seg-1").click();
  step("화자 프로필: 고친 이름과 원래 이름이 메뉴 목록에 남는다");

  await page.getByTestId("speaker-reset").click();
  await boxesText(2);
  assert.deepEqual(speakerPosts.at(-1), { names: {}, merge: {}, assign: {} });
  assert.deepEqual(await boxNames(), ["화자 1", "화자 2"]);
  step("화자 프로필: 원본으로");

  await page.getByTestId("speaker-badge-seg-2").click();
  assert.match(await page.getByTestId("speaker-roster-1").innerText(), /화자 1/);
  assert.match(await page.getByTestId("speaker-roster-2").innerText(), /화자 2/);
  await page.getByTestId("speaker-roster-1").click();                          // 목록에서 눌러 고른다(이름을 적지 않아도 된다)
  await savedState();
  assert.deepEqual(speakerPosts.at(-1).assign, { "seg-2": "1", "seg-3": "1" });
  await boxesText(2);
  assert.deepEqual(await boxNames(), ["화자 1", "화자 1"]);
  await page.getByTestId("speaker-reset").click();
  await boxesText(2);
  step("화자 프로필: 메뉴 목록에서 눌러 고르면 그 박스가 그 화자의 말로 바뀐다");

  await page.getByTestId("speaker-edit-start").click();
  await page.getByTestId("speaker-edit-bar").waitFor();
  assert.equal(await page.evaluate(() => document.querySelector("audio")?.paused ?? true), true, "화자 수정하기를 누르면 재생이 멈춘다");
  assert.equal(await page.getByTestId("speaker-badge-seg-1").isDisabled(), true, "수정하기 중에는 프로필 메뉴를 열지 않는다");
  assert.equal(await page.getByTestId("speaker-bulk-apply").isDisabled(), true, "고른 박스가 없으면 적용할 수 없다");
  await page.getByTestId("speaker-pick-seg-2").check();
  await page.getByTestId("speaker-bulk-name").fill("취재원");
  await page.getByTestId("speaker-bulk-apply").click();
  await savedState();
  assert.deepEqual(speakerPosts.at(-1).assign, { "seg-2": "custom-1", "seg-3": "custom-1" });
  await page.getByTestId("speaker-pick-seg-1").check();
  await page.getByTestId("speaker-pick-seg-2").check();
  await shot("speaker-bulk-edit");
  assert.match(await page.getByTestId("speaker-picked-count").innerText(), /2개 선택됨/);
  await page.getByTestId("speaker-bulk-roster-custom-1").click();              // 목록의 이름을 눌러 이름 칸을 채운다
  assert.equal(await page.getByTestId("speaker-bulk-name").inputValue(), "취재원");
  await page.getByTestId("speaker-bulk-name").fill("발표자");
  await page.getByTestId("speaker-bulk-apply").click();
  await boxesText(2);
  await savedState();
  assert.deepEqual(speakerPosts.at(-1).assign, { "seg-2": "custom-2", "seg-3": "custom-2", "seg-1": "custom-2" });
  assert.match(await page.getByTestId("speaker-picked-count").innerText(), /0개 선택됨/, "적용 뒤 선택이 풀린다");
  await page.getByTestId("speaker-select-all").click();
  assert.match(await page.getByTestId("speaker-picked-count").innerText(), /2개 선택됨/);
  await page.getByTestId("speaker-edit-done").click();
  assert.equal(await page.getByTestId("speaker-edit-bar").count(), 0);
  assert.deepEqual(await boxNames(), ["발표자", "발표자"]);
  step("화자 프로필: 화자 수정하기 → 재생 멈춤, 박스를 여러 개 골라 한 번에 이름 적용(박스는 그대로)");

  await page.getByText("저장된 전사 불러오기").click();
  await page.getByText("smoke.m4a").first().click();
  await page.getByTestId("speaker-name-seg-1").waitFor();
  assert.match(await page.getByTestId("speaker-name-seg-1").innerText(), /발표자/);
  step("화자 프로필: 저장된 전사를 다시 열어도 수정이 유지된다");

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
