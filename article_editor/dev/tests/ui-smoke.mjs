// 새 UI(web/ → app/frontend 빌드본) 화면 스모크 테스트 — 실제 코어를 띄우고 브라우저로 주요 화면·편집 보조 기능을 돌아본다.
//
//   npm run build:web && npm run test:ui
//
// AI·Unsplash 는 이 파일이 띄우는 가짜 백엔드(AI_BACKEND=remote 프록시 경로)로 응답한다 → 키·인터넷 없이 재현 가능.
// 브라우저: 기본은 Windows 기본 설치 Edge(channel=msedge, 별도 다운로드 없음).
//   PW_CHANNEL=chrome 또는 CHROMIUM_PATH=<실행 파일> 로 바꿀 수 있다. 파이썬은 PYTHON 환경변수(기본 python).
// 실패하면 temp/ui-smoke-failure.png 에 마지막 화면을 남긴다.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const ROOT = new URL("../..", import.meta.url);
const PORT = process.env.UI_SMOKE_PORT || "8796";
const BASE = `http://127.0.0.1:${PORT}`;

// ── 가짜 백엔드: OpenAI Responses(구조화 출력)·Unsplash 를 흉내 낸다 ───────────────────────────
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const AI = {
  headlines: { headline_candidates: ["스텁 제목 하나", "스텁 제목 둘", "스텁 제목 셋"] },
  subtitles: { subtitle_candidates: ["스텁 부제 하나", "스텁 부제 둘", "스텁 부제 셋"] },
  photo_keywords: { keywords: ["stub chip", "stub wafer", "stub lab"] },
  article_flow_summary: { paragraphs: ["스텁 흐름 하나", "스텁 흐름 둘", "스텁 흐름 셋"], advice: "" },
};
const stubCalls = [];
const stub = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://stub");
    let out = null;
    if (req.method === "POST" && url.pathname === "/ai/responses") {
      const name = JSON.parse(body).text?.format?.name;
      stubCalls.push(name);
      if (AI[name]) out = { output: [{ content: [{ type: "output_text", text: JSON.stringify(AI[name]) }] }] };
    } else if (req.method === "POST" && url.pathname === "/ai/audio/transcriptions") {
      stubCalls.push("stt:" + (req.headers["content-type"] || "").split(";")[0]);
      out = {
        text: "스텁 전사",
        duration: 8,
        segments: [
          { start: 0, end: 3, text: "스텁 질문입니다. 개발 배경을 말씀해 주시겠습니까?" },
          { start: 3.5, end: 8, text: "스텁 답변입니다. 저희는 3년 전부터 이 연구를 해 왔고 이번에 결과를 냈습니다." },
        ],
      };
    } else if (url.pathname === "/unsplash/search/photos") {
      stubCalls.push("search:" + url.searchParams.get("query"));
      out = {
        total: 6,
        total_pages: 2,
        results: [1, 2, 3].map((i) => ({ id: `stub${i}`, alt_description: `stub photo ${i}`, user: { name: "Stub" }, urls: { small: PIXEL, thumb: PIXEL }, links: { html: "" } })),
      };
    }
    res.writeHead(out ? 200 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify(out || { error: "stub: unknown" }));
  });
});
await new Promise((r) => stub.listen(0, "127.0.0.1", r));

const SMOKE_DOCS = fs.mkdtempSync(path.join(os.tmpdir(), "ainews-smoke-"));
const server = spawn(process.env.PYTHON || "python", ["app/server.py"], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT,
    // 원고·취재자료(암호화 저장소 vault.db 포함)는 임시 폴더에 — 실제 데이터와 키 저장소 항목 외에는 건드리지 않는다
    AI_NEWSROOM_DOCUMENTS: SMOKE_DOCS,
    AI_NEWSROOM_APPDATA: path.join(SMOKE_DOCS, "appdata"),
    AI_NEWSROOM_SKIP_DOTENV: "1", // 개발자의 실제 키·테스트 계정을 읽지 않는다
    USE_LOCAL_MODELS: "false",
    PYTHONIOENCODING: "utf-8",
    AI_BACKEND: "remote",
    AI_BACKEND_URL: `http://127.0.0.1:${stub.address().port}`,
    APP_TOKEN: "ui-smoke",
  },
  stdio: "ignore",
});

let browser, page;
const problems = [];
const savedIds = new Set();
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${BASE}/api/status`)).ok) break;
    } catch {}
    if (i > 200) throw Error("코어가 20초 안에 뜨지 않았습니다");
    await new Promise((r) => setTimeout(r, 100));
  }

  browser = await chromium.launch(
    process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : { channel: process.env.PW_CHANNEL || "msedge" },
  );
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => m.type() === "error" && !/status of (503|422)/.test(m.text()) && problems.push("console: " + m.text()));
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("response", async (r) => {
    // 503 = 모델·런타임 미설치(정상 상태) — 화면이 안내를 띄우는지는 단계에서 따로 본다; 422 = 깨진 자료 파일(4단계에서 일부러 올림)
    if (r.url().includes("/api/") && r.status() >= 500 && r.status() !== 503) problems.push(`${r.status()} ${r.url()}`);
    if (r.url().endsWith("/api/articles/save") && r.ok()) savedIds.add((await r.json()).articleId);
  });
  page.on("dialog", (d) => d.dismiss()); // 화면의 alert 가 테스트를 멈추지 않게

  const see = (text) => page.getByText(text, { exact: false }).first().waitFor({ timeout: 10_000 });
  // 사이드바(main 디자인)의 메뉴 이름 — 접힌 상태에서는 버튼 title 로 보인다
  const NAV = { "기사 작성": "Article Writer", "녹음 파일": "Interview & Audio", "플랫폼 변환": "Publish & Convert", "보관함": "Saved Archive" };
  const go = (title) => page.locator(`button[title="${NAV[title] || title}"]`).first().click();

  await page.goto(BASE);
  // 1. 코어 연결 — UI 가 계약(web/src/api)으로 /api/status·/api/session 을 받아 헤더에 반영
  await see("코어 연결됨");
  // 목업 없이 빈 원고로 시작해야 한다
  const body = page.getByPlaceholder("기사 본문을 입력하세요. 자유롭게 문단을 작성할 수 있습니다...");
  assert.equal(await body.inputValue(), "");
  assert.equal(await page.getByPlaceholder("기사 제목을 입력하거나 AI 추천을 확인하세요").inputValue(), "");
  // 추천은 본문 20자, 사진 검색어는 80자 이상부터
  await body.fill("스모크 테스트 본문입니다. ".repeat(8));

  // 2. 편집 보조(옛 시험 UI 기능 이식): 제목·부제 추천, 흐름 요약, 자동 저장
  await page.getByRole("button", { name: "다시 생성" }).click();
  await page.getByRole("button", { name: "스텁 제목 둘" }).click();
  assert.equal(await page.getByPlaceholder("기사 제목을 입력하거나 AI 추천을 확인하세요").inputValue(), "스텁 제목 둘");
  await page.getByRole("button", { name: "AI 추천" }).click();
  await page.getByRole("button", { name: "스텁 부제 하나" }).click();
  assert.equal(await page.getByPlaceholder("기사 부제를 입력하세요").inputValue(), "스텁 부제 하나");
  await see("자동 저장됨"); // 제목·부제가 바뀌었으니 1.5초 뒤 코어에 저장
  await page.getByRole("button", { name: "흐름 요약" }).click();
  await page.getByTestId("flow-summary").getByText("스텁 흐름 둘").waitFor();
  await page.getByTestId("flow-summary").getByRole("button", { name: "×" }).click();

  // 3. 사진 찾기: 기사 기반 검색어 → Unsplash 검색 결과 3장
  await page.getByRole("button", { name: /사진·미디어 편집/ }).click();
  await page.getByTestId("photo-finder").getByRole("button", { name: "stub wafer" }).click();
  await page.getByTestId("photo-finder").locator("img").nth(2).waitFor();
  await page.getByRole("button", { name: "닫기" }).click();

  // 4. 작성·검토 → 팩트체크 서랍
  await page.getByText("기사 팩트체크 & 근거자료").first().click();
  await see("팩트체크 & 근거자료 검증");
  // 텍스트 자료 → 코어 factcheckRun. 모델·런타임이 없는 PC 에서는 설치 안내가 나와야 한다
  const factcheckReady = (await (await fetch(`${BASE}/api/factcheck/status`)).json()).ready;
  // PDF·HWP·DOCX 는 코어가 추출한다 — 깨진 파일이면 파일 목록에 사유가 보여야 한다
  await page.locator('input[type="file"][accept*=".hwp"]').setInputFiles({
    name: "깨진.hwp", mimeType: "application/octet-stream", buffer: Buffer.from("not an hwp"),
  });
  await page.getByText(/깨진\.hwp 을\(를\) 읽지 못했습니다/).waitFor();
  await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({
    name: "자료.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("스모크 테스트 본문입니다. 다른 문장도 있습니다."),
  });
  // 판정 결과(일치/불일치/검토 필요)는 엔진 몫 — 화면은 문장별 카드가 나오는지만 본다
  if (factcheckReady) await page.getByText(/전체 [1-9][0-9]*개 문장 검증/).waitFor({ timeout: 180_000 });
  else await page.getByTestId("factcheck-error").getByText("설치").waitFor();
  // 이미 검증한 문장은 다시 보내지 않는다 — 문장 하나를 덧붙이면 그 문장만 코어로
  if (factcheckReady) {
    const next = page.waitForRequest((r) => r.url().endsWith("/api/factcheck/run"), { timeout: 15_000 });
    await body.fill((await body.inputValue()) + " 고친 문장을 하나 더 씁니다.");
    assert.deepEqual(JSON.parse((await next).postData()).nodes.map((n) => n.text), ["고친 문장을 하나 더 씁니다."]);
  }
  // 개발 실행이면 본문 청크 밑줄을 켤 수 있다
  await page.getByRole("button", { name: /청크 밑줄/ }).click();
  await page.getByTestId("chunk-underline").locator("span").first().waitFor({ state: "attached" });
  await page.getByRole("button", { name: /청크 밑줄/ }).click();
  // 등록한 자료 이름을 누르면 추출 본문을 볼 수 있다
  await page.getByRole("button", { name: "자료.txt" }).click();
  await page.getByRole("dialog", { name: "취재자료 보기" }).getByText("스모크 테스트 본문입니다.").waitFor();
  // 개발 실행이면 청크 보기(청크별 색 밑줄)가 있다
  await page.getByRole("button", { name: "청크 보기 (개발)" }).click();
  await page.getByTestId("chunk-view").getByText(/청크 [1-9][0-9]*개/).waitFor();
  await page.getByRole("dialog", { name: "취재자료 보기" }).getByTitle("닫기").click();
  // 검증 결과는 본문 뒤 하이라이트 층에 칠해진다(판정은 엔진 몫이라 층이 있는지만 본다)
  await page.getByTestId("fact-highlight").waitFor({ state: "attached" });
  // 5. 취재자료 검색 창
  await page.getByText("취재자료 검색").first().click();
  await page.getByPlaceholder("자료 제목, 키워드, 내용 검색").waitFor();
  await page.getByRole("button", { name: "×" }).click(); // 창 닫기(Escape 는 지원 안 함)
  await page.getByPlaceholder("자료 제목, 키워드, 내용 검색").waitFor({ state: "detached" });
  // 6. 플랫폼 변환 / 보관함 / 녹취 스튜디오 / 다시 기사 작성
  await go("플랫폼 변환");
  await see("전환 중인 기사");
  await go("보관함");
  await see("미디어 & 변환 자산");
  // 팩트체크 서랍에 올린 자료가 기사 취재자료로 남아 보관함에 보여야 한다(깨진 파일은 빠짐)
  await page.getByText("취재자료 (1건)").waitFor();
  await page.getByText("• 자료.txt").waitFor();
  await go("녹음 파일");
  await see("인터뷰·녹취 스튜디오");
  // 녹음 전사: 파일 → 코어 /api/interview/transcribe → 백엔드 /ai/audio/transcriptions(multipart) → 화자별 대화
  await page.locator('input[type="file"]').setInputFiles({ name: "stub.m4a", mimeType: "audio/mp4", buffer: Buffer.from("stub audio") });
  await see("스텁 답변입니다");
  await see("전사 완료");
  await go("기사 작성");
  await see("취재자료 검색");
  // 앱을 다시 열면 마지막 화면과 최근 원고(제목·본문·취재자료)가 그대로 — 자동 저장(1.5초) 뒤 새로고침
  await go("보관함");
  await page.waitForTimeout(2500);
  await page.reload();
  await see("미디어 & 변환 자산");
  await page.getByText("취재자료 (1건)").waitFor();
  await go("기사 작성");
  assert.equal(await page.getByPlaceholder("기사 제목을 입력하거나 AI 추천을 확인하세요").inputValue(), "스텁 제목 둘");
  assert.ok((await body.inputValue()).startsWith("스모크 테스트 본문입니다."));
  // 7. 좁은 화면에서도 첫 화면이 오류 없이 그려지는지
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  // 좁은 화면에서는 상태 배지를 일부러 숨긴다(hidden sm:inline-flex) → 그려졌는지만 본다
  await page.getByText("코어 연결됨").first().waitFor({ state: "attached", timeout: 10_000 });
  await page.getByRole("button", { name: "기사 팩트체크 & 근거자료", exact: true }).click();
  const drawer = page.getByRole("complementary", { name: "팩트체크 및 근거자료" });
  await drawer.waitFor();
  const drawerBounds = await drawer.boundingBox();
  assert.ok(drawerBounds.x >= 0 && drawerBounds.x + drawerBounds.width <= 390, "좁은 화면에서 검증 서랍이 화면 밖으로 밀렸습니다");
  assert.equal(await drawer.evaluate((el) => el.scrollWidth > el.clientWidth), false, "검증 서랍 내용에 가로 넘침이 있습니다");
  await drawer.getByRole("button", { name: "자료.txt", exact: true }).click();
  await page.getByRole("dialog", { name: "취재자료 보기" }).getByText("스모크 테스트 본문입니다.").waitFor();
  await page.getByRole("dialog", { name: "취재자료 보기" }).getByTitle("닫기").click();
  await drawer.getByRole("button", { name: "확인 및 닫기" }).click();

  for (const name of ["headlines", "subtitles", "article_flow_summary", "photo_keywords", "search:stub wafer", "stt:multipart/form-data"])
    assert.ok(stubCalls.includes(name), `코어가 백엔드로 ${name} 를 요청하지 않았습니다: ${stubCalls}`);
  assert.equal(savedIds.size, 1, "같은 원고는 화면을 오가도 한 파일에 저장돼야 합니다: " + [...savedIds]);
  assert.deepEqual(problems, [], "브라우저 오류:\n" + problems.join("\n"));
  console.log("PASS ui-smoke: 코어 연결·제목/부제 추천·흐름 요약·자동 저장·사진 찾기·팩트체크 서랍·자료 검색·플랫폼 변환·보관함·녹취 전사·모바일 폭");
} catch (error) {
  if (page) await page.screenshot({ path: new URL("temp/ui-smoke-failure.png", ROOT).pathname.slice(1) }).catch(() => {});
  console.error("FAIL ui-smoke:", error.message);
  if (problems.length) console.error(problems.join("\n"));
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  fs.rmSync(SMOKE_DOCS, { recursive: true, force: true });
  stub.close();
  // 테스트가 만든 원고 파일은 지운다(사용자 원고와 섞이지 않게)
  for (const id of savedIds) fs.rmSync(new URL(`.article-workspace/articles/${id}.json`, ROOT), { force: true });
}
