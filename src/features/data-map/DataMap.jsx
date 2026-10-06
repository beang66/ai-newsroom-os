import { useMemo, useState } from "react";
import { ArrowLeft, Network, List, Search, RotateCcw, RefreshCw, AlertTriangle, X, FileText } from "lucide-react";
import { useDataMap } from "./useDataMap.js";
import { KINDS, STATUSES, selectVisible, locationLabel } from "./model.js";
import MapGraph from "./MapGraph.jsx";
import NodeDetail from "./NodeDetail.jsx";
import "./data-map.css";

export default function DataMap({ article, workspaceId, mode = "api", load, onArticleLocation }) {
  const { model, status, error, retry } = useDataMap({ article, workspaceId, mode, load });
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState({ claim: true, source: true, entity: true });
  const [view, setView] = useState(() => window.matchMedia("(max-width: 900px)").matches ? "list" : "graph");
  const [focusId, setFocusId] = useState(null);
  const [missingOnly, setMissingOnly] = useState(false);
  const [source, setSource] = useState(null);
  const selected = model?.nodes.find(n => n.id === selectedId);
  const visible = useMemo(() => model ? selectVisible(model, { kinds, query, focusId, missingOnly }) : null, [model, kinds, query, focusId, missingOnly]);
  const choose = id => {
    if (id !== selectedId) setHistory(previous => [...previous, selectedId].filter(Boolean).slice(-20));
    setSelectedId(id);
    if (focusId) setFocusId(id);
  };
  const reset = () => { setQuery(""); setKinds({ claim: true, source: true, entity: true }); setFocusId(null); setMissingOnly(false); };
  return <div className="data-map">
    <div className="map-heading"><div><p className="map-eyebrow">ARTICLE KNOWLEDGE MAP</p><h1><Network size={23} />데이터맵</h1><p>{article.title}</p></div><div className="map-heading-actions"><span className="map-badge">{mode === "demo" ? "예시 데이터" : "Core 데이터"} · 읽기 전용</span><button className="map-action" onClick={retry} disabled={status === "loading"}><RefreshCw size={14} />새로고침</button></div></div>
    <div className="map-toolbar"><label className="map-search"><Search size={17} /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="주장, 자료명, 인물·기관 검색" aria-label="데이터맵 검색" />{query && <button onClick={() => setQuery("")} aria-label="검색 지우기"><X size={15} /></button>}</label><div className="map-view-switch" aria-label="보기 방식"><button onClick={() => setView("graph")} aria-pressed={view === "graph"}><Network size={15} />관계 보기</button><button onClick={() => setView("list")} aria-pressed={view === "list"}><List size={15} />목록 보기</button></div></div>
    {status === "loading" && <div className="map-state" role="status"><Network size={32} /><h2>기사의 근거를 연결하고 있습니다</h2><p>데이터맵을 불러오는 중입니다.</p></div>}
    {status === "error" && <div className="map-state" role="alert"><AlertTriangle size={30} /><h2>데이터맵을 불러오지 못했습니다</h2><p>{error?.message}</p>{error?.requestId && <small>요청 ID: {error.requestId}</small>}<button className="map-action primary" onClick={retry}>다시 시도</button></div>}
    {status === "ready" && <>
      {(model.missing.length > 0 || model.warnings.length > 0) && <div className="map-warning"><AlertTriangle size={16} /><span>{model.missing.length ? `출처 미연결 주장 ${model.missing.length}개 · 근거가 없는 주장도 그대로 표시합니다.` : model.warnings[0]}</span>{model.missing.length > 0 && <button aria-pressed={missingOnly} onClick={() => { setMissingOnly(!missingOnly); setFocusId(null); }}>{missingOnly ? "전체 보기" : "미연결 확인"}</button>}{model.warnings.length > 0 && <details><summary>데이터 안내</summary>{model.warnings.map(w => <p key={w}>{w}</p>)}</details>}</div>}
      {model.nodes.filter(n => n.kind !== "article").length === 0 ? <div className="map-state"><FileText size={32} /><h2>아직 연결된 자료가 없습니다</h2><p>기사의 주장·출처가 준비되면 이곳에 표시됩니다.</p></div> : <div className="map-layout">
        <aside className="map-filters"><div className="map-filter-title"><h2>탐색</h2><button onClick={reset} aria-label="탐색 초기화"><RotateCcw size={15} /></button></div><span className="map-eyebrow">표시할 항목</span>{Object.keys(kinds).map(kind => <label key={kind}><span className={`map-dot ${kind}`} /><span>{KINDS[kind]}</span><small>{model.nodes.filter(n => n.kind === kind).length}</small><input type="checkbox" checked={kinds[kind]} onChange={e => setKinds({ ...kinds, [kind]: e.target.checked })} /></label>)}<div className="map-filter-help">노드를 선택한 후 연결된 항목을 따라가며 근거를 확인하세요.</div><p className="map-muted">Evidence는 주장 상세에서 표시됩니다.</p><div className="map-count" aria-live="polite">{visible.nodes.length}개 항목 · {visible.edges.length}개 연결</div></aside>
        <section className="map-explorer" aria-label="자료 탐색"><div className="map-contextbar"><button disabled={!history.length} onClick={() => { const previous = history.at(-1); setSelectedId(previous); if (focusId) setFocusId(previous); setHistory(history.slice(0, -1)); }}><ArrowLeft size={14} />이전 선택</button><span>{focusId ? "선택 노드 주변" : "현재 기사 전체"}</span>{focusId && <button onClick={() => setFocusId(null)}>집중 해제<X size={13} /></button>}</div>
          {!visible.nodes.length ? <div className="map-state"><Search size={28} /><h2>조건에 맞는 항목이 없습니다</h2><button className="map-action" onClick={reset}>검색·필터 초기화</button></div> : view === "graph" ? <MapGraph {...visible} selectedId={selectedId} onSelect={choose} query={query} /> : <div className="map-list" role="group" aria-label="자료 목록">{visible.nodes.map(n => <button aria-pressed={n.id === selectedId} className={n.id === selectedId ? "selected" : ""} key={n.id} onClick={() => choose(n.id)}><span className={`map-dot ${n.kind}`} /><span><small>{KINDS[n.kind]}{n.kind === "claim" ? ` · ${STATUSES[n.verification_status]}` : ""}</small><strong>{n.label}</strong></span><span>상세 →</span></button>)}</div>}
        </section>
        <NodeDetail node={selected} model={model} onSelect={choose} onFocus={id => { setFocusId(id); setQuery(""); setMissingOnly(false); }} onArticleLocation={node => onArticleLocation({ articleId: article.id, claimText: node.claim_text || node.label, location: node.article_location, revisionId: model.revisionId, snapshotId: model.snapshotId })} onSource={setSource} onClose={() => setSelectedId(null)} />
      </div>}
    </>}
    {source && <div className="map-source-overlay" onClick={event => { if (event.target === event.currentTarget) setSource(null); }}><div className="map-source-dialog" role="dialog" aria-modal="true" aria-label="자료 내용" onKeyDown={event => { if (event.key === "Escape") setSource(null); if (event.key === "Tab") { event.preventDefault(); event.currentTarget.querySelector("button").focus(); } }}><button autoFocus aria-label="자료 닫기" onClick={() => setSource(null)}><X size={18} /></button><span className="map-eyebrow">{source.source_type || "출처"}</span><h2>{source.label}</h2><p>{locationLabel(source.source_location)}</p><pre>{source.source_text || "원문 URL 또는 자료 내용이 제공되지 않았습니다. 출처 제목과 위치 정보만 확인할 수 있습니다."}</pre></div></div>}
  </div>;
}
