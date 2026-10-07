import React, { useState, useRef, useMemo } from "react";
import FactCheckDrawer from "./FactCheckDrawer";
import PhotoEditor from "./PhotoEditor";
import { supportedClaimRanges } from "../api/claim-details.js";
// 코어 편집 보조(제목·부제 추천, 사진 찾기, 흐름 요약, 자동 저장) — 로직은 EditorialAssist.jsx
import { useSuggestions, SuggestionList, SuggestButton, PhotoFinder, FlowSummaryButton, useFactCheck, useBodyChunks } from "./EditorialAssist";
import { 
  Sparkles, 
  Search, 
  CheckCircle2, 
  Check, 
  RotateCcw, 
  Bold, 
  Italic, 
  Quote, 
  Wand2, 
  AlertTriangle,
  Eye,
  Edit3,
  Columns,
  Image as ImageIcon,
  Upload,
  Send,
  Download,
  Info,
  ExternalLink,
  ChevronRight,
  Share2,
  Bookmark,
  Heart,
  MessageSquare,
  ShieldCheck
} from "lucide-react";

export default function ArticleWriter({ 
  article, 
  setArticle, 
  onOpenSearch, 
  onRunFactCheck,
  factCheckActive,
  factCheckIssues,
  activeFactIndex,
  onApplyFactFix,
  onSkipFactFix,
  saveStatus // 자동 저장은 App 에서(어느 화면에 있든 저장된다)
}) {
  // 1. 화면 뷰 모드: 'editor' (에디터만) | 'split' (에디터+미리보기 나란히) | 'preview' (미리보기 전체)
  const [viewMode, setViewMode] = useState("editor");

  // 팩트체크 & 근거자료 우측 슬라이더(Drawer) 열림 상태
  const [isFactCheckDrawerOpen, setIsFactCheckDrawerOpen] = useState(false);
  // 팩트체크 — 글쓰기가 멈추면 자동 실행. 서랍을 닫아도 본문 하이라이트가 남도록 여기에 둔다
  const factCheck = useFactCheck(article);
  const factIssues = factCheck.results.filter((r) => r.verdict !== "SUPPORTED").length;
  // 본문 청크 밑줄(개발 실행에서만 버튼이 보인다) — 청킹 모델이 본문을 어떻게 나누는지 확인용
  const bodyChunks = useBodyChunks(article.content);

  // 2. 미리보기 플랫폼 탭: 'donga' (동아일보 공식 웹) | 'naver' (네이버 뉴스 포털)
  const [previewPlatform, setPreviewPlatform] = useState("donga");

  // 3. 사진/미디어 관리 상태
  const photos = article.photos || [];
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [photoError, setPhotoError] = useState("");
  const [photoNotice, setPhotoNotice] = useState("");
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [newCaption, setNewCaption] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newProvider, setNewProvider] = useState("");
  const [newRatio, setNewRatio] = useState("16:9");

  // 4. CMS 발행 이관 상태
  const [isCmsExporting, setIsCmsExporting] = useState(false);
  const [isCmsSuccessModal, setIsCmsSuccessModal] = useState(false);

  // 에디터 서식 및 제목 관련 상태
  const [isTitleHovered, setIsTitleHovered] = useState(false);
  const [isTitleConfirmed, setIsTitleConfirmed] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [floatingToolbarPos, setFloatingToolbarPos] = useState(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const editorRef = useRef(null);
  const photoInputRef = useRef(null);

  const headlineSuggest = useSuggestions("headline", article);
  const subtitleSuggest = useSuggestions("subtitle", article);

  // 텍스트 드래그 선택 서식 툴바
  const handleSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !editorRef.current) {
      setFloatingToolbarPos(null);
      setSelectedText("");
      return;
    }

    const text = selection.toString().trim();
    if (text.length > 0) {
      setSelectedText(text);
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = editorRef.current.getBoundingClientRect();

      setFloatingToolbarPos({
        top: Math.max(0, rect.top - containerRect.top - 48),
        left: Math.max(10, rect.left - containerRect.left + (rect.width / 2) - 120)
      });
    } else {
      setFloatingToolbarPos(null);
    }
  };

  const handleTitleConfirm = () => {
    setIsTitleConfirmed(true);
  };

  const handleRegenerateTitle = () => {
    headlineSuggest.request(); // 코어 제목 추천 → 아래 후보 목록에서 고른다
    setIsTitleConfirmed(false);
  };

  // ponytail: 초안 생성 AI 는 아직 코어 계약이 없다 — 연결 전까지 안내만 한다
  const handleGenerateDraft = () => {
    alert("AI 초안 생성은 아직 코어에 연결되지 않았어요.");
    setShowDraftModal(false);
  };

  const applyFormat = (formatType) => {
    if (!selectedText) return;
    alert(`선택한 문장 "${selectedText.slice(0, 15)}..." 에 [${formatType}] 서식을 적용했습니다.`);
    setFloatingToolbarPos(null);
  };

  // 사진 업로드 핸들러
  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setPhotoError("");
    if (file) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 20 * 1024 * 1024) {
        setPhotoError("20MB 이하 JPG·PNG·WebP 사진을 선택해 주세요.");
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => setPhotoError("사진 파일을 읽지 못했습니다. 다시 선택해 주세요.");
      reader.onload = (uploadEvt) => {
        if (uploadEvt.target?.result) {
          const newPhoto = {
            id: `photo-${crypto.randomUUID()}`,
            url: uploadEvt.target.result,
            caption: newCaption || file.name,
            source: newSource,
            provider: newProvider,
            ratio: newRatio
          };
          setEditingPhoto(newPhoto);
          setNewCaption("");
          setShowPhotoModal(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // 본문에 사진 태그 삽입
  const handleInsertPhotoToContent = (photo) => {
    const photoTag = `\n\n[사진 삽입: ${photo.caption} (출처: ${photo.source}, 제공: ${photo.provider})]\n\n`;
    setArticle((prev) => ({
      ...prev,
      content: prev.content + photoTag
    }));
    setPhotoNotice(`“${photo.caption}” 사진 태그를 본문 끝에 삽입했습니다.`);
  };

  const handleApplyPhoto = (photo) => {
    setArticle((prev) => ({
      ...prev,
      photos: [photo, ...(prev.photos || []).filter((p) => p.id !== photo.id)],
      content: prev.content + `\n\n[사진 삽입: ${photo.caption} (출처: ${photo.source}, 제공: ${photo.provider})]\n\n`,
    }));
    setPhotoNotice(`“${photo.caption}” 편집본을 반영하고 본문 끝에 사진 태그를 삽입했습니다.`);
    setEditingPhoto(null);
  };

  // CMS 발행/이관 실행
  const handleCmsExport = () => {
    setIsCmsExporting(true);
    setTimeout(() => {
      setIsCmsExporting(false);
      setIsCmsSuccessModal(true);
      setArticle((prev) => ({ ...prev, status: "발행 완료" }));
    }, 1200);
  };

  if (editingPhoto) return (
    <PhotoEditor
      key={editingPhoto.id}
      photo={editingPhoto}
      onBack={() => setEditingPhoto(null)}
      onApply={handleApplyPhoto}
      charCount={article.content.length}
    />
  );

  return (
    <div className="w-full space-y-5 animate-float-in">
      {photoNotice && <p role="status" className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{photoNotice}</p>}

      {/* ──────────────────────────────────────────
          1. 최상단 통합 컨트롤 툴바
          (AI 초안, 자료검색, 팩트체크, 뷰 모드 전환, 미디어 관리, CMS 발행)
         ────────────────────────────────────────── */}
      <div className="bg-white/95 rounded-3xl border border-slate-200/90 p-4 md:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        
        {/* 좌측: 기사 작성 도구들 */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowDraftModal(true)}
            className="px-4.5 py-2.5 bg-[#23211F] hover:bg-[#38332E] text-[#FAF8F5] rounded-full font-black text-xs md:text-sm transition shadow-xs flex items-center gap-2 cursor-pointer active:scale-95 border border-[#23211F]"
          >
            <Wand2 className="w-4 h-4 text-amber-300" />
            <span>AI 기사 초안 생성</span>
          </button>
          
          <button
            onClick={onOpenSearch}
            className="px-4.5 py-2.5 bg-[#EFECE6] hover:bg-[#E3DDD4] text-[#23211F] border border-[#DDD6CB] rounded-full text-xs md:text-sm font-bold transition cursor-pointer flex items-center gap-2 active:scale-95"
          >
            <Search className="w-4 h-4 text-[#57514A]" />
            <span>취재자료 검색</span>
          </button>

          <button
            onClick={() => {
              setIsFactCheckDrawerOpen(true);
              if (onRunFactCheck) onRunFactCheck();
            }}
            className={`px-4.5 py-2.5 rounded-full text-xs md:text-sm font-bold transition cursor-pointer flex items-center gap-2 active:scale-95 ${
              factCheckActive || isFactCheckDrawerOpen
                ? "bg-[#23211F] text-[#FAF8F5] border border-[#23211F] shadow-xs"
                : "bg-[#EFECE6] hover:bg-[#E3DDD4] text-[#23211F] border border-[#DDD6CB]"
            }`}
            title="취재파일 업로드 및 원문 근거자료 검증 패널을 엽니다"
          >
            <ShieldCheck className={`w-4 h-4 ${factCheckActive || isFactCheckDrawerOpen ? "text-emerald-400" : "text-emerald-600"}`} />
            <span>기사 팩트체크 & 근거자료</span>
          </button>

          <button
            onClick={() => setShowPhotoModal(true)}
            className="px-4.5 py-2.5 bg-[#EFECE6] hover:bg-[#E3DDD4] text-[#23211F] border border-[#DDD6CB] rounded-full text-xs md:text-sm font-bold transition cursor-pointer flex items-center gap-2 active:scale-95"
          >
            <ImageIcon className="w-4 h-4 text-purple-600" />
            <span>사진·미디어 편집 ({photos.length})</span>
          </button>
        </div>

        {/* 우측: 뷰 모드 전환 및 [CMS 최종 발행] 버튼 */}
        <div className="flex items-center gap-3 flex-wrap">
          {saveStatus && <span className="text-[11px] font-bold text-slate-500" data-testid="save-status">{saveStatus}</span>}
          {(factCheck.busy || factCheck.results.length > 0) && (
            <span className={`text-[11px] font-bold ${factIssues ? "text-rose-600" : "text-emerald-600"}`} data-testid="factcheck-status">
              {factCheck.busy ? "팩트체크 중…" : factIssues ? `확인 필요 ${factIssues}문장` : "팩트체크 통과"}
            </span>
          )}
          {bodyChunks.dev && (
            <button
              onClick={() => bodyChunks.setShow(!bodyChunks.show)}
              title={bodyChunks.error || "청킹 모델이 본문을 나눈 단위를 청크마다 다른 색 밑줄로 표시(개발 모드)"}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full border cursor-pointer ${bodyChunks.show ? "bg-blue-600 text-white border-blue-600" : "text-slate-500 border-slate-300"}`}
            >
              청크 밑줄{bodyChunks.show && bodyChunks.chunks ? ` ${bodyChunks.chunks.length}개` : ""}
            </button>
          )}
          {/* 뷰 모드 전환 탭 (레퍼런스 이미지 스타일 알약 캡슐) */}
          <div className="flex items-center gap-1 bg-[#EFECE6] p-1 rounded-full border border-[#DDD6CB]/80 shadow-inner">
            <button
              onClick={() => setViewMode("editor")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === "editor"
                  ? "bg-white text-[#23211F] shadow-2xs scale-[1.02]"
                  : "text-[#6E6861] hover:text-[#23211F]"
              }`}
              title="기사 작성 에디터만 넓게 봅니다"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>에디터</span>
            </button>

            <button
              onClick={() => setViewMode("split")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === "split"
                  ? "bg-white text-[#23211F] shadow-2xs scale-[1.02]"
                  : "text-[#6E6861] hover:text-[#23211F]"
              }`}
              title="에디터와 실시간 포털 미리보기를 나란히 봅니다"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>나란히 보기</span>
            </button>

            <button
              onClick={() => setViewMode("preview")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === "preview"
                  ? "bg-white text-[#23211F] shadow-2xs scale-[1.02]"
                  : "text-[#6E6861] hover:text-[#23211F]"
              }`}
              title="실시간 최종 포털/신문 뷰만 집중해서 봅니다"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>미리보기</span>
            </button>
          </div>

          {/* CMS 최종 발행/이관 버튼 */}
          <button
            onClick={handleCmsExport}
            disabled={isCmsExporting}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs md:text-sm rounded-full transition shadow-sm cursor-pointer flex items-center gap-2 active:scale-95"
            title="현재 기사를 CMS(신문/포털 송고 시스템)로 최종 발행합니다"
          >
            {isCmsExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>발행 처리 중...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 text-white" />
                <span>CMS 최종 발행/이관</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* ──────────────────────────────────────────
          2. 메인 작업 영역: [좌측 기사 작성/미리보기] + [우측 팩트체크 검증실] 나란히 배치
         ────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start gap-6 w-full min-w-0">

        {/* [좌측 메인 컬럼]: 기사 에디터 / 미리보기 */}
        <div className="w-full flex-1 min-w-0 space-y-5">

          {/* 팩트체크 진행 배너 */}
          {factCheckActive && factCheckIssues.length > 0 && (
            <div className={`bg-amber-50/90 border border-amber-200/90 rounded-2xl p-5 shadow-xs space-y-3 animate-float-in ${
              !isFactCheckDrawerOpen && viewMode === "editor" ? "w-full max-w-4xl mx-auto" : "w-full"
            }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm md:text-base">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>AI 팩트체크 순서형 검사 ({activeFactIndex + 1} / {factCheckIssues.length})</span>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 bg-amber-200/80 text-amber-950 rounded-lg">
              {factCheckIssues[activeFactIndex]?.type}
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-amber-200/80 space-y-2 text-xs md:text-sm">
            <p className="font-semibold text-slate-800">
              문제 문장: <span className="underline decoration-red-500 decoration-2 text-red-700 bg-red-50 px-1 rounded">{factCheckIssues[activeFactIndex]?.targetText}</span>
            </p>
            <p className="text-slate-600">
              <strong className="text-slate-900">발생 이유:</strong> {factCheckIssues[activeFactIndex]?.reason}
            </p>
            <div className="text-slate-900 bg-emerald-50/90 p-2.5 rounded-xl border border-emerald-200 flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span><strong>AI 수정안 제안:</strong> "{factCheckIssues[activeFactIndex]?.suggestion}"</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onSkipFactFix}
              className="px-4 py-1.5 text-xs font-bold bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] rounded-full border border-[#DDD6CB] transition cursor-pointer"
            >
              건너뛰기
            </button>
            <button
              onClick={onApplyFactFix}
              className="px-4 py-1.5 text-xs font-extrabold bg-[#23211F] hover:bg-[#38332E] text-[#FAF8F5] rounded-full transition shadow-xs cursor-pointer flex items-center gap-1 border border-[#23211F]"
            >
              <Check className="w-3.5 h-3.5" />
              수정 적용
            </button>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────
          2. 메인 작업 영역: [에디터] / [나란히 보기] / [미리보기]
         ────────────────────────────────────────── */}
      <div className={`grid gap-6 items-start ${
        viewMode === "split" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
      }`}>

        {/* ──────────────────
            [A] 기사 작성 에디터 캔버스 (viewMode가 'editor' 또는 'split'일 때 표시)
            - 단독 에디터 모드일 때 실제 기사/문서 작성 CMS 스타일로 가운데 집중 배치(max-w-4xl mx-auto)
           ────────────────── */}
        {(viewMode === "editor" || viewMode === "split") && (
          <div className={`bg-white/95 rounded-3xl border border-slate-200/90 p-6 md:p-10 space-y-6 shadow-sm relative min-h-[640px] ${
            !isFactCheckDrawerOpen && viewMode === "editor" ? "w-full max-w-4xl mx-auto" : "w-full"
          }`}>
            
            {/* 기사 헤드라인 영역 */}
            <div 
              className="space-y-2 relative group"
              onMouseEnter={() => setIsTitleHovered(true)}
              onMouseLeave={() => setIsTitleHovered(false)}
            >
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                <span>기사 제목</span>
                {!isTitleConfirmed && (
                  <span className="text-slate-600 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md font-bold border border-slate-200/80">
                    AI 제안 헤드라인
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={article.title}
                  onChange={(e) => {
                    setArticle({ ...article, title: e.target.value });
                    setIsTitleConfirmed(true);
                  }}
                  placeholder="기사 제목을 입력하거나 AI 추천을 확인하세요"
                  className={`w-full text-xl md:text-2xl font-black border-b border-slate-200 pb-3 outline-none transition-colors bg-transparent ${
                    !isTitleConfirmed ? "text-slate-400 font-bold" : "text-slate-900 font-black"
                  }`}
                />

                {(isTitleHovered || !isTitleConfirmed) && (
                  <div className="absolute right-2 bottom-3 flex items-center gap-1.5 bg-white/95 p-1 rounded-full shadow-md border border-[#DDD6CB] animate-float-in">
                    {!isTitleConfirmed && (
                      <button
                        onClick={handleTitleConfirm}
                        className="text-xs px-3 py-1 bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] font-bold rounded-full border border-[#DDD6CB] shadow-2xs transition cursor-pointer flex items-center gap-1"
                      >
                        <Check className="w-3 h-3 text-emerald-600" />
                        확정
                      </button>
                    )}
                    <button
                      onClick={handleRegenerateTitle}
                      className="text-xs px-3 py-1 bg-white hover:bg-[#F5F2ED] text-[#23211F] font-bold rounded-full border border-[#DDD6CB] transition cursor-pointer flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3 text-[#6E6861]" />
                      다시 생성
                    </button>
                  </div>
                )}
              </div>
            </div>

            <SuggestionList
              state={headlineSuggest}
              label="제목"
              onPick={(value) => {
                setArticle((prev) => ({ ...prev, title: value, suggestedTitle: value }));
                headlineSuggest.clear();
              }}
            />

            {/* 부제 영역 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400 font-semibold">부제 (부제목)</label>
                <SuggestButton onClick={subtitleSuggest.request} busy={subtitleSuggest.busy} title="본문과 제목에 맞는 부제를 추천받습니다" />
              </div>
              <input
                type="text"
                value={article.subtitle}
                onChange={(e) => setArticle({ ...article, subtitle: e.target.value })}
                placeholder="기사 부제를 입력하세요"
                className="w-full text-sm md:text-base font-bold text-slate-700 border-b border-slate-200 pb-2 outline-none focus:border-slate-800 bg-transparent transition-colors"
              />
              <SuggestionList
                state={subtitleSuggest}
                label="부제"
                onPick={(value) => {
                  setArticle((prev) => ({ ...prev, subtitle: value }));
                  subtitleSuggest.clear();
                }}
              />
            </div>

            {/* 첨부된 사진 썸네일 스트립 (클릭 시 본문 삽입) */}
            {photos.length > 0 && (
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-700 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                    첨부된 사진 ({photos.length}) · 클릭하여 본문에 바로 삽입:
                  </span>
                  <button
                    onClick={() => setShowPhotoModal(true)}
                    className="text-blue-600 hover:underline font-bold text-[11px]"
                  >
                    + 사진 추가
                  </button>
                </div>

                <div className="flex items-center gap-3 overflow-x-auto pb-1">
                  {photos.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleInsertPhotoToContent(p)}
                      className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-200 hover:border-slate-900 transition cursor-pointer shadow-2xs group min-w-[200px]"
                      title="클릭 시 본문 커서 위치에 사진 태그가 삽입됩니다"
                    >
                      <img src={p.url} alt="thumb" className="w-12 h-10 object-cover rounded-lg flex-shrink-0" />
                      <div className="truncate text-xs">
                        <span className="font-extrabold text-slate-900 block truncate">{p.caption}</span>
                        <span className="text-[10px] text-slate-400 block">{p.source}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 본문 텍스트 에디터 */}
            <div className="relative pt-1" ref={editorRef} onMouseUp={handleSelection}>
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-2">
                <span>본문 작성 영역 (자유 작성 및 서식 적용)</span>
                <span className="flex items-center gap-2">
                  <FlowSummaryButton body={article.content} />
                  공백 포함 {article.content.length.toLocaleString()}자
                </span>
              </div>

              {/* 드래그 플로팅 툴바 */}
              {floatingToolbarPos && (
                <div
                  style={{ top: `${floatingToolbarPos.top}px`, left: `${floatingToolbarPos.left}px` }}
                  className="absolute z-30 flex items-center gap-1 bg-slate-900 text-white px-2 py-1.5 rounded-xl shadow-xl border border-slate-700 animate-float-in text-xs"
                >
                  <button onClick={() => applyFormat("굵게")} className="p-1 hover:bg-slate-800 rounded-md" title="굵게">
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => applyFormat("기울임")} className="p-1 hover:bg-slate-800 rounded-md" title="기울임">
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => applyFormat("인용구")} className="p-1 hover:bg-slate-800 rounded-md" title="인용구">
                    <Quote className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-[1px] h-4 bg-slate-700 my-auto mx-1" />
                  <button
                    onClick={() => applyFormat("AI 다듬기")}
                    className="p-1 px-2 hover:bg-blue-600 rounded-md transition flex items-center gap-1 text-blue-300 font-bold"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    AI 문장 다듬기
                  </button>
                </div>
              )}

              <HighlightedBody
                value={article.content}
                onChange={(content) => setArticle({ ...article, content })}
                results={factCheck.results}
                chunks={bodyChunks.chunks}
                onRecheck={factCheck.recheck}
                focus={factCheck.focus}
                recheckBusy={factCheck.recheckBusy}
              />
            </div>

          </div>
        )}

        {/* ──────────────────
            [B] 실시간 포털/신문 미리보기 캔버스 (viewMode가 'preview' 또는 'split'일 때 표시)
           ────────────────── */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div className={`bg-white/95 rounded-3xl border border-slate-200/90 p-5 md:p-8 space-y-5 shadow-xs ${
            viewMode === "preview" ? "w-full max-w-4xl mx-auto" : "w-full"
          }`}>
            
            {/* 미리보기 상단 플랫폼 전환 탭 (동아일보 vs 네이버 뉴스) */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs md:text-sm font-extrabold text-slate-900">
                  실시간 독자 화면 미리보기
                </span>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setPreviewPlatform("donga")}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                    previewPlatform === "donga"
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  동아일보 웹
                </button>
                <button
                  onClick={() => setPreviewPlatform("naver")}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                    previewPlatform === "naver"
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  네이버 뉴스
                </button>
              </div>
            </div>

            {/* 실제 미리보기 프레임 */}
            <div className="bg-slate-100/70 p-4 md:p-6 rounded-3xl border border-slate-200 shadow-inner">
              
              {/* 1. 동아일보 공식 웹 뉴스 뷰 */}
              {previewPlatform === "donga" && (
                <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 md:p-8 space-y-5 max-w-2xl mx-auto animate-float-in">
                  {/* 동아 브랜드 헤더 */}
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3 text-xs">
                    <span className="font-serif font-black text-slate-900 text-lg tracking-wider">
                      東亞日報
                    </span>
                    <span className="text-slate-400 font-medium">경제 · IT 산업</span>
                  </div>

                  {/* 제목 & 부제 */}
                  <div className="space-y-2">
                    <h2 className="text-xl md:text-2xl font-black text-slate-950 leading-tight">
                      {article.title || "기사 제목이 이곳에 표시됩니다"}
                    </h2>
                    {article.subtitle && (
                      <p className="text-xs md:text-sm font-bold text-slate-600 leading-relaxed">
                        {article.subtitle}
                      </p>
                    )}
                  </div>

                  {/* 바이라인 & 작성일자 */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-800">기자</span>
                      <span>|</span>
                      <span>입력 {article.createdAt}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Bookmark className="w-3.5 h-3.5 text-slate-400" />
                      <Share2 className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>

                  {/* 기사 대표 사진 (있을 경우) */}
                  {photos.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="aspect-video rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                        <img src={photos[0].url} alt="main article" className="w-full h-full object-cover" />
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">
                        ▲ {photos[0].caption} (출처: {photos[0].source})
                      </p>
                    </div>
                  )}

                  {/* 기사 본문 줄글 */}
                  <div className="text-xs md:text-sm text-slate-800 leading-loose whitespace-pre-line font-serif space-y-4 pt-1">
                    {article.content || "기사 본문 내용이 실시간으로 렌더링됩니다..."}
                  </div>
                </div>
              )}

              {/* 2. 네이버 뉴스 포털 뷰 */}
              {previewPlatform === "naver" && (
                <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-5 md:p-7 space-y-4 max-w-2xl mx-auto animate-float-in">
                  {/* 네이버 뉴스 뱃지 */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-emerald-500 text-white font-black text-xs flex items-center justify-center">
                        N
                      </span>
                      <span className="font-extrabold text-xs text-slate-900">네이버 뉴스 · IT/과학</span>
                    </div>
                    <span className="text-[10px] text-slate-400">포털 송고 규격</span>
                  </div>

                  {/* 제목 */}
                  <h2 className="text-lg md:text-xl font-black text-slate-950 leading-snug">
                    {article.title || "기사 제목이 표시됩니다"}
                  </h2>

                  {/* 언론사 및 바이라인 */}
                  <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-100">
                    <span className="font-bold text-slate-900">동아일보</span>
                    <span className="text-[11px]">2026.10.02. 오후 5:00</span>
                  </div>

                  {/* 대표 이미지 */}
                  {photos.length > 0 && (
                    <div className="space-y-1">
                      <div className="aspect-video rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                        <img src={photos[0].url} alt="naver news media" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-[10px] text-slate-400 block">{photos[0].caption}</span>
                    </div>
                  )}

                  {/* 본문 */}
                  <div className="text-xs md:text-sm text-slate-900 leading-relaxed whitespace-pre-line font-sans pt-1">
                    {article.content || "작성된 기사 본문이 포털 양식으로 미리보기됩니다."}
                  </div>
                </div>
              )}

            </div>

          </div>
        )}

          {/* grid 닫기 */}
          </div>

        {/* 좌측 컬럼 flex-1 닫기 */}
        </div>

        {/* [우측 컬럼]: 팩트체크 & 근거자료 검증 패널 (나란히 인라인 배치되어 절대 겹치지 않음) */}
        {isFactCheckDrawerOpen && (
          <FactCheckDrawer
            isOpen={isFactCheckDrawerOpen}
            onClose={() => setIsFactCheckDrawerOpen(false)}
            article={article}
            setArticle={setArticle}
            factCheck={factCheck}
          />
        )}

      {/* 메인 flex 컨테이너 닫기 */}
      </div>

      {/* ──────────────────────────────────────────
          3. 사진·미디어 관리 및 본문 삽입 모달
         ────────────────────────────────────────── */}
      {showPhotoModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-2xl space-y-5 animate-float-in border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-black text-slate-900">기사 사진 업로드 및 규격 편집</h3>
              </div>
              <button
                onClick={() => setShowPhotoModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ×
              </button>
            </div>

            <PhotoFinder
              body={article.content}
              onPick={(photo) => {
                setEditingPhoto(photo);
                setShowPhotoModal(false);
              }}
            />

            {/* 새 사진 업로드 폼 */}
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-800 block mb-1">사진 설명 (캡션)</label>
                <input
                  type="text"
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  placeholder="예: 국내 연구진이 발표한 차세대 AI 반도체 시제품"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">사진 출처</label>
                  <input
                    type="text"
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    placeholder="동아일보 DB"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">제공자</label>
                  <input
                    type="text"
                    value={newProvider}
                    onChange={(e) => setNewProvider(e.target.value)}
                    placeholder="기자 이름"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">자동 규격 선택</label>
                <div className="grid grid-cols-3 gap-2">
                  {["16:9 (대표)", "4:3 (본문)", "1:1 (SNS)"].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setNewRatio(r)}
                      className={`p-2 rounded-xl text-center font-bold border transition cursor-pointer ${
                        newRatio === r
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="w-full py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 font-extrabold rounded-xl border border-purple-200 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>내 PC에서 사진 파일 업로드</span>
                </button>
                <input
                  type="file"
                  ref={photoInputRef}
                  onChange={handlePhotoUpload}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />
              </div>
              {photoError && <p role="alert" className="text-rose-600">{photoError}</p>}
            </div>

            {/* 현재 등록된 사진 리스트 */}
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <span className="text-xs font-bold text-slate-700 block">등록된 사진 목록:</span>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {photos.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="flex items-center gap-2.5 truncate">
                      <img src={p.url} alt="p" className="w-10 h-8 object-cover rounded-md flex-shrink-0" />
                      <span className="font-bold text-slate-800 truncate">{p.caption}</span>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => { setEditingPhoto(p); setShowPhotoModal(false); }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-lg shadow-2xs cursor-pointer"
                      >편집</button>
                      <button
                        onClick={() => handleInsertPhotoToContent(p)}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-lg shadow-2xs cursor-pointer"
                      >본문 삽입</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowPhotoModal(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────
          4. CMS 최종 발행 성공 알림 모달
         ────────────────────────────────────────── */}
      {isCmsSuccessModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl text-center space-y-4 animate-float-in border border-slate-100">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <h3 className="text-lg font-black text-slate-950">CMS 발행이 완료되었습니다</h3>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              동아일보 디지털 통합 시스템(CMS)과 포털 송고 대기열로 기사 텍스트와 사진 데이터가 성공적으로 이관되었습니다.
            </p>
            <button
              onClick={() => setIsCmsSuccessModal(false)}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer transition"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* AI 기사 초안 생성 모달 */}
      {showDraftModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-2xl border border-white space-y-5 animate-float-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-amber-500" />
                <h3 className="text-base font-bold text-slate-900">AI 기사 초안 생성</h3>
              </div>
              <button
                onClick={() => setShowDraftModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 text-xs md:text-sm">
              <p className="text-slate-600">
                수집된 취재자료나 녹취 데이터를 바탕으로 AI가 종합 기사 초안을 작성합니다.
              </p>

              <div className="space-y-2">
                <label className="font-bold text-slate-800 block">연결할 취재자료 선택</label>
                <div className="space-y-2 bg-slate-50/80 p-3 rounded-xl border border-slate-200">
                  {!article.linkedSources.length && <span className="text-slate-400">연결된 취재자료가 없어요.</span>}
                  {article.linkedSources.map((src, idx) => (
                    <label key={idx} className="flex items-center gap-2.5 text-slate-800 text-xs cursor-pointer">
                      <input 
                        type="checkbox" 
                        defaultChecked={idx < 2} 
                        className="w-4 h-4 rounded text-slate-900 focus:ring-slate-800"
                      />
                      <span>{src}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-800 block">추가 지시사항 (선택)</label>
                <input
                  type="text"
                  value={draftPrompt}
                  onChange={(e) => setDraftPrompt(e.target.value)}
                  placeholder="예: 핵심 기술 성과 위주로 객관적 톤으로 작성해줘"
                  className="w-full px-3.5 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-slate-800 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowDraftModal(false)}
                className="px-4 py-2 bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] border border-[#DDD6CB] text-xs font-bold rounded-full transition cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleGenerateDraft}
                disabled={isGenerating}
                className="px-5 py-2 bg-[#23211F] hover:bg-[#38332E] text-[#FAF8F5] text-xs font-bold rounded-full transition shadow-xs cursor-pointer flex items-center gap-2 border border-[#23211F]"
              >
                {isGenerating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>초안 생성 중...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5 text-amber-300" />
                    <span>초안 자동 생성</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────
          우측 사이드 플로팅 슬라이더 토글 버튼
          (패널이 닫혀 있을 때만 우측 가장자리에 표시)
         ────────────────────────────────────────── */}
      {!isFactCheckDrawerOpen && (
        <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40 animate-float-in">
          <button
            onClick={() => setIsFactCheckDrawerOpen(true)}
            className="flex items-center gap-2 bg-[#23211F] hover:bg-[#38332E] text-[#FAF8F5] font-extrabold text-xs py-3.5 px-3 rounded-l-2xl shadow-xl border-y border-l border-[#38332E] transition-all hover:pl-4 group cursor-pointer active:scale-95"
            title="취재파일 업로드 및 원문 근거자료 검증 슬라이더 열기"
          >
            <div className="flex flex-col items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <ShieldCheck className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span className="[writing-mode:vertical-rl] tracking-widest text-[11px] font-bold text-slate-200">
                팩트체크 · 근거자료
              </span>
            </div>
          </button>
        </div>
      )}

    </div>
  );
}

// 팩트체크 결과 하이라이트 — 투명 textarea 뒤에 같은 글자를 깔고 구간에 색을 칠한다(옛 archive-os EditorView 방식).
// 코어가 짚은 위치(틀린 값·거의 같은 문장의 다른 부분)만 칠하고, 위치가 없으면 문장 전체. 본문을 고쳐 문장이 바뀐 결과는 칠하지 않는다.
const MARK = {
  CONFLICT: "bg-rose-200/90 ring-1 ring-inset ring-rose-400",
  EVIDENCE_GAP: "bg-amber-200/80",
  REVIEW: "bg-violet-200/70",
  EXTERNAL_REQUIRED: "bg-violet-200/70",
  FOCUS: "bg-emerald-200/80", // 서랍의 '팩트 일치' 카드에 마우스를 올린 동안
  DETAIL: "bg-amber-200/80", // 날짜·기관·주체는 별도 의미 확인이 필요
};
const OUTLINE = { CONFLICT: "#9f1239", EVIDENCE_GAP: "#b45309", REVIEW: "#6d28d9", EXTERNAL_REQUIRED: "#6d28d9" }; // 하이라이트색의 진한 판(마우스 올린 문장)
const MARK_LABEL = { CONFLICT: "자료와 불일치", EVIDENCE_GAP: "근거 부족", REVIEW: "검토 필요", EXTERNAL_REQUIRED: "검토 필요" };

// 청크 밑줄(개발 모드) — 이웃 청크끼리 색이 겹치지 않게 돌려 쓴다
const CHUNK_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];

function HighlightedBody({ value, onChange, results, chunks = null, onRecheck, recheckBusy, focus = null }) {
  const layer = useRef(null);
  const [hover, setHover] = useState(null); // { key, x, y } — 하이라이트 위 마우스(textarea 가 위를 덮어 마크가 이벤트를 못 받으니 좌표로 찾는다)

  const ranges = useMemo(() => {
    const out = results
      .map((r) => (r.verdict === "SUPPORTED" && r.id === focus ? { ...r, verdict: "FOCUS", spans: supportedClaimRanges(r.claimText, r.details).map((s) => ({ ...s, start: s.start + r.start, end: s.end + r.start })) } : r))
      .filter((r) => MARK[r.verdict] && r.start >= 0 && value.slice(r.start, r.start + r.claimText.length) === r.claimText)
      .flatMap((r) => (r.spans.length ? r.spans : [{ start: r.start, end: r.start + r.claimText.length }])
        .map((x) => ({ ...x, verdict: r.verdict === "FOCUS" && x.detail ? "DETAIL" : r.verdict, key: r.judgedBy === "external" ? "" : r.key })))
      .sort((a, b) => a.start - b.start);
    return out.filter((x, i) => i === 0 || x.start >= out[i - 1].end); // 겹치면 앞의 것만
  }, [results, value, focus]);

  const parts = [];
  let cursor = 0;
  ranges.forEach((x, i) => {
    parts.push(value.slice(cursor, x.start));
    parts.push(<mark key={i} data-key={x.key} className={`${MARK[x.verdict]} text-transparent rounded-sm`}
      style={x.key && hover?.key === x.key ? { outline: `2px solid ${OUTLINE[x.verdict]}`, outlineOffset: 1 } : undefined} title={x.title || MARK_LABEL[x.verdict]}>{value.slice(x.start, x.end)}</mark>);
    cursor = x.end;
  });
  parts.push(value.slice(cursor) + "\n"); // 마지막 줄바꿈도 높이를 맞춘다

  // 뒤의 글자 층이 높이를 정하고(글이 길어지면 같이 늘어남) textarea 는 그 위를 덮는다 → 줄바꿈 위치가 항상 같다
  const box = "w-full min-h-[460px] text-xs md:text-sm leading-relaxed p-5 rounded-2xl border font-sans whitespace-pre-wrap break-words";
  const findMark = (e) => {
    if (!onRecheck || !layer.current) return null;
    const box = layer.current.parentElement.getBoundingClientRect();
    for (const m of layer.current.querySelectorAll("mark[data-key]")) {
      if (!m.dataset.key) continue; // 이미 AI 재판정한 문장
      for (const r of m.getClientRects())
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)
          return { key: m.dataset.key, x: e.clientX - box.left, y: r.top - box.top };
    }
    return null;
  };

  return (
    <div className="relative bg-slate-50/70 rounded-2xl focus-within:bg-white transition-all">
      <div ref={layer} aria-hidden="true" data-testid="fact-highlight" className={`${box} text-transparent border-transparent pointer-events-none`}>
        {parts}
      </div>
      {chunks && (
        <div aria-hidden="true" data-testid="chunk-underline" className={`${box} absolute inset-0 text-transparent border-transparent pointer-events-none`}>
          {chunks.filter((c) => c.end <= value.length).reduce((acc, c, i, list) => {
            const prev = i ? list[i - 1].end : 0;
            acc.push(value.slice(prev, c.start));
            acc.push(
              <span key={i} style={{ textDecoration: `underline 2px ${CHUNK_COLORS[i % CHUNK_COLORS.length]}`, textUnderlineOffset: "5px" }}>
                {value.slice(c.start, c.end)}
              </span>
            );
            if (i === list.length - 1) acc.push(value.slice(c.end));
            return acc;
          }, [])}
        </div>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onMouseMove={(e) => setHover(findMark(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const hit = findMark(e);
          if (hit && !recheckBusy && e.target.selectionEnd === e.target.selectionStart) {
            setHover(null);
            onRecheck(hit.key);
          }
        }}
        placeholder="기사 본문을 입력하세요. 자유롭게 문단을 작성할 수 있습니다..."
        className={`${box} absolute inset-0 h-full overflow-hidden text-slate-900 bg-transparent border-slate-200 focus:border-slate-800 outline-none resize-none shadow-2xs ${hover ? "cursor-pointer" : ""}`}
      />
      {hover && (
        <div data-testid="recheck-tip" className="absolute z-10 -translate-x-1/2 -translate-y-full -mt-1 px-2 py-1 rounded-md bg-slate-900 text-white text-[11px] font-bold pointer-events-none whitespace-nowrap shadow"
          style={{ left: hover.x, top: hover.y - 4 }}>
          {recheckBusy ? "상위모델 재검토 중…" : "상위모델로 재검토"}
        </div>
      )}
    </div>
  );
}
