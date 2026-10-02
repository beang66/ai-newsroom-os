import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { JSDOM } = require(
  process.env.TEST_NODE_MODULES
    ? process.env.TEST_NODE_MODULES + "/jsdom"
    : "jsdom",
);
const dom = new JSDOM("<!doctype html><body></body>", {
  url: "http://127.0.0.1:8765",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const w = dom.window;
w.structuredClone = structuredClone;
w.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
w.CSS = { escape: (s) => s };
w.fetch = async () => {
  throw Error("unexpected network call");
};
let source = fs
  .readFileSync(
    new URL("../frontend/assets/article-workspace.js", import.meta.url),
    "utf8",
  )
  .replace(/^import[\s\S]*?from ["'][^"']+["'];?\r?\n/gm, "")
  .replace(
    /new URL\(["']\.["'],\s*import\.meta\.url\)/,
    "new URL('http://127.0.0.1:8765/assets/')",
  )
  .replace("export class ArticleWorkspace", "class ArticleWorkspace");
w.eval(source);
const el = w.document.createElement("article-workspace");
w.document.body.append(el);
await new Promise((r) => setTimeout(r, 5));
const fixture = {
  title: "직접 쓴 제목",
  subtitle: "직접 쓴 부제",
  bodyHtml:
    "<p>" +
    "시민을 위한 새로운 공원이 문을 열었다. ".repeat(10) +
    "</p><p>다음 문단입니다.</p>",
  photos: [],
};
el.value = fixture;
assert.equal(el.shadowRoot.querySelectorAll("[data-preview]").length, 1);
assert.equal(el.shadowRoot.querySelectorAll("[data-title]").length, 1);
const calls = [];
// 코어 연결 지점(계약)을 대체한다 — UI는 core-api.js 의 메서드만 호출한다.
el.core = {
  assist: async (payload) => {
    calls.push(payload);
    return payload.requested === "headline"
      ? {
          headline_candidates: ["추천 제목 하나", "추천 제목 둘", "추천 제목 셋"],
        }
      : {
          subtitle_candidates: [
            "첫 줄\n둘째 줄",
            "다른 첫 줄\n다른 둘째 줄",
            "마지막 첫 줄\n마지막 둘째 줄",
          ],
        };
  },
  saveArticle: async () => ({ articleId: "0".repeat(32) }),
  searchPhotos: async () => ({ photos: [], totalPages: 1 }),
  photoBytes: async () => new Blob([]),
  trackPhoto: async () => ({ tracked: true }),
  status: async () => ({ ready: false }),
};
await el.suggest("headline", true);
await el.suggest("subheadline", true);
assert.equal(el.value.title, fixture.title);
assert.equal(el.value.subtitle, fixture.subtitle);
assert.equal(calls.length, 2);
await el.suggest("headline", true);
assert.equal(calls.length, 2, "same text uses cached result");
el.shadowRoot.querySelector('[data-suggestions="headline"] button').click();
assert.equal(el.value.title, "추천 제목 하나");
el.shadowRoot.querySelector('[data-suggestions="subheadline"] button').click();
assert.match(el.value.subtitle, /첫 줄<br>둘째 줄/);
const confirm = el.shadowRoot.querySelector('[data-confirm="subheadline"]');
confirm.click();
assert.equal(el.state.confirmed.subheadline, true);
const count = calls.length;
await el.suggest("subheadline", true);
assert.equal(calls.length, count, "confirmed subtitle does not generate");
el.openSuggestions("subheadline");
assert.ok(
  el.shadowRoot.querySelector('[data-suggestions="subheadline"]').hidden,
);
assert.equal(
  el.shadowRoot
    .querySelector("[data-subtitle]")
    .getAttribute("contenteditable"),
  "false",
);
confirm.click();
assert.equal(
  el.shadowRoot
    .querySelector("[data-subtitle]")
    .getAttribute("contenteditable"),
  "true",
);
el.shadowRoot.querySelector('[data-regenerate="subheadline"]').click();
await new Promise((r) => setTimeout(r, 5));
assert.equal(el.state.confirmed.subheadline, false);
assert.equal(calls.length, count + 1);
el.closeSuggestions();
assert.ok(
  el.shadowRoot.querySelector('[data-suggestions="subheadline"]').hidden,
);
el.value = { title: "", subtitle: "", bodyHtml: "", photos: [] };
await el.suggest("headline", true);
assert.match(
  el.shadowRoot.querySelector('[data-suggestions="headline"]').textContent,
  /기사 본문을 작성하면 기사 제목을 추천해드립니다/,
);
await el.suggest("subheadline", true);
assert.match(
  el.shadowRoot.querySelector('[data-suggestions="subheadline"]').textContent,
  /기사 본문을 작성하면 부제목을 추천해드립니다/,
);
el.value = fixture;
const original = el.value.title;
el.mode = "preview";
el.state.bodyHtml = "<p>첫 문단 <s>제외할 문구</s> 끝.</p><p>둘째 문단.</p>";
el.render();
const f = el.shadowRoot.querySelector("iframe");
assert.ok(f.srcdoc.includes("donga-preview.css"));
assert.ok(f.srcdoc.includes("donga-fonts.css"));
assert.ok(!f.srcdoc.includes("제외할 문구"));
assert.ok(f.srcdoc.includes("<p>둘째 문단.</p>"));
assert.equal(el.state.title, original);
el.mode = "edit";
el.render();
assert.ok(el.shadowRoot.querySelector("[data-title]"));
assert.equal(el.state.title, original);
clearTimeout(el.timer);
clearTimeout(el.saveTimer);
clearTimeout(el.closeSuggestionTimer);
el.remove();
dom.window.close();
console.log(
  "PASS component: dropdowns, cache, manual title retention, stale response rejection, preview paragraphs, strike deletion, edit return",
);
