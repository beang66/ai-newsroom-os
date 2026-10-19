import React, { useState, useRef, useEffect } from "react";
import { 
  Search, 
  Upload, 
  Database, 
  FolderArchive, 
  Plus, 
  Check, 
  Sparkles, 
  Trash2, 
  ImageIcon, 
  Crop,
  Layers,
  CheckCircle2,
  SlidersHorizontal,
  Compass,
  ArrowRight,
  Edit3,
  Bookmark
} from "lucide-react";
import { photoKeywords } from "../services/assistService";
import { searchDongaPhotos, dongaPhotoData } from "../api/editorial";
import { searchUnsplashWithQuery } from "../services/photoSearch";
import { droppedFiles, hasDroppedFiles } from "../lib/fileDrop.js";

// 언스플래시 프리셋 고화질 보도사진 데이터
const UNSPLASH_PHOTOS = [
  {
    id: "un-1",
    url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80",
    caption: "국내 연구진이 개발한 차세대 AI 반도체 NPU 웨이퍼 시제품",
    photographer: "Alexandre Debiève",
    source: "Unsplash",
    provider: "김동아 기자",
    ratio: "16:9 (대표)",
    tags: ["반도체", "AI", "NPU", "웨이퍼"]
  },
  {
    id: "un-2",
    url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
    caption: "초거대 인공지능 모델 지원을 위한 고성능 데이터센터 서버 랙",
    photographer: "Taylor Vick",
    source: "Unsplash",
    provider: "김동아 기자",
    ratio: "16:9 (대표)",
    tags: ["데이터센터", "서버", "AI", "클라우드"]
  },
  {
    id: "un-3",
    url: "https://images.unsplash.com/photo-1555680202-c86f0e12f086?auto=format&fit=crop&w=800&q=80",
    caption: "초정밀 미세공정으로 설계된 고효율 시스템 반도체 다이 회로",
    photographer: "Michael Dziedzic",
    source: "Unsplash",
    provider: "김동아 기자",
    ratio: "4:3 (본문)",
    tags: ["반도체", "회로", "칩셋", "공정"]
  },
  {
    id: "un-4",
    url: "https://images.unsplash.com/photo-1466611653911-95081537e5b7?auto=format&fit=crop&w=800&q=80",
    caption: "탄소중립 2030 달성을 위해 가동 중인 서남해 해상풍력 발전단지",
    photographer: "Nicholas Doherty",
    source: "Unsplash",
    provider: "김동아 기자",
    ratio: "16:9 (대표)",
    tags: ["에너지", "기후", "풍력", "친환경"]
  }
];

// Core(/api/donga/photos)가 돌려준 아카이브 사진을 사진 서랍이 쓰는 모양으로 바꾼다.
// 목록에는 썸네일(thumb)을 쓰고, 기사에 넣거나 편집할 때만 원본을 받아 온다(dongaPhotoData).
const toDongaPhoto = (photo) => ({
  id: `donga-${photo.id}`,
  dongaId: photo.id,
  url: photo.thumb || photo.image,
  caption: photo.title,
  summary: photo.summary,
  source: "동아일보 DB",
  provider: "동아일보 사진부",
  ratio: "16:9 (대표)",
  date: photo.date
});

export default function PhotoSideDrawer({
  onClose,
  photos = [],
  setPhotos,
  onInsertPhoto,
  onOpenImageEditor,
  articleContent = "",
  isSidebarCollapsed = true
}) {
  // 1. 상위 탭: 'browse' (사진 둘러보기) | 'storage' (사진 보관)
  const [topTab, setTopTab] = useState("browse");

  // 2. 사진 둘러보기 내 하위 탭: 'unsplash' (Unsplash 검색하기) | 'donga_db' (동아일보DB) | 'pc_upload' (내 PC에서 사진 불러오기)
  const [subTab, setSubTab] = useState("unsplash");

  // 하위 탭 물방울 애니메이션 인디케이터 상태 및 참조
  const [bubbleStyle, setBubbleStyle] = useState({ left: 0, width: 0, isReady: false });
  const subTabContainerRef = useRef(null);
  const subTabButtonRefs = useRef({});

  const updateBubblePosition = () => {
    const currentBtn = subTabButtonRefs.current[subTab];
    const container = subTabContainerRef.current;
    if (currentBtn && container) {
      const containerRect = container.getBoundingClientRect();
      const btnRect = currentBtn.getBoundingClientRect();
      setBubbleStyle({
        left: btnRect.left - containerRect.left,
        width: btnRect.width,
        isReady: true
      });
    }
  };

  useEffect(() => {
    updateBubblePosition();
    const timer = setTimeout(updateBubblePosition, 50);
    return () => clearTimeout(timer);
  }, [subTab, topTab]);

  // 현재 선택된 사진 객체
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // 검색 인풋 및 결과
  const [searchQuery, setSearchQuery] = useState("");
  // 처음에는 비어 있다 — 검색하거나 추천 키워드를 눌러야 사진이 나온다(main 과 같음)
  const [searchResults, setSearchResults] = useState([]);

  // PC 파일 업로드
  const fileInputRef = useRef(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadSource, setUploadSource] = useState("동아일보 DB");
  const [uploadRatio, setUploadRatio] = useState("16:9 (대표)");

  // 동아일보 DB 정렬 상태: 'all' (전체) | 'latest' (최신순) | 'oldest' (오래된순)
  const [dongaSortOrder, setDongaSortOrder] = useState("all");
  const [dongaQuery, setDongaQuery] = useState(""); // 입력 중인 검색어
  const [dongaAppliedQuery, setDongaAppliedQuery] = useState(""); // 검색 버튼을 눌러 적용한 검색어
  const [dongaPage, setDongaPage] = useState(1);
  const [dongaState, setDongaState] = useState({ status: "idle", items: [], totalPages: 1, total: 0, error: "" });
  const dongaSort = dongaSortOrder;

  useEffect(() => {
    if (subTab !== "donga_db") return undefined;
    let active = true;
    setDongaState((prev) => ({ ...prev, status: "loading", error: "" }));
    searchDongaPhotos(dongaAppliedQuery, dongaSort, dongaPage)
      .then((result) => {
        if (!active) return;
        setDongaState({ status: "done", items: result.photos.map(toDongaPhoto), totalPages: result.totalPages, total: result.total, error: "" });
        if (result.page !== dongaPage) setDongaPage(result.page);
      })
      .catch((error) => active && setDongaState((prev) => ({ ...prev, status: "error", items: [], error: error?.message || String(error) })));
    return () => { active = false; };
  }, [subTab, dongaAppliedQuery, dongaSort, dongaPage]);

  // 화면 알림 토스트 상태 및 핸들러
  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2000);
  };

  // 사진 보관하기 핸들러
  const handleArchivePhoto = (photo) => {
    if (setPhotos) {
      if (!photos.some((p) => p.url === photo.url)) {
        setPhotos((prev) => [photo, ...prev]);
      }
    }
    showToast("보관되었습니다");
  };

  // 동아일보 DB 사진: 기사에 넣거나 편집·보관하기 전에 원본을 받아 온다(목록은 썸네일이라 해상도가 낮다).
  const applyDongaPhoto = async (photo, action) => {
    setSelectedPhoto(photo);
    let resolved = photo;
    if (!photo.originalLoaded) {
      try {
        resolved = { ...photo, url: await dongaPhotoData({ id: photo.dongaId }), originalLoaded: true };
      } catch (error) {
        showToast(error?.message || "사진 원본을 받지 못했습니다");
        return;
      }
    }
    if (action === "archive") {
      handleArchivePhoto(resolved);
    } else if (action === "edit") {
      onOpenImageEditor?.(resolved);
    } else {
      if (setPhotos && !photos.some((p) => p.url === resolved.url)) setPhotos((prev) => [resolved, ...prev]);
      onInsertPhoto?.(resolved);
    }
  };

  // 사진 보관함에서 삭제하기 핸들러
  const handleDeletePhoto = (photo) => {
    if (setPhotos) {
      setPhotos((prev) => prev.filter((p) => (photo.id ? p.id !== photo.id : p.url !== photo.url)));
    }
    showToast("삭제되었습니다");
  };

  // 검색 처리: Core(/api/unsplash/search)가 Unsplash에서 찾는다. 빈 검색어면 기본 목록으로 돌아간다.
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchedAs, setSearchedAs] = useState(null); // 한글 검색어를 영어로 바꿔 찾았을 때 안내
  const runSearch = async (rawQuery) => {
    const q = (rawQuery ?? searchQuery).trim();
    setSearchError("");
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { photos: found, searched } = await searchUnsplashWithQuery(q);
      setSearchedAs(searched && searched !== q ? { query: q, searched } : null);
      if (found.length === 0) setSearchError(`'${q}'에 맞는 사진을 찾지 못했습니다.`);
      else setSearchResults(found);
    } catch (error) {
      setSearchError(error.message);
    } finally {
      setSearching(false);
    }
  };
  const handleSearch = (e) => {
    e?.preventDefault();
    void runSearch();
  };

  // 기사 본문을 읽고 사진 검색어를 추천한다(Core /api/assist, kind=photo_keywords).
  const [keywordState, setKeywordState] = useState({ status: "idle", data: [], error: "" });
  // 사진 창이 열리면 기사 본문을 바탕으로 검색어를 자동 추천한다(main 과 같은 기준: 본문 80자 이상)
  useEffect(() => {
    const text = String(articleContent || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim();
    if (text.length < 80) return undefined;
    let cancelled = false;
    setKeywordState({ status: "loading", data: [], error: "" });
    photoKeywords(articleContent)
      .then((data) => { if (!cancelled) setKeywordState({ status: "done", data, error: "" }); })
      .catch((error) => { if (!cancelled) setKeywordState({ status: "error", data: [], error: error.message }); });
    return () => { cancelled = true; };
    // 창을 열 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pickKeyword = (keyword) => {
    setSearchQuery(keyword);
    void runSearch(keyword);
  };

  // PC 파일 선택
  const loadUploadFile = (file) => {
    if (file) {
      if (!file.type.startsWith("image/")) {
        showToast("JPG, PNG, WebP 사진 파일을 선택해 주세요.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
          setUploadPreview(evt.target.result);
          // 즉시 선택 사진으로 활성화
          const newPhoto = {
            id: `pc-${Date.now()}`,
            url: evt.target.result,
            caption: uploadCaption,
            source: uploadSource,
            provider: "김동아 기자",
            ratio: uploadRatio
          };
          setSelectedPhoto(newPhoto);
        }
      };
      reader.readAsDataURL(file);
    }
  };
  const handleFileChange = (e) => {
    loadUploadFile(e.target.files?.[0]);
    e.target.value = "";
  };

  // 사진 삽입하기 버튼 핸들러
  const handleInsertSelected = () => {
    if (!selectedPhoto) {
      alert("삽입할 사진을 먼저 선택해 주세요.");
      return;
    }
    // 사진 보관함에 없으면 자동 보관
    if (setPhotos && !photos.some((p) => p.url === selectedPhoto.url)) {
      setPhotos((prev) => [selectedPhoto, ...prev]);
    }
    if (onInsertPhoto) {
      onInsertPhoto(selectedPhoto);
    }
  };

  // 이미지 편집하기 버튼 핸들러
  const handleOpenEditor = () => {
    if (!selectedPhoto) {
      alert("편집할 사진을 먼저 선택해 주세요.");
      return;
    }
    if (onOpenImageEditor) {
      onOpenImageEditor(selectedPhoto);
    }
  };

  return (
    <aside
      className={`w-full ${
        !isSidebarCollapsed
          ? "md:w-[370px] lg:w-[390px] xl:w-[405px]"
          : "md:w-[380px] lg:w-[400px] xl:w-[420px]"
      } flex-shrink-0 bg-white rounded-3xl border border-slate-200/90 shadow-sm flex flex-col h-[calc(100vh-100px)] min-h-[760px] max-h-[920px] sticky top-4 overflow-hidden transition-all duration-300 ease-out animate-in fade-in slide-in-from-left-4 z-20`}
    >
      {/* ──────────────────────────────────────────
          1. 상단 헤더: 깔끔한 타이틀 + 닫기 버튼
         ────────────────────────────────────────── */}
      <div className="p-4 md:p-5 border-b border-slate-200 flex items-center justify-between bg-white flex-shrink-0">
        <h2 className="text-base font-bold text-slate-900 tracking-tight">
          사진 첨부
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer active:scale-95"
        >
          닫기
        </button>
      </div>

      {/* ──────────────────────────────────────────
          2. [상위 버튼]: 사진 둘러보기 | 사진 보관
         ────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-100 bg-slate-50/60 flex-shrink-0">
        <div className="grid grid-cols-2 p-1 bg-slate-200/70 rounded-2xl text-xs font-extrabold gap-1">
          <button
            type="button"
            onClick={() => setTopTab("browse")}
            className={`py-2 px-3 text-center rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              topTab === "browse"
                ? "bg-white text-slate-950 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>사진 둘러보기</span>
          </button>
          <button
            type="button"
            onClick={() => setTopTab("storage")}
            className={`py-2 px-3 text-center rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              topTab === "storage"
                ? "bg-white text-slate-950 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FolderArchive className="w-3.5 h-3.5" />
            <span>사진 보관</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/10 text-slate-700 font-bold ml-0.5">
              {photos.length}
            </span>
          </button>
        </div>

        {/* ──────────────────────────────────────────
            3. [사진 둘러보기의 하위 버튼]:
               - Unsplash 검색하기 ㅣ 동아일보DB ㅣ 내 PC에서 사진 불러오기
               - 박스 형태 배제, 'ㅣ' 구분, 투명감 있는 선택 표시, 물방울 무빙
           ────────────────────────────────────────── */}
        {topTab === "browse" && (
          <div
            ref={subTabContainerRef}
            className="relative flex items-center justify-between pt-2.5 pb-0.5 px-0.5 select-none"
          >
            {/* 부드러운 물방울 형태의 투명감 있는 이동 인디케이터 */}
            {bubbleStyle.isReady && (
              <span
                className="absolute h-7 rounded-full pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-0"
                style={{
                  left: `${bubbleStyle.left}px`,
                  width: `${bubbleStyle.width}px`,
                  backgroundColor: "rgba(15, 23, 42, 0.08)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid rgba(15, 23, 42, 0.08)",
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.04), inset 0 1px 1.5px rgba(255, 255, 255, 0.8)",
                }}
              />
            )}

            {/* 1) Unsplash 검색하기 */}
            <button
              ref={(el) => (subTabButtonRefs.current["unsplash"] = el)}
              type="button"
              onClick={() => setSubTab("unsplash")}
              className={`relative z-10 px-2.5 py-1 text-[11px] tracking-tight transition-colors duration-200 cursor-pointer whitespace-nowrap rounded-full ${
                subTab === "unsplash"
                  ? "text-slate-950 font-bold"
                  : "text-slate-500 hover:text-slate-800 font-medium"
              }`}
            >
              Unsplash 검색하기
            </button>

            {/* 구분선 ㅣ */}
            <span className="text-slate-300 select-none text-[11px] font-light z-0">ㅣ</span>

            {/* 2) 동아일보DB */}
            <button
              ref={(el) => (subTabButtonRefs.current["donga_db"] = el)}
              type="button"
              onClick={() => setSubTab("donga_db")}
              className={`relative z-10 px-2.5 py-1 text-[11px] tracking-tight transition-colors duration-200 cursor-pointer whitespace-nowrap rounded-full ${
                subTab === "donga_db"
                  ? "text-slate-950 font-bold"
                  : "text-slate-500 hover:text-slate-800 font-medium"
              }`}
            >
              동아일보DB
            </button>

            {/* 구분선 ㅣ */}
            <span className="text-slate-300 select-none text-[11px] font-light z-0">ㅣ</span>

            {/* 3) 내 PC에서 사진 불러오기 */}
            <button
              ref={(el) => (subTabButtonRefs.current["pc_upload"] = el)}
              type="button"
              onClick={() => setSubTab("pc_upload")}
              className={`relative z-10 px-2 py-1 text-[11px] tracking-tight transition-colors duration-200 cursor-pointer whitespace-nowrap rounded-full ${
                subTab === "pc_upload"
                  ? "text-slate-950 font-bold"
                  : "text-slate-500 hover:text-slate-800 font-medium"
              }`}
            >
              내 PC에서 사진 불러오기
            </button>
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────
          4. 탭 콘텐츠 영역 (스크롤 가능)
         ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* [A] 상위: 사진 둘러보기 */}
        {topTab === "browse" && (
          <>
            {/* 1) 언플래쉬에서 사진 검색하기 */}
            {subTab === "unsplash" && (
              <div className="space-y-3">
                {/* 검색 인풋 바 */}
                <form onSubmit={handleSearch} className="flex gap-1.5">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="어떤 사진을 찾을까요?"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-slate-800 outline-none transition"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer active:scale-95"
                  >
                    검색
                  </button>
                </form>

                {/* 기사 본문 기반 검색어 추천(5~6개) — 사진 창을 열면 자동으로 받고, 누르면 그 검색어로 찾는다 */}
                <div className="space-y-2">
                  {keywordState.status === "loading" && (
                    <p role="status" className="text-[11px] text-slate-500 px-0.5">본문을 읽고 검색어를 추천하는 중입니다…</p>
                  )}
                  {keywordState.status === "error" && (
                    <p role="alert" className="text-[11px] text-rose-600 px-0.5">{keywordState.error}</p>
                  )}
                  {keywordState.data.length > 0 && (
                    <div className="flex flex-wrap gap-1.5" data-testid="photo-keyword-chips">
                      {keywordState.data.map((keyword) => (
                        <button
                          key={keyword}
                          type="button"
                          onClick={() => pickKeyword(keyword)}
                          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-black hover:text-white text-slate-800 text-[11px] font-bold transition cursor-pointer active:scale-95"
                          title="이 검색어로 Unsplash 검색"
                        >
                          {keyword}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {searchedAs && (
                  <p data-testid="photo-searched" className="text-[11px] text-slate-500 px-0.5">‘{searchedAs.query}’ → ‘{searchedAs.searched}’(으)로 찾았습니다.</p>
                )}

                {/* 시각적 배지 & 메타 정보 */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 px-0.5">
                  <span className="font-medium">{searching ? "검색 중…" : searchResults.length ? `검색 결과 (${searchResults.length})` : "검색어를 입력하거나 추천 키워드를 눌러 주세요"}</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-700">
                    Unsplash 라이선스
                  </span>
                </div>

                {searchError && <p role="alert" className="text-[11px] text-rose-600 px-0.5">{searchError}</p>}

                {/* 사진 목록 (이미지 중심 표시) */}
                <div className="space-y-4">
                  {searchResults.map((photo) => {
                    const isSelected = selectedPhoto?.id === photo.id;
                    return (
                      <div
                        key={photo.id}
                        onClick={() => setSelectedPhoto(photo)}
                        className="group cursor-pointer space-y-1.5"
                      >
                        <div
                          className={`relative aspect-video w-full overflow-hidden rounded-none bg-slate-100 ${
                            isSelected ? "ring-2 ring-slate-900 shadow-sm" : ""
                          }`}
                        >
                          <img
                            src={photo.url}
                            alt={photo.caption}
                            className="w-full h-full object-cover"
                          />
                          {/* 이미지 오른쪽 상단: 이모지 버튼 + 호버 시 미리보기 텍스트 확장 */}
                          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPhoto(photo);
                                if (setPhotos && !photos.some((p) => p.url === photo.url)) {
                                  setPhotos((prev) => [photo, ...prev]);
                                }
                                if (onInsertPhoto) onInsertPhoto(photo);
                              }}
                              className="group/btn h-7 min-w-[28px] px-1.5 rounded-full bg-white/90 hover:bg-white text-slate-800 backdrop-blur-md shadow-xs border border-white/70 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 overflow-hidden"
                              title="기사에 바로 첨부하기"
                            >
                              <Plus className="w-3.5 h-3.5 text-slate-800 stroke-[2.2] select-none" />
                              <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap opacity-0 max-w-0 group-hover/btn:max-w-[120px] group-hover/btn:opacity-100 group-hover/btn:pl-1 group-hover/btn:pr-1 transition-all duration-200 overflow-hidden select-none">
                                기사에 바로 첨부하기
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPhoto(photo);
                                if (onOpenImageEditor) onOpenImageEditor(photo);
                              }}
                              className="group/btn h-7 min-w-[28px] px-1.5 rounded-full bg-white/90 hover:bg-white text-slate-800 backdrop-blur-md shadow-xs border border-white/70 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 overflow-hidden"
                              title="편집하기"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-800 stroke-[2.2] select-none" />
                              <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap opacity-0 max-w-0 group-hover/btn:max-w-[70px] group-hover/btn:opacity-100 group-hover/btn:pl-1 group-hover/btn:pr-1 transition-all duration-200 overflow-hidden select-none">
                                편집하기
                              </span>
                            </button>
                            {/* 보관하기 이모지 버튼 */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchivePhoto(photo);
                              }}
                              className="group/btn h-7 min-w-[28px] px-1.5 rounded-full bg-white/90 hover:bg-white text-slate-800 backdrop-blur-md shadow-xs border border-white/70 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 overflow-hidden"
                              title="보관하기"
                            >
                              <Bookmark className="w-3.5 h-3.5 text-slate-800 stroke-[2.2] select-none" />
                              <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap opacity-0 max-w-0 group-hover/btn:max-w-[80px] group-hover/btn:opacity-100 group-hover/btn:pl-1 group-hover/btn:pr-1 transition-all duration-200 overflow-hidden select-none">
                                보관하기
                              </span>
                            </button>
                          </div>

                          {isSelected && (
                            <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-md pointer-events-none z-10">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          )}
                        </div>
                        <div className="px-0.5">
                          <p className="text-xs font-semibold text-slate-800 leading-snug line-clamp-1">
                            {photo.caption}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {photo.source}
                            {(photo.photographer || photo.provider) && !photo.source?.includes(photo.photographer || photo.provider)
                              ? ` · ${photo.photographer || photo.provider}`
                              : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2) 동아일보DB */}
            {subTab === "donga_db" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] text-slate-600 px-0.5">
                  <span className="font-bold text-slate-800">동아일보 보도사진 아카이브</span>

                  {/* 박스 형태가 아닌 인라인 텍스트 선택 버튼 (전체 · 최신순 · 오래된순 — main 과 같음) */}
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => { setDongaSortOrder("all"); setDongaPage(1); }}
                      className={`cursor-pointer transition-colors ${
                        dongaSortOrder === "all"
                          ? "font-extrabold text-slate-900"
                          : "text-slate-400 hover:text-slate-600 font-medium"
                      }`}
                    >
                      전체
                    </button>
                    <span className="text-slate-300 text-[10px]">·</span>
                    <button
                      type="button"
                      onClick={() => { setDongaSortOrder("latest"); setDongaPage(1); }}
                      className={`cursor-pointer transition-colors ${
                        dongaSortOrder === "latest"
                          ? "font-extrabold text-slate-900"
                          : "text-slate-400 hover:text-slate-600 font-medium"
                      }`}
                    >
                      최신순
                    </button>
                    <span className="text-slate-300 text-[10px]">·</span>
                    <button
                      type="button"
                      onClick={() => { setDongaSortOrder("oldest"); setDongaPage(1); }}
                      className={`cursor-pointer transition-colors ${
                        dongaSortOrder === "oldest"
                          ? "font-extrabold text-slate-900"
                          : "text-slate-400 hover:text-slate-600 font-medium"
                      }`}
                    >
                      오래된순
                    </button>
                  </div>
                </div>

                <form
                  onSubmit={(e) => { e.preventDefault(); setDongaPage(1); setDongaAppliedQuery(dongaQuery.trim()); }}
                  className="flex gap-1.5"
                >
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={dongaQuery}
                      onChange={(e) => setDongaQuery(e.target.value)}
                      placeholder="아카이브 사진 검색 (제목·설명)"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-slate-800 outline-none transition"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer active:scale-95"
                  >
                    검색
                  </button>
                </form>
                <div className="flex items-center justify-between text-[11px] text-slate-500 px-0.5">
                  <span className="font-medium">
                    {dongaState.status === "loading" ? "불러오는 중…" : `검색 결과 (${dongaState.total})`}
                  </span>
                </div>
                {dongaState.status === "error" && (
                  <p role="alert" className="text-[11px] text-rose-600 px-0.5">{dongaState.error}</p>
                )}
                {dongaState.status === "done" && dongaState.items.length === 0 && (
                  <p className="text-[11px] text-slate-500 px-0.5">조건에 맞는 사진이 없습니다.</p>
                )}

                <div className="space-y-4">
                  {dongaState.items.map((photo) => {
                    const isSelected = selectedPhoto?.id === photo.id;
                    return (
                      <div
                        key={photo.id}
                        onClick={() => setSelectedPhoto(photo)}
                        className="group cursor-pointer space-y-1.5"
                      >
                        <div
                          className={`relative aspect-video w-full overflow-hidden rounded-none bg-slate-100 ${
                            isSelected ? "ring-2 ring-slate-900 shadow-sm" : ""
                          }`}
                        >
                          <img
                            src={photo.url}
                            alt={photo.caption}
                            className="w-full h-full object-cover"
                          />
                          {/* 이미지 오른쪽 상단: 이모지 버튼 + 호버 시 미리보기 텍스트 확장 */}
                          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={(e) => {
                                e.stopPropagation();
                                void applyDongaPhoto(photo, "insert");
                              }}
                              className="group/btn h-7 min-w-[28px] px-1.5 rounded-full bg-white/90 hover:bg-white text-slate-800 backdrop-blur-md shadow-xs border border-white/70 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 overflow-hidden"
                              title="기사에 바로 첨부하기"
                            >
                              <Plus className="w-3.5 h-3.5 text-slate-800 stroke-[2.2] select-none" />
                              <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap opacity-0 max-w-0 group-hover/btn:max-w-[120px] group-hover/btn:opacity-100 group-hover/btn:pl-1 group-hover/btn:pr-1 transition-all duration-200 overflow-hidden select-none">
                                기사에 바로 첨부하기
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void applyDongaPhoto(photo, "edit");
                              }}
                              className="group/btn h-7 min-w-[28px] px-1.5 rounded-full bg-white/90 hover:bg-white text-slate-800 backdrop-blur-md shadow-xs border border-white/70 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 overflow-hidden"
                              title="편집하기"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-800 stroke-[2.2] select-none" />
                              <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap opacity-0 max-w-0 group-hover/btn:max-w-[70px] group-hover/btn:opacity-100 group-hover/btn:pl-1 group-hover/btn:pr-1 transition-all duration-200 overflow-hidden select-none">
                                편집하기
                              </span>
                            </button>
                            {/* 보관하기 이모지 버튼 */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void applyDongaPhoto(photo, "archive");
                              }}
                              className="group/btn h-7 min-w-[28px] px-1.5 rounded-full bg-white/90 hover:bg-white text-slate-800 backdrop-blur-md shadow-xs border border-white/70 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 overflow-hidden"
                              title="보관하기"
                            >
                              <Bookmark className="w-3.5 h-3.5 text-slate-800 stroke-[2.2] select-none" />
                              <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap opacity-0 max-w-0 group-hover/btn:max-w-[80px] group-hover/btn:opacity-100 group-hover/btn:pl-1 group-hover/btn:pr-1 transition-all duration-200 overflow-hidden select-none">
                                보관하기
                              </span>
                            </button>
                          </div>

                          {isSelected && (
                            <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-md pointer-events-none z-10">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          )}
                        </div>
                        <div className="px-0.5">
                          <p className="text-xs font-semibold text-slate-800 leading-snug line-clamp-1">
                            {photo.caption}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {photo.source} · {photo.provider || photo.date}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {dongaState.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-1 text-[11px] text-slate-600">
                    <button
                      type="button"
                      disabled={dongaPage <= 1 || dongaState.status === "loading"}
                      onClick={() => setDongaPage((page) => Math.max(1, page - 1))}
                      className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 font-bold cursor-pointer"
                    >
                      이전
                    </button>
                    <span className="font-mono">{dongaPage} / {dongaState.totalPages}</span>
                    <button
                      type="button"
                      disabled={dongaPage >= dongaState.totalPages || dongaState.status === "loading"}
                      onClick={() => setDongaPage((page) => Math.min(dongaState.totalPages, page + 1))}
                      className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 font-bold cursor-pointer"
                    >
                      다음
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 3) 내 PC에서 사진 불러오기 */}
            {subTab === "pc_upload" && (
              <div className="space-y-3.5">
                {/* 파일 드래그 앤 드롭 업로드 영역 */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(event) => { if (hasDroppedFiles(event)) { event.preventDefault(); setUploadDragging(true); } }}
                  onDragOver={(event) => { if (hasDroppedFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
                  onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setUploadDragging(false); }}
                  onDrop={async (event) => {
                    event.preventDefault();
                    setUploadDragging(false);
                    loadUploadFile((await droppedFiles(event.dataTransfer))[0]);
                  }}
                  data-testid="photo-upload-dropzone"
                  className={`border-2 border-dashed rounded-2xl p-5 text-center transition cursor-pointer group ${uploadDragging ? "border-slate-900 bg-slate-100 ring-2 ring-slate-300" : "border-slate-300 hover:border-slate-800 bg-slate-50/70 hover:bg-slate-50"}`}
                >
                  <div className="w-10 h-10 rounded-2xl bg-white shadow-xs border border-slate-200 mx-auto flex items-center justify-center mb-2 group-hover:scale-105 transition">
                    <Upload className="w-5 h-5 text-slate-700" />
                  </div>
                  <p className="text-xs font-bold text-slate-800">
                    사진을 끌어놓거나 내 PC에서 선택
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    JPG, PNG, WebP 고화질 보도사진 지원
                  </p>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />

                {/* 업로드된 이미지 미리보기 및 캡션 입력 */}
                {uploadPreview && (
                  <div className="space-y-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 animate-in fade-in">
                    <div className="relative rounded-none overflow-hidden aspect-video bg-black/10 border border-slate-200 group">
                      <img
                        src={uploadPreview}
                        alt="preview"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold">
                        불러온 사진
                      </span>
                      {/* 이미지 오른쪽 상단: 이모지 버튼 + 호버 시 미리보기 텍스트 확장 */}
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            const p = selectedPhoto || {
                              id: `pc-${Date.now()}`,
                              url: uploadPreview,
                              caption: uploadCaption,
                              source: uploadSource,
                              provider: "김동아 기자",
                              ratio: uploadRatio
                            };
                            if (setPhotos && !photos.some((item) => item.url === p.url)) {
                              setPhotos((prev) => [p, ...prev]);
                            }
                            if (onInsertPhoto) onInsertPhoto(p);
                          }}
                          className="group/btn h-7 min-w-[28px] px-1.5 rounded-full bg-white/90 hover:bg-white text-slate-800 backdrop-blur-md shadow-xs border border-white/70 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 overflow-hidden"
                          title="기사에 바로 첨부하기"
                        >
                          <Plus className="w-3.5 h-3.5 text-slate-800 stroke-[2.2] select-none" />
                          <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap opacity-0 max-w-0 group-hover/btn:max-w-[120px] group-hover/btn:opacity-100 group-hover/btn:pl-1 group-hover/btn:pr-1 transition-all duration-200 overflow-hidden select-none">
                            기사에 바로 첨부하기
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const p = selectedPhoto || {
                              id: `pc-${Date.now()}`,
                              url: uploadPreview,
                              caption: uploadCaption,
                              source: uploadSource,
                              provider: "김동아 기자",
                              ratio: uploadRatio
                            };
                            if (onOpenImageEditor) onOpenImageEditor(p);
                          }}
                          className="group/btn h-7 min-w-[28px] px-1.5 rounded-full bg-white/90 hover:bg-white text-slate-800 backdrop-blur-md shadow-xs border border-white/70 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 overflow-hidden"
                          title="편집하기"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-slate-800 stroke-[2.2] select-none" />
                          <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap opacity-0 max-w-0 group-hover/btn:max-w-[70px] group-hover/btn:opacity-100 group-hover/btn:pl-1 group-hover/btn:pr-1 transition-all duration-200 overflow-hidden select-none">
                            편집하기
                          </span>
                        </button>
                        {/* 보관하기 이모지 버튼 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const p = selectedPhoto || {
                              id: `pc-${Date.now()}`,
                              url: uploadPreview,
                              caption: uploadCaption,
                              source: uploadSource,
                              provider: "김동아 기자",
                              ratio: uploadRatio
                            };
                            handleArchivePhoto(p);
                          }}
                          className="group/btn h-7 min-w-[28px] px-1.5 rounded-full bg-white/90 hover:bg-white text-slate-800 backdrop-blur-md shadow-xs border border-white/70 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 overflow-hidden"
                          title="보관하기"
                        >
                          <Bookmark className="w-3.5 h-3.5 text-slate-800 stroke-[2.2] select-none" />
                          <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap opacity-0 max-w-0 group-hover/btn:max-w-[80px] group-hover/btn:opacity-100 group-hover/btn:pl-1 group-hover/btn:pr-1 transition-all duration-200 overflow-hidden select-none">
                            보관하기
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          사진 설명 (캡션)
                        </label>
                        <input
                          type="text"
                          value={uploadCaption}
                          onChange={(e) => {
                            setUploadCaption(e.target.value);
                            if (selectedPhoto && selectedPhoto.url === uploadPreview) {
                              setSelectedPhoto((prev) => ({ ...prev, caption: e.target.value }));
                            }
                          }}
                          placeholder="사진 설명을 입력하세요"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:border-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* [B] 상위: 사진 보관 (기사에 등록된 사진 보관함) */}
        {topTab === "storage" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-slate-500 px-0.5">
              <span className="font-medium">보관된 사진 ({photos.length})</span>
              <span className="text-slate-400">클릭하여 선택 후 본문 삽입</span>
            </div>

            {photos.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 space-y-2">
                <FolderArchive className="w-8 h-8 mx-auto opacity-50" />
                <p className="text-xs font-medium">보관된 사진이 없습니다.</p>
                <p className="text-[11px]">사진 둘러보기에서 사진을 선택해 보세요.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {photos.map((photo) => {
                  const isSelected = selectedPhoto?.id === photo.id;
                  return (
                    <div
                      key={photo.id}
                      onClick={() => setSelectedPhoto(photo)}
                      className="group cursor-pointer space-y-1.5"
                    >
                      <div
                        className={`relative aspect-video w-full overflow-hidden rounded-none bg-slate-100 ${
                          isSelected ? "ring-2 ring-slate-900 shadow-sm" : ""
                        }`}
                      >
                        <img
                          src={photo.url}
                          alt={photo.caption}
                          className="w-full h-full object-cover"
                        />
                          {/* 이미지 오른쪽 상단: 이모지 버튼 + 호버 시 미리보기 텍스트 확장 */}
                          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPhoto(photo);
                                if (onInsertPhoto) onInsertPhoto(photo);
                              }}
                              className="group/btn h-7 min-w-[28px] px-1.5 rounded-full bg-white/90 hover:bg-white text-slate-800 backdrop-blur-md shadow-xs border border-white/70 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 overflow-hidden"
                              title="기사에 바로 첨부하기"
                            >
                              <Plus className="w-3.5 h-3.5 text-slate-800 stroke-[2.2] select-none" />
                              <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap opacity-0 max-w-0 group-hover/btn:max-w-[120px] group-hover/btn:opacity-100 group-hover/btn:pl-1 group-hover/btn:pr-1 transition-all duration-200 overflow-hidden select-none">
                                기사에 바로 첨부하기
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPhoto(photo);
                                if (onOpenImageEditor) onOpenImageEditor(photo);
                              }}
                              className="group/btn h-7 min-w-[28px] px-1.5 rounded-full bg-white/90 hover:bg-white text-slate-800 backdrop-blur-md shadow-xs border border-white/70 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 overflow-hidden"
                              title="편집하기"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-800 stroke-[2.2] select-none" />
                              <span className="text-[11px] font-bold text-slate-800 whitespace-nowrap opacity-0 max-w-0 group-hover/btn:max-w-[70px] group-hover/btn:opacity-100 group-hover/btn:pl-1 group-hover/btn:pr-1 transition-all duration-200 overflow-hidden select-none">
                                편집하기
                              </span>
                            </button>
                            {/* 보관함 내에서는 보관하기 대신 삭제하기 버튼 (이모지로만 표현) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePhoto(photo);
                              }}
                              className="h-7 w-7 rounded-full bg-white/90 hover:bg-rose-50 text-slate-800 hover:text-rose-600 backdrop-blur-md shadow-xs border border-slate-200 hover:border-rose-200 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95"
                              title="삭제하기"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-slate-800 hover:text-rose-600 stroke-[2.2] select-none transition-colors" />
                            </button>
                          </div>

                          {isSelected && (
                            <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-md pointer-events-none z-10">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          )}
                      </div>
                      <div className="px-0.5">
                        <p className="text-xs font-semibold text-slate-800 leading-snug line-clamp-1">
                          {photo.caption}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {photo.source}
                          {photo.provider && !photo.source?.includes(photo.provider) ? ` · ${photo.provider}` : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* 화면 중앙 하단 알림 문구 (보관되었습니다 / 삭제되었습니다) */}
      {toastMessage && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-xl text-stone-950 text-xs font-black px-4 py-2 rounded-full shadow-[0_12px_36px_rgba(0,0,0,0.16),0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_1px_rgba(255,255,255,1)] border border-white ring-1 ring-stone-900/15 z-50 animate-smooth-pop flex items-center gap-2 pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-stone-900 flex-shrink-0 shadow-[0_0_6px_rgba(0,0,0,0.3)]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </aside>
  );
}
