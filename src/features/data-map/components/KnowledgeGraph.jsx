import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Focus, Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { categoryLabel } from "../constants.js";
import CategoryGradients from "./CategoryGradients.jsx";
import { MAP_CENTER } from "../domain/layout.js";
// 화면에 그리는 범위 — 원(점선 테두리)과 라벨 여백만 남기고 잘라 원이 보드를 최대한 채우게 한다
const VIEW = { x: 80, y: 60, width: 940, height: 790 };
// 연결이 가장 많은 문서(허브)만 라벨을 늘 보여 묶음의 중심을 읽게 한다 — 나머지는 선택·호버·라벨 모두 보기로
const HUB_LABELS = 6;

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
    drag = useRef(null),
    physicsRef = useRef(new Map()),
    rafRef = useRef(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, k: 1 });
  const [screenScale, setScreenScale] = useState(1);
  const [hovered, setHovered] = useState(null),
    [labels, setLabels] = useState(false),
    [draggingId, setDraggingId] = useState(null),
    [, setTick] = useState(0);

  // 탄성 물리 루프: 드래그 중인 노드와 연결된 이웃 노드들이 고무줄(용수철)처럼 끌려오며 출렁이게 한다
  const startPhysicsLoop = useCallback(() => {
    if (rafRef.current) return;
    const step = () => {
      let moving = false;
      const stateMap = physicsRef.current;
      for (const st of stateMap.values()) {
        if (st.pinned) {
          st.vx = (st.targetX - st.x) * 0.7;
          st.vy = (st.targetY - st.y) * 0.7;
          st.x = st.targetX;
          st.y = st.targetY;
          moving = true;
          continue;
        }
        const dx = st.targetX - st.x;
        const dy = st.targetY - st.y;
        const stiffness = st.springK || 0.12;
        const damping = st.damping || 0.82;
        st.vx = (st.vx + dx * stiffness) * damping;
        st.vy = (st.vy + dy * stiffness) * damping;
        st.x += st.vx;
        st.y += st.vy;
        if (Math.abs(dx) > 0.06 || Math.abs(dy) > 0.06 || Math.abs(st.vx) > 0.06 || Math.abs(st.vy) > 0.06) {
          moving = true;
        } else {
          st.x = st.targetX;
          st.y = st.targetY;
          st.vx = 0;
          st.vy = 0;
        }
      }
      setTick((t) => (t + 1) % 1000000);
      if (moving) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  // 노드 목록이 바뀌면 물리 상태의 기준 좌표를 동기화한다
  useEffect(() => {
    const map = physicsRef.current;
    const validIds = new Set(nodes.map((n) => n.id));
    for (const key of map.keys()) {
      if (!validIds.has(key)) map.delete(key);
    }
    for (const n of nodes) {
      const existing = map.get(n.id);
      if (!existing) {
        map.set(n.id, {
          x: n.x,
          y: n.y,
          vx: 0,
          vy: 0,
          baseX: n.x,
          baseY: n.y,
          targetX: n.x,
          targetY: n.y,
          springK: 0.12,
          damping: 0.82,
          pinned: false,
        });
      } else if (!existing.customMoved) {
        existing.baseX = n.x;
        existing.baseY = n.y;
        existing.targetX = n.x;
        existing.targetY = n.y;
      }
    }
    setTick((t) => t + 1);
  }, [nodes]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // 노드의 현재 물리 좌표를 조회한다
  const getPos = useCallback((nodeObj) => {
    if (!nodeObj) return { x: MAP_CENTER.x, y: MAP_CENTER.y };
    const st = physicsRef.current.get(nodeObj.id);
    return st ? { x: st.x, y: st.y } : { x: nodeObj.x, y: nodeObj.y };
  }, []);

  const allowed = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges = useMemo(
    () =>
      graph.edges.filter((e) => allowed.has(e.source) && allowed.has(e.target)),
    [graph.edges, allowed],
  );
  // 관계망 원 둘레의 점선 테두리(장식)
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

  const reset = () => {
    setCamera({ x: 0, y: 0, k: 1 });
    for (const n of nodes) {
      const st = physicsRef.current.get(n.id);
      if (st) {
        st.baseX = n.x;
        st.baseY = n.y;
        st.targetX = n.x;
        st.targetY = n.y;
        st.customMoved = false;
        st.pinned = false;
      }
    }
    startPhysicsLoop();
  };

  const zoom = (factor, cx = MAP_CENTER.x, cy = MAP_CENTER.y) =>
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
          Math.min(el.clientWidth / VIEW.width, el.clientHeight / VIEW.height),
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
      const pos = getPos(selected);
      setCamera({
        k: 2.05,
        x: MAP_CENTER.x - pos.x * 2.05,
        y: MAP_CENTER.y - pos.y * 2.05,
      });
    }
  };
  const hoverNode = hovered && index.byId.get(hovered);
  const degree = (id) => index.adjacent.get(id)?.size || 0;
  const hubs = useMemo(
    () => new Set(nodes.filter((n) => !n.placeholder && (index.adjacent.get(n.id)?.size || 0) >= 3)
      .sort((a, b) => (index.adjacent.get(b.id)?.size || 0) - (index.adjacent.get(a.id)?.size || 0))
      .slice(0, HUB_LABELS).map((n) => n.id)),
    [nodes, index],
  );

  // SVG 화면 좌표를 캔버스 좌표로 변환한다
  const toWorldPoint = (clientX, clientY) => {
    const p = new DOMPoint(clientX, clientY).matrixTransform(
      svg.current.getScreenCTM().inverse(),
    );
    return {
      rawX: p.x,
      rawY: p.y,
      x: (p.x - camera.x) / camera.k,
      y: (p.y - camera.y) / camera.k,
    };
  };

  return (
    <section className="graph-panel" aria-label="취재 자료 관계망">
      <div className="graph-heading">
        <div className="graph-title-row">
          <h2>{selected ? "선택한 자료의 연결" : "관계망"}</h2>
          <p>
            {selected
              ? `직접 연결 ${Math.max(0, context.direct.size - 1)}개 · 한 단계 건너 ${context.indirect.size}개`
              : `노드 ${nodes.length}개 · 연결 ${edges.length}개`}
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
        className={`network-svg ${draggingId ? "is-node-dragging" : ""}`}
        viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
        aria-label="기사 중심 관계망. 노드는 목록표에서도 탐색할 수 있습니다."
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const nodeEl = e.target.closest("[data-node]");
          const pt = toWorldPoint(e.clientX, e.clientY);
          if (nodeEl) {
            const nodeId = nodeEl.getAttribute("data-node");
            const st = physicsRef.current.get(nodeId);
            if (!st) return;
            const directIds = new Set(index.adjacent.get(nodeId) || []);
            const secondIds = new Set();
            for (const dId of directIds) {
              for (const nextId of index.adjacent.get(dId) || []) {
                if (nextId !== nodeId && !directIds.has(nextId)) secondIds.add(nextId);
              }
            }
            drag.current = {
              mode: "node",
              nodeId,
              startWorldX: pt.x,
              startWorldY: pt.y,
              originX: st.x,
              originY: st.y,
              directIds,
              secondIds,
              moved: false,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
          }
          drag.current = { mode: "pan", x: pt.rawX, y: pt.rawY, camera, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const pt = toWorldPoint(e.clientX, e.clientY);
          if (drag.current.mode === "node") {
            const { nodeId, startWorldX, startWorldY, originX, originY, directIds, secondIds } = drag.current;
            const dx = pt.x - startWorldX;
            const dy = pt.y - startWorldY;
            if (!drag.current.moved && Math.hypot(dx, dy) > 2.5) {
              drag.current.moved = true;
              setDraggingId(nodeId);
              onSelect(nodeId);
              const st = physicsRef.current.get(nodeId);
              if (st) st.pinned = true;
            }
            if (drag.current.moved) {
              const st = physicsRef.current.get(nodeId);
              if (st) {
                st.targetX = originX + dx;
                st.targetY = originY + dy;
                st.customMoved = true;
              }
              // 연결된 1차·2차 이웃 노드들이 고무줄(용수철)에 묶인 것처럼 탄성 있게 끌려오게 한다
              for (const nId of directIds) {
                const nSt = physicsRef.current.get(nId);
                if (nSt) {
                  nSt.springK = 0.11;
                  nSt.damping = 0.84;
                  nSt.targetX = nSt.baseX + dx * 0.42;
                  nSt.targetY = nSt.baseY + dy * 0.42;
                }
              }
              for (const nId of secondIds) {
                const nSt = physicsRef.current.get(nId);
                if (nSt) {
                  nSt.springK = 0.08;
                  nSt.damping = 0.86;
                  nSt.targetX = nSt.baseX + dx * 0.16;
                  nSt.targetY = nSt.baseY + dy * 0.16;
                }
              }
              startPhysicsLoop();
            }
            return;
          }
          const dx = pt.rawX - drag.current.x,
            dy = pt.rawY - drag.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
          setCamera({
            ...drag.current.camera,
            x: drag.current.camera.x + dx,
            y: drag.current.camera.y + dy,
          });
        }}
        onPointerUp={() => {
          if (!drag.current) return;
          if (drag.current.mode === "node") {
            const { nodeId, directIds, secondIds, moved } = drag.current;
            const st = physicsRef.current.get(nodeId);
            if (st) {
              st.pinned = false;
              st.baseX = st.targetX;
              st.baseY = st.targetY;
            }
            // 마우스를 놓으면 끌려왔던 이웃 노드들이 탄성 바운스와 함께 자연스럽게 자리 잡는다
            for (const nId of directIds) {
              const nSt = physicsRef.current.get(nId);
              if (nSt) {
                nSt.springK = 0.13;
                nSt.damping = 0.82;
                nSt.baseX = nSt.baseX + (nSt.targetX - nSt.baseX) * 0.35;
                nSt.baseY = nSt.baseY + (nSt.targetY - nSt.baseY) * 0.35;
                nSt.targetX = nSt.baseX;
                nSt.targetY = nSt.baseY;
              }
            }
            for (const nId of secondIds) {
              const nSt = physicsRef.current.get(nId);
              if (nSt) {
                nSt.springK = 0.11;
                nSt.damping = 0.84;
                nSt.targetX = nSt.baseX;
                nSt.targetY = nSt.baseY;
              }
            }
            setDraggingId(null);
            startPhysicsLoop();
            if (!moved) {
              onSelect(nodeId);
            }
            drag.current = null;
            return;
          }
          if (drag.current && !drag.current.moved) onSelect(null);
          drag.current = null;
        }}
        onPointerCancel={() => {
          if (drag.current?.mode === "node") {
            const st = physicsRef.current.get(drag.current.nodeId);
            if (st) st.pinned = false;
            setDraggingId(null);
            startPhysicsLoop();
          }
          drag.current = null;
        }}
      >
        <CategoryGradients />
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
          <g aria-hidden="true" className="graph-halo">
            {haloDots.map((dot, i) => (
              <circle key={i} cx={dot.x} cy={dot.y} r={dot.r} />
            ))}
          </g>
          <g aria-hidden="true">
            {edges.map((e) => {
              const a = getPos(index.byId.get(e.source)),
                b = getPos(index.byId.get(e.target));
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
                  className={`graph-edge ${hoveredEdge || strong ? "is-strong" : ""}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  strokeWidth={strong || hoveredEdge ? 1.4 : 0.8}
                  strokeDasharray={e.relation === "missing-link" ? "4 3" : undefined}
                  opacity={
                    hovered && hovered !== selected?.id
                      ? hoveredEdge ? 0.78 : 0.035
                      : selected
                        ? strong ? 0.72 : within ? 0.25 : 0.045
                        : 0.32
                  }
                />
              );
            })}
          </g>
          {nodes.map((n) => {
            const pos = getPos(n);
            const active = n.id === selected?.id,
              connected = context.direct.has(n.id),
              indirect = context.indirect.has(n.id);
            const labelLimit = screenScale < 0.45 ? 11 : 23;
            const article = n.category === "article";
            const hub = hubs.has(n.id);
            const visibleLabel =
              (hub && !selected && screenScale >= 0.4) || // 작게 그려질 때는 허브 라벨도 겹치므로 숨긴다
              active ||
              hovered === n.id ||
              (selected && connected && !n.placeholder) ||
              labels;
            const isHovered = hovered === n.id;
            const opacity =
              hovered && hovered !== selected?.id
                ? isHovered ? 1 : active ? 0.45 : 0.18
                : !selected || active || connected ? 1 : indirect ? 0.32 : 0.14;
            const size = article ? 12 : hub ? 6.5 : 5; // 기사만 큰 원
            const scale = screenScale * camera.k;
            return (
              <g
                key={n.id}
                data-node={n.id}
                pointerEvents="bounding-box"
                role="button"
                tabIndex={0}
                aria-label={`${categoryLabel(n)}: ${n.label}`}
                aria-pressed={active}
                className={`graph-node ${active ? "is-selected" : ""} ${draggingId === n.id ? "is-dragging" : ""} ${article || hub ? "is-hub" : ""}`}
                style={{ opacity }}
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
                <circle cx={pos.x} cy={pos.y} r={size + 9} fill="transparent" />
                {(active || isHovered) && (
                  <circle className="node-ring" cx={pos.x} cy={pos.y} r={size + 7} />
                )}
                {/* ── 중앙 글로우 포인트 (Diffused Glow): 부드러운 파스텔 빛 번짐 ── */}
                <circle
                  className="node-diffused-glow"
                  cx={pos.x}
                  cy={pos.y}
                  r={size * 2.3}
                  fill={`url(#glow-radial-${n.category || "verify"})`}
                  filter="url(#diffused-glow-filter)"
                  pointerEvents="none"
                />
                {/* 관계망 안의 노드는 분류와 관계없이 모두 원형(기사는 큰 원) — 분류별 색은 data-map.css 의 mark-* */}
                <circle className={`mark-${n.category}`} cx={pos.x} cy={pos.y} r={size} />
                {visibleLabel && (
                  <text
                    x={pos.x}
                    y={pos.y + (size + 6) + 10 / scale}
                    textAnchor="middle"
                    className={article || hub ? "hub-label" : "node-label"}
                    style={{
                      fontSize: (article || hub ? 12.5 : 11) / scale,
                      strokeWidth: 3.5 / scale,
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
          <span>{hoverNode.label}</span>
          <small>
            {categoryLabel(hoverNode)} · 연결 {degree(hoverNode.id)}개
          </small>
        </div>
      )}
      {!nodes.length && (
        <div className="graph-empty">검색 조건에 맞는 노드가 없습니다.</div>
      )}
      <div className="graph-bottom">
        <div className="graph-controls">
          <label>
            <input
              type="checkbox"
              checked={labels}
              onChange={(e) => setLabels(e.target.checked)}
            />
            라벨 모두 보기
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
