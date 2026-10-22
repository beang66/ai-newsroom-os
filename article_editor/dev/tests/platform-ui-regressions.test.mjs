import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { instagramCaptionText, parseInstagramCaption, parseThreadsText, threadsText } from "../../../src/lib/platformTextEditor.js";
import { plainContent } from "../../../src/lib/studioArticle.js";

test("Instagram 통합 입력은 마무리가 없는 두 단락 원고의 본문 구조를 보존한다", () => {
  const previous = { opening: "도입", paragraphs: ["본문"], closing: "", hashtags: [] };
  const parsed = parseInstagramCaption("도입 수정\n\n본문", previous);
  assert.deepEqual(parsed, { opening: "도입 수정", paragraphs: ["본문"], closing: "", hashtags: [] });
  assert.equal(instagramCaptionText(parsed), "도입 수정\n\n본문");
});

test("Instagram과 Threads 통합 입력은 기존 구조와 해시태그를 왕복 변환한다", () => {
  const instagram = { opening: "도입", paragraphs: ["본문 1", "본문 2"], closing: "마무리", hashtags: ["#뉴스", "#AI"] };
  assert.deepEqual(parseInstagramCaption(instagramCaptionText(instagram), instagram), instagram);
  const threads = { opening: "첫 문장", paragraphs: ["둘째 문장", "셋째 문장"] };
  assert.deepEqual(parseThreadsText(threadsText(threads)), threads);
});

test("생성 시작 실패 메시지는 진행 목록이 비어도 경고 UI에 남는다", async () => {
  const source = await readFile(new URL("../../../src/components/PlatformStudio.jsx", import.meta.url), "utf8");
  assert.match(source, /catch\(error\)[\s\S]{0,180}setGenerationError\(error\.message\|\|'생성 작업을 시작하지 못했습니다\.'/);
  assert.match(source, /role="alert" data-testid="generation-error"[\s\S]{0,120}\{generationError\}/);
});

test("본문 사진의 조작 안내·버튼·캡션 글자는 기사 문장(팩트체크·변환 원문)에 섞이지 않는다", () => {
  const figure = '<figure class="article-photo-container" data-photo-id="p1" contenteditable="false"><div><span>⠿ 드래그하여 원하는 위치로 이동</span></div>'
    + '<img src="x.jpg"><div class="photo-action-overlay"><button><span>↻</span></button><button><span>✎</span></button><button><span>✕</span></button></div>'
    + '<figcaption>(출처: 동아일보 DB)</figcaption></figure><p><br></p>';
  assert.equal(plainContent(`<p>첫 문장입니다.</p>${figure}<p>고친 문장을 하나 더 씁니다.</p>`), "첫 문장입니다.\n\n고친 문장을 하나 더 씁니다.");
});


test("SNS 작성창 채우기: 꺼진 버튼은 막는 이유 목록으로 정하고, 마우스를 올리면 그 이유를 보여 준다", async () => {
  const source = await readFile(new URL("../../../src/components/PlatformDelivery.jsx", import.meta.url), "utf8");
  assert.match(source, /disabled=\{blockers\.length>0\} data-testid="sns-prepare"/);
  assert.match(source, /<BlockedReasons id=\{`\$\{platform\}-prepare-blockers`\} reasons=\{blockers\}>\s*<button[^\n]*data-testid="sns-prepare"/);
  assert.match(source, /onMouseEnter=\{show\}[\s\S]{0,600}createPortal\(\s*<div role="tooltip"/);
});
