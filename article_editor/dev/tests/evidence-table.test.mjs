// 팩트체크 근거 표(src/lib/evidenceTable.js): 코어가 보낸 표 구조에 기사 숫자와 같은 칸 표시를 붙인다.
import test from "node:test";
import assert from "node:assert/strict";
import { markTable, claimNumbers } from "../../../src/lib/evidenceTable.js";

test("기사 숫자와 같은 칸·행을 표시한다", () => {
  const t = markTable({
    caption: ["< 기업심리지수 >"],
    header: ["구분", "8월", "9월"],
    rows: [{ label: "내수기업", cells: ["99.4", "99.1"] }, { label: "수출기업", cells: ["97.3", "△95.7"] }],
  }, "9월 내수기업 지수는 99.1, 수출기업은 95.7이었다.");
  assert.deepEqual(t.rows[0].cells.map((c) => c.hit), [false, true]);
  assert.equal(t.rows[1].cells[1].hit, true); // △ 표기도 같은 값
  assert.equal(t.rows[0].hit, true);
  assert.deepEqual(t.header, ["구분", "8월", "9월"]);
});

test("연도·한 자리 수는 강조하지 않는다", () => {
  assert.deepEqual(claimNumbers("2026년 2분기 3.3% 성장, 1조 2,345억"), [3.3, 2345]);
});
