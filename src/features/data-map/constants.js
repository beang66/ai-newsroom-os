// 노드 분류 — 기사가 만들어지는 근거의 흐름(기획 → 원자료·인터뷰 → 검증 → 기사)을 따른다.
// 분류는 코어가 준 사실에서만 정한다: 기사·업로드 자료는 코어 종류, Markdown 은 담긴 역할 폴더, 끊긴 링크는 미확보.
// 근거(관계)·인물(추출 기능 없음)처럼 데이터에 없는 분류는 두지 않는다.
export const CATEGORIES = {
  article: { label: "기사", description: "작성 중이거나 출고한 원고" },
  plan: { label: "기획·메모", description: "취재 방향, 데스크 편성, 제목안" },
  data: { label: "원자료", description: "통계·관측·공문서·보도자료·첨부 파일" },
  interview: { label: "인터뷰·발언", description: "인터뷰, 녹취, 공식 발언" },
  verify: { label: "검증 기록", description: "팩트체크와 인용 대조" },
  note: { label: "취재 노트", description: "역할 폴더 밖의 Markdown" },
  missing: { label: "미확보 자료", description: "링크는 있지만 아직 가져오지 않은 문서" },
};

/** Markdown 경로의 폴더 이름 → 분류. 가장 안쪽 폴더부터 찾는다(예: projects/인터뷰/a.md → 인터뷰·발언). */
export const CATEGORY_FOLDERS = {
  기사: "article", articles: "article",
  기획: "plan", 메모: "plan", plan: "plan", plans: "plan",
  원자료: "data", 자료: "data", 데이터: "data", data: "data",
  인터뷰: "interview", 녹취: "interview", 발언: "interview", interviews: "interview",
  검증: "verify", 팩트체크: "verify", factcheck: "verify",
};

export function categoryLabel(node) {
  return CATEGORIES[node?.category]?.label || "자료";
}
