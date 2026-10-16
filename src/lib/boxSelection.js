// 박스 안 글 선택 읽기: 화자 박스의 글(data-box-text)을 드래그했을 때 어느 박스의 몇 번째 글자인지 알려 준다.
/** 선택한 글이 어느 박스(data-box-text)의 몇 번째 글자인지 읽는다. 한 박스 안의 선택만 인정한다. */
export function readBoxSelection() {
  const selection = globalThis.getSelection?.();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const element = node.nodeType === 1 ? node : node.parentElement;
  const holder = element?.closest?.("[data-box-text]");
  if (!holder) return null;
  const before = range.cloneRange();
  before.selectNodeContents(holder);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const end = start + range.toString().length;
  if (end <= start) return null;
  const rect = range.getBoundingClientRect();
  return { boxId: holder.getAttribute("data-box-text"), start, end, x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom };
}
