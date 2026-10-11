import React, { useState } from "react";
import {
  Search,
  Mic,
  Image as ImageIcon,
  Sparkles,
  History,
  Check,
  ChevronDown,
  FileText,
} from "lucide-react";
import DataMapView from "../features/data-map/DataMapView.jsx";

// ponytail: 원고 목록은 코어에 있다(GET /api/articles) — 하지만 다른 원고를 편집기로 여는 API 가 없어 지금 쓰는 기사 하나만 보인다. 여는 API 가 생기면 목록을 붙인다
export default function ArchiveView({ article }) {
  const articles = [article];
  const selectedArticle = article;
  const sources = article.sources || [];
  const interviews = article.linkedInterviews || [];
  const convertedItems = article.cardNews || [];
  const [selectedTab, setSelectedTab] = useState("all"); // all | draft | published
  const [activeStackTab, setActiveStackTab] = useState("article"); // article | sources | interview
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const filteredArticles = articles.filter((art) => {
    if (selectedTab === "draft") return art.status === "작성 중";
    if (selectedTab === "published") return art.status === "발행본";
    return true;
  }).filter((art) => {
    if (!searchQuery.trim()) return true;
    return (
      (art.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (art.subtitle || "").toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="w-full animate-float-in pb-10">
      <section className="relative z-40 mb-5 rounded-[24px] bg-white px-5 py-4 shadow-[0_12px_34px_rgba(40,35,25,0.08)] sm:px-6" aria-labelledby="archive-context-title">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1EDF8] text-[#6F579A]">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="archive-context-title" className="text-sm font-extrabold text-[#292B2F]">현재 탐색 기사</h2>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                  selectedArticle.status === "작성 중"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-emerald-100 text-emerald-900"
                }`}>
                  {selectedArticle.status}
                </span>
              </div>
              <p className="mt-1 truncate text-base font-bold text-[#292B2F]">{selectedArticle.title || "제목 없는 기사"}</p>
              <p className="mt-1 text-xs leading-5 text-[#706A63]">
                이 기사를 기준으로 원고, 취재자료, Markdown 링크의 연결을 탐색합니다.
              </p>
            </div>
          </div>

          <dl className="flex shrink-0 items-center gap-5 border-y border-[#ECE8E2] py-3 xl:border-x xl:border-y-0 xl:px-5 xl:py-0">
            <div>
              <dt className="text-[10px] font-bold text-[#817A72]">취재자료</dt>
              <dd className="mt-0.5 text-sm font-extrabold tabular-nums text-[#292B2F]">{sources.length + selectedArticle.linkedSources.length}건</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold text-[#817A72]">녹취</dt>
              <dd className="mt-0.5 text-sm font-extrabold tabular-nums text-[#292B2F]">{interviews.length}건</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold text-[#817A72]">미디어</dt>
              <dd className="mt-0.5 text-sm font-extrabold tabular-nums text-[#292B2F]">{selectedArticle.photos.length}건</dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => setIsSearchOpen((open) => !open)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#292B2F] px-4 text-sm font-bold text-white transition hover:bg-[#414348] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7963B6]"
            aria-expanded={isSearchOpen}
            aria-controls="article-context-picker"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            기사 찾기
            <ChevronDown className={`h-4 w-4 transition-transform ${isSearchOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        </div>

        {isSearchOpen && (
          <div id="article-context-picker" className="mt-4 border-t border-[#ECE8E2] pt-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">기사 제목 검색</span>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#817A72]" aria-hidden="true" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="기사 제목이나 부제 검색"
                  className="h-11 w-full rounded-xl border border-[#DED9D1] bg-[#FAF8F5] pl-10 pr-4 text-sm text-[#292B2F] outline-none transition placeholder:text-[#817A72] focus:border-[#7963B6] focus:ring-2 focus:ring-[#7963B6]/20"
                  autoFocus
                />
              </label>
              <div className="inline-flex rounded-xl bg-[#F4F1EC] p-1" aria-label="기사 상태 필터">
                {[
                  ["all", `전체 ${articles.length}`],
                  ["draft", "작성 중"],
                  ["published", "발행본"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSelectedTab(value)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                      selectedTab === value
                        ? "bg-white text-[#292B2F] shadow-[0_2px_8px_rgba(40,35,25,0.08)]"
                        : "text-[#625C55] hover:text-[#292B2F]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-[#ECE8E2] bg-[#FAF8F5] p-2 custom-scrollbar">
              {filteredArticles.map((art) => (
                <button
                  key={art.id}
                  type="button"
                  onClick={() => setIsSearchOpen(false)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    selectedArticle.id === art.id
                      ? "bg-white font-bold text-[#292B2F] shadow-[0_2px_8px_rgba(40,35,25,0.06)]"
                      : "text-[#57514A] hover:bg-white"
                  }`}
                >
                  <span className="truncate pr-3">{art.title || "제목 없는 기사"}</span>
                  {selectedArticle.id === art.id && <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-label="현재 기사" />}
                </button>
              ))}
              {!filteredArticles.length && (
                <p className="px-3 py-6 text-center text-sm text-[#706A63]">조건에 맞는 기사가 없습니다.</p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 메인 2분할 레이아웃 그리드 (좌측/중앙 대형 영역 + 우측 패널 컬럼) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">

        {/* 관계 탐색과 부속 자산을 한 열에 두되, 기사 선택은 위의 독립 컨텍스트 바가 담당한다. */}
        <div className="lg:col-span-8 flex flex-col">
          <div data-testid="data-map-slot" className="w-full min-h-[380px] overflow-hidden rounded-[28px] bg-white shadow-[0_16px_40px_rgba(40,35,25,0.08)]">
            <DataMapView articleId={article.articleId} />
          </div>

          <div className="mt-4">
            <div className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(40,35,25,0.06)] flex flex-col justify-between gap-3">
              {/* 상단 캡슐 칩 */}
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 bg-[#FAF8F5] px-2.5 py-1 rounded-full border border-white/90 shadow-2xs">
                  <div className="w-2 h-2 rounded-full bg-[#D97706]" />
                  <span className="text-[11px] font-extrabold text-[#292B2F]">미디어 & 변환 자산</span>
                </div>
                <span className="text-[10px] text-[#8E8982] font-semibold">
                  사진 {selectedArticle.photos.length}건 · 변환본 {convertedItems.length}건
                </span>
              </div>

              {/* 3개 컬럼 슬롯 (참고 이미지의 [3개] [3개] [2개] 알약 배치) */}
              <div className="grid grid-cols-3 gap-2">
                {/* 컬럼 1: 사진 슬롯 3개 */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold text-[#8E8982] block text-center">사진 미디어</span>
                  {[0, 1, 2].map((idx) => {
                    const photo = selectedArticle.photos[idx];
                    return (
                      <div
                        key={`photo-slot-${idx}`}
                        className="h-7 px-2 rounded-full bg-[#FAF8F5] border border-white/90 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),0_1px_3px_rgba(40,35,25,0.03)] flex items-center justify-center text-[10px] text-[#292B2F] font-semibold truncate hover:bg-white transition"
                        title={photo?.caption || "미디어 슬롯"}
                      >
                        <ImageIcon className="w-3 h-3 text-[#57514A] mr-1 shrink-0" />
                        <span className="truncate">{photo ? photo.caption || `사진 ${idx + 1}` : `슬롯 ${idx + 1}`}</span>
                      </div>
                    );
                  })}
                </div>

                {/* 컬럼 2: 변환본 슬롯 3개 */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold text-[#8E8982] block text-center">AI 변환</span>
                  {[0, 1, 2].map((idx) => {
                    const item = convertedItems[idx];
                    const label = item ? item.title || item.name || `변환본 ${idx + 1}` : `슬롯 ${idx + 1}`;
                    return (
                      <div
                        key={`convert-slot-${idx}`}
                        className="h-7 px-2 rounded-full bg-[#FAF8F5] border border-white/90 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),0_1px_3px_rgba(40,35,25,0.03)] flex items-center justify-center text-[10px] text-[#292B2F] font-semibold truncate hover:bg-white transition"
                        title={label}
                      >
                        <Sparkles className="w-3 h-3 text-[#D97706] mr-1 shrink-0" />
                        <span className="truncate">{label}</span>
                      </div>
                    );
                  })}
                </div>

                {/* 컬럼 3: 녹취 슬롯 2개 */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold text-[#8E8982] block text-center">녹취·음성</span>
                  {[0, 1].map((idx) => {
                    const label = interviews[idx] ? `녹취 ${idx + 1}` : `슬롯 ${idx + 1}`;
                    return (
                      <div
                        key={`interview-slot-${idx}`}
                        className="h-7 px-2 rounded-full bg-[#FAF8F5] border border-white/90 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),0_1px_3px_rgba(40,35,25,0.03)] flex items-center justify-center text-[10px] text-[#292B2F] font-semibold truncate hover:bg-white transition"
                        title={label}
                      >
                        <Mic className="w-3 h-3 text-[#A855F7] mr-1 shrink-0" />
                        <span className="truncate">{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 하단 구분 대시/슬라이더 라인 */}
              <div className="w-full pt-1">
                <div className="w-full h-1 bg-[#E7E2D9]/70 rounded-full overflow-hidden">
                  <div className="w-3/5 h-full bg-[#292B2F]/40 rounded-full" />
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* 선택한 기사의 자료 묶음과 발행 이력을 보여 주는 보조 열. */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="relative flex-1 flex flex-col justify-center min-h-[340px]">
            {/* 스택 카드 1 (맨 뒤): 인터뷰·녹취 전사본 */}
            <div
              onClick={() => setActiveStackTab("interview")}
              className={`absolute inset-x-0 transition-all duration-300 cursor-pointer rounded-[26px] border border-white/80 p-3.5 shadow-[0_8px_20px_rgba(40,35,25,0.04)] ${
                activeStackTab === "interview"
                  ? "top-0 z-30 bg-white/95 scale-100 shadow-[0_16px_36px_rgba(40,35,25,0.08)]"
                  : "top-0 z-10 bg-[#FAF8F5]/90 scale-[0.94] opacity-80"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {/* 참고 이미지의 좌측 세로 알약형 태그 */}
                <div className="w-2.5 h-6 rounded-full bg-[#A855F7] shadow-xs" />
                <span className="text-xs font-extrabold text-[#292B2F]">인터뷰·녹취 전사본</span>
                <span className="text-[10px] font-bold ml-auto px-2 py-0.5 rounded-full bg-purple-50 text-purple-900">
                  {interviews.length ? `${interviews.length}건` : "없음"}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-white/70 text-xs text-[#57514A] space-y-0.5">
                <p className="font-bold text-[#292B2F] truncate">{interviews.length ? `녹취 ${interviews.length}건 연결됨` : "연결된 녹취가 없어요."}</p>
                <p className="text-[10px] text-[#8E8982] truncate">이 기사에 연결한 녹취 전사본이 여기에 표시됩니다</p>
              </div>
            </div>

            {/* 스택 카드 2 (중간): 취재자료 (출처 데이터) */}
            <div
              onClick={() => setActiveStackTab("sources")}
              className={`absolute inset-x-0 transition-all duration-300 cursor-pointer rounded-[26px] border border-white/85 p-3.5 shadow-[0_10px_24px_rgba(40,35,25,0.05)] ${
                activeStackTab === "sources"
                  ? "top-14 z-30 bg-white/95 scale-100 shadow-[0_16px_36px_rgba(40,35,25,0.08)]"
                  : "top-14 z-20 bg-[#FAF8F5]/95 scale-[0.97] opacity-90"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {/* 참고 이미지의 좌측 세로 알약형 태그 */}
                <div className="w-2.5 h-6 rounded-full bg-[#008285] shadow-xs" />
                <span className="text-xs font-extrabold text-[#292B2F]">
                  취재자료 ({sources.length + selectedArticle.linkedSources.length}건)
                </span>
                <span className="text-[10px] font-bold ml-auto px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
                  {sources.length ? `업로드 ${sources.length}건` : "없음"}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-white/70 text-xs text-[#57514A] space-y-1 max-h-16 overflow-hidden">
                {sources.length === 0 && selectedArticle.linkedSources.length === 0 && (
                  <p className="text-[11px] text-[#8E8982]">연결된 자료가 없어요.</p>
                )}
                {sources.slice(0, 2).map((s) => (
                  <p key={s.id} className="text-[11px] truncate font-medium" title={s.path}>
                    • {s.name}
                  </p>
                ))}
              </div>
            </div>

            {/* 스택 카드 3 (맨 앞/기본 활성): 원고 (Master 원본) */}
            <div
              onClick={() => setActiveStackTab("article")}
              className={`absolute inset-x-0 transition-all duration-300 cursor-pointer rounded-[28px] border border-white/95 p-4 shadow-[0_14px_32px_rgba(40,35,25,0.07)] ${
                activeStackTab === "article"
                  ? "top-28 z-30 bg-white/95 scale-100"
                  : "top-28 z-10 bg-white/80 scale-[0.95] opacity-80"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {/* 참고 이미지의 좌측 세로 알약형 태그 */}
                <div className="w-2.5 h-6 rounded-full bg-[#292B2F] shadow-xs" />
                <span className="text-xs font-extrabold text-[#292B2F]">원고 (Master 본)</span>
                <span className="text-[10px] font-bold ml-auto px-2 py-0.5 rounded-full bg-[#FAF8F5] text-[#292B2F] border border-[#E7E2D9]">
                  최신 판본
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#FAF8F5]/90 border border-white/80 text-xs space-y-1">
                <h4 className="font-extrabold text-[#292B2F] line-clamp-1">
                  {selectedArticle.title}
                </h4>
                <p className="text-[11px] text-[#57514A] line-clamp-2 leading-relaxed">
                  {selectedArticle.content}
                </p>
              </div>
            </div>
          </div>

          {/* 3. 참고 이미지 우측 하단: 비스듬한 스택 카드 덱 (발행 이력 및 타임라인) */}
          <div className="relative pt-2">
            {/* 이미지의 비스듬히 겹쳐진 3D 카드 레이어들 */}
            <div className="absolute inset-x-3 -bottom-2.5 h-16 bg-[#FAF8F5]/70 rounded-[28px] border border-white/70 -rotate-2 pointer-events-none shadow-xs" />
            <div className="absolute inset-x-5 -bottom-4.5 h-16 bg-[#FAF8F5]/50 rounded-[28px] border border-white/50 rotate-2 pointer-events-none shadow-xs" />

            {/* 전면 메인 타임라인 카드 */}
            <div className="relative z-10 bg-white/90 backdrop-blur-md rounded-[28px] border border-white/90 p-3.5 shadow-[0_10px_28px_rgba(40,35,25,0.06)] flex flex-col gap-2">
              {/* 상단 캡슐 칩 + 원형 인디케이터 */}
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 bg-[#FAF8F5] px-2.5 py-1 rounded-full border border-white/90 shadow-2xs">
                  <History className="w-3 h-3 text-[#57514A]" />
                  <span className="text-[11px] font-extrabold text-[#292B2F]">발행 이력 & 타임라인</span>
                </div>
                <div className="w-4 h-4 rounded-full border border-[#E7E2D9] flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#292B2F]" />
                </div>
              </div>

              {/* 타임라인 항목들 */}
              <div className="space-y-1.5 text-xs">
                {[
                  { when: selectedArticle.updatedAt, text: `현재 상태: ${selectedArticle.status}`, badge: "현재", strong: true },
                  { when: selectedArticle.createdAt, text: "작성 시작", badge: "기록", strong: false },
                ].filter((item) => item.when).map((item) => (
                  <div key={item.text} className="p-2 rounded-xl bg-[#FAF8F5]/85 border border-white/70 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] text-[#8E8982] block font-semibold">{item.when}</span>
                      <p className={`${item.strong ? "font-bold text-[#292B2F]" : "font-medium text-[#57514A]"} text-[11px]`}>{item.text}</p>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.strong ? "bg-emerald-100 text-emerald-800" : "bg-[#EFECE6] text-[#57514A]"}`}>
                      {item.badge}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
