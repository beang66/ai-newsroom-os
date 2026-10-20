const blocksOf = value => String(value || "").split(/\n\s*\n/u).map(block => block.trim()).filter(Boolean);

export const instagramCaptionText = draft => [
  draft?.opening,
  ...(draft?.paragraphs || []),
  draft?.closing,
  (draft?.hashtags || []).join(" "),
].filter(Boolean).join("\n\n");

export function parseInstagramCaption(value, previous = {}) {
  const blocks = blocksOf(value);
  let hashtags = [];
  if (blocks.length && blocks.at(-1).split(/\s+/u).every(word => word.startsWith("#"))) {
    hashtags = blocks.pop().split(/\s+/u);
  }
  const previousBodyCount = [previous.opening, ...(previous.paragraphs || []), previous.closing].filter(Boolean).length;
  const preserveClosing = Boolean(previous.closing?.trim()) && blocks.length === previousBodyCount;
  const opening = blocks.shift() || "";
  const closing = preserveClosing && blocks.length ? blocks.pop() : "";
  return { opening, paragraphs: blocks, closing, hashtags };
}

export const threadsText = draft => [draft?.opening, ...(draft?.paragraphs || [])].filter(Boolean).join("\n\n");

export function parseThreadsText(value) {
  const blocks = blocksOf(value);
  return { opening: blocks[0] || "", paragraphs: blocks.slice(1) };
}
