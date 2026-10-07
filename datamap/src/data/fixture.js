// Synthetic, deterministic data. No source file, newsroom document or DB is read.
import { articlePosition, insideCircle } from "../domain/layout.js";
const stableUuid = (value) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const tail = `${(hash >>> 0).toString(16).padStart(8, "0")}${(value.length >>> 0).toString(16).padStart(4, "0")}`;
  return `00000000-0000-4000-8000-${tail.slice(-12)}`;
};
export const TYPES = {
  article: "기사",
  evidence: "근거",
  source: "출처 문서",
  person: "인물",
  audio: "녹취",
  note: "취재 노트",
};
const projectRecords = [
  {
    id: "p-ai",
    name: "AI 반도체의 다음 장",
    color: "#7770bc",
    description: "기술, 전력, 공급망을 함께 추적하는 기획 취재",
    tags: ["AI", "반도체", "전력"],
  },
  {
    id: "p-energy",
    name: "전력 전환의 현장",
    color: "#58978e",
    description: "산업의 변화가 에너지 수요에 미치는 영향",
    tags: ["전력", "기후", "인프라"],
  },
  {
    id: "p-city",
    name: "도시의 새로운 일상",
    color: "#ac9274",
    description: "공간과 이동으로 읽는 도시의 변화",
    tags: ["도시", "인프라", "정책"],
  },
  {
    id: "p-work",
    name: "일의 미래",
    color: "#7d96b9",
    description: "기술 도입 이후 현장에 남는 질문들",
    tags: ["AI", "노동", "정책"],
  },
  {
    id: "p-climate",
    name: "기후 대응 기록",
    color: "#a37c96",
    description: "기업과 지역의 탄소 전환을 기록합니다",
    tags: ["기후", "전력", "정책"],
  },
];
const projectIds = Object.fromEntries(
  projectRecords.map((project) => [
    project.id,
    stableUuid(`project:${project.id}`),
  ]),
);
export const PROJECTS = projectRecords.map((project) => ({
  ...project,
  id: projectIds[project.id],
  legacy_id: project.id,
}));
const articles = [
  ["차세대 AI 반도체, 전력의 한계를 넘다", "p-ai", ["AI", "반도체", "전력"]],
  ["데이터센터가 바꾸는 전력 지도", "p-energy", ["AI", "전력", "인프라"]],
  ["반도체 공급망의 새로운 연결", "p-ai", ["반도체", "정책"]],
  ["AI와 함께 일하는 사람들", "p-work", ["AI", "노동"]],
  ["도시의 이동을 다시 설계하다", "p-city", ["도시", "인프라"]],
  ["탄소중립, 산업 현장의 질문", "p-climate", ["기후", "전력"]],
  ["지역에서 시작된 에너지 전환", "p-energy", ["전력", "정책"]],
  ["자동화 이후, 지역의 일자리", "p-work", ["노동", "도시", "정책"]],
];
const samples = [
  [
    "audio",
    "김서윤 연구원 인터뷰.m4a",
    "김서윤 연구원",
    "현장 인터뷰에서 확인한 기술의 가능성과 아직 남은 과제. 수치의 측정 조건을 추가 확인해야 합니다.",
  ],
  [
    "source",
    "차세대 기술 동향 보고서.pdf",
    "산업연구팀",
    "시장 흐름과 기술 채택 과정을 정리한 참고 문서. 기사 초안의 배경 설명에 연결됩니다.",
  ],
  [
    "person",
    "김서윤 연구원",
    "취재원",
    "기술 변화와 현장 적용에 관해 인터뷰한 인물. 다른 프로젝트의 인터뷰 기록과도 연결됩니다.",
  ],
  [
    "evidence",
    "효율 수치의 측정 조건",
    "편집 메모",
    "효율 개선 수치는 실험 환경과 비교 기준을 함께 읽어야 합니다. 인용 전에 원자료 확인이 필요합니다.",
  ],
  [
    "note",
    "현장 방문 · 취재 노트.md",
    "취재팀",
    "현장에서 관찰한 흐름과 후속 질문을 정리했습니다. 추가 취재가 필요한 지점을 표시했습니다.",
  ],
  [
    "source",
    "정책 브리핑과 지원 계획.pdf",
    "정책자료실",
    "지원 정책의 적용 범위와 일정에 관한 자료. 실행 현황은 별도 취재로 확인해야 합니다.",
  ],
  [
    "audio",
    "현장 라운드테이블.wav",
    "공동 취재",
    "산업 현장 담당자들의 경험을 담은 대화 기록. 참여자의 서로 다른 관점을 비교할 수 있습니다.",
  ],
  [
    "evidence",
    "현장 도입의 제약과 비용",
    "인터뷰 발췌",
    "현장 적용 비용과 운영 여건에 관한 설명. 기사에서 언급한 가능성과 함께 다룰 맥락입니다.",
  ],
  [
    "source",
    "분기별 현황 데이터.csv",
    "공개자료",
    "기간별 변화와 비교 기준을 정리한 표. 단위와 집계 범위를 확인해야 합니다.",
  ],
  [
    "person",
    "이도현 정책연구자",
    "취재원",
    "산업 정책과 지역 변화의 연결을 설명하는 전문가. 정책 관련 기획과 간접 연결됩니다.",
  ],
  [
    "note",
    "후속 질문과 교차 확인.md",
    "취재팀",
    "다른 취재원에게 확인할 질문과 연결된 자료의 쟁점을 기록합니다.",
  ],
  [
    "source",
    "현장 기록 아카이브.pdf",
    "현장 자료",
    "취재 당시의 현장 상황과 사진 설명을 정리한 자료. 기사에 쓰이지 않은 맥락도 보존합니다.",
  ],
];
function pagesFor(node) {
  if (node.placeholder || node.kind === "person") return [];
  return Array.from({ length: node.kind === "audio" ? 5 : 4 }, (_, i) => ({
    id: stableUuid(`${node.id}:page:${i + 1}`),
    legacy_id: `${node.legacy_id}-page-${i + 1}`,
    number: i + 1,
    locator:
      node.kind === "audio"
        ? [
            "00:00–02:14",
            "02:14–06:38",
            "06:38–11:20",
            "11:20–16:45",
            "16:45–21:09",
          ][i]
        : `p. ${i + 1}`,
    title: [
      "배경과 핵심 질문",
      "주요 관찰과 근거",
      "비교 조건과 유의점",
      "후속 취재 연결",
      "인터뷰 마무리",
    ][i],
    text: [
      node.summary,
      `이 기록은 ‘${node.label}’의 맥락을 살펴보기 위한 예시 페이지입니다. 현장의 관찰과 인터뷰 내용을 교차해 읽는 흐름을 시연합니다.`,
      "비교 대상, 조사 시점, 측정 방법에 따라 해석이 달라질 수 있습니다. 서로 다른 자료가 같은 사실을 설명하는지 확인하는 단계입니다.",
      "추가 자료 및 연결된 프로젝트에서 같은 주제를 찾아볼 수 있습니다. 이 페이지는 원본을 변경하지 않는 읽기 전용 프로토타입입니다.",
      "실제 음성 재생이나 자동 전사는 연결되지 않았습니다. 시간 구간별 기록 탐색만 시연합니다.",
    ][i],
    note:
      i === 1
        ? "수치 인용 전 원문과 비교 조건을 확인할 것"
        : i === 2
          ? "다른 프로젝트 자료와 교차 확인"
          : null,
  }));
}
export function createFixture() {
  const nodes = [],
    edges = [];
  const edgeKeys = new Set();
  const connect = (a, b, relation = "context") => {
    const key = [a, b].sort().join("|");
    if (a === b || edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({
      id: stableUuid(`edge:${key}`),
      legacy_id: key,
      source: a,
      target: b,
      relation,
    });
  };
  articles.forEach(([label, projectId, tags], cluster) => {
    const legacyArticleId = `a${cluster}`;
    const articleId = stableUuid(`article:${legacyArticleId}`);
    const canonicalProjectId = projectIds[projectId];
    const { x, y } = articlePosition(cluster);
    const hub = {
      id: articleId,
      legacy_id: legacyArticleId,
      articleId,
      kind: "article",
      label,
      projectId: canonicalProjectId,
      tags,
      x,
      y,
      cluster,
      summary: `${label}. 기술과 현장의 변화, 정책의 맥락을 연결하는 기획 기사입니다. 인터뷰·문서·취재 메모를 함께 살펴보세요.`,
      updated: "2026.10.05",
      author: "뉴스룸 취재팀",
      placeholder: false,
    };
    nodes.push(hub);
    for (let i = 0; i < 64; i++) {
      const sample = samples[i % samples.length];
      const placeholder = i >= samples.length;
      const random = (salt) => {
        const value = Math.sin((i + 1) * 127.1 + (cluster + 1) * 311.7 + salt * 74.7) * 43758.5453;
        return value - Math.floor(value);
      };
      // A few uneven, overlapping lobes create the dense, non-radial silhouette
      // of a living network instead of evenly spaced concentric rings.
      const lobe = i % 7;
      const lobeAngle = lobe * 0.91 + cluster * 0.47 + Math.sin(lobe * 2.3) * 0.38;
      const lobeRadius = (cluster === 0 ? 58 : cluster === 7 ? 38 : 48) + random(1) * 45;
      const lobeX = Math.cos(lobeAngle) * lobeRadius;
      const lobeY = Math.sin(lobeAngle) * lobeRadius * (0.68 + random(2) * 0.48);
      const spread = (cluster === 0 ? 63 : cluster === 7 ? 43 : 54) * (0.58 + random(3) * 0.8);
      const angle = random(4) * Math.PI * 2;
      const radius = Math.sqrt(random(5)) * spread;
      const warp = Math.sin(angle * 3 + cluster) * 12 + Math.cos(angle * 5 + lobe) * 7;
      const position = insideCircle({
        x: x + lobeX + Math.cos(angle) * (radius + warp),
        y: y + lobeY + Math.sin(angle) * (radius + warp) * 0.84,
      });
      const node = {
        id: stableUuid(`${articleId}-n${i}`),
        legacy_id: `${legacyArticleId}-n${i}`,
        articleId,
        kind: sample[0],
        label: placeholder
          ? `${TYPES[sample[0]]} · 연결 ${String(i + 1).padStart(2, "0")}`
          : cluster === 0
            ? sample[1]
            : `${label.split(",")[0].slice(0, 12)} · ${sample[1]}`,
        author: sample[2],
        summary: placeholder
          ? "네트워크의 밀도와 탐색감을 확인하기 위한 예시 노드입니다. 실제 내용은 연결되지 않았습니다."
          : sample[3],
        projectId: canonicalProjectId,
        tags: i % 3 === 0 ? tags : [tags[i % tags.length]],
        cluster,
        x: position.x,
        y: position.y,
        placeholder,
        updated: `2026.10.${String(5 - (i % 5)).padStart(2, "0")}`,
      };
      node.pages = pagesFor(node);
      nodes.push(node);
      connect(articleId, node.id, "article-material");
      if (i > 0)
        connect(node.id, stableUuid(`${articleId}-n${i - 1}`), "same-context");
      if (i > 4)
        connect(node.id, stableUuid(`${articleId}-n${i % 12}`), "reference");
      if (i > 12 && i % 2 === 0)
        connect(node.id, stableUuid(`${articleId}-n${i - 9}`), "reference");
    }
    hub.pages = pagesFor(hub);
  });
  // Cross-project bridges are derived from common topics and material type.
  // Layout-only points never claim a relationship to another project.
  const meaningful = nodes.filter((node) => !node.placeholder);
  for (const node of meaningful) {
    const candidates = meaningful
      .filter((other) => {
        if (node.projectId === other.projectId || node.id === other.id)
          return false;
        if (node.kind === "article") return other.kind === "article";
        return node.kind === other.kind && other.kind !== "article";
      })
      .map((other) => ({
        other,
        shared: node.tags.filter((tag) => other.tags.includes(tag)),
      }))
      .filter((candidate) => candidate.shared.length > 0)
      .sort(
        (a, b) =>
          b.shared.length - a.shared.length ||
          Math.hypot(node.x - a.other.x, node.y - a.other.y) -
            Math.hypot(node.x - b.other.x, node.y - b.other.y) ||
          a.other.id.localeCompare(b.other.id),
      );
    for (const { other, shared } of candidates.slice(
      0,
      node.kind === "article" ? 2 : 1,
    )) {
      const key = [node.id, other.id].sort().join("|");
      if (edgeKeys.has(key)) continue;
      connect(node.id, other.id, "cross-project");
      edges.at(-1).sharedTags = shared;
    }
  }
  return {
    nodes,
    edges,
    projects: PROJECTS,
    meta: {
      mode: "demo",
      label: "모든 자료·관계·관련도는 UX 시연용 예시입니다.",
    },
  };
}
