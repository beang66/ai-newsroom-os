import { useState } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Folder,
  GitBranch,
  Flag,
  X,
} from "lucide-react";
import { CATEGORIES, categoryLabel } from "../constants.js";
import CategoryMark from "./CategoryMark.jsx";
import { getReviewPriority, sortForReview } from "../domain/reviewPriority.js";
export default function ContextPanel({
  node,
  ranked,
  graph,
  onSelect,
  onOpen,
  onProject,
  onClear,
  onKind,
  categoryCounts = {},
  priorities = {},
  onPriority,
}) {
  const [tab, setTab] = useState("context"),
    [all, setAll] = useState(false);
  // 연결 수 = 이어진 서로 다른 노드 수(양방향 링크는 하나로 센다)
  const degree = (id) => new Set(graph.edges.flatMap((e) => (e.source === id ? [e.target] : e.target === id ? [e.source] : []))).size;
  if (!node) {
    const articles = graph.nodes.filter((n) => n.category === "article");
    const reviewQueue = graph.nodes
      .filter((n) => !n.placeholder && getReviewPriority(priorities, n.id) === "high")
      .sort((a, b) => a.label.localeCompare(b.label, "ko"));
    const hubs = graph.nodes
      .filter((n) => !n.placeholder)
      .map((n) => ({ ...n, links: degree(n.id) }))
      .filter((n) => n.links > 0)
      .sort((a, b) => b.links - a.links || a.label.localeCompare(b.label, "ko"))
      .slice(0, 4);
    const nodeRow = (n, meta) => (
      <button key={n.id} className="start-article" onClick={() => onSelect(n.id)}>
        <CategoryMark category={n.category} />
        <span>
          {n.label}
          <small>{meta}</small>
        </span>
        <ChevronRight size={14} />
      </button>
    );
    return (
      <aside className="context-panel">
        <div className="panel-top">
          <h2>취재 맥락 요약</h2>
        </div>
        <dl className="overview-numbers">
          <div><dt>기사</dt><dd>{categoryCounts.article || 0}</dd></div>
          <div><dt>자료</dt><dd>{graph.nodes.filter((n) => !n.placeholder && n.category !== "article").length}</dd></div>
          <div><dt>연결</dt><dd>{graph.edges.length}</dd></div>
          <div><dt>미확보</dt><dd>{categoryCounts.missing || 0}</dd></div>
        </dl>
        <section>
          <div className="section-label"><h3>분류</h3><small>눌러서 걸러 보기</small></div>
          <ul className="category-list">
            {Object.entries(CATEGORIES).map(([id, { label, description }]) => (
              <li key={id}>
                <button onClick={() => onKind?.(id)} disabled={!categoryCounts[id]}>
                  <CategoryMark category={id} size={14} />
                  <span><strong>{label}</strong><small>{description}</small></span>
                  <em>{categoryCounts[id] || 0}</em>
                </button>
              </li>
            ))}
          </ul>
        </section>
        {reviewQueue.length > 0 && (
          <section className="dm-priority-queue">
            <div className="section-label"><h3>우선 검토로 표시한 자료</h3><small>{reviewQueue.length}건</small></div>
            {reviewQueue.slice(0, 5).map((n) => nodeRow(n, `${categoryLabel(n)} · 직접 확인하기`))}
          </section>
        )}
        {hubs.length > 0 && (
          <section>
            <div className="section-label"><h3>많이 연결된 자료</h3><small>연결 수</small></div>
            {hubs.map((n) => nodeRow(n, `${categoryLabel(n)} · 연결 ${n.links}개`))}
          </section>
        )}
        {articles.length > 0 && (
          <section>
            <div className="section-label"><h3>기사에서 시작하기</h3><small>{articles.length}건</small></div>
            {articles.slice(0, 4).map((n) => nodeRow(n, n.updated || n.path || "기사"))}
          </section>
        )}
      </aside>
    );
  }
  const direct = sortForReview(ranked.files.filter((n) => n.priority === "direct"), priorities),
    indirect = sortForReview(ranked.files.filter((n) => n.priority !== "direct"), priorities);
  const selectedPriority = getReviewPriority(priorities, node.id);
  const firstRelated = direct[0] || indirect[0];
  const isKnowledgeFile = node.kind === "note";
  const linkRow = (link, direction) => {
    const linkedId = direction === "out" ? link.target : link.source;
    const linked = graph.nodes.find((candidate) => candidate.id === linkedId);
    return (
      <button
        className="knowledge-link"
        key={`${direction}:${link.id}`}
        onClick={() => linked && onSelect(linked.id)}
      >
        <span className={`link-state ${link.resolved ? "resolved" : "missing"}`} aria-hidden="true" />
        <span>
          <strong>{linked?.label || link.target_ref || "연결할 파일 없음"}</strong>
          <small>
            {direction === "out" ? link.raw_text : `${linked?.path || "Markdown"}에서 연결`}
            {link.line ? ` · ${link.line}행` : ""}
          </small>
        </span>
        <ChevronRight size={14} />
      </button>
    );
  };
  const fileRow = (n, i) => (
    <button className="ranked-file" key={n.id} onClick={() => onSelect(n.id)}>
      <span className="rank-number">{String(i + 1).padStart(2, "0")}</span>
      <CategoryMark category={n.category} />
      <span className="rank-content">
        <strong>{n.label}</strong>
        <small>{n.reason}</small>
      </span>
      <span className={`review-tag ${getReviewPriority(priorities, n.id) === "high" ? "high" : ""}`}>
        {getReviewPriority(priorities, n.id) === "high"
          ? "우선 검토"
          : getReviewPriority(priorities, n.id) === "later"
            ? "나중에"
            : n.priority === "direct" ? "직접 연결" : "관련 자료"}
      </span>
    </button>
  );
  return (
    <aside className="context-panel">
      <div className="panel-top">
        <span className="type-label">
          <CategoryMark category={node.category} />
          {categoryLabel(node)}
          {node.placeholder ? " · 아직 가져오지 않음" : ""}
        </span>
        <button
          className="icon-button"
          aria-label="노드 선택 해제"
          onClick={onClear}
        >
          <X size={16} />
        </button>
      </div>
      <h2>{node.label}</h2>
      <section className="dm-next-actions" aria-label="선택한 자료의 다음 행동">
        <div className="section-label"><h3>이 자료로 다음에 할 일</h3><small>선택 후 바로 실행</small></div>
        <div className="dm-action-buttons">
          {node.pages?.length > 0
            ? <button className="dm-primary-action" onClick={() => onOpen(node)}>
                <ArrowUpRight size={14} /> 자료 내용 확인
              </button>
            : <span className="dm-action-disabled">원문 열기 미지원</span>}
          <button onClick={() => firstRelated && onSelect(firstRelated.id)} disabled={!firstRelated}>
            <GitBranch size={14} /> 연결 자료 따라가기
          </button>
          {!node.placeholder && (
            <button aria-pressed={selectedPriority === "high"} className={selectedPriority === "high" ? "is-priority" : ""}
              onClick={() => onPriority?.(node.id, selectedPriority === "high" ? "normal" : "high")}>
              <Flag size={14} /> {selectedPriority === "high" ? "우선 검토 해제" : "우선 검토 지정"}
            </button>
          )}
        </div>
        <p className="dm-action-footnote">우선 검토 표시는 이 기기에만 저장됩니다. 검증 결과나 기사 중요도를 자동 판정하지 않습니다.</p>
      </section>
      <dl className="node-meta">
        {node.path && <div><dt>경로</dt><dd>{node.path}</dd></div>}
        {node.summary && node.summary !== node.path && <div><dt>요약</dt><dd>{node.summary}</dd></div>}
        {node.updated && <div><dt>수정</dt><dd>{node.updated}</dd></div>}
        <div><dt>연결</dt><dd>{degree(node.id)}개{isKnowledgeFile && !node.placeholder ? ` · 링크 ${node.outgoing?.length || 0} · 백링크 ${node.backlinks?.length || 0}` : ""}</dd></div>
      </dl>
      {node.tags.length > 0 && (
        <div className="tag-row">
          {node.tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </div>
      )}
      {node.pages?.length > 0 && (
        <button className="open-resource" onClick={() => onOpen(node)}>
          자료별 페이지 기록 열기
          <ArrowUpRight size={15} />
        </button>
      )}
      {node.pages?.length > 0 && <div className="panel-tabs">
        <button
          className={tab === "context" ? "active" : ""}
          onClick={() => setTab("context")}
        >
          연결된 맥락
        </button>
        <button
          className={tab === "pages" ? "active" : ""}
          onClick={() => setTab("pages")}
        >
          페이지 기록 <span>{node.pages?.length || 0}</span>
        </button>
      </div>}
      {tab === "pages" ? (
        <div className="page-record-list">
          {node.pages?.length ? (
            node.pages.map((p) => (
              <button key={p.id} onClick={() => onOpen(node, p.number - 1)}>
                <span>{p.locator}</span>
                <strong>{p.title}</strong>
                {p.note && <small>{p.note}</small>}
                <ChevronRight size={14} />
              </button>
            ))
          ) : (
            <div className="empty-state">
              이 노드에는 페이지 기록이 없습니다. 연결된 문서나 녹취를 선택해
              보세요.
            </div>
          )}
        </div>
      ) : (
        <>
          {isKnowledgeFile && (
            <div className="knowledge-relations">
              <section>
                <div className="section-label">
                  <h3>이 파일이 가리키는 링크</h3>
                  <small>{node.outgoing?.length || 0}</small>
                </div>
                {node.outgoing?.length ? (
                  node.outgoing.map((link) => linkRow(link, "out"))
                ) : (
                  <p className="muted">나가는 링크가 없습니다.</p>
                )}
              </section>
              <section>
                <div className="section-label">
                  <h3>이 파일을 가리키는 백링크</h3>
                  <small>{node.backlinks?.length || 0}</small>
                </div>
                {node.backlinks?.length ? (
                  node.backlinks.map((link) => linkRow(link, "in"))
                ) : (
                  <p className="muted">들어오는 백링크가 없습니다.</p>
                )}
              </section>
            </div>
          )}
          {ranked.projects.length > 0 && <section>
            <div className="section-label">
              <h3>관련 프로젝트</h3>
              <small>{ranked.projects.length}</small>
            </div>
            {ranked.projects.slice(0, all ? 10 : 3).map((p, i) => (
              <button
                className="project-card"
                key={p.id}
                onClick={() => onProject(p.id)}
              >
                <Folder size={16} style={{ color: p.color }} />
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.reason}</small>
                </span>
                {i === 0 ? (
                  <span className="priority-tag">최우선</span>
                ) : (
                  <ChevronRight size={13} />
                )}
              </button>
            ))}
          </section>}
          <section>
            <div className="section-label">
              <h3>직접 연결 자료 · 먼저 확인</h3>
              <small>우선 검토 표시 먼저</small>
            </div>
            {direct.length ? (
              direct.slice(0, all ? 12 : 3).map(fileRow)
            ) : (
              <p className="muted">직접 연결된 자료가 없습니다.</p>
            )}
          </section>
          <section>
            <div className="section-label">
              <h3>간접 관련 자료</h3>
              <small>탐색 참고</small>
            </div>
            {indirect.slice(0, all ? 8 : 2).map(fileRow)}
            {!indirect.length && (
              <p className="muted">추가 연관 자료가 없습니다.</p>
            )}
          </section>
          {ranked.files.length > 3 && (
            <button
              className="text-button more-related"
              onClick={() => setAll(!all)}
            >
              {all
                ? "간략히 보기"
                : `연관 자료 더 보기 (${ranked.files.length})`}
            </button>
          )}
          <p className="panel-footnote">
            {isKnowledgeFile
              ? "링크와 백링크는 원문에 있는 실제 연결입니다. 우선 검토는 개인의 검토 순서입니다."
              : "직접 연결·프로젝트·공통 주제순으로 자료를 찾습니다. 연결 여부와 우선 검토 표시는 사실 검증 결과가 아닙니다."}
          </p>
        </>
      )}
    </aside>
  );
}
