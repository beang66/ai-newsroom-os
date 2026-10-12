import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Mic,
  Image as ImageIcon,
  Sparkles,
  History,
  Check,
  Plus,
  PenLine,
} from "lucide-react";
import DataMapView from "../features/data-map/DataMapView.jsx";
import { listArchive } from "../api/editorial";

// 2026-10-12: 보관소 목록은 코어(GET /api/articles)에서 받는다.
// 10-12: 이름을 '원고 / 송고'로 — 이 앱은 송고까지만 하고, 출고는 동아일보 CMS 에서 따로 한다(혼동 방지)
// - 원고: 송고 전 기사(마지막 수동 저장본) + 송고 뒤 고쳐 저장한 기사('송고 후 수정 중')
// - 송고: 기사마다 하나(다시 송고하면 덮어쓰고 수정 시각 갱신). 송고를 누르면 원고에서 바로 여기로 옮겨진다
// - '수정' → Article Writer 탭에서 그 판(원고 = 마지막 저장본, 송고 = 송고본)을 연다
const archiveEntries = (items) => items.flatMap((a) => [
  ...(a.state !== "published" ? [{
    key: `${a.articleId}:saved`, articleId: a.articleId, version: "saved", tab: "draft",
    status: a.state === "editing" ? "송고 후 수정 중" : "원고",
    title: a.title, subtitle: a.subtitle, content: a.excerpt, when: a.updatedAt, createdAt: a.createdAt,
    published: a.published, photoCount: a.photoCount, unsavedChanges: a.unsavedChanges,
  }] : []),
  ...(a.published ? [{
    key: `${a.articleId}:published`, articleId: a.articleId, version: "published", tab: "published", status: "송고",
    title: a.published.title, subtitle: a.published.subtitle, content: a.published.excerpt, when: a.published.publishedAt,
    createdAt: a.createdAt, published: a.published, photoCount: a.photoCount,
  }] : []),
]);

// 코어 시각(ISO) → "10.12 14:32"
const whenText = (iso) => {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return iso || "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function ArchiveView({ article, unsaved = false, onEdit }) {
  const [items, setItems] = useState(null); // null = 불러오는 중
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let alive = true;
    listArchive().then((list) => alive && setItems(list)).catch((e) => {
      if (!alive) return;
      setItems([]);
      setLoadError(e?.message || String(e));
    });
    return () => { alive = false; };
  }, []);
  const entries = useMemo(() => {
    const list = archiveEntries(items || []);
    // 아직 한 번도 저장하지 않은 지금 기사는 목록에 없다 — 보관소 자리만 보이게(수정 버튼 없음)
    return list.length ? list : [{ key: "current", articleId: null, version: null, tab: "draft", status: "저장 전",
      title: article.title || "제목 없음", subtitle: article.subtitle || "", content: article.content || "", when: "", createdAt: article.createdAt }];
  }, [items, article.title, article.subtitle, article.content, article.createdAt]);
  const sources = article.sources || [];
  const interviews = article.linkedInterviews || [];
  const convertedItems = article.cardNews || [];
  const photos = article.photos || [];
  const [selectedTab, setSelectedTab] = useState("all"); // all | draft | published
  const [selectedKey, setSelectedKey] = useState(null);
  const [activeStackTab, setActiveStackTab] = useState("article"); // article | sources | interview
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const inTab = (e) => selectedTab === "all" || e.tab === selectedTab;
  const filteredArticles = entries.filter(inTab).filter((art) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (art.title || "").toLowerCase().includes(q) || (art.subtitle || "").toLowerCase().includes(q);
  });
  // 고른 기사: 직접 고른 것 → 지금 편집 중인 기사 → 탭의 첫 기사
  const selectedArticle = entries.find((e) => e.key === selectedKey && inTab(e))
    || entries.filter(inTab).find((e) => e.articleId && e.articleId === article.articleId)
    || entries.find(inTab) || null;
  const isCurrent = (e) => e?.articleId && e.articleId === article.articleId;
  const count = (tab) => entries.filter((e) => e.articleId && (tab === "all" || e.tab === tab)).length;
  const chooseTab = (tab) => {
    setSelectedTab(tab);
    setIsSearchOpen(true); // 탭을 누르면 걸러진 목록을 바로 보여 준다
  };
  const edit = (e) => e?.articleId && onEdit?.(e.articleId, e.version);

  return (
    <div className="w-full animate-float-in pb-10">
      {/* 메인 2분할 레이아웃 그리드 (좌측/중앙 대형 영역 + 우측 패널 컬럼) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">

        {/* ══════════════════════════════════════════════════════════
            [좌측 / 중앙 메인 컬럼] (lg:col-span-8 flex flex-col)
            - 형태: 좌우 반전된 ㄱ자 (상단 와이드 + 좌측 하단 연장 기둥)
            - 상단 메인 공간과 좌측 하단 기사 선택 영역이 빈틈없이 하나의 일체형 공간으로 연결됨
            - 우측 하단 오목한 영역에 [미디어 & 변환 자산] 패널 독립 배치
           ══════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-8 flex flex-col">

          {/* 1. 상단 메인 작업 공간 (와이드 상단 바디) — 여기가 Data Map 이 들어갈 자리다(2026-10-07 확정, 화면 이식은 M5) */}
          <div data-testid="data-map-slot" className="w-full min-h-[380px] lg:min-h-[420px] bg-white/80 backdrop-blur-xl rounded-t-[36px] rounded-tr-[36px] rounded-br-[32px] border-t border-x border-white/90 shadow-[6px_10px_24px_rgba(40,35,25,0.08),0_2px_8px_rgba(40,35,25,0.04)] relative overflow-visible">
            <DataMapView articleId={article.articleId} />
            {/* 우측 하단 미디어 패널 상단부와 맞닿는 바닥 보더 (우측 바닥 그림자 라인) */}
            <div className="absolute bottom-0 right-0 w-[58%] md:w-[58%] h-[1px] bg-white/90 shadow-[0_4px_12px_rgba(40,35,25,0.08)]" />
          </div>

          {/* 2. 하단 서브 영역: [좌측 메인 연장 기둥 (기사 선택 포함)] + [우측 미디어 패널] */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-x-4 items-start">

            {/* [좌측 연장 기둥]: 사용자가 지정한 우측 변 및 하단 변에 그림자 적용 */}
            <div className="md:col-span-5 bg-white/80 backdrop-blur-xl border-x border-b border-white/90 rounded-b-[36px] p-3 pt-6 pb-3.5 shadow-[8px_16px_28px_rgba(40,35,25,0.1),2px_6px_12px_rgba(40,35,25,0.06)] flex flex-col justify-end min-h-[140px] relative -mt-[1px]">
              {/* 상단 메인 박스와의 이음새 경계선을 완벽하게 지워 하나로 이어주는 브릿지 패치 */}
              <div className="absolute -top-2 inset-x-0 h-4 bg-white/85 z-10 pointer-events-none" />

              {/* 안쪽 꺾이는 코너의 부드러운 오목 곡선 (우상단 내각 라운딩) */}
              <div className="absolute -top-4 -right-4 w-4 h-4 pointer-events-none z-20 hidden md:block">
                <svg viewBox="0 0 16 16" fill="none" className="w-full h-full">
                  <path d="M 0 0 C 0 8.8 7.2 16 16 16 H 0 V 0 Z" fill="#FAF8F5" />
                  <path d="M 0 0 C 0 8.8 7.2 16 16 16" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" fill="none" />
                </svg>
              </div>

              {/* 기사 선택 및 탐색 알약 바 (메인 공간 하단에 안착) */}
              <div className="relative z-20 w-full">
                <div className="flex items-center gap-2.5 bg-white/95 backdrop-blur-md rounded-full px-3.5 py-2.5 border border-white shadow-[0_4px_16px_rgba(40,35,25,0.06)]">
                  {/* 원형 (+) 버튼 */}
                  <button
                    type="button"
                    onClick={() => setIsSearchOpen(!isSearchOpen)}
                    className="w-8 h-8 rounded-full bg-[#292B2F] text-[#FAF8F5] flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition cursor-pointer shadow-xs"
                    title="기사 선택 및 검색 열기"
                  >
                    <Plus className={`w-4 h-4 transition-transform duration-200 ${isSearchOpen ? "rotate-45" : ""}`} />
                  </button>

                  {/* 현재 선택된 기사 라벨 / 입력 공간 */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setIsSearchOpen(!isSearchOpen)}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] text-[#8E8982] font-extrabold uppercase tracking-wider block">
                        기사 선택 및 탐색
                      </span>
                      {selectedArticle && (
                        <span data-testid="archive-selected-status" className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${
                          selectedArticle.status === "송고" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
                        }`}>
                          {selectedArticle.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-[#292B2F] truncate">
                      {selectedArticle ? selectedArticle.title || "제목 없음" : items === null ? "불러오는 중…" : "이 탭에 기사가 없습니다"}
                    </p>
                  </div>
                </div>

                {/* 기사 선택 팝오버 목록 */}
                {isSearchOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-full max-h-64 overflow-y-auto bg-white/95 backdrop-blur-xl rounded-2xl border border-white shadow-[0_16px_36px_rgba(40,35,25,0.12)] p-2.5 z-50 space-y-2 animate-float-in">
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="기사 제목 검색..."
                        className="w-full text-xs pl-7 pr-3 py-1.5 rounded-xl bg-[#FAF8F5] border border-[#E7E2D9] focus:outline-none focus:border-[#292B2F]"
                        autoFocus
                      />
                      <Search className="w-3.5 h-3.5 text-[#8E8982] absolute left-2 top-1/2 -translate-y-1/2" />
                    </div>
                    {loadError && <p className="text-[10px] text-red-700 px-1">목록을 불러오지 못했습니다: {loadError}</p>}
                    <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                      {filteredArticles.length === 0 && (
                        <p className="text-[11px] text-[#8E8982] px-2 py-1.5">{selectedTab === "published" ? "아직 송고한 기사가 없습니다." : "기사가 없습니다."}</p>
                      )}
                      {filteredArticles.map((art) => (
                        <div
                          key={art.key}
                          data-testid="archive-item"
                          data-status={art.status}
                          className={`w-full p-1.5 pl-2 rounded-xl transition flex items-center gap-1.5 text-xs ${
                            selectedArticle?.key === art.key
                              ? "bg-[#FAF8F5] font-bold text-[#292B2F] border border-[#E7E2D9]"
                              : "hover:bg-[#FAF8F5] text-[#57514A]"
                          }`}
                        >
                          <button type="button" onClick={() => { setSelectedKey(art.key); setIsSearchOpen(false); }}
                            className="flex-1 min-w-0 text-left cursor-pointer flex items-center gap-1.5">
                            <span className={`text-[9px] font-bold px-1.5 rounded-full shrink-0 ${art.tab === "published" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{art.status}</span>
                            <span className="truncate" data-testid="archive-item-title">{art.title || "제목 없음"}</span>
                            {art.when && <span className="text-[9px] text-[#8E8982] shrink-0 font-medium">{whenText(art.when)}</span>}
                            {selectedArticle?.key === art.key && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                          </button>
                          {art.articleId && (
                            <button type="button" data-testid="archive-item-edit" onClick={() => edit(art)}
                              title={art.version === "published" ? "송고본을 Article Writer 에서 고치기" : "마지막 저장본을 Article Writer 에서 고치기"}
                              className="shrink-0 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-[#292B2F] text-[#FAF8F5] text-[10px] font-bold cursor-pointer hover:bg-black">
                              <PenLine className="w-3 h-3" />수정
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* [하단 중앙 3열 패널]: 참고 이미지의 상단 캡슐 + 3열 그리드 슬롯 + 하단 선 (독립 배치) */}
            <div className="md:col-span-7 mt-4 bg-white/85 backdrop-blur-md rounded-[28px] border border-white/90 p-3.5 shadow-[0_8px_24px_rgba(40,35,25,0.05)] flex flex-col justify-between gap-2.5">
              {/* 상단 캡슐 칩 */}
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 bg-[#FAF8F5] px-2.5 py-1 rounded-full border border-white/90 shadow-2xs">
                  <div className="w-2 h-2 rounded-full bg-[#D97706]" />
                  <span className="text-[11px] font-extrabold text-[#292B2F]">미디어 & 변환 자산</span>
                </div>
                <span className="text-[10px] text-[#8E8982] font-semibold">
                  사진 {photos.length}건 · 변환본 {convertedItems.length}건
                </span>
              </div>

              {/* 3개 컬럼 슬롯 (참고 이미지의 [3개] [3개] [2개] 알약 배치) */}
              <div className="grid grid-cols-3 gap-2">
                {/* 컬럼 1: 사진 슬롯 3개 */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold text-[#8E8982] block text-center">사진 미디어</span>
                  {[0, 1, 2].map((idx) => {
                    const photo = photos[idx];
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

        {/* ══════════════════════════════════════════════════════════
            [우측 패널 컬럼] (lg:col-span-4 flex flex-col justify-between gap-4)
            - 1. 최상단 가로형 캡슐 바 (기사 필터 탭: 전체 / 원고 / 송고)
            - 2. 중단 3단 스택 레이어 카드 (원고 / 취재자료 / 인터뷰·녹취)
                 각 카드의 좌측에 세로 알약 탭 부착
            - 3. 하단 카드 덱 모듈 (발행 이력 및 타임라인 - 비스듬히 겹친 카드 덱)
           ══════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-4 flex flex-col gap-4">

          {/* 1. 참고 이미지 우측 최상단: 가로 캡슐 바 (필터 모드) */}
          <div className="w-full bg-white/85 backdrop-blur-md rounded-full p-1.5 border border-white/90 shadow-[0_4px_16px_rgba(40,35,25,0.04)] flex items-center justify-between">
            <button
              type="button"
              onClick={() => chooseTab("all")}
              data-testid="archive-tab-all"
              className={`flex-1 py-1.5 text-center text-xs rounded-full font-bold transition cursor-pointer ${
                selectedTab === "all"
                  ? "bg-[#292B2F] text-[#FAF8F5] shadow-xs"
                  : "text-[#57514A] hover:text-[#292B2F]"
              }`}
            >
              전체 ({count("all")})
            </button>
            <button
              type="button"
              onClick={() => chooseTab("draft")}
              data-testid="archive-tab-draft"
              className={`flex-1 py-1.5 text-center text-xs rounded-full font-bold transition cursor-pointer ${
                selectedTab === "draft"
                  ? "bg-[#292B2F] text-[#FAF8F5] shadow-xs"
                  : "text-[#57514A] hover:text-[#292B2F]"
              }`}
            >
              원고 ({count("draft")})
            </button>
            <button
              type="button"
              onClick={() => chooseTab("published")}
              data-testid="archive-tab-published"
              className={`flex-1 py-1.5 text-center text-xs rounded-full font-bold transition cursor-pointer ${
                selectedTab === "published"
                  ? "bg-[#292B2F] text-[#FAF8F5] shadow-xs"
                  : "text-[#57514A] hover:text-[#292B2F]"
              }`}
            >
              송고 ({count("published")})
            </button>
          </div>

          {/* 2. 참고 이미지 우측 중단: 3개 겹친 스택 카드 (Stacked Layer Cards) */}
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
                  취재자료 ({sources.length + (article.linkedSources || []).length}건)
                </span>
                <span className="text-[10px] font-bold ml-auto px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
                  {sources.length ? `업로드 ${sources.length}건` : "없음"}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-white/70 text-xs text-[#57514A] space-y-1 max-h-16 overflow-hidden">
                {sources.length === 0 && (article.linkedSources || []).length === 0 && (
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
                <span className="text-xs font-extrabold text-[#292B2F]">{selectedArticle?.version === "published" ? "송고본" : "원고 (Master 본)"}</span>
                <span data-testid="archive-card-label" className="text-[10px] font-bold ml-auto px-2 py-0.5 rounded-full bg-[#FAF8F5] text-[#292B2F] border border-[#E7E2D9] truncate">
                  {!selectedArticle ? "—"
                    : selectedArticle.version === "published" ? `송고 ${whenText(selectedArticle.when)}`
                    : selectedArticle.articleId ? `저장본 ${whenText(selectedArticle.when)}${isCurrent(selectedArticle) && unsaved ? " · 이후 저장 안 한 변경 있음" : ""}`
                    : "수동 저장 전"}
                </span>
                {selectedArticle?.articleId && (
                  <button type="button" data-testid="archive-card-edit" onClick={(ev) => { ev.stopPropagation(); edit(selectedArticle); }}
                    title="Article Writer 탭에서 이 판을 고칩니다"
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#292B2F] text-[#FAF8F5] text-[10px] font-bold cursor-pointer hover:bg-black">
                    <PenLine className="w-3 h-3" />수정
                  </button>
                )}
              </div>
              <div className="p-2.5 rounded-xl bg-[#FAF8F5]/90 border border-white/80 text-xs space-y-1">
                <h4 className="font-extrabold text-[#292B2F] line-clamp-1" data-testid="archive-card-title">
                  {selectedArticle?.title || "제목 없음"}
                </h4>
                <p className="text-[11px] text-[#57514A] line-clamp-2 leading-relaxed">
                  {selectedArticle?.content}
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
                  <span className="text-[11px] font-extrabold text-[#292B2F]">송고 이력 & 타임라인</span>
                </div>
                <div className="w-4 h-4 rounded-full border border-[#E7E2D9] flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#292B2F]" />
                </div>
              </div>

              {/* 타임라인 항목들 */}
              <div className="space-y-1.5 text-xs">
                {[
                  { when: selectedArticle?.published?.publishedAt,
                    text: selectedArticle?.published?.publishCount > 1 ? `송고본 갱신 (${selectedArticle.published.publishCount}번째 송고)` : "송고",
                    badge: "송고", strong: true },
                  { when: selectedArticle?.published?.publishCount > 1 ? selectedArticle.published.firstPublishedAt : null, text: "처음 송고", badge: "기록", strong: false },
                  { when: selectedArticle?.version === "saved" ? selectedArticle.when : null, text: `현재 상태: ${selectedArticle?.status}`, badge: "현재", strong: !selectedArticle?.published },
                  { when: selectedArticle?.createdAt, text: "작성 시작", badge: "기록", strong: false },
                ].filter((item) => item.when).map((item) => ({ ...item, when: whenText(item.when) })).map((item) => (
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
