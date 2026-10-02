import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const server = spawn("python", ["app/server.py"], {
  cwd: new URL("../..", import.meta.url),
  env: { ...process.env, PORT: "8778" },
});
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch("http://127.0.0.1:8778/api/status")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
    args: ["--no-sandbox"],
    env: { ...process.env, LD_LIBRARY_PATH: process.env.CHROME_LIBS },
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.goto("http://127.0.0.1:8778");
  await page.locator("[data-body]").waitFor();
  await page.evaluate(() => {
    const app = document.querySelector("article-workspace");
    app.state.photos = [
      {
        id: "test",
        data:
          "data:image/svg+xml," +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="260"><rect width="700" height="260" fill="teal"/></svg>',
          ),
        caption: "",
        source: "",
      },
    ];
    const b = app.q("[data-body]");
    b.replaceChildren();
    b.append(
      document.createTextNode("첫 번째 줄"),
      document.createElement("br"),
      document.createTextNode("두 번째 줄"),
      document.createElement("br"),
      document.createTextNode("세 번째 줄"),
      app.figure(app.state.photos[0]),
    );
  });
  let r = await page.locator("[data-body] figure img").boundingBox();
  const y = await page
    .locator("[data-body]")
    .evaluate((n) => n.getBoundingClientRect().top + 5);
  await page.mouse.move(r.x + 50, r.y + 80);
  await page.mouse.down();
  await page.mouse.move(r.x + 50, y, { steps: 15 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  const order = await page
    .locator("[data-body]")
    .evaluate((n) => [...n.childNodes].map((x) => x.nodeName));
  console.log({ upwardOrder: order });
  assert.equal(order[0], "FIGURE");
  console.log("PASS upward drop before plain text");
  // Long manuscripts: the top edge scrolls upward.
  await page.evaluate(() => {
    const app = document.querySelector("article-workspace"),
      b = app.q("[data-body]"),
      f = b.querySelector("figure");
    b.innerHTML = Array.from(
      { length: 28 },
      (_, i) => `<p>문단 ${i + 1}: 사진 위치를 확인하는 테스트 원고입니다.</p>`,
    ).join("");
    b.append(f);
  });
  await page.locator("[data-body] figure img").scrollIntoViewIfNeeded();
  r = await page.locator("[data-body] figure img").boundingBox();
  const initialScroll = await page.evaluate(() => scrollY);
  await page.mouse.move(r.x + 50, r.y + 50);
  await page.mouse.down();
  await page.mouse.move(r.x + 50, 78, { steps: 15 });
  await page.waitForTimeout(600);
  assert.ok((await page.evaluate(() => scrollY)) < initialScroll);
  await page.mouse.up();
  assert.equal(await page.locator(".photo-drag-ghost").count(), 0);
  // The component also works inside a separately scrolling app panel.
  await page.evaluate(() => {
    const app = document.querySelector("article-workspace"),
      b = app.q("[data-body]"),
      main = app.q("[data-main]");
    b.append(b.querySelector("figure"));
    main.style.height = "500px";
    main.style.overflowY = "auto";
  });
  await page.locator("[data-body] figure img").scrollIntoViewIfNeeded();
  r = await page.locator("[data-body] figure img").boundingBox();
  const panel = await page.locator("[data-main]").boundingBox();
  const initialPanelScroll = await page
    .locator("[data-main]")
    .evaluate((n) => n.scrollTop);
  await page.mouse.move(r.x + 50, r.y + 50);
  await page.mouse.down();
  await page.mouse.move(r.x + 50, panel.y + 6, { steps: 15 });
  await page.waitForTimeout(500);
  await page.mouse.up();
  assert.ok(
    (await page.locator("[data-main]").evaluate((n) => n.scrollTop)) <
      initialPanelScroll,
  );
  const text =
    "도심 공원이 새롭게 문을 열었다. 주민들은 산책로와 쉼터를 이용할 수 있다. 이번 사업은 녹지 공간을 늘리고 생활 환경을 개선하기 위해 추진됐다. 담당 부서는 이용 현황을 확인해 시설을 보완할 계획이다.";
  const title = "도심 공원 새롭게 문 열었다…주민 위한 산책 공간과 쉼터 마련";
  await page.evaluate(
    ({ text, title }) => {
      const app = document.querySelector("article-workspace");
      app.state.title = title;
      app.state.subtitle = "주민 위한 휴식 공간 마련";
      app.state.bodyHtml = `<p>${text}</p><p>${text}</p>`;
      app.mode = "preview";
      app.render();
    },
    { text, title },
  );
  const reference = await browser.newPage();
  const css = fs.readFileSync(
    new URL("fixtures/donga-layout-reference.css", import.meta.url),
    "utf8",
  );
  await reference.setContent(
    `<!doctype html><html><head><link rel="stylesheet" href="http://127.0.0.1:8778/assets/donga-fonts.css"><style>*{box-sizing:border-box}html,body,h1,h2,p{margin:0;padding:0}html,body{height:100%;scrollbar-gutter:stable}body{word-break:keep-all;overflow-wrap:break-word}h1,h2{font:inherit;word-break:inherit}${css}html{font-family:"Donga Article Latin","Donga Article Korean",sans-serif}.head_group{letter-spacing:-.3px}.news_view p{margin-bottom:32.4px}</style></head><body><main class="recon02"><div class="view_head"><div class="inner"><section class="head_group"><h1>${title}</h1></section></div></div><div class="view_body"><div class="inner inner_aside"><aside class="reporter_group"></aside><div class="main_view"><section class="news_view"><h2 class="sub_tit">주민 위한 휴식 공간 마련</h2><p>${text}</p><p>${text}</p></section></div><aside></aside></div></div></main></body></html>`,
  );
  await reference.evaluate(() => document.fonts.ready);
  const measure = (n) => {
    const s = getComputedStyle(n),
      r = n.getBoundingClientRect(),
      t = n.firstChild,
      lines = [];
    if (t?.nodeType === 3) {
      let previous = null;
      for (let i = 0; i < t.length; i++) {
        const range = document.createRange();
        range.setStart(t, i);
        range.setEnd(t, i + 1);
        const top = range.getBoundingClientRect().top;
        if (top !== previous) {
          lines.push("");
          previous = top;
        }
        lines[lines.length - 1] += t.data[i];
      }
    }
    return { width: r.width, font: s.fontSize, line: s.lineHeight, lines };
  };
  const results = [];
  for (const width of [1440, 1366, 1280, 1100, 1024, 900, 768, 767, 640, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await reference.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const frame = page.frameLocator("iframe");
    await frame.locator(".body").waitFor();
    const actualBody = await frame.locator(".body p").first().evaluate(measure),
      expectedBody = await reference
        .locator(".news_view p")
        .first()
        .evaluate(measure);
    const actualTitle = await frame.locator(".title").evaluate(measure),
      expectedTitle = await reference.locator("h1").evaluate(measure);
    assert.deepEqual(actualBody, expectedBody, `body at ${width}`);
    assert.deepEqual(actualTitle, expectedTitle, `title at ${width}`);
    assert.equal(
      await page
        .locator("iframe")
        .evaluate((n) => getComputedStyle(n).transform),
      "none",
    );
    results.push({
      viewport: width,
      body: actualBody.width,
      title: actualTitle.width,
      titleFont: actualTitle.font,
      bodyLines: actualBody.lines.length,
    });
    if ([1366, 1100, 390].includes(width))
      await page.screenshot({
        path: new URL(
          `../../docs/screenshots/14-responsive-${width}.png`,
          import.meta.url,
        ).pathname,
        fullPage: true,
      });
  }
  console.log(
    JSON.stringify(
      {
        responsive: results,
        status: "PASS source CSS geometry and line breaks",
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill();
}
