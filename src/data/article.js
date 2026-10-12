// 새 기사 기본값 — 목업 없이 빈 원고로 시작한다.
const stamp = () => new Date().toLocaleString("sv-SE", { hour12: false }).slice(0, 16); // YYYY-MM-DD HH:mm

export function formatArticleTime(value) {
  if (!value) return "아직 저장 전";
  if (!value.includes("T")) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 확인 필요";
  return date.toLocaleString("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function createEmptyArticle() {
  const now = stamp();
  return {
    id: `art-${Date.now()}`,
    title: "",
    suggestedTitle: "",
    subtitle: "",
    content: "",
    category: "", // 기사 분류(donga.com 섹션, data/sections.js) — 예: "사회"
    subcategory: "", // 세부 분류(선택) — 예: "교육"
    status: "작성 중", // 작성 중, 검증 완료, 발행 준비, 발행 완료
    cmsReceipt: null,
    createdAt: now,
    updatedAt: now,
    linkedSources: [],
    sources: [], // 올린 취재자료 [{id, name, format, size, chars, path, addedAt, text}] — 원본·텍스트는 코어 암호화 저장소에 보관
    linkedInterviews: [],
    photos: [],
    platformDrafts: {},
    cardNews: null,
    platformGeneration: {},
  };
}
