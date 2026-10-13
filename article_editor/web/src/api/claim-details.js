// 날짜·출처·주체의 표기 위치를 찾는다. 언급이나 파일명만으로 사실을 검증했다고 판정하지 않는다.
const DATE = /(?<!\d)(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|(?:\d{4}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\s*일)/g;
const dateParts = (s) => (s.match(/\d+/g) || []).map(Number);

function reference(term, kind, text) {
  if (!text) return null;
  let at = text.indexOf(term);
  let length = term.length;
  if (kind === 'date') {
    const wanted = dateParts(term);
    const match = [...text.matchAll(DATE)].find((m) => {
      const found = dateParts(m[0]);
      return found.length >= wanted.length && wanted.every((v, i) => v === found[found.length - wanted.length + i]);
    });
    if (!match) return null;
    at = match.index;
    length = match[0].length;
  }
  if (at < 0) return null;
  return text.slice(Math.max(0, at - 20), at + length + 20).replace(/\s+/g, ' ').trim();
}

export function claimDetails(claim, quote, source = {}) {
  const found = [];
  const add = (text, start, kind) => {
    if (!found.some((d) => start < d.end && start + text.length > d.start))
      found.push({ text, start, end: start + text.length, kind });
  };
  for (const m of claim.matchAll(DATE)) add(m[0], m.index, 'date');
  // 기관/시스템 이름과 문장 주체. NER 판정이 아니라 표시 후보이므로 항목별 의미 검증과 구분한다.
  for (const m of claim.matchAll(/[가-힣A-Za-z][가-힣A-Za-z0-9·]*(?:감독원|위원회|시스템|거래소|공사|공단|연구원|협회|은행|법원|시청|군청|구청)/g))
    add(m[0], m.index, 'entity');
  for (const m of claim.matchAll(/(?:^|따르면\s+|,\s*)([가-힣A-Za-z][가-힣A-Za-z0-9·]+?)(?:은|는|이|가)\s/g))
    add(m[1], m.index + m[0].indexOf(m[1]), 'entity');
  for (const m of (source.name || '').matchAll(/\[([^\]]+)\]/g)) {
    const at = claim.indexOf(m[1]);
    if (at >= 0) add(m[1], at, 'entity');
  }
  return found.sort((a, b) => a.start - b.start).map((d) => {
    for (const [location, text] of [['excerpt', quote], ['document', source.text], ['title', source.name]]) {
      const hit = reference(d.text, d.kind, text);
      if (hit) return { ...d, location, reference: hit,
        label: d.kind === 'date' ? (location === 'title' ? '자료명에 같은 일자 · 의미 확인 필요' : '같은 일자 표기 · 의미 확인 필요')
          : location === 'excerpt' ? '발췌에 표기 · 관계 확인 필요' : location === 'document' ? '원문 다른 구간에 표기 · 관계 확인 필요' : '자료명에만 표기 · 원문 확인 필요' };
    }
    return { ...d, location: 'missing', reference: '', label: '근거에서 찾지 못함' };
  });
}

/** 일치 판정의 문장에서 세부 정보 후보는 노랑으로 구분한다. 파일명/단순 언급을 확정된 사실처럼 초록으로 칠하지 않는다. */
export function supportedClaimRanges(text, details = []) {
  const spans = [];
  let cursor = 0;
  for (const d of details) {
    if (d.start > cursor) spans.push({ start: cursor, end: d.start });
    spans.push({ start: d.start, end: d.end, detail: true, title: `${d.text}: ${d.label}` });
    cursor = d.end;
  }
  if (cursor < text.length) spans.push({ start: cursor, end: text.length });
  return spans;
}
