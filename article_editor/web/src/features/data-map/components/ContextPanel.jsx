import { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  FileText,
  Folder,
  Network,
  X,
} from "lucide-react";
import { TYPES } from "../constants.js";
export default function ContextPanel({
  node,
  ranked,
  graph,
  onSelect,
  onOpen,
  onProject,
  onClear,
}) {
  const [tab, setTab] = useState("context"),
    [all, setAll] = useState(false);
  if (!node)
    return (
      <aside className="context-panel overview-panel">
        <div className="panel-top">
          <span className="eyebrow">YOUR KNOWLEDGE, CONNECTED</span>
          <Network size={17} />
        </div>
        <div className="intro-orbit">
          <span />
          <span />
          <span />
          <Network size={30} />
        </div>
        <h2>
          흩어진 자료에서
          <br />
          하나의 맥락으로.
        </h2>
        <div className="overview-numbers">
          <div>
            <strong>{graph.projects.length}</strong>
            <small>프로젝트</small>
          </div>
          <div>
            <strong>
              {graph.nodes.filter((n) => n.kind === "article").length}
            </strong>
            <small>기사 중심축</small>
          </div>
          <div>
            <strong>
              {
                graph.nodes.filter(
                  (n) => !n.placeholder && n.kind !== "article",
                ).length
              }
            </strong>
            <small>상세 자료</small>
          </div>
        </div>
        <h3 className="subheading">이 기사에서 시작하기</h3>
        {graph.nodes
          .filter((n) => n.kind === "article")
          .slice(0, 3)
          .map((n) => (
            <button
              key={n.id}
              className="start-article"
              onClick={() => onSelect(n.id)}
            >
              <FileText size={16} />
              <span>
                {n.label}
                <small>
                  {graph.projects.find((p) => p.id === n.projectId)?.name}
                </small>
              </span>
              <ChevronRight size={14} />
            </button>
          ))}
      </aside>
    );
  const direct = ranked.files.filter((n) => n.priority === "direct"),
    indirect = ranked.files.filter((n) => n.priority !== "direct");
  const fileRow = (n, i) => (
    <button className="ranked-file" key={n.id} onClick={() => onSelect(n.id)}>
      <span className="rank-number">{String(i + 1).padStart(2, "0")}</span>
      <span className={`file-icon ${n.kind}`}>
        <FileText size={14} />
      </span>
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
        <span className="eyebrow">SELECTED CONTEXT</span>
        <button
          className="icon-button"
          aria-label="노드 선택 해제"
          onClick={onClear}
        >
          <X size={16} />
        </button>
      </div>
      <span className={`type-label ${node.kind}`}>
        {TYPES[node.kind]}
        {node.placeholder ? " · 형태 시연" : ""}
      </span>
      <h2>{node.label}</h2>
      <div className="tag-row">
        {node.tags.map((t) => (
          <span key={t}>#{t}</span>
        ))}
      </div>
      <section className="summary-card">
        <div>
          <BookOpen size={15} />
          <h3>요약카드</h3>
        </div>
        <p>{node.summary}</p>
        <footer>
          <span>{node.author}</span>
          <span>{node.updated}</span>
        </footer>
      </section>
      <button
        className="open-resource"
        onClick={() => onOpen(node)}
        disabled={!node.pages?.length}
      >
        {node.pages?.length ? "자료별 페이지 기록 열기" : "페이지 기록 없음"}
        <ArrowUpRight size={15} />
      </button>
      <div className="panel-tabs">
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
      </div>
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
          <section className="related-projects">
            <div className="section-label">
              <h3>관련 프로젝트</h3>
              <small>{ranked.projects.length}</small>
            </div>
            {ranked.projects.slice(0, all ? 10 : 3).map((p, i) => (
              <button
                className={`project-card ${i === 0 ? "primary-project" : ""}`}
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
            {!ranked.projects.length && (
              <p className="muted">연결된 프로젝트 기록이 없습니다.</p>
            )}
          </section>
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
          <section className="indirect-files">
            <div className="section-label">
              <h3>다른 맥락에서 발견</h3>
              <span className="subtle-pill">낮은 우선순위</span>
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
            관련도는 직접 연결·프로젝트·공통 주제로 계산한 참고 점수이며, 사실
            검증 결과가 아닙니다.
          </p>
        </>
      )}
    </aside>
  );
}
