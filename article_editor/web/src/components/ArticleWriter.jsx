import React, { useState, useRef, useMemo } from "react";
import FactCheckDrawer from "./FactCheckDrawer";
import PhotoEditor from "./PhotoEditor";
import VersionHistory from "./VersionHistory";
import { createEmptyArticle } from "../data/article";
import { supportedClaimRanges } from "../api/claim-details.js";
// 코어 편집 보조(제목·부제 추천, 사진 찾기, 흐름 요약, 자동 저장) — 로직은 EditorialAssist.jsx
import { useSuggestions, SuggestionList, SuggestButton, PhotoFinder, FlowSummaryButton, useFactCheck } from "./EditorialAssist";
import { 
  Sparkles, 
  Search, 
  Check, 
  RotateCcw, 
  History,
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
  Share2,
  Bookmark,
  ShieldCheck,
  Bot,
  Lock,
  Unlock,
  Plus,
  X,
  GripVertical
} from "lucide-react";

export default function ArticleWriter({ 
  article, 
  setArticle, 
  onOpenSearch, 
  onModels,
  saveStatus // 자동 저장은 App 에서(어느 화면에 있든 저장된다)
}) {
  // 1. 화면 뷰 모드: 'editor' (에디터만) | 'split' (에디터+미리보기 나란히) | 'preview' (미리보기 전체)
  const [viewMode, setViewMode] = useState("editor");

  // 팩트체크 & 근거자료 우측 슬라이더(Drawer) 열림 상태
  const [isFactCheckDrawerOpen, setIsFactCheckDrawerOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // 팩트체크 — 글쓰기가 멈추면 자동 실행. 서랍을 닫아도 본문 하이라이트가 남도록 여기에 둔다
  const factCheck = useFactCheck(article);
  const issues = useMemo(() => factCheck.results.filter((r) => r.verdict !== "SUPPORTED").sort((a, b) => a.start - b.start), [factCheck.results]);
  const factIssues = issues.length;
  // 순서형 검사: 버튼을 누르면 켜지고, 문제 문장을 한 건씩 넘겨 본다. 문장이 고쳐져 줄어들면 순서를 맞춘다
  const [review, setReview] = useState(false);
  const [reviewIdx, setReviewIdx] = useState(0);
  const reviewAt = Math.min(reviewIdx, Math.max(0, issues.length - 1));
  const current = issues[reviewAt];

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
  const [isTitleLocked, setIsTitleLocked] = useState(false);
  const [showTitleAiMenu, setShowTitleAiMenu] = useState(false);
  const titleAiSuggestions = [
    "AI 반도체 개척자들... 초거대 AI 시대의 차세대 주도권 경쟁",
    "국내 팹리스·파운드리 연합, '온디바이스 AI' 생태계 주도 선언",
    "AI 칩 전쟁 2막, 데이터센터에서 모바일로... K-반도체 승부수",
    "GPU 품귀 뚫을 차세대 대안... 국산 NPU 기술력 글로벌 호평"
  ];

  // 부제목 잠금, 다중 슬롯 및 AI 추천 상태
  const [showSubtitleAiMenu, setShowSubtitleAiMenu] = useState(false);
  const [subtitles, setSubtitles] = useState(() => [
    { id: "sub-1", text: "국내 주요 반도체 기업, NPU 및 PIM 기술로 글로벌 시장에 도전장", locked: false },
    { id: "sub-2", text: "전력 소비 70% 절감·데이터 병목 해소 기술 개발 집중", locked: false }
  ]);
  const [draggedSubtitleIndex, setDraggedSubtitleIndex] = useState(null);
  const [selectedAiSubtitles, setSelectedAiSubtitles] = useState([
    "국내 주요 반도체 기업, NPU 및 PIM 기술로 글로벌 시장에 도전장",
    "전력 소비 70% 절감·데이터 병목 해소 기술 개발 집중"
  ]);

  const subtitleAiSuggestions = [
    "국내 주요 반도체 기업, NPU 및 PIM 기술로 글로벌 시장에 도전장",
    "전력 소비 70% 절감·데이터 병목 해소 기술 개발 집중",
    "글로벌 빅테크 납품 테스트 돌입... 2026년 상용화 목표",
    "정부 차원의 대규모 실증 사업 및 제조 생태계 지원 확대"
  ];

  const handleSubtitleChange = (index, value) => {
    const next = [...subtitles];
    next[index] = { ...next[index], text: value };
    setSubtitles(next);
    setArticle((prev) => ({ ...prev, subtitle: next.map((s) => s.text).filter(Boolean).join("\n") }));
  };

  const handleToggleSubtitleLock = (index) => {
    const next = [...subtitles];
    next[index] = { ...next[index], locked: !next[index].locked };
    setSubtitles(next);
  };

  const handleAddSubtitle = () => {
    if (subtitles.length < 4) {
      const next = [...subtitles, { id: `sub-${Date.now()}`, text: "", locked: false }];
      setSubtitles(next);
    }
  };

  const handleRemoveSubtitle = (index) => {
    if (subtitles.length > 1) {
      const next = subtitles.filter((_, i) => i !== index);
      setSubtitles(next);
      setArticle((prev) => ({ ...prev, subtitle: next.map((s) => s.text).filter(Boolean).join("\n") }));
    }
  };

  const handleDragStart = (e, index) => {
    if (subtitles[index].locked) {
      e.preventDefault();
      return;
    }
    setDraggedSubtitleIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedSubtitleIndex === null || draggedSubtitleIndex === targetIndex) return;
    if (subtitles[targetIndex].locked || subtitles[draggedSubtitleIndex].locked) {
      setDraggedSubtitleIndex(null);
      return;
    }
    const next = [...subtitles];
    const [draggedItem] = next.splice(draggedSubtitleIndex, 1);
    next.splice(targetIndex, 0, draggedItem);
    setSubtitles(next);
    setDraggedSubtitleIndex(null);
    setArticle((prev) => ({ ...prev, subtitle: next.map((s) => s.text).filter(Boolean).join("\n") }));
  };

  const handleToggleAiSubtitle = (text) => {
    setSelectedAiSubtitles((prev) =>
      prev.includes(text) ? prev.filter((item) => item !== text) : (prev.length < 4 ? [...prev, text] : prev)
    );
  };

  const handleApplyAiSubtitles = () => {
    if (selectedAiSubtitles.length > 0) {
      const next = selectedAiSubtitles.map((text, i) => ({
        id: `sub-${i}-${Date.now()}`,
        text,
        locked: false
      }));
      setSubtitles(next);
      setArticle((prev) => ({ ...prev, subtitle: selectedAiSubtitles.join("\n") }));
    }
    setShowSubtitleAiMenu(false);
  };

  const [selectedText, setSelectedText] = useState("");
  const [floatingToolbarPos, setFloatingToolbarPos] = useState(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [isGenerating] = useState(false); // ponytail: 초안 생성 AI 는 아직 코어 계약이 없어 항상 false — 연결할 때 setter 를 쓴다

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
    <div className="w-full relative min-w-0 animate-float-in">
      {photoNotice && <p role="status" className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 mb-4">{photoNotice}</p>}

      {/* 메인 좌우 레이아웃: [좌측 에디터] + [우측 사이드바] */}
      <div className="w-full flex items-start gap-4 md:gap-6 min-w-0">
        {/* 1. 중앙/좌측 메인 작업 영역: [에디터] / [나란히 보기] / [미리보기] */}
        <div className="w-full flex-1 min-w-0 space-y-5">

          {/* 팩트체크 순서형 검사 — 코어가 짚은 문제 문장을 한 건씩 보여 준다(본문 하이라이트는 그대로, 지금 보는 문장만 진한 윤곽) */}
          {review && current && (
            <div data-testid="fact-sequence" className={`bg-amber-50/90 border border-amber-200/90 rounded-2xl p-5 shadow-xs space-y-3 animate-float-in ${
              !isFactCheckDrawerOpen && viewMode === "editor" ? "w-full max-w-4xl mx-auto" : "w-full"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm md:text-base">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <span>AI 팩트체크 순서형 검사 ({reviewAt + 1} / {issues.length})</span>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 bg-amber-200/80 text-amber-950 rounded-lg">
                  {MARK_LABEL[current.verdict] || current.verdict}
                </span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-amber-200/80 space-y-2 text-xs md:text-sm">
                <p className="font-semibold text-slate-800">
                  문제 문장: <span className="underline decoration-red-500 decoration-2 text-red-700 bg-red-50 px-1 rounded">{current.claimText}</span>
                </p>
                {current.comment && (
                  <p className="text-slate-600">
                    <strong className="text-slate-900">발생 이유:</strong> {current.comment}
                  </p>
                )}
                {current.quote && (
                  <p className="text-slate-600 line-clamp-3">
                    <strong className="text-slate-900">근거{current.sourceDoc ? ` (${current.sourceDoc})` : ""}:</strong> {current.quote}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setReviewIdx(Math.max(0, reviewAt - 1))}
                  disabled={reviewAt === 0}
                  className="px-4 py-1.5 text-xs font-bold bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] rounded-full border border-[#DDD6CB] transition cursor-pointer disabled:opacity-40 disabled:cursor-default"
                >
                  이전
                </button>
                <button
                  onClick={() => (reviewAt + 1 < issues.length ? setReviewIdx(reviewAt + 1) : setReview(false))}
                  className="px-4 py-1.5 text-xs font-extrabold bg-[#23211F] hover:bg-[#38332E] text-[#FAF8F5] rounded-full transition shadow-xs cursor-pointer border border-[#23211F]"
                >
                  {reviewAt + 1 < issues.length ? "다음" : "검사 종료"}
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
            - Editorial Minimalist 레이아웃 (rounded-[16px], low-contrast border, soft shadow)
           ────────────────── */}
        {(viewMode === "editor" || viewMode === "split") && (
          <div className={`bg-white/90 backdrop-blur-xs rounded-[16px] border border-black/[0.05] p-6 md:p-8 space-y-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] relative min-h-[640px] ${
            !isFactCheckDrawerOpen && viewMode === "editor" ? "w-full max-w-4xl mx-auto" : "w-full"
          }`}>
            
            {/* 기사 헤드라인 영역 */}
            {/* 기사 헤드라인 영역 */}
            {/* 기사 헤드라인 영역 */}
            <div className="space-y-2 relative group">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold h-7">
                <span>기사 제목</span>
                <div className="flex items-center gap-1.5">
                  {/* AI 버튼 */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowTitleAiMenu(!showTitleAiMenu);
                        if (!showTitleAiMenu) headlineSuggest.request();
                      }}
                      className="px-2 py-1 rounded-md hover:bg-black/5 text-slate-800 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      title="AI 추천 제목"
                    >
                      <Bot className="w-4 h-4 text-slate-700" />
                      <span className="text-[11px] font-extrabold text-slate-800">AI</span>
                    </button>
                    {showTitleAiMenu && (
                      <div className="absolute right-0 top-8 z-40 w-80 bg-white rounded-xl shadow-xl border border-black/5 p-2 space-y-1 animate-float-in">
                        <div className="px-2 py-1 text-[11px] font-bold text-slate-500 border-b border-black/5 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Bot className="w-3.5 h-3.5 text-slate-700" />
                            AI 추천
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowTitleAiMenu(false)}
                            className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {(headlineSuggest.data?.length ? headlineSuggest.data : titleAiSuggestions).map((st, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setArticle((prev) => ({ ...prev, title: st, suggestedTitle: st }));
                              setIsTitleLocked(false);
                              setShowTitleAiMenu(false);
                              headlineSuggest.clear();
                            }}
                            className="w-full text-left p-2 rounded-lg hover:bg-slate-50 text-xs font-semibold text-slate-800 transition cursor-pointer"
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 잠금 기능 버튼 */}
                  <button
                    type="button"
                    onClick={() => setIsTitleLocked(!isTitleLocked)}
                    className={`w-6 h-6 rounded-md flex items-center justify-center transition cursor-pointer hover:bg-black/5 ${
                      isTitleLocked ? "text-slate-400" : "text-slate-700"
                    }`}
                    title={isTitleLocked ? "잠금 해제" : "잠금"}
                  >
                    {isTitleLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={article.title}
                  readOnly={isTitleLocked}
                  onChange={(e) => {
                    setArticle({ ...article, title: e.target.value });
                    setIsTitleLocked(false);
                  }}
                  placeholder="기사 제목을 입력하세요"
                  className={`w-full text-2xl md:text-3xl lg:text-[32px] font-black tracking-tight leading-snug border-b border-slate-200 pb-3 outline-none transition-colors bg-transparent ${
                    isTitleLocked ? "text-slate-400 font-bold" : "text-slate-950 font-black"
                  }`}
                />
              </div>
            </div>

            {/* 부제 (부제목) 영역 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold h-7">
                <span>부제 (부제목)</span>
                <div className="flex items-center gap-1.5">
                  {/* AI 버튼 */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSubtitleAiMenu(!showSubtitleAiMenu);
                        if (!showSubtitleAiMenu) subtitleSuggest.request();
                      }}
                      className="px-2 py-1 rounded-md hover:bg-black/5 text-slate-800 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      title="AI 추천 부제목"
                    >
                      <Bot className="w-4 h-4 text-slate-700" />
                      <span className="text-[11px] font-extrabold text-slate-800">AI</span>
                    </button>
                    {showSubtitleAiMenu && (
                      <div className="absolute right-0 top-8 z-40 w-84 bg-white rounded-xl shadow-xl border border-black/10 p-3 space-y-2.5 animate-float-in">
                        {/* 헤더 */}
                        <div className="px-1 py-1 text-[11px] font-bold text-slate-600 border-b border-black/5 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Bot className="w-3.5 h-3.5 text-slate-700" />
                            AI 추천 통 부제목 세트
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">2~4줄 완성형 묶음</span>
                          <button
                            type="button"
                            onClick={() => setShowSubtitleAiMenu(false)}
                            className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* 2~4줄 완성형 통 부제목 세트(묶음) 영역 */}
                        {(() => {
                          const raw = (subtitleSuggest.data?.length ? subtitleSuggest.data : subtitleAiSuggestions);
                          const bundle = raw.length >= 2 ? raw.slice(0, 4) : subtitleAiSuggestions.slice(0, 2);
                          const applyBundle = () => {
                            const next = bundle.map((text, i) => ({
                              id: `sub-${i}-${Date.now()}`,
                              text,
                              locked: false
                            }));
                            setSubtitles(next);
                            setSelectedAiSubtitles(bundle);
                            setArticle((prev) => ({ ...prev, subtitle: bundle.join("\n") }));
                            setShowSubtitleAiMenu(false);
                          };

                          return (
                            <>
                              <div
                                onClick={applyBundle}
                                className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200 transition cursor-pointer group"
                                title="클릭하여 이 부제목 세트 전체 적용"
                              >
                                <div className="text-[10px] font-bold text-slate-400 mb-2 flex items-center justify-between">
                                  <span>추천 통 부제목 ({bundle.length}줄 구성)</span>
                                  <span className="text-[9px] text-slate-400 group-hover:text-slate-700 transition">클릭 시 전체 적용</span>
                                </div>
                                <div className="space-y-1.5 border-l-2 border-slate-900 pl-2.5">
                                  {bundle.map((text, idx) => (
                                    <div key={idx} className="text-xs font-semibold text-slate-800 leading-snug">
                                      {text}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* 하단 적용 버튼 */}
                              <div className="flex items-center justify-end pt-1 border-t border-black/5">
                                <button
                                  type="button"
                                  onClick={applyBundle}
                                  className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>통 부제목 세트 적용</span>
                                </button>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 부제목 입력 슬롯 리스트 (동아일보 스타일 좌측 검정색 바 적용 & 드래그앤드롭) */}
              <div className="space-y-2 border-l-[3.5px] border-slate-950 pl-3.5 my-1">
                {subtitles.map((sub, idx) => (
                  <div
                    key={sub.id || idx}
                    draggable={!sub.locked}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    className={`flex items-center gap-2 group/sub py-0.5 transition-all ${
                      sub.locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                    } ${draggedSubtitleIndex === idx ? "opacity-50" : ""}`}
                  >
                    {/* 드래그 핸들 (잠금 시 고정 인디케이터) */}
                    <div className="w-4 flex items-center justify-center flex-shrink-0 select-none">
                      {!sub.locked ? (
                        <GripVertical className="w-3.5 h-3.5 text-slate-300 group-hover/sub:text-slate-600 transition" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      )}
                    </div>

                    {/* 부제목 텍스트 입력창 */}
                    <input
                      type="text"
                      value={sub.text}
                      readOnly={sub.locked}
                      onChange={(e) => handleSubtitleChange(idx, e.target.value)}
                      placeholder={`부제목 ${idx + 1}`}
                      className={`flex-1 text-base md:text-lg font-bold border-b border-slate-200 pb-1 outline-none bg-transparent transition-colors ${
                        sub.locked ? "text-slate-400 font-bold" : "text-slate-800 font-bold focus:border-slate-800"
                      }`}
                    />

                    {/* 각 라인별 잠금 기능 버튼 */}
                    <button
                      type="button"
                      onClick={() => handleToggleSubtitleLock(idx)}
                      className={`w-6 h-6 rounded-md flex items-center justify-center transition cursor-pointer hover:bg-black/5 flex-shrink-0 ${
                        sub.locked ? "text-slate-400" : "text-slate-600"
                      }`}
                      title={sub.locked ? "잠금 해제 (위치 및 내용 수정 가능)" : "잠금 (위치 및 내용 고정)"}
                    >
                      {sub.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>

                    {/* 각 라인별 삭제 버튼 (최소 1개 이상 및 잠금 아닐 때) */}
                    {subtitles.length > 1 && !sub.locked ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveSubtitle(idx)}
                        className="w-6 h-6 flex items-center justify-center rounded transition cursor-pointer hover:bg-black/5 flex-shrink-0"
                        title="삭제"
                      >
                        <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700" />
                      </button>
                    ) : (
                      <div className="w-6 h-6 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 첨부된 사진 썸네일 스트립 (클릭 시 본문 삽입) */}
            {photos.length > 0 && (
              <div className="p-3 bg-slate-50/60 rounded-xl border border-black/[0.04] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-700 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                    첨부된 사진 ({photos.length}) · 클릭하여 본문에 바로 삽입:
                  </span>
                  <button
                    onClick={() => setShowPhotoModal(true)}
                    className="text-[#1D4E89] hover:underline font-bold text-[11px] cursor-pointer"
                  >
                    + 사진 추가
                  </button>
                </div>

                <div className="flex items-center gap-3 overflow-x-auto pb-1">
                  {photos.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleInsertPhotoToContent(p)}
                      className="flex items-center gap-2.5 p-2 bg-white rounded-lg border border-black/[0.06] hover:border-[#8ECAE6] transition cursor-pointer shadow-2xs group min-w-[200px]"
                      title="클릭 시 본문 커서 위치에 사진 태그가 삽입됩니다"
                    >
                      <img src={p.url} alt="thumb" className="w-12 h-10 object-cover rounded-md flex-shrink-0" />
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
                onRecheck={factCheck.recheck}
                focus={factCheck.focus}
                activeId={review && current ? current.id : null}
                recheckBusy={factCheck.recheckBusy}
              />
            </div>

          </div>
        )}

        {/* ──────────────────
            [B] 실시간 포털/신문 미리보기 캔버스 (viewMode가 'preview' 또는 'split'일 때 표시)
           ────────────────── */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div className={`bg-white/90 backdrop-blur-xs rounded-[16px] border border-black/[0.05] p-5 md:p-8 space-y-5 shadow-[0_4px_24px_rgba(0,0,0,0.03)] ${
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
            onClose={() => setIsFactCheckDrawerOpen(false)}
            article={article}
            setArticle={setArticle}
            factCheck={factCheck}
            onModels={onModels}
          />
        )}

        {/* ──────────────────────────────────────────
            [우측 세로형 Floating Sidebar]: 상단 가로 버튼들을 세로형 아이콘 사이드바로 재배치
            - 텍스트 제거, 직관적인 아이콘/이모지 중심
            - 호버 시 툴팁으로 기능명 제공
            - 기존 onClick / handler 100% 보존
           ────────────────────────────────────────── */}
        <aside className="sticky top-6 flex-shrink-0 z-30 select-none">
          <div className="bg-white/90 backdrop-blur-md border border-black/[0.06] rounded-2xl p-1.5 flex flex-col items-center gap-2 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            {/* 1. AI 기사 초안 생성 */}
            <button
              onClick={() => setShowDraftModal(true)}
              className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-black text-[#8ECAE6] flex items-center justify-center transition shadow-xs cursor-pointer active:scale-95 group relative"
              title="AI 기사 초안 생성"
            >
              <Wand2 className="w-4.5 h-4.5 text-[#8ECAE6]" />
              <span className="absolute right-12 bg-slate-900 text-white text-[11px] font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md z-40">
                AI 기사 초안 생성
              </span>
            </button>

            {/* 2. 취재자료 검색 */}
            <button
              onClick={onOpenSearch}
              className="w-10 h-10 rounded-xl bg-white/80 hover:bg-slate-100 text-slate-700 flex items-center justify-center transition cursor-pointer active:scale-95 group relative border border-black/5"
              title="취재자료 검색"
            >
              <Search className="w-4.5 h-4.5 text-slate-600" />
              <span className="absolute right-12 bg-slate-900 text-white text-[11px] font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md z-40">
                취재자료 검색
              </span>
            </button>

            {/* 3. 저장 이력 (기존 기능 100% 보존) */}
            <button
              onClick={() => setShowHistory(true)}
              disabled={!article.articleId}
              className="w-10 h-10 rounded-xl bg-white/80 hover:bg-slate-100 text-slate-700 flex items-center justify-center transition cursor-pointer active:scale-95 group relative border border-black/5 disabled:opacity-40 disabled:cursor-default"
              title={article.articleId ? "저장 이력" : "저장된 원고가 있어야 이력을 볼 수 있습니다"}
            >
              <History className="w-4.5 h-4.5 text-slate-600" />
              <span className="absolute right-12 bg-slate-900 text-white text-[11px] font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md z-40">
                저장 이력
              </span>
            </button>

            {/* 4. 기사 팩트체크 & 근거자료 */}
            <button
              onClick={() => {
                setIsFactCheckDrawerOpen(true);
                setReview(true);
                setReviewIdx(0);
              }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer active:scale-95 group relative border border-black/5 ${
                review || isFactCheckDrawerOpen
                  ? "bg-[#8ECAE6]/25 text-slate-900 border-[#8ECAE6]/50 shadow-xs"
                  : "bg-white/80 hover:bg-slate-100 text-slate-700"
              }`}
              title="기사 팩트체크 & 근거자료"
            >
              <ShieldCheck className={`w-4.5 h-4.5 ${review || isFactCheckDrawerOpen ? "text-[#1D4E89]" : "text-emerald-600"}`} />
              <span className="absolute right-12 bg-slate-900 text-white text-[11px] font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md z-40">
                기사 팩트체크 & 근거자료
              </span>
            </button>

            {/* 5. 사진·미디어 편집 */}
            <button
              onClick={() => setShowPhotoModal(true)}
              className="w-10 h-10 rounded-xl bg-white/80 hover:bg-slate-100 text-slate-700 flex items-center justify-center transition cursor-pointer active:scale-95 group relative border border-black/5"
              title={`사진·미디어 편집 (${photos.length})`}
            >
              <ImageIcon className="w-4.5 h-4.5 text-purple-600" />
              <span className="absolute right-12 bg-slate-900 text-white text-[11px] font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md z-40">
                사진·미디어 편집 ({photos.length})
              </span>
            </button>

            {/* 미니 구분선 */}
            <div className="w-5 h-[1px] bg-black/10 my-0.5" />

            {/* 6. 뷰 모드: 에디터 */}
            <button
              onClick={() => setViewMode("editor")}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer active:scale-95 group relative ${
                viewMode === "editor"
                  ? "bg-slate-900 text-[#8ECAE6] shadow-2xs"
                  : "bg-white/80 hover:bg-slate-100 text-slate-600 border border-black/5"
              }`}
              title="에디터 전용 보기"
            >
              <Edit3 className="w-4 h-4" />
              <span className="absolute right-12 bg-slate-900 text-white text-[11px] font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md z-40">
                에디터 전용 보기
              </span>
            </button>



            {/* 8. 뷰 모드: 미리보기 */}
            <button
              onClick={() => setViewMode("preview")}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer active:scale-95 group relative ${
                viewMode === "preview"
                  ? "bg-slate-900 text-[#8ECAE6] shadow-2xs"
                  : "bg-white/80 hover:bg-slate-100 text-slate-600 border border-black/5"
              }`}
              title="독자 화면 미리보기"
            >
              <Eye className="w-4 h-4" />
              <span className="absolute right-12 bg-slate-900 text-white text-[11px] font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md z-40">
                독자 화면 미리보기
              </span>
            </button>

            {/* 미니 구분선 */}
            <div className="w-5 h-[1px] bg-black/10 my-0.5" />

            {/* 9. CMS 최종 발행/이관 */}
            <button
              onClick={handleCmsExport}
              disabled={isCmsExporting}
              className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition shadow-sm cursor-pointer active:scale-95 group relative"
              title="CMS 최종 발행/이관"
            >
              {isCmsExporting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-white" />
              )}
              <span className="absolute right-12 bg-slate-900 text-white text-[11px] font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md z-40">
                CMS 최종 발행/이관
              </span>
            </button>
          </div>
        </aside>

      {/* 메인 flex 컨테이너 닫기 */}
      </div>

      {/* ──────────────────────────────────────────
          3. 사진·미디어 관리 및 본문 삽입 모달
         ────────────────────────────────────────── */}
      {showHistory && article.articleId && (
        <VersionHistory
          article={article}
          emptyArticle={createEmptyArticle()}
          onClose={() => setShowHistory(false)}
          onRestored={(restored) => {
            setArticle(restored);
            setShowHistory(false);
            setPhotoNotice("선택한 저장본으로 복원했습니다. 복원 직전 상태는 저장 이력에 남아 있습니다.");
          }}
        />
      )}

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

function HighlightedBody({ value, onChange, results, onRecheck, recheckBusy, focus = null, activeId = null }) {
  const layer = useRef(null);
  const [hover, setHover] = useState(null); // { key, x, y } — 하이라이트 위 마우스(textarea 가 위를 덮어 마크가 이벤트를 못 받으니 좌표로 찾는다)

  const ranges = useMemo(() => {
    const out = results
      .map((r) => (r.verdict === "SUPPORTED" && r.id === focus ? { ...r, verdict: "FOCUS", spans: supportedClaimRanges(r.claimText, r.details).map((s) => ({ ...s, start: s.start + r.start, end: s.end + r.start })) } : r))
      .filter((r) => MARK[r.verdict] && r.start >= 0 && value.slice(r.start, r.start + r.claimText.length) === r.claimText)
      .flatMap((r) => (r.spans.length ? r.spans : [{ start: r.start, end: r.start + r.claimText.length }])
        .map((x) => ({ ...x, verdict: r.verdict === "FOCUS" && x.detail ? "DETAIL" : r.verdict, key: r.judgedBy === "external" ? "" : r.key, rid: r.id })))
      .sort((a, b) => a.start - b.start);
    return out.filter((x, i) => i === 0 || x.start >= out[i - 1].end); // 겹치면 앞의 것만
  }, [results, value, focus]);

  const parts = [];
  let cursor = 0;
  ranges.forEach((x, i) => {
    parts.push(value.slice(cursor, x.start));
    parts.push(<mark key={i} data-key={x.key} className={`${MARK[x.verdict]} text-transparent rounded-sm`}
      style={(x.key && hover?.key === x.key) || (activeId && x.rid === activeId) ? { outline: `2px solid ${OUTLINE[x.verdict]}`, outlineOffset: 1 } : undefined} title={x.title || MARK_LABEL[x.verdict]}>{value.slice(x.start, x.end)}</mark>);
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
