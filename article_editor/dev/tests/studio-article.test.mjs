// 에디터 HTML → 일반 텍스트(plainContent): 문단 경계가 사라지지 않아야 팩트체크가 문장을 제대로 나눈다.
import test from "node:test";
import assert from "node:assert/strict";
import { plainContent } from "../../../src/lib/studioArticle.js";
import { splitSentences } from "../../../src/api/editorial.js";

test("첫 줄이 맨 글자이고 다음 줄이 <div> 여도 문장이 붙지 않는다", () => {
  const html = "효과가 컸다는 분석입니다.<div>한국은행이 29일 발표한 지수는 99.1을 기록했습니다.</div>";
  const text = plainContent(html);
  assert.equal(text, "효과가 컸다는 분석입니다.\n한국은행이 29일 발표한 지수는 99.1을 기록했습니다.");
  assert.deepEqual(splitSentences(text).map((s) => s.text),
    ["효과가 컸다는 분석입니다.", "한국은행이 29일 발표한 지수는 99.1을 기록했습니다."]);
});

test("닫는 태그 뒤 블록·<br>·문단은 예전과 같다", () => {
  assert.equal(plainContent("<p>가나다라마</p><p>바사아자차</p>"), "가나다라마\n\n바사아자차");
  assert.equal(plainContent("<div>첫째 줄</div><div>둘째 줄</div>"), "첫째 줄\n둘째 줄");
  assert.equal(plainContent("첫째<br>둘째"), "첫째\n둘째");
  assert.equal(plainContent("<b>굵게</b> 글"), "굵게 글");
});
