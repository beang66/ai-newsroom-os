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

/** { caption, header, rows: [{ label, cells: [str] }] } → rows 의 칸마다 hit(기사 숫자와 같은 값), 행에도 hit */
export function markTable(table, claim = "") {
  const wanted = claimNumbers(claim);
  const rows = (table.rows || []).map((row) => {
    const cells = row.cells.map((text) => {
      const v = cellValue(text);
      return { text, hit: v != null && wanted.some((w) => Math.abs(w - v) < 1e-9) };
    });
    return { label: row.label, cells, hit: cells.some((c) => c.hit) };
  });
  return { caption: table.caption || [], header: table.header || null, rows };
}
