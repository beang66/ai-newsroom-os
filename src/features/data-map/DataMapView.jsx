import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Network,
  Search,
  Upload,
  X,
} from "lucide-react";
import { dataMapApi } from "../../api/datamap.js";
import { TYPES } from "./constants.js";
import { FILE_KINDS } from "./domain/files.js";
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
// 데이터는 api(기본: src/api/datamap.js, 코어 읽기 모델 knowledge-map)로만 받는다.
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
  const [importing, setImporting] = useState(false),
    [importNotice, setImportNotice] = useState("");
  const [view, setView] = useState("map"),
    [query, setQuery] = useState(""),
    [project, setProject] = useState("all"),
    [kind, setKind] = useState("all");
  const [selectedId, setSelectedId] = useState(null),
    [reader, setReader] = useState(null);
  const [expanded, setExpanded] = useState(false),
    [contextWidth, setContextWidth] = useState(320),
    [overviewWidth, setOverviewWidth] = useState(320),
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
    setSelectedId(id);
  };
  const open = (node, page = 0) => setReader({ node, page });
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
  const importMarkdown = async (fileList) => {
    const selectedFiles = [...(fileList || [])].filter((file) =>
      file.name.toLowerCase().endsWith(".md"),
    );
    if (!selectedFiles.length) {
      setImportNotice("가져올 .md 파일을 선택해 주세요.");
      return;
    }
    setImporting(true);
    setImportNotice("");
    try {
      const files = await Promise.all(
        selectedFiles.map(async (file) => ({
          path: (file.webkitRelativePath || file.name).replaceAll("\\", "/"),
          content: await file.text(),
        })),
      );
      const result = await api.importFiles(files);
      const changed = (result.imported || 0) + (result.updated || 0);
      setImportNotice(
        `${result.imported || 0}개 추가 · ${result.updated || 0}개 갱신${result.unchanged ? ` · ${result.unchanged}개 동일` : ""}`,
      );
      if (changed || result.unchanged) setAttempt((value) => value + 1);
      setView("library");
    } catch (cause) {
      setImportNotice(cause?.message || "Markdown 파일을 가져오지 못했습니다.");
    } finally {
      setImporting(false);
    }
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
          <>
            <p>
              저장된 기사나 지식 파일이 없습니다. Markdown을 추가하면 문서의
              링크와 백링크가 관계망으로 표시됩니다.
            </p>
            <label className="primary-button file-import-empty">
              <Upload size={15} />
              {importing ? "가져오는 중" : "Markdown 추가"}
              <input
                className="sr-only"
                type="file"
                accept=".md,text/markdown"
                multiple
                disabled={importing}
                onChange={(event) => {
                  importMarkdown(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            {importNotice && <p role="status">{importNotice}</p>}
          </>
        )}
      </div>
    );
  const panelWidth = selected ? contextWidth : overviewWidth;
  const setPanelWidth = selected ? setContextWidth : setOverviewWidth;
  const hasFilter = project !== "all" || kind !== "all" || query;
  return (
    <div
      className={`dm-root ${expanded ? "expanded" : ""}`}
      data-testid="data-map"
    >
      <div className="map-workspace">
        {importNotice && <p className="dm-import-notice" role="status">{importNotice}</p>}
        <div className="datamap-command">
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
          <MapViews view={view} onView={navigate} />
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
            <label className="dm-import-button">
              <Upload size={14} />
              {importing ? "가져오는 중" : "Markdown 추가"}
              <input
                className="sr-only"
                type="file"
                accept=".md,text/markdown"
                multiple
                disabled={importing}
                onChange={(event) => {
                  importMarkdown(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            {hasFilter && (
              <button className="text-button" onClick={resetFilters}>
                필터 초기화
                <X size={12} />
              </button>
            )}
            <span>{visible.length}개 노드</span>
          </div>
        </div>
        <div
          className={`content-grid ${expanded ? "single" : "context-resizable"}`}
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
          ) : (
            <ResourceTable
              nodes={visible.filter(
                (n) => FILE_KINDS.has(n.kind) && !n.placeholder,
              )}
              projects={graph.projects}
              selectedId={selectedId}
              onSelect={choose}
              onOpen={open}
              onImport={importMarkdown}
              importing={importing}
              importNotice={importNotice}
            />
          )}
          {!expanded && (
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
