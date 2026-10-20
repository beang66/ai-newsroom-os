import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { instagramCaptionText, parseInstagramCaption, parseThreadsText, threadsText } from "../../../src/lib/platformTextEditor.js";

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
