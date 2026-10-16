import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMark, addSpeaker, applySpeakerEdits, applyTextEdits, removeMarks, remapMarks, resetSpeakers, segmentsOf, setBoxText, assignByName, assignDialogues, emptyEdits, groupByOriginalSpeaker, isEdited, mergeSpeaker, renameSpeaker, renameSpeakerSmart, resolveKey, sanitizeEdits, speakerList, speakerRoster
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

test("이름 바꾸기: 다른 화자와 같은 이름을 쓰면 같은 화자로 합쳐지고, 새 이름이면 이름만 바뀐다", () => {
  const speakers = speakerList(dialogues, emptyEdits());
  assert.deepEqual(names(renameSpeakerSmart(emptyEdits(), speakers, "1", "김 기자")), ["김 기자", "화자 2", "김 기자", "화자 3"]);
  const merged = renameSpeakerSmart(emptyEdits(), speakers, "1", " 화자 2 ");          // 앞뒤 공백·대소문자는 무시
  assert.deepEqual(merged.merge, { 1: "2" });
  assert.deepEqual(names(merged), ["화자 2", "화자 2", "화자 2", "화자 3"]);
  const renamed = renameSpeakerSmart(emptyEdits(), speakers, "1", "김 기자");
  assert.deepEqual(names(renameSpeakerSmart(renamed, speakerList(dialogues, renamed), "1", "")), ["화자 1", "화자 2", "화자 1", "화자 3"]);
});

test("이름으로 지정: 발언을 같은 이름의 화자로 옮기고, 없으면 새 화자를 한 번만 만든다", () => {
  let edits = assignByName(emptyEdits(), speakerList(dialogues, emptyEdits()), ["d2", "d4"], "취재원");
  assert.deepEqual(names(edits), ["화자 1", "취재원", "화자 1", "취재원"]);
  edits = assignByName(edits, speakerList(dialogues, edits), ["d1"], "취재원");         // 같은 이름 → 새 화자를 또 만들지 않는다
  assert.deepEqual(Object.keys(edits.names), ["custom-1"]);
  assert.deepEqual(names(edits), ["취재원", "취재원", "화자 1", "취재원"]);
  edits = assignByName(edits, speakerList(dialogues, edits), ["d2"], "화자 1");        // 원래 화자의 이름 → 그 화자로
  assert.equal(applySpeakerEdits(dialogues, edits)[1].speaker, "1");
  assert.equal(assignByName(edits, speakerList(dialogues, edits), ["d3"], "  "), edits, "빈 이름은 아무것도 하지 않는다");
  assert.equal(assignByName(edits, speakerList(dialogues, edits), [], "김"), edits, "고른 발언이 없으면 아무것도 하지 않는다");
});

test("화자 고르기 목록: 이름을 고치거나 합쳐도 CLOVA 가 붙인 원래 이름이 남는다", () => {
  assert.deepEqual(speakerRoster(dialogues, emptyEdits()).map((s) => [s.name, s.originals]), [["화자 1", []], ["화자 2", []], ["화자 3", []]]);
  let edits = renameSpeaker(emptyEdits(), "1", "김 기자");
  edits = mergeSpeaker(edits, "3", "1");
  const roster = speakerRoster(dialogues, edits);
  assert.deepEqual(roster.map((s) => [s.key, s.name, s.originals]), [["1", "김 기자", ["화자 1", "화자 3"]], ["2", "화자 2", []]]);
  const added = addSpeaker(edits, "취재원");
  const assigned = assignDialogues(added.edits, ["d2"], added.key);
  assert.deepEqual(speakerRoster(dialogues, assigned).map((s) => [s.name, s.originals]), [["김 기자", ["화자 1", "화자 3"]], ["취재원", ["화자 2"]]]);
});

test("박스: CLOVA 가 나눈 대로 유지되고, 이름을 고치거나 합쳐도 박스는 합쳐지지 않는다", () => {
  const base = [
    { id: "a", speaker: "1", speakerName: "화자 1", text: "하나", timestamp: 0 },
    { id: "b", speaker: "1", speakerName: "화자 1", text: "둘", timestamp: 2 },
    { id: "c", speaker: "2", speakerName: "화자 2", text: "셋", timestamp: 5 },
  ];
  const boxes = (edits) => groupByOriginalSpeaker(applySpeakerEdits(base, edits), base).map((box) => [box.speakerName, box.ids.join(""), box.text]);
  assert.deepEqual(boxes(emptyEdits()), [["화자 1", "ab", "하나 둘"], ["화자 2", "c", "셋"]]);
  const merged = mergeSpeaker(renameSpeaker(emptyEdits(), "1", "김 기자"), "2", "1");        // 같은 사람이 되어도
  assert.deepEqual(boxes(merged), [["김 기자", "ab", "하나 둘"], ["김 기자", "c", "셋"]]);       // 박스는 그대로, 이름만 같다
  assert.deepEqual(boxes(assignDialogues(emptyEdits(), ["a", "b"], "2")).map((box) => box[0]), ["화자 2", "화자 2"]);
  assert.deepEqual(groupByOriginalSpeaker([{ id: "x", speaker: "9", speakerName: "화자 9", text: "  ", timestamp: 0 }], []), [], "빈 발언은 박스를 만들지 않는다");
});

test("형광펜: 글을 조각으로 나누고, 겹치면 남는 부분만 남기며, 같은 색이 맞닿으면 합친다", () => {
  const body = "가나다라마바사";
  let edits = addMark(emptyEdits(), "b1", 1, 3, "yellow", body.length);
  assert.deepEqual(segmentsOf(body, edits.marks.b1).map((p) => [p.text, p.color]), [["가", null], ["나다", "yellow"], ["라마바사", null]]);
  assert.equal(segmentsOf(body, edits.marks.b1).map((p) => p.text).join(""), body, "조각을 이으면 원래 글");
  edits = addMark(edits, "b1", 2, 5, "green", body.length);                       // 노랑 일부를 덮는다
  assert.deepEqual(edits.marks.b1, [{ s: 1, e: 2, c: "yellow" }, { s: 2, e: 5, c: "green" }]);
  edits = addMark(edits, "b1", 5, 7, "green", body.length);                       // 같은 색이 맞닿으면 합친다
  assert.deepEqual(edits.marks.b1, [{ s: 1, e: 2, c: "yellow" }, { s: 2, e: 7, c: "green" }]);
  edits = removeMarks(edits, "b1", 3, 4);                                         // 가운데를 지우면 둘로 나뉜다
  assert.deepEqual(edits.marks.b1, [{ s: 1, e: 2, c: "yellow" }, { s: 2, e: 3, c: "green" }, { s: 4, e: 7, c: "green" }]);
  assert.equal(removeMarks(edits, "b1", 0, 0), edits, "지울 게 없으면 그대로");
  assert.equal(addMark(emptyEdits(), "b1", 3, 3, "yellow", 7).marks, undefined, "빈 구간·글 밖은 무시");
  assert.equal(addMark(emptyEdits(), "b1", 0, 3, "없는색", 7).marks, undefined);
  edits = removeMarks(removeMarks(removeMarks(edits, "b1", 0, 7), "b1", 0, 7), "b1", 0, 7);
  assert.equal(edits.marks, undefined, "다 지우면 기록도 사라진다");
});

test("글 수정: 고친 글이 박스 글을 대신하고, 원래 글과 같아지면 기록이 사라지며, 다른 박스의 형광펜은 건드리지 않는다", () => {
  const boxes = [{ id: "b1", text: "원래 글" }, { id: "b2", text: "둘째" }];
  let edits = addMark(emptyEdits(), "b1", 0, 2, "pink", 4);
  edits = addMark(edits, "b2", 0, 1, "blue", 2);
  edits = setBoxText(edits, "b1", "원래 글에 덧붙임", "원래 글");
  assert.deepEqual(edits.marks, { b1: [{ s: 0, e: 2, c: "pink" }], b2: [{ s: 0, e: 1, c: "blue" }] }, "고치지 않은 부분의 형광펜은 그대로");
  const applied = applyTextEdits(boxes, edits);
  assert.deepEqual(applied.map((b) => [b.text, b.originalText, b.marks.length]), [["원래 글에 덧붙임", "원래 글", 1], ["둘째", "둘째", 1]]);
  edits = setBoxText(edits, "b1", "원래 글", "원래 글");
  assert.equal(edits.texts, undefined, "원래 글로 돌아가면 고친 기록이 없다");
  assert.deepEqual(edits.marks.b1, [{ s: 0, e: 2, c: "pink" }], "되돌려도 형광펜은 그대로 남는다");
  assert.deepEqual(boxes.map((b) => b.text), ["원래 글", "둘째"], "원본 배열은 바뀌지 않는다");
});

test("글을 고쳤을 때 형광펜: 칠한 글 안에서 고친 만큼만 늘거나 줄고, 앞·뒤 글이 바뀌어도 이동하지 않는다", () => {
  const mark = (s, e, c = "yellow") => ({ s, e, c });
  const text = "오늘 날씨가 좋네요";                                   // "날씨가" = [3, 6)
  const marks = [mark(3, 6)];
  assert.deepEqual(remapMarks(text, "오늘 날씨가 좋네요", marks), marks, "같은 글이면 그대로");
  assert.deepEqual(remapMarks(text, "오늘 날가 좋네요", marks), [mark(3, 5)], "칠한 곳 안에서 글자를 지우면 줄어든다");
  assert.deepEqual(remapMarks(text, "오늘 날아침씨가 좋네요", marks), [mark(3, 8)], "칠한 곳 한가운데에 끼워 넣은 글은 함께 칠해진다");
  assert.deepEqual(remapMarks(text, "오늘 기온이 좋네요", marks), [mark(3, 6)], "칠한 말을 통째로 다른 말로 바꾸면 새 말도 칠한다");
  assert.deepEqual(remapMarks(text, "오늘 기온이 매우 좋네요", marks), [mark(3, 9)], "통째로 바꾼 말이 더 길어도 새 말 전체가 칠해진다");
  assert.deepEqual(remapMarks(text, "오늘 좋네요", marks), [], "칠한 글이 모두 지워지면 형광펜도 사라진다");
  assert.deepEqual(remapMarks(text, "오늘 날씨가 좋네요", []), [], "형광펜이 없으면 아무것도 없다");
  // 앞·뒤 글이 바뀌어도 형광펜은 글자 번호 그대로(이동하지 않는다)
  assert.deepEqual(remapMarks(text, "정말 오늘 날씨가 좋네요", marks), [mark(3, 6)], "앞에 글을 넣어도 이동하지 않는다");
  assert.deepEqual(remapMarks(text, "날씨가 좋네요", marks), [mark(3, 6)], "앞의 글을 지워도 이동하지 않는다");
  assert.deepEqual(remapMarks(text, "오늘 날씨가많이 좋네요", marks), [mark(3, 6)], "칠한 곳 끝에 이어 쓴 글은 칠하지 않는다");
  assert.deepEqual(remapMarks(text, "오늘 날씨가 좋네요 정말", marks), [mark(3, 6)], "뒤에 글을 붙여도 그대로");
  // 칠한 글에 걸쳐 고치면 걸친 만큼 줄어든다
  assert.deepEqual(remapMarks(text, "오늘 날좋네요", marks), [mark(3, 4)], "칠한 곳 끝을 넘어 지우면 칠한 부분만 줄어든다");
  assert.deepEqual(remapMarks(text, "오늘 씨가 좋네요", marks), [mark(3, 5)], "칠한 곳 앞부분을 지우면 시작은 그대로 두고 칠한 만큼 줄어든다");
  // 색이 다른 형광펜 둘: 한쪽 안의 수정은 그쪽만 바꾼다
  const two = [mark(0, 2, "pink"), mark(7, 10, "blue")];                 // "오늘", "좋네요"
  assert.deepEqual(remapMarks(text, "오늘 날씨가 좋은네요", two), [mark(0, 2, "pink"), mark(7, 11, "blue")], "'좋네요' 안쪽에 한 글자를 끼우면 그 칠만 한 글자 늘어난다");
  // 늘어난 칠이 옆 칠과 겹치면 뒤쪽 칠이 이긴다
  const near = [mark(0, 3, "pink"), mark(3, 6, "blue")];                  // "가나다", "라마바"
  assert.deepEqual(remapMarks("가나다라마바", "가나가나다라마바", near), [mark(0, 3, "pink"), mark(3, 6, "blue")], "겹치지 않게 정리된다");
  // 긴 글에서 한 곳만 고쳐도 빠르다(앞·뒤가 같은 부분은 걷어 낸다)
  const long = "가나다라 ".repeat(5000);
  const started = Date.now();
  const moved = remapMarks(long, `X${long}`, [mark(10000, 10010)]);
  assert.deepEqual(moved, [mark(10000, 10010)]);
  assert.ok(Date.now() - started < 500, "긴 글에서도 빠르다");
  // 고친 곳이 아주 넓을 때(맞추기 한도 초과)도 오류 없이 처리된다
  const wide = remapMarks("가".repeat(3000) + "끝", "나".repeat(3000) + "끝", [mark(3000, 3001)]);
  assert.deepEqual(wide, [mark(3000, 3001)], "한도를 넘어도 오류 없이, 칠한 곳 밖의 수정은 건드리지 않는다");
});

test("화자만 원래대로: 글 수정과 형광펜은 남는다. 코어에서 받은 글·형광펜은 걸러서 받는다", () => {
  let edits = renameSpeaker(emptyEdits(), "1", "김 기자");
  edits = setBoxText(addMark(edits, "b1", 0, 2, "yellow", 5), "b2", "고침", "원본");
  const reset = resetSpeakers(edits);
  assert.deepEqual(reset.names, {});
  assert.deepEqual(reset.texts, { b2: "고침" });
  assert.deepEqual(reset.marks, { b1: [{ s: 0, e: 2, c: "yellow" }] });
  const clean = sanitizeEdits({ names: { 1: "김" }, texts: { a: "글", b: "  ", c: 5 }, marks: { a: [{ s: 0, e: 2, c: "yellow" }, { s: 2, e: 1, c: "yellow" }, { s: 0, e: 1, c: "없는색" }, null], b: "x" } });
  assert.deepEqual(clean.texts, { a: "글" });
  assert.deepEqual(clean.marks, { a: [{ s: 0, e: 2, c: "yellow" }] });
  assert.equal(sanitizeEdits({ names: { 1: "김" } }).texts, undefined, "쓰이지 않으면 필드가 없다");
});
