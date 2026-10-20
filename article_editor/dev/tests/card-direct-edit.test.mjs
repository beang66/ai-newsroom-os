import test from "node:test";
import assert from "node:assert/strict";
import { CardModel, CardTemplate } from "../../../src/lib/cardRuntime.js";

const card = { card_id: "c1", role: "closing", content_version: 2, content: { keyword: "", headline: "제목", answer: "", detail: "상세", farewell: "" } };

test("편집용 markup 은 비어 있는 키워드·끝인사도 다시 입력할 수 있게 그리고, JPG 용 markup 은 그리지 않는다", () => {
  const editable = CardTemplate.markup(card, true), output = CardTemplate.markup(card, false);
  for (const field of ["keyword", "headline", "answer", "detail", "farewell"]) assert.match(editable, new RegExp(`data-field="${field}"[^>]*contenteditable="true"`));
  assert.doesNotMatch(output, /contenteditable|text-move-handle/);
  assert.doesNotMatch(output, /data-field="keyword"|data-field="farewell"/);
});

test("글 위치는 x·y 가 모두 숫자인 쌍만 남기고 카드 좌표(1080×1350)로 제한한다", () => {
  const positions = CardModel.positions({ headline: { x: 30 }, detail: { x: 2000, y: -5000 }, answer: { x: 4, y: 8 } });
  assert.equal(positions.headline, undefined);
  assert.deepEqual(positions.detail, { x: 1080, y: -1350 });
  assert.deepEqual(positions.answer, { x: 4, y: 8 });
  assert.match(CardTemplate.markup({ ...card, text_positions: { headline: { x: 30, y: 0 } } }, false), /data-field="headline" style="transform:translate\(30px,0px\)"/);
});
