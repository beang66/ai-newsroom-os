import React, { useState, useRef } from "react";
import {
  Sparkles,
  Upload,
  Image as ImageIcon,
  Copy,
  Printer,
  Send,
  Check,
  Sliders,
  Download,
  FileText,
  Hash,
  Share2,
  Heart,
  MessageCircle,
  Repeat,
  Bookmark,
  MoreHorizontal,
  ChevronRight,
  Move,
  Maximize2,
  Layers,
  ArrowRight,
  CheckSquare,
  Square
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

  // 2. 플랫폼 다중 선택 (초기 진입 시는 간결한 초기 상태를 위해 비어있거나 선택 가능)
  // 사용자가 원하는 플랫폼을 체크하면 오른쪽 편집기가 확장됩니다.
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
      text: `GPU 중심 연산의 한계를 뛰어넘는 국내 AI 반도체 기술의 급부상! 🧵\n\n기존 대비 전력 소비 70% 감소, 데이터 병목 현상을 해결한 초거대 AI 지원 반도체 현장을 취재했습니다.\n\n알고리즘 최적화와 함께 펼쳐지는 글로벌 패권 경쟁, 여러분의 의견은 어떠신가요?`,
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
      desc: "이미지 중심 · 1:1/4:5/16:9 · 캡션 및 해시태그",
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
      // 활성 탭 동기화
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

  // 현재 활성 탭 플랫폼 정보
  const currentPlatformInfo = platforms.find((p) => p.id === activePlatformTab);
  const currentData = platformData[activePlatformTab];

  return (
    <div className="w-full space-y-6 animate-float-in">

      {/* ──────────────────────────────────────────
          1. 상단 타이틀 & 대상 기사 선택 바
         ────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-white/90 rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100/90 rounded-full text-xs font-extrabold text-slate-800 mb-1.5 border border-slate-200/60">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>원스톱 소셜 변환 스튜디오</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
              소셜 미디어 플랫폼 변환
            </h2>
            <p className="text-xs md:text-sm text-slate-500 font-medium">
              선택한 기사 원문을 각 소셜 채널 특성에 맞춘 최적의 이미지 비율과 문구로 가공·배포합니다.
            </p>
          </div>

          {/* 대상 기사 선택기 */}
          <div className="bg-slate-50/90 p-2.5 px-3.5 rounded-2xl border border-slate-200/90 min-w-[280px]">
            <span className="text-[11px] font-bold text-slate-400 block mb-0.5">변환 대상 기사</span>
            <select
              value={selectedArticle.id}
              onChange={(e) => {
                const art = initialArticles.find((a) => a.id === parseInt(e.target.value));
                if (art) setSelectedArticle(art);
              }}
              className="w-full bg-transparent text-xs md:text-sm font-extrabold text-slate-800 outline-none cursor-pointer"
            >
              {initialArticles.map((art) => (
                <option key={art.id} value={art.id}>
                  {art.title.slice(0, 26)}...
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────
          2단 메인 레이아웃
          [왼쪽] 플랫폼 선택 & 컨트롤 영역 (w-full lg:w-72 xl:w-80)
          [오른쪽] 대형 콘텐츠 편집 & 실시간 미리보기 영역 (flex-1)
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
              <span className="text-[11px] font-extrabold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full border border-slate-200/70">
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
                    className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center justify-between group ${
                      isSelected
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                        : "bg-slate-50/70 hover:bg-slate-100/90 text-slate-800 border-slate-200/70"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* 체크박스 UI */}
                      <div className="flex-shrink-0">
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-md bg-white text-slate-950 flex items-center justify-center shadow-xs">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-md border-2 border-slate-300 bg-white group-hover:border-slate-400 transition" />
                        )}
                      </div>

                      {/* 플랫폼 아이콘 & 명칭 */}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Icon className={`w-4 h-4 ${isSelected ? "text-white" : "text-slate-700"}`} />
                          <span className="text-sm font-extrabold tracking-tight">{p.label}</span>
                        </div>
                        <span className={`text-[11px] block mt-0.5 ${isSelected ? "text-slate-300" : "text-slate-400"}`}>
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

            {/* 빠른 선택 가이드 메시지 */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/60 text-[11px] text-slate-500 leading-relaxed font-medium">
              💡 플랫폼을 체크하면 오른쪽에 해당 포맷에 최적화된 <strong className="text-slate-700">대형 편집기</strong>와 <strong className="text-slate-700">실시간 피드 미리보기</strong>가 바로 열립니다.
            </div>
          </div>

          {/* 작업 요약 및 배포 대상 위젯 */}
          {selectedPlatforms.length > 0 && (
            <div className="bg-white/95 rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3 animate-float-in">
              <span className="text-xs font-extrabold text-slate-900 block">배포 대기 채널</span>
              <div className="space-y-1.5">
                {selectedPlatforms.map((pid) => {
                  const p = platforms.find((item) => item.id === pid);
                  return (
                    <div
                      key={pid}
                      onClick={() => setActivePlatformTab(pid)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        activePlatformTab === pid
                          ? "bg-slate-100 text-slate-950 border-slate-300"
                          : "bg-slate-50 text-slate-600 border-slate-200/60 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {p && <p.icon className="w-3.5 h-3.5" />}
                        <span>{p?.label}</span>
                      </div>
                      <span className="text-[10px] text-emerald-600 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                        준비됨
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 일괄 배포 퀵 버튼 */}
              <button
                onClick={() => handlePublish("선택 플랫폼 전체")}
                disabled={isPublishing}
                className="w-full mt-2 py-3 bg-slate-950 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>선택된 {selectedPlatforms.length}개 채널 동시 배포</span>
              </button>
            </div>
          )}

        </div>

        {/* ──────────────────────────────────────────
            [오른쪽] 대형 콘텐츠 편집 & 실시간 미리보기 영역
           ────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 w-full transition-all duration-300">
          
          {selectedPlatforms.length === 0 ? (
            /* 초기 상태: 플랫폼을 선택하지 않았을 때의 간결한 안내 뷰 */
            <div className="bg-white/95 rounded-3xl border border-slate-200/80 p-12 md:p-16 text-center space-y-4 shadow-xs">
              <div className="w-16 h-16 rounded-3xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto border border-slate-200">
                <Sparkles className="w-8 h-8 text-slate-400" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h4 className="text-lg font-black text-slate-900">
                  변환할 소셜 플랫폼을 선택해주세요
                </h4>
                <p className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium">
                  왼쪽 컨트롤 영역에서 <strong>Instagram, Threads, X</strong> 중 원하는 플랫폼을 체크하면, 최적화된 대형 편집 화면과 실시간 피드 미리보기가 활성화됩니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {platforms.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    <p.icon className="w-3.5 h-3.5" />
                    <span>{p.label} 추가</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* 플랫폼 선택 후: 대형 워크스페이스 활성화 */
            <div className="space-y-6">

              {/* 복수 플랫폼 선택 시 상단 탭 스위처 */}
              {selectedPlatforms.length > 1 && (
                <div className="flex items-center gap-2 bg-white/90 p-2 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <span className="text-xs font-extrabold text-slate-400 px-2">현재 편집 채널:</span>
                  <div className="flex items-center gap-1.5 flex-wrap flex-1">
                    {selectedPlatforms.map((pid) => {
                      const p = platforms.find((item) => item.id === pid);
                      const isCurrent = activePlatformTab === pid;
                      return (
                        <button
                          key={pid}
                          onClick={() => setActivePlatformTab(pid)}
                          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${
                            isCurrent
                              ? "bg-slate-950 text-white shadow-xs"
                              : "bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
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

              {/* 활성 플랫폼의 대형 편집 & 실시간 미리보기 2열 그리드 */}
              {currentPlatformInfo && currentData && (
                <div className="bg-white/95 rounded-3xl border border-slate-200/80 p-5 md:p-8 shadow-xs space-y-8 animate-float-in">
                  
                  {/* 플랫폼 편집 헤더 */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-2xl bg-gradient-to-br ${currentPlatformInfo.themeColor} text-white shadow-2xs`}>
                        <currentPlatformInfo.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base md:text-lg font-black text-slate-950">
                          {currentPlatformInfo.label} 전용 콘텐츠 제작
                        </h3>
                        <p className="text-xs text-slate-400 font-medium">
                          {currentPlatformInfo.desc}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold px-3 py-1 bg-slate-100 text-slate-700 rounded-full border border-slate-200/80">
                        포맷 규격: {currentData.aspectRatio}
                      </span>
                    </div>
                  </div>

                  {/* 2열 레이아웃: [왼쪽 6] 이미지 & 텍스트 대형 편집 / [오른쪽 6] 실시간 소셜 피드 미리보기 */}
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                    
                    {/* [좌측 대형 편집 컨트롤 - 7/12] */}
                    <div className="xl:col-span-7 space-y-6">

                      {/* 1. 이미지 편집 섹션 */}
                      <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-xs md:text-sm font-extrabold text-slate-900 flex items-center gap-2">
                            <ImageIcon className="w-4 h-4 text-slate-700" />
                            <span>1. 기사 이미지 선택 및 실시간 조절</span>
                          </label>

                          {/* 비율 선택 토글 */}
                          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                            {["1:1", "4:5", "16:9"].map((ratio) => (
                              <button
                                key={ratio}
                                onClick={() => updatePlatformField(activePlatformTab, "aspectRatio", ratio)}
                                className={`px-2.5 py-1 text-xs font-extrabold rounded-lg transition cursor-pointer ${
                                  currentData.aspectRatio === ratio
                                    ? "bg-slate-900 text-white shadow-xs"
                                    : "text-slate-500 hover:text-slate-800"
                                }`}
                              >
                                {ratio}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 추천 갤러리 썸네일 */}
                        <div>
                          <span className="text-[11px] font-bold text-slate-400 block mb-2">기사 추천 이미지 선택</span>
                          <div className="grid grid-cols-4 gap-2.5">
                            {sampleImages.map((imgUrl, idx) => (
                              <div
                                key={idx}
                                onClick={() => updatePlatformField(activePlatformTab, "image", imgUrl)}
                                className={`relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition ${
                                  currentData.image === imgUrl
                                    ? "border-slate-950 ring-2 ring-slate-900/20 scale-102"
                                    : "border-transparent opacity-75 hover:opacity-100"
                                }`}
                              >
                                <img src={imgUrl} alt="sample" className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 업로드 및 Zoom / Crop 조절 바 */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/60">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 rounded-xl text-xs font-extrabold transition shadow-2xs cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5 text-slate-600" />
                            <span>내 PC 파일 업로드</span>
                          </button>
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={(e) => handleImageUpload(e, activePlatformTab)}
                            accept="image/*"
                            className="hidden"
                          />

                          {/* Zoom 슬라이더 */}
                          <div className="flex items-center gap-2 text-xs text-slate-600 font-bold bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                            <Sliders className="w-3.5 h-3.5 text-slate-500" />
                            <span>크기:</span>
                            <input
                              type="range"
                              min="80"
                              max="150"
                              value={currentData.zoom}
                              onChange={(e) => updatePlatformField(activePlatformTab, "zoom", parseInt(e.target.value))}
                              className="w-20 md:w-24 accent-slate-900 cursor-pointer"
                            />
                            <span className="text-[11px] font-black text-slate-900 w-8">{currentData.zoom}%</span>
                          </div>
                        </div>

                        {/* 위치 조절 (Crop / Align 슬라이더) */}
                        <div className="grid grid-cols-2 gap-3 pt-1 text-xs text-slate-600 font-bold">
                          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                            <Move className="w-3.5 h-3.5 text-slate-400" />
                            <span>수평 위치:</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={currentData.positionX}
                              onChange={(e) => updatePlatformField(activePlatformTab, "positionX", parseInt(e.target.value))}
                              className="w-full accent-slate-900 cursor-pointer"
                            />
                          </div>
                          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                            <Move className="w-3.5 h-3.5 text-slate-400" />
                            <span>수직 위치:</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={currentData.positionY}
                              onChange={(e) => updatePlatformField(activePlatformTab, "positionY", parseInt(e.target.value))}
                              className="w-full accent-slate-900 cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 2. 텍스트 직접 편집 섹션 */}
                      <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-xs md:text-sm font-extrabold text-slate-900 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-700" />
                            <span>2. 게시 텍스트 및 해시태그 직접 편집</span>
                          </label>
                          <span className="text-xs font-extrabold text-slate-400">
                            {currentData.text.length}자
                          </span>
                        </div>

                        {/* 제목 편집 */}
                        <div>
                          <span className="text-[11px] font-bold text-slate-400 block mb-1">헤드라인 제목</span>
                          <input
                            type="text"
                            value={currentData.title}
                            onChange={(e) => updatePlatformField(activePlatformTab, "title", e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs md:text-sm font-extrabold text-slate-900 outline-none focus:border-slate-800 transition"
                            placeholder="게시물 대표 제목 입력..."
                          />
                        </div>

                        {/* 본문 / 캡션 편집 */}
                        <div>
                          <span className="text-[11px] font-bold text-slate-400 block mb-1">게시글 본문 / 캡션</span>
                          <textarea
                            value={currentData.text}
                            onChange={(e) => updatePlatformField(activePlatformTab, "text", e.target.value)}
                            rows={6}
                            className="w-full p-3.5 bg-white border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 leading-relaxed outline-none focus:border-slate-800 transition font-sans"
                            placeholder="소셜 채널에 등록될 본문을 직접 수정하세요..."
                          />
                        </div>

                        {/* 추천 해시태그 원클릭 추가 */}
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[11px] font-bold text-slate-400 block">추천 해시태그 원클릭 추가:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {["#AI반도체", "#NPU", "#PIM", "#빅테크", "#IT뉴스", "#디지털인텔리전스"].map((tag) => (
                              <button
                                key={tag}
                                onClick={() => addHashtag(activePlatformTab, tag)}
                                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition border border-slate-200/80 cursor-pointer flex items-center gap-1 shadow-2xs"
                              >
                                <Hash className="w-3 h-3 text-slate-400" />
                                <span>{tag.replace("#", "")}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* [우측 실시간 소셜 피드 미리보기 - 5/12] */}
                    <div className="xl:col-span-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs md:text-sm font-extrabold text-slate-800 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          실시간 피드 형태 미리보기
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">수정 내용이 즉시 반영됩니다</span>
                      </div>

                      {/* 실시간 피드 목업 컨테이너 */}
                      <div className="bg-slate-100/70 p-4 md:p-5 rounded-3xl border border-slate-200/90 shadow-inner">

                        {/* 1. INSTAGRAM 피드 목업 */}
                        {activePlatformTab === "instagram" && (
                          <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden text-xs md:text-sm max-w-sm mx-auto animate-float-in">
                            {/* 헤더 */}
                            <div className="p-3 flex items-center justify-between border-b border-slate-100">
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

                            {/* 이미지 (비율 및 Zoom/Position 실시간 반영) */}
                            <div
                              className={`relative overflow-hidden bg-slate-100 ${
                                currentData.aspectRatio === "1:1"
                                  ? "aspect-square"
                                  : currentData.aspectRatio === "4:5"
                                  ? "aspect-[4/5]"
                                  : "aspect-video"
                              }`}
                            >
                              <img
                                src={currentData.image}
                                alt="Instagram Preview"
                                style={{
                                  transform: `scale(${currentData.zoom / 100})`,
                                  objectPosition: `${currentData.positionX}% ${currentData.positionY}%`
                                }}
                                className="w-full h-full object-cover transition-all duration-200"
                              />
                            </div>

                            {/* 인터랙션 & 텍스트 */}
                            <div className="p-4 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3.5 text-slate-700">
                                  <Heart className="w-5 h-5 text-red-500 fill-red-500" />
                                  <MessageCircle className="w-5 h-5" />
                                  <Share2 className="w-5 h-5" />
                                </div>
                                <Bookmark className="w-5 h-5 text-slate-600" />
                              </div>

                              <p className="font-bold text-xs text-slate-900">좋아요 1,428개</p>

                              <div className="text-xs text-slate-900 leading-relaxed space-y-1">
                                <span className="font-extrabold mr-1.5 text-slate-950">ai_newsroom_official</span>
                                <span className="whitespace-pre-line">{currentData.text}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 2. THREADS 피드 목업 */}
                        {activePlatformTab === "threads" && (
                          <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-4 md:p-5 text-xs md:text-sm max-w-sm mx-auto space-y-3.5 animate-float-in">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-950 text-white flex items-center justify-center font-extrabold text-xs flex-shrink-0">
                                @
                              </div>
                              <div className="flex-1 space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-extrabold text-slate-950 text-xs">ai_newsroom</span>
                                    <span className="text-[10px] text-slate-400">방금 전</span>
                                  </div>
                                  <MoreHorizontal className="w-4 h-4 text-slate-400" />
                                </div>

                                <p className="text-xs text-slate-900 leading-relaxed whitespace-pre-line">
                                  {currentData.text}
                                </p>

                                <div
                                  className={`rounded-xl overflow-hidden border border-slate-200 ${
                                    currentData.aspectRatio === "1:1"
                                      ? "aspect-square"
                                      : currentData.aspectRatio === "4:5"
                                      ? "aspect-[4/5]"
                                      : "aspect-video"
                                  }`}
                                >
                                  <img
                                    src={currentData.image}
                                    alt="Threads Media"
                                    style={{
                                      transform: `scale(${currentData.zoom / 100})`,
                                      objectPosition: `${currentData.positionX}% ${currentData.positionY}%`
                                    }}
                                    className="w-full h-full object-cover transition-all duration-200"
                                  />
                                </div>

                                <div className="flex items-center gap-4 text-slate-500 pt-1">
                                  <Heart className="w-4 h-4 hover:text-red-500 transition cursor-pointer" />
                                  <MessageCircle className="w-4 h-4" />
                                  <Repeat className="w-4 h-4" />
                                  <Share2 className="w-4 h-4" />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 3. X (TWITTER) 피드 목업 */}
                        {activePlatformTab === "twitter" && (
                          <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-4 md:p-5 text-xs md:text-sm max-w-sm mx-auto space-y-3.5 animate-float-in">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-slate-950 text-white flex items-center justify-center font-extrabold text-xs">
                                𝕏
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-extrabold text-slate-950 text-xs">AI Newsroom</span>
                                  <span className="text-[11px] text-slate-400">@ainews</span>
                                </div>
                              </div>
                            </div>

                            <p className="text-xs text-slate-900 leading-relaxed whitespace-pre-line">
                              {currentData.text}
                            </p>

                            <div
                              className={`rounded-xl overflow-hidden border border-slate-200 ${
                                currentData.aspectRatio === "1:1"
                                  ? "aspect-square"
                                  : currentData.aspectRatio === "4:5"
                                  ? "aspect-[4/5]"
                                  : "aspect-video"
                              }`}
                            >
                              <img
                                src={currentData.image}
                                alt="Twitter Media"
                                style={{
                                  transform: `scale(${currentData.zoom / 100})`,
                                  objectPosition: `${currentData.positionX}% ${currentData.positionY}%`
                                }}
                                className="w-full h-full object-cover transition-all duration-200"
                              />
                            </div>

                            <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-slate-100">
                              <span>오후 3:20 · 2026년 10월 2일</span>
                              <div className="flex items-center gap-3.5">
                                <MessageCircle className="w-3.5 h-3.5" />
                                <Repeat className="w-3.5 h-3.5" />
                                <Heart className="w-3.5 h-3.5 text-red-500" />
                              </div>
                            </div>
                          </div>
                        )}

                      </div>

                      {/* 미리보기 하단 복사 & 개별 배포 액션 */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleCopyText(activePlatformTab)}
                          className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
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
                          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{currentPlatformInfo.label} 단독 배포</span>
                        </button>
                      </div>

                    </div>

                  </div>

                </div>
              )}

            </div>
          )}

        </div>

      </div>

      {/* ──────────────────────────────────────────
          8. 최종 결과물 영역 (하단 대시보드)
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
                  className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 space-y-3 flex flex-col justify-between"
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
                      className="flex-1 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
                    >
                      문구 복사
                    </button>
                    <button
                      onClick={() => handlePublish(pInfo?.label)}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition cursor-pointer"
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
                className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-extrabold transition shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>결과물 인쇄 (PDF)</span>
              </button>

              <button
                onClick={() => alert("선택된 플랫폼의 가공된 이미지 및 텍스트 데이터가 저장되었습니다.")}
                className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-extrabold transition shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>이미지 및 데이터 저장</span>
              </button>
            </div>

            <button
              onClick={() => handlePublish("선택 플랫폼 전체")}
              disabled={isPublishing}
              className="px-6 py-2.5 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-xs md:text-sm font-extrabold transition shadow-sm cursor-pointer flex items-center gap-2"
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
              className="w-full py-2.5 bg-slate-950 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer hover:bg-slate-800 transition"
            >
              확인
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
