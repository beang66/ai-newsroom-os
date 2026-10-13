export const destinations = [
  { id: "desk", number: "01", label: "오늘의 데스크", description: "오늘 해야 할 기사와 가장 먼저 처리할 작업을 보여줍니다." },
  { id: "writer", number: "02", label: "기사 작성", description: "원고를 작성하면서 취재자료와 검증 결과를 함께 확인합니다." },
  { id: "interview", number: "03", label: "인터뷰·녹취", description: "녹음에서 필요한 발언을 골라 원고로 보냅니다." },
  { id: "convert", number: "04", label: "콘텐츠 변환", description: "현재 기사에서 채널별 원고와 카드뉴스를 만듭니다." },
  { id: "map", number: "05", label: "데이터맵", description: "문서의 링크와 백링크를 따라 취재 맥락을 탐색합니다." },
  { id: "archive", number: "06", label: "보관함", description: "저장한 기사를 찾고 원고와 연결된 자료를 확인합니다." },
];

const pageRoutes = new Set([...destinations.map((item) => item.id), "settings"]);

export function routeFromHash(hash, fallback = "desk") {
  const route = String(hash || "").replace(/^#/, "");
  const page = pageRoutes.has(fallback) ? fallback : "desk";
  if (route === "login" || route === "signup") return { page, auth: route };
  return { page: pageRoutes.has(route) ? route : page, auth: null };
}
