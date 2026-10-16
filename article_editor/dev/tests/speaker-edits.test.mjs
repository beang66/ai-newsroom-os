import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addSpeaker, applySpeakerEdits, assignDialogues, emptyEdits, isEdited, mergeSpeaker, renameSpeaker, resolveKey, sanitizeEdits, speakerList
} from "../../../src/lib/speakerEdits.js";

// 1명이 말했는데 CLOVA 가 화자 1·2·3 으로 나눈 녹취
const dialogues = [
  { id: "d1", speaker: "1", speakerName: "화자 1", text: "안녕하세요", timestamp: 0 },
  { id: "d2", speaker: "2", speakerName: "화자 2", text: "오늘은", timestamp: 4 },
  { id: "d3", speaker: "1", speakerName: "화자 1", text: "날씨가", timestamp: 8 },
  { id: "d4", speaker: "3", speakerName: "화자 3", text: "좋네요", timestamp: 12 }
];
const names = (edits) => applySpeakerEdits(dialogues, edits).map((item) => item.speakerName);

test("수정이 없으면 발언을 그대로 돌려준다", () => {
  const applied = applySpeakerEdits(dialogues, emptyEdits());
  assert.deepEqual(applied, dialogues);
  assert.ok(applied.every((item, index) => item === dialogues[index]), "바뀐 것이 없으면 같은 객체를 쓴다");
  assert.equal(isEdited(emptyEdits()), false);
});

test("이름 바꾸기는 그 화자의 모든 발언에 적용되고 빈 이름은 원래 이름으로 되돌린다", () => {
  const renamed = renameSpeaker(emptyEdits(), "1", "  김 기자  ");
  assert.deepEqual(names(renamed), ["김 기자", "화자 2", "김 기자", "화자 3"]);
  assert.deepEqual(names(renameSpeaker(renamed, "1", "   ")), ["화자 1", "화자 2", "화자 1", "화자 3"]);
  assert.equal(renameSpeaker(emptyEdits(), "1", "가".repeat(100)).names["1"].length, 40);
});

test("합치기: 화자 2·3 을 1 로 합치면 한 화자가 되고, 합친 화자의 이름 바꾸기가 모두에 적용된다", () => {
  let edits = mergeSpeaker(emptyEdits(), "2", "1");
  edits = mergeSpeaker(edits, "3", "1");
  assert.deepEqual(names(edits), ["화자 1", "화자 1", "화자 1", "화자 1"]);
  assert.deepEqual(speakerList(dialogues, edits), [{ key: "1", name: "화자 1", count: 4 }]);
  assert.deepEqual(names(renameSpeaker(edits, "1", "박 교수")), ["박 교수", "박 교수", "박 교수", "박 교수"]);
});

test("합치기 사슬과 순환: 3→2→1 은 1 로 풀리고, 서로 가리키게 하는 합치기는 무시한다", () => {
  const chain = mergeSpeaker(mergeSpeaker(emptyEdits(), "3", "2"), "2", "1");
  assert.equal(resolveKey("3", chain.merge), "1");
  const loop = mergeSpeaker(mergeSpeaker(emptyEdits(), "2", "1"), "1", "2");
  assert.deepEqual(loop.merge, { 2: "1" });                                   // 1→2 는 2→1 과 순환이라 만들지 않는다
  assert.equal(mergeSpeaker(emptyEdits(), "1", "1").merge["1"], undefined);   // 자기 자신
  assert.deepEqual(names(loop), ["화자 1", "화자 1", "화자 1", "화자 3"]);
});

test("구간 지정: 고른 발언만 다른 화자가 된다. 새 화자도 만들 수 있다", () => {
  const added = addSpeaker(emptyEdits(), "취재원");
  assert.equal(added.key, "custom-1");
  const edits = assignDialogues(added.edits, ["d2", "d4"], added.key);
  assert.deepEqual(names(edits), ["화자 1", "취재원", "화자 1", "취재원"]);
  assert.deepEqual(speakerList(dialogues, edits).map((s) => [s.name, s.count]), [["화자 1", 2], ["취재원", 2]]);
  assert.equal(addSpeaker(edits, "").edits.names["custom-2"], "새 화자");     // 번호는 이어서 붙고 빈 이름은 기본 이름
});

test("구간 지정이 합치기보다 먼저 적용되고, 발언이 없는 새 화자도 목록에 나온다", () => {
  const added = addSpeaker(emptyEdits(), "빈 화자");
  assert.deepEqual(speakerList(dialogues, added.edits).map((s) => [s.name, s.count]), [["화자 1", 2], ["화자 2", 1], ["화자 3", 1], ["빈 화자", 0]]);
  // d1 을 화자 3 으로 지정한 뒤, 3 을 2 로 합치면 d1 도 화자 2 가 된다
  const edits = mergeSpeaker(assignDialogues(emptyEdits(), ["d1"], "3"), "3", "2");
  assert.deepEqual(names(edits), ["화자 2", "화자 2", "화자 1", "화자 2"]);
});

test("원본 발언은 바뀌지 않는다", () => {
  const before = JSON.stringify(dialogues);
  applySpeakerEdits(dialogues, mergeSpeaker(renameSpeaker(emptyEdits(), "1", "A"), "2", "1"));
  assert.equal(JSON.stringify(dialogues), before);
});

test("코어에서 받은 값이 이상해도 안전한 수정 객체가 된다", () => {
  assert.deepEqual(sanitizeEdits(null), emptyEdits());
  assert.deepEqual(sanitizeEdits({ names: [1], merge: "x", assign: { d1: 5, d2: "1" } }), { names: {}, merge: {}, assign: { d2: "1" } });
  assert.deepEqual(sanitizeEdits({ names: { 1: "김 기자" } }).names, { 1: "김 기자" });
});
