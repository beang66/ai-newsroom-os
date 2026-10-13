import React, { useState, useRef, useEffect, useCallback } from "react";
import { cropForRatio, renderMosaics, renderDerivative } from "../utils/imageEditor";

export default function PhotoEditor({
  photo,
  onBack,
  onApply,
  charCount
}) {
  const [selectedRatio, setSelectedRatio] = useState("원본");
  const [activeTool, setActiveTool] = useState("mosaic"); // 'mosaic' | 'eraser'
  const [brushSize, setBrushSize] = useState(48);
  const [opacity, setOpacity] = useState(0); // 0% ~ 100%
  const [hardness, setHardness] = useState(20); // 20% 경계 선명도
  const [caption, setCaption] = useState(photo?.caption || "");
  const [source, setSource] = useState(
    photo?.source || ""
  );

  // 모자이크 마스크 상태 및 단계별 되돌리기(Undo) 히스토리 스택
  const [masks, setMasks] = useState([]);
  const [history, setHistory] = useState([[]]); // [0]: 원본 상태 (빈 배열)
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState(null);
  const strokeStartMasksRef = useRef(null);

  // 캔버스 및 이미지 참조
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const imageObjRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [error, setError] = useState("");
  const [displaySize, setDisplaySize] = useState({ w: 300, h: 400 });
  const [imageDimensions, setImageDimensions] = useState({ w: 800, h: 600 });

  // 마우스 위치 브러시 인디케이터
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100, visible: false });

  // 코어가 받아온 사진 또는 사용자가 선택한 로컬 사진만 편집한다.
  useEffect(() => {
    if (!photo?.url?.startsWith("data:image/")) {
      setError("저장된 사진 원본이 없습니다. 사진을 다시 가져와 주세요.");
      return;
    }
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      imageObjRef.current = img;
      setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight });
      setImageLoaded(true);
    };
    img.onerror = () => {
      if (alive) setError("사진을 표시하지 못했습니다. JPG·PNG·WebP 파일을 다시 선택해 주세요.");
    };
    img.src = photo.url;
    return () => { alive = false; };
  }, [photo?.url]);

  useEffect(() => {
    const container = containerRef.current;
    const resize = () => {
      const style = getComputedStyle(container);
      setDisplaySize({
        w: Math.max(1, Math.min(880, container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))),
        h: Math.max(220, Math.min(680, window.innerHeight - 200)),
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener("resize", resize);
    resize();
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); };
  }, []);

  // 비율 계산
  const getCropRect = useCallback(() => {
    const { w, h } = imageDimensions;
    if (selectedRatio === "원본") {
      return { x: 0, y: 0, w, h };
    }
    const ratioMap = {
      "16:9": 16 / 9,
      "4:3": 4 / 3,
      "1:1": 1,
      "3:2": 3 / 2
    };
    const r = ratioMap[selectedRatio] || w / h;
    return cropForRatio(w, h, r);
  }, [imageDimensions, selectedRatio]);

  // 2. 캔버스 렌더링
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageObjRef.current;
    if (!canvas || !img || !imageLoaded) return;

    const crop = getCropRect();
    const g = canvas.getContext("2d");

    // 캔버스 크기를 크롭 영역 비율에 맞춤 (화면 표시용)
    const displayMaxWidth = displaySize.w;
    const displayMaxHeight = displaySize.h;

    let drawW = displayMaxWidth;
    let drawH = (displayMaxWidth * crop.h) / crop.w;

    if (drawH > displayMaxHeight) {
      drawH = displayMaxHeight;
      drawW = (displayMaxHeight * crop.w) / crop.h;
    }

    canvas.width = Math.round(drawW);
    canvas.height = Math.round(drawH);

    // 원본 크롭 이미지 그리기
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);

    // 모자이크 마스크 렌더링
    const allMasks = currentStroke ? [...masks, currentStroke] : masks;
    if (allMasks.length > 0) {
      const scale = canvas.width / crop.w;
      // 투명도 (0% = 불투명 1, 100% = 완전투명 0)
      const renderOpacity = 1 - opacity / 100;
      renderMosaics(g, img, allMasks, scale, crop.x, crop.y, renderOpacity, hardness);
    }
  }, [getCropRect, imageLoaded, masks, currentStroke, opacity, hardness, displaySize]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // 3. 마우스 드로잉 좌표 변환 (Canvas -> 원본 이미지 크롭 좌표계)
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const crop = getCropRect();
    const scale = crop.w / rect.width;

    const clientX = e.clientX;
    const clientY = e.clientY;

    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    return {
      imgX: crop.x + canvasX * scale,
      imgY: crop.y + canvasY * scale,
      canvasX,
      canvasY
    };
  };

  const handleMouseDown = (e) => {
    if (!imageLoaded || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const coords = getCanvasCoords(e);
    if (!coords) return;

    // 드로잉 시작 전 직전 마스크 상태 스냅샷 저장
    strokeStartMasksRef.current = JSON.parse(JSON.stringify(masks));

    const crop = getCropRect();
    const scale = crop.w / canvasRef.current.getBoundingClientRect().width;
    const strokeDiameter = brushSize * scale;

    setIsDrawing(true);

    if (activeTool === "mosaic") {
      const newStroke = {
        type: "brush",
        points: [{ x: coords.imgX, y: coords.imgY }],
        diameter: strokeDiameter,
        opacity: 1 - opacity / 100,
        hardness
      };
      setCurrentStroke(newStroke);
    } else if (activeTool === "eraser") {
      // 지우개: 현재 마스크들에 erasure 추가
      const erasure = {
        points: [{ x: coords.imgX, y: coords.imgY }],
        diameter: strokeDiameter
      };
      const updated = masks.map((m) => ({
        ...m,
        erasures: [...(m.erasures || []), erasure]
      }));
      setMasks(updated);
    }
  };

  const handleMouseMove = (e) => {
    const coords = getCanvasCoords(e);
    if (coords) {
      setCursorPos({ x: coords.canvasX, y: coords.canvasY, visible: true });
    }

    if (!isDrawing || !coords) return;

    if (activeTool === "mosaic") {
      setCurrentStroke((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          points: [...prev.points, { x: coords.imgX, y: coords.imgY }]
        };
      });
    } else if (activeTool === "eraser") {
      const crop = getCropRect();
      const scale = crop.w / canvasRef.current.getBoundingClientRect().width;
      const strokeDiameter = brushSize * scale;

      setMasks((prevMasks) =>
        prevMasks.map((m) => {
          const erasures = m.erasures || [];
          if (erasures.length === 0) return m;
          const last = erasures[erasures.length - 1];
          const updatedLast = {
            ...last,
            points: [...last.points, { x: coords.imgX, y: coords.imgY }],
            diameter: strokeDiameter
          };
          return {
            ...m,
            erasures: [...erasures.slice(0, -1), updatedLast]
          };
        })
      );
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    let nextMasks = masks;
    if (activeTool === "mosaic" && currentStroke && currentStroke.points.length > 0) {
      nextMasks = [...masks, currentStroke];
      setMasks(nextMasks);
      setCurrentStroke(null);
    } else if (activeTool === "eraser") {
      nextMasks = masks;
    }

    // 마스크가 실제로 변경된 경우 히스토리 스택에 기록
    const prevJson = JSON.stringify(strokeStartMasksRef.current || []);
    const nextJson = JSON.stringify(nextMasks);
    if (prevJson !== nextJson) {
      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push(JSON.parse(nextJson));
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
    }
  };

  // 단계별 되돌리기 (Undo)
  const handleUndo = () => {
    if (historyIndex > 0) {
      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      const restoredMasks = JSON.parse(JSON.stringify(history[nextIndex]));
      setMasks(restoredMasks);
    }
  };

  // 원본 다운로드
  const handleDownloadOriginal = () => {
    if (!photo?.url) return;
    const a = document.createElement("a");
    a.href = photo.original || photo.url;
    a.download = `original_${photo.id || "image"}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // 편집본 다운로드
  const handleDownloadEdited = () => {
    if (!imageLoaded) return;
    const dataUrl = renderDerivative(imageObjRef.current, getCropRect(), masks, 1600, 1 - opacity / 100, hardness);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `edited_${photo.id || "image"}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // 본문에 넣기
  const handleApplyToArticle = () => {
    if (!imageLoaded) return;
    const finalUrl = renderDerivative(imageObjRef.current, getCropRect(), masks, 1600, 1 - opacity / 100, hardness);

    const editedPhotoData = {
      ...photo,
      url: finalUrl,
      original: photo.original || photo.url,
      caption: caption || photo?.caption || "기사 사진",
      source,
      provider: photo?.provider || "",
      ratio: selectedRatio
    };

    onApply(editedPhotoData);
  };

  return (
    <div data-testid="photo-editor" className="w-full min-w-0 flex-1 min-h-[calc(100vh-80px)] bg-white rounded-2xl md:rounded-[32px] border border-[#E7E4DE] shadow-[0_8px_30px_rgba(41,41,41,0.03)] flex flex-col font-sans select-none animate-float-in overflow-hidden relative z-10 self-start">
      {/* ──────────────────────────────────────────
          상단 헤더: 좌측 [사진 편집] / 우측 [작성으로 돌아가기]
         ────────────────────────────────────────── */}
      <header className="h-14 border-b border-stone-200 px-6 flex items-center justify-between bg-white flex-shrink-0 z-30">
        <h1 className="text-base font-extrabold text-stone-900 tracking-tight">
          사진 편집
        </h1>
        <button
          type="button"
          onClick={onBack}
          className="px-3.5 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-semibold cursor-pointer transition shadow-2xs"
        >
          작성으로 돌아가기
        </button>
      </header>

      {/* ──────────────────────────────────────────
          2. 메인 워크스페이스 (좌: 캔버스 / 우: 컨트롤 패널)
         ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-[#F4F4F5]">
        {/* 좌측: 대형 사진 캔버스 영역 */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 flex items-center justify-center p-6 md:p-10 relative overflow-hidden"
        >
          {!imageLoaded && <p role={error ? "alert" : "status"} className="text-xs text-stone-600">{error || "사진을 불러오는 중…"}</p>}
          <div className={`relative max-w-full inline-block shadow-lg rounded-sm overflow-hidden select-none bg-stone-900 ${imageLoaded ? "" : "hidden"}`}>
            {/* 실제 편집 캔버스 */}
            <canvas
              ref={canvasRef}
              aria-label="사진 편집 캔버스"
              onPointerDown={handleMouseDown}
              onPointerMove={handleMouseMove}
              onPointerUp={handleMouseUp}
              onPointerCancel={handleMouseUp}
              onPointerLeave={() => setCursorPos((prev) => ({ ...prev, visible: false }))}
              className={`block max-w-full h-auto touch-none ${
                activeTool === "mosaic" || activeTool === "eraser"
                  ? "cursor-crosshair"
                  : "cursor-default"
              }`}
            />

            {/* 마우스 커서 브러시 원형 가이드 */}
            {cursorPos.visible && (
              <div
                className="pointer-events-none absolute rounded-full border border-white/80 bg-white/20 -translate-x-1/2 -translate-y-1/2 z-20"
                style={{
                  left: cursorPos.x,
                  top: cursorPos.y,
                  width: brushSize,
                  height: brushSize
                }}
              />
            )}

            {/* ⌜ ⌝ ⌞ ⌟ 모서리 L자 크롭 핸들 오버레이 */}
            <div className="pointer-events-none absolute inset-0 z-10">
              {/* 좌측 상단 ⌜ */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t-[3px] border-l-[3px] border-black" />
              {/* 우측 상단 ⌝ */}
              <div className="absolute top-0 right-0 w-4 h-4 border-t-[3px] border-r-[3px] border-black" />
              {/* 좌측 하단 ⌞ */}
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-[3px] border-l-[3px] border-black" />
              {/* 우측 하단 ⌟ */}
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-[3px] border-r-[3px] border-black" />
            </div>
          </div>
        </div>

        {/* ──────────────────────────────────────────
            우측 컨트롤 사이드바 (사용자 캡처 이미지 100% 동일)
           ────────────────────────────────────────── */}
        <aside className="w-full lg:w-[350px] bg-white border-t lg:border-t-0 lg:border-l border-stone-200 p-6 flex flex-col justify-between overflow-y-auto space-y-5 flex-shrink-0">
          <div className="space-y-4">
            {/* 1. 표시 비율 */}
            <div>
              <label className="text-xs font-bold text-stone-800 block mb-2">
                표시 비율
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {["원본", "16:9", "4:3", "1:1", "3:2"].map((ratio) => (
                  <button
                    key={ratio}
                    aria-pressed={selectedRatio === ratio}
                    onClick={() => setSelectedRatio(ratio)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
                      selectedRatio === ratio
                        ? "bg-[#18181B] text-white"
                        : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 모자이크 */}
            <div>
              <label className="text-xs font-bold text-stone-800 block mb-2">
                모자이크
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => setActiveTool("mosaic")}
                  aria-pressed={activeTool === "mosaic"}
                  className={`py-1.5 text-xs font-semibold rounded-md border transition cursor-pointer ${
                    activeTool === "mosaic"
                      ? "bg-[#18181B] text-white border-[#18181B]"
                      : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  모자이크
                </button>
                <button
                  onClick={() => setActiveTool("eraser")}
                  aria-pressed={activeTool === "eraser"}
                  className={`py-1.5 text-xs font-semibold rounded-md border transition cursor-pointer ${
                    activeTool === "eraser"
                      ? "bg-[#18181B] text-white border-[#18181B]"
                      : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  지우개
                </button>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={historyIndex === 0}
                  className={`py-1.5 text-xs font-semibold rounded-md border border-stone-200 transition cursor-pointer ${
                    historyIndex === 0
                      ? "bg-stone-50 text-stone-300 cursor-not-allowed"
                      : "bg-white text-stone-700 hover:bg-stone-50 active:scale-95"
                  }`}
                  title={historyIndex === 0 ? "되돌릴 작업이 없습니다" : "이전 작업 상태로 되돌리기"}
                >
                  되돌리기
                </button>
              </div>
              <p className="text-[11px] text-stone-400 mt-1.5">
                모자이크를 켜고 가릴 부분을 칠해주세요.
              </p>
            </div>

            {/* 3. 브러시 크기 슬라이더 */}
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-stone-800 mb-1.5">
                <span>브러시 크기</span>
                <span className="font-mono text-stone-500 font-normal">{brushSize}</span>
              </div>
              <input
                type="range"
                aria-label="브러시 크기"
                min="10"
                max="100"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-[#18181B]"
              />
            </div>

            {/* 4. 투명도 슬라이더 */}
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-stone-800 mb-1.5">
                <span>투명도</span>
                <span className="font-mono text-stone-500 font-normal">{opacity}%</span>
              </div>
              <input
                type="range"
                aria-label="투명도"
                min="0"
                max="100"
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-[#18181B]"
              />
            </div>

            {/* 5. 경계 선명도 슬라이더 */}
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-stone-800 mb-1.5">
                <span>경계 선명도</span>
                <span className="font-mono text-stone-500 font-normal">{hardness}%</span>
              </div>
              <input
                type="range"
                aria-label="경계 선명도"
                min="0"
                max="100"
                value={hardness}
                onChange={(e) => setHardness(Number(e.target.value))}
                className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-[#18181B]"
              />
            </div>

            {/* 6. 사진 설명 */}
            <div>
              <label className="text-xs font-bold text-stone-800 block mb-1.5">
                사진 설명
              </label>
              <textarea
                aria-label="사진 설명"
                rows={2}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="사진 설명을 입력하세요"
                className="w-full p-2.5 text-xs bg-white border border-stone-200 rounded-lg outline-none focus:border-stone-800 resize-none font-sans"
              />
            </div>

            {/* 7. 사진 출처 */}
            <div>
              <label className="text-xs font-bold text-stone-800 block mb-1.5">
                사진 출처
              </label>
              <input
                type="text"
                aria-label="사진 출처"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="예: Mike Kenneally / Unsplash"
                className="w-full p-2.5 text-xs bg-white border border-stone-200 rounded-lg outline-none focus:border-stone-800 font-sans"
              />
            </div>
          </div>

          {/* 8. 하단 버튼 영역 */}
          <div className="space-y-2 pt-2 border-t border-stone-100">
            {/* 원본 다운로드 / 편집본 다운로드 */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDownloadOriginal}
                disabled={!imageLoaded}
                className="py-2 text-xs font-semibold rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition cursor-pointer"
              >
                원본 다운로드
              </button>
              <button
                onClick={handleDownloadEdited}
                disabled={!imageLoaded || isDrawing}
                className="py-2 text-xs font-semibold rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition cursor-pointer"
              >
                편집본 다운로드
              </button>
            </div>

            {/* 본문에 넣기 */}
            <button
              onClick={handleApplyToArticle}
              disabled={!imageLoaded || isDrawing}
              className="w-full py-3 bg-[#18181B] hover:bg-black text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-sm text-center"
            >
              본문에 넣기
            </button>
          </div>
        </aside>
      </div>

      {/* 최하단 상태바 푸터 (참고 이미지 하단) */}
      <footer className="h-10 border-t border-stone-200 px-6 flex items-center justify-end text-xs text-stone-500 bg-white flex-shrink-0">
        <span>본문 {(charCount || 0).toLocaleString()}자</span>
      </footer>
    </div>
  );
}
