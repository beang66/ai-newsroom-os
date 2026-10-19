import React, { useEffect, useRef, useState } from "react";
import { exportFiles, imageExtension } from "../api/editorial";
import ExportNotice from "./ExportNotice.jsx";
import Header from "./Header";
import {
  clampCrop, cropForRatio, maskContains, maskPath, moveMask, renderDerivative, renderMosaics, resizeCrop,
} from "../lib/imageEditor.js";

// 사진 편집 화면 — 화면(레이아웃·헤더·패널 모양)은 내 디자인을 유지하고, 편집 기능은 main 의 사진 편집기
// (components/photo/ImageEditor.jsx, v30 editImage 와 같은 방식)에서 가져왔다.
//  - 사진 위의 표시 범위: 모서리를 끌어 크기(선택한 비율 유지), 안쪽을 끌어 위치 이동
//  - 모자이크(가우시안 흐림): 브러시로 칠하기·지우개·흐림 영역 끌어 옮기기·Backspace/Delete 삭제·되돌리기
//  - 원본은 그대로 두고 편집본(url)을 따로 만든다. 원본/편집본 다운로드는 실제 파일로 내려받는다. 계산은 lib/imageEditor.js
const RATIOS = [["원본", 0], ["16:9", 16 / 9], ["4:3", 4 / 3], ["1:1", 1], ["3:2", 1.5]];
const LABELS = { 0: "자유 (원본)", [16 / 9]: "16:9 (보도)", [4 / 3]: "4:3 (보도)", 1: "1:1 (보도)", 1.5: "3:2 (보도)" };
const ratioLabel = (value) => LABELS[value] || "자유 (원본)";

// 사진 값의 비율: 편집기가 저장한 숫자(ratioValue)가 있으면 그것, 없으면 "16:9 (대표)" 같은 글자에서 읽는다
function initialRatio(photo) {
  if (typeof photo.ratioValue === "number") return photo.ratioValue;
  if (photo.crop) return photo.crop.w / photo.crop.h;
  const text = String(photo.ratio || "");
  if (text.includes("16:9")) return 16 / 9;
  if (text.includes("4:3")) return 4 / 3;
  if (text.includes("1:1")) return 1;
  if (text.includes("3:2")) return 1.5;
  return 0;
}

// 캔버스에서 편집본을 내보내려면 사진이 같은 출처(data/blob)여야 한다. 원격 주소는 내려받아 데이터 주소로 바꾼다.
async function readableSource(src) {
  if (!/^https?:/i.test(src || "")) return src;
  const blob = await (await fetch(src)).blob(); // api-boundary-allow: 코어가 아니라 사진의 공개 이미지 주소를 읽는다
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}


function Slider({ label, min, max, value, onChange, suffix = "" }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-600 font-medium whitespace-nowrap w-20">{label}</span>
      <input type="range" min={min} max={max} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900" />
      <span className="text-slate-700 font-mono w-8 text-right font-medium">{value}{suffix}</span>
    </div>
  );
}

const tab = (on) => `px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${on
  ? "bg-slate-950 text-white shadow-xs"
  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"}`;
const toolClass = (on) => `py-1.5 text-xs font-medium rounded-lg border transition cursor-pointer text-center ${on
  ? "bg-slate-950 text-white border-slate-950 shadow-xs"
  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`;

// 편집할 사진이 없으면 아무것도 그리지 않는다(Hook 은 안쪽 컴포넌트에서만 호출)
export default function PhotoEditorView(props) {
  return props.photo ? <PhotoEditorBody {...props} /> : null;
}

function PhotoEditorBody({ photo, onBack: onCancel, onApplyToArticle, onTrackDownload, onError, charCount = 0, currentArticleTitle, status }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const st = useRef(null); // 캔버스 조작 상태(그림 그릴 때마다 React 를 다시 그리지 않도록 ref 에 둔다)
  const [ready, setReady] = useState(false);
  const [exported, setExported] = useState(null); // 마지막 저장 위치(내 문서\AI Newsroom\내보내기\사진)
  const [ratio, setRatio] = useState(initialRatio(photo));
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
    readableSource(photo.original || photo.url).then((src) => {
      img.src = src;
      return img.decode();
    }).then(() => {
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
    onApplyToArticle({
      ...photo,
      original: photo.original || photo.url,
      url: derivative(),
      crop: s.crop,
      masks: s.masks,
      mosaicOpacity: 1 - transparency / 100,
      mosaicHardness: hardness,
      ratioValue: ratio,
      ratio: ratioLabel(ratio),
      caption,
      source,
    });
  };

  return (
    <div className="w-full min-h-screen flex flex-col font-sans select-none animate-in fade-in duration-200" data-testid="image-editor">
      <Header currentArticleTitle={currentArticleTitle} status={status} />

      <div className="w-full px-8 pt-5 pb-3 flex items-center gap-4">
        <button type="button" onClick={onCancel}
          className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-lg text-xs font-semibold text-slate-800 transition cursor-pointer shadow-2xs active:scale-95">
          작성으로 돌아가기
        </button>
        <h2 className="text-base md:text-lg font-bold text-slate-900 tracking-tight">사진 편집</h2>
      </div>

      <div className="flex-1 w-full px-8 py-2 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* [좌측]: 사진 + 표시 범위(모서리 ㄱ자 핸들) + 모자이크 */}
        <div className="lg:col-span-8 bg-[#F5F6F8] rounded-2xl p-6 md:p-10 flex items-center justify-center min-h-[560px] border border-black/[0.03] shadow-xs relative overflow-hidden">
          <div ref={stageRef} className="w-full h-[540px] flex items-center justify-center">
            <canvas
              ref={canvasRef}
              tabIndex={0}
              data-testid="crop-canvas"
              aria-label="사진 표시 범위. 모서리를 끌어 크기를 바꿀 수 있습니다."
              className="max-w-full max-h-full rounded-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-400 touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => { if (st.current) st.current.drag = null; paint(); }}
              onPointerLeave={onPointerLeave}
              onKeyDown={onKeyDown}
            />
          </div>
        </div>

        {/* [우측]: 조작 패널 */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-black/[0.05] p-6 shadow-xs space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-800 block">표시 비율</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {RATIOS.map(([label, r]) => (
                <button key={label} type="button" aria-pressed={ratio === r} onClick={() => chooseRatio(r)} className={tab(ratio === r)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-slate-800 block">모자이크</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button type="button" aria-pressed={tool === "paint"} onClick={() => chooseTool("paint")} className={toolClass(tool === "paint")}>모자이크</button>
              <button type="button" aria-pressed={tool === "erase"} onClick={() => chooseTool("erase")} className={toolClass(tool === "erase")}>지우개</button>
              <button type="button" disabled={!undoCount} onClick={undo}
                className="py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition cursor-pointer text-center disabled:opacity-40 disabled:cursor-default">되돌리기</button>
            </div>
            <p className="text-[11px] text-slate-400">모자이크를 켜고 가릴 부분을 칠해주세요. 칠한 흐림 영역은 끌어서 옮기고 Delete 로 지울 수 있습니다.</p>
            <div className="space-y-3 pt-1">
              <Slider label="브러시 크기" min={12} max={120} value={brush} onChange={setBrush} />
              <Slider label="투명도" min={0} max={100} value={transparency} onChange={setTransparency} suffix="%" />
              <Slider label="경계 선명도" min={0} max={100} value={hardness} onChange={setHardness} suffix="%" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-800 block">사진 설명</label>
            <textarea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-slate-800 transition resize-none font-medium" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-800 block">사진 출처</label>
            <input type="text" value={source} onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-slate-800 transition font-medium" />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" disabled={!ready}
              onClick={safely(async () => { await track(); const o = photo.original || photo.url; setExported(await exportFiles("photos", [{ data: o, ext: imageExtension(o) }], { label: "원본사진" })); })}
              className="py-2 px-3 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer text-center disabled:opacity-50">원본 저장</button>
            <button type="button" disabled={!ready}
              onClick={safely(async () => { await track(); setExported(await exportFiles("photos", [{ data: derivative(), ext: "jpg" }], { label: "편집사진" })); })}
              className="py-2 px-3 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer text-center disabled:opacity-50">편집본 저장</button>
          </div>
          <ExportNotice result={exported} kind="photos" className="text-xs text-slate-600" />

          <button type="button" disabled={!ready} onClick={apply} data-testid="image-apply"
            className="w-full py-3 bg-[#23211F] hover:bg-black text-white text-xs md:text-sm font-bold rounded-xl transition cursor-pointer active:scale-95 shadow-sm disabled:opacity-50">
            본문에 넣기
          </button>
        </div>
      </div>

      <div className="w-full px-8 py-3.5 flex items-center justify-between text-xs text-slate-400 mt-auto border-t border-black/[0.03]">
        <span>자동 저장됨</span>
        <span>본문 {charCount.toLocaleString()}자</span>
      </div>
    </div>
  );
}
