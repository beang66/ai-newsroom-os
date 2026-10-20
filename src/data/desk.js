// 오늘의 데스크 — 코어 암호화 저장소의 실제 기사 목록(GET /api/articles, core/read_models.py)에서만 계산한다.
// 저장소에 없는 정보(마감 시각·데스크·담당자)는 보이지 않는다. 화면은 아래 함수만 쓴다.
// 기사 항목: { id, title, subtitle, state(draft|editing|published), updated_at, revision_count, unsaved_changes,
//            linkedSources(source_ids), linkedInterviews(interviews), snapshot_count, photo_count }

/** 상태 KPI 4단계 — 코어 상태와 저장된 사실에서 계산: 편집 중(수동 저장 전) · 검증 대기(저장했으나 고정본 없음) · 송고 준비(고정본 있음) · 출고 완료(송고함, 송고 뒤 고침 포함) */
export const DESK_STAGES = ["편집 중", "검증 대기", "송고 준비", "출고 완료"];

/** 기사 작성 단계(지금 집중할 기사의 진행 표시) */
export const WRITING_STEPS = ["취재", "작성", "검증", "송고"];

const count = (value) => (Array.isArray(value) ? value.length : 0);

/** 기사가 속한 상태 단계의 이름 */
export function stageLabel(article) {
  if (article.state === "published" || article.state === "editing") return DESK_STAGES[3];
  if ((article.snapshot_count || 0) > 0) return DESK_STAGES[2];
  if ((article.revision_count || 0) > 0) return DESK_STAGES[1];
  return DESK_STAGES[0];
}

/** [[라벨, 건수], ...] (DESK_STAGES 순서) */
export function countByStage(articles) {
  return DESK_STAGES.map((label) => [label, articles.filter((item) => stageLabel(item) === label).length]);
}

/** 단계별 완료 여부 — 취재: 자료·녹취 연결 / 작성: 수동 저장 / 검증: 고정본(검증·변환에 넘긴 판) / 송고: 송고본 있음 */
export function stepsDone(article) {
  return [
    count(article.linkedSources) + count(article.linkedInterviews) > 0,
    (article.revision_count || 0) > 0,
    (article.snapshot_count || 0) > 0,
    article.state === "published" || article.state === "editing",
  ];
}

/** 진행 중인 단계 번호(0~3). 모두 끝났으면 4 */
export function writingStep(article) {
  const done = stepsDone(article);
  const next = done.findIndex((value) => !value);
  return next === -1 ? done.length : next;
}

/** 지금 확인할 것 — 저장된 사실에서만 만든다. to 는 navigation.js 의 화면 id 또는 "evidence"(근거자료 서랍) */
export function issuesOf(article) {
  const issues = [];
  if (article.unsaved_changes)
    issues.push({ kind: "save", label: "저장 필요", title: "수동 저장하지 않은 변경", detail: "자동 임시 저장만 된 내용이 있습니다", action: "원고 열기", to: "writer" });
  if (!count(article.linkedSources))
    issues.push({ kind: "evidence", label: "근거 없음", title: "연결한 취재자료가 없습니다", detail: "자료를 올리거나 출처로 연결하세요", action: "근거 찾기", to: "evidence" });
  if (article.state === "editing")
    issues.push({ kind: "verify", label: "다시 송고", title: "송고 뒤 고친 내용이 있습니다", detail: "송고본과 마지막 저장본이 다릅니다", action: "변환·배포", to: "convert" });
  return issues;
}

/** 다음 작업 — 첫 확인 사항, 없으면 다음 단계 */
export function nextAction(article) {
  const issue = issuesOf(article)[0];
  if (issue) return { label: issue.action, to: issue.to };
  return [{ label: "자료 연결", to: "evidence" }, { label: "원고 저장", to: "writer" }, { label: "팩트체크", to: "evidence" },
    { label: "변환·송고", to: "convert" }][writingStep(article)] || null;
}

/** 지금 집중할 기사 — 송고를 마치지 않은 기사 중 가장 최근에 고친 것 */
export function focusStory(articles) {
  return articles.filter((item) => item.revision_no && item.state !== "published")
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] || null;
}

/** 아직 송고가 끝나지 않았거나 송고 뒤 수정되어 다시 송고해야 하는 저장 기사 */
export function deliveryPendingArticles(articles) {
  return articles.filter((item) => item.revision_no && item.state !== "published")
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

/** 서울 시각 날짜 "YYYY-MM-DD" */
export const seoulDate = (value) => (value ? new Date(value).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) : "");

/** 고른 기간(서울 날짜)에 고친 저장 기사 — 최근 수정순 */
export function articlesInRange(articles, start, end = start) {
  return articles.filter((item) => item.revision_no && start <= seoulDate(item.updated_at) && seoulDate(item.updated_at) <= end)
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}
