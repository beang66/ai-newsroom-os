import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  ChevronRight,
  Folder,
  Layers3,
  Network,
  Search,
  X,
} from "lucide-react";
import { dataMapApi } from "../../api/datamap.js";
import { TYPES } from "./constants.js";
import { FILE_KINDS } from "./domain/files.js";
import { articleUuid } from "./domain/coreProjection.js";
import {
  filterNodes,
  getContext,
  indexGraph,
  rankRelated,
} from "./domain/graph.js";
import KnowledgeGraph from "./components/KnowledgeGraph.jsx";
import ContextPanel from "./components/ContextPanel.jsx";
import ResourceTable from "./components/ResourceTable.jsx";
import ResourceReader from "./components/ResourceReader.jsx";
import MapViews from "./components/MapViews.jsx";
import "./data-map.css";

// Data Map — 보관함 화면의 data-map-slot 안에 들어가는 기능 화면.
// datamap/src/App.jsx 에서 독립 실행용 껍데기(가짜 헤더·사이드바·탭, 데모 데이터, 파일 추가/삭제)를 걷어 냈다.
// 데이터는 api(기본: web/src/api/datamap.js, 코어 읽기 모델 knowledge-map)로만 받는다.
export default function DataMapView({ api = dataMapApi, workspaceId, articleId }) {
  const searchInput = useRef(null);
  useEffect(() => {
    const shortcut = (event) => {
      if (
        event.key !== "/" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        document.querySelector("dialog[open]") ||
        event.target.closest("input, textarea, select, [contenteditable]")
      )
        return;
      event.preventDefault();
      searchInput.current?.focus();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const [graph, setGraph] = useState(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [view, setView] = useState("map"),
    [query, setQuery] = useState(""),
    [project, setProject] = useState("all"),
    [kind, setKind] = useState("all");
  const [selectedId, setSelectedId] = useState(null),
    [backStack, setBackStack] = useState([]),
    [reader, setReader] = useState(null);
  const [expanded, setExpanded] = useState(false),
    [contextWidth, setContextWidth] = useState(320),
    [overviewWidth, setOverviewWidth] = useState(320),
    [visits, setVisits] = useState([]),
    [notes, setNotes] = useState({}),
    [saved, setSaved] = useState([]);
  const deferredQuery = useDeferredValue(query);
  useEffect(() => {
    const controller = new AbortController();
    setGraph(null);
    setError("");
    api
      .getKnowledgeMap({ workspaceId, articleId, signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setGraph(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [api, workspaceId, articleId, attempt]);
  const index = useMemo(() => (graph ? indexGraph(graph) : null), [graph]);
  const selected = index?.byId.get(selectedId);
  const context = useMemo(
    () => (index ? getContext(selectedId, index) : null),
    [index, selectedId],
  );
  const ranked = useMemo(
    () => (graph ? rankRelated(selected, graph, index) : null),
    [graph, selected, index],
  );
  const visible = useMemo(
    () =>
      graph ? filterNodes(graph, { query: deferredQuery, project, kind }) : [],
    [graph, deferredQuery, project, kind],
  );
  const choose = (id) => {
    if (id && id !== selectedId)
      setBackStack((s) => [...s, selectedId].slice(-24));
    setSelectedId(id);
  };
  const open = (node, page = 0) => setReader({ node, page });
  const visit = useCallback((node, page) => {
    const key = node.pages?.[page]?.id || node.id;
    setVisits((previous) =>
      [
        {
          key,
          nodeId: node.id,
          page,
          time: new Date().toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
        ...previous.filter((v) => v.key !== key),
      ].slice(0, 80),
    );
  }, []);
  const navigate = (next) => {
    setView(next);
    setExpanded(false);
  };
  const filterProject = (id) => {
    setProject(id);
    setQuery("");
    setKind("all");
    setSelectedId(null);
  };
  const resetFilters = () => {
    setProject("all");
    setKind("all");
    setQuery("");
  };
  if (!graph || !graph.nodes.length)
    return (
      <div className="dm-root dm-status" data-testid="data-map">
        <Network size={34} />
        <h2>데이터맵</h2>
        {!graph && !error && <p>취재 맥락을 불러오고 있습니다.</p>}
        {error && (
          <>
            <p role="alert">관계망을 불러오지 못했습니다. {error}</p>
            <button
              className="small-button"
              onClick={() => {
                setError("");
                setAttempt((a) => a + 1);
              }}
            >
              다시 시도
            </button>
          </>
        )}
        {graph && (
          <p>
            아직 저장된 기사나 취재자료가 없습니다. 기사 작성 화면에서 기사를
            저장하면 기사와 연결된 취재자료가 여기 관계망으로 표시됩니다.
          </p>
        )}
      </div>
    );
  const projectName = graph.projects.find((p) => p.id === project)?.name;
  const panelWidth = selected ? contextWidth : overviewWidth;
  const setPanelWidth = selected ? setContextWidth : setOverviewWidth;
  const hasFilter = project !== "all" || kind !== "all" || query;
  const currentSaved = Boolean(articleId) && index.byId.has(articleUuid(articleId));
  const articles = graph.nodes.filter(
    (n) =>
      n.kind === "article" && (project === "all" || n.projectId === project),
  );
  return (
    <div
      className={`dm-root ${expanded ? "expanded" : ""}`}
      data-testid="data-map"
    >
      <div className="map-workspace">
        <MapViews view={view} onView={navigate} count={visits.length} />
        {!currentSaved && (
          <p className="dm-scope-note" role="note">
            지금 쓰는 기사는 아직 저장되지 않아 관계망에 없습니다. 저장하면
            반영됩니다.
          </p>
        )}
        <div className="workspace-heading">
          <div className="breadcrumb">
            <Folder size={14} />
            지식 공간
            <ChevronRight size={12} />
            <strong>{projectName || "모든 프로젝트"}</strong>
          </div>
          <label className="global-search">
            <Search size={16} />
            <input
              ref={searchInput}
              aria-keyshortcuts="/"
              aria-label="지식 검색"
              placeholder="기사, 인물, 파일, 맥락 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="검색어 지우기" onClick={() => setQuery("")}>
                <X size={14} />
              </button>
            )}
            <kbd>/</kbd>
          </label>
        </div>
        <div className="filterbar">
          <div className="type-filters">
            <button
              className={kind === "all" ? "active" : ""}
              onClick={() => setKind("all")}
            >
              전체
            </button>
            {Object.entries(TYPES).map(([id, label]) => (
              <button
                key={id}
                className={kind === id ? "active" : ""}
                onClick={() => setKind(id)}
              >
                <span className={`type-dot ${id}`} />
                {label}
              </button>
            ))}
          </div>
          <div className="filter-actions">
            {hasFilter && (
              <button className="text-button" onClick={resetFilters}>
                필터 초기화
                <X size={12} />
              </button>
            )}
            <span>{visible.length}개 노드</span>
          </div>
        </div>
        {view !== "history" && (
          <div className="selection-bar">
            <button
              disabled={!backStack.length}
              onClick={() => {
                setSelectedId(backStack.at(-1));
                setBackStack((s) => s.slice(0, -1));
              }}
            >
              <ArrowLeft size={14} />
              이전 선택
            </button>
            {selected ? (
              <span>
                <i className="selection-dot" />
                {selected.label}
                <button aria-label="선택 초기화" onClick={() => choose(null)}>
                  <X size={12} />
                </button>
              </span>
            ) : (
              <span aria-hidden="true" />
            )}
            {selected && (
              <small>
                직접 연결 {context.direct.size - 1} · 간접 연결{" "}
                {context.indirect.size}
              </small>
            )}
          </div>
        )}
        <div
          className={`content-grid ${expanded || view === "history" ? "single" : ""} ${!expanded && view !== "history" ? "context-resizable" : ""}`}
          style={{ "--context-width": `${panelWidth}px` }}
        >
          {view === "map" ? (
            <KnowledgeGraph
              graph={graph}
              nodes={visible}
              index={index}
              selected={selected}
              context={context}
              onSelect={choose}
              expanded={expanded}
              onExpand={() => setExpanded(!expanded)}
            />
          ) : view === "library" ? (
            <ResourceTable
              nodes={visible.filter(
                (n) => FILE_KINDS.has(n.kind) && !n.placeholder,
              )}
              projects={graph.projects}
              selectedId={selectedId}
              onSelect={choose}
              onOpen={open}
            />
          ) : (
            <section className="history-page">
              <span className="eyebrow">READING TRAIL</span>
              <h1>나의 기사 모아보기</h1>
              <p>프로젝트별 기사와 연결된 취재 맥락을 모아봅니다.</p>
              <div className="history-summary">
                <span>
                  <Folder size={16} />
                  {articles.length}개 기사
                </span>
                <span>
                  <Bookmark size={16} />
                  {saved.length}개 기록 보관
                </span>
                <small>공통 Article ID와 프로젝트 기준</small>
              </div>
              {!articles.length ? (
                <div className="history-empty">
                  <div className="history-symbol">
                    <Layers3 size={34} />
                  </div>
                  <h2>첫 번째 맥락을 남겨보세요.</h2>
                  <p>선택한 프로젝트에 아직 기사가 없습니다.</p>
                  <button
                    className="primary-button"
                    onClick={() => navigate("map")}
                  >
                    관계망 탐색하기
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              ) : (
                <div className="visit-list article-collection">
                  {articles
                    .filter(
                      (n) =>
                        !deferredQuery ||
                        n.label
                          .toLowerCase()
                          .includes(deferredQuery.toLowerCase()),
                    )
                    .map((article) => (
                      <button
                        key={article.id}
                        onClick={() => {
                          choose(article.id);
                          navigate("map");
                        }}
                      >
                        <span className="file-icon article">
                          <Layers3 size={16} />
                        </span>
                        <span>
                          <strong>{article.label}</strong>
                          <small>
                            {
                              graph.projects.find(
                                (p) => p.id === article.projectId,
                              )?.name
                            }{" "}
                            · Article ID {article.id}
                          </small>
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                </div>
              )}
            </section>
          )}
          {view !== "history" && !expanded && (
            <>
              <button
                className={selected ? "context-resizer" : "overview-resizer"}
                role="separator"
                aria-orientation="vertical"
                aria-label={
                  selected
                    ? "SELECTED CONTEXT 너비 조절"
                    : "YOUR KNOWLEDGE, CONNECTED 너비 조절"
                }
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  event.currentTarget.dataset.dragging = "true";
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.dataset.dragging !== "true") return;
                  const bounds =
                    event.currentTarget.parentElement.getBoundingClientRect();
                  setPanelWidth(
                    Math.min(620, Math.max(260, bounds.right - event.clientX)),
                  );
                }}
                onPointerUp={(event) => {
                  event.currentTarget.dataset.dragging = "false";
                }}
                onPointerCancel={(event) => {
                  event.currentTarget.dataset.dragging = "false";
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft")
                    setPanelWidth((value) => Math.min(620, value + 20));
                  if (event.key === "ArrowRight")
                    setPanelWidth((value) => Math.max(260, value - 20));
                }}
                tabIndex={0}
              />
              <ContextPanel
                key={selectedId || "overview"}
                node={selected}
                graph={graph}
                ranked={ranked}
                onSelect={choose}
                onOpen={open}
                onProject={filterProject}
                onClear={() => choose(null)}
              />
            </>
          )}
        </div>
      </div>
      {reader && (
        <ResourceReader
          key={reader.node.id + ":" + reader.page}
          node={reader.node}
          initialPage={reader.page}
          project={graph.projects.find((p) => p.id === reader.node.projectId)}
          notes={notes}
          saved={saved}
          onNote={(id, text) => setNotes((s) => ({ ...s, [id]: text }))}
          onSave={(id) =>
            setSaved((s) =>
              s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
            )
          }
          onVisit={visit}
          onSavePage={(pageId, changes) =>
            api.saveSourceRevision({
              workspaceId,
              sourceId: reader.node.id,
              pageId,
              changes,
            })
          }
          canEditSource={api.canSaveSourceRevision === true}
          onClose={() => setReader(null)}
        />
      )}
    </div>
  );
}
