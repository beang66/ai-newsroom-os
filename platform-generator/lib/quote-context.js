// 원문 위치에서 문맥만 읽는다. 의미 검색·임베딩·인용 교체를 수행하지 않는다.
function normalizedWithOffsets(text) {
  let normalized = '', starts = [], ends = [], pendingSpace = null;
  for (let i = 0; i < text.length;) {
    const char = String.fromCodePoint(text.codePointAt(i));
    const end = i + char.length;
    if (/\s/u.test(char)) {
      if (normalized && !pendingSpace) pendingSpace = { start: i, end };
      else if (pendingSpace) pendingSpace.end = end;
    } else {
      if (pendingSpace) {
        normalized += ' '; starts.push(pendingSpace.start); ends.push(pendingSpace.end);
        pendingSpace = null;
      }
      normalized += char;
      for (let n = 0; n < char.length; n++) { starts.push(i); ends.push(end); }
    }
    i = end;
  }
  return { text: normalized, starts, ends };
}

function collectQuotes(value, path = 'draft', out = []) {
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'source_evidence') {
      for (const quote of Array.isArray(child) ? child : [])
        if (typeof quote === 'string' && quote.trim()) out.push({ path: `${path}.${key}`, quote });
    } else if (typeof child === 'string' && path.includes('block_evidence')) {
      if (child.trim()) out.push({ path: `${path}.${key}`, quote: child });
    } else if (child && typeof child === 'object') collectQuotes(child, `${path}.${key}`, out);
  }
  return out;
}

function paragraphs(text) {
  const spans = [];
  for (const match of text.matchAll(/[^\r\n]+/g)) {
    if (match[0].trim()) spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

function quoteContexts(article, draft, { maxOccurrences = 24, maxChars = 6000 } = {}) {
  const body = typeof article?.content === 'string' ? article.content : '';
  const mapped = normalizedWithOffsets(body), blocks = paragraphs(body);
  const groups = new Map();
  for (const entry of collectQuotes(draft)) {
    const quote = entry.quote.replace(/\s+/g, ' ').trim();
    if (!groups.has(quote)) groups.set(quote, new Set());
    groups.get(quote).add(entry.path);
  }
  const matches = [], unmatched = []; let totalChars = 0, complete = true;
  for (const [quote, locations] of groups) {
    let at = mapped.text.indexOf(quote), found = false;
    if (at < 0) { unmatched.push({ quote, draft_locations: [...locations] }); continue; }
    while (at >= 0) {
      found = true;
      const start = mapped.starts[at], end = mapped.ends[at + quote.length - 1];
      const first = blocks.findIndex(block => block.end > start);
      let last = blocks.findIndex(block => block.end >= end);
      if (last < 0) last = blocks.length - 1;
      const contextStart = blocks[Math.max(0, first - 1)]?.start ?? start;
      const contextEnd = blocks[Math.min(blocks.length - 1, last + 1)]?.end ?? end;
      const context = body.slice(contextStart, contextEnd);
      if (matches.length >= maxOccurrences || totalChars + context.length > maxChars) {
        complete = false; break;
      }
      matches.push({ draft_locations: [...locations], source_field: 'content',
        offset_unit: 'utf16', start, end, quote: body.slice(start, end),
        context_start: contextStart, context_end: contextEnd, context });
      totalChars += context.length;
      at = mapped.text.indexOf(quote, at + 1);
    }
    if (!found) unmatched.push({ quote, draft_locations: [...locations] });
  }
  return { version: 'quote-context-v1', context_complete: complete, matches, unmatched };
}

module.exports = { quoteContexts, normalizedWithOffsets };
