// 팩트체크 결과를 본문에 표시한다 — main 의 HighlightedBody 와 같은 규칙, 내 HTML 에디터용.
//
// main 은 투명 textarea 뒤에 같은 글자를 깔고 구간에 색을 칠한다. 내 에디터는 contentEditable(HTML)이라 그 방법을 쓸 수 없고,
// 본문에 <span>을 끼워 넣으면 입력 중 커서가 튀고 표시용 태그가 저장되는 기사 본문에 섞인다.
// 그래서 브라우저의 CSS Custom Highlight 를 쓴다: 본문 DOM 은 그대로 두고 글자 구간(Range)에만 색을 입힌다.
//  - 코어가 짚은 위치(틀린 값 등, spans)만 칠하고, 위치가 없으면 문장 전체를 칠한다
//  - 판정별 색: 불일치(빨강) · 근거 부족(노랑) · 검토 필요(보라)
//  - 서랍의 '팩트 일치' 카드에 마우스를 올리면 그 문장을 초록으로(날짜·기관·주체 후보는 노랑)
//  - 순서형 검사로 보고 있는 문장은 진한 밑줄
import "./factHighlights.css";
import { supportedClaimRanges } from "../api/claim-details.js";

const NAMES = ["fc-conflict", "fc-gap", "fc-review", "fc-focus", "fc-detail", "fc-active"];
const VERDICT_NAME = { CONFLICT: "fc-conflict", EVIDENCE_GAP: "fc-gap", REVIEW: "fc-review", EXTERNAL_REQUIRED: "fc-review" };

export const supportsHighlights = () =>
  typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

/** 본문의 모든 글자 노드를 이어 붙인 문자열과, 글자 위치 → 노드 매핑 */
function textMap(root) {
  const nodes = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node, start: text.length });
    text += node.nodeValue.replace(/ /g, " "); // 길이를 그대로 두고 NBSP 만 공백으로
  }
  return { nodes, text };
}

function toRange(map, start, end) {
  if (!(end > start)) return null;
  // 시작은 [노드 시작, 노드 끝) 안, 끝은 (노드 시작, 노드 끝] 안의 노드를 고른다
  const pointAt = (position, isEnd) => {
    for (const { node, start: nodeStart } of map.nodes) {
      const nodeEnd = nodeStart + node.nodeValue.length;
      if (isEnd ? position > nodeStart && position <= nodeEnd : position >= nodeStart && position < nodeEnd) return [node, position - nodeStart];
    }
    return null;
  };
  const from = pointAt(start, false);
  const to = pointAt(end, true);
  if (!from || !to) return null;
  const range = document.createRange();
  try {
    range.setStart(from[0], from[1]);
    range.setEnd(to[0], to[1]);
  } catch {
    return null;
  }
  return range;
}

/**
 * 결과 → 칠할 구간. 본문에서 문장을 찾지 못하면(고치는 중이라 달라졌으면) 그 결과는 칠하지 않는다.
 * results: useFactCheck 의 결과 목록, focusId: 마우스를 올린 '팩트 일치' 카드, activeId: 순서형 검사 중인 문장
 */
export function locate(root, results, { focusId = null, activeId = null } = {}) {
  const map = textMap(root);
  const located = [];
  let cursor = 0;
  [...results].sort((a, b) => a.start - b.start).forEach((item) => {
    const supportedFocus = item.verdict === "SUPPORTED" && item.id === focusId;
    if (!supportedFocus && !VERDICT_NAME[item.verdict]) return;
    if (!item.claimText) return;
    let at = map.text.indexOf(item.claimText, cursor);
    if (at < 0) at = map.text.indexOf(item.claimText); // 같은 문장이 앞에 또 있을 때
    if (at < 0) return;
    cursor = at + item.claimText.length;
    const parts = [];
    if (supportedFocus) {
      supportedClaimRanges(item.claimText, item.details).forEach((part) => {
        parts.push({ name: part.detail ? "fc-detail" : "fc-focus", start: at + part.start, end: at + part.end });
      });
    } else {
      const spans = (item.spans || []).map((span) => ({ start: at + (span.start - item.start), end: at + (span.end - item.start) }))
        .filter((span) => span.end > span.start && span.start >= at && span.end <= at + item.claimText.length);
      (spans.length ? spans : [{ start: at, end: at + item.claimText.length }])
        .forEach((span) => parts.push({ name: VERDICT_NAME[item.verdict], ...span }));
    }
    const sentence = toRange(map, at, at + item.claimText.length);
    if (!sentence) return;
    located.push({ item, sentence, parts: parts.map((part) => ({ ...part, range: toRange(map, part.start, part.end) })).filter((part) => part.range), active: item.id === activeId });
  });
  return located;
}

/** 칠하기. 이전에 칠한 것은 모두 지운다(본문이 바뀌거나 결과가 줄면 오래된 표시가 남지 않는다) */
export function paint(root, results, options) {
  if (!supportsHighlights()) return [];
  clearPaint();
  const located = locate(root, results, options);
  const groups = Object.fromEntries(NAMES.map((name) => [name, []]));
  located.forEach(({ parts, active }) => {
    parts.forEach((part) => {
      groups[part.name].push(part.range);
      if (active) groups["fc-active"].push(part.range);
    });
  });
  NAMES.forEach((name) => { if (groups[name].length) CSS.highlights.set(name, new Highlight(...groups[name])); });
  return located;
}

export function clearPaint() {
  if (supportsHighlights()) NAMES.forEach((name) => CSS.highlights.delete(name));
}

/** 마우스 좌표 아래에 있는 문제 문장(칠해진 문장) */
export function hitTest(located, x, y) {
  for (const entry of located) {
    if (entry.item.verdict === "SUPPORTED") continue;
    for (const rect of entry.sentence.getClientRects()) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return { ...entry, rect };
    }
  }
  return null;
}
