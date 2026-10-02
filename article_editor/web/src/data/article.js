// 새 기사 기본값 — 목업 없이 빈 원고로 시작한다.
const stamp = () => new Date().toLocaleString("sv-SE", { hour12: false }).slice(0, 16); // YYYY-MM-DD HH:mm

export function createEmptyArticle() {
  const now = stamp();
  return {
    id: `art-${Date.now()}`,
    title: "",
    suggestedTitle: "",
    subtitle: "",
    content: "",
    status: "작성 중", // 작성 중, 검증 완료, 발행 준비, 발행 완료
    createdAt: now,
    updatedAt: now,
    linkedSources: [],
    linkedInterviews: [],
    photos: [],
    cardNews: [],
  };
}
