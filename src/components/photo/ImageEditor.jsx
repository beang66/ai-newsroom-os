// 사진 편집 화면 — 기존 기사 작성 앱 v30(assets/article-workspace.js editImage)의 조작 방식을 그대로 옮겼다.
//  - 사진 위의 표시 범위: 모서리를 끌어 크기(선택한 비율 유지), 안쪽을 끌어 위치 이동
//  - 모자이크(가우시안 흐림): 브러시로 칠하기·지우개·흐림 영역 끌어 옮기기·Backspace/Delete 삭제·되돌리기
//  - 원본은 그대로 두고 편집본(url)을 따로 만든다. 계산은 lib/imageEditor.js(v30 과 같음)
import { exportFiles, imageExtension } from "../../api/editorial";
import ExportNotice from "../ExportNotice.jsx";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  clampCrop, cropForRatio, maskContains, maskPath, moveMask, renderDerivative, renderMosaics, resizeCrop,
} from "../../lib/imageEditor.js";

const RATIOS = [["원본", 0], ["16:9", 16 / 9], ["4:3", 4 / 3], ["1:1", 1], ["3:2", 1.5]];


function Slider({ label, min, max, value, onChange, suffix = "" }) {
  return (
    <label className="grid grid-cols-[5rem_minmax(0,1fr)_2.5rem] items-center gap-2 pr-1 text-xs font-bold text-slate-700">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="accent-slate-900" />
      <output className="text-right tabular-nums text-slate-500">{value}{suffix}</output>
    </label>
  );
}

const chip = (on) =>
  `px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
    on ? "bg-[#23211F] text-white border-[#23211F]" : "bg-white text-[#23211F] border-[#DDD6CB] hover:bg-[#F5F2ED]"}`;

export default function ImageEditor({ photo, onCancel, onApply, onTrackDownload, onError }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const st = useRef(null); // 캔버스 조작 상태(그림 그릴 때마다 React 를 다시 그리지 않도록 ref 에 둔다)
  const [ready, setReady] = useState(false);
  const [exported, setExported] = useState(null); // 마지막 저장 위치(내 문서\AI Newsroom\내보내기\사진)
  const [ratio, setRatio] = useState(photo.ratio ?? (photo.crop ? photo.crop.w / photo.crop.h : 0));
  const [tool, setTool] = useState(null); // null | "paint" | "erase"
  const [brush, setBrush] = useState(48);
  const [transparency, setTransparency] = useState(Math.round((1 - (photo.mosaicOpacity ?? 1)) * 100));
  const [hardness, setHardness] = useState(photo.mosaicHardness ?? 20);
  const [undoCount, setUndoCount] = useState(0);
  const [caption, setCaption] = useState(photo.caption || "");
  const [source, setSource] = useState(photo.source || "");
  const view = useRef({ tool, brush, opacity: 1 - transparency / 100, hardness });
  view.current = { tool, brush, opacity: 1 - transparency / 100, hardness };

  // ── 사진 읽기 + 캔버스 준비 ──
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.src = photo.original || photo.url;
    img.decode().then(() => {
      if (!alive) return;
      st.current = {
        img,
        scale: 1,
        crop: photo.crop ? clampCrop({ ...photo.crop }, img.width, img.height) : cropForRatio(img.width, img.height, 0),
        masks: structuredClone(photo.masks || []),
        history: [],
        active: -1,
        hover: -1,
        drag: null,
        brushHover: null,
      };
      setReady(true);
    }).catch(() => onError?.("사진을 열지 못했어요. 다른 사진을 선택해 주세요."));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 그리기(v30 paint) ──
  const paint = () => {
    const s = st.current, c = canvasRef.current;
    if (!s || !c) return;
    const g = c.getContext("2d"), { img, scale, crop, masks } = s;
    const { tool: t, brush: b, opacity, hardness: h } = view.current;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    renderMosaics(g, img, masks, scale, 0, 0, opacity, h);
    g.fillStyle = "#0008";
    g.beginPath();
    g.rect(0, 0, c.width, c.height);
    g.rect(crop.x * scale, crop.y * scale, crop.w * scale, crop.h * scale);
    g.fill("evenodd");
    g.strokeStyle = "#fff";
    g.lineWidth = 2;
    g.strokeRect(crop.x * scale, crop.y * scale, crop.w * scale, crop.h * scale);
    // 크기 조절 모서리: 표시 범위 안쪽으로 꺾인 굵은 ㄱ자(흰 선 + 어두운 테두리)라 어떤 사진 위에서도 잘 보인다
    const arm = Math.max(14, Math.min(28, (Math.min(crop.w, crop.h) * scale) / 4));
    for (const [name, p] of Object.entries(corners(crop))) {
      const x = p.x * scale, y = p.y * scale;
      const dx = name.includes("w") ? 1 : -1, dy = name.includes("n") ? 1 : -1;
      g.beginPath();
      g.moveTo(x + dx * arm, y);
      g.lineTo(x, y);
      g.lineTo(x, y + dy * arm);
      g.lineCap = "square";
      g.strokeStyle = "#1a1a1a";
      g.lineWidth = 8;
      g.stroke();
      g.strokeStyle = "#fff";
      g.lineWidth = 5;
      g.stroke();
    }
    const selected = s.active >= 0 ? s.active : s.hover;
    if (!t && selected >= 0 && masks[selected]) {
      // 붓 자국 하나하나가 아니라 합쳐진 흐림 영역의 윤곽을 그린다
      const alpha = document.createElement("canvas");
      alpha.width = c.width;
      alpha.height = c.height;
      const ag = alpha.getContext("2d");
      ag.fillStyle = "#fff";
      ag.fill(maskPath(masks[selected], scale));
      ag.globalCompositeOperation = "destination-out";
      for (const e of masks[selected].erasures || []) ag.fill(maskPath(e, scale));
      const halo = document.createElement("canvas");
      halo.width = c.width;
      halo.height = c.height;
      const hg = halo.getContext("2d");
      hg.shadowColor = "#fff";
      hg.shadowBlur = 5;
      hg.drawImage(alpha, 0, 0);
      hg.shadowBlur = 0;
      hg.globalCompositeOperation = "destination-out";
      hg.drawImage(alpha, 0, 0);
      g.drawImage(halo, 0, 0);
    }
    if ((t === "paint" || t === "erase") && s.brushHover) {
      g.beginPath();
      g.arc(s.brushHover.x * scale, s.brushHover.y * scale, b / 2, 0, Math.PI * 2);
      g.strokeStyle = "#fff";
      g.lineWidth = 2;
      g.stroke();
      g.strokeStyle = "#222";
      g.lineWidth = 1;
      g.stroke();
    }
  };

  // 화면(무대) 크기에 맞춰 사진을 크게 — 원본보다 키우지는 않는다
  useEffect(() => {
    if (!ready) return undefined;
    const fit = () => {
      const s = st.current, stage = stageRef.current, c = canvasRef.current;
      if (!s || !stage || !c) return;
      const scale = Math.min(stage.clientWidth / s.img.width, stage.clientHeight / s.img.height, 1);
      s.scale = scale;
      c.width = Math.max(1, Math.round(s.img.width * scale));
      c.height = Math.max(1, Math.round(s.img.height * scale));
      paint();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(stageRef.current);
    fit();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(paint, [tool, brush, transparency, hardness, ratio]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 포인터 조작(v30 onpointerdown/move/up) ──
  const point = (e) => {
    const s = st.current, r = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(s.img.width, ((e.clientX - r.left) * s.img.width) / r.width)),
      y: Math.max(0, Math.min(s.img.height, ((e.clientY - r.top) * s.img.height) / r.height)),
    };
  };
  const corners = (r) => ({ nw: { x: r.x, y: r.y }, ne: { x: r.x + r.w, y: r.y }, sw: { x: r.x, y: r.y + r.h }, se: { x: r.x + r.w, y: r.y + r.h } });
  const hitHandle = (r, p) => Object.entries(corners(r)).find(([, a]) =>
    Math.abs(a.x - p.x) < 18 / st.current.scale && Math.abs(a.y - p.y) < 18 / st.current.scale)?.[0]; // 모서리 주변 18px 를 잡을 수 있다
  const inside = (r, p) => p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;
  const hitMask = (p) => {
    const { masks } = st.current;
    for (let i = masks.length - 1; i >= 0; i--) if (maskContains(masks[i], p)) return i;
    return -1;
  };
  const pushHistory = () => {
    st.current.history.push(structuredClone(st.current.masks));
    setUndoCount(st.current.history.length);
  };
  const cursor = (p) => {
    const c = canvasRef.current, s = st.current, t = view.current.tool;
    if (t) return void (c.style.cursor = "crosshair");
    if (hitMask(p) >= 0) return void (c.style.cursor = "grab");
    const h = hitHandle(s.crop, p);
    c.style.cursor = h ? (h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize") : inside(s.crop, p) ? "grab" : "default";
  };

  const onPointerDown = (e) => {
    const s = st.current, c = canvasRef.current;
    if (!s) return;
    c.focus();
    c.setPointerCapture(e.pointerId);
    const p = point(e), t = view.current.tool;
    if (t === "paint" || t === "erase") {
      const stroke = { type: "brush", diameter: view.current.brush / s.scale, points: [p] };
      if (t === "paint") {
        pushHistory();
        s.masks.push(stroke);
        s.drag = { kind: "brush", stroke };
      } else if (s.masks.length) {
        pushHistory();
        s.masks.forEach((m) => (m.erasures ||= []).push(stroke));
        s.drag = { kind: "erase", stroke };
      }
      s.active = -1;
    } else if (hitMask(p) >= 0) {
      s.active = hitMask(p);
      pushHistory();
      s.drag = { kind: "shape-move", index: s.active, start: p, mask: structuredClone(s.masks[s.active]) };
    } else {
      s.active = -1;
      const h = hitHandle(s.crop, p);
      s.drag = h ? { kind: "crop-resize", handle: h, rect: { ...s.crop } }
        : inside(s.crop, p) ? { kind: "crop-move", start: p, rect: { ...s.crop } } : null;
    }
    paint();
  };
  const onPointerMove = (e) => {
    const s = st.current;
    if (!s) return;
    const p = point(e), t = view.current.tool;
    s.brushHover = p;
    const d = s.drag;
    if (!d) {
      const next = hitMask(p);
      if (t || next !== s.hover) {
        s.hover = next;
        paint();
      }
      cursor(p);
      return;
    }
    if (d.kind === "brush" || d.kind === "erase") d.stroke.points.push(p);
    else if (d.kind === "shape-move") {
      // 옮기면 원래 자리는 원본으로 돌아오고, 옮긴 자리의 사진에 흐림이 적용된다(흐림은 매번 원본에서 다시 계산)
      s.masks[d.index] = moveMask(d.mask, p.x - d.start.x, p.y - d.start.y, s.img.width, s.img.height);
      canvasRef.current.style.cursor = "grabbing";
    } else if (d.kind === "crop-resize") s.crop = resizeCrop(d.rect, d.handle, p, s.img.width, s.img.height, ratio);
    else if (d.kind === "crop-move")
      s.crop = clampCrop({ ...d.rect, x: d.rect.x + p.x - d.start.x, y: d.rect.y + p.y - d.start.y }, s.img.width, s.img.height);
    paint();
  };
  const onPointerUp = (e) => {
    const s = st.current;
    if (!s?.drag) return;
    const p = point(e);
    const finished = s.drag.kind === "brush" || s.drag.kind === "erase";
    if (finished) s.drag.stroke.points.push(p);
    s.drag = null;
    if (finished) setTool(null); // v30: 한 번 칠하면 도구가 풀린다
    paint();
    cursor(p);
  };
  const onPointerLeave = () => {
    const s = st.current;
    if (!s) return;
    s.brushHover = null;
    if (!s.drag) {
      s.hover = -1;
      paint();
    }
  };
  const onKeyDown = (e) => {
    const s = st.current;
    if (!s || (e.key !== "Delete" && e.key !== "Backspace")) return;
    e.preventDefault();
    if (s.active >= 0 && s.active < s.masks.length) {
      pushHistory();
      s.masks.splice(s.active, 1);
      s.active = -1;
      s.hover = -1;
      paint();
    }
  };
  const undo = () => {
    const s = st.current;
    if (!s?.history.length) return;
    s.masks = s.history.pop();
    s.active = -1;
    setUndoCount(s.history.length);
    paint();
  };
  const chooseTool = (next) => {
    if (st.current) st.current.active = -1;
    setTool((cur) => (cur === next ? null : next));
  };
  const chooseRatio = (r) => {
    const s = st.current;
    setRatio(r);
    if (s) s.crop = cropForRatio(s.img.width, s.img.height, r);
  };

  const derivative = () => {
    const s = st.current;
    return renderDerivative(s.img, s.crop, s.masks, 1600, 1 - transparency / 100, hardness);
  };
  const track = async () => {
    if (photo.unsplashId) await onTrackDownload?.(photo.unsplashId);
  };
  const safely = (fn) => async () => {
    try {
      await fn();
    } catch (e) {
      onError?.(e.message || String(e));
    }
  };
  const apply = () => {
    const s = st.current;
    onApply({
      ...photo,
      original: photo.original || photo.url,
      url: derivative(),
      crop: s.crop,
      masks: s.masks,
      mosaicOpacity: 1 - transparency / 100,
      mosaicHardness: hardness,
      ratio,
      caption,
      source,
    });
  };

  // 팀 레이아웃의 transform 이 있는 조상 아래에서는 position: fixed 가 화면이 아니라 그 조상 기준이 되므로 body 에 띄운다
  return createPortal(
    <div className="fixed inset-0 z-50 bg-[#F7F5F1]/98 backdrop-blur-sm flex flex-col" data-testid="image-editor" role="dialog" aria-label="사진 편집">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[#DDD6CB] bg-white">
        <button type="button" onClick={onCancel} className={chip(false)}>작성으로 돌아가기</button>
        <h2 className="text-sm font-black text-slate-900">사진 편집</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="h-full min-h-[560px] grid grid-cols-[minmax(0,1fr)_300px] gap-5 p-5">
          <div ref={stageRef} className="min-h-0 min-w-0 flex items-center justify-center">
            <canvas
              ref={canvasRef}
              tabIndex={0}
              data-testid="crop-canvas"
              aria-label="사진 표시 범위. 모서리를 끌어 크기를 바꿀 수 있습니다."
              className="max-w-full max-h-full rounded-lg shadow-md outline-none focus-visible:ring-2 focus-visible:ring-teal-500 touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => { if (st.current) st.current.drag = null; paint(); }}
              onPointerLeave={onPointerLeave}
              onKeyDown={onKeyDown}
            />
          </div>
          <div className="flex flex-col gap-3 bg-white rounded-2xl border border-[#DDD6CB] p-4 overflow-auto">
            <div className="space-y-1.5">
              <div className="text-xs font-black text-slate-900">표시 비율</div>
              <div className="flex flex-wrap gap-1.5">
                {RATIOS.map(([label, r]) => (
                  <button key={label} type="button" aria-pressed={ratio === r} onClick={() => chooseRatio(r)} className={chip(ratio === r)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-black text-slate-900">모자이크</div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={tool === "paint"} onClick={() => chooseTool("paint")} className={chip(tool === "paint")}>모자이크</button>
                <button type="button" aria-pressed={tool === "erase"} onClick={() => chooseTool("erase")} className={chip(tool === "erase")}>지우개</button>
                <button type="button" disabled={!undoCount} onClick={undo} className={`${chip(false)} disabled:opacity-40 disabled:cursor-default`}>되돌리기</button>
              </div>
              <Slider label="브러시 크기" min={12} max={120} value={brush} onChange={setBrush} />
              <Slider label="투명도" min={0} max={100} value={transparency} onChange={setTransparency} suffix="%" />
              <Slider label="경계 선명도" min={0} max={100} value={hardness} onChange={setHardness} suffix="%" />
            </div>
            <label className="space-y-1 text-xs font-black text-slate-900">
              <span>사진 설명</span>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3}
                className="w-full rounded-xl border border-[#DDD6CB] p-2 text-xs font-medium text-slate-800 outline-none focus:border-slate-800 resize-none" />
            </label>
            <label className="space-y-1 text-xs font-black text-slate-900">
              <span>사진 출처</span>
              <input value={source} onChange={(e) => setSource(e.target.value)}
                className="w-full rounded-xl border border-[#DDD6CB] px-2 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-slate-800" />
            </label>
            <div className="mt-auto grid grid-cols-2 gap-1.5 pt-1">
              <button type="button" disabled={!ready} className={chip(false)}
                onClick={safely(async () => { await track(); const o = photo.original || photo.url; setExported(await exportFiles("photos", [{ data: o, ext: imageExtension(o) }], { label: "원본사진" })); })}>원본 저장</button>
              <button type="button" disabled={!ready} className={chip(false)}
                onClick={safely(async () => { await track(); setExported(await exportFiles("photos", [{ data: derivative(), ext: "jpg" }], { label: "편집사진" })); })}>편집본 저장</button>
              <button type="button" disabled={!ready} onClick={apply} data-testid="image-apply"
                className="col-span-2 px-4 py-2.5 rounded-full text-sm font-black bg-[#23211F] text-white hover:bg-[#38332E] cursor-pointer disabled:opacity-50">본문에 넣기</button>
            </div>
            <ExportNotice result={exported} kind="photos" className="text-[11px] text-slate-600" />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
