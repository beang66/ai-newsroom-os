import React, { useState, useRef, useEffect, useMemo } from "react";
import FactCheckDrawer from "./FactCheckDrawer";
import { useFactCheck } from "./EditorialAssist";
import { toStudioArticle, plainContent } from "../lib/studioArticle.js";
import { paint, clearPaint, hitTest } from "../lib/factHighlights.js";
import { suggestHeadlines, suggestSubtitles } from "../services/assistService";
import FlowSummaryButton from "./FlowSummaryButton";
import { textWithoutPhotos } from "../lib/photoMarks.js";
import PhotoSideDrawer from "./PhotoSideDrawer";
import PhotoEditorView from "./PhotoEditorView";
import SourceSearch from "./SourceSearch";
import ArticleCheckModal, { FACT_CATEGORY_EVENT } from "./ArticleCheckModal";
import VersionHistoryModal from "./VersionHistoryModal";
import DongaPreview from "./DongaPreview.jsx";
import { SECTIONS } from "../data/sections.js";
import { trackPhotoDownload } from "../api/editorial";
import "./articleWriterFont.css";
import {
  Sparkles,
  Search,
  Check,
  CheckCircle2,
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
  Share2,
  Bookmark,
  ShieldCheck,
  Bot,
  Lock,
  Unlock,
  Plus,
  X,
  GripVertical,
  Copy,
  Printer,
  ImagePlus,
  Underline,
  Type,
  CircleDot,
  ArrowLeft,
  MessageSquare,
  Heart,
  Volume2,
  History
} from "lucide-react";

export default function ArticleWriter({
  locationRequest,
  article,
  setArticle,
  onOpenSearch,
  onRunFactCheck,
  factCheckRequest = 0,
  onPublish,
  onModels,
  isSidebarCollapsed = true,
  onConnectSource,
  isReaderPreview,
  setIsReaderPreview,
  isPhotoEditing,
  setIsPhotoEditing
}) {
  // 1. 화면 뷰 모드: 'editor' (에디터만) | 'split' (에디터+미리보기 나란히) | 'preview' (미리보기 전체)
  const [viewMode, setViewMode] = useState("editor");

  // isReaderPreview 변경 시 동기화
  useEffect(() => {
    if (isReaderPreview !== undefined) {
      setViewMode(isReaderPreview ? "preview" : "editor");
    }
  }, [isReaderPreview]);

  const handleTogglePreview = () => {
    const nextMode = viewMode === "preview" ? "editor" : "preview";
    setViewMode(nextMode);
    if (setIsReaderPreview) {
      setIsReaderPreview(nextMode === "preview");
    }
  };

  // 우측 확장 사이드 박스 상태: null (닫힘) | 'photo' (사진 첨부) | 'search' (취재자료) | 'factcheck' (팩트체크)
  const [activeSidePanel, setActiveSidePanel] = useState(null);
  const isSidePanelOpen = Boolean(activeSidePanel);

  // 팩트체크 사전 기사 검증률 모달 열림 상태
  const [showCheckModal, setShowCheckModal] = useState(false);

  // 저장 이력 및 복원 모달 열림 상태
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // 팩트체크 패널과 에디터 간 분할 비율 (기본 1:1 = 50%)
  const [factCheckSplitRatio, setFactCheckSplitRatio] = useState(50);
  const isResizingFactCheck = useRef(false);
  const mainLayoutRef = useRef(null);

  const handleSplitMouseDown = (e) => {
    e.preventDefault();
    isResizingFactCheck.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent) => {
      if (!isResizingFactCheck.current || !mainLayoutRef.current) return;
      const rect = mainLayoutRef.current.getBoundingClientRect();
      const availableWidth = rect.width - 110;
      if (availableWidth <= 0) return;
      const relativeX = moveEvent.clientX - rect.left;
      const newRatio = (relativeX / availableWidth) * 100;
      setFactCheckSplitRatio(Math.min(70, Math.max(30, newRatio)));
    };

    const onMouseUp = () => {
      isResizingFactCheck.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // 팩트체크(main 흐름): 취재자료를 기사에 등록하면, 글이 멈출 때마다 문장별로 자동 검증한다.
  // main 엔진은 content 를 일반 텍스트로 보므로 어댑터를 거친다(내 에디터 HTML 은 그대로).
  const studioArticle = useMemo(() => toStudioArticle(article), [article]);
  const factCheck = useFactCheck(studioArticle);
  const FACT_LABEL = { CONFLICT: "자료와 불일치", EVIDENCE_GAP: "근거 부족" };
  // 본문 강조·호버 팝업이 쓰는 문제 문장 목록(일치한 문장은 제외)
  const factCheckIssues = useMemo(() => factCheck.results
    .filter((item) => item.verdict !== "SUPPORTED")
    .sort((a, b) => a.start - b.start)
    .map((item) => ({
      id: item.id,
      key: item.key,
      verdict: item.verdict,
      targetText: item.claimText,
      claimText: item.claimText,
      type: FACT_LABEL[item.verdict] || "검토 필요",
      reason: item.comment || "",
      comment: item.comment || "",
      quote: item.quote || "",
      sourceDoc: item.sourceDoc || "",
      suggestion: "", // Core 는 고쳐 쓴 문안을 만들지 않는다 — 판정과 근거만 제공한다
      evidenceText: item.quote,
      evidenceTitle: item.sourceDoc,
      needsRecheck: item.needsRecheck,
    })), [factCheck.results]); // eslint-disable-line react-hooks/exhaustive-deps

  // 순서형 검사(main): 버튼을 누르면 켜지고, 문제 문장을 한 건씩 넘겨 본다. 문장이 고쳐져 줄어들면 순서를 맞춘다.
  const [review, setReview] = useState(false);
  const [reviewIdx, setReviewIdx] = useState(0);
  const reviewAt = Math.min(reviewIdx, Math.max(0, factCheckIssues.length - 1));
  const currentIssue = factCheckIssues[reviewAt];
  const MARK_LABEL = { CONFLICT: "자료와 불일치", EVIDENCE_GAP: "근거 부족", REVIEW: "검토 필요", EXTERNAL_REQUIRED: "검토 필요" };
  const factIssueCount = factCheckIssues.length;

  // 분류별 모아보기(UI): 검증률의 분류 버튼(팩트 일치·자료와 불일치·근거 부족·검토 필요)을 누르면 본문 텍스트 위 박스에 그 분류의 문장을 보여 준다
  const FACT_GROUP_TITLE = { SUPPORTED: "팩트 일치", CONFLICT: "자료와 불일치", EVIDENCE_GAP: "근거 부족", REVIEW: "검토 필요" };
  const FACT_GROUP_TONE = {
    SUPPORTED: "border-emerald-200 bg-emerald-50/70 text-emerald-800",
    CONFLICT: "border-rose-200 bg-rose-50/70 text-rose-800",
    EVIDENCE_GAP: "border-amber-200 bg-amber-50/70 text-amber-900",
    REVIEW: "border-violet-200 bg-violet-50/70 text-violet-800",
  };
  const factGroupOf = (verdict) => (["SUPPORTED", "CONFLICT", "EVIDENCE_GAP"].includes(verdict) ? verdict : "REVIEW");
  const [categoryFilter, setCategoryFilter] = useState(null);
  const collectedItems = categoryFilter ? factCheck.results.filter((item) => factGroupOf(item.verdict) === categoryFilter) : [];
  useEffect(() => {
    const onCategory = (event) => setCategoryFilter((current) => (current === event.detail ? null : event.detail));
    window.addEventListener(FACT_CATEGORY_EVENT, onCategory);
    return () => window.removeEventListener(FACT_CATEGORY_EVENT, onCategory);
  }, []);
  const factCheckSummary = useMemo(() => (factCheck.results.length
    ? { total: factCheck.results.length, counts: factCheck.results.reduce((acc, item) => ({ ...acc, [item.verdict]: (acc[item.verdict] || 0) + 1 }), {}) }
    : null), [factCheck.results]);
  const handleRecheck = (issueId) => {
    const issue = factCheckIssues.find((item) => item.id === issueId);
    if (issue) void factCheck.recheck(issue.key);
  };
  // 사이드 패널·검증률 패널의 "전체 검증"은 main 의 '전체 다시 검증'(고정본 기준)을 실행한다
  const startFullCheck = () => {
    if (onRunFactCheck) onRunFactCheck();
    void factCheck.run(true);
  };

  useEffect(() => {
    if (factCheckRequest) {
      setActiveSidePanel("factcheck");
      setShowFactMarks(true);
    }
  }, [factCheckRequest]);

  // 기사 카테고리 상태 및 팝오버 관리
  // 기사 분류: donga.com 섹션(main 의 data/sections.js) — 세부 분류는 선택 사항
  const CATEGORIES = SECTIONS.map((section) => section.name);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const categoryMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target)) {
        setIsCategoryOpen(false);
      }
    };
    if (isCategoryOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isCategoryOpen]);

  // 2. 미리보기 플랫폼 탭: 'donga' (동아일보 공식 웹) | 'naver' (네이버 뉴스 포털)
  const [previewPlatform, setPreviewPlatform] = useState("donga");

  // 3. 사진/미디어 관리 상태
  const [photos, setPhotos] = useState(article.photos || [
    {
      id: "photo-1",
      url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80",
      caption: "국내 연구진이 개발한 차세대 AI 반도체 NPU 웨이퍼 시제품",
      source: "동아일보 DB",
      provider: "김동아 기자",
      ratio: "16:9 (동아일보 대표)"
    }
  ]);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [newCaption, setNewCaption] = useState("");
  const [newSource, setNewSource] = useState("동아일보 DB");
  const [newProvider, setNewProvider] = useState("김동아 기자");
  const [newRatio, setNewRatio] = useState("16:9");

  // 이미지 편집 모달 상태
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [pendingPhoto, setPendingPhoto] = useState(null); // 사진 편집 화면의 "본문에 넣기" — 작성 화면이 다시 열리면 본문에 반영한다

  // 4. CMS 발행 이관 상태
  const [isCmsExporting, setIsCmsExporting] = useState(false);
  const [isCmsSuccessModal, setIsCmsSuccessModal] = useState(false);

  // 에디터 서식 및 제목 관련 상태
  const [isTitleHovered, setIsTitleHovered] = useState(false);
  const [isTitleConfirmed, setIsTitleConfirmed] = useState(false);
  const [isTitleLocked, setIsTitleLocked] = useState(false);
  const [showTitleAiMenu, setShowTitleAiMenu] = useState(false);
  // 제목 후보는 Core(/api/assist)가 본문을 읽고 만든다. status: idle | loading | done | error
  const [titleSuggest, setTitleSuggest] = useState({ status: "idle", data: [], error: "" });
  const loadTitleSuggestions = async () => {
    setTitleSuggest({ status: "loading", data: [], error: "" });
    try {
      setTitleSuggest({ status: "done", data: await suggestHeadlines(article.content, article.title), error: "" });
    } catch (error) {
      setTitleSuggest({ status: "error", data: [], error: error.message });
    }
  };
  const toggleTitleAiMenu = () => {
    const open = !showTitleAiMenu;
    setShowTitleAiMenu(open);
    if (open) void loadTitleSuggestions();
  };

  // 부제목 잠금, 다중 슬롯 및 AI 추천 상태
  const [showSubtitleAiMenu, setShowSubtitleAiMenu] = useState(false);
  const [subtitles, setSubtitles] = useState(() => [
    { id: "sub-1", text: "국내 주요 반도체 기업, NPU 및 PIM 기술로 글로벌 시장에 도전장", locked: false },
    { id: "sub-2", text: "전력 소비 70% 절감·데이터 병목 해소 기술 개발 집중", locked: false }
  ]);
  const [draggedSubtitleIndex, setDraggedSubtitleIndex] = useState(null);

  // 저장소에서 기사를 불러오면(articleId 변경) 그 기사의 부제로 칸을 다시 채운다.
  useEffect(() => {
    if (!article.articleId) return;
    const lines = (article.subtitle || "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 4);
    setSubtitles((lines.length ? lines : [""]).map((text, i) => ({ id: `sub-${i}-${Date.now()}`, text, locked: false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.articleId]);
  const [selectedAiSubtitles, setSelectedAiSubtitles] = useState([
    "국내 주요 반도체 기업, NPU 및 PIM 기술로 글로벌 시장에 도전장",
    "전력 소비 70% 절감·데이터 병목 해소 기술 개발 집중"
  ]);

  const [subtitleSuggest, setSubtitleSuggest] = useState({ status: "idle", data: [], error: "" });
  const loadSubtitleSuggestions = async () => {
    setSubtitleSuggest({ status: "loading", data: [], error: "" });
    try {
      setSubtitleSuggest({ status: "done", data: await suggestSubtitles(article.content, article.title), error: "" });
    } catch (error) {
      setSubtitleSuggest({ status: "error", data: [], error: error.message });
    }
  };
  const toggleSubtitleAiMenu = () => {
    const open = !showSubtitleAiMenu;
    setShowSubtitleAiMenu(open);
    if (open) void loadSubtitleSuggestions();
  };

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
  const [isGenerating, setIsGenerating] = useState(false);

  const editorRef = useRef(null);
  const bodyInputRef = useRef(null);
  const lastCaretRangeRef = useRef(null);
  const draggedTextRangeRef = useRef(null);

  // 에디터 내 커서 위치 상시 추적 및 저장
  const saveLastCaretRange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && bodyInputRef.current && bodyInputRef.current.contains(sel.anchorNode)) {
      lastCaretRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };
  const handledLocation = useRef(null);
  const locationText = locationRequest?.claimText || "";
  const locationIndex = locationText ? article.content.indexOf(locationText) : -1;
  const uniqueLocation = locationIndex >= 0 && article.content.indexOf(locationText, locationIndex + 1) < 0;
  const locationNotice = locationRequest?.articleId === article.id
    ? uniqueLocation ? "데이터맵에서 선택한 문장을 현재 원고에서 강조했습니다." : "현재 원고에서 해당 문장을 하나로 특정할 수 없습니다. 검증 시점의 원고와 현재 내용을 확인해 주세요."
    : "";
  useEffect(() => {
    if (!locationRequest || locationRequest.articleId !== article.id) return;
    if (handledLocation.current === locationRequest || !uniqueLocation) return;
    handledLocation.current = locationRequest;
    const input = bodyInputRef.current;
    input?.focus();
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [locationRequest, article.id, uniqueLocation, locationIndex, locationText]);
  const photoInputRef = useRef(null);
  const toolbarImageInputRef = useRef(null);

  // 팩트체크 검증 연동 상태 (형광펜, 검증 오류 호버, 그라데이션 팝업 및 자동 수정)
  const [highlightedClaim, setHighlightedClaim] = useState(null);
  const [hoveredIssue, setHoveredIssue] = useState(null);
  const [hoverCardPos, setHoverCardPos] = useState({ top: 0, left: 0 });
  const [toastMessage, setToastMessage] = useState("");
  const closeTimerRef = useRef(null);
  const popupRef = useRef(null);

  // 팩트체크 결과 표시: 본문 DOM 은 건드리지 않고 글자 구간에만 색을 입힌다(src/lib/factHighlights.js).
  // 결과가 바뀌거나 본문이 바뀌면 다시 칠하고, 오래된 표시는 남기지 않는다.
  const located = useRef([]);
  const [showFactMarks, setShowFactMarks] = useState(true); // 서랍을 닫으면 본문 표시·상태 문구를 숨긴다(결과 계산은 main 그대로)
  useEffect(() => {
    const root = bodyInputRef.current;
    if (!root || !showFactMarks) {
      located.current = [];
      clearPaint();
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      located.current = paint(root, factCheck.results, {
        focusId: factCheck.focus,
        activeId: review && currentIssue ? currentIssue.id : null,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [factCheck.results, factCheck.focus, article.content, review, currentIssue?.id, viewMode, showFactMarks]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearPaint(), []);

  // 에디터 마우스 움직임 감지: 칠해진 문제 문장 위에 마우스가 있으면 사유 팝업을 띄운다
  const handleEditorMouseMove = (e) => {
    const popupTarget = e.target.closest(".fact-gradient-popup");
    const hit = hitTest(located.current, e.clientX, e.clientY);

    if (hit) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      const matchedIssue = factCheckIssues.find((issue) => issue.id === hit.item.id);
      if (matchedIssue) {
        const editorRect = editorRef.current?.getBoundingClientRect() || { top: 0, left: 0, width: 600 };
        const barHeight = 44;
        const top = Math.max(6, hit.rect.top - editorRect.top - barHeight);
        const left = Math.max(8, Math.min(editorRect.width - 420, hit.rect.left - editorRect.left));
        setHoverCardPos({ top, left });
        setHoveredIssue(matchedIssue);
      }
    } else if (popupTarget) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    } else if (hoveredIssue && !closeTimerRef.current) {
      closeTimerRef.current = setTimeout(() => {
        setHoveredIssue(null);
        closeTimerRef.current = null;
      }, 250);
    }
  };

  // 칠해진 문장을 누르면(글자를 드래그해 고르는 중이 아니면) 그 문장만 상위 모델로 재검토한다(main 과 같은 동작)
  const handleFactClick = (e) => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const hit = hitTest(located.current, e.clientX, e.clientY);
    if (hit?.item.needsRecheck && !factCheck.recheckBusy) void factCheck.recheck(hit.item.key);
  };

  // 그라데이션 박스 클릭 시 수정안 본문 즉시 적용 — Core 는 고쳐 쓴 문안을 만들지 않으므로 제안이 있을 때만 동작한다.
  const handleApplyCorrection = (issue) => {
    if (!issue || !issue.targetText || !issue.suggestion) return;
    setArticle((prev) => ({ ...prev, content: (prev.content || "").replace(issue.targetText, issue.suggestion) }));
    setHoveredIssue(null);
    setToastMessage(`"${issue.suggestion}"(으)로 본문이 수정되었습니다.`);
    setTimeout(() => setToastMessage(""), 3500);
  };

  // 사진 편집 화면에서 "본문에 넣기"를 누른 뒤 작성 화면이 다시 열리면: 본문에 이미 있는 사진이면 편집본으로 바꾸고, 없으면 새로 넣는다
  useEffect(() => {
    if (!pendingPhoto || isImageEditorOpen || isPhotoEditing || !bodyInputRef.current) return;
    const photo = pendingPhoto;
    setPendingPhoto(null);
    // 편집 화면이 열려 있는 동안 에디터가 없었으므로 다시 열린 에디터는 비어 있다 — 기사 본문을 먼저 되돌린 뒤에 사진을 넣는다
    if (bodyInputRef.current.innerHTML !== (article.content || "")) bodyInputRef.current.innerHTML = article.content || "";
    // 새로 넣는 사진은 본문이 끝나는 지점에 놓는다(이전 캐럿 위치는 에디터가 다시 만들어지며 사라졌다)
    if (!bodyInputRef.current.querySelector(`[data-photo-id="${photo.id}"]`)) {
      const range = document.createRange();
      range.selectNodeContents(bodyInputRef.current);
      range.collapse(false);
      lastCaretRangeRef.current = range;
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    if (bodyInputRef.current.querySelector(`[data-photo-id="${photo.id}"]`)) handleSaveEditedPhoto(photo);
    else {
      handleInsertPhotoToContent(photo);
      setToastMessage(`"${photo.caption || "사진"}" 사진이 본문에 들어갔습니다.`);
      setTimeout(() => setToastMessage(""), 2500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPhoto, isImageEditorOpen, isPhotoEditing]);

  // 외부에서 article.content 변경 시 contentEditable 동기화 (초안 생성 등)
  useEffect(() => {
    if (bodyInputRef.current && bodyInputRef.current.innerHTML !== (article.content || "")) {
      if (document.activeElement !== bodyInputRef.current) {
        const textOnlyDom = bodyInputRef.current.innerText.replace(/\r\n/g, "\n");
        const textOnlyArticle = (article.content || "").replace(/<[^>]*>/g, "").replace(/\r\n/g, "\n");
        if (textOnlyDom.trim() !== textOnlyArticle.trim()) {
          bodyInputRef.current.innerHTML = article.content || "";
        }
      }
    }
    // 기존 본문에 박스 형태로 삽입되어 있던 사진 컨테이너 및 오버레이 정규화 (블러 제거, 우측 상단 심플 이모지 버튼 배치)
    if (bodyInputRef.current) {
      const photoBoxes = bodyInputRef.current.querySelectorAll('.article-photo-container > div');
      photoBoxes.forEach((box) => {
        if (box.classList.contains("border") || box.classList.contains("rounded-2xl") || box.classList.contains("bg-slate-900/5")) {
          box.className = "relative overflow-hidden";
        }
      });

      const photoOverlays = bodyInputRef.current.querySelectorAll('.photo-action-overlay');
      photoOverlays.forEach((overlay) => {
        if (
          overlay.classList.contains("inset-0") ||
          overlay.classList.contains("backdrop-blur-[2px]") ||
          overlay.classList.contains("justify-center") ||
          overlay.innerHTML.includes("🔄") ||
          overlay.innerHTML.includes("🗑️") ||
          overlay.innerHTML.includes("w-7 h-7")
        ) {
          const parentFigure = overlay.closest('.article-photo-container');
          const photoId = parentFigure?.dataset.photoId || `photo-${Date.now()}`;
          overlay.className = "photo-action-overlay absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30";
          overlay.innerHTML = `<button type="button" data-action="change-photo" data-photo-id="${photoId}" class="w-8 h-8 rounded-full bg-white/95 hover:bg-white text-slate-800 shadow-sm border border-stone-200 flex items-center justify-center transition cursor-pointer active:scale-95" title="사진 변경하기"><span class="text-sm font-bold leading-none select-none pointer-events-none text-slate-700">↻</span></button><button type="button" data-action="edit-photo" data-photo-id="${photoId}" class="w-8 h-8 rounded-full bg-white/95 hover:bg-white text-slate-800 shadow-sm border border-stone-200 flex items-center justify-center transition cursor-pointer active:scale-95" title="편집하기"><span class="text-sm font-bold leading-none select-none pointer-events-none text-slate-700">✎</span></button><button type="button" data-action="delete-photo" data-photo-id="${photoId}" class="w-8 h-8 rounded-full bg-white/95 hover:bg-rose-50 text-slate-800 hover:text-rose-600 shadow-sm border border-stone-200 flex items-center justify-center transition cursor-pointer active:scale-95" title="삭제하기"><span class="text-sm font-bold leading-none select-none pointer-events-none text-slate-700 hover:text-rose-600">✕</span></button>`;
        }
      });
    }
  }, [article.content, activeSidePanel, isImageEditorOpen, isPhotoEditing]);

  // 텍스트 드래그 선택 서식 툴바 감지 (contentEditable Selection 감지)
  const handleSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !bodyInputRef.current || !editorRef.current) {
      setFloatingToolbarPos(null);
      setSelectedText("");
      return;
    }

    // 선택 영역이 본문 에디터 내부인지 확인
    if (!bodyInputRef.current.contains(sel.anchorNode) || !bodyInputRef.current.contains(sel.focusNode)) {
      setFloatingToolbarPos(null);
      setSelectedText("");
      return;
    }

    const text = sel.toString().trim();
    if (!text) {
      setFloatingToolbarPos(null);
      setSelectedText("");
      return;
    }

    setSelectedText(text);

    try {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = editorRef.current.getBoundingClientRect();

      setFloatingToolbarPos({
        top: Math.max(10, rect.top - containerRect.top - 46),
        left: Math.max(10, Math.min(containerRect.width - 220, rect.left - containerRect.left + (rect.width / 2) - 100))
      });
    } catch (e) {
      setFloatingToolbarPos(null);
    }
  };

  // 기사 내용 복사 및 출력 핸들러
  const handleCopyArticle = () => {
    const fullText = [article.title, article.subtitle, article.content].filter(Boolean).join("\n\n");
    navigator.clipboard.writeText(fullText).then(() => {
      alert("기사 내용 전체가 클립보드에 복사되었습니다.");
    });
  };

  const handlePrintArticle = () => {
    window.print();
  };

  const handleTitleConfirm = () => {
    setIsTitleConfirmed(true);
  };

  const handleRegenerateTitle = () => {
    const titles = [
      "AI 반도체 기술 대도약, 글로벌 시장 주도권 쟁탈전 개막",
      "국내 연구진, 초거대 AI용 고성능 NPU 자체 개발 성공",
      "GPU 한계 넘는다... 차세대 PIM·NPU 반도체 생태계 급부상"
    ];
    const randomTitle = titles[Math.floor(Math.random() * titles.length)];
    setArticle((prev) => ({ ...prev, suggestedTitle: randomTitle, title: randomTitle }));
    setIsTitleConfirmed(false);
  };

  const handleGenerateDraft = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setArticle((prev) => ({
        ...prev,
        title: "AI 반도체 개척자들... 초거대 AI 시대의 차세대 주도권 경쟁",
        suggestedTitle: "AI 반도체 개척자들... 초거대 AI 시대의 차세대 주도권 경쟁",
        subtitle: "국내 주요 반도체 기업, NPU 및 PIM 기술로 글로벌 시장에 도전장",
        content: `인공지능(AI) 기술의 급격한 발전에 따라 고성능·고효율 AI 반도체의 수요가 폭발적으로 증가하고 있다. 기존 GPU 중심의 연산 시스템은 높은 전력 소비와 발열 문제로 한계에 부딪히고 있으며, 이에 따라 NPU(신경망 처리장치)와 PIM(지능형 반도체)이 차세대 대안으로 주목받고 있다.

국내 주요 기업과 연구진은 초거대 AI 모델 지원을 위한 고성능 AI 반도체를 자체 개발하여 글로벌 빅테크 기업들과 경쟁을 펼치고 있다. 이번 취재 결과, 국내 개발진은 데이터 병목 현상을 해결하고 전력 소비를 최대 70% 감소시키는 성과를 얻어냈다.

전문가들은 "단순한 칩 제조를 넘어 인공지능 알고리즘과의 최적화 소프트웨어가 향후 반도체 패권의 승패를 결정지을 것"이라고 조언했다. 이에 따른 정부 차원의 집중 지원과 실증 사업 확대가 시급한 시점이다.`
      }));
      setIsGenerating(false);
      setShowDraftModal(false);
      setIsTitleConfirmed(false);
    }, 1200);
  };

  // 기본 텍스트 서식 적용 (굵게, 기울임, 밑줄, 글자 크기, 동그라미)
  const applyFormat = (formatType) => {
    if (!bodyInputRef.current) return;
    bodyInputRef.current.focus();

    if (formatType === "bold") {
      document.execCommand("bold", false, null);
    } else if (formatType === "italic") {
      document.execCommand("italic", false, null);
    } else if (formatType === "underline") {
      document.execCommand("underline", false, null);
    } else if (formatType === "size") {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const parentSpan = range.commonAncestorContainer?.parentElement;
        if (parentSpan && (parentSpan.style.fontSize === "1.25em" || parentSpan.style.fontSize === "20px")) {
          parentSpan.style.fontSize = "";
        } else {
          const span = document.createElement("span");
          span.style.fontSize = "1.25em";
          span.style.fontWeight = "600";
          try {
            range.surroundContents(span);
          } catch (err) {
            document.execCommand("fontSize", false, "5");
          }
        }
      }
    } else if (formatType === "bullet") {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const text = range.toString();
        if (text) {
          const lines = text.split("\n");
          const bulleted = lines.map((l) => (l.startsWith("● ") ? l.replace(/^●\s*/, "") : `● ${l}`)).join("\n");
          range.deleteContents();
          range.insertNode(document.createTextNode(bulleted));
        } else {
          range.insertNode(document.createTextNode("● "));
        }
      }
    }

    // 변경된 HTML 상태 저장
    if (bodyInputRef.current) {
      setArticle((prev) => ({ ...prev, content: bodyInputRef.current.innerHTML }));
    }
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

  // 텍스트 편집 바(플로팅 툴바) 전용 이미지 파일 첨부 핸들러
  const handleToolbarImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return; // 파일 선택 취소 시 기존 작성 내용 유지

    const reader = new FileReader();
    reader.onload = (uploadEvt) => {
      if (uploadEvt.target?.result) {
        const newPhoto = {
          id: `photo-${Date.now()}`,
          url: uploadEvt.target.result,
          caption: file.name.replace(/\.[^/.]+$/, ""),
          source: "직접 첨부",
          provider: "김동아 기자",
          ratio: "16:9"
        };
        const updatedPhotos = [newPhoto, ...photos];
        setPhotos(updatedPhotos);

        // 본문 에디터에 사진 렌더링 블록 삽입
        const photoHtml = `<figure style="margin: 20px 0; text-align: center;" contenteditable="false"><img src="${uploadEvt.target.result}" alt="${file.name}" style="max-width: 100%; margin: 0 auto; display: block;" /><figcaption style="font-size: 11px; color: #64748b; margin-top: 8px; font-weight: 500;">▲ ${newPhoto.caption} (출처: 직접 첨부)</figcaption></figure><p><br></p>`;

        if (bodyInputRef.current) {
          bodyInputRef.current.focus();
          document.execCommand("insertHTML", false, photoHtml);
          setArticle((prev) => ({
            ...prev,
            photos: updatedPhotos,
            content: bodyInputRef.current.innerHTML
          }));
        } else {
          setArticle((prev) => ({
            ...prev,
            photos: updatedPhotos
          }));
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // 동일 파일 재선택 가능하도록 리셋
  };

  // 이미지 편집 완료 후 저장 및 기사 본문 실시간 반영
  const handleSaveEditedPhoto = (updatedPhoto) => {
    // 1. photos 목록 업데이트
    setPhotos((prev) => prev.map((p) => (p.id === updatedPhoto.id ? updatedPhoto : p)));

    // 2. 본문에 이미 삽입된 사진 DOM 속성 및 스타일 실시간 반영
    if (bodyInputRef.current) {
      const photoEl = bodyInputRef.current.querySelector(`[data-photo-id="${updatedPhoto.id}"]`);
      if (photoEl) {
        const img = photoEl.querySelector("img");
        if (img) {
          img.src = updatedPhoto.url;
          if (updatedPhoto.filterStyle) img.style.filter = updatedPhoto.filterStyle;
          if (updatedPhoto.rotation || updatedPhoto.isFlipped) {
            img.style.transform = `rotate(${updatedPhoto.rotation || 0}deg) scaleX(${updatedPhoto.isFlipped ? -1 : 1})`;
          }
        }
        const figcaption = photoEl.querySelector("figcaption");
        if (figcaption) {
          figcaption.innerText = `▲ ${updatedPhoto.caption} (출처: ${updatedPhoto.source})`;
        }
        setArticle((prev) => ({
          ...prev,
          content: bodyInputRef.current.innerHTML
        }));
      }
    }

    setToastMessage(`"${updatedPhoto.caption}" 사진 편집이 적용되었습니다.`);
    setTimeout(() => setToastMessage(""), 2500);
  };

  // 본문에 실제 시각적 사진 블록 삽입 (드래그 앤 드롭 및 텍스트 끝나는 지점 이동 지원)
  const handleInsertPhotoToContent = (photo) => {
    if (viewMode === "preview") {
      setViewMode("editor");
    }

    const photoId = photo.id || `photo-${Date.now()}`;
    const photoHtml = `<figure class="article-photo-container group relative my-6 select-none cursor-grab active:cursor-grabbing transition-all" data-photo-id="${photoId}" draggable="true" contenteditable="false"><div class="relative overflow-hidden"><div class="absolute top-2.5 left-2.5 z-20 px-2.5 py-1 rounded-md bg-black/65 backdrop-blur-md text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 pointer-events-none shadow-xs"><span>⠿ 드래그하여 텍스트 끝나는 지점으로 이동</span></div><img src="${photo.url}" alt="${photo.caption || ''}" class="w-full max-h-[520px] object-cover block pointer-events-none" style="${photo.filterStyle ? `filter: ${photo.filterStyle};` : ''} ${photo.rotation ? `transform: rotate(${photo.rotation}deg);` : ''}" /><div class="photo-action-overlay absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30"><button type="button" data-action="change-photo" data-photo-id="${photoId}" class="w-8 h-8 rounded-full bg-white/95 hover:bg-white text-slate-800 shadow-sm border border-stone-200 flex items-center justify-center transition cursor-pointer active:scale-95" title="사진 변경하기"><span class="text-sm font-bold leading-none select-none pointer-events-none text-slate-700">↻</span></button><button type="button" data-action="edit-photo" data-photo-id="${photoId}" class="w-8 h-8 rounded-full bg-white/95 hover:bg-white text-slate-800 shadow-sm border border-stone-200 flex items-center justify-center transition cursor-pointer active:scale-95" title="편집하기"><span class="text-sm font-bold leading-none select-none pointer-events-none text-slate-700">✎</span></button><button type="button" data-action="delete-photo" data-photo-id="${photoId}" class="w-8 h-8 rounded-full bg-white/95 hover:bg-rose-50 text-slate-800 hover:text-rose-600 shadow-sm border border-stone-200 flex items-center justify-center transition cursor-pointer active:scale-95" title="삭제하기"><span class="text-sm font-bold leading-none select-none pointer-events-none text-slate-700 hover:text-rose-600">✕</span></button></div></div><figcaption class="text-center text-xs text-slate-500 mt-2 font-medium">▲ ${photo.caption || '보도 사진'} (출처: ${photo.source || '동아일보 DB'})</figcaption></figure><p><br></p>`;

    if (bodyInputRef.current) {
      bodyInputRef.current.focus();

      const sel = window.getSelection();
      let targetRange = null;

      // 1) 현재 selection이 본문 에디터 내부에 유효한지 확인
      if (sel && sel.rangeCount > 0 && bodyInputRef.current.contains(sel.anchorNode)) {
        targetRange = sel.getRangeAt(0);
      } else if (
        lastCaretRangeRef.current &&
        bodyInputRef.current.contains(lastCaretRangeRef.current.commonAncestorContainer)
      ) {
        // 2) 저장된 마지막 캐럿 위치가 유효하면 복원
        targetRange = lastCaretRangeRef.current;
        if (sel) {
          try {
            sel.removeAllRanges();
            sel.addRange(targetRange);
          } catch {
            // ignore range error
          }
        }
      }

      let insertedFigure = null;

      if (targetRange) {
        try {
          targetRange.deleteContents();
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = photoHtml;
          const frag = document.createDocumentFragment();
          let node;
          while ((node = tempDiv.firstChild)) {
            if (!insertedFigure && node.nodeType === Node.ELEMENT_NODE && node.classList.contains("article-photo-container")) {
              insertedFigure = node;
            }
            frag.appendChild(node);
          }
          targetRange.insertNode(frag);

          if (insertedFigure && sel) {
            const afterRange = document.createRange();
            afterRange.setStartAfter(insertedFigure);
            afterRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(afterRange);
            lastCaretRangeRef.current = afterRange;
          }
        } catch {
          insertedFigure = null;
        }
      }

      // 커서가 없거나 에디터 외부 포커스 상태일 때: 현재 작성된 본문 텍스트가 끝나는 지점에 정확하게 삽입
      if (!insertedFigure) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = photoHtml;
        while (tempDiv.firstChild) {
          const child = tempDiv.firstChild;
          if (!insertedFigure && child.nodeType === Node.ELEMENT_NODE && child.classList.contains("article-photo-container")) {
            insertedFigure = child;
          }
          bodyInputRef.current.appendChild(child);
        }
      }

      setArticle((prev) => ({
        ...prev,
        content: bodyInputRef.current.innerHTML
      }));

      // 삽입된 사진 블록으로 부드럽게 스크롤
      setTimeout(() => {
        const targetEl = insertedFigure || bodyInputRef.current?.querySelector(`[data-photo-id="${photoId}"]`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 50);
    } else {
      setArticle((prev) => ({
        ...prev,
        content: (prev.content || "") + photoHtml
      }));
    }

    // 사진 보관함 자동 등록
    setPhotos((prev) => {
      if (!prev.some((p) => p.id === (photo.id || photoId) || p.url === photo.url)) {
        return [{ ...photo, id: photoId }, ...prev];
      }
      return prev;
    });

    setToastMessage(`"${photo.caption || '사진'}"이 본문에 첨부되었습니다.`);
    setTimeout(() => setToastMessage(""), 2500);
  };

  // 브라우저 호환 캐럿 Range 계산 헬퍼
  const getCaretRangeFromPoint = (x, y) => {
    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(x, y);
    }
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        const range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
        return range;
      }
    }
    return null;
  };

  // 본문 내 사진 및 텍스트 문장 드래그 앤 드롭 이동
  const handleEditorDragStart = (e) => {
    const photoCard = e.target.closest?.(".article-photo-container");
    if (photoCard) {
      e.dataTransfer.setData("photoId", photoCard.dataset.photoId);
      e.dataTransfer.effectAllowed = "move";
      photoCard.classList.add("opacity-40", "ring-2", "ring-black/80", "shadow-md");

      // 커서보단 살짝 큰 크기 (76x76px), 블러 및 투명감있는 실버 테두리 고스트 생성
      const imgEl = photoCard.querySelector("img");
      if (imgEl && e.dataTransfer.setDragImage) {
        const ghost = document.createElement("div");
        ghost.style.position = "fixed";
        ghost.style.top = "-9999px";
        ghost.style.left = "-9999px";
        ghost.style.width = "76px";
        ghost.style.height = "76px";
        ghost.style.borderRadius = "14px";
        ghost.style.overflow = "hidden";
        ghost.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)";
        ghost.style.border = "1.5px solid rgba(255, 255, 255, 0.85)";
        ghost.style.background = "rgba(226, 232, 240, 0.6)";
        ghost.style.backdropFilter = "blur(8px)";
        ghost.style.opacity = "0.85";
        ghost.style.pointerEvents = "none";
        ghost.style.zIndex = "999999";

        const ghostImg = document.createElement("img");
        ghostImg.src = imgEl.src;
        ghostImg.style.width = "100%";
        ghostImg.style.height = "100%";
        ghostImg.style.objectFit = "cover";
        ghostImg.style.filter = "blur(2px)";
        ghost.appendChild(ghostImg);

        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 38, 38);
        setTimeout(() => ghost.remove(), 100);
      }
      return;
    }

    // 텍스트/문장 드래그 시작 처리
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const selectedRange = sel.getRangeAt(0);
      draggedTextRangeRef.current = selectedRange.cloneRange();
      const text = sel.toString();
      e.dataTransfer.setData("text/plain", text);
      e.dataTransfer.setData("draggedSentenceText", text);
      e.dataTransfer.effectAllowed = "move";
    }
  };

  const handleEditorDragEnd = (e) => {
    const photoCard = e.target.closest?.(".article-photo-container");
    if (photoCard) {
      photoCard.classList.remove("opacity-40", "ring-2", "ring-black/80", "shadow-md");
    }
    const photoIndicator = bodyInputRef.current?.querySelector(".photo-drop-indicator");
    if (photoIndicator) photoIndicator.remove();
    const textIndicator = document.getElementById("sentence-drop-caret-indicator");
    if (textIndicator) textIndicator.remove();
  };

  const handleEditorDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!bodyInputRef.current) return;

    const isPhotoDrag = e.dataTransfer.types.includes("photoid") || e.dataTransfer.types.includes("photoId");

    if (isPhotoDrag) {
      // 사진 드래그인 경우: 텍스트 캐럿 숨기기
      const textIndicator = document.getElementById("sentence-drop-caret-indicator");
      if (textIndicator) textIndicator.style.display = "none";

      const children = Array.from(bodyInputRef.current.children).filter(
        (el) => !el.classList.contains("photo-drop-indicator")
      );
      if (children.length === 0) return;

      let targetChild = null;
      let insertAfter = false;

      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const box = child.getBoundingClientRect();
        const midY = box.top + box.height / 2;

        if (e.clientY < midY) {
          targetChild = child;
          insertAfter = false;
          break;
        } else if (i === children.length - 1 || e.clientY < box.bottom) {
          targetChild = child;
          insertAfter = true;
          break;
        }
      }

      if (!targetChild) {
        targetChild = children[children.length - 1];
        insertAfter = true;
      }

      // 심플한 검정색 & 투명감 있는 실버 스타일 사진 인디케이터
      let indicator = bodyInputRef.current.querySelector(".photo-drop-indicator");
      if (!indicator) {
        indicator = document.createElement("div");
        indicator.className =
          "photo-drop-indicator my-3 h-1.5 rounded-full bg-slate-900/85 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.2)] border border-slate-300/40 flex items-center justify-center pointer-events-none select-none transition-all";
        indicator.innerHTML =
          '<span class="px-2.5 py-0.5 rounded-full bg-stone-900 text-white text-[9px] font-bold shadow-sm border border-stone-600/40">📍 텍스트 끝 지점에 사진 배치</span>';
      }

      if (insertAfter) {
        if (targetChild.nextSibling !== indicator) {
          bodyInputRef.current.insertBefore(indicator, targetChild.nextSibling);
        }
      } else {
        if (targetChild !== indicator) {
          bodyInputRef.current.insertBefore(indicator, targetChild);
        }
      }
    } else {
      // 텍스트 / 문장 드래그 중인 경우: 심플한 검정색 / 투명감 있는 실버 캐럿 인디케이터 (DOM 변경 없이 오버레이 표시)
      const photoInd = bodyInputRef.current.querySelector(".photo-drop-indicator");
      if (photoInd) photoInd.remove();

      const range = getCaretRangeFromPoint(e.clientX, e.clientY);
      if (range && bodyInputRef.current.contains(range.commonAncestorContainer)) {
        let textIndicator = document.getElementById("sentence-drop-caret-indicator");
        if (!textIndicator) {
          textIndicator = document.createElement("div");
          textIndicator.id = "sentence-drop-caret-indicator";
          textIndicator.style.position = "fixed";
          textIndicator.style.width = "2.5px";
          textIndicator.style.borderRadius = "2px";
          textIndicator.style.backgroundColor = "#18181B"; // 심플한 검정색
          textIndicator.style.boxShadow = "0 0 6px rgba(0,0,0,0.35), 0 0 1px rgba(255,255,255,0.9)"; // 투명감 있는 실버
          textIndicator.style.pointerEvents = "none";
          textIndicator.style.zIndex = "999999";
          document.body.appendChild(textIndicator);
        }

        const rects = range.getClientRects();
        const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
        if (rect && rect.top > 0) {
          textIndicator.style.display = "block";
          textIndicator.style.left = `${rect.left}px`;
          textIndicator.style.top = `${rect.top}px`;
          textIndicator.style.height = `${Math.max(16, rect.height || 20)}px`;
        }
      }
    }
  };

  const handleEditorDrop = (e) => {
    e.preventDefault();

    // 모든 인디케이터 정리
    const photoIndicator = bodyInputRef.current?.querySelector(".photo-drop-indicator");
    if (photoIndicator) photoIndicator.remove();
    const textIndicator = document.getElementById("sentence-drop-caret-indicator");
    if (textIndicator) textIndicator.remove();

    const photoId = e.dataTransfer.getData("photoId");
    if (photoId) {
      if (!bodyInputRef.current) return;
      const photoCard = bodyInputRef.current.querySelector(`[data-photo-id="${photoId}"]`);
      if (!photoCard) return;

      photoCard.classList.remove("opacity-40", "ring-2", "ring-black/80", "shadow-md");

      let range = getCaretRangeFromPoint(e.clientX, e.clientY);
      if (range && bodyInputRef.current.contains(range.startContainer)) {
        let targetNode = range.startContainer;
        while (targetNode && targetNode.parentNode !== bodyInputRef.current && targetNode !== bodyInputRef.current) {
          targetNode = targetNode.parentNode;
        }
        if (targetNode && targetNode !== bodyInputRef.current) {
          bodyInputRef.current.insertBefore(photoCard, targetNode.nextSibling || targetNode);
        } else {
          bodyInputRef.current.appendChild(photoCard);
        }
      } else {
        bodyInputRef.current.appendChild(photoCard);
      }

      setArticle((prev) => ({
        ...prev,
        content: bodyInputRef.current.innerHTML
      }));
      setToastMessage("사진이 텍스트가 끝나는 지점으로 이동되었습니다.");
      setTimeout(() => setToastMessage(""), 2000);
      return;
    }

    // 텍스트/문장 드롭 처리 (Cut & Move)
    const textToInsert =
      e.dataTransfer.getData("draggedSentenceText") ||
      e.dataTransfer.getData("text/plain");

    if (textToInsert && bodyInputRef.current) {
      const initialDropRange = getCaretRangeFromPoint(e.clientX, e.clientY);
      if (!initialDropRange || !bodyInputRef.current.contains(initialDropRange.commonAncestorContainer)) {
        return;
      }

      // 1. 드롭 위치가 원본 드래그 선택 영역 내부인지 확인 (동일 문장 위 드롭 시 무시)
      if (draggedTextRangeRef.current) {
        try {
          const isInside =
            draggedTextRangeRef.current.comparePoint(initialDropRange.startContainer, initialDropRange.startOffset) === 0;
          if (isInside) {
            draggedTextRangeRef.current = null;
            return;
          }
        } catch {
          // ignore
        }

        // 2. 원본 드래그 위치에서 해당 문장 텍스트 삭제 (Cut)
        try {
          draggedTextRangeRef.current.deleteContents();
        } catch (err) {
          console.warn("deleteContents failed", err);
        }
        draggedTextRangeRef.current = null;
      }

      // 3. 삭제 후 최신 DOM 위치 기준 드롭 Range 재계산
      const finalDropRange = getCaretRangeFromPoint(e.clientX, e.clientY) || initialDropRange;

      if (finalDropRange && bodyInputRef.current.contains(finalDropRange.commonAncestorContainer)) {
        const trimmed = textToInsert.trim();
        const insertText = (trimmed.endsWith(".") || trimmed.endsWith("?") || trimmed.endsWith("!"))
          ? trimmed + " "
          : trimmed + " ";

        const textNode = document.createTextNode(insertText);
        finalDropRange.insertNode(textNode);

        // 4. 삽입된 문장 뒤로 커서 이동
        const newRange = document.createRange();
        newRange.setStartAfter(textNode);
        newRange.collapse(true);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(newRange);
          lastCaretRangeRef.current = newRange;
        }
      }

      // 5. article.content 데이터에 즉시 반영 및 저장
      const updatedContent = bodyInputRef.current.innerHTML;
      setArticle((prev) => ({
        ...prev,
        content: updatedContent
      }));

      // 로컬 스토리지 드래프트 즉시 저장 동기화
      try {
        const saved = localStorage.getItem("team01_article_draft_v1");
        const parsed = saved ? JSON.parse(saved) : {};
        localStorage.setItem("team01_article_draft_v1", JSON.stringify({ ...parsed, content: updatedContent }));
      } catch {
        // ignore
      }

      setToastMessage("✨ 문장이 새 위치로 이동되었습니다.");
      setTimeout(() => setToastMessage(""), 2000);
    }
  };

  // 본문 내 사진 호버 액션 클릭 핸들러 (사진 변경하기, 편집하기, 삭제하기)
  const handleEditorClick = (e) => {
    const actionBtn = e.target.closest("[data-action]");
    if (!actionBtn) return;
    e.preventDefault();
    e.stopPropagation();

    const action = actionBtn.dataset.action;
    const photoId = actionBtn.dataset.photoId;
    const targetPhoto = photos.find((p) => p.id === photoId) || {
      id: photoId,
      url: actionBtn.closest("figure")?.querySelector("img")?.src || "",
      caption: actionBtn.closest("figure")?.querySelector("figcaption")?.innerText?.replace(/^▲\s*/, "") || "",
      source: "동아일보 DB",
      provider: "김동아 기자"
    };

    if (action === "delete-photo") {
      const photoEl = actionBtn.closest(".article-photo-container");
      if (photoEl) {
        photoEl.remove();
        setArticle((prev) => ({
          ...prev,
          content: bodyInputRef.current?.innerHTML || ""
        }));
        setToastMessage("사진이 본문에서 삭제되었습니다.");
        setTimeout(() => setToastMessage(""), 2000);
      }
    } else if (action === "edit-photo") {
      setEditingPhoto(targetPhoto);
      setIsImageEditorOpen(true);
      if (setIsPhotoEditing) setIsPhotoEditing(true);
    } else if (action === "change-photo") {
      setActiveSidePanel("photo");
      setToastMessage("우측 패널에서 교체할 사진을 선택하세요.");
      setTimeout(() => setToastMessage(""), 2500);
    }
  };

  // CMS 발행/이관 실행
  // main 과 같은 순서: 저장 → CMS 전송 → 송고본 기록. 외부로 나가는 동작이라 한 번 확인한다.
  const handleCmsExport = async () => {
    if (!onPublish || isCmsExporting) return;
    if (!window.confirm("이 기사를 CMS(동아일보 통합 시스템)로 송고합니다.\n송고한 뒤에도 고쳐서 다시 송고할 수 있어요. 계속할까요?")) return;
    setIsCmsExporting(true);
    try {
      await onPublish();
      setIsCmsSuccessModal(true);
    } catch (error) {
      window.alert(`송고하지 못했습니다: ${error?.message || error}`);
    } finally {
      setIsCmsExporting(false);
    }
  };

  // main 의 미리보기는 "문단은 줄, 사진 자리는 [사진:id] 줄"인 글자 원고를 읽는다. 내 에디터 HTML 을 그 모양으로 바꿔 넘긴다.
  const { previewArticle, previewPhotos } = useMemo(() => {
    if (viewMode !== "preview") return { previewArticle: article, previewPhotos: [] };
    const known = [...photos];
    let html = String(article.content || "");
    if (typeof DOMParser !== "undefined" && /<(figure|img)[\s>]/i.test(html)) {
      const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
      doc.body.querySelectorAll("figure, img").forEach((node, index) => {
        if (!node.isConnected) return;
        const figure = node.closest("figure") || node;
        const img = figure.matches("img") ? figure : figure.querySelector("img");
        if (!img) return;
        const id = figure.getAttribute("data-photo-id") || img.getAttribute("data-photo-id") || `inline-${index}`;
        if (!known.some((photo) => photo.id === id)) {
          const caption = (figure.querySelector("figcaption")?.textContent || "").replace(/^\s*▲\s*/, "");
          const [text, source] = caption.split(/\s*\(출처:\s*/);
          known.push({ id, url: img.getAttribute("src") || "", caption: text.trim(), source: (source || "").replace(/\)\s*$/, "").trim() });
        }
        const line = doc.createElement("p");
        line.textContent = `[사진:${id}]`;
        figure.replaceWith(line);
      });
      html = doc.body.innerHTML;
    }
    return { previewArticle: { ...article, content: plainContent(html) }, previewPhotos: known };
  }, [viewMode, article, photos]);
  const previewSaveTimes = { firstSavedAt: article.createdAt, lastSavedAt: article.updatedAt };

  // [독자 화면 미리보기]: 왼쪽 사이드바만 제외하고 순수 흰색 배경에 중앙 정렬된 동아일보 실제 기사 지면 뷰로 전환
  if (viewMode === "preview") {
    return (
      <div className="w-full min-h-[calc(100vh-90px)] bg-white p-6 md:p-12 flex flex-col items-center animate-in fade-in duration-300">
        {/* 상단: 기사작성으로 돌아가기 바 */}
        <div className="w-full max-w-3xl flex items-center justify-between pb-6 mb-8 border-b border-slate-200">
          <button
            type="button"
            onClick={handleTogglePreview}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 hover:bg-black text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>기사작성으로 돌아가기</span>
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-bold tracking-wider">동아일보 공식 웹 뉴스 뷰</span>
            <button
              type="button"
              onClick={() => window.print()}
              className="p-1.5 text-slate-400 hover:text-slate-800 transition cursor-pointer"
              title="기사 인쇄"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* main 의 기사 미리보기(DongaPreview.jsx): 동아일보 기사 문서를 iframe 으로 그린다 */}
        <div className="w-full max-w-3xl mx-auto text-left">
          <DongaPreview article={previewArticle} photos={previewPhotos} published={null} saveTimes={previewSaveTimes} />
        </div>
      </div>
    );
  }

  // [사진 편집 화면]: 첨부한 스크린샷과 동일한 화면 (작성으로 돌아가기, 사진 편집, 원본/비율, 모자이크, 설명, 출처, 본문에 넣기)
  if ((isImageEditorOpen || isPhotoEditing) && editingPhoto) {
    return (
      <PhotoEditorView
        photo={editingPhoto}
        currentArticleTitle={article.title}
        status={article.status}
        onBack={() => {
          setIsImageEditorOpen(false);
          if (setIsPhotoEditing) setIsPhotoEditing(false);
        }}
        onTrackDownload={trackPhotoDownload}
        onError={(message) => { setToastMessage(message); setTimeout(() => setToastMessage(""), 3500); }}
        onApplyToArticle={(updatedPhoto) => {
          // 작성 화면의 에디터는 편집 화면이 열려 있는 동안 없으므로, 닫은 뒤(아래 효과)에 본문에 넣는다
          setPhotos((prev) => (prev.some((p) => p.id === updatedPhoto.id) ? prev.map((p) => (p.id === updatedPhoto.id ? updatedPhoto : p)) : [updatedPhoto, ...prev]));
          setPendingPhoto(updatedPhoto);
          setIsImageEditorOpen(false);
          if (setIsPhotoEditing) setIsPhotoEditing(false);
        }}
        charCount={(article.content || "").replace(/<[^>]*>/g, "").length || 1149}
      />
    );
  }

  return (
    <div className="writer-workspace w-full relative min-w-0 animate-float-in">
      {locationNotice && (
        <div role="status" className="rounded-xl border border-blue-100 bg-blue-50/80 p-3 text-xs text-blue-900 mb-4">
          {locationNotice}
        </div>
      )}

      {/* 메인 좌우 레이아웃: 기존 위치에서 우측으로 부드럽게 펼쳐지는 사이드 박스 */}
      <div
        ref={mainLayoutRef}
        className="w-full flex items-start justify-center min-w-0 gap-3.5 md:gap-4 transition-all duration-300 ease-out max-w-full"
      >
        {/* 1. 중앙/좌측 메인 작업 영역: [에디터] / [나란히 보기] */}
        <div
          style={activeSidePanel === "factcheck" ? { width: `calc((${factCheckSplitRatio} * (100% - 110px)) / 100)`, maxWidth: "none", flex: "none" } : undefined}
          className={`min-w-0 space-y-5 transition-all duration-300 ease-out ${!isSidePanelOpen
            ? "w-full max-w-4xl"
            : activeSidePanel === "factcheck"
              ? "min-w-[280px]"
              : `flex-1 min-w-[460px] ${!isSidebarCollapsed
                ? "max-w-2xl xl:max-w-3xl"
                : "max-w-3xl xl:max-w-4xl"
              }`
            }`}
        >



          {/* ──────────────────────────────────────────
          2. 메인 작업 영역: [에디터] / [나란히 보기] / [미리보기]
         ────────────────────────────────────────── */}
          <div className={`grid gap-6 items-start ${viewMode === "split" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
            }`}>

            {/* ──────────────────
            [A] 기사 작성 에디터 캔버스 (viewMode가 'editor' 또는 'split'일 때 표시)
            - Editorial Minimalist 레이아웃 (rounded-[16px], low-contrast border, soft shadow)
           ────────────────── */}
            {(viewMode === "editor" || viewMode === "split") && (
              <div className="bg-white/90 backdrop-blur-xs rounded-[16px] border border-black/[0.05] p-6 md:p-8 space-y-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] relative min-h-[640px] w-full">

                {/* 기사 헤드라인 영역 */}
                <div className="space-y-2 relative group">
                  {/* 기사 제목 텍스트 바로 위에 위치한 카테고리 선택 및 저장 이력 상태 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                    <div className="relative" ref={categoryMenuRef}>
                      <button
                        type="button"
                        onClick={() => setIsCategoryOpen(!isCategoryOpen)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 hover:bg-white text-slate-800 text-xs font-bold transition cursor-pointer select-none border border-white/90 shadow-[0_2px_12px_rgba(0,0,0,0.04)] backdrop-blur-md active:scale-95"
                        title="기사 카테고리 선택"
                      >
                        <Check className="w-3.5 h-3.5 text-slate-800 stroke-[2.8]" />
                        <span>{article.category || "분류 선택"}</span>
                      </button>

                      {/* 카테고리 선택 팝업 (화이트계열 회색 글래스모피즘 팝오버) */}
                      {isCategoryOpen && (
                        <div className="absolute left-0 top-full mt-2 z-50 bg-white/85 backdrop-blur-xl rounded-2xl border border-white/90 shadow-[0_16px_36px_rgba(0,0,0,0.12)] py-2.5 px-1.5 min-w-[115px] animate-in fade-in duration-150">
                          {CATEGORIES.map((cat) => {
                            const isSelected = article.category === cat;
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => {
                                  setArticle((prev) => ({ ...prev, category: cat, subcategory: "" }));
                                  setIsCategoryOpen(false);
                                }}
                                className="w-full flex items-center px-2.5 py-1.5 text-sm font-semibold text-slate-900 hover:bg-black/5 rounded-xl transition text-left cursor-pointer"
                              >
                                <span className="w-5 flex items-center justify-start text-xs font-black text-slate-950">
                                  {isSelected ? "✓" : ""}
                                </span>
                                <span className={isSelected ? "font-bold text-slate-950" : "font-medium text-slate-800"}>
                                  {cat}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    </div>

                    {/* 저장 이력 및 자동 저장 상태 버튼 (data-testid="save-status") */}
                    <button
                      type="button"
                      onClick={() => setShowHistoryModal(true)}
                      data-testid="save-status"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-stone-500 hover:text-stone-900 hover:bg-stone-100/70 transition cursor-pointer select-none"
                      title="저장 이력 확인 및 이전 저장본 복원"
                    >
                      <History className="w-3.5 h-3.5 text-stone-500" />
                      <span>자동 저장됨 · 이력</span>
                    </button>
                  </div>

                  {/* 기사 제목 라벨 및 AI 버튼 */}
                  <div className="flex items-center justify-between text-xs text-slate-400 font-semibold h-6">
                    <span>기사 제목</span>
                    <div className="flex items-center gap-1.5">
                      {/* AI 버튼 */}
                      <button
                        type="button"
                        onClick={toggleTitleAiMenu}
                        className="px-2 py-1 rounded-md hover:bg-black/5 text-slate-800 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                        title="AI 추천 제목"
                      >
                        <Bot className="w-4 h-4 text-slate-700" />
                        <span className="text-[11px] font-extrabold text-slate-800">AI</span>
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={article.title}
                      onChange={(e) => setArticle({ ...article, title: e.target.value })}
                      placeholder="기사 제목을 입력하세요"
                      className="w-full text-2xl md:text-3xl lg:text-[32px] font-black tracking-tight leading-snug border-b border-slate-200 pb-3 outline-none transition-colors bg-transparent text-slate-950 font-black"
                    />
                  </div>

                  {/* 제목 하단 글래스모피즘 세로형 AI 추천 패널 (단일 큰 박스) */}
                  {showTitleAiMenu && (
                    <div className="mt-3 p-3.5 bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-[0_8px_32px_rgba(0,0,0,0.06)] animate-float-in space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1 border-b border-slate-200/60 pb-2">
                        <span className="flex items-center gap-1.5">
                          <Bot className="w-3.5 h-3.5 text-slate-700" />
                          AI 추천 제목
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowTitleAiMenu(false)}
                          className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                        {titleSuggest.status === "loading" && (
                          <p className="p-2.5 text-xs text-slate-500">본문을 읽고 제목 후보를 만드는 중…</p>
                        )}
                        {titleSuggest.status === "error" && (
                          <p className="p-2.5 text-xs text-rose-600">
                            {titleSuggest.error}{" "}
                            <button type="button" onClick={loadTitleSuggestions} className="underline cursor-pointer">다시 시도</button>
                          </p>
                        )}
                        {titleSuggest.data.map((st, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setArticle((prev) => ({ ...prev, title: st, suggestedTitle: st }));
                              setShowTitleAiMenu(false);
                            }}
                            className="w-full text-left p-2.5 px-3 rounded-xl hover:bg-slate-100/80 text-xs md:text-sm font-bold text-slate-900 transition cursor-pointer flex items-center gap-2.5 group"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 group-hover:bg-slate-900 transition flex-shrink-0" />
                            <span className="flex-1 leading-snug">{st}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 부제 (부제목) 영역 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-semibold h-7">
                    <span>부제 (부제목)</span>
                    <div className="flex items-center gap-1.5">
                      {/* AI 버튼 */}
                      <button
                        type="button"
                        onClick={toggleSubtitleAiMenu}
                        className="px-2 py-1 rounded-md hover:bg-black/5 text-slate-800 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                        title="AI 추천 부제목"
                      >
                        <Bot className="w-4 h-4 text-slate-700" />
                        <span className="text-[11px] font-extrabold text-slate-800">AI</span>
                      </button>
                    </div>
                  </div>

                  {/* 첨부 이미지 스타일의 통 부제목 영역 (좌측 굵은 검정 바 & 통 부제목 텍스트 블록) */}
                  <div className="border-l-[3.5px] border-slate-950 pl-3.5 py-0.5 space-y-1.5 my-2">
                    {/* 부제는 줄바꿈으로 2~4줄을 쓰는 하나의 텍스트칸이다 */}
                    <textarea
                      data-testid="subtitle-input"
                      value={article.subtitle || ""}
                      rows={Math.min(6, Math.max(2, (article.subtitle || "").split("\n").length))}
                      onChange={(e) => {
                        const value = e.target.value;
                        setArticle((prev) => ({ ...prev, subtitle: value }));
                      }}
                      placeholder="부제목을 입력하세요 (줄바꿈으로 2~4줄)"
                      className="w-full resize-none text-base md:text-lg font-bold text-slate-950 tracking-tight leading-snug bg-transparent outline-none border-none p-0 placeholder:text-slate-300"
                    />
                  </div>

                  {/* 부제목 하단 글래스모피즘 세로형 AI 추천 패널 (단일 큰 박스) */}
                  {showSubtitleAiMenu && (
                    <div className="mt-3 p-3.5 bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 shadow-[0_8px_32px_rgba(0,0,0,0.06)] animate-float-in space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1 border-b border-slate-200/60 pb-2">
                        <span className="flex items-center gap-1.5">
                          <Bot className="w-3.5 h-3.5 text-slate-700" />
                          AI 추천 통 부제목
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowSubtitleAiMenu(false)}
                          className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* 2~4줄 완성형 통 부제목 후보 — 후보 하나가 한 묶음이다 */}
                      {subtitleSuggest.status === "loading" && (
                        <p className="p-2.5 text-xs text-slate-500">본문을 읽고 부제 후보를 만드는 중…</p>
                      )}
                      {subtitleSuggest.status === "error" && (
                        <p className="p-2.5 text-xs text-rose-600">
                          {subtitleSuggest.error}{" "}
                          <button type="button" onClick={loadSubtitleSuggestions} className="underline cursor-pointer">다시 시도</button>
                        </p>
                      )}
                      <div className="space-y-2">
                        {subtitleSuggest.data.map((candidate, candidateIndex) => {
                          const lines = candidate.split("\n").slice(0, 4);
                          const applyBundle = () => {
                            setSubtitles(lines.map((text, i) => ({ id: `sub-${i}-${Date.now()}`, text, locked: false })));
                            setSelectedAiSubtitles(lines);
                            setArticle((prev) => ({ ...prev, subtitle: lines.join("\n") }));
                            setShowSubtitleAiMenu(false);
                          };
                          return (
                            <div
                              key={candidateIndex}
                              onClick={applyBundle}
                              className="p-2.5 rounded-xl hover:bg-slate-100/70 transition cursor-pointer group"
                              title="클릭하여 적용"
                            >
                              <div className="border-l-[3.5px] border-slate-950 pl-3.5 space-y-1.5">
                                {lines.map((text, idx) => (
                                  <div key={idx} className="text-xs md:text-sm font-bold text-slate-900 leading-snug">
                                    {text}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>


                {/* 순서형 검사(main): 문제 문장을 한 건씩 넘겨 본다 */}
                {review && currentIssue && (
                  <div data-testid="factcheck-review" className="mb-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-rose-700">AI 팩트체크 순서형 검사 ({reviewAt + 1} / {factIssueCount})</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200">{MARK_LABEL[currentIssue.verdict] || "검토 필요"}</span>
                    </div>
                    <p className="mt-2 font-semibold text-slate-900">{currentIssue.claimText}</p>
                    {currentIssue.comment && <p className="mt-1 text-xs text-slate-600"><b>발생 이유</b> {currentIssue.comment}</p>}
                    {currentIssue.quote && <p className="mt-1 text-xs text-slate-500"><b>근거</b> {currentIssue.sourceDoc ? `[${currentIssue.sourceDoc}] ` : ""}{currentIssue.quote}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" disabled={reviewAt <= 0} onClick={() => setReviewIdx(reviewAt - 1)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 disabled:opacity-40">이전</button>
                      <button type="button" disabled={reviewAt >= factIssueCount - 1} onClick={() => setReviewIdx(reviewAt + 1)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 disabled:opacity-40">다음</button>
                      <button type="button" onClick={() => setReview(false)} className="ml-auto rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold text-white">검사 종료</button>
                    </div>
                  </div>
                )}

                {/* 분류별 모아보기 박스: 검증률의 분류 버튼을 누르면 본문 텍스트 위에 나온다 */}
                {showFactMarks && categoryFilter && (
                  <div data-testid="factcheck-collect" className={`mb-3 rounded-xl border px-4 py-3 text-sm ${FACT_GROUP_TONE[categoryFilter]}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black">{FACT_GROUP_TITLE[categoryFilter]} {collectedItems.length}문장만 모아보기</span>
                      <button type="button" data-testid="factcheck-collect-clear" onClick={() => setCategoryFilter(null)} className="rounded-lg bg-white/80 px-2.5 py-1 text-xs font-bold text-slate-700 border border-slate-200 cursor-pointer">닫기</button>
                    </div>
                    {collectedItems.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-600">해당하는 문장이 없습니다.</p>
                    ) : (
                      <ol className="mt-2 space-y-2">
                        {collectedItems.map((item, index) => (
                          <li key={item.id || index} className="space-y-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-black">{FACT_GROUP_TITLE[categoryFilter]}{item.matchRate != null ? ` (${item.matchRate}%)` : ""}</span>
                              {item.sourceDoc && <span className="text-[11px] font-bold text-slate-400">출처: {item.sourceDoc}</span>}
                            </div>
                            <p className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs font-bold leading-snug text-slate-800">&quot;{item.claimText}&quot;</p>
                            {item.quote && <p className="rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-2 text-xs italic leading-relaxed text-slate-800">&quot;{item.quote}&quot;</p>}
                            {item.comment && <p className="text-[11px] font-medium leading-relaxed text-slate-600"><strong>검증 의견:</strong> {item.comment}</p>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}

                {/* 본문 텍스트 에디터 */}
                <div
                  className="relative pt-1"
                  ref={editorRef}
                  onMouseUp={handleSelection}
                  onMouseMove={handleEditorMouseMove}
                >
                  <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-2">
                    <span>본문 작성 영역 (자유 작성 및 서식 적용)</span>
                    <div className="flex items-center gap-3">
                      {showFactMarks && (factCheck.busy || factCheck.results.length > 0) && (
                        <span data-testid="factcheck-status" className={`text-[11px] font-bold ${factIssueCount ? "text-rose-600" : "text-emerald-600"}`}>
                          {factCheck.busy ? "팩트체크 중…" : factIssueCount ? `확인 필요 ${factIssueCount}문장` : "팩트체크 통과"}
                        </span>
                      )}
                      <FlowSummaryButton body={textWithoutPhotos(article.content || "")} />
                      <span>공백 포함 {(article.content || "").replace(/<[^>]*>/g, "").length.toLocaleString()}자</span>
                    </div>
                  </div>

                  {/* 검증 오류 문장 호버 시 은은하게 뜨는 AI 팩트체크 수정 텍스트바 */}
                  {hoveredIssue && (
                    <div
                      ref={popupRef}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApplyCorrection(hoveredIssue);
                      }}
                      style={{
                        top: `${hoverCardPos.top}px`,
                        left: `${hoverCardPos.left}px`,
                        background: "linear-gradient(135deg, rgba(15, 23, 42, 0.94) 0%, rgba(30, 27, 75, 0.94) 100%)",
                        boxShadow: "0 8px 24px -4px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.15)",
                      }}
                      className="fact-gradient-popup absolute z-50 inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full backdrop-blur-md text-white cursor-pointer select-none transition-all duration-200 ease-out hover:scale-[1.01] active:scale-[0.99] shadow-lg animate-in fade-in slide-in-from-bottom-1"
                      title={hoveredIssue.suggestion ? "클릭하거나 우측 체크를 누르면 본문이 수정됩니다" : hoveredIssue.reason}
                    >
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                        {hoveredIssue.suggestion ? "AI 제안" : hoveredIssue.type}
                      </span>

                      <span className="text-xs text-slate-100 font-medium truncate max-w-[240px] sm:max-w-[320px] md:max-w-[380px]" title={hoveredIssue.suggestion || hoveredIssue.reason}>
                        {hoveredIssue.suggestion ? `"${hoveredIssue.suggestion}"` : hoveredIssue.reason}
                      </span>

                      {/* 우측 체크 표시 버튼 (누르면 즉시 변경) — 제안 문안이 있을 때만 */}
                      {hoveredIssue.suggestion && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApplyCorrection(hoveredIssue);
                          }}
                          className="w-6 h-6 rounded-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs flex-shrink-0 ml-0.5"
                          title="수정 적용"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                      )}

                      {/* 상위 모델 재검토 말풍선 UI (data-testid="recheck-tip") */}
                      {/* main 규칙: 로컬 판정이 확정하지 못한 문장만 상위 모델 재검토 대상이다 */}
                      {(hoveredIssue.needsRecheck || factCheck.recheckBusy || /^AI 재판정/.test(hoveredIssue.reason)) && (
                      <div data-testid="recheck-tip" className="inline-flex items-center gap-1 pl-1.5 border-l border-white/20">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRecheck(hoveredIssue.id);
                          }}
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 hover:bg-white/20 text-stone-200 hover:text-white transition cursor-pointer flex items-center gap-1"
                          title="로컬 판정 미확정 문장을 상위 모델로 재판정"
                        >
                          {factCheck.recheckBusy ? (
                            <span>상위모델 재검토 중…</span>
                          ) : !hoveredIssue.needsRecheck ? (
                            <span className="text-emerald-300">AI 재판정 완료</span>
                          ) : (
                            <span>상위모델 재검토</span>
                          )}
                        </button>
                      </div>
                      )}
                    </div>
                  )}

                  {/* 레퍼런스 스타일: 둥근 캡슐형 밝은 톤 플로팅 텍스트 편집 바 */}
                  {floatingToolbarPos && (
                    <div
                      style={{ top: `${floatingToolbarPos.top}px`, left: `${floatingToolbarPos.left}px` }}
                      className="absolute z-30 flex items-center gap-1 bg-white/95 backdrop-blur-md px-2 py-1.5 rounded-full shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.06)] border border-slate-200/90 animate-float-in text-xs"
                    >
                      {/* 숨겨진 이미지 파일 입력 창 (취소 시 기존 본문 유지) */}
                      <input
                        ref={toolbarImageInputRef}
                        type="file"
                        accept="image/png, image/jpeg, image/jpg, image/webp, image/gif"
                        className="hidden"
                        onChange={handleToolbarImageSelect}
                      />

                      {/* 1. 굵게 (B) */}
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); applyFormat("bold"); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-700 hover:text-slate-950 hover:bg-white hover:shadow-xs hover:border hover:border-slate-200/70 transition-all cursor-pointer group relative active:scale-95"
                        title="굵게"
                      >
                        <Bold className="w-3.5 h-3.5" />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md z-40">
                          굵게
                        </span>
                      </button>

                      {/* 2. 기울임 (I) */}
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); applyFormat("italic"); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-700 hover:text-slate-950 hover:bg-white hover:shadow-xs hover:border hover:border-slate-200/70 transition-all cursor-pointer group relative active:scale-95"
                        title="기울임"
                      >
                        <Italic className="w-3.5 h-3.5" />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md z-40">
                          기울임
                        </span>
                      </button>

                      {/* 3. 밑줄 (U) */}
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); applyFormat("underline"); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-700 hover:text-slate-950 hover:bg-white hover:shadow-xs hover:border hover:border-slate-200/70 transition-all cursor-pointer group relative active:scale-95"
                        title="밑줄"
                      >
                        <Underline className="w-3.5 h-3.5" />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md z-40">
                          밑줄
                        </span>
                      </button>

                      {/* 미니 구분선 */}
                      <div className="w-[1px] h-3.5 bg-slate-200 mx-0.5" />

                      {/* 4. 글자 크기 */}
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); applyFormat("size"); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-700 hover:text-slate-950 hover:bg-white hover:shadow-xs hover:border hover:border-slate-200/70 transition-all cursor-pointer group relative active:scale-95"
                        title="글자 크기"
                      >
                        <Type className="w-3.5 h-3.5" />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md z-40">
                          글자 크기
                        </span>
                      </button>

                      {/* 5. 동그라미 불릿 */}
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); applyFormat("bullet"); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-700 hover:text-slate-950 hover:bg-white hover:shadow-xs hover:border hover:border-slate-200/70 transition-all cursor-pointer group relative active:scale-95"
                        title="동그라미 목록"
                      >
                        <CircleDot className="w-3.5 h-3.5" />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md z-40">
                          동그라미
                        </span>
                      </button>

                      {/* 미니 구분선 */}
                      <div className="w-[1px] h-3.5 bg-slate-200 mx-0.5" />

                      {/* 6. 이미지 첨부 버튼 (클릭 시 옆에 사진 첨부 박스 열림) */}
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setActiveSidePanel("photo");
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-700 hover:text-slate-950 hover:bg-white hover:shadow-xs hover:border hover:border-slate-200/70 transition-all cursor-pointer group relative active:scale-95"
                        title="사진 첨부"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-slate-700" />
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md z-40">
                          사진 첨부
                        </span>
                      </button>
                    </div>
                  )}

                  <div
                    ref={bodyInputRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => {
                      // 업데이터는 이벤트 처리 뒤에 실행되어 currentTarget 이 null 이 되므로 먼저 읽어 둔다.
                      const nextContent = e.currentTarget.innerHTML;
                      setArticle((prev) => ({ ...prev, content: nextContent }));
                      saveLastCaretRange();
                    }}
                    onMouseUp={() => {
                      handleSelection();
                      saveLastCaretRange();
                    }}
                    onKeyUp={() => {
                      handleSelection();
                      saveLastCaretRange();
                    }}
                    onClick={(e) => {
                      handleEditorClick(e);
                      handleFactClick(e);
                      saveLastCaretRange();
                    }}
                    onBlur={saveLastCaretRange}
                    onDragStart={handleEditorDragStart}
                    onDragOver={handleEditorDragOver}
                    onDragEnd={handleEditorDragEnd}
                    onDrop={handleEditorDrop}
                    data-placeholder="기사 본문을 입력하세요. 자유롭게 문단을 작성할 수 있습니다..."
                    className="w-full min-h-[460px] text-slate-900 text-xs md:text-sm leading-relaxed p-5 bg-slate-50/50 rounded-xl border border-black/[0.06] focus:bg-white focus:border-[#8ECAE6] focus:ring-2 focus:ring-[#8ECAE6]/20 outline-none transition-all shadow-2xs font-sans empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 cursor-text overflow-y-auto"
                  />
                </div>

              </div>
            )}

            {/* ──────────────────
            [B] 실시간 포털/신문 미리보기 캔버스 (viewMode가 'preview' 또는 'split'일 때 표시)
            - Editorial Minimalist 레이아웃 (rounded-[16px], low-contrast border, soft shadow)
           ────────────────── */}
            {/* ──────────────────
            [B] 동아일보 실제 뉴스 사이트 미리보기 (나란히 보기 split 모드)
           ────────────────── */}
            {viewMode === "split" && (
              <div className="w-full bg-white rounded-2xl border border-slate-100 p-6 md:p-10 shadow-xs space-y-6">
                {/* 상단: 기사작성으로 돌아가기 버튼 */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <button
                    type="button"
                    onClick={() => setViewMode("editor")}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 hover:bg-black text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>기사작성으로 돌아가기</span>
                  </button>
                  <span className="text-xs text-slate-400 font-medium">동아일보 공식 웹 뉴스 뷰</span>
                </div>

                {/* 동아일보 실제 뉴스 웹사이트 레이아웃 (첨부 레퍼런스 스타일 100% 반영) */}
                <div className="max-w-2xl mx-auto space-y-6 animate-float-in">
                  {/* 카테고리 네비게이션 */}
                  <div className="flex items-center gap-1.5 text-xs font-bold text-teal-700">
                    <span>{article.category || "분류 선택"}</span>
                    <span className="text-slate-300 font-normal">&gt;</span>
                    <span>2026 국정감사</span>
                  </div>

                  {/* 기사 헤드라인 제목 (동아일보 정통 명조) */}
                  <h1
                    style={{ fontFamily: "'Nanum Myeongjo', Batang, serif", wordBreak: "keep-all", letterSpacing: "-0.02em" }}
                    className="text-2xl md:text-3xl lg:text-[32px] font-bold text-slate-950 leading-snug tracking-tight"
                  >
                    {article.title || "기사 제목이 이곳에 표시됩니다"}
                  </h1>

                  {/* 메타 정보 바 (신문사, 업데이트 일자, 구글검색 선호 등) */}
                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800">동아일보</span>
                      <span className="text-slate-300">|</span>
                      <span>업데이트 2026-10-10 07:28</span>
                    </div>
                    <div className="hidden sm:flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-600 bg-slate-50/50">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span>구글검색 선호 추가</span>
                    </div>
                  </div>

                  {/* 반응 및 액션 아이콘 줄 */}
                  <div className="flex items-center justify-between py-2.5 border-y border-slate-100 text-xs text-slate-600">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="w-4 h-4 text-slate-500" />
                        <span className="font-bold text-slate-700">39</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Heart className="w-4 h-4 text-slate-500" />
                        <span className="font-bold text-slate-700">8</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500">
                      <button type="button" className="p-1 hover:text-slate-900 transition"><Share2 className="w-4 h-4" /></button>
                      <button type="button" className="p-1 hover:text-slate-900 transition"><Bookmark className="w-4 h-4" /></button>
                      <button type="button" className="p-1 hover:text-slate-900 transition"><Volume2 className="w-4 h-4" /></button>
                      <button type="button" className="p-1 hover:text-slate-900 transition" onClick={() => window.print()}><Printer className="w-4 h-4" /></button>
                    </div>
                  </div>

                  {/* 부제목 (동아일보 특유의 좌측 굵은 검은색 바 스타일 및 명조 서체) */}
                  {article.subtitle && (
                    <div className="border-l-[3.5px] border-slate-950 pl-3.5 py-1">
                      <div
                        style={{ fontFamily: "'Nanum Myeongjo', Batang, 'Pretendard', sans-serif", wordBreak: "keep-all", letterSpacing: "-0.015em" }}
                        className="text-sm md:text-base font-bold text-slate-900 leading-relaxed whitespace-pre-line"
                      >
                        {article.subtitle}
                      </div>
                    </div>
                  )}

                  {/* 대표 이미지 (있을 경우) */}
                  {photos.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="overflow-hidden">
                        <img src={photos[0].url} alt="main article" className="w-full h-auto object-cover" />
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">
                        ▲ {photos[0].caption} (출처: {photos[0].source})
                      </p>
                    </div>
                  )}

                  {/* 본문 (동아일보 정통 신문 명조 서체 & 실제 기사 행간) */}
                  <div
                    style={{
                      fontFamily: "'Nanum Myeongjo', Batang, serif",
                      wordBreak: "keep-all",
                      lineHeight: "1.9",
                      letterSpacing: "-0.015em",
                      fontSize: "1.05rem"
                    }}
                    className="text-slate-800 space-y-4 pt-2"
                    dangerouslySetInnerHTML={{ __html: article.content || "기사 본문 내용이 실시간으로 렌더링됩니다..." }}
                  />
                </div>
              </div>
            )}

            {/* grid 닫기 */}
          </div>

          {/* 좌측 컬럼 flex-1 닫기 */}
        </div>

        {/* [우측 컬럼]: 사이드 박스 (사진 첨부 / 취재자료 검색 / 팩트체크 & 근거자료) */}
        {viewMode !== "preview" && activeSidePanel === "photo" && (
          <PhotoSideDrawer
            onClose={() => setActiveSidePanel(null)}
            photos={photos}
            setPhotos={setPhotos}
            articleContent={article.content}
            onInsertPhoto={handleInsertPhotoToContent}
            onOpenImageEditor={(photo) => {
              setEditingPhoto(photo);
              setIsImageEditorOpen(true);
              if (setIsPhotoEditing) setIsPhotoEditing(true);
            }}
            isSidebarCollapsed={isSidebarCollapsed}
          />
        )}

        {viewMode !== "preview" && activeSidePanel === "search" && (
          <aside className={`w-full ${!isSidebarCollapsed ? "md:w-[360px] lg:w-[380px] xl:w-[395px]" : "md:w-[370px] lg:w-[390px] xl:w-[410px]"} flex-shrink-0 bg-white/95 rounded-3xl border border-slate-200/90 shadow-sm flex flex-col h-[calc(100vh-170px)] min-h-[640px] sticky top-4 overflow-hidden transition-all duration-300 ease-out animate-in fade-in slide-in-from-left-4 z-20`}>
            <SourceSearch
              isSidePanel={true}
              onClose={() => setActiveSidePanel(null)}
              onConnectToArticle={(source) => {
                if (onConnectSource) {
                  onConnectSource(source);
                } else {
                  const citation = `\n\n[출처 참고: ${source.title} (${source.category})]`;
                  setArticle((prev) => ({
                    ...prev,
                    content: prev.content + citation,
                    linkedSources: Array.from(new Set([...prev.linkedSources, source.id]))
                  }));
                  alert(`"${source.title}" 자료가 작성 기사의 출처로 연결되었습니다.`);
                }
              }}
            />
          </aside>
        )}

        {/* 수정 반영 성공 토스트 알림 */}
        {toastMessage && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur-md text-slate-900 px-5 py-2.5 rounded-full shadow-xl border border-slate-200/90 flex items-center text-xs font-bold animate-in fade-in slide-in-from-bottom-2 duration-200">
            <span>{typeof toastMessage === "string" ? toastMessage.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "").trim() : toastMessage}</span>
          </div>
        )}

        {/* 기사 작성 화면과 팩트체크 박스 사이 크기 조절 | 핸들 */}
        {viewMode !== "preview" && activeSidePanel === "factcheck" && (
          <div
            onMouseDown={handleSplitMouseDown}
            className="flex-shrink-0 self-stretch flex items-center justify-center w-5 cursor-col-resize group select-none z-30 sticky top-6"
            title="좌우 크기 조절 (드래그)"
          >
            <div className="w-1 h-full bg-slate-200/70 group-hover:bg-blue-400 group-active:bg-blue-600 rounded-full transition-colors relative flex items-center justify-center">
              <span className="w-5 h-8 rounded-md bg-white border border-slate-300/90 shadow-xs flex items-center justify-center text-xs font-mono font-bold text-slate-500 group-hover:text-blue-600 group-hover:border-blue-400 transition-all select-none">
                |
              </span>
            </div>
          </div>
        )}

        {viewMode !== "preview" && activeSidePanel === "factcheck" && (
          <div
            style={{ width: `calc((${100 - factCheckSplitRatio} * (100% - 110px)) / 100)`, flex: "none" }}
            className="min-w-[280px] flex-shrink-0 z-20 sticky top-6 self-start"
          >
            <FactCheckDrawer
              className="w-full"
              onClose={() => {
                setActiveSidePanel(null);
                setShowCheckModal(false);
                setHighlightedClaim(null);
                setHoveredIssue(null);
                setReview(false); // 닫으면 순서형 검사도 끝낸다(카드와 진한 밑줄이 남지 않게)
                setReviewIdx(0);
                setShowFactMarks(false); // 본문 표시와 헤더 상태 문구도 함께 숨긴다
                setCategoryFilter(null);
              }}
              article={article}
              setArticle={setArticle}
              factCheck={factCheck}
              onModels={onModels}
              onStartCheck={startFullCheck}
            />
          </div>
        )}

        {/* 기사 작성 화면 메인 박스 오른쪽 상단 바로 옆에 위치한 일관된 캡슐형 Hover 확장 사이드바 (미리보기 화면에서는 숨김) */}
        {viewMode !== "preview" && (
          <aside className="sticky top-6 flex-shrink-0 z-30 select-none">
            <div className="flex flex-col items-start gap-2">
              {/* 1. 사진 첨부 */}
              <div className="relative w-10 h-10 group">
                <button
                  type="button"
                  onClick={() => setActiveSidePanel(activeSidePanel === "photo" ? null : "photo")}
                  className={`absolute left-0 top-0 h-10 w-10 group-hover:w-max min-w-[40px] px-2.5 rounded-full flex items-center transition-all duration-200 ease-out z-10 group-hover:z-30 overflow-hidden cursor-pointer active:scale-95 shadow-[0_2px_8px_rgba(0,0,0,0.04)] group-hover:shadow-md border backdrop-blur-md ${activeSidePanel === "photo"
                    ? "bg-slate-100/90 border-slate-800 text-slate-950 font-black shadow-xs"
                    : "bg-white/95 border-slate-200/90 text-slate-700 group-hover:text-slate-950 group-hover:border-slate-300"
                    }`}
                >
                  <ImagePlus className="w-4.5 h-4.5 flex-shrink-0 text-slate-700" />
                  <span className="text-xs font-bold whitespace-nowrap pl-2 pr-2.5 opacity-0 max-w-0 group-hover:max-w-[160px] group-hover:opacity-100 transition-all duration-200 overflow-hidden select-none">
                    사진 첨부
                  </span>
                </button>
              </div>

              {/* 2. 미리보기 */}
              <div className="relative w-10 h-10 group">
                <button
                  type="button"
                  onClick={handleTogglePreview}
                  className={`absolute left-0 top-0 h-10 w-10 group-hover:w-max min-w-[40px] px-2.5 rounded-full flex items-center transition-all duration-200 ease-out z-10 group-hover:z-30 overflow-hidden cursor-pointer active:scale-95 shadow-[0_2px_8px_rgba(0,0,0,0.04)] group-hover:shadow-md border backdrop-blur-md ${viewMode === "preview"
                    ? "bg-slate-100/90 border-slate-800 text-slate-950 font-black shadow-xs"
                    : "bg-white/95 border-slate-200/90 text-slate-700 group-hover:text-slate-950 group-hover:border-slate-300"
                    }`}
                >
                  <Eye className="w-4.5 h-4.5 flex-shrink-0 text-slate-700" />
                  <span className="text-xs font-bold whitespace-nowrap pl-2 pr-2.5 opacity-0 max-w-0 group-hover:max-w-[160px] group-hover:opacity-100 transition-all duration-200 overflow-hidden select-none">
                    독자 화면 미리보기
                  </span>
                </button>
              </div>

              {/* 3. 복사하기 */}
              <div className="relative w-10 h-10 group">
                <button
                  type="button"
                  onClick={handleCopyArticle}
                  className="absolute left-0 top-0 h-10 w-10 group-hover:w-max min-w-[40px] px-2.5 rounded-full flex items-center transition-all duration-200 ease-out z-10 group-hover:z-30 overflow-hidden cursor-pointer active:scale-95 shadow-[0_2px_8px_rgba(0,0,0,0.04)] group-hover:shadow-md border border-slate-200/90 bg-white/95 backdrop-blur-md text-slate-700 group-hover:text-slate-950 group-hover:border-slate-300"
                >
                  <Copy className="w-4.5 h-4.5 flex-shrink-0 text-slate-700" />
                  <span className="text-xs font-bold whitespace-nowrap pl-2 pr-2.5 opacity-0 max-w-0 group-hover:max-w-[160px] group-hover:opacity-100 transition-all duration-200 overflow-hidden select-none">
                    기사 복사하기
                  </span>
                </button>
              </div>

              {/* 4. 출력하기 */}
              <div className="relative w-10 h-10 group">
                <button
                  type="button"
                  onClick={handlePrintArticle}
                  className="absolute left-0 top-0 h-10 w-10 group-hover:w-max min-w-[40px] px-2.5 rounded-full flex items-center transition-all duration-200 ease-out z-10 group-hover:z-30 overflow-hidden cursor-pointer active:scale-95 shadow-[0_2px_8px_rgba(0,0,0,0.04)] group-hover:shadow-md border border-slate-200/90 bg-white/95 backdrop-blur-md text-slate-700 group-hover:text-slate-950 group-hover:border-slate-300"
                >
                  <Printer className="w-4.5 h-4.5 flex-shrink-0 text-slate-700" />
                  <span className="text-xs font-bold whitespace-nowrap pl-2 pr-2.5 opacity-0 max-w-0 group-hover:max-w-[160px] group-hover:opacity-100 transition-all duration-200 overflow-hidden select-none">
                    기사 출력하기
                  </span>
                </button>
              </div>

              {/* 5. CMS 송고 (main 기능: 저장 → CMS 전송 → 송고본 기록) */}
              <div className="relative w-10 h-10 group">
                <button
                  type="button"
                  data-testid="cms-publish"
                  onClick={handleCmsExport}
                  disabled={isCmsExporting}
                  className="absolute left-0 top-0 h-10 w-10 group-hover:w-max min-w-[40px] px-2.5 rounded-full flex items-center transition-all duration-200 ease-out z-10 group-hover:z-30 overflow-hidden cursor-pointer active:scale-95 disabled:opacity-60 shadow-[0_2px_8px_rgba(0,0,0,0.04)] group-hover:shadow-md border border-slate-200/90 bg-white/95 backdrop-blur-md text-slate-700 group-hover:text-slate-950 group-hover:border-slate-300"
                >
                  <Send className="w-4.5 h-4.5 flex-shrink-0 text-slate-700" />
                  <span className="text-xs font-bold whitespace-nowrap pl-2 pr-2.5 opacity-0 max-w-0 group-hover:max-w-[200px] group-hover:opacity-100 transition-all duration-200 overflow-hidden select-none">
                    {isCmsExporting ? "송고 중…" : article.status === "송고됨" ? "CMS 송고됨 · 다시 송고" : "CMS 송고"}
                  </span>
                </button>
              </div>

              {/* 미니 구분선 */}
              <div className="w-6 h-[1px] bg-slate-200/80 my-0.5 ml-2" />



              {/* 6. 취재자료 검색 */}
              <div className="relative w-10 h-10 group">
                <button
                  type="button"
                  onClick={() => setActiveSidePanel(activeSidePanel === "search" ? null : "search")}
                  className={`absolute left-0 top-0 h-10 w-10 group-hover:w-max min-w-[40px] px-2.5 rounded-full flex items-center transition-all duration-200 ease-out z-10 group-hover:z-30 overflow-hidden cursor-pointer active:scale-95 shadow-[0_2px_8px_rgba(0,0,0,0.04)] group-hover:shadow-md border backdrop-blur-md ${activeSidePanel === "search"
                    ? "bg-slate-100/90 border-slate-800 text-slate-950 font-black shadow-xs"
                    : "bg-white/95 border-slate-200/90 text-slate-700 group-hover:text-slate-950 group-hover:border-slate-300"
                    }`}
                >
                  <Search className="w-4.5 h-4.5 flex-shrink-0 text-slate-700" />
                  <span className="text-xs font-bold whitespace-nowrap pl-2 pr-2.5 opacity-0 max-w-0 group-hover:max-w-[160px] group-hover:opacity-100 transition-all duration-200 overflow-hidden select-none">
                    취재자료 검색
                  </span>
                </button>
              </div>

              {/* 7. 기사 팩트체크 & 근거자료 */}
              <div className="relative w-10 h-10 group">
                <button
                  type="button"
                  onClick={() => {
                    if (activeSidePanel === "factcheck") {
                      setActiveSidePanel(null);
                      setShowCheckModal(false);
                      setReview(false);
                    } else {
                      setActiveSidePanel("factcheck");
                      setShowFactMarks(true);
                      setShowCheckModal(true);
                      setReview(true);
                      setReviewIdx(0);
                      if (onRunFactCheck) onRunFactCheck();
                    }
                  }}
                  className={`absolute left-0 top-0 h-10 w-10 group-hover:w-max min-w-[40px] px-2.5 rounded-full flex items-center transition-all duration-200 ease-out z-10 group-hover:z-30 overflow-hidden cursor-pointer active:scale-95 shadow-[0_2px_8px_rgba(0,0,0,0.04)] group-hover:shadow-md border backdrop-blur-md ${(factCheckRequest > 0) || activeSidePanel === "factcheck"
                    ? "bg-slate-100/90 border-slate-800 text-slate-950 font-black shadow-xs"
                    : "bg-white/95 border-slate-200/90 text-slate-700 group-hover:text-slate-950 group-hover:border-slate-300"
                    }`}
                >
                  <ShieldCheck className="w-4.5 h-4.5 flex-shrink-0 text-slate-700" />
                  <span className="text-xs font-bold whitespace-nowrap pl-2 pr-2.5 opacity-0 max-w-0 group-hover:max-w-[180px] group-hover:opacity-100 transition-all duration-200 overflow-hidden select-none">
                    기사 팩트체크 & 근거자료
                  </span>
                </button>
              </div>

              {/* 8. 에디터 전용 보기 */}
              <div className="relative w-10 h-10 group">
                <button
                  type="button"
                  onClick={() => setViewMode("editor")}
                  className={`absolute left-0 top-0 h-10 w-10 group-hover:w-max min-w-[40px] px-2.5 rounded-full flex items-center transition-all duration-200 ease-out z-10 group-hover:z-30 overflow-hidden cursor-pointer active:scale-95 shadow-[0_2px_8px_rgba(0,0,0,0.04)] group-hover:shadow-md border backdrop-blur-md ${viewMode === "editor"
                    ? "bg-slate-100/90 border-slate-800 text-slate-950 font-black shadow-xs"
                    : "bg-white/95 border-slate-200/90 text-slate-700 group-hover:text-slate-950 group-hover:border-slate-300"
                    }`}
                >
                  <Edit3 className="w-4.5 h-4.5 flex-shrink-0 text-slate-700" />
                  <span className="text-xs font-bold whitespace-nowrap pl-2 pr-2.5 opacity-0 max-w-0 group-hover:max-w-[160px] group-hover:opacity-100 transition-all duration-200 overflow-hidden select-none">
                    에디터 전용 보기
                  </span>
                </button>
              </div>

            </div>
          </aside>
        )}

        {/* 메인 flex 컨테이너 닫기 */}
      </div>

      {/* ──────────────────────────────────────────
          4. CMS 최종 발행 성공 알림 모달
         ────────────────────────────────────────── */}
      {isCmsSuccessModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/45 backdrop-blur-md flex items-center justify-center p-4 animate-smooth-in">
          <div className="bg-white/96 backdrop-blur-2xl rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-[0_24px_64px_-12px_rgba(0,0,0,0.22),0_8px_24px_-4px_rgba(0,0,0,0.08),inset_0_1px_1px_rgba(255,255,255,1)] text-center space-y-4 animate-smooth-pop border border-white ring-1 ring-stone-900/10">
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
        <div className="fixed inset-0 z-50 bg-stone-950/45 backdrop-blur-md flex items-center justify-center p-4 animate-smooth-in">
          <div className="bg-white/96 backdrop-blur-2xl rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-[0_24px_64px_-12px_rgba(0,0,0,0.22),0_8px_24px_-4px_rgba(0,0,0,0.08),inset_0_1px_1px_rgba(255,255,255,1)] border border-white ring-1 ring-stone-900/10 space-y-5 animate-smooth-pop">
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
                  {["2026 차세대 반도체 산업 동향 보고서", "김성민 박사 인터뷰 전사본", "전력망 확충 회의록"].map((src, idx) => (
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

      {/* 팩트체크 사전 기사 검증률 모달 (사이드 패널이 비활성화된 상태일 때만 독립 모달로 동작) */}
      {showCheckModal && activeSidePanel !== "factcheck" && (
        <ArticleCheckModal
          isOpen={true}
          article={article}
          summary={factCheckSummary}
          onClose={() => setShowCheckModal(false)}
          onStartCheck={() => {
            setShowCheckModal(false);
            setActiveSidePanel("factcheck");
            setShowFactMarks(true);
            startFullCheck();
          }}
        />
      )}

      {/* 저장 이력 및 이전 저장본 복원 모달 */}
      <VersionHistoryModal
        isOpen={showHistoryModal}
        articleId={article.articleId}
        onClose={() => setShowHistoryModal(false)}
        onRestore={(draft, result) => {
          // Core 가 복원해 새 최신 저장본으로 올린 원고를 화면에 반영한다.
          const subtitle = draft.subtitle ?? "";
          setArticle((prev) => ({
            ...prev,
            title: draft.title ?? prev.title,
            subtitle,
            content: typeof draft.content === "string" ? draft.content : (draft.bodyHtml || prev.content),
            revisionNo: result.revisionNo
          }));
          const lines = subtitle.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 4);
          setSubtitles((lines.length ? lines : [""]).map((text, i) => ({ id: `sub-${i}-${Date.now()}`, text, locked: false })));
        }}
      />

    </div>
  );
}
