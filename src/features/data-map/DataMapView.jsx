import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FolderUp,
  Network,
  Search,
  Upload,
  X,
} from "lucide-react";
import { dataMapApi } from "../../api/datamap.js";
import { CATEGORIES } from "./constants.js";
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
import { droppedFiles, hasDroppedFiles } from "../../lib/fileDrop.js";
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
    [importNotice, setImportNotice] = useState(""),
    [importDragging, setImportDragging] = useState(false);
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
          path: (file.dropRelativePath || file.webkitRelativePath || file.name).replaceAll("\\", "/"),
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
  const importButtons = (
    <div
      className={`dm-import ${importDragging ? "is-dragging" : ""}`}
      data-testid="datamap-dropzone"
      onDragEnter={(event) => { if (hasDroppedFiles(event)) { event.preventDefault(); setImportDragging(true); } }}
      onDragOver={(event) => { if (hasDroppedFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setImportDragging(false); }}
      onDrop={async (event) => {
        event.preventDefault();
        setImportDragging(false);
        if (!importing) await importMarkdown(await droppedFiles(event.dataTransfer));
      }}
    >
      <label className="dm-button">
        <Upload size={14} />
        {importing ? "가져오는 중" : "Markdown 추가"}
        <input className="sr-only" type="file" accept=".md,text/markdown" multiple disabled={importing}
          onChange={(event) => { importMarkdown(event.target.files); event.target.value = ""; }} />
      </label>
      <label className="dm-button">
        <FolderUp size={14} />
        {graph?.nodes?.some((n) => n.kind === "note" && !n.placeholder) ? "다시 가져오기" : "폴더 추가"}
        <input className="sr-only" type="file" accept=".md,text/markdown" multiple webkitdirectory="" directory="" disabled={importing}
          onChange={(event) => { importMarkdown(event.target.files); event.target.value = ""; }} />
      </label>
      <span className="dm-drop-hint">Markdown 파일이나 폴더를 끌어놓기</span>
    </div>
  );
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
              저장된 기사나 취재 자료가 없습니다. Markdown 파일이나 폴더를
              추가하면 문서의 링크와 백링크가 관계망으로 표시됩니다.
            </p>
            {importButtons}
            {importNotice && <p role="status">{importNotice}</p>}
          </>
        )}
      </div>
    );
  const panelWidth = selected ? contextWidth : overviewWidth;
  const setPanelWidth = selected ? setContextWidth : setOverviewWidth;
  const hasFilter = project !== "all" || kind !== "all" || query;
  const categoryCounts = graph.nodes.reduce((counts, n) => ({ ...counts, [n.category]: (counts[n.category] || 0) + 1 }), {});
  return (
    <div
      className={`dm-root ${expanded ? "expanded" : ""}`}
      data-testid="data-map"
    >
      <div className="map-workspace">
        {importNotice && <p className="dm-import-notice" role="status">{importNotice}</p>}
        <div className="dm-toolbar">
          <label className="global-search">
            <Search size={16} />
            <input
              ref={searchInput}
              aria-keyshortcuts="/"
              aria-label="지식 검색"
              placeholder="기사, 자료, 경로 검색"
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
          <div className="dm-toolbar-actions">{importButtons}</div>
          <div className="dm-view-tools">
            <MapViews view={view} onView={navigate} />
            <select
              className="dm-filter-select"
              aria-label="분류 필터"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="all">전체 ({graph.nodes.length})</option>
              {Object.entries(CATEGORIES).map(([id, { label }]) => (
                <option key={id} value={id} disabled={!categoryCounts[id]}>
                  {label} ({categoryCounts[id] || 0})
                </option>
              ))}
            </select>
            {hasFilter && (
              <button className="text-button" onClick={resetFilters}>
                필터 초기화
                <X size={12} />
              </button>
            )}
            <span className="dm-result-count">{visible.length}개 노드</span>
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
              importNotice={importNotice}
            />
          )}
          {!expanded && (
            <>
              <button
                className={selected ? "context-resizer" : "overview-resizer"}
                role="separator"
                aria-orientation="vertical"
                aria-label={selected ? "선택한 맥락 패널 너비 조절" : "취재 맥락 요약 패널 너비 조절"}
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
                onKind={(id) => { setKind(id); setSelectedId(null); }}
                categoryCounts={categoryCounts}
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
