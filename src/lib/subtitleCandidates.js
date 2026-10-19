/** AI가 줄 구분자로 쓴 ` / `를 실제 줄바꿈으로 고치고 빈 줄을 제거한다. */
export const normalizeSubtitleCandidate = (value) => String(value || "")
  .replace(/[ \t]+\/[ \t]+/g, "\n")
  .split(/\n+/)
  .map((line) => line.trim())
  .filter(Boolean)
  .join("\n");
