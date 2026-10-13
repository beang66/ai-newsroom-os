import React, { useState, useEffect } from "react";
import { 
  X, 
  Crop, 
  RotateCw, 
  FlipHorizontal, 
  Sliders, 
  Sparkles, 
  Check, 
  ZoomIn, 
  ImageIcon,
  Maximize2
} from "lucide-react";

const RATIO_OPTIONS = [
  { id: "16:9", label: "16:9 (대표)", className: "aspect-video" },
  { id: "4:3", label: "4:3 (본문)", className: "aspect-4/3" },
  { id: "1:1", label: "1:1 (정방형)", className: "aspect-square" },
  { id: "free", label: "자유 (원본)", className: "aspect-auto" }
];

const FILTER_PRESETS = [
  { id: "none", name: "기본", filter: "none" },
  { id: "vivid", name: "선명하게", filter: "contrast(1.15) saturate(1.25) brightness(1.02)" },
  { id: "bw", name: "흑백", filter: "grayscale(1) contrast(1.1)" },
  { id: "warm", name: "따뜻하게", filter: "sepia(0.2) saturate(1.15) brightness(1.03)" },
  { id: "cool", name: "차분하게", filter: "hue-rotate(185deg) saturate(0.85) brightness(0.98)" }
];

export default function ImageEditorModal({ isOpen, onClose, photo, onSave }) {
  if (!isOpen || !photo) return null;

  const [caption, setCaption] = useState(photo.caption || "");
  const [source, setSource] = useState(photo.source || "동아일보 DB");
  const [provider, setProvider] = useState(photo.provider || "김동아 기자");
  const [selectedRatio, setSelectedRatio] = useState(photo.ratio?.includes("4:3") ? "4:3" : photo.ratio?.includes("1:1") ? "1:1" : "16:9");
  const [rotation, setRotation] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selectedFilter, setSelectedFilter] = useState("none");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);

  useEffect(() => {
    if (photo) {
      setCaption(photo.caption || "");
      setSource(photo.source || "동아일보 DB");
      setProvider(photo.provider || "김동아 기자");
      setSelectedRatio(photo.ratio?.includes("4:3") ? "4:3" : photo.ratio?.includes("1:1") ? "1:1" : "16:9");
      setRotation(0);
      setIsFlipped(false);
      setZoom(1);
      setSelectedFilter("none");
      setBrightness(100);
      setContrast(100);
    }
  }, [photo]);

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleFlip = () => {
    setIsFlipped((prev) => !prev);
  };

  const currentPreset = FILTER_PRESETS.find((f) => f.id === selectedFilter);
  const customFilterStyle = `${currentPreset?.filter !== "none" ? currentPreset?.filter : ""} brightness(${brightness}%) contrast(${contrast}%)`.trim();

  const handleApply = () => {
    const updated = {
      ...photo,
      caption,
      source,
      provider,
      ratio: RATIO_OPTIONS.find((r) => r.id === selectedRatio)?.label || "16:9 (대표)",
      rotation,
      isFlipped,
      zoom,
      filterStyle: customFilterStyle
    };
    if (onSave) {
      onSave(updated);
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/45 backdrop-blur-md animate-smooth-in">
      <div className="bg-white/96 backdrop-blur-2xl rounded-3xl border border-white ring-1 ring-stone-900/10 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,1)] w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-smooth-pop">
        
        {/* 상단 모달 헤더 */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Crop className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>이미지 편집 스튜디오</span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  기사 최적화
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                보도용 사진의 규격, 각도, 필터 및 캡션을 보정하여 기사에 적용합니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-900 hover:bg-slate-200/60 transition cursor-pointer"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 메인 2단 작업 영역 (좌: 라이브 프리뷰 / 우: 편집 컨트롤러) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-y-auto">
          
          {/* [좌측 7컬럼]: 이미지 실시간 캔버스 프리뷰 */}
          <div className="md:col-span-7 bg-[#18191B] p-6 flex flex-col items-center justify-center relative min-h-[360px] select-none overflow-hidden">
            <div className="w-full max-w-[420px] flex flex-col items-center">
              
              {/* 비율 가이드 프레임 */}
              <div 
                className={`w-full overflow-hidden rounded-2xl border-2 border-white/20 shadow-2xl relative bg-black/40 flex items-center justify-center transition-all duration-300 ${
                  selectedRatio === "16:9" ? "aspect-video" :
                  selectedRatio === "4:3" ? "aspect-4/3" :
                  selectedRatio === "1:1" ? "aspect-square" : "max-h-[380px]"
                }`}
              >
                <img
                  src={photo.url}
                  alt={caption}
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg) scaleX(${isFlipped ? -1 : 1})`,
                    filter: customFilterStyle,
                    transition: "transform 0.25s ease-out, filter 0.2s ease-out"
                  }}
                  className="w-full h-full object-cover pointer-events-none"
                />

                {/* 규격 가이드 워터마크 뱃지 */}
                <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white text-[10px] font-mono font-bold tracking-wider border border-white/10">
                  {selectedRatio}
                </div>
              </div>

              {/* 하단 캡션 실시간 렌더링 미리보기 */}
              <div className="w-full mt-3 text-center">
                <p className="text-xs text-slate-300 font-medium truncate">
                  ▲ {caption || "사진 설명 캡션이 여기에 표시됩니다."}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  출처: {source} · 제공: {provider}
                </p>
              </div>

            </div>
          </div>

          {/* [우측 5컬럼]: 조절 컨트롤 패널 */}
          <div className="md:col-span-5 p-5 md:p-6 space-y-5 bg-white border-l border-slate-100 flex flex-col justify-between">
            <div className="space-y-4">
              
              {/* 1. 규격 비율 선택 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>규격 비율 (Aspect Ratio)</span>
                  <span className="text-[11px] text-slate-400 font-normal">보도 규격</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {RATIO_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedRatio(opt.id)}
                      className={`px-3 py-2 text-xs font-bold rounded-xl border transition cursor-pointer text-center ${
                        selectedRatio === opt.id
                          ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. 회전 및 반전 & 확대 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">각도 및 변형</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleRotate}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition cursor-pointer active:scale-95"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-slate-600" />
                    <span>90° 회전</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleFlip}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition cursor-pointer active:scale-95"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5 text-slate-600" />
                    <span>좌우 반전</span>
                  </button>
                </div>

                {/* 줌 슬라이더 */}
                <div className="pt-1.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                    <span className="flex items-center gap-1"><ZoomIn className="w-3 h-3" /> 확대 배율</span>
                    <span className="font-mono">{zoom.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="2"
                    step="0.1"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-full accent-slate-900 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* 3. 시각 필터 프리셋 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">보도사진 톤 필터</label>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {FILTER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedFilter(preset.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
                        selectedFilter === preset.id
                          ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. 사진 설명 및 출처 수정 */}
              <div className="space-y-2.5 pt-1">
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">사진 설명 (캡션)</label>
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="기사 본문에 노출될 사진 설명을 입력하세요"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:bg-white focus:border-slate-800 transition"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">사진 출처</label>
                    <input
                      type="text"
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      placeholder="동아일보 DB"
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:bg-white focus:border-slate-800 transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">제공자</label>
                    <input
                      type="text"
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      placeholder="김동아 기자"
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:bg-white focus:border-slate-800 transition"
                    />
                  </div>
                </div>
              </div>

            </div>

            {/* 하단 모달 액션 버튼 바 */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-black text-white shadow-sm flex items-center gap-1.5 transition cursor-pointer active:scale-95"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>편집 완료 & 기사 적용</span>
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
