import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = spawn("python", ["app/server.py"], {
  cwd: new URL("../..", import.meta.url),
  env: { ...process.env, PORT: "8776", USE_LOCAL_MODELS: "false" },
});
let browser, savedFile;
const errors = [],
  out = new URL("../../docs/screenshots/", import.meta.url);
fs.mkdirSync(out, { recursive: true });
const calls = { headline: 0, subheadline: 0 };
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:8776/api/status")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
    env: { ...process.env, LD_LIBRARY_PATH: process.env.CHROME_LIBS || "" },
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/assist", async (route) => {
    const p = route.request().postDataJSON();
    await new Promise((r) => setTimeout(r, 100));
    if (p.kind === "metadata") calls[p.requested]++;
    const d =
      p.kind === "metadata"
        ? p.requested === "headline"
          ? {
              headline_candidates: [
                "도심 공원 문 열었다…주민 위한 산책 공간 마련",
                "새 도심 공원 개장…산책로·쉼터 조성",
                "주민 곁으로 온 공원…도심 녹지 확충",
              ],
            }
          : {
              subtitle_candidates: [
                "산책로·쉼터 갖춘 도심 녹지\n주민 위한 휴식 공간 마련",
                "공원 문 열고 주민 맞아\n일상 속 녹지 공간 확충",
                "새 산책로·쉼터 조성\n주민 휴식 공간으로 개방",
              ],
            }
        : p.kind === "flow"
          ? {
              paragraphs: [
                "1. 새 도심 공원이 주민들에게 개방됐다.",
                "2. 산책로와 쉼터가 새롭게 마련됐다.",
                "3. 시는 공원의 시설 관리에 나설 예정이다.",
              ],
              advice: "",
            }
          : { keywords: ["city park", "walking path", "green space"] };
    await route.fulfill({ json: d });
  });
  await page.goto("http://127.0.0.1:8776");
  await page.locator("[data-title]").waitFor();
  await page.locator("[data-title]").click();
  assert.match(
    await page.locator('[data-suggestions="headline"]').innerText(),
    /기사 본문을 작성하면 기사 제목을 추천해드립니다/,
  );
  await page.locator("[data-subtitle]").click();
  assert.match(
    await page.locator('[data-suggestions="subheadline"]').innerText(),
    /기사 본문을 작성하면 부제목을 추천해드립니다/,
  );
  await page
    .locator("[data-title]")
    .fill("도심 공원 문 열었다…주민 위한 산책 공간 마련");
  await page
    .locator("[data-subtitle]")
    .fill("산책로·쉼터 갖춘 도심 녹지\n주민 위한 휴식 공간 마련");
  await page
    .locator("[data-body]")
    .fill(
      "시가 새로 조성한 도심 공원을 주민들에게 개방했다. 공원에는 산책로와 쉼터가 마련됐다. 주민들은 일상에서 녹지를 누릴 수 있게 됐다. 공원은 기존 유휴 부지를 활용해 조성됐다.",
    );
  await page.locator("[data-title]").click();
  await page
    .locator('[data-suggestions="headline"] [data-candidate]')
    .first()
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: new URL("01-editor.png", out).pathname,
    fullPage: true,
  });
  await page.locator('[data-confirm="headline"]').click();
  await page.locator('[data-confirm="subheadline"]').click();
  const lockedCount = { ...calls };
  assert.equal(
    await page.locator("[data-title]").getAttribute("contenteditable"),
    "false",
  );
  assert.equal(
    await page.locator("[data-subtitle]").getAttribute("aria-readonly"),
    "true",
  );
  assert.ok(await page.locator('[data-regenerate="headline"]').isDisabled());
  assert.equal(
    await page
      .locator("[data-title]")
      .evaluate((n) => getComputedStyle(n).color),
    "rgb(160, 160, 160)",
  );
  assert.equal(await page.locator('[data-confirm="headline"] rect').count(), 1);
  assert.ok(await page.locator('[data-suggestions="headline"]').isHidden());
  assert.ok(await page.locator('[data-suggestions="subheadline"]').isHidden());
  await page
    .locator("[data-body]")
    .fill(
      "시가 새로 조성한 도심 공원을 주민들에게 개방했다. 공원에는 산책로와 쉼터가 마련됐다. 주민들은 일상에서 녹지를 누릴 수 있게 됐다. 공원은 기존 유휴 부지를 활용해 조성됐다. 시는 시설 관리에 나설 계획이다.",
    );
  await new Promise((r) => setTimeout(r, 3700));
  assert.deepEqual(
    calls,
    lockedCount,
    "confirmed fields stop background generation",
  );
  await page.locator('[data-confirm="headline"]').click();
  assert.equal(
    await page.locator("[data-title]").getAttribute("contenteditable"),
    "true",
  );
  await page.locator('[data-regenerate="headline"]').click();
  await page
    .locator('[data-suggestions="headline"] [data-candidate]')
    .first()
    .waitFor();
  assert.equal(calls.headline, lockedCount.headline + 1);
  await page.locator("[data-images]").click();
  await page.mouse.click(10, 400);
  assert.ok(await page.locator("[data-photo-menu]").isHidden());
  assert.equal(
    await page.locator("[data-images]").getAttribute("aria-expanded"),
    "false",
  );
  await page.locator("[data-images]").click();
  assert.ok(await page.locator('[data-suggestions="headline"]').isHidden());
  assert.ok(await page.locator('[data-photo-choice="search"]').isVisible());
  await page.locator("[data-images]").click();
  await page.evaluate(() => {
    const e = document.querySelector("article-workspace");
    e.shadowRoot.querySelector("[data-body]").innerHTML =
      "<p>시가 새로 조성한 도심 공원을 주민들에게 개방했다. 공원에는 산책로와 쉼터가 마련됐다. 주민들은 일상에서 녹지를 누릴 수 있게 됐다.</p><p>공원은 기존 유휴 부지를 활용해 조성됐다. 시는 공원 이용 안내를 제공하고 시설 관리에 나설 계획이다.</p>";
    e.changed();
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.locator("[data-preview]").click();
  assert.ok(await page.locator("[data-count]").isVisible());
  const frame = page.frameLocator("iframe");
  await frame.locator(".body").waitFor();
  await page.evaluate(async () => {
    await document
      .querySelector("article-workspace")
      .shadowRoot.querySelector("iframe").contentDocument.fonts.ready;
  });
  const sizes = await frame.locator(".body").evaluate((n) => ({
    bodyWidth: n.getBoundingClientRect().width,
    fontSize: getComputedStyle(n).fontSize,
    lineHeight: getComputedStyle(n).lineHeight,
    paragraphs: n.querySelectorAll("p").length,
  }));
  assert.equal(
    await frame.locator(".category").evaluate((n) => getComputedStyle(n).color),
    "rgb(0, 134, 137)",
  );
  assert.equal(sizes.bodyWidth, 684);
  assert.equal(sizes.fontSize, "18px");
  assert.equal(sizes.paragraphs, 2);
  await page.screenshot({
    path: new URL("02-preview.png", out).pathname,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= innerWidth,
  );
  assert.equal(
    await frame
      .locator(".body")
      .evaluate((n) => n.getBoundingClientRect().width),
    343,
  );
  await page.screenshot({
    path: new URL("03-mobile-preview.png", out).pathname,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator("[data-preview]").click();
  const testImage = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 800;
    const g = c.getContext("2d"),
      gradient = g.createLinearGradient(0, 0, 1200, 800);
    gradient.addColorStop(0, "#477665");
    gradient.addColorStop(1, "#d9decc");
    g.fillStyle = gradient;
    g.fillRect(0, 0, 1200, 800);
    g.fillStyle = "#fff";
    g.font = '40px "Donga Article Korean"';
    g.fillText("사진 편집 테스트", 80, 120);
    return c.toDataURL("image/png");
  });
  const bytes = Buffer.from(testImage.split(",")[1], "base64");
  await page.route("https://images.unsplash.com/**", (route) =>
    route.fulfill({
      body: bytes,
      contentType: "image/png",
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  const searchRequests = [];
  await page.route("**/api/unsplash/**", (route) => {
    const url = route.request().url();
    if (url.includes("/search?")) {
      const requestedPage = Number(new URL(url).searchParams.get("page") || 1);
      searchRequests.push(requestedPage);
      return route.fulfill({
        json: {
          totalPages: 2,
          page: requestedPage,
          photos: [1, 2, 3]
            .map((n) => (requestedPage - 1) * 3 + n)
            .map((i) => ({
              id: "test" + i,
              urls: {
                small: "https://images.unsplash.com/test" + i,
                full: "https://images.unsplash.com/test" + i,
              },
              links: { html: "https://unsplash.com/photos/test" + i },
              user: {
                name: "테스트 사진가",
                links: { html: "https://unsplash.com/@test" },
              },
              alt_description: "사진 기능 테스트",
            })),
        },
      });
    }
    if (url.endsWith("/track"))
      return route.fulfill({ json: { tracked: true } });
    return route.fulfill({ body: bytes, contentType: "image/png" });
  });
  await page.locator("[data-images]").click();
  await page.locator('[data-photo-choice="search"]').click();
  await page.locator("[data-keywords] button").first().waitFor();
  await page.locator("[data-keywords] button").first().click();
  await page.locator("[data-results] .photo-card").first().waitFor();
  assert.equal(await page.locator("[data-results] .photo-card").count(), 3);
  assert.ok(await page.locator("[data-photo-prev]").isDisabled());
  await page.locator("[data-photo-next]").click();
  await page.locator('[data-photo="test4"]').first().waitFor();
  assert.ok(await page.locator("[data-photo-next]").isDisabled());
  await page.locator("[data-photo-prev]").click();
  await page.locator('[data-photo="test1"]').first().waitFor();
  assert.deepEqual(searchRequests, [1, 2]);
  await page.screenshot({
    path: new URL("06-unsplash-search.png", out).pathname,
    fullPage: false,
  });
  await page.locator('[data-photo="test1"][data-action="insert"]').click();
  await page.locator("[data-body] figure").waitFor();
  assert.equal(await page.locator("[data-canvas]").count(), 0);
  assert.equal(await page.locator("[data-body] figure").count(), 1);
  await page.evaluate(() => {
    const e = document.querySelector("article-workspace");
    e.shadowRoot.querySelector("[data-body] figure").remove();
    e.state.photos = [];
    e.changed();
  });
  await page.locator("[data-images]").click();
  await page.locator('[data-photo-choice="search"]').click();
  await page.locator("[data-keywords] button").first().waitFor();
  await page.locator("[data-keywords] button").first().click();
  await page.locator('[data-photo="test1"]').first().waitFor();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-photo="test1"][data-action="download"]').click(),
  ]);
  assert.equal(download.suggestedFilename(), "unsplash-test1.png");
  assert.ok(await download.path());
  await page.locator('[data-photo="test1"][data-action="edit"]').last().click();
  await page.locator("[data-canvas]").waitFor();
  assert.equal(await page.locator("[data-zoom]").count(), 0);
  await page.locator('[data-ratio="1.7777777777777777"]').click();
  const sliderValue = await page.locator("[data-brush-value]").boundingBox();
  const slider = await page.locator("[data-brush-size]").boundingBox();
  assert.ok(sliderValue.x >= slider.x + slider.width);
  const applyBox = await page.locator("[data-image-apply]").boundingBox();
  assert.ok(
    applyBox.y + applyBox.height <= 856,
    "editor controls fit above status bar at 900px height",
  );
  await page.setViewportSize({ width: 1280, height: 768 });
  const smallApply = await page.locator("[data-image-apply]").boundingBox();
  assert.ok(
    smallApply.y + smallApply.height <= 724,
    "all controls visible at 768px height",
  );
  await page.screenshot({
    path: new URL("10-compact-editor.png", out).pathname,
    fullPage: false,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  const canvas = await page.locator("[data-canvas]").boundingBox();
  // Resize the bottom-right handle while preserving the selected ratio.
  await page.mouse.move(canvas.x + canvas.width - 3, canvas.y + 416);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width - 120, canvas.y + 340, {
    steps: 10,
  });
  await page.mouse.up();
  assert.equal(await page.locator("[data-mosaic-hardness]").inputValue(), "20");
  await page.locator("[data-mosaic-hardness]").fill("15");
  assert.equal(await page.locator("[data-hardness-value]").innerText(), "15%");
  await page.locator("[data-mosaic-opacity]").fill("35");
  assert.equal(await page.locator("[data-opacity-value]").innerText(), "35%");
  await page.locator("[data-mosaic-add]").click();
  await page.mouse.move(canvas.x + 60, canvas.y + 80);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 220, canvas.y + 145, { steps: 8 });
  await page.mouse.up();
  assert.equal(await page.locator("[data-mask-delete]").isEnabled(), true);
  await page.locator("[data-mask-delete]").click();
  assert.equal(await page.locator("[data-mask-delete]").isEnabled(), false);
  await page.locator("[data-mosaic-add]").click();
  await page.mouse.move(canvas.x + 60, canvas.y + 80);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 160, canvas.y + 130, { steps: 8 });
  await page.mouse.move(canvas.x + 220, canvas.y + 80, { steps: 8 });
  await page.mouse.up();
  await page.locator("[data-mosaic-erase]").click();
  await page.locator("[data-brush-size]").fill("24");
  await page.mouse.move(canvas.x + 100, canvas.y + 100);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 125, canvas.y + 115, { steps: 6 });
  await page.mouse.up();
  assert.equal(await page.locator("[data-mosaic-move]").count(), 0);
  await page.mouse.move(canvas.x + 60, canvas.y + 80);
  assert.equal(
    await page.locator("[data-canvas]").evaluate((n) => n.style.cursor),
    "grab",
  );
  await page.mouse.down();
  await page.mouse.move(canvas.x + 90, canvas.y + 100, { steps: 8 });
  await page.mouse.up();
  // A selected completed brush is deleted, and Undo restores it.
  await page.mouse.click(canvas.x + 90, canvas.y + 100);
  const selectedPixels = await page
    .locator("[data-canvas]")
    .evaluate((n) => n.toDataURL());
  await page.locator("[data-canvas]").press("Backspace");
  assert.notEqual(
    await page.locator("[data-canvas]").evaluate((n) => n.toDataURL()),
    selectedPixels,
  );
  await page.locator("[data-mask-delete]").click();
  await page.screenshot({
    path: new URL("04-photo-edit.png", out).pathname,
    fullPage: true,
  });
  await page.locator("[data-image-apply]").click();
  const photo = await page.evaluate(
    () => document.querySelector("article-workspace").value.photos[0],
  );
  assert.equal(photo.masks.length, 1);
  assert.equal(photo.mosaicOpacity, 0.65);
  assert.equal(photo.mosaicHardness, 15);
  assert.equal(photo.masks[0].type, "brush");
  assert.equal(photo.masks[0].erasures.length, 1);
  assert.ok(photo.masks[0].points[0].x > 140);
  assert.ok(photo.masks[0].erasures[0].points[0].x > 210);
  assert.ok(photo.masks[0].points.length > 12);
  assert.ok(photo.masks[0].diameter > 48);
  assert.equal(
    await page
      .locator("[data-body]")
      .evaluate((n) => n.firstElementChild.tagName),
    "FIGURE",
  );
  assert.ok(await page.locator(".photo-actions").isHidden());
  assert.equal(
    await page
      .locator("[data-body] figure")
      .evaluate((n) => getComputedStyle(n).borderTopWidth),
    "0px",
  );
  await page.locator("[data-body] figure img").click();
  assert.ok(await page.locator(".photo-actions").isVisible());
  await page.screenshot({
    path: new URL("07-photo-tools.png", out).pathname,
    fullPage: false,
  });
  assert.equal(
    await page
      .locator('[data-photo-action="delete"]')
      .getAttribute("aria-label"),
    "삭제하기",
  );
  await page.mouse.click(10, 400);
  assert.ok(await page.locator(".photo-actions").isHidden());
  await page.locator("[data-body] figure img").click();
  assert.ok(await page.locator(".photo-actions").isVisible());
  await page.locator("[data-body] p").first().click();
  assert.ok(await page.locator(".photo-actions").isHidden());
  assert.ok(Math.abs(photo.crop.w / photo.crop.h - 16 / 9) < 1e-7);
  assert.ok(photo.crop.w < 1200);
  assert.notEqual(photo.data, photo.original);
  await page.evaluate(() => {
    const body = document
      .querySelector("article-workspace")
      .shadowRoot.querySelector("[data-body]");
    const photo = body.querySelector("figure"),
      p = body.querySelector("p");
    window.dragData = new DataTransfer();
    photo.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        dataTransfer: window.dragData,
      }),
    );
    const before = p.getBoundingClientRect().top + scrollY;
    body.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        clientY: p.getBoundingClientRect().bottom - 1,
        dataTransfer: window.dragData,
      }),
    );
    window.dragGeometry = {
      before,
      after: p.getBoundingClientRect().top + scrollY,
    };
  });
  assert.equal(
    await page
      .locator(".drop-guide")
      .evaluate((n) => n.getBoundingClientRect().height),
    0,
  );
  assert.equal(
    await page
      .locator(".drop-guide")
      .evaluate((n) => getComputedStyle(n, "::before").height),
    "2px",
  );
  assert.deepEqual(await page.evaluate(() => window.dragGeometry), {
    before: await page.evaluate(() => window.dragGeometry.before),
    after: await page.evaluate(() => window.dragGeometry.before),
  });
  await page.screenshot({
    path: new URL("08-insertion-line.png", out).pathname,
    fullPage: false,
  });
  await page.evaluate(() => {
    const body = document
      .querySelector("article-workspace")
      .shadowRoot.querySelector("[data-body]");
    body.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: window.dragData,
      }),
    );
    body.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
  });
  assert.equal(await page.locator(".drop-guide").count(), 0);
  assert.equal(
    await page
      .locator("[data-body]")
      .evaluate((n) => n.firstElementChild.tagName),
    "P",
  );
  // Every explicit BR and nested Enter block is an insertion boundary.
  const lineDrops = await page.evaluate(() => {
    const body = document
      .querySelector("article-workspace")
      .shadowRoot.querySelector("[data-body]");
    const original = [...body.childNodes];
    const photo = body.querySelector("figure");
    const results = [];
    for (const html of [
      "<b>첫 줄</b><br><i>둘째 줄</i><br>셋째 줄",
      "<div><b>첫 줄</b></div><div><i>둘째 줄</i></div><div>셋째 줄</div>",
    ]) {
      for (const index of [0, 1]) {
        body.replaceChildren(photo);
        const block = document.createElement("div");
        block.innerHTML = html;
        body.append(block);
        const node = html.includes("<br>")
          ? block.querySelectorAll("br")[index]
          : block.children[index + 1];
        const y = html.includes("<br>")
          ? node.getBoundingClientRect().bottom
          : node.getBoundingClientRect().top;
        const data = new DataTransfer();
        photo.dispatchEvent(
          new DragEvent("dragstart", { bubbles: true, dataTransfer: data }),
        );
        body.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            clientY: y,
            dataTransfer: data,
          }),
        );
        body.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: data,
          }),
        );
        body.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
        results.push({
          before: photo.previousElementSibling.textContent,
          after: photo.nextElementSibling.textContent,
          bold: body.querySelector("b").textContent,
          italic: body.querySelector("i").textContent,
        });
      }
    }
    body.replaceChildren(...original);
    body.dispatchEvent(new Event("input", { bubbles: true }));
    return results;
  });
  for (const [i, result] of lineDrops.entries()) {
    assert.equal(result.before, i % 2 ? "첫 줄둘째 줄" : "첫 줄");
    assert.equal(result.after, i % 2 ? "셋째 줄" : "둘째 줄셋째 줄");
    assert.equal(result.bold, "첫 줄");
    assert.equal(result.italic, "둘째 줄");
  }
  const blurPixels = await page.evaluate(async () => {
    const { renderMosaics } = await import("/assets/image-editor.js");
    const source = document.createElement("canvas");
    source.width = 96;
    source.height = 96;
    const s = source.getContext("2d");
    for (let y = 0; y < 96; y += 3)
      for (let x = 0; x < 96; x += 3) {
        s.fillStyle = ((x + y) / 3) % 2 ? "#fff" : "#000";
        s.fillRect(x, y, 3, 3);
      }
    const masks = [{ type: "brush", diameter: 40, points: [{ x: 48, y: 48 }] }];
    const render = (opacity, list = masks) => {
      const c = document.createElement("canvas");
      c.width = 96;
      c.height = 96;
      const g = c.getContext("2d");
      g.drawImage(source, 0, 0);
      renderMosaics(g, source, list, 1, 0, 0, opacity);
      return {
        center: g.getImageData(48, 48, 1, 1).data[0],
        outside: g.getImageData(8, 8, 1, 1).data[0],
      };
    };
    return {
      zero: render(0),
      full: render(1),
      half: render(0.5),
      overlap: render(0.5, [...masks, ...masks]),
    };
  });
  assert.equal(blurPixels.zero.center, 0);
  assert.ok(blurPixels.full.center > 20 && blurPixels.full.center < 235);
  assert.ok(
    Math.abs(blurPixels.half.center - blurPixels.full.center * 0.5) <= 2,
  );
  assert.equal(blurPixels.full.outside, blurPixels.zero.outside);
  assert.deepEqual(blurPixels.half, blurPixels.overlap);
  await page.locator("[data-body] figure img").scrollIntoViewIfNeeded();
  const dragImage = await page.locator("[data-body] figure img").boundingBox();
  await page.mouse.move(dragImage.x + 50, dragImage.y + 50);
  await page.mouse.down();
  await page.mouse.move(dragImage.x + 100, dragImage.y + 120, { steps: 12 });
  assert.equal(await page.locator(".photo-drag-ghost").count(), 1);
  await page.mouse.up();
  assert.equal(await page.locator(".photo-drag-ghost").count(), 0);
  assert.equal(await page.locator(".drop-guide").count(), 0);
  const eraseMove = await page.evaluate(async () => {
    const { renderMosaics, moveMask, maskContains } =
      await import("/assets/image-editor.js");
    const source = document.createElement("canvas");
    source.width = 96;
    source.height = 96;
    const s = source.getContext("2d");
    for (let y = 0; y < 96; y += 3)
      for (let x = 0; x < 96; x += 3) {
        s.fillStyle = ((x + y) / 3) % 2 ? "#fff" : "#000";
        s.fillRect(x, y, 3, 3);
      }
    const mask = {
      type: "brush",
      diameter: 40,
      points: [{ x: 36, y: 36 }],
      erasures: [{ type: "brush", diameter: 10, points: [{ x: 36, y: 36 }] }],
    };
    const render = (m) => {
      const c = document.createElement("canvas");
      c.width = 96;
      c.height = 96;
      const g = c.getContext("2d");
      g.drawImage(source, 0, 0);
      renderMosaics(g, source, [m]);
      return g;
    };
    const g = render(mask),
      moved = moveMask(mask, 30, 30, 96, 96),
      h = render(moved);
    return {
      hole: g.getImageData(36, 36, 1, 1).data[0],
      blur: g.getImageData(48, 36, 1, 1).data[0],
      old: h.getImageData(36, 36, 1, 1).data[0],
      newBlur: h.getImageData(78, 66, 1, 1).data[0],
      newHole: h.getImageData(66, 66, 1, 1).data[0],
      hitHole: maskContains(moved, { x: 66, y: 66 }),
      hitBlur: maskContains(moved, { x: 78, y: 66 }),
      holeX: moved.erasures[0].points[0].x,
    };
  });
  assert.equal(eraseMove.hole, 0);
  assert.equal(eraseMove.old, 0);
  assert.equal(eraseMove.newHole, 0);
  assert.ok(eraseMove.blur > 20 && eraseMove.newBlur > 20);
  assert.equal(eraseMove.hitHole, false);
  assert.equal(eraseMove.hitBlur, true);
  assert.equal(eraseMove.holeX, 66);
  const edge = await page.evaluate(async () => {
    const { renderMosaics } = await import("/assets/image-editor.js");
    const img = document.createElement("canvas");
    img.width = 96;
    img.height = 96;
    const g = img.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, 96, 96);
    g.fillStyle = "#fff";
    g.fillRect(45, 0, 3, 96);
    const render = (hardness) => {
      const c = document.createElement("canvas");
      c.width = 96;
      c.height = 96;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      renderMosaics(
        x,
        img,
        [{ type: "brush", diameter: 30, points: [{ x: 33, y: 48 }] }],
        1,
        0,
        0,
        1,
        hardness,
      );
      return x.getImageData(48, 48, 1, 1).data[0];
    };
    return { hard: render(100), soft: render(15) };
  });
  assert.ok(edge.soft > edge.hard);

  for (const [attr, label] of [
    ["data-images", "사진 넣기"],
    ["data-flow-open", "요약 보기"],
    ["data-copy-body", "본문 복사"],
    ["data-print", "인쇄하기"],
  ]) {
    assert.equal(
      await page.locator(`[${attr}]`).getAttribute("aria-label"),
      label,
    );
    assert.equal(await page.locator(`[${attr}] svg`).count(), 1);
  }
  const beforeReplace = await page
    .locator("[data-body]")
    .evaluate((n) => [...n.children].map((x) => x.tagName));
  await page.locator("[data-body] figure img").click();
  await page.locator('[data-photo-action="replace"]').click();
  assert.ok(await page.locator("[data-replace-menu]").isVisible());
  const anchor = await page
    .locator('[data-photo-action="replace"]')
    .boundingBox();
  const menuBox = await page.locator("[data-replace-menu]").boundingBox();
  assert.ok(Math.abs(anchor.x - menuBox.x) < 1);
  assert.ok(menuBox.y >= anchor.y + anchor.height);
  for (const [action, label] of [
    ["edit", "편집"],
    ["replace", "교체하기"],
    ["caption", "설명 넣기"],
    ["delete", "삭제하기"],
  ]) {
    const button = page.locator(`[data-photo-action="${action}"]`);
    assert.equal(await button.getAttribute("aria-label"), label);
    assert.equal(await button.getAttribute("data-tip"), label);
    assert.equal(await button.locator("svg").count(), 1);
  }
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.locator('[data-photo-action="replace-upload"]').click(),
  ]);
  await chooser.setFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: bytes,
  });
  await page.locator("[data-canvas]").waitFor();
  assert.equal(await page.locator("[data-source]").inputValue(), photo.source);
  await page.locator("[data-image-apply]").click();
  await page.locator("[data-body] figure").waitFor();
  assert.deepEqual(
    await page
      .locator("[data-body]")
      .evaluate((n) => [...n.children].map((x) => x.tagName)),
    beforeReplace,
  );
  assert.equal(await page.locator("[data-body] figure").count(), 1);
  const replaced = await page.evaluate(
    () => document.querySelector("article-workspace").value,
  );
  assert.notEqual(replaced.photos.at(-1).id, photo.id);
  assert.equal(replaced.photos.at(-1).original, testImage);
  assert.equal(replaced.photos.at(-1).masks.length, 0);
  await page.locator("[data-body] figure img").click();
  await page.locator('[data-photo-action="replace"]').click();
  await page.locator('[data-photo-action="replace-search"]').click();
  await page.locator("[data-keywords] button").first().waitFor();
  await page.locator("[data-keywords] button").first().click();
  await page.locator('[data-photo="test1"][data-action="insert"]').waitFor();
  await page.locator('[data-photo="test1"][data-action="insert"]').click();
  await page.locator("[data-body] figure").waitFor();
  assert.deepEqual(
    await page
      .locator("[data-body]")
      .evaluate((n) => [...n.children].map((x) => x.tagName)),
    beforeReplace,
  );
  assert.equal(await page.locator("[data-body] figure").count(), 1);

  await page.locator("[data-flow-open]").click();
  await page.locator(".flow-panel li").first().waitFor();
  assert.equal(await page.locator(".flow-panel li").count(), 3);
  assert.match(
    await page.locator(".flow-panel li").first().innerText(),
    /^새 도심 공원/,
  );
  await page.screenshot({
    path: new URL("05-flow.png", out).pathname,
    fullPage: false,
  });
  const box = await page.locator(".summary-modal").boundingBox();
  assert.equal(box.width, 1040);
  assert.equal(box.height, 394);
  assert.equal(
    await page
      .locator(".modal-stage .backdrop")
      .evaluate((n) => getComputedStyle(n).backgroundColor),
    "rgba(0, 0, 0, 0.45)",
  );
  await page
    .locator(".modal-stage .backdrop")
    .click({ position: { x: 5, y: 5 } });
  assert.equal(await page.locator("[role=dialog]").count(), 0);
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  await page.locator("[data-flow-open]").click();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileModal = await page.locator(".summary-modal").boundingBox();
  assert.ok(mobileModal.x >= 16 && mobileModal.width <= 358);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("[role=dialog]").count(), 0);
  await page.setViewportSize({ width: 1280, height: 900 });
  // Autosave must create the disk file before the manual save action.
  await page.waitForFunction(
    () =>
      document
        .querySelector("article-workspace")
        .shadowRoot.querySelector("[data-save]").textContent === "자동 저장됨",
  );
  const automaticId = await page.evaluate(
    () => document.querySelector("article-workspace").value.articleId,
  );
  const automaticPath = new URL(
    "../../.article-workspace/articles/" + automaticId + ".json",
    import.meta.url,
  ).pathname;
  assert.ok(fs.existsSync(automaticPath));
  assert.equal(JSON.parse(fs.readFileSync(automaticPath)).photos.length, 3);
  const statusBox = await page.locator(".footer-status").boundingBox();
  assert.equal(statusBox.y + statusBox.height, 900);
  await page.locator("[data-export]").click();
  await page
    .locator("[data-notice]")
    .filter({ hasText: "원고를 저장했어요." })
    .waitFor();
  const id = await page.evaluate(
    () => document.querySelector("article-workspace").value.articleId,
  );
  assert.equal(id, automaticId);
  savedFile = new URL(
    "../../.article-workspace/articles/" + id + ".json",
    import.meta.url,
  );
  assert.ok(fs.existsSync(savedFile));
  assert.equal(JSON.parse(fs.readFileSync(savedFile)).photos.length, 3);
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelector("article-workspace")?.value.photos.length === 3,
  );
  assert.equal(
    await page
      .locator('[data-confirm="subheadline"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.deepEqual(errors, []);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => (window.copiedBody = text) },
    }),
  );
  await page.locator("[data-body]").fill("가나다 👩‍💻 é");
  assert.equal(await page.locator("[data-count]").innerText(), "본문 7자");
  await page.locator("[data-copy-body]").click();
  assert.equal(await page.evaluate(() => window.copiedBody), "가나다 👩‍💻 é");
  await page.waitForFunction(
    () =>
      document
        .querySelector("article-workspace")
        .shadowRoot.querySelector("[data-save]").textContent === "자동 저장됨",
  );
  assert.match(JSON.parse(fs.readFileSync(savedFile)).bodyHtml, /가나다/);
  await page.screenshot({
    path: new URL("09-autosave-count.png", out).pathname,
    fullPage: false,
  });
  await page.addInitScript(() => {
    window.print = () => {
      window.__printed = true;
    };
  });
  await page.locator("[data-print]").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("article-workspace")
        .shadowRoot.querySelector("iframe")?.contentWindow.__printed === true,
  );
  assert.equal(await page.frameLocator("iframe").locator("button").count(), 0);
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        sizes,
        checks: [
          "confirmation persists and prevents repeated generation",
          "explicit regeneration",
          "outside click dismisses suggestions",
          "Unsplash keyword search returns three photos",
          "selection to editor",
          "corner resize keeps ratio",
          "mosaic brush strokes and undo",
          "automatic local save and updates",
          "fixed status bar and grapheme character count",
          "local hard-disk save",
          "three short summary lines",
          "preview and mobile widths",
          "reload",
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill();
  if (savedFile && fs.existsSync(savedFile)) fs.unlinkSync(savedFile);
}
