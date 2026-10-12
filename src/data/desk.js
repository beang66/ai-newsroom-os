// 오늘의 데스크 일정 — 코어에 마감·담당 정보가 아직 없어 데스크 편성표를 여기에 둔다.
// 코어가 일정을 제공하면 이 배열만 응답으로 바꾸면 된다(화면은 아래 함수만 쓴다).

/** 상태 KPI 순서 — 편집 중 → 검증 대기 → 송고 준비 → 출고 완료 */
export const DESK_STAGES = ["편집 중", "검증 대기", "송고 준비", "출고 완료"];

/** 기사 작성 단계(지금 집중할 기사의 진행 표시) */
export const WRITING_STEPS = ["취재", "작성", "검증", "송고"];

// next.to · issues[].to 는 이동할 화면 — navigation.js 의 화면 id,
// 또는 "evidence"(기사 작성 화면을 팩트체크·근거자료 서랍이 열린 채로 연다).
export const deskSchedule = [
  {
    id: "heatwave", deadline: "10:40", desk: "사회", slug: "폭염 대응 기획", owner: "김다은",
    status: "검증 중", stage: "검증 대기", next: { label: "근거 2건 확인", to: "evidence" },
    title: "서울 폭염 대응, 취약계층 거주지를 집중 분석합니다",
    deck: "쪽방촌·반지하 밀집 지역의 폭염 노출 시간과 무더위쉼터 접근성을 구별로 비교합니다.",
    step: 2, // WRITING_STEPS 기준: 작성 완료, 검증 진행 중
    evidence: { linked: 8, total: 11 }, interviews: 3, checksLeft: 2,
    issues: [
      { kind: "verify", label: "검증 필요", title: "4.2도 표기 재확인", detail: "원자료 4.18도 · 본문 2문단", action: "수치 확인", to: "evidence" },
      { kind: "evidence", label: "근거 부족", title: "정책 효과 주장 2건", detail: "본문 3·5문단에 출처가 없습니다", action: "근거 찾기", to: "evidence" },
      { kind: "link", label: "자료 연결 가능", title: "서울시 관측 자료 발견", detail: "주장 4건과 연결할 수 있습니다", action: "자료 연결", to: "map" },
    ],
  },
  { id: "household-debt", deadline: "11:20", desk: "경제", slug: "가계부채 연속 기획", owner: "이재호", status: "편집 중", stage: "편집 중", next: { label: "제목 확정", to: "writer" } },
  { id: "flood-recovery", deadline: "13:00", desk: "지역", slug: "집중호우 복구 현장", owner: "정소라", status: "취재 중", stage: "편집 중", next: { label: "인터뷰 연결", to: "interview" } },
  { id: "film-festival", deadline: "15:30", desk: "문화", slug: "국제영화제 개막", owner: "한지수", status: "송고 준비", stage: "송고 준비", next: { label: "CMS 이관", to: "convert" } },
  { id: "audit", deadline: "16:40", desk: "정치", slug: "국정감사 쟁점 정리", owner: "박민준", status: "검증 중", stage: "검증 대기", next: { label: "발언 인용 대조", to: "evidence" } },
  { id: "chip-export", deadline: "18:00", desk: "경제", slug: "반도체 수출 동향", owner: "최유진", status: "편집 중", stage: "편집 중", next: { label: "통계 자료 연결", to: "map" } },
  { id: "morning-brief", deadline: "07:30", desk: "편집", slug: "아침 뉴스 브리핑", owner: "오세훈", status: "출고 완료", stage: "출고 완료", next: null },
  { id: "traffic", deadline: "08:50", desk: "사회", slug: "출근길 교통 통제 안내", owner: "김다은", status: "출고 완료", stage: "출고 완료", next: null },
  { id: "weather-week", deadline: "09:40", desk: "생활", slug: "주간 날씨 전망", owner: "윤하늘", status: "출고 완료", stage: "출고 완료", next: null },
  // 오늘 출고한 관련 기사 — 데이터맵 예시 자료(sample-data/datamap/projects/기사)와 같은 기사들
  { id: "pub-heat-shelter", deadline: "06:10", desk: "사회", slug: "폭염 특보 발효, 무더위쉼터 야간 연장", owner: "김다은", status: "출고 완료", stage: "출고 완료", next: null },
  { id: "pub-debt-part1", deadline: "06:50", desk: "경제", slug: "가계부채 연속 기획 1회 — 금리 멈춘 사이 다시 늘어난 빚", owner: "이재호", status: "출고 완료", stage: "출고 완료", next: null },
  { id: "pub-flood-first-count", deadline: "07:10", desk: "지역", slug: "집중호우 피해 1차 집계 발표", owner: "정소라", status: "출고 완료", stage: "출고 완료", next: null },
  { id: "pub-film-opening", deadline: "07:50", desk: "문화", slug: "국제영화제 개막작 공개", owner: "한지수", status: "출고 완료", stage: "출고 완료", next: null },
  { id: "pub-audit-fsc", deadline: "08:20", desk: "정치", slug: "국감 첫날, 금융위 가계대출 관리 질타", owner: "박민준", status: "출고 완료", stage: "출고 완료", next: null },
  { id: "pub-chip-august", deadline: "08:40", desk: "경제", slug: "8월 반도체 수출 증가 전환", owner: "최유진", status: "출고 완료", stage: "출고 완료", next: null },
  { id: "pub-semi-basement", deadline: "09:10", desk: "사회", slug: "반지하 가구, 침수 뒤 폭염까지 이중고", owner: "김다은", status: "출고 완료", stage: "출고 완료", next: null },
  { id: "pub-flood-aid-delay", deadline: "09:30", desk: "지역", slug: "재난지원금, 세입자 지급 지연", owner: "정소라", status: "출고 완료", stage: "출고 완료", next: null },
  { id: "pub-dsr-rush", deadline: "10:00", desk: "경제", slug: "스트레스 DSR 시행 앞두고 대출 몰려", owner: "이재호", status: "출고 완료", stage: "출고 완료", next: null },
  { id: "pub-audit-mois", deadline: "10:20", desk: "정치", slug: "행안위 국감, 재난 대응 예산 점검", owner: "박민준", status: "출고 완료", stage: "출고 완료", next: null },
];

/** "HH:MM" 마감 시각을 분으로 — 정렬용 */
const minutes = (time) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };

/** 상태별 건수 — [[단계, 건수], ...] (DESK_STAGES 순서) */
export function countByStage(items) {
  return DESK_STAGES.map((stage) => [stage, items.filter((item) => item.stage === stage).length]);
}

/** 오늘의 마감 큐 — 출고 전 기사만, 마감 임박순 */
export function deadlineQueue(items) {
  return items.filter((item) => item.stage !== "출고 완료").sort((a, b) => minutes(a.deadline) - minutes(b.deadline));
}

/** 지금 집중할 기사 — 마감이 가장 가까운 출고 전 기사 */
export function focusStory(items) {
  return deadlineQueue(items)[0] || null;
}

/** 보관함에 함께 보이는 데스크 편성 예시 — 코어 원고가 아니라 읽기 전용(sample: true). 출고·마감 늦은 순.
 * 보관함의 원고/송고 구분(state)에 맞춰 출고 완료는 송고(published), 나머지는 원고로 둔다. */
export function deskArchiveItems(items = deskSchedule) {
  return [...items].sort((a, b) => minutes(b.deadline) - minutes(a.deadline)).map((item) => ({
    id: `desk:${item.id}`, sample: true, state: item.stage === "출고 완료" ? "published" : "draft", stage: item.stage, title: item.title || item.slug, subtitle: item.deck || "",
    deadline: item.deadline, desk: item.desk, owner: item.owner, next: item.next,
  }));
}
