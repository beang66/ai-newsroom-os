// 팩트체크 근거 표 → 화면 표시용. 표 구조(caption·header·rows)는 코어 검색기가 표 청크를 행으로 쪼갤 때 만들어 보낸다
// (evidence_rank.table_view). 여기서는 기사 숫자와 같은 값 칸에 표시만 붙인다.

/** 기사 문장의 숫자(연도·한 자리 정수 제외) — 근거 표에서 같은 값 칸을 강조할 때 쓴다 */
export function claimNumbers(claim) {
  return [...String(claim || "").matchAll(/\d[\d,]*(?:\.\d+)?/g)]
    .map((m) => m[0].replace(/,/g, ""))
    .filter((n) => n.includes(".") || (n.length >= 2 && !/^(19|20)\d\d$/.test(n)))
    .map(Number);
}

const cellValue = (token) => {
  const n = Number(token.replace(/[,()[\]%p+]/g, "").replace(/^[△▽▲]/, "-"));
  return Number.isFinite(n) && /\d/.test(token) ? Math.abs(n) : null;
};

/** 칸 하나에 숫자가 여럿일 수 있다(PDF 의 '45,779 100.0' = 값·구성비) — 그중 하나라도 기사 숫자와 같으면 강조 */
const cellHit = (text, wanted) => String(text).split(/\s+(?![^(]*\))/).some((token) => {
  const v = cellValue(token);
  return v != null && wanted.some((w) => Math.abs(w - v) < 1e-9);
});

/** { caption, header, header_rows?, rows: [{ label, cells: [str], path? }] } → rows 의 칸마다 hit(기사 숫자와 같은 값), 행에도 hit.
 *  header_rows(PDF 표): 코어가 PDF 칸 그대로 보낸 머리글 줄 [[{ text, span }]] — 여러 칸에 걸친 머리글('2025. 8' 아래 인구·취업자·고용률).
 *  path: 상위 행 이름(소제목·부모) — 같은 이름의 행(남자 20～29세 / 여자 20～29세)을 가른다. */
export function markTable(table, claim = "") {
  const wanted = claimNumbers(claim);
  const rows = (table.rows || []).map((row) => {
    const cells = row.cells.map((text) => ({ text, hit: cellHit(text, wanted) }));
    return { label: row.label, path: row.path || [], cells, hit: cells.some((c) => c.hit) };
  });
  return { caption: table.caption || [], header: table.header || null, headerRows: table.header_rows || null, rows };
}
