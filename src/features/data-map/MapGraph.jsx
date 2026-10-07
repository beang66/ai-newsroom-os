import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { KINDS } from "./model.js";

export default function MapGraph({ nodes, edges, selectedId, onSelect, query, matches }) {
  const viewport = useRef(null);
  const drag = useRef(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const layout = useMemo(() => {
    const columns = [["article"], ["claim"], ["source", "entity"]];
    const height = Math.max(500, ...columns.map(kinds => nodes.filter(n => kinds.includes(n.kind)).length * 104 + 80));
    const placed = columns.flatMap((kinds, col) => {
      const group = nodes.filter(n => kinds.includes(n.kind));
      return group.map((node, i) => ({ ...node, x: 40 + col * 300, y: (height - group.length * 104) / 2 + i * 104, width: 228, height: 80 }));
    });
    return { nodes: placed, width: 910, height };
  }, [nodes]);
  const fit = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    const scale = Math.max(.25, Math.min(1, (el.clientWidth - 30) / layout.width, (el.clientHeight - 24) / layout.height));
    setCamera({ scale, x: (el.clientWidth - layout.width * scale) / 2, y: (el.clientHeight - layout.height * scale) / 2 });
  }, [layout]);
  useEffect(() => {
    const observer = new ResizeObserver(fit);
    observer.observe(viewport.current);
    fit();
    return () => observer.disconnect();
  }, [fit]); // Refit only when data/filter/layout changes; selection preserves camera.
  const zoom = factor => setCamera(old => {
    const scale = Math.max(.25, Math.min(2, old.scale * factor));
    const cx = viewport.current.clientWidth / 2, cy = viewport.current.clientHeight / 2;
    return { scale, x: cx - (cx - old.x) * scale / old.scale, y: cy - (cy - old.y) * scale / old.scale };
  });
  return <div className="map-graph-shell">
    <div className="map-graph-caption"><span>기사 → 주장 → 출처 · 인물/기관</span><span>빈 공간을 드래그해 이동</span></div>
    <div ref={viewport} className="map-viewport" role="region" aria-label="관계 그래프"
      onPointerDown={event => {
        if (event.button !== 0 || event.target.closest("button")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, camera };
      }} onPointerMove={event => {
        if (!drag.current) return;
        setCamera({ ...drag.current.camera, x: drag.current.camera.x + event.clientX - drag.current.x, y: drag.current.camera.y + event.clientY - drag.current.y });
      }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="map-world" style={{ width: layout.width, height: layout.height, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
        <svg width={layout.width} height={layout.height} className="map-edges" aria-hidden="true">
          <defs><marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="currentColor" /></marker></defs>
          {edges.map(edge => {
            const from = layout.nodes.find(n => n.id === edge.source_id), to = layout.nodes.find(n => n.id === edge.target_id);
            const x1 = from.x + from.width, y1 = from.y + 40, x2 = to.x, y2 = to.y + 40;
            return <path key={edge.id} className={edge.source_id === selectedId || edge.target_id === selectedId ? "selected" : ""} d={`M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`} markerEnd="url(#map-arrow)" />;
          })}
        </svg>
        {layout.nodes.map(node => <button key={node.id} className={`map-node ${node.kind} ${node.id === selectedId ? "selected" : ""} ${query && matches.has(node.id) ? "match" : ""}`} style={{ left: node.x, top: node.y, width: node.width, height: node.height }} onClick={() => onSelect(node.id)} aria-pressed={node.id === selectedId} title={node.label}>
          <span className="map-node-kind"><span className={`map-dot ${node.kind}`} />{KINDS[node.kind]}{node.kind === "claim" && node.verification_status === "needs_review" ? " · 확인 필요" : ""}</span>
          <strong>{node.label}</strong>
        </button>)}
      </div>
    </div>
    <div className="map-zoom"><button aria-label="축소" onClick={() => zoom(.8)}><Minus size={15} /></button><span>{Math.round(camera.scale * 100)}%</span><button aria-label="확대" onClick={() => zoom(1.25)}><Plus size={15} /></button><button onClick={fit}><Maximize size={14} />전체 맞춤</button></div>
  </div>;
}
