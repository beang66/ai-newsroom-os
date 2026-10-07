import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Focus, Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { TYPES } from "../constants.js";
const WIDTH = 1100,
  HEIGHT = 910;
const COLORS = {
  article: "#6d648d",
  evidence: "#8e89a2",
  source: "#849691",
  person: "#ac939e",
  audio: "#aa9986",
  note: "#9d9aa8",
};
export default memo(function KnowledgeGraph({
  graph,
  nodes,
  index,
  selected,
  context,
  onSelect,
  expanded,
  onExpand,
}) {
  const svg = useRef(null),
    drag = useRef(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, k: 1 });
  const [screenScale, setScreenScale] = useState(1);
  const [hovered, setHovered] = useState(null),
    [labels, setLabels] = useState(false);
  const allowed = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges = useMemo(
    () =>
      graph.edges.filter((e) => allowed.has(e.source) && allowed.has(e.target)),
    [graph.edges, allowed],
  );
  const sortedEdges = useMemo(
    () =>
      [...edges].sort(
        (a, b) =>
          Number(a.relation === "cross-project") -
          Number(b.relation === "cross-project"),
      ),
    [edges],
  );
  const bridgeCount = edges.filter(
    (edge) => edge.relation === "cross-project",
  ).length;
  const haloDots = useMemo(
    () => Array.from({ length: 220 }, (_, i) => {
      const angle = (i / 220) * Math.PI * 2 + Math.sin(i * 2.17) * 0.012;
      return {
        x: 550 + Math.cos(angle) * (445 + Math.sin(i * 1.31) * 13),
        y: 455 + Math.sin(angle) * (365 + Math.cos(i * 1.73) * 12),
        r: 1.05 + ((i * 37) % 100) / 100 * 0.14,
      };
    }),
    [],
  );
  const reset = () => setCamera({ x: 0, y: 0, k: 1 });
  const zoom = (factor, cx = WIDTH / 2, cy = HEIGHT / 2) =>
    setCamera((c) => {
      const k = Math.max(0.55, Math.min(4, c.k * factor));
      return {
        k,
        x: cx - ((cx - c.x) * k) / c.k,
        y: cy - ((cy - c.y) * k) / c.k,
      };
    });
  useEffect(() => {
    const el = svg.current;
    const observer = new ResizeObserver(() =>
      setScreenScale(
        Math.max(
          0.1,
          Math.min(el.clientWidth / WIDTH, el.clientHeight / HEIGHT),
        ),
      ),
    );
    observer.observe(el);
    const wheel = (e) => {
      e.preventDefault();
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
        el.getScreenCTM().inverse(),
      );
      zoom(e.deltaY > 0 ? 0.9 : 1.1, p.x, p.y);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", wheel);
    };
  }, []);
  const focus = () => {
    if (selected) {
      setCamera({
        k: 2.05,
        x: WIDTH / 2 - selected.x * 2.05,
        y: HEIGHT / 2 - selected.y * 2.05,
      });
    }
  };
  const hoverNode = hovered && index.byId.get(hovered);
  return (
    <section className="graph-panel" aria-label="원형 지식 관계망">
      <div className="graph-heading">
        <div>
          <span className="eyebrow">CONNECTED KNOWLEDGE</span>
          <h2>{selected ? "선택한 맥락의 연결" : "취재의 맥락을 한눈에"}</h2>
          <p>
            {nodes.length}개 노드 <span>·</span> {edges.length.toLocaleString()}
            개 연결 <span>·</span> 프로젝트 간 {bridgeCount}개
          </p>
        </div>
        <button
          className="icon-button"
          aria-label={expanded ? "기본 레이아웃" : "맵 넓게 보기"}
          onClick={onExpand}
        >
          <Maximize2 size={17} />
        </button>
      </div>
      <svg
        ref={svg}
        className="network-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        aria-label="기사 중심 관계망. 노드는 목록표에서도 탐색할 수 있습니다."
        onPointerDown={(e) => {
          if (e.button !== 0 || e.target.closest("[data-node]")) return;
          const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
            svg.current.getScreenCTM().inverse(),
          );
          drag.current = { mode: "pan", x: p.x, y: p.y, camera, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
            svg.current.getScreenCTM().inverse(),
          );
          const dx = p.x - drag.current.x,
            dy = p.y - drag.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
          setCamera({
            ...drag.current.camera,
            x: drag.current.camera.x + dx,
            y: drag.current.camera.y + dy,
          });
        }}
        onPointerUp={() => {
          if (drag.current && !drag.current.moved) onSelect(null);
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
          <g aria-hidden="true" className="graph-halo">
            {haloDots.map((dot, i) => (
              <circle key={i} cx={dot.x} cy={dot.y} r={dot.r} />
            ))}
          </g>
          <g aria-hidden="true">
            {sortedEdges.map((e) => {
              const a = index.byId.get(e.source),
                b = index.byId.get(e.target);
              const bridge = e.relation === "cross-project";
              const strong =
                selected &&
                (e.source === selected.id || e.target === selected.id);
              const hoveredEdge = hovered && (e.source === hovered || e.target === hovered);
              const within =
                selected &&
                context.direct.has(e.source) &&
                context.direct.has(e.target);
              return (
                <line
                  key={e.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={hoveredEdge ? "#5c9dff" : strong ? "#777a82" : bridge ? "#7773c4" : "#aaa3c4"}
                  strokeWidth={
                    strong ? (bridge ? 0.95 : 1) : bridge ? 0.55 : 0.4
                  }
                  opacity={
                    hovered && hovered !== selected?.id
                      ? hoveredEdge ? 0.78 : 0.035
                      : selected
                      ? strong
                        ? bridge
                          ? 0.94
                          : 0.72
                        : within
                          ? bridge
                            ? 0.48
                            : 0.25
                          : bridge
                            ? 0.095
                            : 0.045
                      : bridge
                        ? 0.39
                        : 0.17
                  }
                />
              );
            })}
          </g>
          {nodes.map((n) => {
            const active = n.id === selected?.id,
              connected = context.direct.has(n.id),
              indirect = context.indirect.has(n.id);
            const labelLimit = screenScale < 0.45 ? 11 : 23;
            const visibleLabel =
              n.kind === "article" ||
              active ||
              hovered === n.id ||
              (labels && !n.placeholder && camera.k > 1.35);
            const isHovered = hovered === n.id;
            const opacity =
              hovered && hovered !== selected?.id
                ? isHovered ? 1 : active ? 0.45 : 0.14
                : !selected || active || connected ? 1 : indirect ? 0.27 : 0.12;
            return (
              <g
                key={n.id}
                data-node={n.id}
                pointerEvents="bounding-box"
                role="button"
                tabIndex={n.placeholder ? -1 : 0}
                aria-label={`${TYPES[n.kind]}: ${n.label}`}
                aria-pressed={active}
                className={`graph-node ${isHovered ? "is-hovered" : ""} ${active ? "is-selected" : ""}`}
                style={{ opacity }}
                onClick={() => onSelect(n.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(n.id);
                  }
                }}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(n.id)}
                onBlur={() => setHovered(null)}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.kind === "article" ? 16 : 9}
                  fill="transparent"
                />
                {active && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.kind === "article" ? 18 : 11}
                    fill={isHovered ? "#e5f0ff" : "#e5e7eb"}
                    stroke={isHovered ? "#a9cbff" : "#b9bdc4"}
                    strokeWidth="1"
                  />
                )}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.kind === "article" ? 7 : n.placeholder ? 1.65 : 3.2}
                  fill={
                    isHovered && !active
                      ? "#4f95f5"
                      : active || (selected && connected)
                        ? "#73767d"
                      : COLORS[n.kind]
                  }
                  stroke={n.kind === "article" ? "#fff" : "none"}
                  strokeWidth="1.6"
                />
                {visibleLabel && (
                  <text
                    x={n.x}
                    y={
                      n.y +
                      (n.kind === "article" ? 20 : 13) /
                        (screenScale * camera.k)
                    }
                    textAnchor="middle"
                    className={
                      n.kind === "article" ? "hub-label" : "node-label"
                    }
                    style={{
                      fontSize:
                        (n.kind === "article" ? 12 : 11) /
                        (screenScale * camera.k),
                      strokeWidth: 3 / (screenScale * camera.k),
                    }}
                  >
                    {n.label.length > labelLimit
                      ? n.label.slice(0, labelLimit) + "…"
                      : n.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {hoverNode && (
        <div className="graph-tooltip">
          <span className={`type-dot ${hoverNode.kind}`} />
          <span>{hoverNode.label}</span>
          <small>
            {hoverNode.placeholder ? "형태 시연 노드" : TYPES[hoverNode.kind]}
          </small>
        </div>
      )}
      {!nodes.length && (
        <div className="graph-empty">검색 조건에 맞는 노드가 없습니다.</div>
      )}
      <div className="graph-bottom">
        <div className="legend">
          {Object.entries(TYPES).map(([key, label]) => (
            <span key={key}>
              <i style={{ background: COLORS[key] }} />
              {label}
            </span>
          ))}
        </div>
        <div className="graph-controls">
          <label>
            <input
              type="checkbox"
              checked={labels}
              onChange={(e) => setLabels(e.target.checked)}
            />
            상세 라벨
          </label>
          <button
            className="icon-button"
            onClick={() => zoom(0.8)}
            aria-label="축소"
          >
            <Minus size={15} />
          </button>
          <span>{Math.round(camera.k * 100)}%</span>
          <button
            className="icon-button"
            onClick={() => zoom(1.25)}
            aria-label="확대"
          >
            <Plus size={15} />
          </button>
          <button
            className="icon-button"
            onClick={focus}
            disabled={!selected}
            aria-label="선택 노드 확대"
          >
            <Focus size={17} />
          </button>
          <button
            className="icon-button"
            onClick={reset}
            aria-label="전체 맞춤"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
    </section>
  );
});
