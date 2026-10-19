// 팀 UI(루트 src/ → app/frontend 빌드본) 화면 스모크 테스트 — 실제 코어를 띄우고 브라우저로 주요 화면·편집 보조 기능을 돌아본다.
//
//   루트 npm run build && npm run test:ui
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
  interview_analysis: { summary: "스텁 요약", keyPoints: ["스텁 핵심"], keywords: ["스텁"] }, // AI 인터뷰 분석은 코어 assist 로 처리한다
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
      const request = JSON.parse(body);
      const name = request.text?.format?.name;
      stubCalls.push(name);
      if (name === 'factcheck_recheck') {
        const prompt = typeof request.input === 'string' ? request.input
          : (request.input || []).flatMap((message) => message.content || []).map((part) => part.text || '').join('\n');
        const results = [...prompt.matchAll(/^### 항목 id=([^\n]+)/gm)].map((match) => ({
          id: match[1].trim(), verdict: 'NOT_ENOUGH_INFO', reason: '스모크 테스트용 합성 판정', wrong_text: '', evidence_text: '',
        }));
        out = { output: [{ content: [{ type: 'output_text', text: JSON.stringify({ results }) }] }] };
      } else if (AI[name]) out = { output: [{ content: [{ type: "output_text", text: JSON.stringify(AI[name]) }] }] };
    } else if (req.method === 'POST' && url.pathname === '/ai/embeddings') {
      // UI 연결만 확인하는 합성 벡터. 실제 임베딩의 검색 품질을 검증하는 대역은 아니다.
      const request = JSON.parse(body), texts = request.documents || request.queries || [];
      stubCalls.push('embeddings');
      out = { data: texts.map((text) => {
        const vector = Array(1024).fill(0); let hash = 0;
        for (const char of text || ' ') { hash = (Math.imul(hash, 31) + char.codePointAt(0)) >>> 0; vector[hash % 1024] += 1; }
        return vector;
      }) };
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
    } else if (req.method === "POST" && url.pathname === "/ai/audio/clova") { // Render 중계 — 키는 서버에만 있고 PC 에는 없다
      stubCalls.push("stt:clova");
      out = {
        text: "스텁 질문입니다. 개발 배경을 말씀해 주시겠습니까? 스텁 답변입니다. 저희는 3년 전부터 이 연구를 해 왔고 이번에 결과를 냈습니다.",
        duration: 8000,
        segments: [
          { start: 0, end: 3000, text: "스텁 질문입니다. 개발 배경을 말씀해 주시겠습니까?", speaker: { label: "1", name: "A" }, confidence: 0.9 },
          { start: 3500, end: 8000, text: "스텁 답변입니다. 저희는 3년 전부터 이 연구를 해 왔고 이번에 결과를 냈습니다.", speaker: { label: "2", name: "B" }, confidence: 0.9 },
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
    if (!out) console.error('Unstubbed backend request:', req.method, url.pathname);
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
    CLOVA_SPEECH_SECRET_KEY: "", // PC 에는 CLOVA 키가 없다(개발 PC 의 실제 키가 새어 들어가도 쓰지 않게 비운다)
    CLOVA_SPEECH_INVOKE_URL: "",
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
  page.on("console", (m) => m.type() === "error" && !/status of (503|422|401|400|413)/.test(m.text())
    && !(/status of 404/.test(m.text()) && expectedDbFailureUrls.has(m.location().url)) && problems.push("console: " + m.text()));
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("response", async (r) => {
    // 503 = 모델·런타임 미설치(정상 상태) — 화면이 안내를 띄우는지는 단계에서 따로 본다; 422 = 깨진 자료 파일(4단계에서 일부러 올림)
    if (r.url().includes("/api/") && r.status() >= 500 && r.status() !== 503) problems.push(`${r.status()} ${r.url()}`);
    if (r.url().endsWith("/api/articles/save") && r.ok()) {
      const json = await r.json();
      savedIds.add(json.articleId);
    }
  });
  // 화면의 alert 가 테스트를 멈추지 않게. 기사 전환 때 '저장하고 열까요?'는 수락(수동 저장 뒤 전환)
  // 서버 백업 삭제 확인은 취소한다(백업 끄기 단계는 '서버 백업은 남겨 둠'을 확인한다)
  const acceptTestDialog=(d)=>(!/서버에 올려 둔 내 백업/.test(d.message())&&/저장하지 않은 변경|삭제할까요|이전 파일의 자료로 바꿀까요|클라우드 백업을 끌까요|복제본 파일을 지울까요/.test(d.message())?d.accept():d.dismiss());
  page.on("dialog",acceptTestDialog);

  const see = (text) => page.getByText(text, { exact: false }).first().waitFor({ timeout: 10_000 });
  // 사이드바 버튼 title(내 사이드바)과 화면 제목(page-heading, 데이터 navigation.js)은 이름이 다르다.
  // 기사 작성·인터뷰 화면은 상단 제목 대신 자체 작업 화면(저장 상태 표시 / 녹취 화면)이 열린다.
  const NAV_BUTTON = { "오늘의 데스크": "오늘의 데스크", "기사 작성": "기사 작성", "녹음 파일": "인터뷰 & 오디오", "플랫폼 변환": "콘텐츠 변환", "데이터맵": "데이터 맵", "보관함": "보관함" };
  const NAV_HEADING = { "오늘의 데스크": "오늘의 업무", "플랫폼 변환": "콘텐츠 변환", "데이터맵": "데이터맵", "보관함": "보관함" };
  const READY = '[data-testid="page-heading"], [data-testid="save-status"], [data-testid="interview-studio"], .writer-workspace, [data-testid="backup-export"]';
  const go = async (title) => {
    await page.locator(`button[title="${NAV_BUTTON[title] || title}"]`).first().click();
    if (NAV_HEADING[title]) await page.getByTestId('page-heading').filter({ hasText: NAV_HEADING[title] }).waitFor();
    else await page.locator(READY).first().waitFor();
  };
  // 복구 후 HTML load와 실제 원고 조회 완료는 다르다. 작업 영역 재마운트가 끝난 뒤 다음 창을 연다.
  // 환경 설정 창은 환경 설정 화면의 "환경 설정 열기" 버튼으로 연다(이미 그 화면이면 이동하지 않는다)
  const openSettings = async () => {
    if (!(await page.getByTestId("open-settings-dialog").isVisible())) await go("환경 설정");
    await page.getByTestId("open-settings-dialog").click();
  };
  const waitWorkspaceReady = async () => {
    await page.locator(READY).first().waitFor();
    await page.getByTestId('workspace-loading').waitFor({ state: 'detached' });
    await page.locator('header').getByText(session.email, { exact: true }).waitFor();
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
    { id: "factcheck-judge-0.6b-v3", label: "팩트체크 판정기", kind: "factcheck", bytesTotal: 1048576, installed: false, files: 2, filesDone: 0, sourceConfigured: true },
    { id: "boundary-roberta-base-v3", label: "문장 경계", kind: "boundary", bytesTotal: 2097152, installed: false, files: 2, filesDone: 0, sourceConfigured: true },
    { id: "headline-ket5-onnx", label: "제목", kind: "headline", bytesTotal: 1048576, installed: true, files: 1, filesDone: 1, sourceConfigured: true },
    { id: "subtitle-kobart-onnx", label: "부제", kind: "subtitle", bytesTotal: 1048576, installed: true, files: 1, filesDone: 1, sourceConfigured: true },
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

  if (process.env.UI_SMOKE_FOCUS === 'card-news') {
    const { runCardNewsSmoke } = await import('./card-news-ui-smoke.mjs');
    await runCardNewsSmoke({ page, BASE, go, waitWorkspaceReady, snapshot });
    assert.deepEqual(problems, [], '카드뉴스 브라우저 오류');
  } else {
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
  assert.equal(await page.locator('[data-placeholder^="기사 본문을 입력하세요"]').count(), 0);
  assert.equal(savedIds.size, 0, "조회 실패 중에는 빈 원고를 저장하지 않는다");
  await page.getByRole("button", { name: "다시 불러오기" }).click();
  await page.getByTestId("desk-view").waitFor();
  await snapshot('prototype-ux-desk');
  assert.equal(await page.getByTestId("data-map").count(), 0);
  await go("기사 작성");
  await page.locator('[data-placeholder^="기사 본문을 입력하세요"]').waitFor();
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
  const queueBody = page.locator('[data-placeholder^="기사 본문을 입력하세요"]');
  await queueBody.fill("첫 저장");
  await started;
  await queueBody.fill("두 번째 저장");
  await page.waitForTimeout(1700);
  assert.equal(savePayloads.length, 1, "첫 요청이 끝나기 전에 두 번째 저장을 시작하지 않는다");
  // 첫 저장의 "임시 저장됨"이 먼저 보이므로 두 번째 저장 응답까지 기다린다
  const secondSaved = page.waitForResponse((response) => response.url().endsWith("/api/articles/save") && response.request().postDataJSON()?.draft?.content === "두 번째 저장");
  releaseFirst();
  await secondSaved;
  await page.getByRole("status").getByText("임시 저장됨").first().waitFor();
  assert.equal(savePayloads.length, 2);
  assert.equal(savePayloads[1].draft.articleId, [...savedIds][0]);
  const queueSaved = await (await page.request.get(`${BASE}/api/articles/latest`)).json();
  assert.equal(queueSaved.draft.content, "두 번째 저장");
  await page.unroute(saveRoute);
  const cleared = page.waitForResponse((response) => response.url().endsWith('/api/articles/save') && response.ok());
  await queueBody.fill("");
  await cleared;
  await page.getByRole("status").getByText("임시 저장됨").first().waitFor();
  // 1. 코어 연결 — UI 가 계약(src/api)으로 /api/session 을 받아 헤더에 로그인 계정을 보여 준다(아래 이메일 확인)
  const login = page.getByTestId("login-dialog");
  // 로그인한 상태에서는 로그인 창이 열리지 않고, 로그아웃하면 화면을 비우고(새로고침) 닫을 수 없는 로그인 창이 뜬다
  assert.equal(await login.count(), 0, "로그인한 상태에서는 로그인 창이 없어야 합니다");
  await page.locator("header").getByText("reporter@example.test", { exact: true }).waitFor();
  await page.locator('header button[title="기자 정보"]').click(); // 로그아웃은 계정 메뉴 안에 있다
  await page.getByTestId("logout-button").click();
  await login.waitFor();
  assert.equal(await page.locator(".login-overlay").count(), 0, "로그인 전 첫 화면은 팝업이 아니라 로그인 화면입니다");
  assert.equal(await page.getByTestId("page-heading").count(), 0, "로그인 전에는 작업 화면 대신 로그인 화면만 보입니다");
  assert.equal(await page.locator("header").count(), 1, "머리글(프로필 메뉴)은 로그인 화면에서도 보입니다");
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
  let expiredOnce = false;
  await page.route(`${BASE}/api/articles`, (route) => {
    if (!expiredOnce && route.request().method() === "GET") {
      expiredOnce = true;
      return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "로그인이 필요합니다.", code: "AUTH_REQUIRED" }) });
    }
    return route.fallback();
  });
  await go("보관함");                                                           // 보관함 목록 요청이 "세션 만료"로 거절된다
  await login.waitFor();
  assert.equal(await page.locator(".login-overlay").count(), 1, "작업 중 세션이 만료되면 작업 화면 위에 팝업이 뜬다(전체 로그인 화면이 아니다)");
  assert.equal(await page.getByTestId("page-heading").count(), 1, "팝업 뒤로 작업 화면이 그대로 있다");
  await page.getByTestId("login-email").fill("reporter@example.test");
  await page.getByTestId("login-password").fill("valid-password");
  signInStarted = new Promise((resolve) => { onSignInStarted = resolve; });
  await page.getByTestId("login-submit").click();
  await signInStarted;
  finishSignIn();
  await login.waitFor({ state: "detached" });
  assert.equal(await page.locator(".login-overlay").count(), 0, "다시 로그인하면 팝업이 닫힌다");
  await go("기사 작성");
  // 나머지 기존 단계의 새로고침에서는 로그인한 상태로 유지한다.
  session = { ...session, signedIn: true, email: "reporter@example.test" };

  // 모델 설치는 환경 설정 화면(사이드바)에 있다. 화면을 떠나면 진행률 읽기(폴링)가 멈추고, 설치는 코어에서 이어진다.
  const noMorePolling = async () => {
    const reads = modelReads;
    await page.waitForTimeout(1300);
    assert.equal(modelReads, reads, "설치가 끝나거나 화면을 떠나면 폴링이 멈춰야 합니다");
  };
  const summary = page.getByTestId("models-summary");
  const installButton = () => page.getByRole("button", { name: "모델 설치", exact: true }).first();
  await go("환경 설정");
  await summary.getByText(/미설치 모델 전체 용량: 3\.0 MB/).waitFor();
  assert.equal(installCalls, 0, "모델 설치는 자동으로 시작하지 않습니다");
  await noMorePolling();
  await installButton().dispatchEvent("click"); // 타임라인이 움직여 일반 클릭은 위치가 안정되지 않는다
  await page.getByRole("alert").getByText("모델 원본 주소가 없습니다.").waitFor();
  await installButton().dispatchEvent("click"); // 타임라인이 움직여 일반 클릭은 위치가 안정되지 않는다
  await page.getByTestId("model-progress").first().waitFor();
  await page.getByText("50%", { exact: true }).first().waitFor();
  assert.equal(await installButton().isDisabled(), true, "설치 중에는 다른 모델 설치를 시작할 수 없다");
  await page.getByRole("button", { name: "설치 취소" }).dispatchEvent("click");
  await page.getByTestId("model-progress").first().waitFor({ state: "detached" });
  await summary.getByText(/미설치 모델 전체 용량: 3\.0 MB/).waitFor();
  await noMorePolling();
  installOutcome = "error";
  await installButton().dispatchEvent("click"); // 타임라인이 움직여 일반 클릭은 위치가 안정되지 않는다
  await page.getByRole("alert").getByText("모델 서버에 연결하지 못했어요.").waitFor();
  await noMorePolling();
  installOutcome = "hold";
  await installButton().dispatchEvent("click"); // 타임라인이 움직여 일반 클릭은 위치가 안정되지 않는다
  await page.getByTestId("model-progress").first().waitFor();
  await go("기사 작성");
  await noMorePolling();
  installOutcome = "complete";
  await go("환경 설정");
  await summary.getByText(/미설치 모델 전체 용량: 2\.0 MB/).waitFor();
  await installButton().dispatchEvent("click"); // 타임라인이 움직여 일반 클릭은 위치가 안정되지 않는다
  await summary.getByText(/모든 모델이 설치되어 있습니다/).waitFor();
  assert.equal(await page.getByRole("button", { name: "모델 설치", exact: true }).count(), 0);
  await noMorePolling();

  // 환경 설정은 모델 설치와 별개 창: 클라우드 백업은 기본 켜짐이고 끄면 다시 열어도 꺼져 있다
  const settings = page.getByTestId("settings-dialog");
  await openSettings();
  await settings.waitFor();
  assert.equal(await page.getByTestId("models-install").count(), 0, "환경 설정 창에는 모델 설치가 없어야 합니다");
  const backupCalls = [];
  await page.route(/\/api\/backup(?:\/(?:list|restore))?$/, async (route) => {
    const url = route.request().url().replace(BASE, "");
    backupCalls.push({ url, body: route.request().method() === "POST" ? route.request().postDataJSON() : null });
    if (url.endsWith("/list")) return reply(route, { backups: [
      { articleId: "a".repeat(32), title: "서버 백업 기사 하나", savedAt: "2026-10-13T00:10:00Z", bytes: 4096 },
      { articleId: "b".repeat(32), title: "서버 백업 기사 둘", savedAt: "2026-10-12T00:10:00Z", bytes: 2048 }] });
    if (url.endsWith("/restore")) return reply(route, { restored: route.request().postDataJSON().articleIds, skipped: [] });
    return reply(route, { enabled: true, pending: 1, lastUploadAt: "2026-10-13T00:00:00+09:00", error: "" });
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="settings-cloud-backup"]')?.disabled === false);
  assert.equal(await page.getByTestId("settings-cloud-backup").isChecked(), true, "클라우드 백업 기본값은 켜짐");
  assert.equal(await page.getByTestId("backup-now").count(), 0, "백업은 저장할 때 자동으로 되므로 '지금 백업' 버튼이 없다");
  // 서버 백업에서 복구: 목록에서 고르고 복구하면 화면을 다시 불러온다
  await page.getByTestId("backup-restore-open").click();
  await page.getByTestId("backup-status").getByText(/마지막 백업/).waitFor();
  await page.getByTestId("backup-list").getByText("서버 백업 기사 하나").waitFor();
  await Promise.all([page.waitForEvent("load"), settings.getByTestId("backup-restore").click()]);
  await waitWorkspaceReady();
  assert.deepEqual(backupCalls.find((c) => c.url.endsWith("/restore")).body.articleIds, ["a".repeat(32), "b".repeat(32)]);
  await openSettings();
  await settings.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="settings-cloud-backup"]')?.disabled === false);
  await page.getByTestId("settings-cloud-backup").uncheck(); // 끄기 확인(수락) → 서버 삭제 확인(취소) → 실제 코어가 설정을 끈다
  await settings.getByRole("button", { name: "닫기", exact: true }).click();
  await openSettings();
  await page.waitForFunction(() => document.querySelector('[data-testid="settings-cloud-backup"]')?.disabled === false);
  assert.equal(await page.getByTestId("settings-cloud-backup").isChecked(), false, "끈 설정이 유지됨");
  await page.getByTestId("settings-cloud-backup").check(); // 켜기: 저장할 때부터 자동으로 올라간다(켠 순간 일괄로 올리지 않는다)
  assert.equal(backupCalls.some((c) => c.url.endsWith("/now")), false, "켤 때 기존 기사를 일괄로 올리지 않는다")
  // 로그인 유지: 로그인 때 켠 상태가 반영되고, 설정에서 끄고 켤 수 있다
  session = { ...session, keepLogin: true };
  await page.reload();
  await waitWorkspaceReady();
  await page.locator('header').getByText('reporter@example.test',{exact:true}).waitFor();
  await openSettings();
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
  // 다른 PC로 이전 마법사(서버 경유): 서버는 Supabase 가 필요하므로 이 시험에서는 응답을 흉내 낸다. 파일 방식은 실제 코어로 돌린다
  await page.getByTestId("settings-open-transfer").click();
  const transfer = page.getByTestId("transfer-dialog");
  await transfer.waitFor();
  assert.equal(await settings.count(), 0, "마법사가 열리면 설정 창은 닫힌다");
  const transferCalls = [];
  let serverFile = null, uploadOutcome = "ok";
  await page.route("**/api/transfer**", async (route) => {
    const url = route.request().url();
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : null;
    transferCalls.push({ url: url.replace(BASE, ""), body });
    if (url.endsWith("/upload")) {
      if (uploadOutcome === "large") return reply(route, { error: "자료가 너무 커서 서버로 보낼 수 없어요(최대 50MB). 파일로 옮겨 주세요.", code: "TRANSFER_TOO_LARGE" }, 413);
      serverFile = { code: body.code };
      return reply(route, { uploaded: true, bytes: 2048 });
    }
    if (url.endsWith("/download")) {
      if (!serverFile || body.code !== serverFile.code) return reply(route, { error: "백업 암호가 맞지 않거나 파일이 손상됐습니다." }, 400);
      serverFile = null;
      return reply(route, { restored: true, serverCopyDeleted: true });
    }
    if (url.endsWith("/delete")) { serverFile = null; return reply(route, { deleted: true }); }
    return reply(route, serverFile ? { exists: true, bytes: 2048, updatedAt: "2026-10-13T01:00:00Z", maxBytes: 52428800 } : { exists: false, bytes: 0, updatedAt: "", maxBytes: 52428800 });
  });
  // 서버가 한도를 넘었다고 하면 안내하고 파일 방식을 권한다
  uploadOutcome = "large";
  await page.getByTestId("transfer-export-server").click();
  await page.getByTestId("transfer-too-large").waitFor();
  assert.equal(await page.getByTestId("transfer-code").count(), 0, "올리지 못했으면 코드를 보여 주지 않는다");
  // 서버로 보내기: 코드 형식, 서버로 간 요청에는 코드가 한 번만 실린다
  uploadOutcome = "ok";
  await page.getByTestId("transfer-export-server").click();
  await page.getByTestId("transfer-code").waitFor();
  const serverCode = (await page.getByTestId("transfer-code").textContent()).trim();
  assert.match(serverCode, /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/, "이전 코드 형식");
  assert.deepEqual(transferCalls.filter((c) => c.url.endsWith("/upload")).at(-1).body, { code: serverCode });
  // 새 PC 쪽: 서버 상태를 보여 주고, 틀린 코드는 거절하고, 올바른 코드(소문자·공백도 허용)로는 가져와 화면을 다시 연다
  await page.getByTestId("transfer-tab-import").click();
  await page.getByTestId("transfer-server-status").getByText(/서버에 이전 파일이 있어요/).waitFor();
  await page.getByTestId("transfer-code-input").fill("AAAAA-BBBBB-CCCCC-DDDDD");
  await page.getByTestId("transfer-import-server").click();
  await page.getByTestId("transfer-error").getByText(/맞지 않/).waitFor();
  await page.getByTestId("transfer-code-input").fill("짧음");
  await page.getByTestId("transfer-import-server").click();
  await page.getByTestId("transfer-error").getByText(/코드 형식/).waitFor();
  await page.getByTestId("transfer-tab-export").click();
  await page.getByTestId("transfer-cancel-server").click(); // 보낸 것을 취소하면 서버 파일이 지워진다
  await page.getByTestId("transfer-code").waitFor({ state: "detached" });
  assert.equal(serverFile, null);
  await page.getByTestId("transfer-tab-import").click();
  await page.getByTestId("transfer-server-status").getByText(/서버에 이전 파일이 없어요/).waitFor();
  assert.equal(await page.getByTestId("transfer-import-server").isDisabled(), true, "서버에 파일이 없으면 가져오기를 막는다");
  await page.getByTestId("transfer-tab-export").click();
  await page.getByTestId("transfer-export-server").click();
  await page.getByTestId("transfer-code").waitFor();
  const serverCode2 = (await page.getByTestId("transfer-code").textContent()).trim();
  await page.getByTestId("transfer-tab-import").click();
  await page.getByTestId("transfer-server-status").getByText(/서버에 이전 파일이 있어요/).waitFor();
  await page.getByTestId("transfer-code-input").fill(serverCode2.toLowerCase().replaceAll("-", " "));
  await Promise.all([page.waitForEvent("load"), page.getByTestId("transfer-import-server").click()]);
  await waitWorkspaceReady();
  await page.unroute("**/api/transfer**");
  await openSettings();
  await settings.waitFor();
  // 파일 방식(실제 코어): 이전 파일 + 코드를 만들고, 틀린 코드는 거절하고, 올바른 코드로는 복구한다
  await page.getByTestId("settings-open-transfer").click();
  await transfer.waitFor();
  await page.getByTestId("transfer-export-file").click();
  await page.getByTestId("transfer-local-path").waitFor();
  const transferPath = (await page.getByTestId("transfer-local-path").textContent()).trim();
  const transferCode = (await page.getByTestId("transfer-code").textContent()).trim();
  assert.match(transferCode, /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/, "이전 코드 형식");
  assert.ok((await fs.promises.stat(transferPath)).size > 0, "이전 파일이 안내한 위치에 만들어진다");
  await page.getByTestId("transfer-tab-import").click();
  await page.locator("[data-testid=transfer-dialog] summary").click();
  await page.getByTestId("transfer-file").setInputFiles(transferPath);
  await page.getByTestId("transfer-code-input").fill("AAAAA-BBBBB-CCCCC-DDDDD"); // 형식은 맞지만 틀린 코드
  await page.getByTestId("transfer-import-file").click();
  await page.getByTestId("transfer-error").waitFor();
  const articlesBefore = (await (await page.request.get(`${BASE}/api/articles`)).json()).articles.length;
  await page.getByTestId("transfer-code-input").fill(transferCode.toLowerCase().replaceAll("-", " "));
  await Promise.all([page.waitForEvent("load"), page.getByTestId("transfer-import-file").click()]);
  await waitWorkspaceReady();
  await openSettings();
  await settings.waitFor();
  const articlesAfter = (await (await page.request.get(`${BASE}/api/articles`)).json()).articles.length;
  assert.equal(articlesAfter, articlesBefore, "이전 파일을 가져와도 기사가 그대로 있다");
  // 복제본 파일은 가져온 뒤에도 남아 있고(안내된 위치), 지우기 버튼으로 지울 수 있다
  await page.getByTestId("settings-open-transfer").click();
  await page.getByTestId("transfer-local-file").waitFor();
  await page.getByTestId("transfer-delete-file").click();
  await page.getByTestId("transfer-local-file").waitFor({ state: "detached" });
  assert.equal(fs.existsSync(transferPath), false, "복제본 파일이 지워진다");
  await transfer.getByRole("button", { name: "닫기", exact: true }).click();
  // AI 엔진(환경 설정 화면): 기본 OpenAI, 로컬 AI 로 바꾸면 저장된다
  await page.waitForFunction(() => document.querySelector('[data-testid="settings-local-ai"]')?.disabled === false);
  assert.equal(await page.getByTestId("settings-local-ai").isChecked(), false, "기본 AI 엔진은 OpenAI");
  await page.getByTestId("settings-local-ai").check();
  await page.getByTestId("settings-ai-engine").getByText("로컬 AI").waitFor();
  assert.equal((await (await page.request.get(`${BASE}/api/settings`)).json()).localAi, true, "켠 로컬 AI 설정이 저장됨");
  await page.getByTestId("settings-local-ai").uncheck();
  await page.getByTestId("settings-ai-engine").getByText("OpenAI").waitFor();

  // 목업 없이 빈 원고로 시작해야 한다(환경 설정 화면에서 기사 작성으로 돌아온다)
  await go("기사 작성");
  const body = page.locator('[data-placeholder^="기사 본문을 입력하세요"]');
  assert.equal((await body.innerText()).trim(), "");
  assert.equal(await page.getByPlaceholder("기사 제목을 입력하세요").inputValue(), "");
  // 추천은 본문 20자, 사진 검색어는 80자 이상부터
  await body.fill("스모크 테스트 본문입니다. ".repeat(8));

  // 2. 편집 보조(옛 시험 UI 기능 이식): 제목·부제 추천, 흐름 요약, 자동 저장
  await page.locator('button[title="AI 추천 제목"]').click(); // 제목 추천(부제와 같은 방식)
  await page.getByRole("button", { name: "스텁 제목 둘" }).click();
  assert.equal(await page.getByPlaceholder("기사 제목을 입력하세요").inputValue(), "스텁 제목 둘");
  await page.locator('button[title="AI 추천 부제목"]').click(); // 부제 추천
  await page.getByRole("button", { name: "스텁 부제 하나" }).click();
  // 한 줄짜리 부제 후보들은 부제 하나(여러 줄)로 묶여 한 번에 적용된다
  assert.equal(await page.getByPlaceholder("부제목을 입력하세요 (줄바꿈으로 2~4줄)").inputValue(), "스텁 부제 하나\n스텁 부제 둘\n스텁 부제 셋");
  await see("임시 저장됨"); // 제목·부제가 바뀌었으니 1.5초 뒤 코어에 저장
  // (흐름 요약은 10-08 미리보기 정리 때 뺐다)

  // 3. 사진 첨부(사진 서랍): 본문 기반 검색어 → 키워드를 누르면 Unsplash 검색 → 사진 편집 → 본문에 넣기
  await page.getByRole("button", { name: /사진 첨부/ }).click();
  const keywordChips = page.getByTestId("photo-keyword-chips");
  await keywordChips.getByRole("button", { name: "stub wafer" }).click();
  await page.getByText("검색 결과 (3)").waitFor(); // 검색 결과 사진은 Unsplash 원본(코어가 받아 옴)이 있어야 편집되므로 여기서는 결과만 본다

  // 3-1. 내 PC 사진: 파일 선택 → 사진 편집 → 본문에 넣기(본문에 사진이 들어간다)
  await page.getByRole("button", { name: "내 PC에서 사진 불러오기" }).first().click();
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: "smoke.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==", "base64"),
  });
  await page.locator('button[title="편집하기"]').first().dispatchEvent("click"); // 미리보기 위에 마우스를 올리면 보이는 버튼
  const imageEditor = page.getByTestId("image-editor");
  await imageEditor.waitFor();
  await imageEditor.getByTestId("image-apply").click();
  await imageEditor.waitFor({ state: "detached" });
  await body.locator("figure[data-photo-id] img").first().waitFor(); // 본문에 사진이 들어간다

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
    await page.getByTestId("factcheck-error").getByRole("button", { name: "모델 설치 열기" }).click(); // 환경 설정 화면으로 간다
    await page.getByTestId("models-summary").getByText(/모든 모델이 설치되어 있습니다/).waitFor();
    await go("기사 작성");
    // 서랍을 새로 열어야 순서형 검사가 켜진다(열려 있으면 닫았다가 연다). 화면 복원이 끝난 뒤(두 프레임) 버튼 상태로 판단한다
    const factToggle = page.getByTestId("factcheck-toggle");
    await factToggle.waitFor();
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    if (await factToggle.getAttribute("aria-pressed") === "true") {
      await factToggle.click();
      await page.waitForFunction(() => document.querySelector('[data-testid="factcheck-toggle"]')?.getAttribute("aria-pressed") === "false");
    }
    await factToggle.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="factcheck-toggle"]')?.getAttribute("aria-pressed") === "true");
    await see("팩트체크 & 근거자료 검증");
  }
  // 이미 검증한 문장은 다시 보내지 않는다 — 문장 하나를 덧붙이면 그 문장만 코어로
  if (factcheckReady) {
    const next = page.waitForRequest((r) => r.url().endsWith("/api/factcheck/run"), { timeout: 15_000 });
    // 사진의 조작 안내·캡션을 innerText로 평탄화해 기사 본문에 다시 넣지 않는다.
    await body.press('Control+End'); await page.keyboard.press('Enter');
    await page.keyboard.insertText('고친 문장을 하나 더 씁니다.');
    assert.deepEqual(JSON.parse((await next).postData()).nodes.map((n) => n.text), ["고친 문장을 하나 더 씁니다."]);
  }
  // 등록한 자료 이름을 누르면 추출 본문을 볼 수 있다
  await page.getByRole("button", { name: "자료.txt" }).click();
  await page.getByRole("dialog", { name: "취재자료 보기" }).getByText("스모크 테스트 본문입니다.").waitFor();
  // 개발 실행이면 청크 보기(청크별 색 밑줄)가 있다
  await page.getByRole("button", { name: "청크 보기 (개발)" }).click();
  await page.getByTestId("chunk-view").getByText(/청크 [1-9][0-9]*개/).waitFor();
  await page.getByRole("dialog", { name: "취재자료 보기" }).getByTitle("닫기").click();
  // 검증 결과는 본문 DOM 을 바꾸지 않고 CSS Custom Highlight 로 칠한다(판정은 엔진 몫 — 칠할 수 있는지만 본다. 색은 아래 고정 응답으로 확인)
  assert.ok(await page.evaluate(() => "highlights" in CSS), "본문 하이라이트(CSS Custom Highlight)를 쓸 수 있어야 합니다");
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
  await page.getByRole("status").getByText("임시 저장됨").first().waitFor({ timeout: 15_000 });
  await page.keyboard.press("Control+s"); // 저장 이력에는 수동 저장만 남는다 — 취재자료가 들어간 판을 이력에 남긴다
  await page.getByRole("status").getByText(/^저장됨/).first().waitFor({ timeout: 15_000 });
  await body.press('Control+End'); await page.keyboard.press('Enter');
  await page.keyboard.insertText('순서형 검사용 새 문장을 하나 더 씁니다.');
  const sequence = page.getByTestId("factcheck-review"); // 서랍을 열면 순서형 검사가 함께 켜진다
  await sequence.getByText(/AI 팩트체크 순서형 검사/).waitFor({ timeout: 15_000 });
  await sequence.getByText("스모크 불일치 사유").waitFor();
  await page.waitForFunction(() => CSS.highlights.size > 0); // 불일치 문장이 본문에 칠해진다
  await sequence.getByRole("button", { name: "검사 종료" }).click();
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
  await page.getByRole("status").getByText(/^저장됨/).first().waitFor({ timeout: 15_000 });
  await page.getByTestId("save-status").click();
  const history = page.getByTestId("version-history");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="revision-list"] button').length >= 2);
  const countBefore = await history.getByTestId("revision-list").locator("button").count();
  await history.getByTestId("revision-list").locator("button").nth(1).click(); // 바로 앞 저장본(내용이 남아 있어 뒤 단계에 영향 없음)
  await history.getByTestId("revision-preview").locator("h1").waitFor();
  await history.getByRole("button", { name: "이 버전으로 복원" }).click();
  await page.getByRole("button", { name: "복원 확인" }).click();
  await see("저장본을 복원했습니다.");
  await page.getByTestId("save-status").click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="revision-list"] button').length > n, countBefore);
  await page.getByTestId("version-history").getByRole("button", { name: "닫기" }).click();
  // 5. 취재자료 검색 창
  await page.getByText("취재자료 검색").first().click();
  await page.getByPlaceholder(/자료 제목, 키워드 검색/).waitFor();
  // 앞에서 올린 자료가 코어 저장소(GET /api/sources)에서 목록으로 보인다
  await page.getByRole("heading", { name: "자료.txt", exact: true }).waitFor();
  await page.getByTitle("패널 닫기").dispatchEvent("click"); // 옆 패널 닫기(열릴 때 미끄러지는 애니메이션 중이라 직접 누른다)
  await page.getByPlaceholder(/자료 제목, 키워드 검색/).waitFor({ state: "detached" });
  // 6. 플랫폼 변환: FormatConverter UI -> App Core -> platform-generator 어댑터
  await go("플랫폼 변환");
  const converter = page.getByTestId("format-converter");
  const openEditorialOptions = async () => {
    const panel = converter.getByTestId('optional-editorial-direction');
    if (await panel.getAttribute('open') === null) await panel.locator('summary').first().click();
    return panel;
  };
  await converter.getByRole("button", { name: "선택 항목 생성", exact: true }).waitFor(); // 편집실 제목 문구는 화면에서 빠졌다(실제 있는 버튼으로 확인)
  let studioAiCalls=0,studioSnapshots=0;
  page.on('request',request=>{if(request.url().endsWith('/api/platform/generate'))studioAiCalls++;if(/\/snapshots$/.test(request.url()))studioSnapshots++;});
  const applyStudio=async()=>{
    const expectedTitle=await converter.getByTestId('loaded-title').textContent(),calls=studioAiCalls,snapshots=studioSnapshots;
    await converter.getByTestId('apply-studio-article').click();
    await page.waitForFunction(title=>document.querySelector('[data-testid="applied-source"]')?.textContent.includes('적용 완료 · '+title),expectedTitle);
    assert.equal(studioAiCalls,calls,'적용 버튼은 AI 생성 요청을 보내지 않는다');assert.equal(studioSnapshots,snapshots,'적용 버튼은 고정본을 만들지 않는다');
  };
  assert.equal(await converter.getByTestId('generate-active').isDisabled(),true);
  await applyStudio();
  const editorialOptions = await openEditorialOptions();
  const topicOptions = editorialOptions.locator('details').filter({has:page.getByText(/^특정 주제 강조/)});
  if (await topicOptions.getAttribute('open') === null) await topicOptions.locator('summary').first().click();
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
  // 두 배포 플랫폼을 해제해 카드뉴스만 선택해도 상위 App 렌더를 건드리거나 화면이 사라지지 않아야 한다.
  await converter.getByRole("button", { name: "Instagram 피드 원고" }).click();
  await converter.getByRole("button", { name: "Threads 짧은 요약" }).click();
  await converter.getByTestId("generate-active").getByText("카드뉴스만 생성").waitFor();
  await converter.getByTestId("generate-active").click();
  await converter.getByText("1/1개 결과를 실제 생성 엔진에서 받아왔습니다.").waitFor();
  await converter.getByTestId('platform-card-editor').waitFor();
  await converter.getByRole('button',{name:'2번 카드'}).click();
  await converter.getByRole('textbox',{name:'headline',exact:true}).fill('카드 단독 편집 결과');
  await converter.getByRole('button',{name:'1번 카드'}).click();
  await converter.getByRole('button',{name:'2번 카드'}).click();
  assert.equal(await converter.getByRole('textbox',{name:'headline',exact:true}).inputValue(),'카드 단독 편집 결과');
  await converter.getByRole("button", { name: "Instagram 피드 원고" }).click();
  await converter.getByRole("button", { name: "Threads 짧은 요약" }).click();
  await converter.getByRole('button',{name:'선택 항목 생성',exact:true}).click();
  await converter.getByText('3/3개 결과를 실제 생성 엔진에서 받아왔습니다.').waitFor();
  await converter.getByRole('button',{name:/^카드뉴스●/}).click();
  await converter.getByTestId('platform-card-editor').getByRole('button',{name:'3번 카드'}).click();
  assert.equal(await converter.getByRole('textbox',{name:'headline',exact:true}).inputValue(),'스모크 카드 3');
  await converter.getByRole('button',{name:/^Threads●/}).click();
  assert.equal(await converter.getByTestId('threads-card').count(),3);
  await converter.getByRole('button',{name:/^Instagram●/}).click();
  assert.equal(await converter.locator('main textarea').first().inputValue(),'스모크 인스타그램 도입');
  await converter.getByRole('button',{name:/^카드뉴스●/}).click();
  await converter.getByTestId('platform-card-editor').waitFor();
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
  await converter.getByRole('button',{name:'다시 검수'}).click();await reviewWaiting; // 검수 완료 상태에서는 '검수' 버튼이 막히고 '다시 검수'가 새 검수를 시작한다
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
  // ── 이전 방식 단계(정민 님 작성) ─────────────────────────────────────────────────────────────────
  // 아래 단계는 카드 JPG를 내보낼 때 다시 그리고 SNS 연결을 직접 누르던 이전 동작 기준이다. 지금 편집실은 생성 직후 JPG를 미리 준비해 재사용하고
  // (useSnsConnection 으로 연결을 자동 확인) 이 단계가 만들려는 상황(두 번째 렌더 실패 등)이 생기지 않는다. 같은 영역은 platform-generator/tests
  // (card-jpg-studio, instagram-delivery-ui, threads-connection 등)가 새 동작 기준으로 검증한다. 새 동작에 맞게 갱신되기 전까지 기본은 건너뛰고,
  // 내용은 지우지 않는다. 다시 보려면 UI_SMOKE_LEGACY_CONVERT=1 로 실행한다.
  if (process.env.UI_SMOKE_LEGACY_CONVERT === "1") {
  // 전체 렌더 중 두 번째 카드 실패: 성공 표시·일부 SNS 첨부를 하지 않고 카드 번호·재시도를 안내한다.
  let renderCount=0;
  await page.route('**/api/platform/render',async route=>{renderCount++;if(renderCount===2)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'fixture render failure'})});else await route.continue();});
  await converter.getByTestId('cards-export').click();
  await converter.getByTestId('delivery-status').getByText(/2번 카드[\s\S]*실패/).waitFor();
  await converter.getByTestId('delivery-status').getByText(/다시 시도/).waitFor();
  await page.unroute('**/api/platform/render');

  // 실패 카드 재시도와 전체 JPG 링크, 두 채널의 팀 Core 작성 준비. 게시 작업은 없다.
  await converter.getByTestId('cards-export').click();
  await converter.getByTestId('delivery-status').getByText(/3장 JPG를 저장했습니다/).waitFor();
  await converter.getByTestId('export-notice').waitFor();
  // 내 문서\AI Newsroom\내보내기\카드뉴스\YYYYMMDD_<제목>\01.jpg~03.jpg (시험은 SMOKE_DOCS 가 내 문서 자리)
  const cardFolders = fs.readdirSync(path.join(SMOKE_DOCS, '내보내기', '카드뉴스'));
  assert.equal(cardFolders.length, 1);
  assert.deepEqual(fs.readdirSync(path.join(SMOKE_DOCS, '내보내기', '카드뉴스', cardFolders[0])).sort(), ['01.jpg', '02.jpg', '03.jpg']);
  // 원고/카드의 고정본 혼합은 실제 원문 변경으로 만든다. 플랫폼 편집 저장만으로는 새 고정본을 만들지 않는다.
  await go('기사 작성');await body.fill((await body.inputValue())+'\n새 원문 고정본 구분 문장입니다.');await go('플랫폼 변환');
  await converter.getByTestId('applied-source').getByText(/재적용이 필요/).waitFor();
  assert.equal(await converter.getByTestId('generate-active').isDisabled(),true);await applyStudio();
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

  } else {
    console.log("ui-smoke: [건너뜀] 이전 방식의 카드 JPG 실패 재시도·SNS 작성 준비 단계(새 편집실 동작에 맞게 갱신 필요, UI_SMOKE_LEGACY_CONVERT=1 로 실행 가능)");
  }

  await go("보관함");
  await see("미디어 & 변환 자산");
  // 팩트체크 서랍에 올린 자료가 기사 취재자료로 남아 보관함에 보여야 한다(깨진 파일은 빠짐)
  await page.getByText("취재자료 (1건)").waitFor();
  await page.getByText("• 자료.txt").waitFor();
  await snapshot('prototype-ux-archive');
  // 휴지통(코어 /api/trash): 지운 기사가 없으면 비어 있다고 보이고, 다시 누르면 목록으로 돌아온다
  await page.getByTestId("archive-scope").selectOption("trash");
  await page.getByTestId("trash-list").getByText("휴지통이 비어 있습니다.").waitFor();
  await page.getByTestId("archive-scope").selectOption("all");
  await page.getByTestId("trash-list").waitFor({ state: "detached" });
  assert.equal(await page.getByTestId("data-map").count(), 0, "보관함에는 데이터맵을 중복 렌더링하지 않는다");
  await go("데이터맵");
  assert.equal(await page.getByTestId("archive-view").count(), 0);
  const dataMap = page.getByTestId("data-map");
  const sampleRoot = new URL('dev/tests/fixtures/datamap/', ROOT);
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
  await see("STT 인터뷰 전사 & AI 요약");
  // 녹음 전사: 파일 → 코어 /api/interview/transcribe → 백엔드 /ai/audio/transcriptions(multipart) → 화자별 대화
  await page.locator('input[type="file"]').setInputFiles({ name: "stub.m4a", mimeType: "audio/mp4", buffer: Buffer.from("stub audio") });
  await see("스텁 답변입니다");
  await see("전사 완료");
  // 전사 내용을 기사로 내보내면 본문 끝에 인터뷰 발췌 표시가 들어가고 작성 화면으로 돌아간다(녹취는 기사에 연결)
  await page.getByRole('button', { name: '기사 작성기로 내보내기' }).click();
  await body.waitFor();
  assert.ok(((await body.innerText()).trim()).includes('[인터뷰 발췌 녹취:'));
  await go('녹음 파일');
  await see('전사 완료');
  await go("기사 작성");
  await see("취재자료 검색");
  // 앱을 다시 열면 마지막 화면과 최근 원고(제목·본문·취재자료)가 그대로 — 자동 저장(1.5초) 뒤 새로고침
  await go("보관함");
  await page.waitForTimeout(2500);
  await page.reload();
  await waitWorkspaceReady();
  await see("미디어 & 변환 자산");
  await page.getByText("취재자료 (1건)").waitFor();
  await go("기사 작성");
  assert.equal(await page.getByPlaceholder("기사 제목을 입력하세요").inputValue(), "스텁 제목 둘");
  assert.ok(((await body.innerText()).trim()).startsWith("스모크 테스트 본문입니다."));
  // 플랫폼 생성 결과도 같은 암호화 원고에 저장되어 재시작 후 복원돼야 한다.
  await go("플랫폼 변환");
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="format-converter"] textarea')].some((el) => el.value === "스모크 인스타그램 도입"), null, { timeout: 10_000 });
  await go("기사 작성");
  // 7. 좁은 화면에서도 첫 화면이 오류 없이 그려지는지
  // 개발 계정 자동 로그인이 켜져 있으면 로그인된 상태이고, 끄면 로그아웃되어 로그인 창이 뜬다
  session = { ...session, signedIn: true, email: "dev@example.test",
    autoLogin: { available: true, enabled: true, email: "dev@example.test", error: "" } };
  await page.reload();
  await waitWorkspaceReady();
  const autoLogin = page.getByTestId("auto-login-toggle");
  await autoLogin.waitFor();
  await autoLogin.getByText(/켜짐/).waitFor();
  assert.equal(await login.count(), 0, "자동 로그인으로 로그인된 상태에서는 로그인 창이 없어야 합니다");
  await autoLogin.click();
  await login.waitFor();
  session = { ...session, signedIn: true, email: "reporter@example.test",
    autoLogin: { available: false, enabled: false, email: "", error: "" } };
  await page.reload();
  await waitWorkspaceReady();
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
  await waitWorkspaceReady();
  // 좁은 화면: 모델 설치(환경 설정 화면)가 화면 밖으로 넘치지 않는다
  await go("환경 설정");
  await page.getByTestId("models-summary").getByText(/모든 모델이 설치되어 있습니다/).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "좁은 화면에서 환경 설정 화면이 가로로 넘칩니다");
  await go("기사 작성");
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

  for (const name of ["headlines", "subtitles", "photo_keywords", "search:stub wafer", "stt:clova", "interview_analysis"])
    assert.ok(stubCalls.includes(name), `코어가 백엔드로 ${name} 를 요청하지 않았습니다: ${stubCalls}`);
  assert.equal(savedIds.size, 1, "같은 원고는 화면을 오가도 한 파일에 저장돼야 합니다: " + [...savedIds]);
  // 새 기사로 전환할 때 디바운스가 남아 있어도 현재 원고를 먼저 저장한다.
  await page.setViewportSize({ width: 1440, height: 900 });
  await go('기사 작성');
  await body.fill(((await body.innerText()).trim()) + '\n전환 직전 보존 문장');
  await go('오늘의 데스크');
  await page.getByRole('button', { name: '+ 새 기사', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-placeholder^="기사 본문을 입력하세요"]')?.innerText.trim() === '');
  await page.getByPlaceholder('기사 제목을 입력하세요').fill('전환 검증 두 번째 기사');
  await body.fill('두 번째 기사 본문입니다. 저장 ID를 분리합니다.');
  await page.getByRole("status").getByText('임시 저장됨').first().waitFor();
  assert.equal(savedIds.size, 2, '새 기사는 별도 ID에 저장한다');
  await go('보관함');
  await page.getByTestId('archive-view').getByRole('button', { name: /^\d+\s*스텁 제목 둘/ }).click();
  await page.getByRole('button', { name: '수정', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('input[placeholder="기사 제목을 입력하세요"]')?.value === '스텁 제목 둘');
  assert.ok(((await body.innerText()).trim()).includes('전환 직전 보존 문장'));
  // 전환 저장이 실패하면 현재 원고를 버리거나 새 기사로 넘어가지 않는다.
  await page.route('**/api/articles/save', (route) => reply(route, { error: '전환 저장 테스트 오류' }, 503));
  await body.fill(((await body.innerText()).trim()) + '\n저장 실패 시 보존 문장');
  await go('오늘의 데스크');
  await page.getByRole('button', { name: '+ 새 기사', exact: true }).click();
  await page.getByRole('alert').getByText(/현재 원고는 유지됩니다/).waitFor();
  await page.unroute('**/api/articles/save');
  await go('기사 작성');
  assert.ok(((await body.innerText()).trim()).includes('저장 실패 시 보존 문장'));
  // 보관함 × 로 기사 삭제(지금 쓰는 기사가 아닌 것) → 목록에서 사라지고 코어 목록에서도 빠진다
  await go('보관함');
  const archive = page.getByTestId('archive-view');
  await archive.getByRole('button', { name: '전환 검증 두 번째 기사 삭제' }).click();
  await archive.getByRole('button', { name: /^\d+\s*전환 검증 두 번째 기사/ }).waitFor({ state: 'detached' });
  const remaining = (await (await page.request.get(`${BASE}/api/articles`)).json()).articles.map((item) => item.title);
  assert.ok(!remaining.includes('전환 검증 두 번째 기사'), '삭제한 기사가 코어 목록에 남았습니다: ' + remaining);
  // 저장 기사 선택은 기존 보관함을 재사용한다. 변환 화면에 별도 선택기·DB 우회 경로는 없다.
  const dbTitles=new Map();
  const legacyBlog={title:'과거 Blog 사용자 기록',intro:'원래 자료',sections:[{heading:'기존 제목',body:'기존 내용'}]};
  const seedDbArticle=async fields=>{
    const data={content:'DB 기사 본문입니다.',bodyHtml:'<p>DB 기사 본문입니다.</p>',title:'DB 기사',subtitle:'',url:'',...fields};
    const response=await page.request.post(`${BASE}/api/articles/save`,{headers:{Origin:BASE},data:{kind:'manual',draft:data}});
    assert.equal(response.status(),200);const id=(await response.json()).articleId;dbTitles.set(id,data.title);return id;
  };
  const longTitle='긴 제목의 전체 내용을 표시합니다 '.repeat(12).trim(),longSubtitle='여러 줄의 실제 부제목을 보존합니다 '.repeat(20).trim();
  const linkedId=await seedDbArticle({title:longTitle,subtitle:longSubtitle,url:'https://example.test/db-source',platformDrafts:{blog:legacyBlog},platformGeneration:{selectedPlatforms:['blog']}});
  const plainId=await seedDbArticle({title:'URL과 부제 없는 DB 기사'});
  const emptyId=await seedDbArticle({title:'본문 없는 DB 기사',content:'',bodyHtml:''});
  const structuredId=await seedDbArticle({title:'HTML 호환 DB 기사',subtitle:'실제 HTML 부제',content:{type:'doc',content:[]},bodyHtml:'<p>구조화 원문의 HTML 본문입니다.</p>'});
  const manualSaved=page.waitForResponse(response=>response.url().endsWith('/api/articles/save')&&response.ok()&&response.request().postDataJSON()?.kind==='manual');
  await page.keyboard.press('Control+s');await manualSaved;await page.locator('header, [role="status"]').getByText(/^저장됨/).first().waitFor();
  await page.reload();
  await waitWorkspaceReady();
  const previewStored=async id=>{
    await go('보관함');
    const view=page.getByTestId('archive-view');
    await view.locator('.workspace-article-list .archive-item > button:not(.archive-delete)').filter({hasText:dbTitles.get(id)}).click();
    return view;
  };
  const selectStored=async id=>{
    const view=await previewStored(id);
    await view.getByRole('button',{name:'수정',exact:true}).click();
    await page.waitForFunction(title=>document.querySelector('input[placeholder="기사 제목을 입력하세요"]')?.value===title,dbTitles.get(id));
    await go('플랫폼 변환');
  };
  await selectStored(linkedId);
  console.log('ui-smoke: 기존 보관함 선택·중복 선택기 없음 확인');
  assert.equal(await converter.getByTestId('platform-article').count(),0);
  assert.equal(await converter.getByRole('button',{name:/Blog/}).count(),0,'과거 기록이 있어도 Blog 버튼·탭·편집을 노출하지 않는다');
  await converter.getByTestId('loaded-title').getByText(longTitle,{exact:true}).waitFor();
  assert.equal(await converter.getByTestId('loaded-subtitle').textContent(),longSubtitle);
  assert.equal(await converter.getByRole('link',{name:'원문 출처 링크'}).getAttribute('href'),'https://example.test/db-source');
  for(const field of ['loaded-title','loaded-subtitle']){
    assert.equal(await converter.getByTestId(field).evaluate(el=>el.scrollHeight>el.clientHeight),false,'전체 기사 메타데이터는 잘리면 안 된다');
    assert.equal(await converter.getByTestId(field).evaluate(el=>getComputedStyle(el).webkitLineClamp),'none');
  }
  const generateActive=async()=>{if(await converter.getByTestId('generate-active').isDisabled())await applyStudio();await converter.getByTestId('generate-active').click();await converter.getByText(/\d+\/\d+개 결과를 실제 생성 엔진에서 받아왔습니다\./).waitFor();};
  const saveCurrent=async()=>{
    const saved=page.waitForResponse(response=>response.url().endsWith('/api/articles/save')&&response.ok()&&response.request().postDataJSON()?.kind==='manual');
    await page.keyboard.press('Control+s');await saved;await page.locator('header, [role="status"]').getByText(/^저장됨/).first().waitFor();
  };
  const readDb=async id=>(await (await page.request.get(`${BASE}/api/articles/${id}`)).json()).draft;
  await generateActive();await saveCurrent();
  let generated=(await readDb(linkedId)).platformDrafts.instagram;
  assert.deepEqual(generated.generation_input.article,{article_id:linkedId,title:longTitle,content:'DB 기사 본문입니다.'});
  assert.equal(generated.generation_input.source_url,'https://example.test/db-source');
  assert.deepEqual((await readDb(linkedId)).platformDrafts.blog,legacyBlog,'원고 생성·저장으로 과거 Blog 기록을 삭제하거나 바꾸지 않는다');
  const firstSnapshot=generated.snapshot_id;
  await generateActive();await saveCurrent();assert.equal((await readDb(linkedId)).platformDrafts.instagram.snapshot_id,firstSnapshot);
  await converter.locator('main textarea').first().fill('DB 플랫폼 사용자 편집');
  // 기존 기사 전환 정책이 저장하지 않은 플랫폼 편집을 보호한다.
  await selectStored(plainId);
  assert.equal((await readDb(linkedId)).platformDrafts.instagram.opening,'DB 플랫폼 사용자 편집');
  assert.equal(await converter.getByTestId('loaded-subtitle').textContent(),'부제목 없음');
  assert.equal(await converter.getByRole('link',{name:'원문 출처 링크'}).count(),0);
  assert.equal(await converter.locator('main textarea').count(),0);
  await generateActive();await saveCurrent();
  assert.deepEqual((await readDb(plainId)).platformDrafts.instagram.generation_input.article,{article_id:plainId,title:dbTitles.get(plainId),content:'DB 기사 본문입니다.'});
  await selectStored(linkedId);
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid="format-converter"] main textarea')].some(el=>el.value==='DB 플랫폼 사용자 편집'));
  await converter.getByRole('button',{name:/기사 (전문 보기|편집)/}).first().click();
  await page.getByPlaceholder(/부제.*입력/).fill('편집 화면에서 수정한 실제 부제');
  await go('플랫폼 변환');await converter.getByTestId('loaded-subtitle').getByText('편집 화면에서 수정한 실제 부제',{exact:true}).waitFor();
  await converter.getByTestId('applied-source').getByText(/재적용이 필요/).waitFor();
  await generateActive();await saveCurrent();
  generated=(await readDb(linkedId)).platformDrafts.instagram;
  assert.notEqual(generated.snapshot_id,firstSnapshot,'기존 Core 고정본 재사용 정책을 변경하지 않는다');
  assert.equal(generated.generation_input.article.subtitle,undefined,'화면 부제를 생성 원문에 합치지 않는다');
  await selectStored(emptyId);
  await converter.getByText('기사 본문 없음 · 기사 편집 화면에서 확인해 주세요.',{exact:true}).waitFor();
  assert.equal(await converter.getByRole('button',{name:'선택 항목 생성',exact:true}).isDisabled(),true);
  await selectStored(structuredId);await generateActive();await saveCurrent();
  assert.equal((await readDb(structuredId)).platformDrafts.instagram.generation_input.article.content,'구조화 원문의 HTML 본문입니다.');
  console.log('ui-smoke: 제목/부제·세 필드 입력·URL 유무·Blog 기록·저장/복원·고정본 재사용 확인');
  // 미리보기 이후 실제 작업 영역 조회가 실패해도 현재 기사와 편집은 유지한다.
  const preview=await previewStored(emptyId);await preview.getByRole('button',{name:'수정',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.workspace-primary')?.disabled);
  expectedDbFailureUrls.add(`${BASE}/api/articles/${emptyId}`);
  await page.route(`**/api/articles/${emptyId}`,route=>reply(route,{error:'DB 조회 실패 테스트'},404));
  await preview.getByRole('button',{name:'수정',exact:true}).click();
  await page.getByRole('alert').filter({hasText:/기사 조회 실패/}).waitFor();
  await go('플랫폼 변환');assert.equal(await converter.getByTestId('loaded-title').textContent(),'HTML 호환 DB 기사');
  await page.unroute(`**/api/articles/${emptyId}`);
  const deletedPreview=await previewStored(emptyId);
  await page.waitForFunction(()=>!document.querySelector('.workspace-primary')?.disabled);
  const deleted=await page.request.post(`${BASE}/api/articles/${emptyId}/delete`,{headers:{Origin:BASE},data:{}});assert.equal(deleted.status(),200);
  // 선택·미리보기 후 DB에서 삭제되는 실제 경쟁 조건. 이전 정보를 새 기사처럼 적용하지 않는다.
  await deletedPreview.getByRole('button',{name:'수정',exact:true}).click();
  await page.getByRole('alert').filter({hasText:/기사 조회 실패/}).waitFor();
  await go('플랫폼 변환');assert.equal(await converter.getByTestId('loaded-title').textContent(),'HTML 호환 DB 기사');
  // 생성 결과가 늦게 와도 기존 기사 선택 경로로 전환한 새 기사에 적용하지 않는다.
  let generationStarted,generationRelease;
  const genWaiting=new Promise(resolve=>generationStarted=resolve),genHold=new Promise(resolve=>generationRelease=resolve);
  await page.route('**/api/platform/generate',async route=>{const response=await route.fetch();generationStarted();await genHold;await route.fulfill({response});});
  await converter.getByTestId('generate-active').click();await genWaiting;
  await converter.getByTestId('request-source').getByText(/HTML 호환 DB 기사/).waitFor();
  await selectStored(plainId);generationRelease();await page.unroute('**/api/platform/generate');
  assert.equal(await converter.getByTestId('loaded-title').textContent(),'URL과 부제 없는 DB 기사');
  assert.equal((await readDb(plainId)).platformDrafts.instagram.article_id,plainId);
  await saveCurrent();
  // 느린 작업 영역 조회 중 재실행하면 이전 응답이 제목·부제를 덮지 않는다.
  const latePreview=await previewStored(linkedId);await page.waitForFunction(()=>!document.querySelector('.workspace-primary')?.disabled);
  let queryStarted,queryRelease;
  const queryWaiting=new Promise(resolve=>queryStarted=resolve),queryHold=new Promise(resolve=>queryRelease=resolve);
  await page.route(`**/api/articles/${linkedId}`,async route=>{const response=await route.fetch();queryStarted();await queryHold;await route.fulfill({response}).catch(()=>{});});
  await latePreview.getByRole('button',{name:'수정',exact:true}).click();await queryWaiting;
  await page.getByRole('status').filter({hasText:'현재 원고를 저장하고 작업을 전환합니다'}).waitFor();
  await page.reload();await waitWorkspaceReady();await go('플랫폼 변환');await converter.getByTestId('loaded-title').getByText('URL과 부제 없는 DB 기사',{exact:true}).waitFor();
  queryRelease();await page.unroute(`**/api/articles/${linkedId}`);
  assert.equal(await converter.getByTestId('loaded-title').textContent(),'URL과 부제 없는 DB 기사');
  await snapshot('db-article-platform-source');
  await applyStudio();
  // 같은 기사에서 생성 도중 조건을 고치면 늦은 결과를 적용하지 않는다.
  let editStarted,editRelease;
  const editWaiting=new Promise(resolve=>{editStarted=resolve;}),editHold=new Promise(resolve=>{editRelease=resolve;});
  await page.route('**/api/platform/generate',async route=>{
    const response=await route.fetch(),result=await response.json();result.draft.opening='조건 수정 중 응답 (적용 금지)';
    editStarted();await editHold;await route.fulfill({response,body:JSON.stringify(result)});
  });
  await converter.getByTestId('generate-active').click();await editWaiting;
  await openEditorialOptions();
  await converter.getByLabel('덧붙일 편집 방향 (선택)').fill('생성 도중 바꾼 요구사항');editRelease();
  await converter.getByText(/원문 또는 입력 조건이 바뀌어 이전 작업의 후속 호출과 결과 적용을 중단했습니다/).waitFor();
  assert.equal(await converter.locator('textarea').evaluateAll(elements=>elements.some(element=>element.value==='조건 수정 중 응답 (적용 금지)')),false);
  await page.unroute('**/api/platform/generate');
  // 편집실 내부 목록·미리보기·명시적 적용. 선택만 하면 적용 원문/생성 입력은 유지된다.
  const previewStudio=async title=>{
    await converter.getByTestId('choose-studio-article').click();
    const picker=page.getByTestId('platform-article-picker');
    await picker.getByRole('textbox',{name:'기사 제목 검색'}).fill(title);
    await picker.getByRole('button').filter({hasText:title}).first().click();
    await converter.getByTestId('loaded-title').getByText(title,{exact:true}).waitFor();
  };
  await previewStudio('HTML 호환 DB 기사');
  await converter.getByTestId('applied-source').getByText(/미리보기 기사와 적용 기사가 다릅니다/).waitFor();
  assert.ok((await converter.getByTestId('applied-source').textContent()).includes('URL과 부제 없는 DB 기사'));
  await generateActive();await saveCurrent();
  assert.equal((await readDb(plainId)).platformDrafts.instagram.article_id,plainId,'다른 기사 미리보기 중 생성도 기존 적용 기사 ID를 사용한다');
  await converter.locator('main textarea').first().fill('편집실 기사 적용 전 보존할 원고');
  await applyStudio();
  assert.equal((await readDb(plainId)).platformDrafts.instagram.opening,'편집실 기사 적용 전 보존할 원고');
  await generateActive();await saveCurrent();
  assert.equal((await readDb(structuredId)).platformDrafts.instagram.generation_input.article.article_id,structuredId);
  assert.equal((await readDb(structuredId)).platformDrafts.instagram.generation_input.article.content,'구조화 원문의 HTML 본문입니다.');
  // 현재 작업 기사에 영향 없이 빈 목록·목록 오류 안내.
  await page.route(`${BASE}/api/articles`,route=>reply(route,{articles:[]}));
  await converter.getByTestId('choose-studio-article').click();
  await page.getByTestId('platform-article-picker').getByText('저장된 기사가 없습니다.',{exact:true}).waitFor();
  await page.getByTestId('platform-article-picker').getByLabel('닫기',{exact:true}).click();await page.unroute(`${BASE}/api/articles`);
  await page.route(`${BASE}/api/articles`,route=>reply(route,{error:'목록 조회 검사 실패'},503));
  await converter.getByTestId('choose-studio-article').click();
  await page.getByTestId('platform-article-picker').getByRole('alert').getByText(/목록 조회 실패/).waitFor();
  await page.getByTestId('platform-article-picker').getByLabel('닫기',{exact:true}).click();await page.unroute(`${BASE}/api/articles`);
  // 늦은 미리보기 응답은 새 선택의 제목·부제를 덮지 않는다.
  let previewStarted,previewRelease;
  const previewWaiting=new Promise(resolve=>previewStarted=resolve),previewHold=new Promise(resolve=>previewRelease=resolve);
  await page.route(`**/api/articles/${linkedId}`,async route=>{const response=await route.fetch();previewStarted();await previewHold;await route.fulfill({response}).catch(()=>{});});
  await converter.getByTestId('choose-studio-article').click();
  await page.getByTestId('platform-article-picker').getByRole('textbox',{name:'기사 제목 검색'}).fill(longTitle);
  await page.getByTestId('platform-article-picker').getByRole('button').filter({hasText:longTitle}).first().click();await previewWaiting;
  assert.equal(await converter.getByTestId('apply-studio-article').isDisabled(),true);
  await previewStudio('URL과 부제 없는 DB 기사');previewRelease();await page.unroute(`**/api/articles/${linkedId}`);
  assert.equal(await converter.getByTestId('loaded-title').textContent(),'URL과 부제 없는 DB 기사');
  assert.ok((await converter.getByTestId('applied-source').textContent()).includes('HTML 호환 DB 기사'));
  // 조회 실패는 이전 미리보기 정보를 새 기사로 가장하지 않는다.
  await page.route(`**/api/articles/${linkedId}`,route=>reply(route,{error:'편집실 기사 조회 검사 실패'},503));
  await converter.getByTestId('choose-studio-article').click();
  await page.getByTestId('platform-article-picker').getByRole('textbox',{name:'기사 제목 검색'}).fill(longTitle);
  await page.getByTestId('platform-article-picker').getByRole('button').filter({hasText:longTitle}).first().click();
  await converter.getByRole('alert').filter({hasText:/기사 조회 실패/}).waitFor();
  assert.equal(await converter.getByTestId('loaded-title').textContent(),'기사 미선택');assert.equal(await converter.getByTestId('apply-studio-article').isDisabled(),true);
  await page.unroute(`**/api/articles/${linkedId}`);
  // 미리보기 이후 삭제되는 기사: 적용 직전 실제 조회로 실패하고 기존 적용은 유지.
  const emptyStudioId=await seedDbArticle({title:'편집실 빈 본문 검사 기사',content:'',bodyHtml:''});
  await previewStudio('편집실 빈 본문 검사 기사');
  assert.equal(await converter.getByTestId('apply-studio-article').isDisabled(),true);
  await converter.getByText('기사 본문 없음 · 기사 편집 화면에서 확인해 주세요.',{exact:true}).waitFor();
  assert.equal((await readDb(emptyStudioId)).content,'');
  const removedId=await seedDbArticle({title:'적용 직전 삭제 검사 기사'});
  await previewStudio('적용 직전 삭제 검사 기사');expectedDbFailureUrls.add(`${BASE}/api/articles/${removedId}`);
  await page.request.post(`${BASE}/api/articles/${removedId}/delete`,{headers:{Origin:BASE},data:{}});
  await converter.getByTestId('apply-studio-article').click();await converter.getByRole('alert').filter({hasText:/적용 실패/}).waitFor();
  assert.ok((await converter.getByTestId('applied-source').textContent()).includes('HTML 호환 DB 기사'));
  // 부제 자체가 없는 DB JSON도 조회 원래 필드 존재 여부를 보존해 표시한다.
  // 적용 조회 중 화면 이탈: 늦은 응답/이전 콜백이 다른 작업 기사를 열지 않는다.
  await previewStudio('URL과 부제 없는 DB 기사');
  let applyStarted,applyRelease;
  const applyWaiting=new Promise(resolve=>applyStarted=resolve),applyHold=new Promise(resolve=>applyRelease=resolve);
  await page.route(`**/api/articles/${plainId}`,async route=>{const response=await route.fetch();applyStarted();await applyHold;await route.fulfill({response}).catch(()=>{});});
  await converter.getByTestId('apply-studio-article').click();await applyWaiting;
  await go('기사 작성');applyRelease();await page.unroute(`**/api/articles/${plainId}`);
  assert.equal(await page.getByPlaceholder('기사 제목을 입력하세요').inputValue(),'HTML 호환 DB 기사');
  await go('플랫폼 변환');assert.ok((await converter.getByTestId('applied-source').textContent()).includes('HTML 호환 DB 기사'));
  // 기사 전환은 확인창 없이 "지금 원고를 저장한 뒤 전환"한다(main #42). 옛 시험의 "확인창 취소" 단계는 이 방식에서 없어졌다.
  // 대신 다른 기사를 적용하면 적용 원문이 바뀌고, 저장 오류는 위 "전환 저장 테스트 오류" 단계에서 현재 원고를 유지하는지 본다.
  await previewStudio('URL과 부제 없는 DB 기사');
  await converter.getByTestId('apply-studio-article').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="applied-source"]')?.textContent.includes('적용 완료 · URL과 부제 없는 DB 기사'));
  const missingSubtitleId=await seedDbArticle({title:'부제 미전달 저장 기사',subtitle:undefined});
  const rawMissing=await readDb(missingSubtitleId);assert.equal(Object.hasOwn(rawMissing,'subtitle'),false);
  await previewStudio('부제 미전달 저장 기사');assert.equal(await converter.getByTestId('loaded-subtitle').textContent(),'부제 전달 미연결');
  await applyStudio();assert.equal(await converter.getByTestId('loaded-subtitle').textContent(),'부제 전달 미연결');
  await generateActive();await saveCurrent();assert.equal((await readDb(missingSubtitleId)).platformDrafts.instagram.generation_input.article.subtitle,undefined);
  console.log('ui-smoke: 편집실 모달 검색·미리보기/적용 분리·실제 Core ID·원고 보존·빈 목록/오류·늦은 조회·삭제·부제 미전달 확인');
  // 기사 미선택 화면은 별도 본문 입력을 만들지 않고 생성을 비활성화한다.
  await go('오늘의 데스크');await page.getByRole('button',{name:'+ 새 기사',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-placeholder^="기사 본문을 입력하세요"]')?.innerText.trim()==='');
  await go('플랫폼 변환');
  await converter.getByTestId('loaded-title').getByText('기사 미선택',{exact:true}).waitFor();
  assert.equal(await converter.getByTestId('loaded-subtitle').textContent(),'부제목 없음');
  assert.equal(await converter.getByTestId('platform-article').count(),0);
  assert.equal(await converter.getByRole('button',{name:'선택 항목 생성',exact:true}).isEnabled(),false);
  assert.equal(await converter.locator('main textarea').count(),0);
  await snapshot('db-article-empty-source');
  assert.deepEqual(problems, [], "브라우저 오류:\n" + problems.join("\n"));
  console.log("PASS ui-smoke: 로그인·로그아웃·개발 자동 로그인·모델 설치/취소/오류/폴링·코어 연결·제목/부제 추천·임시 저장·수동 저장·사진 검색·사진 편집·팩트체크 서랍·자료 검색·실제 platform-generator 경계·보관함·녹취 전사·모바일 폭");
  }
} catch (error) {
  if (page) await page.screenshot({ path: fileURLToPath(new URL("temp/ui-smoke-failure.png", ROOT)) }).catch(() => {});
  console.error("FAIL ui-smoke:", error.stack || error.message);
  if(page)console.error('Workspace failure context:',(await page.locator('body').innerText({timeout:2000}).catch(()=>'' )).slice(0,2200));
  if(page)console.error('UI failure context:',(await page.locator('[data-testid="format-converter"], [data-testid="archive-view"]').first().innerText({timeout:2000}).catch(()=>'' )).slice(-1800));
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
