import { useState } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Folder,
  X,
} from "lucide-react";
import { CATEGORIES, categoryLabel } from "../constants.js";
import CategoryMark from "./CategoryMark.jsx";
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
}) {
  const [tab, setTab] = useState("context"),
    [all, setAll] = useState(false);
  // 연결 수 = 이어진 서로 다른 노드 수(양방향 링크는 하나로 센다)
  const degree = (id) => new Set(graph.edges.flatMap((e) => (e.source === id ? [e.target] : e.target === id ? [e.source] : []))).size;
  if (!node) {
    const articles = graph.nodes.filter((n) => n.category === "article");
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
  const direct = ranked.files.filter((n) => n.priority === "direct"),
    indirect = ranked.files.filter((n) => n.priority !== "direct");
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
      <span className="score" title="연결 구조로 계산한 참고 점수">
        {n.score}
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
              <h3>가장 관련 있는 자료</h3>
              <small>관련도순</small>
            </div>
            {direct.length ? (
              direct.slice(0, all ? 12 : 3).map(fileRow)
            ) : (
              <p className="muted">직접 연결된 자료가 없습니다.</p>
            )}
          </section>
          <section>
            <div className="section-label">
              <h3>다른 맥락에서 발견</h3>
              <small>참고</small>
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
              ? "링크와 백링크는 Markdown 원문에서 해석한 실제 연결입니다. 아래 관련 자료 점수는 탐색을 위한 참고값입니다."
              : "관련도는 직접 연결·프로젝트·공통 주제로 계산한 참고 점수이며, 사실 검증 결과가 아닙니다."}
          </p>
        </>
      )}
    </aside>
  );
}
