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
    sources: [], // 올린 취재자료 [{id, name, format, size, chars, path, addedAt, text}] — text 는 메모리에만(원본·텍스트는 코어가 내 문서에 보관)
    linkedInterviews: [],
    photos: [],
    platformDrafts: {},
    cardNews: null,
    platformGeneration: {},
  };
}
