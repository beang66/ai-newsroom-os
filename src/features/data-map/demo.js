/** Explicit UI fixture, not generated verification results or a server fallback. */
export function createDemoDataMap(article) {
  const claims = [
    { id: "demo-c1", claim_text: "기존 GPU 중심의 연산 시스템은 높은 전력 소비와 발열 문제로 한계에 부딪히고 있으며,", verification_status: "unverified", article_location: { paragraph: 1 } },
    { id: "demo-c2", claim_text: "전력 소비를 최대 70% 감소시키는 성과를 얻어냈다.", verification_status: "needs_review", article_location: { paragraph: 2 } },
    { id: "demo-c3", claim_text: "이에 따른 정부 차원의 집중 지원과 실증 사업 확대가 시급한 시점이다.", verification_status: "unverified", article_location: { paragraph: 3 } },
  ].filter(c => article.content.includes(c.claim_text));
  const entities = [
    { id: article.id, kind: "article", label: article.title, status: article.status },
    ...claims.map(c => ({ ...c, kind: "claim", article_id: article.id, label: c.claim_text })),
    { id: "demo-s1", kind: "source", label: "김성민 박사 인터뷰", source_type: "녹취", source_location: { start_ms: 12000 }, source_text: "[00:12] 저희가 이번에 개발한 NPU는 기존 제품 대비 전력 효율을 3배 이상 끌어올렸습니다.\n[02:45] 메모리 구간을 PIM 구조로 직접 처리하여 지연 시간을 크게 줄였습니다." },
    { id: "demo-s2", kind: "source", label: "2026 차세대 반도체 산업 동향 보고서", source_type: "공식문서", source_location: null },
    { id: "demo-e1", kind: "entity", label: "김성민 박사", entity_type: "인물" },
    { id: "demo-e2", kind: "entity", label: "산업통상자원부", entity_type: "기관" },
  ];
  const pairs = [["demo-c1", "demo-s2"], ["demo-c1", "demo-e2"], ["demo-c2", "demo-s1"], ["demo-c2", "demo-s2"], ["demo-c2", "demo-e1"]];
  const edges = [...claims.map(c => ({ source_id: article.id, target_id: c.id })), ...pairs.filter(([id]) => claims.some(c => c.id === id)).map(([source_id, target_id]) => ({ source_id, target_id }))];
  const used = new Set(edges.flatMap(e => [e.source_id, e.target_id]));
  return { entities: entities.filter(n => n.kind === "article" || used.has(n.id)), edges,
    evidence_links: claims.some(c => c.id === "demo-c2") ? [{ id: "demo-ev1", claim_id: "demo-c2", source_id: "demo-s1", evidence_text: "전력 효율을 3배 이상 끌어올렸습니다.", source_location: { start_ms: 12000 }, relation: "검토 필요" }] : [] };
}
