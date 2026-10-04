import React, { useState, useRef } from "react";
import {
  Upload,
  Sparkles,
  Image as ImageIcon,
  Copy,
  Printer,
  Download,
  Send,
  Check,
  Sliders,
  FileText,
  Hash,
  Share2,
  Heart,
  MessageCircle,
  Repeat,
  Bookmark,
  MoreHorizontal,
  Move,
  RotateCcw
} from "lucide-react";
import { initialArticles } from "../data/mockData";

// 플랫폼 전용 인라인 커스텀 아이콘
const InstagramIcon = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 24 24" className={className} stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const ThreadsIcon = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 24 24" className={className} stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M16 12v1a3 3 0 0 1-6 0v-1a6 6 0 1 1 11.6 2.2" />
  </svg>
);

const XTwitterIcon = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export default function FormatConverter() {
  // 1. 변환 대상 기사
  const [selectedArticle, setSelectedArticle] = useState(initialArticles[0]);

  // 2. 플랫폼 다중 선택
  const [selectedPlatforms, setSelectedPlatforms] = useState(["instagram"]);

  // 3. 다중 선택 시 현재 작업 중인 플랫폼 탭
  const [activePlatformTab, setActivePlatformTab] = useState("instagram");

  // 추천 샘플 이미지 목록
  const sampleImages = [
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1677442136019-21780efad99a?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=800&auto=format&fit=crop"
  ];

  // 4. 플랫폼별 맞춤 데이터 상태 (이미지, 비율, 크기, 위치, 텍스트, 해시태그)
  const [platformData, setPlatformData] = useState({
    instagram: {
      title: "AI 반도체 개척자들... 차세대 주도권 경쟁 🚀",
      caption: "국내 주요 반도체 기업과 연구진이 NPU 및 PIM 기술을 통해 글로벌 빅테크 기업들과 차세대 반도체 패권 다툼을 시작합니다.",
      text: `[단독] AI 반도체 개척자들... 초거대 AI 시대의 차세대 주도권 경쟁 🚀\n\n국내 주요 반도체 기업과 연구진이 NPU 및 PIM 기술을 통해 글로벌 빅테크 기업들과 차세대 반도체 패권 다툼을 시작합니다.\n\n전력 소비를 70% 이상 절감한 혁신적인 성과를 지금 확인해보세요.\n\n#AINewsroom #AI반도체 #NPU #PIM #빅테크 #기술혁신 #IT뉴스 #디지털인텔리전스`,
      hashtags: ["#AI반도체", "#NPU", "#PIM", "#빅테크", "#IT뉴스"],
      image: sampleImages[0],
      aspectRatio: "1:1",
      zoom: 100,
      positionX: 50,
      positionY: 50
    },
    threads: {
      title: "AI 반도체 패권 경쟁 현장",
      caption: "GPU 중심의 한계를 뛰어넘는 국내 AI 반도체 기술의 급부상 🧵",
      text: `GPU 중심 연산의 한계를 뛰어넘는 국내 AI 반도체 기술의 급부상! 🧵\n\n기존 대비 전력 소비 70% 감소, 데이터 병목 현상을 해결한 초거대 AI 지원 반도체 현장을 취재했습니다.\n\n알고리즘 최적화와 함께 펼쳐지는 글로벌 패권 경쟁, 여러분의 의견은 어떠신가요?\n\n#ThreadsTech #AI반도체 #기술트렌드`,
      hashtags: ["#ThreadsTech", "#AI반도체", "#기술트렌드"],
      image: sampleImages[1],
      aspectRatio: "16:9",
      zoom: 100,
      positionX: 50,
      positionY: 50
    },
    twitter: {
      title: "차세대 AI 반도체 패권",
      caption: "⚡️ [속보] NPU/PIM 독자 기술 성과 발표",
      text: `⚡️ [속보] AI 반도체 개척자들, 초거대 AI 시대 차세대 주도권 쟁탈전 개막!\n\n국내 개발진, NPU/PIM 독자 기술로 전력 70% 감소 성과 달성. 글로벌 빅테크와 대등한 경쟁 돌입.\n\n#AI반도체 #NPU #IT뉴스`,
      hashtags: ["#AI반도체", "#NPU", "#IT뉴스"],
      image: sampleImages[2],
      aspectRatio: "16:9",
      zoom: 100,
      positionX: 50,
      positionY: 50
    }
  });

  // 마우스 커서 기반 드래그 이동 상태
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, posX: 50, posY: 50 });

  const fileInputRef = useRef(null);
  const [copiedStatus, setCopiedStatus] = useState("");
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedTarget, setPublishedTarget] = useState("전체");

  // 플랫폼 정의
  const platforms = [
    {
      id: "instagram",
      label: "Instagram",
      desc: "이미지 중심 · 1:1 / 4:5 / 16:9 · 캡션 및 해시태그",
      icon: InstagramIcon,
      badge: "피드 포맷",
      themeColor: "from-purple-500 to-pink-500"
    },
    {
      id: "threads",
      label: "Threads",
      desc: "텍스트 중심 · 자유로운 토론 · 미디어 카드 첨부",
      icon: ThreadsIcon,
      badge: "스레드 포맷",
      themeColor: "from-slate-800 to-slate-950"
    },
    {
      id: "twitter",
      label: "X (Twitter)",
      desc: "짧고 간결한 문구 · 신속한 뉴스 브리핑 · 미디어",
      icon: XTwitterIcon,
      badge: "트윗 포맷",
      themeColor: "from-blue-500 to-slate-900"
    }
  ];

  // 플랫폼 다중 토글 핸들러
  const togglePlatform = (platformId) => {
    setSelectedPlatforms((prev) => {
      let next;
      if (prev.includes(platformId)) {
        next = prev.filter((p) => p !== platformId);
      } else {
        next = [...prev, platformId];
      }
      if (!next.includes(activePlatformTab) && next.length > 0) {
        setActivePlatformTab(next[0]);
      }
      return next;
    });
  };

  // 플랫폼 데이터 필드 업데이트
  const updatePlatformField = (platform, field, value) => {
    setPlatformData((prev) => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [field]: value
      }
    }));
  };

  // 이미지 업로드
  const handleImageUpload = (e, platform) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvt) => {
        if (uploadEvt.target?.result) {
          updatePlatformField(platform, "image", uploadEvt.target.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // 마우스 커서 기반 드래그 핸들러 (Pan)
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      posX: platformData[activePlatformTab].positionX,
      posY: platformData[activePlatformTab].positionY
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    // 감도 조절 (픽셀 이동을 % 이동으로 변환)
    const newX = Math.min(100, Math.max(0, dragStart.posX - deltaX * 0.25));
    const newY = Math.min(100, Math.max(0, dragStart.posY - deltaY * 0.25));

    updatePlatformField(activePlatformTab, "positionX", Math.round(newX));
    updatePlatformField(activePlatformTab, "positionY", Math.round(newY));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 마우스 휠로 Zoom 확대/축소
  const handleWheel = (e) => {
    e.preventDefault();
    const currentZoom = platformData[activePlatformTab].zoom;
    const zoomStep = e.deltaY < 0 ? 5 : -5;
    const newZoom = Math.min(180, Math.max(80, currentZoom + zoomStep));
    updatePlatformField(activePlatformTab, "zoom", newZoom);
  };

  // 해시태그 추가
  const addHashtag = (platform, tag) => {
    const currentText = platformData[platform].text;
    if (!currentText.includes(tag)) {
      updatePlatformField(platform, "text", `${currentText} ${tag}`);
    }
  };

  // 텍스트 복사
  const handleCopyText = (platform) => {
    navigator.clipboard.writeText(platformData[platform].text);
    setCopiedStatus(platform);
    setTimeout(() => setCopiedStatus(""), 2000);
  };

  // 인쇄 기능
  const handlePrint = () => {
    window.print();
  };

  // 배포 시뮬레이션
  const handlePublish = (targetName = "전체") => {
    setPublishedTarget(targetName);
    setIsPublishing(true);
    setTimeout(() => {
      setIsPublishing(false);
      setIsPublishModalOpen(true);
    }, 1200);
  };

  const currentPlatformInfo = platforms.find((p) => p.id === activePlatformTab);
  const currentData = platformData[activePlatformTab];

  return (
    <div 
      className="w-full space-y-6 animate-float-in"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >

      {/* ──────────────────────────────────────────
          1. 상단: 전환 중인 기사 표시 & 콤팩트 기사 변경 셀렉터
          (기존의 불필요한 큰 상단 바를 제거하고 시원하게 상향 정렬)
         ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[11px] font-extrabold px-3 py-1 bg-[#EFECE6] text-[#23211F] rounded-full border border-[#DDD6CB] flex-shrink-0">
            전환 중인 기사
          </span>
          <h2 className="text-sm md:text-base font-black text-slate-900 truncate">
            {selectedArticle.title}
          </h2>
        </div>

        {/* 기사 선택 기능 유지 (콤팩트 드롭다운) */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-slate-400 font-bold hidden md:inline">기사 변경:</span>
          <select
            value={selectedArticle.id}
            onChange={(e) => {
              const art = initialArticles.find((a) => a.id === parseInt(e.target.value));
              if (art) setSelectedArticle(art);
            }}
            className="px-3.5 py-1.5 bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] text-xs font-bold rounded-full border border-[#DDD6CB] outline-none cursor-pointer transition shadow-2xs"
          >
            {initialArticles.map((art) => (
              <option key={art.id} value={art.id}>
                {art.title.slice(0, 24)}...
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ──────────────────────────────────────────
          2단 메인 레이아웃:
          [왼쪽] 플랫폼 선택 패널 (w-full lg:w-72 xl:w-80)
          [오른쪽] 실시간 피드 메인 편집 캔버스 (flex-1)
         ────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start gap-6 w-full">

        {/* ──────────────────────────────────────────
            [왼쪽] 플랫폼 선택 & 컨트롤 패널
           ────────────────────────────────────────── */}
        <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 space-y-4">
          
          {/* 플랫폼 선택 카드 컨테이너 */}
          <div className="bg-white/95 rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">배포 플랫폼 선택</h3>
                <p className="text-[11px] text-slate-400 font-medium">다중 선택 가능 (체크박스)</p>
              </div>
              <span className="text-[11px] font-extrabold px-2.5 py-1 bg-[#EFECE6] text-[#23211F] rounded-full border border-[#DDD6CB]">
                {selectedPlatforms.length}개 선택됨
              </span>
            </div>

            {/* 3개 플랫폼 체크박스 카드 리스트 */}
            <div className="space-y-2.5">
              {platforms.map((p) => {
                const isSelected = selectedPlatforms.includes(p.id);
                const Icon = p.icon;

                return (
                  <div
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center justify-between group active:scale-98 ${
                      isSelected
                        ? "bg-[#23211F] text-[#FAF8F5] border-[#23211F] shadow-sm"
                        : "bg-[#EFECE6]/50 hover:bg-[#EFECE6] text-[#23211F] border-[#DDD6CB]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* 체크박스 UI */}
                      <div className="flex-shrink-0">
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-md bg-white text-[#23211F] flex items-center justify-center shadow-xs">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-md border-2 border-[#DDD6CB] bg-white group-hover:border-[#23211F] transition" />
                        )}
                      </div>

                      {/* 플랫폼 아이콘 & 명칭 */}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Icon className={`w-4 h-4 ${isSelected ? "text-white" : "text-[#23211F]"}`} />
                          <span className="text-sm font-extrabold tracking-tight">{p.label}</span>
                        </div>
                        <span className={`text-[11px] block mt-0.5 ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                          {p.badge}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* 안내 가이드 메시지 */}
            <div className="p-3 bg-[#EFECE6]/60 rounded-2xl border border-[#DDD6CB] text-[11px] text-slate-600 leading-relaxed font-medium">
              💡 플랫폼을 선택하면 오른쪽에 실제 포맷의 <strong className="text-slate-900">실시간 피드 편집 화면</strong>이 열리며, 이미지와 글을 화면 위에서 즉시 직접 수정할 수 있습니다.
            </div>
          </div>

          {/* 배포 대기 채널 위젯 */}
          {selectedPlatforms.length > 0 && (
            <div className="bg-white/95 rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3 animate-float-in">
              <span className="text-xs font-extrabold text-slate-900 block">배포 대기 채널</span>
              <div className="space-y-1.5">
                {selectedPlatforms.map((pid) => {
                  const p = platforms.find((item) => item.id === pid);
                  const isCurrent = activePlatformTab === pid;
                  return (
                    <div
                      key={pid}
                      onClick={() => setActivePlatformTab(pid)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        isCurrent
                          ? "bg-[#23211F] text-white border-[#23211F]"
                          : "bg-[#EFECE6]/40 text-slate-700 border-[#DDD6CB] hover:bg-[#EFECE6]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {p && <p.icon className="w-3.5 h-3.5" />}
                        <span>{p?.label}</span>
                      </div>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                        isCurrent ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {isCurrent ? "편집 중" : "준비됨"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 일괄 배포 퀵 버튼 */}
              <button
                onClick={() => handlePublish("선택 플랫폼 전체")}
                disabled={isPublishing}
                className="w-full mt-2 py-2.5 bg-[#23211F] hover:bg-[#38332E] text-[#FAF8F5] font-extrabold text-xs rounded-full shadow-xs transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 border border-[#23211F]"
              >
                <Send className="w-3.5 h-3.5" />
                <span>선택된 {selectedPlatforms.length}개 채널 동시 배포</span>
              </button>
            </div>
          )}

        </div>

        {/* ──────────────────────────────────────────
            [오른쪽] 메인 실시간 플랫폼 피드 직접 편집 영역
           ────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 w-full transition-all duration-300">
          
          {selectedPlatforms.length === 0 ? (
            /* 플랫폼 미선택 시 안내 */
            <div className="bg-white/95 rounded-3xl border border-slate-200/80 p-12 text-center space-y-4 shadow-xs">
              <div className="w-16 h-16 rounded-3xl bg-[#EFECE6] text-[#23211F] flex items-center justify-center mx-auto border border-[#DDD6CB]">
                <Sparkles className="w-8 h-8 text-[#23211F]" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h4 className="text-base md:text-lg font-black text-slate-900">
                  변환할 소셜 플랫폼을 선택해주세요
                </h4>
                <p className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium">
                  왼쪽 목록에서 <strong>Instagram, Threads, X</strong> 중 원하는 플랫폼을 체크하면, 실제 해당 피드 화면이 열리며 화면 위에서 직접 수정할 수 있습니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {platforms.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className="px-4 py-2 bg-[#EFECE6] hover:bg-[#E4DFD7] border border-[#DDD6CB] text-[#23211F] text-xs font-bold rounded-full transition cursor-pointer flex items-center gap-1.5"
                  >
                    <p.icon className="w-3.5 h-3.5" />
                    <span>{p.label} 추가</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* 플랫폼 선택 시: 메인 실시간 피드 직접 편집 캔버스 */
            <div className="space-y-4">

              {/* 1. 상단 다중 플랫폼 전환 탭 (레퍼런스 이미지 스타일 알약 캡슐) */}
              {selectedPlatforms.length > 1 && (
                <div className="flex items-center justify-between bg-white/95 p-2 rounded-full border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center gap-2 pl-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-black text-slate-900">현재 편집 채널:</span>
                  </div>

                  <div className="flex items-center gap-1 bg-[#EFECE6] p-1 rounded-full border border-[#DDD6CB]">
                    {selectedPlatforms.map((pid) => {
                      const p = platforms.find((item) => item.id === pid);
                      const isCurrent = activePlatformTab === pid;
                      return (
                        <button
                          key={pid}
                          onClick={() => setActivePlatformTab(pid)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                            isCurrent
                              ? "bg-white text-[#23211F] shadow-2xs scale-[1.02]"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {p && <p.icon className="w-3.5 h-3.5" />}
                          <span>{p?.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. 대형 실시간 플랫폼 피드 카드 (WYSIWYG 직접 편집 - 와이드 데스크톱 뷰) */}
              {currentPlatformInfo && currentData && (
                <div className="bg-white/95 rounded-3xl border border-slate-200/80 p-4 md:p-5 shadow-xs space-y-4 animate-float-in">
                  
                  {/* 상단 통합 미디어 컨트롤 바 (피드와 일체형) */}
                  <div className="bg-[#EFECE6]/70 p-2.5 md:p-3 rounded-2xl border border-[#DDD6CB] flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                    
                    {/* 이미지 비율 조절 알약 캡슐 */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-[#23211F] flex items-center gap-1">
                        <ImageIcon className="w-3.5 h-3.5" />
                        비율:
                      </span>
                      <div className="flex items-center gap-1 bg-white p-0.5 rounded-full border border-[#DDD6CB]">
                        {["1:1", "4:5", "16:9"].map((ratio) => (
                          <button
                            key={ratio}
                            onClick={() => updatePlatformField(activePlatformTab, "aspectRatio", ratio)}
                            className={`px-3 py-1 text-xs font-black rounded-full transition cursor-pointer ${
                              currentData.aspectRatio === ratio
                                ? "bg-[#23211F] text-[#FAF8F5] shadow-2xs"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            {ratio}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 추천 이미지 교체 & PC 업로드 버튼 */}
                    <div className="flex items-center gap-2">
                      {/* 추천 갤러리 미니 썸네일 스트립 */}
                      <div className="flex items-center gap-1.5 bg-white p-1 rounded-full border border-[#DDD6CB]">
                        <span className="text-[10px] font-bold text-slate-400 pl-2">갤러리:</span>
                        {sampleImages.map((imgUrl, idx) => (
                          <button
                            key={idx}
                            onClick={() => updatePlatformField(activePlatformTab, "image", imgUrl)}
                            className={`w-6 h-6 rounded-full overflow-hidden border-2 transition cursor-pointer ${
                              currentData.image === imgUrl
                                ? "border-[#23211F] scale-110"
                                : "border-transparent opacity-70 hover:opacity-100"
                            }`}
                            title={`추천 이미지 ${idx + 1}`}
                          >
                            <img src={imgUrl} alt="thumb" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>

                      {/* PC 파일 업로드 */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1 px-3.5 py-1.5 bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] border border-[#DDD6CB] rounded-full text-xs font-bold transition cursor-pointer active:scale-95"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>사진 변경</span>
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={(e) => handleImageUpload(e, activePlatformTab)}
                        accept="image/*"
                        className="hidden"
                      />
                    </div>

                    {/* 마우스 줌 & 리셋 컨트롤 */}
                    <div className="flex items-center gap-2 text-xs font-bold text-[#23211F]">
                      <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-full border border-[#DDD6CB]">
                        <Sliders className="w-3.5 h-3.5 text-slate-500" />
                        <span>크기:</span>
                        <input
                          type="range"
                          min="80"
                          max="180"
                          value={currentData.zoom}
                          onChange={(e) => updatePlatformField(activePlatformTab, "zoom", parseInt(e.target.value))}
                          className="w-20 accent-[#23211F] cursor-pointer"
                        />
                        <span className="text-[11px] font-black w-8">{currentData.zoom}%</span>
                      </div>

                      <button
                        onClick={() => {
                          updatePlatformField(activePlatformTab, "zoom", 100);
                          updatePlatformField(activePlatformTab, "positionX", 50);
                          updatePlatformField(activePlatformTab, "positionY", 50);
                        }}
                        className="p-1.5 bg-white hover:bg-slate-100 text-slate-600 rounded-full border border-[#DDD6CB] transition cursor-pointer"
                        title="위치 및 크기 초기화"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                  </div>

                  {/* ──────────────────────────────────────────
                      실제 소셜 피드 카드 (메인 작업 공간)
                     ────────────────────────────────────────── */}
                  <div className="w-full">
                    
                    {/* [A] INSTAGRAM 실시간 메인 피드 에디터 */}
                    {activePlatformTab === "instagram" && (
                      <div className="bg-white rounded-3xl shadow-md border border-slate-200/90 overflow-hidden w-full grid grid-cols-1 lg:grid-cols-12 min-h-[460px] lg:h-[530px] animate-float-in">
                        {/* [좌측 7열] 대형 미디어 캔버스 (마우스 드래그 & 휠 줌) */}
                        <div
                          onMouseDown={handleMouseDown}
                          onWheel={handleWheel}
                          className={`lg:col-span-7 bg-slate-950 relative overflow-hidden flex items-center justify-center min-h-[340px] lg:min-h-0 select-none group ${
                            isDragging ? "cursor-grabbing" : "cursor-grab"
                          }`}
                          title="마우스로 드래그하여 이미지 위치를 조절하고, 휠로 크기를 조절하세요"
                        >
                          <img
                            src={currentData.image}
                            alt="Instagram Preview"
                            draggable={false}
                            style={{
                              transform: `scale(${currentData.zoom / 100})`,
                              objectPosition: `${currentData.positionX}% ${currentData.positionY}%`
                            }}
                            className="w-full h-full object-cover pointer-events-none transition-transform duration-75"
                          />

                          {/* 드래그 조작 가이드 안내 오버레이 (호버 시 표시) */}
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <div className="bg-[#23211F]/80 backdrop-blur-xs text-[#FAF8F5] text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-md border border-white/20">
                              <Move className="w-3.5 h-3.5" />
                              <span>마우스로 드래그하여 위치 이동 (휠: 확대/축소)</span>
                            </div>
                          </div>

                          {/* 비율 뱃지 */}
                          <div className="absolute top-3 left-3 bg-[#23211F]/80 backdrop-blur-xs text-[#FAF8F5] text-[11px] font-bold px-2.5 py-1 rounded-full border border-white/20">
                            Instagram · {currentData.aspectRatio}
                          </div>
                        </div>

                        {/* [우측 5열] 인라인 텍스트 및 인터랙션 편집 패널 */}
                        <div className="lg:col-span-5 flex flex-col justify-between bg-white border-t lg:border-t-0 lg:border-l border-slate-100 p-5 md:p-6 overflow-hidden">
                          
                          {/* 1. 인스타 헤더 */}
                          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-shrink-0">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[1.5px]">
                                <div className="w-full h-full rounded-full bg-white p-[1px]">
                                  <div className="w-full h-full rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold">
                                    AI
                                  </div>
                                </div>
                              </div>
                              <div>
                                <span className="font-extrabold text-slate-900 text-xs">ai_newsroom_official</span>
                                <span className="text-[10px] text-slate-400 block">스폰서 기사 · AI Newsroom</span>
                              </div>
                            </div>
                            <MoreHorizontal className="w-4 h-4 text-slate-400" />
                          </div>

                          {/* 2. 본문 직접 편집 영역 & 해시태그 (유동 스크롤 지원) */}
                          <div className="flex-1 py-3 space-y-3 overflow-y-auto pr-1">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-extrabold text-[#23211F] flex items-center gap-1">
                                  ✏️ 캡션 및 본문 직접 편집
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold">
                                  {currentData.text.length}자
                                </span>
                              </div>
                              <textarea
                                value={currentData.text}
                                onChange={(e) => updatePlatformField("instagram", "text", e.target.value)}
                                rows={5}
                                className="w-full p-3 bg-slate-50 hover:bg-white focus:bg-white rounded-xl border border-slate-200 focus:border-[#23211F] text-xs text-slate-900 leading-relaxed outline-none transition font-sans resize-none shadow-2xs"
                                placeholder="인스타그램 게시글 내용을 직접 수정하세요..."
                              />
                            </div>

                            {/* 추천 해시태그 원클릭 삽입 */}
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-bold text-slate-400 block">
                                + 추천 해시태그 원클릭 삽입:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {["#AI반도체", "#NPU", "#PIM", "#빅테크", "#IT뉴스", "#디지털인텔리전스"].map((tag) => (
                                  <button
                                    key={tag}
                                    onClick={() => addHashtag("instagram", tag)}
                                    className="px-2.5 py-1 bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] rounded-full text-[11px] font-bold transition border border-[#DDD6CB] cursor-pointer flex items-center gap-1 active:scale-95 shadow-2xs"
                                  >
                                    <Hash className="w-3 h-3 text-slate-400" />
                                    <span>{tag.replace("#", "")}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* 3. 소셜 인터랙션 및 액션 바 */}
                          <div className="pt-3 border-t border-slate-100 space-y-3 flex-shrink-0">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3.5 text-slate-700">
                                <Heart className="w-5 h-5 text-red-500 fill-red-500" />
                                <MessageCircle className="w-5 h-5" />
                                <Share2 className="w-5 h-5" />
                              </div>
                              <Bookmark className="w-5 h-5 text-slate-600" />
                            </div>
                            <p className="font-bold text-xs text-slate-900">좋아요 1,428개</p>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => handleCopyText("instagram")}
                                className="flex-1 py-2 bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] font-bold text-xs rounded-full border border-[#DDD6CB] transition cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                {copiedStatus === "instagram" ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span className="text-emerald-700">복사 완료!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5 text-slate-600" />
                                    <span>문구 복사</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handlePublish("Instagram")}
                                className="px-5 py-2 bg-[#23211F] hover:bg-[#38332E] text-[#FAF8F5] font-extrabold text-xs rounded-full transition cursor-pointer flex items-center gap-1.5 border border-[#23211F] active:scale-95"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>단독 배포</span>
                              </button>
                            </div>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* [B] THREADS 실시간 메인 피드 에디터 */}
                    {activePlatformTab === "threads" && (
                      <div className="bg-white rounded-3xl shadow-md border border-slate-200/90 overflow-hidden w-full grid grid-cols-1 lg:grid-cols-12 min-h-[440px] lg:h-[500px] animate-float-in">
                        {/* [스레드 프로필 헤더] */}
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#23211F] text-white flex items-center justify-center font-extrabold text-sm flex-shrink-0">
                            @
                          </div>
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-slate-950 text-xs">ai_newsroom</span>
                                <span className="text-[10px] text-slate-400">방금 전</span>
                              </div>
                              <MoreHorizontal className="w-4 h-4 text-slate-400" />
                            </div>

                            {/* 스레드 인라인 직접 텍스트 편집 */}
                            <div className="space-y-1">
                              <textarea
                                value={currentData.text}
                                onChange={(e) => updatePlatformField("threads", "text", e.target.value)}
                                rows={4}
                                className="w-full p-3 bg-slate-50 hover:bg-white focus:bg-white rounded-xl border border-slate-200 focus:border-[#23211F] text-xs text-slate-900 leading-relaxed outline-none transition font-sans resize-y"
                                placeholder="스레드 내용을 직접 수정하세요..."
                              />
                            </div>

                            {/* 인터랙티브 마우스 드래그 이미지 영역 */}
                            <div
                              onMouseDown={handleMouseDown}
                              onWheel={handleWheel}
                              className={`relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 select-none group ${
                                isDragging ? "cursor-grabbing" : "cursor-grab"
                              } ${
                                currentData.aspectRatio === "1:1"
                                  ? "aspect-square"
                                  : currentData.aspectRatio === "4:5"
                                  ? "aspect-[4/5]"
                                  : "aspect-video"
                              }`}
                              title="마우스로 드래그하여 이미지 위치 조절 (휠: 확대/축소)"
                            >
                              <img
                                src={currentData.image}
                                alt="Threads Media"
                                draggable={false}
                                style={{
                                  transform: `scale(${currentData.zoom / 100})`,
                                  objectPosition: `${currentData.positionX}% ${currentData.positionY}%`
                                }}
                                className="w-full h-full object-cover pointer-events-none transition-transform duration-75"
                              />

                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                <div className="bg-[#23211F]/80 backdrop-blur-xs text-[#FAF8F5] text-[11px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-md border border-white/20">
                                  <Move className="w-3.5 h-3.5" />
                                  <span>드래그로 위치 조절</span>
                                </div>
                              </div>
                            </div>

                            {/* 스레드 인터랙션 아이콘 */}
                            <div className="flex items-center gap-4 text-slate-500 pt-1">
                              <Heart className="w-4 h-4 hover:text-red-500 transition cursor-pointer" />
                              <MessageCircle className="w-4 h-4" />
                              <Repeat className="w-4 h-4" />
                              <Share2 className="w-4 h-4" />
                            </div>

                            {/* 해시태그 추가 바 */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {["#ThreadsTech", "#AI반도체", "#기술트렌드"].map((tag) => (
                                <button
                                  key={tag}
                                  onClick={() => addHashtag("threads", tag)}
                                  className="px-2.5 py-1 bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] rounded-full text-[11px] font-bold transition border border-[#DDD6CB] cursor-pointer"
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>

                          </div>
                        </div>
                      </div>
                    )}

                    {/* [C] X (TWITTER) 실시간 메인 피드 에디터 */}
                    {activePlatformTab === "twitter" && (
                      <div className="bg-white rounded-3xl shadow-xl border border-slate-200/90 p-5 md:p-6 w-full max-w-md animate-float-in space-y-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#23211F] text-white flex items-center justify-center font-extrabold text-xs">
                            𝕏
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-slate-950 text-xs">AI Newsroom</span>
                              <span className="text-[11px] text-slate-400">@ainews</span>
                            </div>
                          </div>
                        </div>

                        {/* 트위터 인라인 텍스트 편집 */}
                        <div className="space-y-1">
                          <textarea
                            value={currentData.text}
                            onChange={(e) => updatePlatformField("twitter", "text", e.target.value)}
                            rows={3}
                            className="w-full p-3 bg-slate-50 hover:bg-white focus:bg-white rounded-xl border border-slate-200 focus:border-[#23211F] text-xs text-slate-900 leading-relaxed outline-none transition font-sans resize-y"
                            placeholder="트윗 내용을 직접 수정하세요..."
                          />
                        </div>

                        {/* 인터랙티브 마우스 드래그 이미지 영역 */}
                        <div
                          onMouseDown={handleMouseDown}
                          onWheel={handleWheel}
                          className={`relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 select-none group ${
                            isDragging ? "cursor-grabbing" : "cursor-grab"
                          } ${
                            currentData.aspectRatio === "1:1"
                              ? "aspect-square"
                              : currentData.aspectRatio === "4:5"
                              ? "aspect-[4/5]"
                              : "aspect-video"
                          }`}
                          title="마우스로 드래그하여 이미지 위치 조절 (휠: 확대/축소)"
                        >
                          <img
                            src={currentData.image}
                            alt="Twitter Media"
                            draggable={false}
                            style={{
                              transform: `scale(${currentData.zoom / 100})`,
                              objectPosition: `${currentData.positionX}% ${currentData.positionY}%`
                            }}
                            className="w-full h-full object-cover pointer-events-none transition-transform duration-75"
                          />

                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <div className="bg-[#23211F]/80 backdrop-blur-xs text-[#FAF8F5] text-[11px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-md border border-white/20">
                              <Move className="w-3.5 h-3.5" />
                              <span>드래그로 위치 조절</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-slate-100">
                          <span>오후 3:20 · 2026년 10월 2일</span>
                          <div className="flex items-center gap-3.5">
                            <MessageCircle className="w-3.5 h-3.5" />
                            <Repeat className="w-3.5 h-3.5" />
                            <Heart className="w-3.5 h-3.5 text-red-500" />
                          </div>
                        </div>

                        {/* 해시태그 추가 */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {["#AI반도체", "#NPU", "#IT뉴스"].map((tag) => (
                            <button
                              key={tag}
                              onClick={() => addHashtag("twitter", tag)}
                              className="px-2.5 py-1 bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] rounded-full text-[11px] font-bold transition border border-[#DDD6CB] cursor-pointer"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>

                  {/* 피드 하단 퀵 액션 바 (문구 복사 & 단독 배포) */}
                  <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => handleCopyText(activePlatformTab)}
                      className="px-4 py-2 bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] font-bold text-xs rounded-full border border-[#DDD6CB] transition cursor-pointer flex items-center gap-1.5 active:scale-95"
                    >
                      {copiedStatus === activePlatformTab ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">복사 완료!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-600" />
                          <span>{currentPlatformInfo.label} 문구 복사</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handlePublish(currentPlatformInfo.label)}
                      className="px-5 py-2 bg-[#23211F] hover:bg-[#38332E] text-[#FAF8F5] font-extrabold text-xs rounded-full transition cursor-pointer flex items-center gap-1.5 border border-[#23211F] active:scale-95 shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{currentPlatformInfo.label} 단독 배포</span>
                    </button>
                  </div>

                </div>
              )}

            </div>
          )}

        </div>

      </div>

      {/* ──────────────────────────────────────────
          3. 최종 결과물 영역 (하단 멀티 배포 대시보드 - 기존 기능 유지)
         ────────────────────────────────────────── */}
      {selectedPlatforms.length > 0 && (
        <div className="bg-white/95 rounded-3xl border border-slate-200/90 p-5 md:p-7 shadow-xs space-y-5 animate-float-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base md:text-lg font-black text-slate-950 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-700" />
                최종 결과물 및 멀티 배포 대시보드
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                작업이 완료된 플랫폼별 결과물을 한눈에 점검하고 파일 저장, 인쇄 또는 즉시 배포합니다.
              </p>
            </div>

            <span className="text-xs font-extrabold px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 self-start sm:self-auto">
              {selectedPlatforms.length}개 플랫폼 배포 준비 완료
            </span>
          </div>

          {/* 최종 결과물 카드 요약 그리드 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {selectedPlatforms.map((pid) => {
              const pInfo = platforms.find((p) => p.id === pid);
              const pData = platformData[pid];
              return (
                <div
                  key={pid}
                  className="bg-[#EFECE6]/40 p-4 rounded-2xl border border-[#DDD6CB] space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs md:text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                        {pInfo && <pInfo.icon className="w-3.5 h-3.5" />}
                        {pInfo?.label}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                        준비됨
                      </span>
                    </div>

                    <div className="aspect-video rounded-xl overflow-hidden border border-slate-200 bg-slate-200">
                      <img src={pData.image} alt="final preview" className="w-full h-full object-cover" />
                    </div>

                    <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed font-sans">
                      {pData.text}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleCopyText(pid)}
                      className="flex-1 py-1.5 bg-white hover:bg-[#EFECE6] border border-[#DDD6CB] text-[#23211F] text-xs font-bold rounded-full transition cursor-pointer"
                    >
                      문구 복사
                    </button>
                    <button
                      onClick={() => handlePublish(pInfo?.label)}
                      className="px-3.5 py-1.5 bg-[#23211F] hover:bg-[#38332E] text-white text-xs font-bold rounded-full transition cursor-pointer border border-[#23211F]"
                    >
                      배포
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 최종 액션 바 (인쇄, 데이터 저장, 일괄 배포) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2.5">
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] border border-[#DDD6CB] rounded-full text-xs font-extrabold transition shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>결과물 인쇄 (PDF)</span>
              </button>

              <button
                onClick={() => alert("선택된 플랫폼의 가공된 이미지 및 텍스트 데이터가 저장되었습니다.")}
                className="px-4 py-2 bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] border border-[#DDD6CB] rounded-full text-xs font-extrabold transition shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>이미지 및 데이터 저장</span>
              </button>
            </div>

            <button
              onClick={() => handlePublish("선택 플랫폼 전체")}
              disabled={isPublishing}
              className="px-6 py-2.5 bg-[#23211F] hover:bg-[#38332E] text-[#FAF8F5] rounded-full text-xs md:text-sm font-extrabold transition shadow-sm cursor-pointer flex items-center gap-2 border border-[#23211F] active:scale-95"
            >
              {isPublishing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>배포 처리 중...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 text-white" />
                  <span>선택된 플랫폼 일괄 배포</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 배포 성공 모달 팝업 */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl space-y-4 text-center animate-float-in border border-slate-100">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <h3 className="text-lg font-black text-slate-950">배포가 완료되었습니다</h3>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              [{publishedTarget}] 대상 채널에 최적화된 콘텐츠 규격으로 전송이 성공적으로 완료되었습니다.
            </p>
            <button
              onClick={() => setIsPublishModalOpen(false)}
              className="w-full py-2.5 bg-[#23211F] hover:bg-[#38332E] text-white font-extrabold text-xs rounded-full shadow-xs cursor-pointer transition border border-[#23211F]"
            >
              확인
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
