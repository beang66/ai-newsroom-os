import React, { useState, useRef, useEffect } from "react";
import Header from "./Header";

export default function PhotoEditorView({
  photo,
  onBack,
  onApplyToArticle,
  charCount = 1149,
  currentArticleTitle,
  status
}) {
  if (!photo) return null;

  // 1. 비율 옵션: 원본, 16:9, 4:3, 1:1, 3:2
  const [selectedRatio, setSelectedRatio] = useState(
    photo.ratio?.includes("16:9") ? "16:9" :
      photo.ratio?.includes("4:3") ? "4:3" :
        photo.ratio?.includes("1:1") ? "1:1" :
          photo.ratio?.includes("3:2") ? "3:2" : "원본"
  );

  // 2. 모자이크 도구 모드: 'none' | 'mosaic' | 'eraser'
  const [mosaicMode, setMosaicMode] = useState("none");
  const [brushSize, setBrushSize] = useState(48);
  const [opacity, setOpacity] = useState(0); // 투명도
  const [edgeSharpness, setEdgeSharpness] = useState(20); // 경계 선명도

  // 3. 사진 설명 및 출처
  const [caption, setCaption] = useState(photo.caption || "안녕하세요.");
  const [source, setSource] = useState(photo.source || "Igor Omilaev / Unsplash");

  // 4. 모자이크 캔버스 참조 및 드로잉 상태
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const historyRef = useRef([]);

  // 이미지 비율 CSS 계산
  const getAspectRatioClass = () => {
    switch (selectedRatio) {
      case "16:9": return "aspect-video";
      case "4:3": return "aspect-4/3";
      case "1:1": return "aspect-square";
      case "3:2": return "aspect-[3/2]";
      default: return "aspect-auto max-h-[580px]";
    }
  };

  // 모자이크 적용/지우기 로직
  const drawMosaic = (ctx, x, y, size) => {
    const half = size / 2;
    const pixelSize = 10;
    const startX = Math.floor((x - half) / pixelSize) * pixelSize;
    const startY = Math.floor((y - half) / pixelSize) * pixelSize;
    const w = Math.ceil(size / pixelSize) * pixelSize;
    const h = Math.ceil(size / pixelSize) * pixelSize;

    // 모자이크 블록 그리기
    const colors = ["#4A5568", "#2D3748", "#718096", "#A0AEC0", "#1A202C"];
    for (let px = startX; px < startX + w; px += pixelSize) {
      for (let py = startY; py < startY + h; py += pixelSize) {
        const dist = Math.hypot(px + pixelSize / 2 - x, py + pixelSize / 2 - y);
        if (dist <= half) {
          const color = colors[(Math.floor(px / pixelSize) + Math.floor(py / pixelSize)) % colors.length];
          ctx.fillStyle = color;
          ctx.globalAlpha = 1 - opacity / 100;
          ctx.fillRect(px, py, pixelSize, pixelSize);
        }
      }
    }
  };

  const handleMouseDown = (e) => {
    if (mosaicMode === "none") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");

    // 히스토리 저장
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (historyRef.current.length > 10) historyRef.current.shift();

    setIsDrawing(true);
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    if (mosaicMode === "mosaic") {
      drawMosaic(ctx, x, y, brushSize);
    } else if (mosaicMode === "eraser") {
      ctx.clearRect(x - brushSize / 2, y - brushSize / 2, brushSize, brushSize);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || mosaicMode === "none") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    if (mosaicMode === "mosaic") {
      drawMosaic(ctx, x, y, brushSize);
    } else if (mosaicMode === "eraser") {
      ctx.clearRect(x - brushSize / 2, y - brushSize / 2, brushSize, brushSize);
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas || historyRef.current.length === 0) return;
    const ctx = canvas.getContext("2d");
    const prev = historyRef.current.pop();
    if (prev) {
      ctx.putImageData(prev, 0, 0);
    }
  };

  // 원본 다운로드
  const handleDownloadOriginal = () => {
    const link = document.createElement("a");
    link.href = photo.url;
    link.download = `${caption || "original_image"}.jpg`;
    link.target = "_blank";
    link.click();
  };

  // 편집본 다운로드
  const handleDownloadEdited = () => {
    alert("편집본 다운로드가 완료되었습니다.");
  };

  // '본문에 넣기' 완료 핸들러
  const handleApply = () => {
    const updated = {
      ...photo,
      caption,
      source,
      ratio: selectedRatio === "원본" ? "자유 (원본)" : `${selectedRatio} (보도)`
    };
    if (onApplyToArticle) {
      onApplyToArticle(updated);
    }
  };

  return (
    <div className="w-full min-h-screen flex flex-col font-sans select-none animate-in fade-in duration-200">

      {/* ──────────────────────────────────────────
          1. 최상단 헤더 바: 기존 메인 화면 Header와 동일하게 적용
         ────────────────────────────────────────── */}
      <Header
        currentArticleTitle={currentArticleTitle}
        status={status}
      />

      {/* ──────────────────────────────────────────
          2. 서브 헤더 바: [작성으로 돌아가기] | "사진 편집"
         ────────────────────────────────────────── */}
      <div className="w-full px-8 pt-5 pb-3 flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-lg text-xs font-semibold text-slate-800 transition cursor-pointer shadow-2xs active:scale-95"
        >
          작성으로 돌아가기
        </button>
        <h2 className="text-base md:text-lg font-bold text-slate-900 tracking-tight">
          사진 편집
        </h2>
      </div>

      {/* ──────────────────────────────────────────
          3. 메인 콘텐츠: 2단 그리드 (좌: 이미지 캔버스 / 우: 설정 패널)
         ────────────────────────────────────────── */}
      <div className="flex-1 w-full px-8 py-2 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* [좌측 컬럼]: 그레이 캔버스 + 크롭 모서리 가이드 + 모자이크 캔버스 */}
        <div className="lg:col-span-8 bg-[#F5F6F8] rounded-2xl p-6 md:p-10 flex items-center justify-center min-h-[560px] border border-black/[0.03] shadow-xs relative overflow-hidden">

          <div
            ref={containerRef}
            className={`relative inline-block overflow-hidden transition-all duration-300 ${getAspectRatioClass()}`}
          >
            {/* 메인 이미지 */}
            <img
              src={photo.url}
              alt={caption}
              className="max-h-[540px] w-auto max-w-full object-cover block select-none pointer-events-none rounded-sm shadow-sm"
            />

            {/* 모자이크 인터랙티브 캔버스 오버레이 */}
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className={`absolute inset-0 w-full h-full ${mosaicMode !== "none" ? "cursor-crosshair" : "pointer-events-none"
                }`}
            />

            {/* 4개 코너 크롭 핸들 (첨부 이미지의 ⌜ ⌝ ⌞ ⌟ 모서리 표현) */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-slate-900 pointer-events-none" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-slate-900 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-slate-900 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-slate-900 pointer-events-none" />
          </div>

        </div>

        {/* [우측 컬럼]: 첨부 이미지와 100% 동일한 조작 패널 */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-black/[0.05] p-6 shadow-xs space-y-6">

          {/* 1. 표시 비율 */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-800 block">
              표시 비율
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {["원본", "16:9", "4:3", "1:1", "3:2"].map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setSelectedRatio(ratio)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${selectedRatio === ratio
                    ? "bg-slate-950 text-white shadow-xs"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                    }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          {/* 2. 모자이크 */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-slate-800 block">
              모자이크
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setMosaicMode((prev) => (prev === "mosaic" ? "none" : "mosaic"))}
                className={`py-1.5 text-xs font-medium rounded-lg border transition cursor-pointer text-center ${mosaicMode === "mosaic"
                  ? "bg-slate-950 text-white border-slate-950 shadow-xs"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
              >
                모자이크
              </button>
              <button
                type="button"
                onClick={() => setMosaicMode((prev) => (prev === "eraser" ? "none" : "eraser"))}
                className={`py-1.5 text-xs font-medium rounded-lg border transition cursor-pointer text-center ${mosaicMode === "eraser"
                  ? "bg-slate-950 text-white border-slate-950 shadow-xs"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
              >
                지우개
              </button>
              <button
                type="button"
                onClick={handleUndo}
                className="py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition cursor-pointer text-center"
              >
                되돌리기
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              모자이크를 켜고 가릴 부분을 칠해주세요.
            </p>

            {/* 슬라이더 컨트롤들 */}
            <div className="space-y-3 pt-1">
              {/* 브러시 크기 */}
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-600 font-medium whitespace-nowrap w-20">
                  브러시 크기
                </span>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                />
                <span className="text-slate-700 font-mono w-8 text-right font-medium">
                  {brushSize}
                </span>
              </div>

              {/* 투명도 */}
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-600 font-medium whitespace-nowrap w-20">
                  투명도
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                />
                <span className="text-slate-700 font-mono w-8 text-right font-medium">
                  {opacity}%
                </span>
              </div>

              {/* 경계 선명도 */}
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-600 font-medium whitespace-nowrap w-20">
                  경계 선명도
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={edgeSharpness}
                  onChange={(e) => setEdgeSharpness(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                />
                <span className="text-slate-700 font-mono w-8 text-right font-medium">
                  {edgeSharpness}%
                </span>
              </div>
            </div>
          </div>

          {/* 3. 사진 설명 */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-800 block">
              사진 설명
            </label>
            <textarea
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-slate-800 transition resize-none font-medium"
            />
          </div>

          {/* 4. 사진 출처 */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-800 block">
              사진 출처
            </label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-slate-800 transition font-medium"
            />
          </div>

          {/* 5. 원본 다운로드 / 편집본 다운로드 */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={handleDownloadOriginal}
              className="py-2 px-3 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer text-center"
            >
              원본 다운로드
            </button>
            <button
              type="button"
              onClick={handleDownloadEdited}
              className="py-2 px-3 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer text-center"
            >
              편집본 다운로드
            </button>
          </div>

          {/* 6. 본문에 넣기 버튼 */}
          <button
            type="button"
            onClick={handleApply}
            className="w-full py-3 bg-[#23211F] hover:bg-black text-white text-xs md:text-sm font-bold rounded-xl transition cursor-pointer active:scale-95 shadow-sm"
          >
            본문에 넣기
          </button>

        </div>

      </div>

      {/* ──────────────────────────────────────────
          4. 최하단 푸터 바: "자동 저장됨" | "본문 1,149자"
         ────────────────────────────────────────── */}
      <div className="w-full px-8 py-3.5 flex items-center justify-between text-xs text-slate-400 mt-auto border-t border-black/[0.03]">
        <span>자동 저장됨</span>
        <span>본문 {charCount.toLocaleString()}자</span>
      </div>

    </div>
  );
}
