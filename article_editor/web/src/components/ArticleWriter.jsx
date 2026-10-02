import React, { useState, useRef } from "react";
import FactCheckDrawer from "./FactCheckDrawer";
// 코어 편집 보조(제목·부제 추천, 사진 찾기, 흐름 요약, 자동 저장) — 로직은 EditorialAssist.jsx
import { useSuggestions, SuggestionList, SuggestButton, PhotoFinder, FlowSummaryButton, useAutosave } from "./EditorialAssist";
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
  onSkipFactFix
}) {
  // 1. 화면 뷰 모드: 'editor' (에디터만) | 'split' (에디터+미리보기 나란히) | 'preview' (미리보기 전체)
  const [viewMode, setViewMode] = useState("editor");

  // 팩트체크 & 근거자료 우측 슬라이더(Drawer) 열림 상태
  const [isFactCheckDrawerOpen, setIsFactCheckDrawerOpen] = useState(false);

  // 2. 미리보기 플랫폼 탭: 'donga' (동아일보 공식 웹) | 'naver' (네이버 뉴스 포털)
  const [previewPlatform, setPreviewPlatform] = useState("donga");

  // 3. 사진/미디어 관리 상태
  const [photos, setPhotos] = useState(article.photos || []);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [newCaption, setNewCaption] = useState("");
  const [newSource, setNewSource] = useState("동아일보 DB");
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
  const saveStatus = useAutosave(article);

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
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvt) => {
        if (uploadEvt.target?.result) {
          const newPhoto = {
            id: `photo-${Date.now()}`,
            url: uploadEvt.target.result,
            caption: newCaption || file.name,
            source: newSource || "동아일보 DB",
            provider: newProvider || "기자",
            ratio: newRatio
          };
          const updated = [newPhoto, ...photos];
          setPhotos(updated);
          setArticle((prev) => ({ ...prev, photos: updated }));
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
    alert(`"${photo.caption}" 사진이 기사 본문에 삽입되었습니다.`);
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

  return (
    <div className="w-full space-y-5 animate-float-in">

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
      <div className="flex items-start gap-6 w-full min-w-0">

        {/* [좌측 메인 컬럼]: 기사 에디터 / 미리보기 */}
        <div className="flex-1 min-w-0 space-y-5">

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

              <textarea
                value={article.content}
                onChange={(e) => setArticle({ ...article, content: e.target.value })}
                placeholder="기사 본문을 입력하세요. 자유롭게 문단을 작성할 수 있습니다..."
                className="w-full min-h-[460px] text-slate-900 text-xs md:text-sm leading-relaxed p-5 bg-slate-50/70 rounded-2xl border border-slate-200 focus:bg-white focus:border-slate-800 outline-none transition-all resize-y shadow-2xs font-sans"
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
                const updated = [photo, ...photos];
                setPhotos(updated);
                setArticle((prev) => ({ ...prev, photos: updated }));
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
                  accept="image/*"
                  className="hidden"
                />
              </div>
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
                    <button
                      onClick={() => handleInsertPhotoToContent(p)}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-lg shadow-2xs flex-shrink-0 cursor-pointer"
                    >
                      본문 삽입
                    </button>
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
