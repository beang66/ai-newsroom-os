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
import { fileURLToPath } from "node:url";
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
    const common = { article_id: input.payload.article.article_id, platform: p, validation_status: "not_checked" };
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
  } else if (input.action === "validate") {
    result = {success:true,validation:{platform:input.payload.platform,status:'passed',fact:{issue_count:0,issues:[]},requirement:{issue_count:0,issues:[]}}};
  } else if (input.action === "render") {
    // 카드 이미지: 2x2 JPEG 를 base64 로 돌려준다(코어가 암호화 저장소에 MediaAsset 으로 등록)
    result = { card_id: input.payload.card_id, mime_type: "image/jpeg", data: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDk6KKKAP/Z" };
  } else {
    process.stdout.write(JSON.stringify({ ok: false, status: 400, error: "unknown action" }) + "\\n", () => process.exit(0));
    return;
  }
  process.stdout.write(JSON.stringify({ ok: true, result }) + "\\n", () => process.exit(0));
});
`, "utf8");

// SNS 화면 경계는 실제 계정과 분리한다. Core가 vault에서 읽은 JPG 순서·원고를 어댑터에 전달한다.
fs.writeFileSync(path.join(PLATFORM_STUB,'sns-adapter.js'),`
const lines=require('readline').createInterface({input:process.stdin}),active={};
lines.on('line',line=>{
 const input=JSON.parse(line);let result;
 if(input.action==='prepare'){
  const files=input.payload.assets;
  if(!files.every((file,i)=>file.order===i+1&&file.mime==='image/jpeg'&&file.data_url.startsWith('data:image/jpeg;base64,/9j/')))throw Error('ordered JPG required');
  if(!input.payload.text.includes('\\n\\n'))throw Error('paragraph breaks required');
  active[input.platform]=true;
  result={success:true,image_count:files.length,username:'fixture_owner',message:'fixture: 작성 준비 완료'};
 }else{
  if(input.action==='connect')active[input.platform]=true;
  if(input.action==='close')active[input.platform]=false;
  result={success:true,connected:!!active[input.platform],reason:active[input.platform]?null:'browser_closed',username:'fixture_owner',browser:'fixture'};
 }
 process.stdout.write(JSON.stringify({id:input.id,ok:true,result})+'\\n');
});
lines.on('close',()=>process.exit(0));
`,'utf8');

const server = spawn(process.env.PYTHON || "python", ["app/server.py"], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT,
    // 원고·취재자료(암호화 저장소 vault.db 포함)는 임시 폴더에 — 실제 데이터와 키 저장소 항목 외에는 건드리지 않는다
    AI_NEWSROOM_DOCUMENTS: SMOKE_DOCS,
    AI_NEWSROOM_APPDATA: path.join(SMOKE_DOCS, "appdata"),
    AI_NEWSROOM_SKIP_DOTENV: "1", // 개발자의 실제 키·테스트 계정을 읽지 않는다
    AI_NEWSROOM_FIXED_USER: "ui-smoke-user", // 계정마다 저장소가 따로라 코어는 이 사용자로 로그인한 것으로 본다(브라우저의 세션 목업과 별개)
    AI_NEWSROOM_KEY_SERVICE: "AI Newsroom (ui-smoke)",
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
const expectedDbFailureUrls = new Set();
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
  page.on("console", (m) => m.type() === "error" && !/status of (503|422|401)/.test(m.text())
    && !(/status of 404/.test(m.text()) && expectedDbFailureUrls.has(m.location().url)) && problems.push("console: " + m.text()));
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("response", async (r) => {
    // 503 = 모델·런타임 미설치(정상 상태) — 화면이 안내를 띄우는지는 단계에서 따로 본다; 422 = 깨진 자료 파일(4단계에서 일부러 올림)
    if (r.url().includes("/api/") && r.status() >= 500 && r.status() !== 503) problems.push(`${r.status()} ${r.url()}`);
    if (r.url().endsWith("/api/articles/save") && r.ok()) savedIds.add((await r.json()).articleId);
  });
  // 화면의 alert 가 테스트를 멈추지 않게. 기사 전환 때 '저장하고 열까요?'는 수락(수동 저장 뒤 전환)
  page.on("dialog", (d) => (/저장하지 않은 변경|삭제할까요/.test(d.message()) ? d.accept() : d.dismiss()));

  const see = (text) => page.getByText(text, { exact: false }).first().waitFor({ timeout: 10_000 });
  // 사이드바(main 디자인)의 메뉴 이름 — 접힌 상태에서는 버튼 title 로 보인다
  const NAV = { "오늘의 데스크": "오늘의 데스크", "기사 작성": "기사 작성", "녹음 파일": "인터뷰·녹취", "플랫폼 변환": "변환·배포", "데이터맵": "데이터맵", "보관함": "보관함" };
  const go = async (title) => {
    await page.locator(`button[title="${NAV[title] || title}"]`).first().click();
    await page.getByTestId('page-heading').filter({ hasText: NAV[title] || title }).waitFor();
  };
  fs.mkdirSync(new URL('temp/', ROOT), { recursive: true });
  const snapshot = (name) => page.screenshot({ path: fileURLToPath(new URL(`temp/${name}.png`, ROOT)), fullPage: true });

  // 로그인·모델 설치는 브라우저에서 고정 응답: 실제 인증·다운로드를 전혀 호출하지 않는다.
  let session = { signedIn: true, email: "reporter@example.test", userId: "smoke-user", expiresIn: 3600, supabase: true, backend: true,
    autoLogin: { available: false, enabled: false, email: "", error: "" } };
  let finishSignIn, onSignInStarted;
  const signupCalls = [];
  const signInRemember = [];
  const reply = (route, data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  await page.route("**/api/session", async (route) => {
    if (route.request().method() === "POST") {
      const { email, password, remember } = route.request().postDataJSON();
      signInRemember.push(remember);
      await new Promise((resolve) => { finishSignIn = resolve; onSignInStarted(); }); // 응답 전에 busy·비밀번호 초기화 확인
      if (password === "bad-password") return reply(route, { error: "이메일 또는 비밀번호를 확인해 주세요." }, 401);
      session = { ...session, signedIn: true, email, userId: "smoke-user", expiresIn: 3600 };
    }
    return reply(route, session);
  });
  await page.route("**/api/session/**", (route) => {
    if (route.request().url().endsWith("/signup")) {
      const { email, password } = route.request().postDataJSON();
      signupCalls.push({ email, passwordLength: password.length });
      return reply(route, { ...session, signedIn: false, needsConfirmation: true });
    }
    if (route.request().url().endsWith("/keep")) {
      session = { ...session, keepLogin: route.request().postDataJSON().enabled };
      return reply(route, session);
    }
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

  let latestAttempts = 0;
  const latestRoute = /\/api\/articles\/latest(?:\?.*)?$/;
  await page.route(latestRoute, (route) => {
    latestAttempts += 1;
    return latestAttempts === 1
      ? reply(route, { error: "최근 원고 조회 테스트 오류" }, 503)
      : route.continue();
  });
  await page.goto(BASE);
  await page.getByRole("alert").getByText("최근 원고 조회 테스트 오류").waitFor();
  assert.equal(await page.getByPlaceholder("기사 본문을 입력하세요. 자유롭게 문단을 작성할 수 있습니다...").count(), 0);
  assert.equal(savedIds.size, 0, "조회 실패 중에는 빈 원고를 저장하지 않는다");
  await page.getByRole("button", { name: "다시 불러오기" }).click();
  await page.getByTestId("desk-view").waitFor();
  await snapshot('prototype-ux-desk');
  assert.equal(await page.getByTestId("data-map").count(), 0);
  await go("기사 작성");
  await page.getByPlaceholder("기사 본문을 입력하세요. 자유롭게 문단을 작성할 수 있습니다...").waitFor();
  assert.equal(latestAttempts, 2);
  await page.unroute(latestRoute);

  // 첫 저장이 지연되는 동안 새 편집을 큐에 넣어 같은 원고 ID로 순서대로 저장한다.
  const saveRoute = "**/api/articles/save";
  let releaseFirst, firstStarted;
  const started = new Promise((resolve) => { firstStarted = resolve; });
  const held = new Promise((resolve) => { releaseFirst = resolve; });
  const savePayloads = [];
  await page.route(saveRoute, async (route) => {
    savePayloads.push(route.request().postDataJSON());
    if (savePayloads.length === 1) {
      firstStarted();
      await held;
    }
    return route.continue();
  });
  const queueBody = page.getByPlaceholder("기사 본문을 입력하세요. 자유롭게 문단을 작성할 수 있습니다...");
  await queueBody.fill("첫 저장");
  await started;
  await queueBody.fill("두 번째 저장");
  await page.waitForTimeout(1700);
  assert.equal(savePayloads.length, 1, "첫 요청이 끝나기 전에 두 번째 저장을 시작하지 않는다");
  releaseFirst();
  await page.getByTestId("save-status").getByText("임시 저장됨").waitFor();
  assert.equal(savePayloads.length, 2);
  assert.equal(savePayloads[1].draft.articleId, [...savedIds][0]);
  const queueSaved = await (await page.request.get(`${BASE}/api/articles/latest`)).json();
  assert.equal(queueSaved.draft.content, "두 번째 저장");
  await page.unroute(saveRoute);
  const cleared = page.waitForResponse((response) => response.url().endsWith('/api/articles/save') && response.ok());
  await queueBody.fill("");
  await cleared;
  await page.getByTestId("save-status").getByText("임시 저장됨").waitFor();
  // 1. 코어 연결 — UI 가 계약(web/src/api)으로 /api/status·/api/session 을 받아 헤더에 반영
  await see("코어 연결됨");
  const login = page.getByTestId("login-dialog");
  // 로그인한 상태에서는 로그인 창이 열리지 않고, 로그아웃하면 화면을 비우고(새로고침) 닫을 수 없는 로그인 창이 뜬다
  assert.equal(await login.count(), 0, "로그인한 상태에서는 로그인 창이 없어야 합니다");
  await page.locator("header").getByText("reporter@example.test", { exact: true }).waitFor();
  await page.getByTestId("logout-button").click();
  await login.waitFor();
  assert.equal(await login.getByRole("button", { name: "나중에", exact: true }).count(), 0, "로그인 전에는 건너뛸 수 없어야 합니다");
  assert.equal(await login.getByRole("button", { name: "닫기", exact: true }).count(), 0, "로그인 전에는 창을 닫을 수 없어야 합니다");
  await page.keyboard.press("Escape");
  assert.equal(await login.count(), 1, "Esc 로도 닫히지 않아야 합니다");
  assert.equal(await page.getByTestId("login-email").evaluate((el) => el === document.activeElement), true);
  // 회원가입: 비밀번호 확인이 다르면 보내지 않고, 이메일 확인이 켜져 있으면 안내 후 로그인 화면으로 돌아온다
  await page.getByTestId("login-mode-toggle").click();
  await page.getByTestId("signup-confirm").waitFor();
  await page.getByTestId("login-email").fill("new@example.test");
  await page.getByTestId("login-password").fill("long-enough-1");
  await page.getByTestId("signup-confirm").fill("different-1");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("login-error").getByText("비밀번호 확인이 일치하지 않아요.").waitFor();
  assert.equal(signupCalls.length, 0, "확인이 다르면 가입 요청을 보내지 않습니다");
  await page.getByTestId("login-password").fill("long-enough-1");
  await page.getByTestId("signup-confirm").fill("long-enough-1");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("login-notice").getByText(/확인 메일/).waitFor();
  assert.deepEqual(signupCalls, [{ email: "new@example.test", passwordLength: 13 }]);
  assert.equal(await page.getByTestId("signup-confirm").count(), 0, "안내 뒤에는 로그인 화면으로 돌아옵니다");
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
  await page.getByTestId("login-remember").check();
  signInStarted = new Promise((resolve) => { onSignInStarted = resolve; });
  await page.getByTestId("login-submit").click();
  await signInStarted;
  assert.equal(await page.getByTestId("login-password").inputValue(), "");
  finishSignIn();
  await login.waitFor({ state: "detached" });
  assert.deepEqual(signInRemember, [false, true], "로그인 유지 체크는 기본 꺼짐이고, 켜면 요청에 실린다");
  await page.locator("header").getByText("reporter@example.test", { exact: true }).waitFor();
  await go("보관함");
  await go("기사 작성");
  assert.equal(await login.count(), 0, "로그인한 뒤에는 로그인 창이 다시 열리지 않아야 합니다");
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
  await page.locator("header").getByRole("button", { name: "모델 설치", exact: true }).click();
  await models.getByText("미설치 모델 전체 용량: 2.0 MB", { exact: true }).waitFor();
  await page.getByTestId("models-install").click();
  await models.getByText("모두 설치됨", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("models-install").count(), 0);
  await noMorePolling();
  await models.getByRole("button", { name: "닫기", exact: true }).click();

  // 환경 설정은 모델 설치와 별개 창: 클라우드 백업은 기본 켜짐이고 끄면 다시 열어도 꺼져 있다
  const settings = page.getByTestId("settings-dialog");
  await page.getByRole("button", { name: "환경 설정", exact: true }).click();
  await settings.waitFor();
  assert.equal(await page.getByTestId("models-install").count(), 0, "환경 설정 창에는 모델 설치가 없어야 합니다");
  await page.waitForFunction(() => document.querySelector('[data-testid="settings-cloud-backup"]')?.disabled === false);
  assert.equal(await page.getByTestId("settings-cloud-backup").isChecked(), true, "클라우드 백업 기본값은 켜짐");
  await page.getByTestId("settings-cloud-backup").uncheck();
  await settings.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "환경 설정", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="settings-cloud-backup"]')?.disabled === false);
  assert.equal(await page.getByTestId("settings-cloud-backup").isChecked(), false, "끈 설정이 유지됨");
  await page.getByTestId("settings-cloud-backup").check();
  // 로그인 유지: 로그인 때 켠 상태가 반영되고, 설정에서 끄고 켤 수 있다
  session = { ...session, keepLogin: true };
  await page.reload();
  await page.locator('header').getByText('reporter@example.test',{exact:true}).waitFor();
  await page.getByRole("button", { name: "환경 설정", exact: true }).click();
  await settings.waitFor();
  await page.getByTestId("settings-keep-login").waitFor();
  assert.equal(await page.getByTestId("settings-keep-login").isChecked(), true);
  await page.getByTestId("settings-keep-login").uncheck();
  await page.waitForFunction(() => document.querySelector('[data-testid="settings-keep-login"]')?.checked === false);
  assert.equal(session.keepLogin, false, "끄면 코어에 알린다");
  // 문제 보고: 진단 정보를 만들어 보여 주고, 개인 정보(이메일)는 들어 있지 않다
  await page.getByTestId("settings-copy-diagnostics").click();
  const diagText = await page.getByTestId("settings-diagnostics-text").inputValue();
  assert.match(diagText, /앱 버전: /);
  assert.match(diagText, /파이프라인: /);
  assert.equal(diagText.includes("reporter@example.test"), false, "진단 정보에 이메일이 없어야 합니다");
  // 팩트체크 로컬 모델 사용: 기본 켜짐, 끄면 유지(끄면 모든 문장을 외부 모델이 판정)
  assert.equal(await page.getByTestId("settings-local-factcheck").isChecked(), true, "로컬 팩트체크 기본값은 켜짐");
  await page.getByTestId("settings-local-factcheck").uncheck();
  await settings.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "환경 설정", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="settings-local-factcheck"]')?.disabled === false);
  assert.equal(await page.getByTestId("settings-local-factcheck").isChecked(), false, "끈 로컬 팩트체크 설정이 유지됨");
  await page.getByTestId("settings-local-factcheck").check();
  await settings.getByRole("button", { name: "닫기", exact: true }).click();

  // 목업 없이 빈 원고로 시작해야 한다
  const body = page.getByPlaceholder("기사 본문을 입력하세요. 자유롭게 문단을 작성할 수 있습니다...");
  assert.equal(await body.inputValue(), "");
  assert.equal(await page.getByPlaceholder("기사 제목을 입력하거나 AI 추천을 확인하세요").inputValue(), "");
  // 추천은 본문 20자, 사진 검색어는 80자 이상부터
  await body.fill("스모크 테스트 본문입니다. ".repeat(8));

  // 2. 편집 보조(옛 시험 UI 기능 이식): 제목·부제 추천, 흐름 요약, 자동 저장
  await page.getByRole("button", { name: "AI 추천" }).first().click(); // 제목 추천(부제와 같은 방식)
  await page.getByRole("button", { name: "스텁 제목 둘" }).click();
  assert.equal(await page.getByPlaceholder("기사 제목을 입력하거나 AI 추천을 확인하세요").inputValue(), "스텁 제목 둘");
  await page.getByRole("button", { name: "AI 추천" }).nth(1).click(); // 부제 추천
  await page.getByRole("button", { name: "스텁 부제 하나" }).click();
  assert.equal(await page.getByPlaceholder("기사 부제를 입력하세요").inputValue(), "스텁 부제 하나");
  await see("임시 저장됨"); // 제목·부제가 바뀌었으니 1.5초 뒤 코어에 저장
  // (흐름 요약은 10-08 미리보기 정리 때 뺐다)

  // 3. 사진 검색하기: 본문 기반 검색어 → Unsplash 검색 결과 3장
  await page.getByRole("button", { name: "사진 넣기", exact: true }).click();
  await page.getByRole("menuitem", { name: "사진 검색하기" }).click();
  const photoSearch = page.getByTestId("photo-search");
  await photoSearch.getByRole("button", { name: "stub wafer" }).click();
  await photoSearch.getByTestId("photo-card").nth(2).locator("img").waitFor();
  await photoSearch.getByRole("button", { name: "닫기" }).click();

  // 3-1. 사진 첨부하기: 내 파일 → 사진 편집 → 본문에 넣기(본문에 사진 자리 한 줄)
  await page.getByRole("button", { name: "사진 넣기", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "사진 첨부하기" }).click();
  await (await chooser).setFiles({
    name: "smoke.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==", "base64"),
  });
  const imageEditor = page.getByTestId("image-editor");
  await imageEditor.waitFor();
  await imageEditor.getByLabel("사진 설명").fill("스모크 사진");
  await imageEditor.getByTestId("image-apply").click();
  await imageEditor.waitFor({ state: "detached" });
  await page.getByTestId("body-with-photos").locator("img").first().waitFor(); // 본문 속 사진 자리에 사진이 보인다

  // 4. 작성·검토 → 팩트체크 서랍
  await page.getByText("기사 팩트체크 & 근거자료").first().click();
  await see("팩트체크 & 근거자료 검증");
  // 텍스트 자료 → 코어 runFactcheck. 모델·런타임이 없는 PC 에서는 설치 안내가 나와야 한다
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
    const sent = JSON.parse(route.request().postData());
    globalThis.__fcSnapshot = sent.snapshotId; // 전체 다시 검증이 보낸 고정본 id(아래에서 확인)
    const nodes = sent.nodes;
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: nodes.map((n) => ({
      node_id: n.id, status: "CONFLICT", claim: n.text, reason: "스모크 불일치 사유", evidence: { text: "스모크 근거 문장", material_title: "자료.txt" },
    })) }) });
  });
  // 자료 등록이 따로 저장돼야 아래 이력 복원(바로 앞 저장본)이 취재자료를 잃지 않는다
  await page.getByTestId("save-status").getByText("임시 저장됨").waitFor({ timeout: 15_000 });
  await page.keyboard.press("Control+s"); // 저장 이력에는 수동 저장만 남는다 — 취재자료가 들어간 판을 이력에 남긴다
  await page.getByTestId("save-status").getByText(/^저장됨/).waitFor({ timeout: 15_000 });
  await body.fill((await body.inputValue()) + " 순서형 검사용 새 문장을 하나 더 씁니다.");
  const sequence = page.getByTestId("fact-sequence");
  await sequence.getByText("문제 문장:").waitFor({ timeout: 15_000 });
  await sequence.getByText("스모크 불일치 사유").waitFor();
  await sequence.getByRole("button", { name: /다음|검사 종료/ }).click();
  // 전체 다시 검증: 지금 글을 고정본으로 만들어 그 기준으로 검증한다 — 요청에 snapshotId 가 실리고 서랍에 기준 버전이 보인다
  await page.getByTitle("전체 문장 다시 검증(평소에는 고친 문장만 자동으로 검증)").click();
  await page.getByTestId("factcheck-basis").waitFor({ timeout: 15_000 });
  assert.match(await page.getByTestId("factcheck-basis").innerText(), /저장 \d+번 버전의 글 기준/);
  assert.match(String(globalThis.__fcSnapshot), /^[0-9a-f-]{36}$/);
  await page.unroute("**/api/factcheck/run");
  // 저장 이력: 목록 → 미리보기(읽기 전용) → 옛 저장본으로 복원(이력은 그대로 남는다)
  // "임시 저장됨" 문구는 이전 저장 때 이미 떠 있을 수 있고, 최신 원고(latest)는 이력 목록보다 몇 ms 먼저 바뀔 수 있다.
  // 방금 쓴 문장이 **저장 이력의 최신 저장본**에 들어간 뒤에 이력을 연다 — 아니면 nth(1) 이 취재자료를 올리기 전의
  // 옛 저장본(#1)이 되어 복원 뒤 단계(취재자료 1건)가 깨진다.
  // (page.waitForFunction 은 async 조건의 Promise 를 기다리지 않고 바로 통과하므로, 노드 쪽에서 evaluate 로 반복 확인한다)
  await page.keyboard.press("Control+s");
  for (let tries = 0; ; tries += 1) {
    const saved = await page.evaluate(async () => {
      const id = (await (await fetch("/api/articles/latest")).json()).draft?.articleId;
      const list = id ? (await (await fetch(`/api/articles/${id}/revisions`)).json()).revisions : [];
      if (!list?.length) return false;
      const newest = await (await fetch(`/api/articles/${id}/revisions/${list[0].revisionNo}`)).json();
      return JSON.stringify(newest).includes("순서형 검사용 새 문장을 하나 더 씁니다.");
    });
    if (saved) break;
    assert.ok(tries < 150, "새 문장이 저장 이력에 들어가지 않았습니다");
    await page.waitForTimeout(100);
  }
  await page.getByTestId("save-status").getByText(/^저장됨/).waitFor({ timeout: 15_000 });
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
  await converter.getByText(/저장 \d+번 버전의 글 기준/).waitFor(); // 생성은 저장된 글의 고정본(snapshot) 기준으로 이루어진다
  // 보고 있는 항목만 다시 생성(원본 platform-generator 의 개별 생성 버튼)
  await converter.getByTestId("generate-active").click();
  await converter.getByText("1/1개 결과를 실제 생성 엔진에서 받아왔습니다.").waitFor();
  // 카드뉴스 완성 이미지(임시 UI): 카드뉴스 생성 → "카드 이미지 만들기" → 코어 render → MediaAsset → 미리보기
  await converter.getByText("카드뉴스도 생성").click();
  await converter.getByRole("button", { name: "카드뉴스", exact: true }).click();
  await converter.getByTestId("generate-active").click();
  await converter.getByTestId("card-image-make").click();
  const cardImage = converter.getByTestId("card-image-preview");
  await cardImage.waitFor();
  assert.match(await cardImage.getAttribute("src"), /^\/api\/media-assets\/[0-9a-f-]{36}\/file$/); // localhost 주소가 아니라 코어 경로
  await page.waitForFunction(() => { const img = document.querySelector('[data-testid="card-image-preview"]'); return img && img.complete && img.naturalWidth > 0; });
  await converter.getByRole('textbox',{name:'headline',exact:true}).fill("고친 카드 제목");
  await converter.getByText("카드·사진·위치가 변경됐습니다. 이미지를 다시 만들어 주세요.").waitFor();

  // 검수·렌더 결과가 늦게 도착해도 수정된 원고에 덮어쓰지 않는다.
  const headline=converter.getByRole('textbox',{name:'headline',exact:true});
  await converter.getByTestId('platform-validate').click();
  await converter.getByTestId('platform-review').getByText(/검수 통과/).waitFor();
  let reviewReady,reviewRelease;
  const reviewWaiting=new Promise(resolve=>{reviewReady=resolve;}),reviewHold=new Promise(resolve=>{reviewRelease=resolve;});
  await page.route('**/api/platform/validate',async route=>{const response=await route.fetch();reviewReady();await reviewHold;await route.fulfill({response});});
  await converter.getByTestId('platform-validate').click();await reviewWaiting;
  await headline.fill('검수 중 변경한 카드 제목');reviewRelease();
  await converter.getByTestId('platform-review').getByText(/결과를 적용하지 않았습니다/).waitFor();
  await converter.getByTestId('platform-review').getByText(/재검수 필요/).waitFor();
  await page.unroute('**/api/platform/validate');
  let renderReady,renderRelease;
  const renderWaiting=new Promise(resolve=>{renderReady=resolve;}),renderHold=new Promise(resolve=>{renderRelease=resolve;});
  await page.route('**/api/platform/render',async route=>{const response=await route.fetch();renderReady();await renderHold;await route.fulfill({response});});
  await converter.getByTestId('card-image-make').click();await renderWaiting;
  await headline.fill('렌더 중 변경한 카드 제목');renderRelease();
  await converter.getByTestId('card-image-error').getByText(/결과를 적용하지 않았습니다/).waitFor();
  assert.equal(await converter.getByTestId('card-image-preview').count(),0);
  await page.unroute('**/api/platform/render');
  await converter.getByTestId('card-image-make').click();await converter.getByTestId('card-image-preview').waitFor();
  // 현재 카드의 추천 입력과 직접 업로드·편집 사진의 실제 저장 경계를 확인한다.
  const cardPhoto=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;canvas.getContext('2d').fillRect(0,0,32,32);return canvas.toDataURL('image/png');});
  await converter.getByLabel('카드 사진 업로드').setInputFiles({name:'card-upload.png',mimeType:'image/png',buffer:Buffer.from(cardPhoto.split(',')[1],'base64')});
  await page.getByTestId('image-editor').getByTestId('image-apply').click();
  await converter.getByText('사진 출처: 직접 업로드').waitFor();
  let recommendation;
  await page.route('**/api/assist',async route=>{const input=route.request().postDataJSON();if(input.kind==='photo_keywords')recommendation=input;await route.continue();});
  await converter.getByRole('button',{name:'현재 카드 사진 찾기'}).click();
  await page.getByTestId('photo-keywords').getByText('stub chip',{exact:true}).waitFor();
  assert.equal(recommendation.card.content.headline,'렌더 중 변경한 카드 제목');
  await page.getByTestId('photo-search').getByLabel('닫기',{exact:true}).click();await page.unroute('**/api/assist');
  // 전체 렌더 중 두 번째 카드 실패: 성공 표시·일부 SNS 첨부를 하지 않고 카드 번호·재시도를 안내한다.
  let renderCount=0;
  await page.route('**/api/platform/render',async route=>{renderCount++;if(renderCount===2)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'fixture render failure'})});else await route.continue();});
  await converter.getByTestId('cards-export').click();
  await converter.getByTestId('delivery-status').getByText(/2번 카드.*실패/).waitFor();
  await converter.getByTestId('delivery-status').getByText(/다시 시도/).waitFor();
  await page.unroute('**/api/platform/render');

  // 실패 카드 재시도와 전체 JPG 링크, 두 채널의 팀 Core 작성 준비. 게시 작업은 없다.
  await converter.getByTestId('cards-export').click();
  await converter.getByTestId('delivery-status').getByText(/3장 JPG 다운로드를 요청/).waitFor();
  assert.equal(await converter.getByTestId('platform-delivery').locator('a[download]').count(),3);
  // 원고/카드의 고정본 혼합은 실제 원문 변경으로 만든다. 플랫폼 편집 저장만으로는 새 고정본을 만들지 않는다.
  await go('기사 작성');await body.fill((await body.inputValue())+'\n새 원문 고정본 구분 문장입니다.');await go('플랫폼 변환');
  await converter.getByRole('button',{name:/^Instagram\s*●?$/}).click();
  await converter.getByTestId('generate-active').click();
  await converter.getByText('1/1개 결과를 실제 생성 엔진에서 받아왔습니다.').waitFor();
  await converter.getByTestId('sns-prepare').click();
  await converter.getByTestId('delivery-status').getByText(/기사·고정본이 다릅니다/).waitFor();
  // 다른 원문의 고정본은 혼합하지 않는다. 세 결과를 같은 생성 작업에서 받는다.
  await converter.getByRole('button',{name:'선택 항목 생성',exact:true}).click();
  await converter.getByText('3/3개 결과를 실제 생성 엔진에서 받아왔습니다.').waitFor();
  await converter.getByRole('button',{name:/^카드뉴스\s*●?$/}).click();
  const uploadedOption=converter.getByLabel('기사 사진 사용').locator('option').filter({hasText:'card-upload.png'});
  await converter.getByLabel('기사 사진 사용').selectOption(await uploadedOption.getAttribute('value'));
  for(const platform of ['Instagram','Threads']){
    await converter.getByRole('button',{name:new RegExp('^'+platform+'\\s*●?$')}).click();
    await converter.getByTestId('sns-prepare').click();
    await converter.getByTestId('delivery-status').getByText(/사진 3장/).waitFor();
    await converter.getByTestId('delivery-status').getByText(/게시 버튼은 누르지 않았습니다/).waitFor();
    await converter.getByTestId('sns-review-status').getByText(/원고:.*카드:/).waitFor();
    await converter.getByRole('button',{name:'전용 창 닫기',exact:true}).click();
    await converter.getByTestId('delivery-status').getByText(/전용 창을 닫았습니다/).waitFor();
  }

  await go("보관함");
  await see("미디어 & 변환 자산");
  // 팩트체크 서랍에 올린 자료가 기사 취재자료로 남아 보관함에 보여야 한다(깨진 파일은 빠짐)
  await page.getByText("취재자료 (1건)").waitFor();
  await page.getByText("• 자료.txt").waitFor();
  await snapshot('prototype-ux-archive');
  assert.equal(await page.getByTestId("data-map").count(), 0, "보관함에는 데이터맵을 중복 렌더링하지 않는다");
  await go("데이터맵");
  assert.equal(await page.getByTestId("archive-view").count(), 0);
  const dataMap = page.getByTestId("data-map");
  const sampleRoot = new URL('../sample-data/datamap/', ROOT);
  const samples = fs.readdirSync(sampleRoot).filter((name) => name.endsWith('.md'));
  assert.equal(samples.length, 5);
  await dataMap.locator('input[type="file"]:not([webkitdirectory])').first().setInputFiles(samples.map((name) => ({
    name, mimeType: 'text/markdown', buffer: fs.readFileSync(new URL(name, sampleRoot)),
  })));
  await dataMap.getByText('5개 추가 · 0개 갱신').first().waitFor();
  const knowledge = await (await page.request.get(`${BASE}/api/knowledge-map`)).json();
  assert.equal(knowledge.files.length, 5);
  assert.equal(knowledge.file_links.length, 21);
  assert.ok(knowledge.files.every((file) => file.backlink_count > 0));
  await snapshot('prototype-ux-map');
  await go("녹음 파일");
  await see("인터뷰·녹취 스튜디오");
  // 녹음 전사: 파일 → 코어 /api/interview/transcribe → 백엔드 /ai/audio/transcriptions(multipart) → 화자별 대화
  await page.locator('input[type="file"]').setInputFiles({ name: "stub.m4a", mimeType: "audio/mp4", buffer: Buffer.from("stub audio") });
  await see("스텁 답변입니다");
  await see("전사 완료");
  await page.getByRole('button', { name: '발언 선택', exact: true }).first().click();
  await page.getByRole('complementary', { name: '선택한 발언' }).getByText(/저희는 3년 전부터 이 연구를 해 왔고 이번에 결과를 냈습니다/).waitFor();
  await page.getByRole('button', { name: '선택한 발언을 기사로 보내기' }).click();
  assert.ok((await body.inputValue()).includes('저희는 3년 전부터 이 연구를 해 왔고 이번에 결과를 냈습니다.'));
  await go('녹음 파일');
  await see('전사 완료');
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
  // 개발 계정 자동 로그인이 켜져 있으면 로그인된 상태이고, 끄면 로그아웃되어 로그인 창이 뜬다
  session = { ...session, signedIn: true, email: "dev@example.test",
    autoLogin: { available: true, enabled: true, email: "dev@example.test", error: "" } };
  await page.reload();
  const autoLogin = page.getByTestId("auto-login-toggle");
  await autoLogin.waitFor();
  await autoLogin.getByText(/켜짐/).waitFor();
  assert.equal(await login.count(), 0, "자동 로그인으로 로그인된 상태에서는 로그인 창이 없어야 합니다");
  await autoLogin.click();
  await login.waitFor();
  session = { ...session, signedIn: true, email: "reporter@example.test",
    autoLogin: { available: false, enabled: false, email: "", error: "" } };
  await page.reload();
  await page.locator("header").getByText("reporter@example.test", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await go('오늘의 데스크');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await snapshot('prototype-ux-mobile-desk');
  await go('데이터맵');
  assert.equal(await dataMap.evaluate((element) => element.scrollWidth > element.clientWidth), false);
  await go('보관함');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await go('기사 작성');
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

  for (const name of ["headlines", "subtitles", "photo_keywords", "search:stub wafer", "stt:multipart/form-data"])
    assert.ok(stubCalls.includes(name), `코어가 백엔드로 ${name} 를 요청하지 않았습니다: ${stubCalls}`);
  assert.equal(savedIds.size, 1, "같은 원고는 화면을 오가도 한 파일에 저장돼야 합니다: " + [...savedIds]);
  // 새 기사로 전환할 때 디바운스가 남아 있어도 현재 원고를 먼저 저장한다.
  await page.setViewportSize({ width: 1440, height: 900 });
  await go('기사 작성');
  await body.fill((await body.inputValue()) + '\n전환 직전 보존 문장');
  await go('오늘의 데스크');
  await page.getByRole('button', { name: '+ 새 기사', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('textarea[placeholder="기사 본문을 입력하세요. 자유롭게 문단을 작성할 수 있습니다..."]')?.value === '');
  await page.getByPlaceholder('기사 제목을 입력하거나 AI 추천을 확인하세요').fill('전환 검증 두 번째 기사');
  await body.fill('두 번째 기사 본문입니다. 저장 ID를 분리합니다.');
  await page.getByTestId('save-status').getByText('임시 저장됨').waitFor();
  assert.equal(savedIds.size, 2, '새 기사는 별도 ID에 저장한다');
  await go('보관함');
  await page.getByTestId('archive-view').getByRole('button', { name: /^\d+\s*스텁 제목 둘/ }).click();
  await page.getByRole('button', { name: '수정', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('input[placeholder="기사 제목을 입력하거나 AI 추천을 확인하세요"]')?.value === '스텁 제목 둘');
  assert.ok((await body.inputValue()).includes('전환 직전 보존 문장'));
  // 전환 저장이 실패하면 현재 원고를 버리거나 새 기사로 넘어가지 않는다.
  await page.route('**/api/articles/save', (route) => reply(route, { error: '전환 저장 테스트 오류' }, 503));
  await body.fill((await body.inputValue()) + '\n저장 실패 시 보존 문장');
  await go('오늘의 데스크');
  await page.getByRole('button', { name: '+ 새 기사', exact: true }).click();
  await page.getByRole('alert').getByText(/현재 원고는 유지됩니다/).waitFor();
  await page.unroute('**/api/articles/save');
  await go('기사 작성');
  assert.ok((await body.inputValue()).includes('저장 실패 시 보존 문장'));
  // 보관소 × 로 기사 삭제(지금 쓰는 기사가 아닌 것) → 목록에서 사라지고 코어 목록에서도 빠진다
  await go('보관함');
  const archive = page.getByTestId('archive-view');
  await archive.getByRole('button', { name: '전환 검증 두 번째 기사 삭제' }).click();
  await archive.getByRole('button', { name: /^\d+\s*전환 검증 두 번째 기사/ }).waitFor({ state: 'detached' });
  const remaining = (await (await page.request.get(`${BASE}/api/articles`)).json()).articles.map((item) => item.title);
  assert.ok(!remaining.includes('전환 검증 두 번째 기사'), '삭제한 기사가 코어 목록에 남았습니다: ' + remaining);
  // DB 기사 JSON → 표시 → 고정본 → 생성/편집/복원. 기존 선택·저장 경로를 실제 팀 화면에서 검사한다.
  const seedDbArticle = async (fields) => {
    const response=await page.request.post(`${BASE}/api/articles/save`,{headers:{Origin:BASE},data:{kind:'manual',draft:{content:'DB 기사 본문입니다.',bodyHtml:'<p>DB 기사 본문입니다.</p>',title:'DB 기사',subtitle:'',url:'',...fields}}});
    assert.equal(response.status(),200);return (await response.json()).articleId;
  };
  const longTitle='긴 제목의 전체 내용을 표시합니다 '.repeat(12).trim(),longSubtitle='여러 줄의 실제 부제목을 보존합니다 '.repeat(20).trim();
  const linkedId=await seedDbArticle({title:longTitle,subtitle:longSubtitle,url:'https://example.test/db-source'});
  const plainId=await seedDbArticle({title:'URL과 부제 없는 DB 기사'});
  const emptyId=await seedDbArticle({title:'본문 없는 DB 기사',content:'',bodyHtml:''});
  const structuredId=await seedDbArticle({title:'HTML 호환 DB 기사',subtitle:'실제 HTML 부제',content:{type:'doc',content:[]},bodyHtml:'<p>구조화 원문의 HTML 본문입니다.</p>'});
  await go('플랫폼 변환');
  await converter.getByRole('button',{name:'목록 새로고침',exact:true}).click();
  await converter.getByTestId('platform-article').locator(`option[value="${linkedId}"]`).waitFor({state:'attached'});
  await converter.getByTestId('platform-article').selectOption(linkedId);
  await converter.getByTestId('loaded-title').getByText(longTitle,{exact:true}).waitFor();
  assert.equal(await converter.getByTestId('loaded-subtitle').textContent(),longSubtitle);
  assert.equal(await converter.getByRole('link',{name:'원문 출처 링크'}).getAttribute('href'),'https://example.test/db-source');
  for(const field of ['loaded-title','loaded-subtitle']){
    assert.equal(await converter.getByTestId(field).evaluate(el=>el.scrollHeight>el.clientHeight),false,'전체 기사 메타데이터는 잘리면 안 됩니다');
    assert.equal(await converter.getByTestId(field).evaluate(el=>getComputedStyle(el).webkitLineClamp),'none');
  }
  await converter.getByTestId('generate-active').click();
  await converter.getByText('1/1개 결과를 실제 생성 엔진에서 받아왔습니다.').waitFor();
  const saveCurrent=async()=>{
    const saved=page.waitForResponse(response=>response.url().endsWith('/api/articles/save') && response.ok() && response.request().postDataJSON()?.kind==='manual');
    await page.keyboard.press('Control+s');await saved;await page.locator('header').getByText(/^저장됨/).waitFor();
  };
  const readDb=async id=>(await (await page.request.get(`${BASE}/api/articles/${id}`)).json()).draft;
  await saveCurrent();
  let generated=(await readDb(linkedId)).platformDrafts.instagram;
  assert.deepEqual(generated.generation_input.article,{article_id:linkedId,title:longTitle,subtitle:longSubtitle,url:'https://example.test/db-source',content:'DB 기사 본문입니다.'});
  const firstSnapshot=generated.snapshot_id;
  await converter.getByTestId('generate-active').click();
  await converter.getByText('1/1개 결과를 실제 생성 엔진에서 받아왔습니다.').waitFor();
  await saveCurrent();assert.equal((await readDb(linkedId)).platformDrafts.instagram.snapshot_id,firstSnapshot,'플랫폼 결과 저장만으로 원문 고정본을 바꾸지 않는다');
  await converter.locator('main textarea').first().fill('DB 플랫폼 사용자 편집');await saveCurrent();
  await converter.getByTestId('platform-article').selectOption(plainId);
  await converter.getByTestId('loaded-title').getByText('URL과 부제 없는 DB 기사',{exact:true}).waitFor();
  assert.equal(await converter.getByTestId('loaded-subtitle').textContent(),'부제목 없음');
  assert.equal(await converter.getByRole('link',{name:'원문 출처 링크'}).count(),0);
  assert.equal(await converter.locator('main textarea').count(),0,'다른 기사에 이전 원고가 표시되면 안 된다');
  await converter.getByTestId('generate-active').click();await converter.getByText('1/1개 결과를 실제 생성 엔진에서 받아왔습니다.').waitFor();await saveCurrent();
  assert.equal((await readDb(plainId)).platformDrafts.instagram.generation_input.article.url,'');
  await converter.getByTestId('platform-article').selectOption(linkedId);
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid="format-converter"] main textarea')].some(el=>el.value==='DB 플랫폼 사용자 편집'));
  // 기사 편집 화면의 부제 변경은 표시와 새 고정본에 함께 반영된다.
  await converter.getByRole('button',{name:'기사 편집',exact:true}).click();
  const subtitleField=page.getByPlaceholder('기사 부제를 입력하세요 (줄마다 Enter)');
  await subtitleField.fill('편집 화면에서 수정한 실제 부제');
  await go('플랫폼 변환');await converter.getByTestId('loaded-subtitle').getByText('편집 화면에서 수정한 실제 부제',{exact:true}).waitFor();
  await converter.getByTestId('generate-active').click();await converter.getByText('1/1개 결과를 실제 생성 엔진에서 받아왔습니다.').waitFor();await saveCurrent();
  assert.notEqual((await readDb(linkedId)).platformDrafts.instagram.snapshot_id,firstSnapshot);
  await converter.getByTestId('platform-article').selectOption(emptyId);
  await converter.getByText('기사 본문 없음 · 기사 편집 화면에서 확인해 주세요.',{exact:true}).waitFor();
  assert.equal(await converter.getByRole('button',{name:'선택 항목 생성',exact:true}).isDisabled(),true);
  await converter.getByTestId('platform-article').selectOption(structuredId);
  await converter.getByTestId('loaded-title').getByText('HTML 호환 DB 기사',{exact:true}).waitFor();
  await converter.getByTestId('generate-active').click();await converter.getByText('1/1개 결과를 실제 생성 엔진에서 받아왔습니다.').waitFor();await saveCurrent();
  assert.equal((await readDb(structuredId)).platformDrafts.instagram.generation_input.article.content,'구조화 원문의 HTML 본문입니다.');
  // 실패한 선택은 현재 기사를 새 기사로 가장하지 않고 기존 기사임을 명시한다.
  expectedDbFailureUrls.add(`${BASE}/api/articles/${emptyId}`); // 아래에서 오류 표시·현재 기사 유지도 별도로 assert한다.
  await page.route(`**/api/articles/${emptyId}`,route=>reply(route,{error:'DB 조회 실패 테스트'},404));
  await converter.getByTestId('platform-article').selectOption(emptyId);
  await converter.getByRole('alert').getByText(/기사 조회 실패/).waitFor();
  assert.equal(await converter.getByTestId('loaded-title').textContent(),'HTML 호환 DB 기사');
  assert.equal(await converter.getByTestId('platform-article').inputValue(),structuredId);
  await page.unroute(`**/api/articles/${emptyId}`);
  const deleted=await page.request.post(`${BASE}/api/articles/${emptyId}/delete`,{headers:{Origin:BASE},data:{}});assert.equal(deleted.status(),200);
  const deletedLookup=page.waitForResponse(response=>response.url()===`${BASE}/api/articles/${emptyId}` && response.status()===404);
  await converter.getByTestId('platform-article').selectOption(emptyId);
  await deletedLookup;
  await converter.getByRole('alert').getByText(/기사 조회 실패/).waitFor();
  // 생성 결과가 늦게 와도 전환한 기사에 적용하지 않는다.
  let generationStarted,generationRelease;
  const genWaiting=new Promise(resolve=>{generationStarted=resolve;}),genHold=new Promise(resolve=>{generationRelease=resolve;});
  await page.route('**/api/platform/generate',async route=>{const response=await route.fetch();generationStarted();await genHold;await route.fulfill({response});});
  await converter.getByTestId('generate-active').click();await genWaiting;
  await converter.getByTestId('request-source').getByText(/HTML 호환 DB 기사/).waitFor();
  await converter.getByTestId('platform-article').selectOption(plainId);
  await converter.getByTestId('loaded-title').getByText('URL과 부제 없는 DB 기사',{exact:true}).waitFor();generationRelease();
  await page.unroute('**/api/platform/generate');
  assert.equal(await converter.getByTestId('loaded-title').textContent(),'URL과 부제 없는 DB 기사');
  assert.equal((await readDb(plainId)).platformDrafts.instagram.article_id,plainId);
  // 느린 조회 중 앱을 다시 열면 취소된 이전 작업 영역의 응답을 적용하지 않는다.
  let queryStarted,queryRelease;
  const queryWaiting=new Promise(resolve=>{queryStarted=resolve;}),queryHold=new Promise(resolve=>{queryRelease=resolve;});
  await page.route(`**/api/articles/${linkedId}`,async route=>{const response=await route.fetch();queryStarted();await queryHold;await route.fulfill({response}).catch(()=>{});});
  await converter.getByTestId('platform-article').selectOption(linkedId);await queryWaiting;
  await page.getByRole('status').filter({hasText:'현재 원고를 저장하고 작업을 전환합니다'}).waitFor();
  await page.reload();await converter.getByTestId('loaded-title').getByText('URL과 부제 없는 DB 기사',{exact:true}).waitFor();queryRelease();
  await page.unroute(`**/api/articles/${linkedId}`);
  assert.equal(await converter.getByTestId('loaded-title').textContent(),'URL과 부제 없는 DB 기사');
  await snapshot('db-article-platform-source');
  // 같은 기사에서 생성 도중 조건을 고치면 늦은 결과를 적용하지 않는다.
  let editStarted,editRelease;
  const editWaiting=new Promise(resolve=>{editStarted=resolve;}),editHold=new Promise(resolve=>{editRelease=resolve;});
  await page.route('**/api/platform/generate',async route=>{
    const response=await route.fetch(),result=await response.json();result.draft.opening='조건 수정 중 응답 (적용 금지)';
    editStarted();await editHold;await route.fulfill({response,body:JSON.stringify(result)});
  });
  await converter.getByTestId('generate-active').click();await editWaiting;
  await converter.getByPlaceholder('톤, 분량, 반드시 포함할 조건 등을 입력').fill('생성 도중 바꾼 요구사항');editRelease();
  await converter.getByText(/생성 중 원문·조건·원고가 바뀌어 결과를 적용하지 않았습니다/).waitFor();
  assert.equal(await converter.locator('textarea').evaluateAll(elements=>elements.some(element=>element.value==='조건 수정 중 응답 (적용 금지)')),false);
  await page.unroute('**/api/platform/generate');
  // 기사 미선택 화면은 별도 본문 입력을 만들지 않고 생성을 비활성화한다.
  await go('오늘의 데스크');await page.getByRole('button',{name:'+ 새 기사',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('textarea[placeholder="기사 본문을 입력하세요. 자유롭게 문단을 작성할 수 있습니다..."]')?.value==='');
  await go('플랫폼 변환');
  await converter.getByTestId('loaded-title').getByText('기사 미선택',{exact:true}).waitFor();
  assert.equal(await converter.getByTestId('loaded-subtitle').textContent(),'부제목 없음');
  assert.equal(await converter.getByTestId('platform-article').inputValue(),'');
  assert.equal(await converter.getByRole('button',{name:'선택 항목 생성',exact:true}).isEnabled(),false);
  assert.equal(await converter.locator('main textarea').count(),0);
  await snapshot('db-article-empty-source');
  assert.deepEqual(problems, [], "브라우저 오류:\n" + problems.join("\n"));
  console.log("PASS ui-smoke: 로그인·로그아웃·개발 자동 로그인·모델 설치/취소/오류/폴링·코어 연결·제목/부제 추천·임시 저장·수동 저장·사진 검색·사진 편집·팩트체크 서랍·자료 검색·실제 platform-generator 경계·보관함·녹취 전사·모바일 폭");
} catch (error) {
  if (page) await page.screenshot({ path: fileURLToPath(new URL("temp/ui-smoke-failure.png", ROOT)) }).catch(() => {});
  console.error("FAIL ui-smoke:", error.stack || error.message);
  if(page)console.error('UI failure context:',(await page.getByTestId('format-converter').innerText().catch(()=>'' )).slice(-1800));
  if (problems.length) console.error(problems.join("\n"));
  process.exitCode = 1;
} finally {
  // 실패한 단계에서도 소유 SNS 창을 닫고 서버 종료를 기다린다. 열린 파일을 먼저 지우지 않는다.
  for (const platform of ['instagram','threads']) {
    await fetch(`${BASE}/api/platform/sns`,{method:'POST',headers:{'Content-Type':'application/json',Origin:BASE},
      body:JSON.stringify({platform,action:'close'}),signal:AbortSignal.timeout(3000)}).catch(()=>{});
  }
  await browser?.close();
  if(server.exitCode===null){const exited=new Promise(resolve=>server.once('exit',resolve));server.kill();await exited;}
  for(const directory of [SMOKE_DOCS,PLATFORM_STUB]){
    assert.ok(path.dirname(path.resolve(directory))===path.resolve(os.tmpdir()) && /^ainews-(smoke|platform)-/.test(path.basename(directory)), '시험 임시 디렉터리만 정리한다');
    fs.rmSync(directory, { recursive: true, force: true, maxRetries:10, retryDelay:200 });
  }
  stub.close();
  // 테스트가 만든 원고 파일은 지운다(사용자 원고와 섞이지 않게)
  for (const id of savedIds) fs.rmSync(new URL(`.article-workspace/articles/${id}.json`, ROOT), { force: true });
}
