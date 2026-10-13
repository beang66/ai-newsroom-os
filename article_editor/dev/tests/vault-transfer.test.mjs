// 이전 코드: 형식·글자 집합·무작위성, 입력 정규화.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTransferCode, normalizeTransferCode } from "../../../src/lib/vaultTransfer.js";

test("코드는 5자 4묶음, 헷갈리는 글자 없음, 코어의 12자 이상 요건을 만족한다", () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateTransferCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/);
    assert.ok(code.length >= 12);
  }
});

test("코드는 매번 다르다(충돌 없음)", () => {
  const seen = new Set(Array.from({ length: 2000 }, () => generateTransferCode()));
  assert.equal(seen.size, 2000);
});

test("32자 알파벳은 편향 없이 쓰인다(바이트 & 31)", () => {
  const counts = new Map();
  for (let n = 0; n < 400; n += 1) {
    for (const ch of generateTransferCode().replaceAll("-", "")) counts.set(ch, (counts.get(ch) || 0) + 1);
  }
  assert.equal(counts.size, 32, "알파벳 32자가 모두 나온다");
  assert.ok(Math.max(...counts.values()) < 2.5 * Math.min(...counts.values()), "한쪽으로 쏠리지 않는다");
});

test("입력은 소문자·공백·하이픈 없이도 같은 코드로 맞추고, 형식이 틀리면 null", () => {
  assert.equal(normalizeTransferCode(" abcde-fghjk lmnpq rstuv "), "ABCDE-FGHJK-LMNPQ-RSTUV");
  assert.equal(normalizeTransferCode("ABCDEFGHJKLMNPQRSTUV"), "ABCDE-FGHJK-LMNPQ-RSTUV");
  assert.equal(normalizeTransferCode("ABCDE-FGHJK"), null, "짧음");
  assert.equal(normalizeTransferCode("ABCDE-FGHJK-LMNPQ-RSTU0"), null, "알파벳 밖의 글자(0)");
  assert.equal(normalizeTransferCode(""), null);
});

test("생성한 코드는 정규화해도 그대로다", () => {
  const code = generateTransferCode();
  assert.equal(normalizeTransferCode(code), code);
});
