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
  subtitle_editorial_finish: { subtitle_1: "스텁 부제 하나", subtitle_2: "스텁 부제 둘", subtitle_3: "스텁 부제 셋" }, // su4228 v30 최종 교열 단계
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
const PLATFORM_STUB = fs.mkdtempSync(path.join(os.tmpdir(), "ainews-platform-"));
fs.writeFileSync(path.join(PLATFORM_STUB, "core-adapter.js"), `
// 코어는 첫 줄에 작업을 보내고 stdin 을 닫지 않는다(외부 AI 응답용 통로) — 첫 줄만 읽는다
require("readline").createInterface({ input: process.stdin }).once("line", (line) => {
  const input = JSON.parse(line || "{}");
  let result;
  if (input.action === "keywords") {
    result = { candidates: [
      { keyword: "스모크 핵심", reason: "기사의 핵심 내용", source_evidence: ["스모크 테스트 본문입니다."] },
      { keyword: "검증 키워드", reason: "두 번째 후보", source_evidence: ["스모크 테스트 본문입니다."] }
    ] };
  } else if (input.action === "generate") {
    const p = input.platform;
    const common = { article_id: "smoke", platform: p, validation_status: "not_checked" };
    if (p === "instagram") result = { success: true, draft: {
      ...common, opening: "스모크 인스타그램 도입", paragraphs: ["스모크 인스타그램 본문"],
      closing: "스모크 인스타그램 마무리", hashtags: ["#스모크", "#뉴스룸", "#검증"],
      block_evidence: { opening: ["스모크 테스트 본문입니다."], paragraphs: [["스모크 테스트 본문입니다."]], closing: ["스모크 테스트 본문입니다."] }
    }};
    else if (p === "threads") result = { success: true, draft: {
      ...common, opening: "스모크 Threads 제목", paragraphs: ["스모크 Threads 본문"], closing: "",
      block_evidence: { opening: ["스모크 테스트 본문입니다."], paragraphs: [["스모크 테스트 본문입니다."]], closing: [] },
      block_evidence_valid: { opening: true, paragraphs: [true] }
    }};
    else if (p === "blog") result = { success: true, draft: {
      ...common, title: "스모크 Blog 제목", intro: "스모크 Blog 도입",
      sections: [{ section_id: "S1", heading: "스모크 소제목", body: "스모크 Blog 본문", source_evidence: ["스모크 테스트 본문입니다."], evidence_valid: true }],
      conclusion: "스모크 Blog 결론", source_evidence: ["스모크 테스트 본문입니다."], evidence_valid: true
    }};
    else result = { success: true, draft: {
      ...common, recommended_card_count: 3, card_count_reason: "스모크 구성",
      core_text: { headline: "스모크 카드", summary: "스모크 요약", source_evidence: ["스모크 테스트 본문입니다."], evidence_valid: true },
      cards: ["cover","body","closing"].map((role, index) => ({
        card_id: "C" + (index + 1), page: index + 1, role,
        content: { keyword: "스모크", headline: "스모크 카드 " + (index + 1), body: "스모크 카드 본문" },
        source_evidence: ["스모크 테스트 본문입니다."], evidence_valid: true,
        design: { layout: "standard", highlights: [], compact: false }
      }))
    }};
  } else {
    process.stdout.write(JSON.stringify({ ok: false, status: 400, error: "unknown action" }) + "\\n", () => process.exit(0));
    return;
  }
  process.stdout.write(JSON.stringify({ ok: true, result }) + "\\n", () => process.exit(0));
});
`, "utf8");

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
    PLATFORM_GENERATOR_DIR: PLATFORM_STUB,
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
  page.setDefaultTimeout(60_000); // 전체 파이썬 시험 직후처럼 PC 가 바쁠 때 30초 기본값을 넘는 경우가 있었다
  page.on("console", (m) => m.type() === "error" && !/status of (503|422|401)/.test(m.text()) && problems.push("console: " + m.text()));
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

  // 로그인·모델 설치는 브라우저에서 고정 응답: 실제 인증·다운로드를 전혀 호출하지 않는다.
  let session = { signedIn: false, email: null, userId: null, expiresIn: 0, supabase: true, backend: true,
    autoLogin: { available: false, enabled: false, email: "", error: "" } };
  let finishSignIn, onSignInStarted;
  const reply = (route, data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  await page.route("**/api/session", async (route) => {
    if (route.request().method() === "POST") {
      const { email, password } = route.request().postDataJSON();
      await new Promise((resolve) => { finishSignIn = resolve; onSignInStarted(); }); // 응답 전에 busy·비밀번호 초기화 확인
      if (password === "bad-password") return reply(route, { error: "이메일 또는 비밀번호를 확인해 주세요." }, 401);
      session = { ...session, signedIn: true, email, userId: "smoke-user", expiresIn: 3600 };
    }
    return reply(route, session);
  });
  await page.route("**/api/session/**", (route) => {
    if (route.request().url().endsWith("/auto")) {
      const { enabled } = route.request().postDataJSON();
      session = { ...session, signedIn: enabled, email: enabled ? "dev@example.test" : null,
        autoLogin: { ...session.autoLogin, enabled } };
    } else {
      session = { ...session, signedIn: false, email: null, userId: null, expiresIn: 0 };
    }
    return reply(route, session);
  });
  const modelRows = [
    { id: "judge", label: "팩트체크 판정기", kind: "factcheck", bytesTotal: 1048576, installed: false, files: 2, filesDone: 0, sourceConfigured: true },
    { id: "embedding", label: "자료 검색 임베딩", kind: "embedding", bytesTotal: 2097152, installed: false, files: 2, filesDone: 0, sourceConfigured: true },
  ];
  let modelState = { models: modelRows, busy: false, progress: null, lastError: null };
  let modelReads = 0, installCalls = 0, installPolls = 0, activeModel;
  let installOutcome = "hold", cancelRequested = false, sourceError = true;
  await page.route(/\/api\/models(?:\/.*)?$/, (route) => {
    const url = route.request().url();
    if (url.endsWith("/install")) {
      installCalls += 1;
      if (sourceError) {
        sourceError = false;
        return reply(route, { error: "모델 원본 주소가 없습니다." }, 503);
      }
      activeModel = modelRows.find((m) => m.id === route.request().postDataJSON().modelId);
      assert.ok(activeModel, "설치 요청은 modelId 를 전달해야 합니다");
      installPolls = 0;
      cancelRequested = false;
      modelState = { ...modelState, busy: true, lastError: null,
        progress: { model: "", bytesDone: 0, bytesTotal: activeModel.bytesTotal, file: "model.onnx", startedAt: 1 } };
    } else if (url.endsWith("/cancel")) {
      cancelRequested = true; // core.cancel() 처럼 작업이 끝날 때까지 busy 유지
    } else {
      modelReads += 1;
      if (modelState.busy) {
        installPolls += 1;
        if (cancelRequested || (installPolls >= 2 && installOutcome === "error")) {
          modelState = { ...modelState, busy: false, progress: null,
            lastError: cancelRequested ? null : { status: 504, message: "모델 서버에 연결하지 못했어요." } };
        } else if (installPolls >= 2 && installOutcome === "complete") {
          activeModel.installed = true;
          activeModel.filesDone = activeModel.files;
          modelState = { ...modelState, busy: false, progress: null };
        } else {
          modelState = { ...modelState, progress: { ...modelState.progress, bytesDone: activeModel.bytesTotal / 2 } };
        }
      }
    }
    return reply(route, modelState);
  });

  await page.goto(BASE);
  // 1. 코어 연결 — UI 가 계약(web/src/api)으로 /api/status·/api/session 을 받아 헤더에 반영
  await see("코어 연결됨");
  const login = page.getByTestId("login-dialog");
  // 시작할 때 로그인 창으로 가로막지 않고, 작업을 막지 않는 안내 띠만 보인다(포커스를 빼앗지 않음)
  const loginHint = page.getByTestId("login-hint");
  await loginHint.waitFor();
  assert.equal(await login.count(), 0, "시작할 때 로그인 창이 작업을 가로막지 않아야 합니다");
  await loginHint.getByRole("button", { name: "로그인", exact: true }).click();
  await login.waitFor();
  assert.equal(await page.getByTestId("login-email").evaluate((el) => el === document.activeElement), true);
  await login.getByRole("button", { name: "나중에", exact: true }).click();
  await go("보관함");
  await go("기사 작성");
  assert.equal(await login.count(), 0, "닫은 로그인 창이 다시 열리지 않아야 합니다");
  await page.locator("header").getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByTestId("login-email").fill("reporter@example.test");
  await page.getByTestId("login-password").fill("bad-password");
  let signInStarted = new Promise((resolve) => { onSignInStarted = resolve; });
  await page.getByTestId("login-submit").click();
  await signInStarted;
  await page.waitForFunction(() => document.querySelector('[data-testid="login-submit"]')?.disabled);
  assert.equal(await page.getByTestId("login-password").inputValue(), "");
  finishSignIn();
  await page.getByTestId("login-error").getByText("이메일 또는 비밀번호를 확인해 주세요.").waitFor();
  assert.equal(await page.getByTestId("login-error").getAttribute("role"), "alert");
  await page.getByTestId("login-password").fill("valid-password");
  signInStarted = new Promise((resolve) => { onSignInStarted = resolve; });
  await page.getByTestId("login-submit").click();
  await signInStarted;
  assert.equal(await page.getByTestId("login-password").inputValue(), "");
  finishSignIn();
  await login.waitFor({ state: "detached" });
  await page.locator("header").getByText("reporter@example.test", { exact: true }).waitFor();
  await page.getByTestId("logout-button").click();
  await page.locator("header").getByRole("button", { name: "로그인", exact: true }).waitFor();
  assert.equal(await login.count(), 0, "로그아웃 뒤에는 안내를 다시 강제로 열지 않습니다");
  await page.locator("header").getByRole("button", { name: "로그인", exact: true }).click();
  assert.equal(await page.getByTestId("login-password").inputValue(), "", "성공한 로그인 뒤에도 비밀번호를 보관하지 않습니다");
  await page.keyboard.press("Escape");
  await login.waitFor({ state: "detached" });
  // 나머지 기존 단계의 새로고침에서는 로그인한 상태로 유지한다.
  session = { ...session, signedIn: true, email: "reporter@example.test" };

  const models = page.getByTestId("models-dialog");
  const noMorePolling = async () => {
    const reads = modelReads;
    await page.waitForTimeout(1300);
    assert.equal(modelReads, reads, "설치가 끝나거나 창을 닫으면 폴링이 멈춰야 합니다");
  };
  await page.locator("header").getByRole("button", { name: "모델 설치", exact: true }).click();
  await models.getByText("미설치 모델 전체 용량: 3.0 MB", { exact: true }).waitFor();
  assert.equal(installCalls, 0, "모델 설치는 자동으로 시작하지 않습니다");
  await noMorePolling();
  await page.getByTestId("models-install").first().click();
  await models.getByRole("alert").getByText("모델 원본 주소가 없습니다.").waitFor();
  await page.getByTestId("models-install").first().click();
  await page.getByTestId("models-progress").getByText(/50%/).waitFor();
  assert.equal(await page.getByTestId("models-install").first().isDisabled(), true);
  await page.getByTestId("models-cancel").click();
  await page.getByTestId("models-progress").waitFor({ state: "detached" });
  assert.equal(await models.getByText(/미설치 · 파일/).count(), 2);
  await noMorePolling();
  installOutcome = "error";
  await page.getByTestId("models-install").first().click();
  await models.getByRole("alert").getByText("모델 서버에 연결하지 못했어요.").waitFor();
  await noMorePolling();
  installOutcome = "hold";
  await page.getByTestId("models-install").first().click();
  await page.getByTestId("models-progress").waitFor();
  await page.keyboard.press("Escape");
  await models.waitFor({ state: "detached" });
  await noMorePolling();
  installOutcome = "complete";
  await page.getByRole("button", { name: "모델 설치 설정", exact: true }).click();
  await models.getByText("미설치 모델 전체 용량: 2.0 MB", { exact: true }).waitFor();
  await page.getByTestId("models-install").click();
  await models.getByText("모두 설치됨", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("models-install").count(), 0);
  await noMorePolling();
  await models.getByRole("button", { name: "닫기", exact: true }).click();

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

  // 3-1. 로컬 사진 → PhotoEditor → 편집본을 기사에 반영
  await page.getByRole("button", { name: /사진·미디어 편집/ }).click();
  await page.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').setInputFiles({
    name: "smoke.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==", "base64"),
  });
  const photoEditor = page.getByTestId("photo-editor");
  await photoEditor.waitFor();
  await photoEditor.getByRole("button", { name: "1:1" }).click();
  await photoEditor.getByLabel("사진 설명").fill("스모크 사진");
  await photoEditor.getByRole("button", { name: "본문에 넣기" }).click();
  await see("편집본을 반영하고 본문 끝에 사진 태그를 삽입했습니다.");

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
  else {
    await page.getByTestId("factcheck-error").getByText("설치", { exact: false }).first().waitFor();
    await page.getByTestId("factcheck-error").getByRole("button", { name: "모델 설치 열기" }).click();
    await models.getByText("모두 설치됨", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
  }
  // 이미 검증한 문장은 다시 보내지 않는다 — 문장 하나를 덧붙이면 그 문장만 코어로
  if (factcheckReady) {
    const next = page.waitForRequest((r) => r.url().endsWith("/api/factcheck/run"), { timeout: 15_000 });
    await body.fill((await body.inputValue()) + " 고친 문장을 하나 더 씁니다.");
    assert.deepEqual(JSON.parse((await next).postData()).nodes.map((n) => n.text), ["고친 문장을 하나 더 씁니다."]);
  }
  // 등록한 자료 이름을 누르면 추출 본문을 볼 수 있다
  await page.getByRole("button", { name: "자료.txt" }).click();
  await page.getByRole("dialog", { name: "취재자료 보기" }).getByText("스모크 테스트 본문입니다.").waitFor();
  // 개발 실행이면 청크 보기(청크별 색 밑줄)가 있다
  await page.getByRole("button", { name: "청크 보기 (개발)" }).click();
  await page.getByTestId("chunk-view").getByText(/청크 [1-9][0-9]*개/).waitFor();
  await page.getByRole("dialog", { name: "취재자료 보기" }).getByTitle("닫기").click();
  // 검증 결과는 본문 뒤 하이라이트 층에 칠해진다(판정은 엔진 몫이라 층이 있는지만 본다)
  await page.getByTestId("fact-highlight").waitFor({ state: "attached" });
  // 순서형 검사: 코어가 불일치로 판정한 문장이 있으면 한 건씩 보여 준다(엔진 결과에 기대지 않도록 응답을 고정한다)
  await page.route("**/api/factcheck/run", (route) => {
    const nodes = JSON.parse(route.request().postData()).nodes;
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: nodes.map((n) => ({
      node_id: n.id, status: "CONFLICT", claim: n.text, reason: "스모크 불일치 사유", evidence: { text: "스모크 근거 문장", material_title: "자료.txt" },
    })) }) });
  });
  await body.fill((await body.inputValue()) + " 순서형 검사용 새 문장을 하나 더 씁니다.");
  const sequence = page.getByTestId("fact-sequence");
  await sequence.getByText("문제 문장:").waitFor({ timeout: 15_000 });
  await sequence.getByText("스모크 불일치 사유").waitFor();
  await sequence.getByRole("button", { name: /다음|검사 종료/ }).click();
  await page.unroute("**/api/factcheck/run");
  // 저장 이력: 목록 → 미리보기(읽기 전용) → 옛 저장본으로 복원(이력은 그대로 남는다)
  await page.getByTestId("save-status").getByText("자동 저장됨").waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "저장 이력" }).click();
  const history = page.getByTestId("version-history");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="revision-list"] button').length >= 2);
  const countBefore = await history.getByTestId("revision-list").locator("button").count();
  await history.getByTestId("revision-list").locator("button").nth(1).click(); // 바로 앞 저장본(내용이 남아 있어 뒤 단계에 영향 없음)
  await history.getByTestId("revision-preview").locator("h3").waitFor();
  await history.getByTestId("revision-restore").click();
  await history.getByTestId("revision-restore-confirm").click();
  await see("선택한 저장본으로 복원했습니다.");
  await page.getByRole("button", { name: "저장 이력" }).click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="revision-list"] button').length > n, countBefore);
  await page.getByTestId("version-history").getByRole("button", { name: "닫기" }).click();
  // 5. 취재자료 검색 창
  await page.getByText("취재자료 검색").first().click();
  await page.getByPlaceholder("자료 이름 검색").waitFor();
  // 앞에서 올린 자료가 코어 저장소(GET /api/sources)에서 목록으로 보인다
  await page.getByRole("heading", { name: "자료.txt", exact: true }).waitFor();
  await page.getByRole("button", { name: "×" }).click(); // 창 닫기(Escape 는 지원 안 함)
  await page.getByPlaceholder("자료 이름 검색").waitFor({ state: "detached" });
  // 6. 플랫폼 변환: FormatConverter UI -> App Core -> platform-generator 어댑터
  await go("플랫폼 변환");
  const converter = page.getByTestId("format-converter");
  await converter.getByText("플랫폼 콘텐츠 편집실").waitFor();
  await converter.getByRole("button", { name: /추천/ }).click();
  await converter.getByRole("button", { name: /스모크 핵심/ }).click();
  await converter.getByRole("button", { name: "선택 항목 생성" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="format-converter"] textarea')].some((el) => el.value === "스모크 인스타그램 도입"), null, { timeout: 15_000 });
  await converter.getByText("2/2개 결과를 실제 생성 엔진에서 받아왔습니다.").waitFor();
  // 보고 있는 항목만 다시 생성(원본 platform-generator 의 개별 생성 버튼)
  await converter.getByTestId("generate-active").click();
  await converter.getByText("1/1개 결과를 실제 생성 엔진에서 받아왔습니다.").waitFor();

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
  // 플랫폼 생성 결과도 같은 암호화 원고에 저장되어 재시작 후 복원돼야 한다.
  await go("플랫폼 변환");
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="format-converter"] textarea')].some((el) => el.value === "스모크 인스타그램 도입"), null, { timeout: 10_000 });
  await go("기사 작성");
  // 7. 좁은 화면에서도 첫 화면이 오류 없이 그려지는지
  // 개발 계정 자동 로그인이 사용 가능하면 로그인 안내를 띄우지 않고 기존 토글도 동작한다.
  session = { ...session, signedIn: false, email: null,
    autoLogin: { available: true, enabled: false, email: "dev@example.test", error: "" } };
  await page.reload();
  const autoLogin = page.getByTestId("auto-login-toggle");
  await autoLogin.waitFor();
  assert.equal(await login.count(), 0);
  await autoLogin.click();
  await page.locator("header").getByText("dev@example.test", { exact: true }).waitFor();
  await autoLogin.click();
  await page.locator("header").getByRole("button", { name: "로그인", exact: true }).waitFor();
  assert.equal(await login.count(), 0);
  session = { ...session, autoLogin: { ...session.autoLogin, enabled: true } };
  await page.reload();
  await autoLogin.getByText(/켜짐/).waitFor();
  assert.equal(await login.count(), 0, "자동 로그인이 켜져 있으면 실패 상태여도 안내를 강제로 열지 않습니다");
  session = { ...session, signedIn: true, email: "reporter@example.test",
    autoLogin: { available: false, enabled: false, email: "", error: "" } };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  // 좁은 화면에서는 상태 배지를 일부러 숨긴다(hidden sm:inline-flex) → 그려졌는지만 본다
  await page.getByText("코어 연결됨").first().waitFor({ state: "attached", timeout: 10_000 });
  await page.locator("header").getByRole("button", { name: "모델 설치", exact: true }).click();
  await models.getByText("모두 설치됨", { exact: true }).waitFor();
  const modelsBounds = await models.boundingBox();
  assert.ok(modelsBounds.x >= 0 && modelsBounds.x + modelsBounds.width <= 390);
  assert.equal(await models.evaluate((el) => el.scrollWidth > el.clientWidth), false);
  await page.keyboard.press("Escape");
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
  console.log("PASS ui-smoke: 로그인·로그아웃·개발 자동 로그인·모델 설치/취소/오류/폴링·코어 연결·제목/부제 추천·흐름 요약·자동 저장·사진 찾기·PhotoEditor·팩트체크 서랍·자료 검색·실제 platform-generator 경계·보관함·녹취 전사·모바일 폭");
} catch (error) {
  if (page) await page.screenshot({ path: new URL("temp/ui-smoke-failure.png", ROOT).pathname.slice(1) }).catch(() => {});
  console.error("FAIL ui-smoke:", error.message);
  if (problems.length) console.error(problems.join("\n"));
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  fs.rmSync(SMOKE_DOCS, { recursive: true, force: true });
  fs.rmSync(PLATFORM_STUB, { recursive: true, force: true });
  stub.close();
  // 테스트가 만든 원고 파일은 지운다(사용자 원고와 섞이지 않게)
  for (const id of savedIds) fs.rmSync(new URL(`.article-workspace/articles/${id}.json`, ROOT), { force: true });
}
