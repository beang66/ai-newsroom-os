import React, { useState, useRef, useMemo } from "react";
import FactCheckDrawer from "./FactCheckDrawer";
import VersionHistory from "./VersionHistory";
import DongaPreview from "./DongaPreview.jsx";
// 사진: 기존 기사 작성 앱(v30)의 사진 넣기·편집·본문 사진 도구를 복원 (components/photo, lib/imageEditor.js)
import BodyWithPhotos from "./photo/BodyWithPhotos.jsx";
import ImageEditor from "./photo/ImageEditor.jsx";
import PhotoSearch from "./photo/PhotoSearch.jsx";
import PhotoCaption from "./photo/PhotoCaption.jsx";
import PhotoInsertMenu from "./photo/PhotoInsertMenu.jsx";
import { photoLine } from "../lib/photoMarks.js";
import { unsplashPhotoData, dongaPhotoData, trackPhotoDownload } from "../api/editorial";
import { createEmptyArticle } from "../data/article";
import { SECTIONS, subsOf } from "../data/sections.js";
import { supportedClaimRanges } from "../api/claim-details.js";
// 코어 편집 보조(제목·부제 추천, 사진 찾기, 자동 저장) — 로직은 EditorialAssist.jsx
import { useSuggestions, SuggestionList, SuggestButton, useFactCheck } from "./EditorialAssist";
import { 
  Sparkles, 
  Check, 
  Search, 
  History,
  Bold, 
  Italic, 
  Quote, 
  AlertTriangle,
  Eye,
  Edit3,
  Send,
  ShieldCheck,
  Save
} from "lucide-react";

export default function ArticleWriter({ 
  article, 
  setArticle, 
  onOpenSearch, 
  onModels,
  saveStatus, // 저장 상태 문구 — 저장은 App 에서(어느 화면에 있든 동작)
  onSave, // 수동 저장(저장 버튼·Ctrl+S) → 저장 이력·보관소 '원고' 갱신
  unsaved = false,
  onRestoredSaved,
  onPublish, // 송고 = 수동 저장 + 송고본 갱신(기사당 하나) → 결과
  published = null, // 이 기사의 송고본 정보(없으면 아직 송고 전)
  saveTimes = null, // { firstSavedAt, lastSavedAt } — 송고 전 미리보기의 입력·업데이트
}) {
  // 1. 화면 뷰 모드: 'editor' (기사 작성) | 'preview' (같은 카드 안에서 동아일보 미리보기)
  const [viewMode, setViewMode] = useState("editor");

  // 팩트체크 & 근거자료 우측 슬라이더(Drawer) 열림 상태
  const [isFactCheckDrawerOpen, setIsFactCheckDrawerOpen] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches);
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


  // 3. 사진/미디어 관리 상태
  const photos = article.photos || [];
  const [photoNotice, setPhotoNotice] = useState("");
  const [editing, setEditing] = useState(null); // { photo, line } — line 이 null 이면 새 사진(본문 맨 위)
  const [searching, setSearching] = useState(null); // { line, keep } — 교체면 line·이전 설명
  const [captioning, setCaptioning] = useState(null); // 설명 넣기 대상 사진

  // 4. CMS 발행 이관 상태
  const [isCmsExporting, setIsCmsExporting] = useState(false);
  const [isCmsSuccessModal, setIsCmsSuccessModal] = useState(null); // 발행 결과 { published, republished }
  // 보관소 '수정'으로 연 기사 안내 — "saved"(작성 중) | "published"(발행본)
  const [openNote, setOpenNoteState] = useState(article.openedFrom || "");
  const setOpenNote = (v) => { setOpenNoteState(v); if (!v) setArticle((prev) => ({ ...prev, openedFrom: undefined })); };

  // 에디터 서식 및 제목 관련 상태
  const [selectedText, setSelectedText] = useState("");
  const [floatingToolbarPos, setFloatingToolbarPos] = useState(null);

  const editorRef = useRef(null);

  const headlineSuggest = useSuggestions("headline", article); // 결과는 article.titleCandidates 에도 저장
  const subtitleSuggest = useSuggestions("subtitle", article); // 결과는 article.subtitleCandidates 에도 저장

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

  // AI 추천 결과는 원고(article)에 함께 남긴다 — 고르기 전에는 다른 탭에 다녀와도 그대로 보이고, 하나를 고르면 닫힌다
  const requestCandidates = (suggest, key) =>
    suggest.request().then((values) => values && setArticle((prev) => ({ ...prev, [key]: values })));
  const shownCandidates = (suggest, saved) =>
    suggest.busy || suggest.error || suggest.data ? suggest : { ...suggest, data: saved || null };

  const applyFormat = (formatType) => {
    if (!selectedText) return;
    alert(`선택한 문장 "${selectedText.slice(0, 15)}..." 에 [${formatType}] 서식을 적용했습니다.`);
    setFloatingToolbarPos(null);
  };

  // ── 사진(v30 흐름) ──
  // 새 사진은 본문 맨 위에, 편집·교체는 원래 자리(line)에. 사진 데이터는 article.photos, 본문에는 [사진:id] 한 줄
  const putPhoto = (photo, line) => setArticle((prev) => {
    const photos = [...(prev.photos || []).filter((x) => x.id !== photo.id), photo];
    if (line === null || line === undefined)
      return { ...prev, photos, content: prev.content ? `${photoLine(photo.id)}\n${prev.content}` : photoLine(photo.id) };
    const lines = (prev.content || "").split("\n");
    if (line < lines.length) lines[line] = photoLine(photo.id);
    return { ...prev, photos, content: lines.join("\n") };
  });
  const removePhotoLine = (line) => setArticle((prev) => {
    const lines = (prev.content || "").split("\n");
    lines.splice(line, 1);
    return { ...prev, content: lines.join("\n") };
  });
  const readFile = (file) => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => no(r.error);
    r.readAsDataURL(file);
  });
  // 사진 첨부하기: 내 파일 → 편집 화면 → 본문에 넣기
  const choosePhotoFile = (target = null) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 20 * 1024 * 1024)
        return setPhotoNotice("20MB 이하 JPG·PNG·WebP 사진을 선택해 주세요.");
      try {
        const data = await readFile(file);
        setEditing({
          photo: { id: `photo-${crypto.randomUUID()}`, url: data, original: data, caption: target?.keep?.caption || "", source: target?.keep?.source || "", alt: file.name },
          line: target?.line ?? null,
        });
      } catch {
        setPhotoNotice("사진 파일을 읽지 못했습니다. 다시 선택해 주세요.");
      }
    };
    input.click();
  };
  // 사진 검색하기의 '본문에 넣기 / 편집해서 넣기 / 다운로드'
  const chooseSearchPhoto = async (p, action) => {
    const donga = p.provider === "donga"; // 동아일보 DB(포토파노라마) 사진
    try {
      const data = donga ? await dongaPhotoData(p) : await unsplashPhotoData(p);
      if (action === "download") {
        const a = document.createElement("a");
        a.href = data;
        a.download = `${donga ? "donga" : "unsplash"}-${p.id}.${data.startsWith("data:image/png") ? "png" : data.startsWith("data:image/webp") ? "webp" : "jpg"}`;
        a.click();
        return;
      }
      const photo = donga ? {
        id: `photo-${crypto.randomUUID()}`, url: data, original: data,
        caption: searching?.keep?.caption || p.title || "",
        source: "동아일보 DB", provider: "동아일보 DB",
        sourceUrl: "https://www.donga.com/archive/newslibrary/list?m=photo",
        dongaArchiveId: p.id, alt: p.title || "",
      } : {
        id: `photo-${crypto.randomUUID()}`, url: data, original: data,
        caption: searching?.keep?.caption || "",
        source: `${p.user?.name || "Unsplash"} / Unsplash`, provider: "Unsplash",
        sourceUrl: p.links?.html ? `${p.links.html}?utm_source=article_workspace&utm_medium=referral` : "",
        unsplashId: p.id, alt: p.alt_description || "",
      };
      const line = searching?.line ?? null;
      setSearching(null);
      if (action === "insert") putPhoto(photo, line);
      else setEditing({ photo, line });
    } catch (e) {
      setPhotoNotice(e.message || "사진을 가져오지 못했어요.");
    }
  };
  const replacePhoto = (line, photo, how) => {
    const target = { line, keep: { caption: photo.caption, source: photo.source } };
    if (how === "search") setSearching(target);
    else choosePhotoFile(target);
  };

  // 송고(10-12 이름 변경, 예전 "CMS 최종 발행/이관"): 수동 저장 + 보관소 송고본 갱신(기사당 하나 — 다시 발행하면 덮어쓰고 수정 시각 갱신)
  const handleCmsExport = async () => {
    if (!onPublish || isCmsExporting) return;
    if (published && !window.confirm("이미 송고한 기사입니다.\n지금 내용으로 송고본을 덮어쓸까요? (수정 시각이 바뀝니다)")) return;
    setIsCmsExporting(true);
    try {
      setIsCmsSuccessModal(await onPublish());
      setOpenNote("");
    } catch (e) {
      alert("송고하지 못했습니다: " + (e?.message || e));
    } finally {
      setIsCmsExporting(false);
    }
  };

  return (
    <div className="w-full space-y-5 animate-float-in">
      {openNote && (
        <div role="status" data-testid="opened-note" className="flex items-start gap-3 px-4 py-2.5 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900">
          <span className="flex-1 leading-relaxed">
            {openNote === "published"
              ? <>보관소의 <b>송고본</b>을 열었습니다{published?.publishedAt ? ` (송고 ${whenText(published.publishedAt)})` : ""}. 고친 뒤 <b>송고</b>를 누르면 송고본이 바뀝니다. 그 전까지 송고본은 그대로입니다.</>
              : <>보관소의 <b>원고</b>(마지막 저장본)를 열었습니다. 고친 뒤 <b>저장</b>하면 보관소가 갱신됩니다.</>}
          </span>
          <button type="button" onClick={() => setOpenNote("")} className="font-bold text-sky-700 hover:text-sky-950 cursor-pointer" aria-label="안내 닫기">닫기</button>
        </div>
      )}
      {photoNotice && <p role="status" className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{photoNotice}</p>}

      {/* ──────────────────────────────────────────
          1. 최상단 통합 컨트롤 툴바
          (AI 초안, 자료검색, 팩트체크, 뷰 모드 전환, 미디어 관리, CMS 발행)
         ────────────────────────────────────────── */}
      <div className="bg-white/95 rounded-3xl border border-slate-200/90 p-4 md:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        
        {/* 좌측: 기사 작성 도구들 */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={onOpenSearch}
            className="px-4.5 py-2.5 bg-[#EFECE6] hover:bg-[#E3DDD4] text-[#23211F] border border-[#DDD6CB] rounded-full text-xs md:text-sm font-bold transition cursor-pointer flex items-center gap-2 active:scale-95"
          >
            <Search className="w-4 h-4 text-[#57514A]" />
            <span>취재자료 검색</span>
          </button>

          <button
            onClick={() => onSave?.()}
            data-testid="manual-save"
            title="저장하면 저장 이력에 남고 보관소의 '원고'가 이 내용으로 바뀝니다 (Ctrl+S)"
            className={`px-4.5 py-2.5 rounded-full text-xs md:text-sm font-bold transition cursor-pointer flex items-center gap-2 active:scale-95 border ${
              unsaved ? "bg-[#23211F] hover:bg-[#38332E] text-[#FAF8F5] border-[#23211F]" : "bg-[#EFECE6] hover:bg-[#E3DDD4] text-[#23211F] border-[#DDD6CB]"}`}
          >
            <Save className="w-4 h-4" />
            <span>저장</span>
          </button>

          <button
            onClick={() => setShowHistory(true)}
            disabled={!article.articleId}
            title={article.articleId ? "저장된 이전 버전을 보고 복원합니다" : "저장된 원고가 있어야 이력을 볼 수 있습니다"}
            className="px-4.5 py-2.5 bg-[#EFECE6] hover:bg-[#E3DDD4] text-[#23211F] border border-[#DDD6CB] rounded-full text-xs md:text-sm font-bold transition cursor-pointer flex items-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-default"
          >
            <History className="w-4 h-4 text-[#57514A]" />
            <span>저장 이력</span>
          </button>

          <button
            onClick={() => {
              setIsFactCheckDrawerOpen(true);
              setReview(true);
              setReviewIdx(0);
            }}
            className={`px-4.5 py-2.5 rounded-full text-xs md:text-sm font-bold transition cursor-pointer flex items-center gap-2 active:scale-95 ${
              review || isFactCheckDrawerOpen
                ? "bg-[#23211F] text-[#FAF8F5] border border-[#23211F] shadow-xs"
                : "bg-[#EFECE6] hover:bg-[#E3DDD4] text-[#23211F] border border-[#DDD6CB]"
            }`}
            title="취재파일 업로드 및 원문 근거자료 검증 패널을 엽니다"
          >
            <ShieldCheck className={`w-4 h-4 ${review || isFactCheckDrawerOpen ? "text-emerald-400" : "text-emerald-600"}`} />
            <span>기사 팩트체크 & 근거자료</span>
          </button>

          <PhotoInsertMenu
            onSearch={() => setSearching({ line: null })}
            onUpload={() => choosePhotoFile(null)}
            className="px-4.5 py-2.5 bg-[#EFECE6] hover:bg-[#E3DDD4] text-[#23211F] border border-[#DDD6CB] rounded-full text-xs md:text-sm font-bold transition cursor-pointer flex items-center gap-2 active:scale-95"
          />
        </div>

        {/* 우측: 뷰 모드 전환 및 [CMS 최종 발행] 버튼 */}
        <div className="flex items-center gap-3 flex-wrap">
          {saveStatus && <span className="text-[11px] font-bold text-slate-500" data-testid="save-status">{saveStatus}</span>}
          {(factCheck.busy || factCheck.results.length > 0) && (
            <span className={`text-[11px] font-bold ${factIssues ? "text-rose-600" : "text-emerald-600"}`} data-testid="factcheck-status">
              {factCheck.busy ? "팩트체크 중…" : factIssues ? `확인 필요 ${factIssues}문장` : "팩트체크 통과"}
            </span>
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
            data-testid="cms-publish"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs md:text-sm rounded-full transition shadow-sm cursor-pointer flex items-center gap-2 active:scale-95"
            title={published ? "지금 내용으로 송고본을 갱신합니다(수정 시각 변경). 출고는 동아일보 CMS 에서 합니다" : "지금 내용을 저장하고 송고합니다. 출고는 동아일보 CMS 에서 합니다"}
          >
            {isCmsExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>송고 중...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 text-white" />
                <span>송고</span>
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
          2. 메인 작업 영역: [에디터] / [미리보기]
         ────────────────────────────────────────── */}
      <div className={`grid gap-6 items-start ${
        "grid-cols-1"
      }`}>

        {/* ──────────────────
            [A] 기사 작성 캔버스 — 에디터, 또는 '미리보기'일 때 같은 카드 안의 동아일보 미리보기
            - 단독 에디터 모드일 때 실제 기사/문서 작성 CMS 스타일로 가운데 집중 배치(max-w-4xl mx-auto)
           ────────────────── */}
        {(viewMode === "editor" || viewMode === "preview") && (
          <div className={`bg-white/95 rounded-3xl border border-slate-200/90 p-6 md:p-10 space-y-6 shadow-sm relative min-h-[640px] ${
            !isFactCheckDrawerOpen ? "w-full max-w-4xl mx-auto" : "w-full"
          }`}>
            {/* '미리보기'를 누르면 같은 카드 안(제목·부제·본문 자리)이 동아일보 기사 미리보기로 바뀐다 (DongaPreview.jsx) */}
            {viewMode === "preview" ? (
              <DongaPreview article={article} photos={photos} published={published} saveTimes={saveTimes} />
            ) : (
            <>
            
            {/* 기사 분류 — donga.com 섹션·세부 섹션(미리보기 맨 위 분류에 그대로 쓰인다) */}
            <div className="flex flex-wrap items-center gap-2" data-testid="article-section">
              <label htmlFor="article-category" className="text-xs text-slate-400 font-semibold mr-1">기사 분류</label>
              <select id="article-category" aria-label="기사 분류" value={article.category || ""}
                onChange={(e) => setArticle((prev) => ({ ...prev, category: e.target.value, subcategory: "" }))}
                className={`text-sm font-bold rounded-full border px-3 py-1.5 bg-white cursor-pointer outline-none focus:border-slate-800 ${article.category ? "border-slate-300 text-slate-900" : "border-amber-300 text-amber-800"}`}>
                <option value="">분류 선택</option>
                {SECTIONS.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              {article.category && subsOf(article.category).length > 0 && (
                <select aria-label="세부 분류" value={article.subcategory || ""}
                  onChange={(e) => setArticle((prev) => ({ ...prev, subcategory: e.target.value }))}
                  className="text-sm rounded-full border border-slate-300 px-3 py-1.5 bg-white cursor-pointer outline-none focus:border-slate-800">
                  <option value="">세부 분류(선택)</option>
                  {subsOf(article.category).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </div>

            {/* 기사 제목 영역 — 부제와 같은 'AI 추천' 방식 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400 font-semibold">기사 제목</label>
                <SuggestButton onClick={() => requestCandidates(headlineSuggest, "titleCandidates")} busy={headlineSuggest.busy} title="본문에 맞는 제목을 추천받습니다" />
              </div>
              <input
                type="text"
                value={article.title}
                onChange={(e) => { const title = e.target.value; setArticle((prev) => ({ ...prev, title })); }}
                placeholder="기사 제목을 입력하거나 AI 추천을 확인하세요"
                className="w-full text-xl md:text-2xl font-black text-slate-900 border-b border-slate-200 pb-3 outline-none focus:border-slate-800 transition-colors bg-transparent"
              />
              <SuggestionList
                state={shownCandidates(headlineSuggest, article.titleCandidates)}
                label="제목"
                onPick={(value) => {
                  // 후보를 고르면 목록을 닫는다(다시 보려면 'AI 추천')
                  setArticle((prev) => ({ ...prev, title: value, suggestedTitle: value, titleCandidates: null }));
                  headlineSuggest.clear();
                }}
              />
            </div>

            {/* 부제 영역 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400 font-semibold">부제 (부제목)</label>
                <SuggestButton onClick={() => requestCandidates(subtitleSuggest, "subtitleCandidates")} busy={subtitleSuggest.busy} title="본문과 제목에 맞는 부제를 추천받습니다" />
              </div>
              {/* 동아일보 부제는 2~4줄 — 줄마다 Enter 로 나눈다 */}
              <textarea
                value={article.subtitle}
                onChange={(e) => { const subtitle = e.target.value; setArticle((prev) => ({ ...prev, subtitle })); }}
                placeholder={"기사 부제를 입력하세요 (줄마다 Enter)"}
                rows={Math.min(4, Math.max(2, (article.subtitle || "").split("\n").length))}
                className="w-full resize-none text-sm md:text-base font-bold text-slate-700 border-b border-slate-200 pb-2 outline-none focus:border-slate-800 bg-transparent transition-colors leading-relaxed"
              />
              <SuggestionList
                state={shownCandidates(subtitleSuggest, article.subtitleCandidates)}
                label="부제"
                onPick={(value) => {
                  setArticle((prev) => ({ ...prev, subtitle: value, subtitleCandidates: null }));
                  subtitleSuggest.clear();
                }}
              />
            </div>

            {/* 본문 텍스트 에디터 */}
            <div className="relative pt-1" ref={editorRef} onMouseUp={handleSelection}>
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-2">
                <span>본문 작성 영역 (자유 작성 및 서식 적용)</span>
                <span className="flex items-center gap-2">
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

              <BodyWithPhotos
                content={article.content}
                photos={photos}
                onChange={(content) => setArticle((prev) => ({ ...prev, content }))}
                onEdit={(line, photo) => setEditing({ photo, line })}
                onReplace={replacePhoto}
                onCaption={(line, photo) => setCaptioning(photo)}
                onDelete={removePhotoLine}
                renderText={({ value, onChange, offset, tall, placeholder }) => (
                  // 팩트체크 결과의 위치(원고 전체 기준)를 이 글 블록 기준으로 옮긴다
                  <HighlightedBody
                    value={value}
                    onChange={onChange}
                    tall={tall}
                    bare
                    placeholder={placeholder}
                    results={factCheck.results
                      .filter((r) => r.start >= offset && r.start <= offset + value.length)
                      .map((r) => ({ ...r, start: r.start - offset, spans: (r.spans || []).map((s) => ({ ...s, start: s.start - offset, end: s.end - offset })) }))}
                    onRecheck={factCheck.recheck}
                    focus={factCheck.focus}
                    activeId={review && current ? current.id : null}
                    recheckBusy={factCheck.recheckBusy}
                  />
                )}
              />
            </div>
            </>
            )}

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

      {/* 메인 flex 컨테이너 닫기 */}
      </div>

      {/* ──────────────────────────────────────────
          3. 저장 이력
         ────────────────────────────────────────── */}
      {showHistory && article.articleId && (
        <VersionHistory
          article={article}
          emptyArticle={createEmptyArticle()}
          onClose={() => setShowHistory(false)}
          beforeRestore={unsaved ? onSave : undefined}
          onRestored={(restored) => {
            setArticle(restored);
            onRestoredSaved?.(restored); // 복원본은 수동 저장으로 남는다
            setShowHistory(false);
            setPhotoNotice("선택한 저장본으로 복원했습니다. 복원 직전 상태는 저장 이력에 남아 있습니다.");
          }}
        />
      )}

      {/* 사진 검색하기 / 사진 편집 / 설명 넣기 (v30 흐름) */}
      {searching && (
        <PhotoSearch body={article.content} onClose={() => setSearching(null)} onChoose={chooseSearchPhoto} />
      )}
      {editing && (
        <ImageEditor
          key={editing.photo.id}
          photo={editing.photo}
          onCancel={() => setEditing(null)}
          onApply={(photo) => { putPhoto(photo, editing.line); setEditing(null); }}
          onTrackDownload={trackPhotoDownload}
          onError={setPhotoNotice}
        />
      )}
      {captioning && (
        <PhotoCaption
          photo={captioning}
          onClose={() => setCaptioning(null)}
          onSave={(caption, source) => {
            setArticle((prev) => ({ ...prev, photos: (prev.photos || []).map((x) => (x.id === captioning.id ? { ...x, caption, source } : x)) }));
            setCaptioning(null);
          }}
        />
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
            <h3 className="text-lg font-black text-slate-950" data-testid="publish-result">
              {isCmsSuccessModal.republished ? "송고본을 갱신했습니다" : "송고했습니다"}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              {isCmsSuccessModal.republished
                ? "송고본을 지금 내용으로 덮어썼습니다. 송고본은 기사마다 하나만 남습니다."
                : "지금 내용을 저장하고 송고했습니다. 보관소 '송고'에서 볼 수 있습니다."}
            </p>
            {isCmsSuccessModal.published && (
              <p className="text-[11px] text-slate-500">
                수정 시각 {whenText(isCmsSuccessModal.published.publishedAt)}
                {isCmsSuccessModal.republished && ` · 처음 송고 ${whenText(isCmsSuccessModal.published.firstPublishedAt)} · ${isCmsSuccessModal.published.publishCount}번째 송고`}
              </p>
            )}
            {isCmsSuccessModal.receipt?.id && <p className="text-[11px] text-slate-500">CMS 접수 ID: {isCmsSuccessModal.receipt.id}</p>}
            <p className="text-[10px] text-slate-400">출고는 동아일보 CMS 에서 따로 진행합니다.</p>
            <button
              onClick={() => setIsCmsSuccessModal(null)}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer transition"
            >
              확인
            </button>
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

function HighlightedBody({ value, onChange, results, onRecheck, recheckBusy, focus = null, activeId = null, tall = true, placeholder, bare = false }) {
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
  // 사진이 든 본문(bare)은 바깥 본문 상자 하나가 테두리·여백을 맡고, 글 블록은 테두리 없이 그 안에 들어간다.
  // 사진 사이의 글 블록은 낮게(글이 하나뿐이면 예전처럼 넓게)
  const height = tall ? (bare ? "min-h-[420px]" : "min-h-[460px]") : "min-h-[1.75rem]";
  const box = `w-full ${height} text-xs md:text-sm leading-relaxed font-sans whitespace-pre-wrap break-words ${bare ? "p-0 border-0" : "p-5 rounded-2xl border"}`;
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
    <div className={bare ? "relative" : "relative bg-slate-50/70 rounded-2xl focus-within:bg-white transition-all"}>
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
        placeholder={placeholder ?? "기사 본문을 입력하세요. 자유롭게 문단을 작성할 수 있습니다..."}
        className={`${box} absolute inset-0 h-full overflow-hidden text-slate-900 bg-transparent outline-none resize-none ${bare ? "" : "border-slate-200 focus:border-slate-800 shadow-2xs"} ${hover ? "cursor-pointer" : ""}`}
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

// 코어 시각(ISO) → "10.12 14:32"
function whenText(iso) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
