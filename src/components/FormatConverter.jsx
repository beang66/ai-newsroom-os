import React, { useState, useRef, useEffect } from "react";
import {
  Check,
  Plus,
  Trash2,
  X,
  ArrowRight,
  Download,
  Loader2,
  Image as ImageIcon,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Lock,
  Unlock,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Palette,
  Wand2,
  FileText,
  BookOpen,
  ChevronRight,
  Copy,
  Printer,
  Move
} from "lucide-react";
import { searchUnsplashPhotos } from "../services/unsplash";

export default function FormatConverter({ currentArticle: _currentArticle }) {
  // 현재 작성 중인 기사 데이터 연동 및 동기화
  const [activeArticle, setActiveArticle] = useState(() => {
    try {
      const saved = localStorage.getItem("team01_article_draft_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ..._currentArticle,
          title: parsed.title || _currentArticle?.title,
          subtitle: parsed.subtitle || _currentArticle?.subtitle,
          content: parsed.content || _currentArticle?.content,
          category: parsed.category || _currentArticle?.category || "사회",
          photos: parsed.photos || _currentArticle?.photos || [],
          status: _currentArticle?.status || "작성 중"
        };
      }
    } catch {}
    return _currentArticle || {
      title: "AI 반도체 개척자들... 초거대 AI 시대의 차세대 주도권 경쟁",
      subtitle: "국내 주요 반도체 기업, NPU 및 PIM 기술로 글로벌 시장에 도전장",
      content: "",
      category: "사회",
      status: "작성 중",
      photos: []
    };
  });

  useEffect(() => {
    if (_currentArticle) {
      setActiveArticle((prev) => ({
        ...prev,
        ..._currentArticle
      }));
    }
  }, [_currentArticle]);

  // ⭐ 기사 전문 보기 모달 상태 (사용자 요구: 플랫폼 변환 메인박스 왼쪽 상단 작성 중 기사 박스 및 전문 열람)
  const [showFullArticleModal, setShowFullArticleModal] = useState(false);
  const [fullArticleCopied, setFullArticleCopied] = useState(false);

  // ESC 키로 전문 보기 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && showFullArticleModal) {
        setShowFullArticleModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showFullArticleModal]);

  // 기사 전문 전체 복사 핸들러
  const handleCopyFullArticle = () => {
    const fullText = `${activeArticle.title || ""}\n\n${activeArticle.subtitle ? activeArticle.subtitle + "\n\n" : ""}${activeArticle.content || ""}`;
    navigator.clipboard.writeText(fullText);
    setFullArticleCopied(true);
    setTimeout(() => setFullArticleCopied(false), 2000);
  };

  // 핵심 리드문 (첫 단락) 추출
  const leadParagraph = activeArticle.content
    ? activeArticle.content.split(/\n\n+/).filter(Boolean)[0]?.replace(/\[사진 삽입:.*?\]/g, "").trim()
    : "";

  // 1. 배포 플랫폼 선택 상태 (다중 선택 가능)
  const [selectedPlatforms, setSelectedPlatforms] = useState(["instagram", "threads"]);
  const togglePlatform = (id) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  // 2. 초기 카드 데이터 (필드별 서식 및 고정 기능 내장)
  const defaultStyles = {
    tag: {
      fontSize: 13,
      color: "#A1A1AA",
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrike: false,
      align: "left",
      isLocked: false
    },
    title: {
      fontSize: 28,
      color: "#FFFFFF",
      isBold: true,
      isItalic: false,
      isUnderline: false,
      isStrike: false,
      align: "left",
      isLocked: false
    },
    body: {
      fontSize: 14,
      color: "#E4E4E7",
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrike: false,
      align: "left",
      isLocked: false
    }
  };

  const initialCards = [
    {
      id: 1,
      role: "표지",
      tag: "콘텐츠 제작",
      title: "하나의 기사,\n여러 개의 이야기",
      body: "사용자가 방향을 선택하고\nAI가 초안 제작을 돕습니다.",
      bgImage: null,
      fieldPositions: { tag: "top", title: "center", body: "bottom" },
      positions: { tag: { x: 50, y: 16 }, title: { x: 50, y: 48 }, body: { x: 50, y: 80 } },
      freePositions: { tag: { x: 50, y: 16 }, title: { x: 50, y: 48 }, body: { x: 50, y: 80 } },
      styles: JSON.parse(JSON.stringify(defaultStyles))
    },
    {
      id: 2,
      role: "본문",
      tag: "콘텐츠 제작",
      title: "핵심 키워드는\n내가 직접 선택",
      body: "클릭으로 방향을 선택하면\n생성된 3장 초안을 자유롭게 수정합니다.",
      bgImage: null,
      fieldPositions: { tag: "top", title: "center", body: "bottom" },
      positions: { tag: { x: 50, y: 16 }, title: { x: 50, y: 48 }, body: { x: 50, y: 80 } },
      freePositions: { tag: { x: 50, y: 16 }, title: { x: 50, y: 48 }, body: { x: 50, y: 80 } },
      styles: JSON.parse(JSON.stringify(defaultStyles))
    },
    {
      id: 3,
      role: "본문",
      tag: "콘텐츠 제작",
      title: "읽고, 고치고,\n완성하기",
      body: "좋은 기사를 완성할 때,\n내가 원하는 속도로 완성합니다.",
      bgImage: null,
      fieldPositions: { tag: "top", title: "center", body: "bottom" },
      positions: { tag: { x: 50, y: 16 }, title: { x: 50, y: 48 }, body: { x: 50, y: 80 } },
      freePositions: { tag: { x: 50, y: 16 }, title: { x: 50, y: 48 }, body: { x: 50, y: 80 } },
      styles: JSON.parse(JSON.stringify(defaultStyles))
    }
  ];

  const [cards, setCards] = useState(initialCards);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const activeCard = cards[activeCardIndex] || cards[0];

  // 구간별 텍스트 포커스/선택 상태 ('tag' | 'title' | 'body' | null)
  const [activeField, setActiveField] = useState("title");
  const [hoveredField, setHoveredField] = useState(null);
  const [focusedField, setFocusedField] = useState(null); // 실시간 텍스트 타이핑/수정 중인 필드
  const [isMouseOverActiveZone, setIsMouseOverActiveZone] = useState(false); // 활성 텍스트 + 툴바 영역 마우스 오버 여부

  // 자유 배치 모드 토글 상태
  const [isFreeLayoutMode, setIsFreeLayoutMode] = useState(false);

  // 인스타그램 스토리 스타일 자유 배치 중앙 가이드 스냅 상태
  const [isSnappedX, setIsSnappedX] = useState(false);
  const [isSnappedY, setIsSnappedY] = useState(false);
  const [dragCurrentPos, setDragCurrentPos] = useState(null); // 실시간 드래그 좌표 { x, y }

  // 마우스 드래그 추적 상태 (상중하 구역 스냅 & 자유 배치)
  const cardRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedField, setDraggedField] = useState(null); // 'tag' | 'title' | 'body'
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [dragTargetZone, setDragTargetZone] = useState(null); // 'top' | 'center' | 'bottom'

  // 팔레트 팝오버 및 AI 메뉴 드롭다운 상태
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);

  // 저장 시간 상태 (LocalStorage 연동)
  const [lastSavedTime, setLastSavedTime] = useState(() => {
    try {
      const saved = localStorage.getItem("team01_news_card_draft");
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.savedAt || null;
      }
    } catch {
      return null;
    }
    return null;
  });

  // 배포 성공 모달 상태
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);

  // 토스트 메시지 상태
  const [toastMessage, setToastMessage] = useState("");
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2200);
  };

  // 내 사진 파일 업로드 ref
  const fileInputRef = useRef(null);

  // Unsplash 검색 모달 상태
  const [showUnsplashModal, setShowUnsplashModal] = useState(false);
  const [unsplashQuery, setUnsplashQuery] = useState("콘텐츠 제작");
  const [unsplashResults, setUnsplashResults] = useState([]);
  const [isUnsplashLoading, setIsUnsplashLoading] = useState(false);
  const [unsplashError, setUnsplashError] = useState("");

  // 현재 활성 카드의 속성 업데이트
  const updateActiveCard = (field, value) => {
    setCards((prev) =>
      prev.map((c, idx) => (idx === activeCardIndex ? { ...c, [field]: value } : c))
    );
  };

  // 현재 활성 카드의 특정 구간(tag/title/body) 스타일 업데이트
  const updateFieldStyle = (field, key, value) => {
    setCards((prev) =>
      prev.map((c, idx) => {
        if (idx !== activeCardIndex) return c;
        const currentStyles = c.styles || JSON.parse(JSON.stringify(defaultStyles));
        const fieldStyle = currentStyles[field] || defaultStyles[field];
        return {
          ...c,
          styles: {
            ...currentStyles,
            [field]: {
              ...fieldStyle,
              [key]: value
            }
          }
        };
      })
    );
  };


  // 잠금 (Lock/Unlock) 토글
  const toggleFieldLock = (targetField) => {
    const f = targetField || activeField;
    const currentStyles = activeCard.styles || defaultStyles;
    const isLocked = !!(currentStyles[f] || defaultStyles[f]).isLocked;
    updateFieldStyle(f, "isLocked", !isLocked);
    showToast(
      !isLocked
        ? `🔒 ${f === "tag" ? "상단" : f === "title" ? "중간" : "하단"} 영역이 잠겼습니다.`
        : `🔓 잠금이 해제되었습니다.`
    );
  };

  // ⭐ 통합 텍스트 좌표 조회 및 업데이트 (자유 배치 토글 시에도 위치가 변하지 않도록 일원화)
  const getFieldPosition = (card, field) => {
    if (card?.positions?.[field]) return card.positions[field];
    if (card?.freePositions?.[field]) return card.freePositions[field];
    if (field === "tag") return { x: 50, y: 16 };
    if (field === "title") return { x: 50, y: 48 };
    return { x: 50, y: 80 };
  };

  const updateFieldPosition = (field, newPos) => {
    setCards((prev) =>
      prev.map((card, idx) => {
        if (idx !== activeCardIndex) return card;
        const currentPositions = card.positions || {
          tag: { x: 50, y: 16 },
          title: { x: 50, y: 48 },
          body: { x: 50, y: 80 }
        };
        return {
          ...card,
          positions: {
            ...currentPositions,
            [field]: newPos
          },
          freePositions: {
            ...(card.freePositions || {}),
            [field]: newPos
          }
        };
      })
    );
  };

  // ⭐ 개별 텍스트 구역 조회 및 업데이트
  const getFieldZone = (field) => {
    return activeCard.fieldPositions?.[field] || (field === "tag" ? "top" : field === "title" ? "center" : "bottom");
  };

  const updateFieldZone = (field, newZone) => {
    setCards((prev) =>
      prev.map((card, idx) => {
        if (idx !== activeCardIndex) return card;
        const currentPositions = card.fieldPositions || { tag: "top", title: "center", body: "bottom" };
        return {
          ...card,
          fieldPositions: {
            ...currentPositions,
            [field]: newZone
          }
        };
      })
    );
  };

  // ⭐ 마우스 드래그를 통한 상·중·하 개별 이동 및 자유 이동 핸들러 (인스타그램 스토리 스타일 가이드 지원)
  const handleStartFieldDrag = (e, field) => {
    const fieldStyle = (activeCard.styles || defaultStyles)[field] || defaultStyles[field];
    if (fieldStyle.isLocked) {
      // 잠금 상태에서도 클릭하여 선택하고 툴바(잠금 해제 버튼)를 띄울 수 있도록 허용
      setActiveField(field);
      setIsMouseOverActiveZone(true);
      return;
    }

    // 만약 이미 포커스되어 수정 중인 상태에서 input/textarea 내부를 클릭했다면 기본 타이핑 동작 허용
    if (focusedField === field && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) {
      return;
    }

    const startX = e.clientX;
    const startY = e.clientY;
    let didDrag = false;

    const handleMouseMove = (moveEvent) => {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (distance > 4) {
        if (!didDrag) {
          didDrag = true;
          setIsDragging(true);
          setDraggedField(field);
        }
        setMousePos({ x: moveEvent.clientX, y: moveEvent.clientY });

        if (cardRef.current) {
          const rect = cardRef.current.getBoundingClientRect();
          if (isFreeLayoutMode) {
            // 자유 배치 모드: 마우스 위치에 맞춰 실시간 좌표 계산 + 인스타그램 스토리 중앙 가이드라인 스냅
            let relX = Math.max(12, Math.min(88, Math.round(((moveEvent.clientX - rect.left) / rect.width) * 100)));
            let relY = Math.max(10, Math.min(90, Math.round(((moveEvent.clientY - rect.top) / rect.height) * 100)));

            const snapThreshold = 3.5;
            let snappedX = false;
            let snappedY = false;

            // X축 중앙 (50%) 스냅 감지
            if (Math.abs(relX - 50) <= snapThreshold) {
              relX = 50;
              snappedX = true;
            }
            // Y축 중앙 (50%) 스냅 감지
            if (Math.abs(relY - 50) <= snapThreshold) {
              relY = 50;
              snappedY = true;
            }

            setIsSnappedX(snappedX);
            setIsSnappedY(snappedY);
            setDragCurrentPos({ x: relX, y: relY });
          } else {
            // 틀 맞춤 (스냅) 모드
            const relY = moveEvent.clientY - rect.top;
            const height = rect.height;
            if (relY < height * 0.35) {
              setDragTargetZone("top");
            } else if (relY < height * 0.68) {
              setDragTargetZone("center");
            } else {
              setDragTargetZone("bottom");
            }
          }
        }
      }
    };

    const handleMouseUp = (upEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      if (didDrag) {
        if (cardRef.current) {
          const rect = cardRef.current.getBoundingClientRect();
          if (isFreeLayoutMode) {
            let finalX = Math.max(12, Math.min(88, Math.round(((upEvent.clientX - rect.left) / rect.width) * 100)));
            let finalY = Math.max(10, Math.min(90, Math.round(((upEvent.clientY - rect.top) / rect.height) * 100)));
            if (Math.abs(finalX - 50) <= 3.5) finalX = 50;
            if (Math.abs(finalY - 50) <= 3.5) finalY = 50;

            updateFieldPosition(field, { x: finalX, y: finalY });
            showToast(`✨ ${field === "tag" ? "태그" : field === "title" ? "제목" : "본문"}가 자유 위치로 이동되었습니다`);
          } else {
            const relY = upEvent.clientY - rect.top;
            const height = rect.height;
            const targetZone = relY < height * 0.35 ? "top" : relY < height * 0.68 ? "center" : "bottom";
            const zoneY = targetZone === "top" ? 16 : targetZone === "center" ? 48 : 80;
            updateFieldPosition(field, { x: 50, y: zoneY });
            updateFieldZone(field, targetZone);
            showToast(`📍 ${field === "tag" ? "태그" : field === "title" ? "제목" : "본문"}가 ${targetZone === "top" ? "상단" : targetZone === "center" ? "중간" : "하단"} 구역으로 이동되었습니다`);
          }
        }
        setIsDragging(false);
        setDraggedField(null);
        setDragTargetZone(null);
        setDragCurrentPos(null);
        setIsSnappedX(false);
        setIsSnappedY(false);
      } else {
        // 단순 클릭: 텍스트 박스 선택 및 포커스, 툴바 노출
        setActiveField(field);
        setFocusedField(field);
        setIsMouseOverActiveZone(true);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // ⭐ 상단/중간/하단 틀 맞춤 및 문구 설정 프리셋
  const handleApplyPlacementPreset = (pos) => {
    updateActiveCard("contentPosition", pos);
    let newPositions = {
      tag: { x: 50, y: 16 },
      title: { x: 50, y: 48 },
      body: { x: 50, y: 80 }
    };
    if (pos === "top") {
      newPositions = { tag: { x: 50, y: 14 }, title: { x: 50, y: 28 }, body: { x: 50, y: 44 } };
    } else if (pos === "center") {
      newPositions = { tag: { x: 50, y: 34 }, title: { x: 50, y: 48 }, body: { x: 50, y: 64 } };
    } else if (pos === "bottom") {
      newPositions = { tag: { x: 50, y: 56 }, title: { x: 50, y: 70 }, body: { x: 50, y: 84 } };
    }

    setCards((prev) =>
      prev.map((c, idx) =>
        idx === activeCardIndex
          ? {
              ...c,
              contentPosition: pos,
              fieldPositions: { tag: pos, title: pos, body: pos },
              positions: newPositions,
              freePositions: newPositions
            }
          : c
      )
    );
    if (pos === "top") setActiveField("tag");
    else if (pos === "center") setActiveField("title");
    else if (pos === "bottom") setActiveField("body");
    showToast(`📐 ${pos === "top" ? "상단" : pos === "center" ? "중간" : "하단"} 틀에 맞춰 정렬 및 설정되었습니다.`);
  };

  // AI 텍스트 다듬기 변환 프리셋 실행
  const handleApplyAiPreset = (presetType) => {
    const currentText = activeCard[activeField] || "";
    let newText = currentText;

    if (activeField === "title") {
      switch (presetType) {
        case "refine":
          newText = "하나의 기사,\n무한한 인사이트의 시작";
          break;
        case "hook":
          newText = "초거대 AI 시대,\n단 하나의 질문이 바꾼다";
          break;
        case "formal":
          newText = "디지털 뉴스룸 혁신,\n차세대 콘텐츠 아키텍처";
          break;
        case "summarize":
          newText = "기사 한 편으로\n완성하는 멀티 카드";
          break;
        default:
          break;
      }
    } else if (activeField === "body") {
      switch (presetType) {
        case "refine":
          newText = "방향만 정하면 인공지능이 최적의 흐름을 제안하고,\n원하는 스타일로 손쉽게 다듬을 수 있습니다.";
          break;
        case "hook":
          newText = "기획부터 배포까지 걸리는 시간 단 3분,\n지금 바로 달라진 작업 방식을 경험해보세요.";
          break;
        case "formal":
          newText = "정밀한 분석 알고리즘을 토대로\n고품질 카드 뉴스 초안을 체계적으로 생성합니다.";
          break;
        case "summarize":
          newText = "핵심 키워드 추출과 초안 자동 생성을 통해\n신속한 배포를 지원합니다.";
          break;
        default:
          break;
      }
    } else {
      newText = presetType === "formal" ? "심층 기획 리포트" : "AI 트렌드 인사이트";
    }

    updateActiveCard(activeField, newText);
    setShowAiMenu(false);
    showToast("✨ AI가 텍스트를 최적화하여 다듬었습니다.");
  };

  // 새 카드 추가
  const handleAddCard = () => {
    const newId = Date.now();
    const newCard = {
      id: newId,
      role: "본문",
      tag: "콘텐츠 제작",
      title: "새 카드 제목",
      body: "내용을 입력하세요.",
      bgImage: null,
      fieldPositions: { tag: "top", title: "center", body: "bottom" },
      positions: { tag: { x: 50, y: 16 }, title: { x: 50, y: 48 }, body: { x: 50, y: 80 } },
      freePositions: { tag: { x: 50, y: 16 }, title: { x: 50, y: 48 }, body: { x: 50, y: 80 } },
      styles: JSON.parse(JSON.stringify(defaultStyles))
    };
    setCards((prev) => [...prev, newCard]);
    setActiveCardIndex(cards.length);
    setActiveField("title");
    showToast("새 카드가 추가되었습니다.");
  };

  // 카드 삭제
  const handleDeleteCard = (idx, e) => {
    e.stopPropagation();
    if (cards.length <= 1) {
      showToast("최소 1장의 카드는 유지되어야 합니다.");
      return;
    }
    const newCards = cards.filter((_, i) => i !== idx);
    setCards(newCards);
    if (activeCardIndex >= newCards.length) {
      setActiveCardIndex(newCards.length - 1);
    }
    showToast("카드가 삭제되었습니다.");
  };

  // 내 사진 업로드
  const handleUploadLocalImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const imageUrl = uploadEvent.target?.result;
      updateActiveCard("bgImage", imageUrl);
      showToast("내 사진이 카드 배경으로 적용되었습니다.");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // 검정 배경으로 변경
  const handleResetBlackBg = () => {
    updateActiveCard("bgImage", null);
    showToast("검정 배경으로 변경되었습니다.");
  };

  // Unsplash 사진 검색
  const handleSearchUnsplash = async (queryToSearch) => {
    const q = queryToSearch || unsplashQuery;
    if (!q.trim()) return;
    setIsUnsplashLoading(true);
    setUnsplashError("");
    try {
      const data = await searchUnsplashPhotos(q, 1, 16);
      setUnsplashResults(data.results || []);
      if (!data.results || data.results.length === 0) {
        setUnsplashError(`"${q}"에 대한 검색 결과가 없습니다.`);
      }
    } catch (err) {
      setUnsplashError(err.message || "사진 검색 중 오류가 발생했습니다.");
    } finally {
      setIsUnsplashLoading(false);
    }
  };

  // Unsplash 사진 선택 적용
  const handleSelectUnsplashPhoto = (photoUrl) => {
    updateActiveCard("bgImage", photoUrl);
    setShowUnsplashModal(false);
    showToast("Unsplash 사진이 카드 배경으로 적용되었습니다.");
  };

  // 저장하기 핸들러
  const handleSave = () => {
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setLastSavedTime(timeStr);
      const draft = {
        cards,
        selectedPlatforms,
        activeCardIndex,
        savedAt: timeStr
      };
      localStorage.setItem("team01_news_card_draft", JSON.stringify(draft));
      showToast(`저장되었습니다. (${timeStr})`);
    } catch {
      showToast("저장에 실패했습니다.");
    }
  };

  // 배포하기 핸들러
  const handlePublish = () => {
    setIsPublishModalOpen(true);
  };

  // 현재 카드 JPG 다운로드 (HTML Canvas 1080x1350)
  const handleDownloadCard = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const currentStyles = activeCard.styles || defaultStyles;
    const tagStyle = currentStyles.tag || defaultStyles.tag;
    const titleStyle = currentStyles.title || defaultStyles.title;
    const bodyStyle = currentStyles.body || defaultStyles.body;

    const renderTextAndDownload = () => {
      // 그라데이션 오버레이
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, "rgba(0, 0, 0, 0.45)");
      grad.addColorStop(0.5, "rgba(0, 0, 0, 0.2)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0.85)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 태그 렌더링
      ctx.fillStyle = tagStyle.color || "#A1A1AA";
      ctx.font = `${tagStyle.isItalic ? "italic " : ""}${tagStyle.isBold ? "bold " : "normal "}${tagStyle.fontSize * 2.5}px sans-serif`;
      ctx.textAlign = tagStyle.align || "left";
      const tagX = tagStyle.align === "center" ? 540 : tagStyle.align === "right" ? 1000 : 80;
      ctx.fillText(activeCard.tag || "콘텐츠 제작", tagX, 860);

      // 제목 렌더링
      ctx.fillStyle = titleStyle.color || "#FFFFFF";
      ctx.font = `${titleStyle.isItalic ? "italic " : ""}${titleStyle.isBold ? "bold " : "normal "}${titleStyle.fontSize * 2.2}px sans-serif`;
      ctx.textAlign = titleStyle.align || "left";
      const titleX = titleStyle.align === "center" ? 540 : titleStyle.align === "right" ? 1000 : 80;
      const titleLines = (activeCard.title || "").split("\n");
      titleLines.forEach((line, idx) => {
        ctx.fillText(line, titleX, 940 + idx * 76);
      });

      // 본문 렌더링
      ctx.fillStyle = bodyStyle.color || "#E4E4E7";
      ctx.font = `${bodyStyle.isItalic ? "italic " : ""}${bodyStyle.isBold ? "bold " : "normal "}${bodyStyle.fontSize * 2.4}px sans-serif`;
      ctx.textAlign = bodyStyle.align || "left";
      const bodyX = bodyStyle.align === "center" ? 540 : bodyStyle.align === "right" ? 1000 : 80;
      const bodyLines = (activeCard.body || "").split("\n");
      const startY = 940 + titleLines.length * 76 + 25;
      bodyLines.forEach((line, idx) => {
        ctx.fillText(line, bodyX, startY + idx * 48);
      });

      // 다운로드 링크 트리거
      const link = document.createElement("a");
      link.download = `news-card-${activeCardIndex + 1}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
      showToast(`${activeCardIndex + 1}번 카드가 다운로드되었습니다.`);
    };

    if (activeCard.bgImage) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const hRatio = canvas.width / img.width;
        const vRatio = canvas.height / img.height;
        const ratio = Math.max(hRatio, vRatio);
        const centerShiftX = (canvas.width - img.width * ratio) / 2;
        const centerShiftY = (canvas.height - img.height * ratio) / 2;
        ctx.drawImage(
          img,
          0,
          0,
          img.width,
          img.height,
          centerShiftX,
          centerShiftY,
          img.width * ratio,
          img.height * ratio
        );
        renderTextAndDownload();
      };
      img.onerror = () => {
        ctx.fillStyle = "#18181B";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        renderTextAndDownload();
      };
      img.src = activeCard.bgImage;
    } else {
      ctx.fillStyle = "#18181B";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      renderTextAndDownload();
    }
  };

  // 컬러 팔레트 목록
  const colorPalette = [
    { label: "화이트", value: "#FFFFFF" },
    { label: "웜 앰버", value: "#F4A940" },
    { label: "라이트 골드", value: "#FDE68A" },
    { label: "에메랄드", value: "#6EE7B7" },
    { label: "스카이 블루", value: "#93C5FD" },
    { label: "소프트 로즈", value: "#FCA5A5" },
    { label: "실버 그레이", value: "#A1A1AA" }
  ];

  // ────────────────────────────────────────────────────────
  // ⭐ 해당 텍스트 박스 바로 위에 뜨는 플로팅 텍스트 툴바 컴포넌트
  // 텍스트 박스를 누르면 바가 올라오고, 마우스가 인터랙션 영역을 완전히 벗어나면 그라데이션으로 부드럽게 사라짐
  // ────────────────────────────────────────────────────────
  const renderFloatingToolbar = (field) => {
    const isVisible = activeField === field && isMouseOverActiveZone;
    const fStyle = (activeCard.styles || defaultStyles)[field] || defaultStyles[field];

    return (
      <div
        className={`absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out select-none ${
          isVisible
            ? "opacity-100 translate-y-0 scale-100 pointer-events-auto filter-none"
            : "opacity-0 translate-y-2 scale-95 pointer-events-none filter blur-[2px]"
        }`}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setIsMouseOverActiveZone(true)}
      >
        {/* 마우스가 텍스트 박스에서 툴바로 이동할 때 연결을 유지해주는 투명 히트 브릿지 */}
        <div className="absolute inset-x-0 -bottom-3.5 h-4 pointer-events-auto" />
        <div className="bg-gradient-to-r from-white/95 via-white/90 to-white/95 backdrop-blur-xl rounded-xl border border-white/80 shadow-[0_12px_36px_rgba(0,0,0,0.18)] px-2.5 py-1 flex items-center gap-1.5 transition-all">
          {/* 1. 폰트 크기 조절 (16 ↑↓) */}
          <div className="flex items-center gap-1 pl-1">
            <span className="text-[11px] font-bold font-mono text-[#292B2F] min-w-[18px] text-center">
              {fStyle.fontSize}
            </span>
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => updateFieldStyle(field, "fontSize", Math.min(64, fStyle.fontSize + 2))}
                className="p-0.5 text-stone-500 hover:text-black cursor-pointer"
                title="글자 크기 키우기"
              >
                <ChevronUp className="w-2.5 h-2.5 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={() => updateFieldStyle(field, "fontSize", Math.max(10, fStyle.fontSize - 2))}
                className="p-0.5 text-stone-500 hover:text-black cursor-pointer"
                title="글자 크기 줄이기"
              >
                <ChevronDown className="w-2.5 h-2.5 stroke-[2.5]" />
              </button>
            </div>
          </div>

          <div className="h-3.5 w-px bg-stone-200" />

          {/* 2. 글자 색상 선택 (A & Palette) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-stone-100 text-xs font-black cursor-pointer transition"
              title="글자 색상 변경"
              style={{ color: fStyle.color }}
            >
              <span className="underline decoration-2">A</span>
              <Palette className="w-3 h-3 text-stone-500" />
            </button>

            {showColorPicker && (
              <div className="absolute bottom-full mb-2 left-0 z-50 bg-white/95 backdrop-blur-xl rounded-2xl p-2 shadow-2xl border border-stone-200/80 flex gap-1.5 animate-smooth-pop">
                {colorPalette.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      updateFieldStyle(field, "color", item.value);
                      setShowColorPicker(false);
                    }}
                    className="w-5 h-5 rounded-full border border-stone-300 shadow-2xs hover:scale-110 transition-transform cursor-pointer"
                    style={{ backgroundColor: item.value }}
                    title={item.label}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="h-3.5 w-px bg-stone-200" />

          {/* 3. 서식: Bold, Italic, Underline, Strikethrough */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => updateFieldStyle(field, "isBold", !fStyle.isBold)}
              className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${
                fStyle.isBold ? "bg-stone-900 text-white font-black" : "text-stone-700 hover:bg-stone-100"
              }`}
              title="굵게 (Bold)"
            >
              <Bold className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => updateFieldStyle(field, "isItalic", !fStyle.isItalic)}
              className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${
                fStyle.isItalic ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"
              }`}
              title="기울임 (Italic)"
            >
              <Italic className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => updateFieldStyle(field, "isUnderline", !fStyle.isUnderline)}
              className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${
                fStyle.isUnderline ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"
              }`}
              title="밑줄 (Underline)"
            >
              <Underline className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => updateFieldStyle(field, "isStrike", !fStyle.isStrike)}
              className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${
                fStyle.isStrike ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"
              }`}
              title="취소선 (Strikethrough)"
            >
              <Strikethrough className="w-3 h-3" />
            </button>
          </div>

          <div className="h-3.5 w-px bg-stone-200" />

          {/* 4. 텍스트 정렬 */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => updateFieldStyle(field, "align", "left")}
              className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${
                fStyle.align === "left" ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"
              }`}
              title="왼쪽 정렬"
            >
              <AlignLeft className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => updateFieldStyle(field, "align", "center")}
              className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${
                fStyle.align === "center" ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"
              }`}
              title="가운데 정렬"
            >
              <AlignCenter className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => updateFieldStyle(field, "align", "right")}
              className={`w-6 h-6 rounded flex items-center justify-center text-xs transition cursor-pointer ${
                fStyle.align === "right" ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"
              }`}
              title="오른쪽 정렬"
            >
              <AlignRight className="w-3 h-3" />
            </button>
          </div>

          <div className="h-3.5 w-px bg-stone-200" />

          {/* 5. AI 마법사 / 다듬기 버튼 (화이트 글씨 & 솔리드 블랙) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAiMenu(!showAiMenu)}
              className="bg-[#18181B] hover:bg-black text-white px-2 py-0.5 rounded-lg text-[11px] font-black flex items-center gap-1 shadow-xs cursor-pointer transition active:scale-95"
              title="AI 문구 다듬기"
            >
              <Sparkles className="w-3 h-3 text-white" />
              <span className="text-white">AI</span>
            </button>

            {/* AI 드롭다운 메뉴 */}
            {showAiMenu && (
              <div className="absolute bottom-full mb-2 right-0 z-50 bg-white/95 backdrop-blur-xl rounded-xl p-2 shadow-2xl border border-white/80 w-44 space-y-1 animate-smooth-pop">
                <div className="text-[10px] font-mono text-stone-600 px-2 py-1 font-bold">
                  AI 텍스트 최적화
                </div>
                <button
                  type="button"
                  onClick={() => handleApplyAiPreset("refine")}
                  className="w-full px-2.5 py-1.5 text-left rounded-lg hover:bg-stone-100 text-xs font-medium flex items-center gap-2 cursor-pointer transition"
                >
                  <Wand2 className="w-3.5 h-3.5 text-stone-500" />
                  <span>더 매력적으로 다듬기</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyAiPreset("hook")}
                  className="w-full px-2.5 py-1.5 text-left rounded-lg hover:bg-stone-100 text-xs font-medium flex items-center gap-2 cursor-pointer transition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>헤드라인 강화</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyAiPreset("formal")}
                  className="w-full px-2.5 py-1.5 text-left rounded-lg hover:bg-stone-100 text-xs font-medium flex items-center gap-2 cursor-pointer transition"
                >
                  <Check className="w-3.5 h-3.5 text-stone-500" />
                  <span>전문적인 어조</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyAiPreset("summarize")}
                  className="w-full px-2.5 py-1.5 text-left rounded-lg hover:bg-stone-100 text-xs font-medium flex items-center gap-2 cursor-pointer transition"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-stone-500" />
                  <span>핵심 요약</span>
                </button>
              </div>
            )}
          </div>

          <div className="h-3.5 w-px bg-stone-200" />

          {/* ⭐ 6. 잠금 및 잠금 해제 버튼: 오른쪽 맨 끝에 위치 */}
          <button
            type="button"
            onClick={() => toggleFieldLock(field)}
            className={`px-2 py-1 rounded-lg flex items-center gap-1 transition cursor-pointer text-xs font-bold ${
              fStyle.isLocked
                ? "bg-[#F4A940] hover:bg-[#E59830] text-white shadow-xs font-black ring-1 ring-[#E59830]"
                : "text-stone-500 hover:text-black hover:bg-stone-100"
            }`}
            title={fStyle.isLocked ? "클릭하여 잠금 해제" : "영역 잠금"}
          >
            {fStyle.isLocked ? (
              <>
                <Lock className="w-3.5 h-3.5 stroke-[2.5]" />
                <span className="text-[11px] font-bold">잠금 해제</span>
              </>
            ) : (
              <Unlock className="w-3.5 h-3.5 stroke-[2]" />
            )}
          </button>
        </div>
      </div>
    );
  };

  // ────────────────────────────────────────────────────────
  // ⭐ 개별 텍스트 블록 렌더링 컴포넌트
  // 텍스트가 있는 범위에만 테두리가 타이트하게 감싸지도록 (인스타그램 스토리 스티커 스타일)
  // ────────────────────────────────────────────────────────
  const renderField = (field) => {
    const s = (activeCard.styles || defaultStyles)[field] || defaultStyles[field];
    const isEditing = focusedField === field;
    const isSelected = activeField === field;
    const isBeingDragged = isDragging && draggedField === field;

    return (
      <div
        key={field}
        onMouseDown={(e) => handleStartFieldDrag(e, field)}
        onClick={() => {
          setActiveField(field);
          setIsMouseOverActiveZone(true);
        }}
        onMouseEnter={() => {
          setHoveredField(field);
          if (activeField === field) {
            setIsMouseOverActiveZone(true);
          }
        }}
        onMouseLeave={(e) => {
          // 커서가 텍스트 박스와 툴바 영역을 완전히 벗어났을 때만 바가 사라지도록 처리
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsMouseOverActiveZone(false);
            setShowColorPicker(false);
            setShowAiMenu(false);
          }
        }}
        className={`relative inline-flex flex-col items-center w-fit max-w-[92%] p-2 rounded-xl transition-all ${
          s.isLocked
            ? "cursor-pointer opacity-85 ring-1 ring-amber-400/50 bg-amber-500/5 hover:ring-amber-400"
            : isBeingDragged
            ? isFreeLayoutMode
              ? "cursor-grabbing ring-2 ring-[#0095F6] border border-dashed border-[#0095F6] bg-[#0095F6]/15 shadow-xl scale-[1.03]"
              : "cursor-grabbing ring-2 ring-[#F4A940] border border-dashed border-[#F4A940] bg-[#F4A940]/15 shadow-xl scale-[1.03]"
            : isEditing
            ? isFreeLayoutMode
              ? "cursor-text ring-1 ring-[#0095F6] bg-white/10"
              : "cursor-text ring-1 ring-white/60 bg-white/10"
            : isSelected
            ? isFreeLayoutMode
              ? "cursor-grab active:cursor-grabbing ring-1.5 ring-[#0095F6] border border-dashed border-[#0095F6]/80 bg-[#0095F6]/5 shadow-md"
              : "cursor-grab active:cursor-grabbing ring-1.5 ring-[#F4A940] border border-dashed border-[#F4A940]/60 bg-white/5 shadow-md"
            : isFreeLayoutMode
            ? "cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-[#0095F6]/40 hover:bg-white/5"
            : "cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-white/25 hover:bg-white/5"
        } ${isBeingDragged ? "z-40" : ""}`}
      >
        {/* 텍스트 박스 바로 위에 뜨는 툴바 */}
        {renderFloatingToolbar(field)}

        {/* 필드별 입력 엘리먼트 (텍스트 길이에 딱 맞게 테두리가 감싸지도록 CSS Grid Auto-fit 적용) */}
        {field === "tag" ? (
          <div className="relative inline-grid items-center justify-center min-w-[50px] max-w-full">
            {/* 텍스트 폭을 정확하게 측정해주는 고스트 엘리먼트 */}
            <span
              aria-hidden="true"
              className="invisible col-start-1 row-start-1 px-2.5 py-0.5 whitespace-pre select-none pointer-events-none tracking-tight text-center"
              style={{
                fontSize: `${s.fontSize}px`,
                fontWeight: s.isBold ? "bold" : "normal",
                fontStyle: s.isItalic ? "italic" : "normal",
                textAlign: s.align,
                fontFamily: "inherit"
              }}
            >
              {activeCard.tag || "콘텐츠 제작"}
            </span>
            <input
              type="text"
              disabled={s.isLocked}
              value={activeCard.tag || ""}
              onFocus={() => {
                setActiveField("tag");
                setFocusedField("tag");
                setIsMouseOverActiveZone(true);
              }}
              onBlur={() => setFocusedField(null)}
              onChange={(e) => updateActiveCard("tag", e.target.value)}
              placeholder="콘텐츠 제작"
              style={{
                color: s.color,
                fontSize: `${s.fontSize}px`,
                fontWeight: s.isBold ? "bold" : "normal",
                fontStyle: s.isItalic ? "italic" : "normal",
                textDecoration: `${s.isUnderline ? "underline " : ""}${s.isStrike ? "line-through" : ""}`.trim() || "none",
                textAlign: s.align
              }}
              className={`col-start-1 row-start-1 w-full bg-transparent outline-none px-2.5 py-0.5 tracking-tight text-center transition ${
                s.isLocked ? "cursor-pointer" : isEditing ? "cursor-text select-text" : "cursor-grab"
              }`}
            />
            {s.isLocked && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFieldLock(field);
                }}
                className="absolute -right-8 top-1/2 -translate-y-1/2 text-amber-300 hover:text-white bg-black/85 hover:bg-[#F4A940] transition-all px-1.5 py-0.5 rounded-full flex items-center gap-1 cursor-pointer shadow-md ring-1 ring-amber-400/60 text-[9px] font-bold z-20"
                title="클릭하여 잠금 해제"
              >
                <Lock className="w-2.5 h-2.5 stroke-[2.5]" />
                <span>해제</span>
              </button>
            )}
          </div>
        ) : field === "title" ? (
          <div className="relative inline-grid items-center justify-center min-w-[70px] max-w-full">
            {/* 줄바꿈 및 글자 폭을 완벽하게 반영하는 고스트 엘리먼트 */}
            <span
              aria-hidden="true"
              className="invisible col-start-1 row-start-1 px-2.5 py-1 whitespace-pre-wrap break-words select-none pointer-events-none leading-tight tracking-tight text-center"
              style={{
                fontSize: `${s.fontSize}px`,
                fontWeight: s.isBold ? "bold" : "normal",
                fontStyle: s.isItalic ? "italic" : "normal",
                textAlign: s.align,
                fontFamily: "inherit"
              }}
            >
              {(activeCard.title || "하나의 기사,\n여러 개의 이야기") + " "}
            </span>
            <textarea
              rows={activeCard.title ? activeCard.title.split("\n").length : 2}
              disabled={s.isLocked}
              value={activeCard.title || ""}
              onFocus={() => {
                setActiveField("title");
                setFocusedField("title");
                setIsMouseOverActiveZone(true);
              }}
              onBlur={() => setFocusedField(null)}
              onChange={(e) => updateActiveCard("title", e.target.value)}
              placeholder="하나의 기사,\n여러 개의 이야기"
              style={{
                color: s.color,
                fontSize: `${s.fontSize}px`,
                fontWeight: s.isBold ? "bold" : "normal",
                fontStyle: s.isItalic ? "italic" : "normal",
                textDecoration: `${s.isUnderline ? "underline " : ""}${s.isStrike ? "line-through" : ""}`.trim() || "none",
                textAlign: s.align
              }}
              className={`col-start-1 row-start-1 w-full h-full bg-transparent outline-none resize-none px-2.5 py-1 leading-tight tracking-tight text-center transition ${
                s.isLocked ? "cursor-pointer" : isEditing ? "cursor-text select-text" : "cursor-grab"
              }`}
            />
            {s.isLocked && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFieldLock(field);
                }}
                className="absolute -top-3 -right-3 text-amber-300 hover:text-white bg-black/85 hover:bg-[#F4A940] transition-all px-2 py-0.5 rounded-full flex items-center gap-1 cursor-pointer shadow-md ring-1 ring-amber-400/60 text-[10px] font-bold z-20"
                title="클릭하여 잠금 해제"
              >
                <Lock className="w-2.5 h-2.5 stroke-[2.5]" />
                <span>잠금 해제</span>
              </button>
            )}
          </div>
        ) : (
          <div className="relative inline-grid items-center justify-center min-w-[70px] max-w-full">
            <span
              aria-hidden="true"
              className="invisible col-start-1 row-start-1 px-2.5 py-1 whitespace-pre-wrap break-words select-none pointer-events-none leading-relaxed tracking-tight text-center"
              style={{
                fontSize: `${s.fontSize}px`,
                fontWeight: s.isBold ? "bold" : "normal",
                fontStyle: s.isItalic ? "italic" : "normal",
                textAlign: s.align,
                fontFamily: "inherit"
              }}
            >
              {(activeCard.body || "사용자가 방향을 선택하고\nAI가 초안 제작을 돕습니다.") + " "}
            </span>
            <textarea
              rows={activeCard.body ? activeCard.body.split("\n").length : 3}
              disabled={s.isLocked}
              value={activeCard.body || ""}
              onFocus={() => {
                setActiveField("body");
                setFocusedField("body");
                setIsMouseOverActiveZone(true);
              }}
              onBlur={() => setFocusedField(null)}
              onChange={(e) => updateActiveCard("body", e.target.value)}
              placeholder="사용자가 방향을 선택하고\nAI가 초안 제작을 돕습니다."
              style={{
                color: s.color,
                fontSize: `${s.fontSize}px`,
                fontWeight: s.isBold ? "bold" : "normal",
                fontStyle: s.isItalic ? "italic" : "normal",
                textDecoration: `${s.isUnderline ? "underline " : ""}${s.isStrike ? "line-through" : ""}`.trim() || "none",
                textAlign: s.align
              }}
              className={`col-start-1 row-start-1 w-full h-full bg-transparent outline-none resize-none px-2.5 py-1 leading-relaxed tracking-tight text-center transition ${
                s.isLocked ? "cursor-pointer" : isEditing ? "cursor-text select-text" : "cursor-grab"
              }`}
            />
            {s.isLocked && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFieldLock(field);
                }}
                className="absolute -top-3 -right-3 text-amber-300 hover:text-white bg-black/85 hover:bg-[#F4A940] transition-all px-2 py-0.5 rounded-full flex items-center gap-1 cursor-pointer shadow-md ring-1 ring-amber-400/60 text-[10px] font-bold z-20"
                title="클릭하여 잠금 해제"
              >
                <Lock className="w-2.5 h-2.5 stroke-[2.5]" />
                <span>잠금 해제</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full space-y-5 animate-fade-in text-[#292B2F]">
      {/* ──────────────────────────────────────────
          1. 최상단 헤더 바
          [NEWSROOM / CONTENT STUDIO]
          [뉴스 카드 편집실]
          [우측: 저장 시간 + 저장하기 버튼 + 배포하기 버튼]
         ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E7E2D9]">
        <div>
          <span className="text-[11px] font-mono tracking-widest text-stone-600 block uppercase font-bold">
            NEWSROOM / CONTENT STUDIO
          </span>
          <h2 className="text-xl md:text-2xl font-black text-[#292B2F] tracking-tight">
            뉴스 카드 편집실
          </h2>
        </div>

        {/* 저장 시간, 저장하기, 배포하기 버튼 그룹 */}
        <div className="flex items-center gap-2.5 flex-wrap justify-end">
          {/* 저장 시간 인디케이터 */}
          {lastSavedTime ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-stone-200 text-[11px] font-mono font-medium text-stone-600 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>저장 {lastSavedTime}</span>
            </div>
          ) : (
            <div className="text-[11px] font-mono text-stone-600 hidden sm:block px-2">
              저장 기록 없음
            </div>
          )}

          {/* 저장하기 버튼 (White Pill 스타일) */}
          <button
            type="button"
            onClick={handleSave}
            className="btn-pill-white gap-3 text-xs"
            title="현재 작업 내용을 저장합니다"
          >
            <span>저장하기</span>
            <span className="btn-pill-badge">
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </span>
          </button>

          {/* 배포하기 버튼 (Dark Pill 스타일) */}
          <button
            type="button"
            onClick={handlePublish}
            className="btn-pill-dark gap-3 text-xs"
            title="제작된 카드 뉴스를 최종 배포합니다"
          >
            <span>배포하기</span>
            <span className="btn-pill-badge">
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </span>
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────
          2. 3단 메인 작업 영역
         ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ──────── [좌측 패널 (lg:col-span-3)] ──────── */}
        <div className="lg:col-span-3 bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.02)] space-y-4">
          
          {/* ⭐ 1. 배포 플랫폼 선택 위: 기사 전문 보기 (박스 형태 없이 오픈형으로 배치) */}
          <div className="pb-3.5 border-b border-stone-200/60 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#F4A940]" />
                <span className="text-xs font-bold text-[#292929]">작성 중인 기사</span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                연동 중
              </span>
            </div>

            <p className="text-xs font-extrabold text-[#292929] line-clamp-2 leading-snug">
              {activeArticle.title || "제목 없는 기사"}
            </p>

            <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-[#666666]">
              <span className="font-bold text-[#008285] bg-[#E6F4F4] px-1.5 py-0.5 rounded-md">
                {activeArticle.category || "사회"}
              </span>
              <span>{activeArticle.content ? `${activeArticle.content.length.toLocaleString()}자` : "0자"}</span>
              <span>· 약 {Math.max(1, Math.ceil((activeArticle.content?.length || 0) / 500))}분</span>
            </div>

            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                setShowFullArticleModal(true);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#292929] hover:text-[#F4A940] transition-colors pt-0.5 cursor-pointer group"
              title="클릭 시 기사 전문 열람"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#F4A940]" />
              <span>기사 전문 보기</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#F4A940] group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* 2. 배포 플랫폼 선택 */}
          <div className="space-y-2 pb-3.5 border-b border-stone-200/60">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-[#292929]">배포 플랫폼 선택</h3>
              <span className="text-[10px] text-[#666666] font-medium">다중 선택</span>
            </div>

            <div className="space-y-1.5">
              {[
                { id: "instagram", label: "Instagram" },
                { id: "threads", label: "Threads" },
                { id: "blog", label: "Blog" }
              ].map((item) => {
                const isChecked = selectedPlatforms.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => togglePlatform(item.id)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2.5 transition cursor-pointer select-none text-left ${
                      isChecked
                        ? "bg-white border-[#292929] text-[#292929] shadow-2xs"
                        : "bg-white/60 border-stone-200/70 text-stone-600 hover:bg-white"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all ${
                        isChecked
                          ? "bg-[#292929] border-[#292929] text-white"
                          : "bg-white border-stone-300"
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            <p className="text-[10px] text-[#999999] leading-relaxed pt-0.5">
              Instagram 카드 규격으로 편집 중입니다.
            </p>
          </div>

          {/* 3. 선택한 카드의 사진 */}
          <div className="space-y-2 pb-3.5 border-b border-stone-200/60">
            <h3 className="text-xs font-black text-[#292929]">선택한 카드의 사진</h3>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowUnsplashModal(true);
                  if (unsplashResults.length === 0) {
                    handleSearchUnsplash(unsplashQuery);
                  }
                }}
                className="btn-pill-dark w-full text-xs"
              >
                <span>Unsplash 사진 검색</span>
                <span className="btn-pill-badge">
                  <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-pill-white w-full text-xs"
              >
                <span>내 사진 불러오기</span>
                <span className="btn-pill-badge">
                  <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                </span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleUploadLocalImage}
                className="hidden"
              />

              <button
                type="button"
                onClick={handleResetBlackBg}
                className="w-full py-2 px-3 bg-[#18181B] hover:bg-black text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
              >
                <span>검정 배경으로 변경</span>
              </button>
            </div>
          </div>

          {/* 4. 편집 안내 */}
          <div className="space-y-1">
            <h3 className="text-xs font-black text-[#292929]">편집 안내</h3>
            <p className="text-[11px] text-[#666666] leading-relaxed">
              수정할 텍스트를 누르면 플로팅 텍스트바가 열립니다. 서식 변경 및 <strong>고정(🔒)</strong>이 가능합니다.
            </p>
          </div>
        </div>

        {/* ──────── [중앙 패널 (lg:col-span-6)]: 카드 편집 캔버스 (스크롤 시 고정되어 따라오는 sticky 적용) ──────── */}
        <div className="lg:col-span-6 sticky top-4 self-start bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 p-5 md:p-6 shadow-[0_4px_24px_rgba(0,0,0,0.02)] flex flex-col justify-between space-y-4 relative z-10">
          {/* 상단 바: N번 카드 편집 + 4:5 1080 x 1350 */}
          {/* 상단 메타 바: 비율 & 상태 & 자유 배치 버튼 */}
          <div className="flex items-center justify-between pb-3 border-b border-stone-200/60 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs md:text-sm font-black text-[#292929]">
                {activeCardIndex + 1}번 카드 편집
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-medium">
                수정 중: {activeField === "tag" ? "태그" : activeField === "title" ? "제목" : "본문"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* ⭐ 카드뉴스 편집기능 오른쪽 상단 '자유 배치 편집' 버튼 */}
              <button
                type="button"
                onClick={() => {
                  setIsFreeLayoutMode(!isFreeLayoutMode);
                  showToast(
                    !isFreeLayoutMode
                      ? "✨ 자유 배치 모드가 활성화되었습니다. 위치 변경 없이 자유롭게 드래그하세요."
                      : "📐 틀 맞춤 모드로 전환되었습니다. 상·중·하 스냅으로 정렬됩니다."
                  );
                }}
                className={`px-3 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                  isFreeLayoutMode
                    ? "bg-[#0095F6] text-white shadow-sm ring-1 ring-[#0081D6]"
                    : "bg-white text-stone-700 hover:bg-stone-50 border border-stone-200 hover:text-black"
                }`}
                title={isFreeLayoutMode ? "상·중·하 틀 맞춤 모드로 전환" : "원하는 위치로 자유롭게 드래그하여 배치 (인스타그램 스토리 스타일)"}
              >
                <Move className="w-3.5 h-3.5" />
                <span>{isFreeLayoutMode ? "자유 배치 중" : "자유 배치 편집"}</span>
              </button>

              <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-stone-500 bg-stone-100 px-2.5 py-1 rounded-xl border border-stone-200/70">
                <span>4:5</span>
                <span>1080 × 1350</span>
              </div>
            </div>
          </div>

          {/* 중앙 카드 미리보기 (솔리드 블랙 4:5 비율 캔버스 - overflow-visible로 툴바 노출) */}
          <div className="py-6 flex items-center justify-center relative">
            <div
              ref={cardRef}
              className="w-full max-w-[430px] aspect-[4/5] rounded-2xl shadow-2xl relative select-none border border-zinc-900 transition-all overflow-visible"
            >
              {/* 내부 배경 및 그라데이션 레이어 (rounded & overflow-hidden) - 솔리드 블랙 유지 */}
              <div
                className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none"
                style={{
                  backgroundColor: activeCard.bgImage ? "transparent" : "#18181B",
                  backgroundImage: activeCard.bgImage ? `url(${activeCard.bgImage})` : "none",
                  backgroundSize: "cover",
                  backgroundPosition: "center"
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/85" />
              </div>

              {/* ⭐ 인스타그램 스토리 스타일 파란색 점선 중앙 가이드라인 (자유 배치 모드 드래그 시) */}
              {isFreeLayoutMode && isDragging && (
                <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none z-20">
                  {/* 수직 중앙선 (V-Center Line: 50%) */}
                  <div
                    className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 border-l-2 border-dashed transition-all duration-150 ${
                      isSnappedX
                        ? "border-[#0095F6] shadow-[0_0_14px_rgba(0,149,246,0.95)] opacity-100"
                        : "border-[#0095F6]/45 opacity-45"
                    }`}
                  />

                  {/* 수평 중앙선 (H-Center Line: 50%) */}
                  <div
                    className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed transition-all duration-150 ${
                      isSnappedY
                        ? "border-[#0095F6] shadow-[0_0_14px_rgba(0,149,246,0.95)] opacity-100"
                        : "border-[#0095F6]/45 opacity-45"
                    }`}
                  />

                  {/* 인스타그램 스타일 중앙 스냅 뱃지 알림 */}
                  {(isSnappedX || isSnappedY) && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#0095F6] text-white px-3 py-1 rounded-full text-[11px] font-black shadow-[0_4px_16px_rgba(0,149,246,0.5)] flex items-center gap-1.5 animate-smooth-pop">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      <span>
                        {isSnappedX && isSnappedY
                          ? "정중앙 맞춤 (Instagram Center)"
                          : isSnappedX
                          ? "수직 중앙선 맞춤"
                          : "수평 중앙선 맞춤"}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ⭐ 틀 맞춤 모드 시 마우스 드래그 중 실시간으로 나타나는 점선 가이드 박스 */}
              {!isFreeLayoutMode && (
                <div
                  className={`absolute inset-x-5 inset-y-5 pointer-events-none flex flex-col justify-between z-20 transition-all duration-300 ease-out ${
                    isDragging
                      ? "opacity-100 scale-100 pointer-events-none"
                      : "opacity-0 scale-95 pointer-events-none"
                  }`}
                >
                  <div
                    className={`h-24 rounded-xl border-2 border-dashed transition-all duration-300 ease-out flex items-center justify-center text-xs font-black ${
                      dragTargetZone === "top"
                        ? "border-[#F4A940] bg-[#F4A940]/25 text-[#F4A940] shadow-lg scale-[1.02]"
                        : "border-white/20 text-white/30"
                    }`}
                  >
                    <span>상단 배치 영역</span>
                  </div>
                  <div
                    className={`h-28 rounded-xl border-2 border-dashed transition-all duration-300 ease-out flex items-center justify-center text-xs font-black ${
                      dragTargetZone === "center"
                        ? "border-[#F4A940] bg-[#F4A940]/25 text-[#F4A940] shadow-lg scale-[1.02]"
                        : "border-white/20 text-white/30"
                    }`}
                  >
                    <span>중간 배치 영역</span>
                  </div>
                  <div
                    className={`h-24 rounded-xl border-2 border-dashed transition-all duration-300 ease-out flex items-center justify-center text-xs font-black ${
                      dragTargetZone === "bottom"
                        ? "border-[#F4A940] bg-[#F4A940]/25 text-[#F4A940] shadow-lg scale-[1.02]"
                        : "border-white/20 text-white/30"
                    }`}
                  >
                    <span>하단 배치 영역</span>
                  </div>
                </div>
              )}

              {/* ⭐ 텍스트 배치 영역 (자유배치 토글 여부와 무관하게 동일한 절대 좌표 렌더링 -> 토글 시 위치 점프 0) */}
              <div className="absolute inset-6 z-10 pointer-events-none">
                {["tag", "title", "body"].map((f) => {
                  const pos = getFieldPosition(activeCard, f);
                  const isThisDragging = isDragging && draggedField === f;
                  const currentPos = isThisDragging && dragCurrentPos ? dragCurrentPos : pos;
                  return (
                    <div
                      key={f}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto flex justify-center items-center"
                      style={{
                        left: `${currentPos.x}%`,
                        top: `${currentPos.y}%`,
                        zIndex: isThisDragging ? 40 : activeField === f ? 30 : 20
                      }}
                    >
                      {renderField(f)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 카드 하단 바 */}
          <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-[11px] text-stone-600 font-medium">
              수정됨 | 원문 재검수 필요 (검수 기능 연결 전)
            </span>

            <button
              type="button"
              onClick={handleDownloadCard}
              className="btn-pill-dark text-xs gap-3"
            >
              <span>현재 카드 JPG 다운로드</span>
              <span className="btn-pill-badge">
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
              </span>
            </button>
          </div>
        </div>

        {/* ──────── [우측 패널 (lg:col-span-3)]: 전체 카드 ──────── */}
        <div className="lg:col-span-3 bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 p-4 shadow-[0_4px_24px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[520px]">
          <div>
            {/* 전체 카드 헤더 + 앰버 원형 (+) 버튼 */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-200/60 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-[#292929]">전체 카드</span>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 bg-stone-100 text-stone-600 rounded-xl border border-stone-200/70">
                  {cards.length}장
                </span>
              </div>

              {/* 앰버 플러스 버튼 (+) */}
              <button
                type="button"
                onClick={handleAddCard}
                className="btn-circle-lemon"
                title="새 카드 추가"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* 카드 썸네일 수직 스택 */}
            <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
              {cards.map((c, idx) => {
                const isCurrent = idx === activeCardIndex;
                return (
                  <div
                    key={c.id || idx}
                    onClick={() => setActiveCardIndex(idx)}
                    className={`p-2 rounded-xl border transition-all select-none cursor-pointer flex flex-col gap-1.5 relative group ${
                      isCurrent
                        ? "bg-white/90 border-[#292929] ring-2 ring-[#292929]/20 shadow-xs"
                        : "bg-white/60 border-stone-200/70 hover:border-stone-400 hover:bg-white"
                    }`}
                  >
                    {/* 카드 삭제 버튼 (호버 시 표시) */}
                    {cards.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCard(idx, e)}
                        className="absolute top-2 right-2 z-10 w-6 h-6 rounded-lg bg-black/60 hover:bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="카드 삭제"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}

                    {/* 미니 썸네일 */}
                    <div
                      className="w-full aspect-[4/5] rounded-xl p-3 text-white flex flex-col justify-end overflow-hidden relative"
                      style={{
                        backgroundColor: c.bgImage ? "transparent" : "#18181B",
                        backgroundImage: c.bgImage ? `url(${c.bgImage})` : "none",
                        backgroundSize: "cover",
                        backgroundPosition: "center"
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80 pointer-events-none" />
                      <div className="relative z-10 space-y-0.5">
                        <p className="text-[9px] text-stone-400 font-medium truncate">
                          {c.tag || "콘텐츠 제작"}
                        </p>
                        <p className="text-[11px] font-black leading-snug line-clamp-2">
                          {c.title || "제목 없음"}
                        </p>
                        <p className="text-[9px] text-stone-300 leading-tight line-clamp-2">
                          {c.body || ""}
                        </p>
                      </div>
                    </div>

                    {/* 카드 라벨: N / 표지 or 본문 */}
                    <div className="text-[11px] font-bold text-stone-600 px-1 pt-0.5 flex items-center justify-between">
                      <span>{idx + 1} / {c.role || (idx === 0 ? "표지" : "본문")}</span>
                      {Object.values(c.styles || {}).some((s) => s.isLocked) && (
                        <Lock className="w-3 h-3 text-amber-500" title="고정된 텍스트 포함" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 하단: 카드 추가 버튼 (White Pill 스타일) */}
          <div className="pt-3 border-t border-stone-100 mt-2">
            <button
              type="button"
              onClick={handleAddCard}
              className="btn-pill-white w-full text-xs"
            >
              <span>카드 추가하기</span>
              <span className="btn-pill-badge">
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────
          3. Unsplash 사진 검색 모달
         ────────────────────────────────────────── */}
      {showUnsplashModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-smooth-in">
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col border border-white/80 animate-smooth-pop">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-stone-700" />
                <h3 className="text-sm font-black text-[#292B2F]">Unsplash 사진 검색</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUnsplashModal(false)}
                className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 검색창 */}
            <div className="flex gap-2">
              <input
                type="text"
                value={unsplashQuery}
                onChange={(e) => setUnsplashQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchUnsplash()}
                placeholder="검색할 키워드를 입력하세요 (예: 비즈니스, 기술, 미디어)"
                className="flex-1 px-4 py-2 border border-stone-200 rounded-full text-xs outline-none focus:border-[#292B2F]"
              />
              <button
                type="button"
                onClick={() => handleSearchUnsplash()}
                className="px-5 py-2 bg-[#292B2F] hover:bg-black text-white rounded-full text-xs font-bold transition cursor-pointer"
              >
                검색
              </button>
            </div>

            {/* 검색 결과 그리드 */}
            <div className="flex-1 overflow-y-auto min-h-[300px] border border-stone-100 rounded-2xl p-2">
              {isUnsplashLoading ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2 text-stone-400">
                  <Loader2 className="w-6 h-6 animate-spin text-stone-700" />
                  <span className="text-xs">사진을 불러오는 중...</span>
                </div>
              ) : unsplashError ? (
                <div className="flex flex-col items-center justify-center h-48 text-stone-400 text-xs">
                  {unsplashError}
                </div>
              ) : unsplashResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-stone-400 text-xs">
                  검색 결과가 없습니다. 다른 키워드를 입력해보세요.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {unsplashResults.map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => handleSelectUnsplashPhoto(photo.urls?.regular || photo.urls?.small)}
                      className="group relative aspect-[4/5] rounded-xl overflow-hidden border border-stone-200 hover:border-black transition-all cursor-pointer"
                    >
                      <img
                        src={photo.urls?.small || photo.urls?.regular}
                        alt={photo.alt_description || "사진"}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                        선택
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────
          4. 배포 성공 알림 모달
         ────────────────────────────────────────── */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 md:p-8 max-w-sm w-full shadow-2xl space-y-4 text-center border border-white/80 animate-float-in">
            <div className="w-12 h-12 rounded-xl bg-[#F4A940] text-white flex items-center justify-center mx-auto shadow-xs">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <h3 className="text-lg font-black text-[#292B2F]">배포가 완료되었습니다</h3>
            <p className="text-xs text-stone-600 leading-relaxed font-medium">
              선택한 플랫폼 규격({selectedPlatforms.join(", ")})에 맞춰 뉴스 카드 콘텐츠가 정상적으로 배포되었습니다.
            </p>
            <button
              type="button"
              onClick={() => setIsPublishModalOpen(false)}
              className="btn-pill-dark w-full justify-center text-xs"
            >
              <span>확인</span>
            </button>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────
          ⭐ 6. 기사 전문 보기 모달 (사용자 요구: 가로 2단락 구성 박스 & 헤더 상단 기준 화면 정가운데 배치)
         ────────────────────────────────────────── */}
      {showFullArticleModal && (
        <div
          className="fixed inset-0 z-50 bg-[#292B2F]/55 backdrop-blur-xs flex items-center justify-center p-4 pt-[74px] md:pt-[70px] animate-smooth-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowFullArticleModal(false);
          }}
        >
          <div
            className="bg-[#FAF8F5]/95 backdrop-blur-xl border border-white/80 rounded-2xl shadow-[0_24px_60px_-15px_rgba(41,43,47,0.35)] max-w-5xl w-full flex flex-col overflow-hidden animate-smooth-pop max-h-[82vh]"
          >
            {/* [모달 상단 헤더 바] */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E7E2D9] bg-white/70 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#292B2F] text-[#FAF8F5] flex items-center justify-center shadow-2xs">
                  <FileText className="w-4 h-4 text-[#F4A940]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-[#292B2F]">작성 중인 기사 전문</h3>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      실시간 연동 중
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8E8982]">
                    가로 2단 구성 · [좌측] 기사 개요 및 메타 단락 · [우측] 기사 전문 본문 단락
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyFullArticle}
                  className="px-3 py-1.5 bg-white hover:bg-[#F4F4F5] border border-[#E4E4E7] text-[#292B2F] rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="기사 전문 전체 복사"
                >
                  {fullArticleCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">복사됨!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#71717A]" />
                      <span>전문 복사</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="p-1.5 bg-white hover:bg-[#F4F4F5] border border-[#E4E4E7] text-[#52525B] hover:text-[#18181B] rounded-xl transition cursor-pointer shadow-2xs"
                  title="인쇄하기"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowFullArticleModal(false)}
                  className="p-1.5 hover:bg-[#E7E2D9] text-[#71717A] hover:text-[#18181B] rounded-xl transition cursor-pointer"
                  title="닫기 (ESC)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* [⭐ 본체: 가로로 2가지 단락이 되어있는 박스 형태] */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#E7E2D9] flex-1 overflow-hidden min-h-0">
              {/* ───────────────────────────────────
                  [가로 1번째 단락 - 좌측]: 내가 지금 어떤 기사를 작성중인지 (기사 개요, 메타데이터, 헤드라인, 사진, 리드문 요약)
                 ─────────────────────────────────── */}
              <div className="p-6 md:p-7 overflow-y-auto max-h-[calc(82vh-75px)] space-y-5 bg-[#FAF8F5]/80">
                {/* 1. 기사 정보 뱃지 및 카테고리 */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-[#292B2F] text-[#FAF8F5]">
                      {activeArticle.category || "사회"}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      {activeArticle.status || "작성 중"}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#8E8982]">
                    {activeArticle.updatedAt || "방금 수정"}
                  </span>
                </div>

                {/* 2. 기사 메인 헤드라인 제목 */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#8E8982]">
                    헤드라인 (기사 제목)
                  </span>
                  <h2 className="text-xl md:text-2xl font-black text-[#292B2F] leading-snug tracking-tight">
                    {activeArticle.title || "제목을 입력해주세요"}
                  </h2>
                  {activeArticle.subtitle && (
                    <p className="text-xs md:text-sm font-semibold text-[#57514A] leading-relaxed pt-1">
                      {activeArticle.subtitle}
                    </p>
                  )}
                </div>

                {/* 3. 대표 이미지 (있는 경우) */}
                {activeArticle.photos && activeArticle.photos.length > 0 && activeArticle.photos[0]?.url && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#8E8982]">
                      대표 보도사진
                    </span>
                    <div className="rounded-2xl overflow-hidden border border-[#E7E2D9] bg-white shadow-2xs">
                      <img
                        src={activeArticle.photos[0].url}
                        alt={activeArticle.photos[0].caption || "기사 대표 사진"}
                        className="w-full h-44 object-cover"
                      />
                      {activeArticle.photos[0].caption && (
                        <p className="text-[11.5px] text-[#71717A] p-2.5 bg-white border-t border-[#F4F4F5] leading-normal font-medium">
                          ▲ {activeArticle.photos[0].caption}
                          {activeArticle.photos[0].source && ` (${activeArticle.photos[0].source})`}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. 기사 핵심 리드문 (1단락/도입부 발췌 요약) */}
                <div className="bg-white p-4 rounded-2xl border border-[#E7E2D9] space-y-2 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#008285]">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>기사 핵심 리드문 (도입 단락 요약)</span>
                  </div>
                  <p className="text-xs text-[#57514A] leading-relaxed line-clamp-4">
                    {leadParagraph || "본문 내용이 작성되면 첫 도입 단락이 자동으로 리드문으로 요약됩니다."}
                  </p>
                </div>

                {/* 5. 기사 통계 지표 박스 */}
                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <div className="bg-white p-3 rounded-xl border border-[#E7E2D9] text-center shadow-2xs">
                    <div className="text-[10.5px] font-bold text-[#8E8982]">전체 글자 수</div>
                    <div className="text-base font-black text-[#292B2F] mt-0.5">
                      {activeArticle.content ? activeArticle.content.length.toLocaleString() : 0}자
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#E7E2D9] text-center shadow-2xs">
                    <div className="text-[10.5px] font-bold text-[#8E8982]">단락(문단) 수</div>
                    <div className="text-base font-black text-[#292B2F] mt-0.5">
                      {activeArticle.content ? activeArticle.content.split(/\n\n+/).filter(Boolean).length : 0}개
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-[#E7E2D9] text-center shadow-2xs">
                    <div className="text-[10.5px] font-bold text-[#8E8982]">예상 읽기 시간</div>
                    <div className="text-base font-black text-[#292B2F] mt-0.5">
                      약 {Math.max(1, Math.ceil((activeArticle.content?.length || 0) / 500))}분
                    </div>
                  </div>
                </div>

                {/* 6. 작성자 바이라인 & 연결 출처 */}
                <div className="flex items-center justify-between text-xs text-[#8E8982] pt-2 border-t border-[#E7E2D9]/70">
                  <span>작성: 김동아 기자 (디지털편집부)</span>
                  <span>출처 연계: {activeArticle.linkedSources?.length || 0}건</span>
                </div>
              </div>

              {/* ───────────────────────────────────
                  [가로 2번째 단락 - 우측]: 기사 전문 전체 본문 (포털/동아 표준 규격)
                 ─────────────────────────────────── */}
              <div className="p-6 md:p-7 overflow-y-auto max-h-[calc(82vh-75px)] space-y-4 bg-white">
                <div className="flex items-center justify-between pb-3 border-b border-[#F4F4F5]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#008285]" />
                    <h4 className="text-xs font-black text-[#292B2F] uppercase tracking-wider">
                      기사 본문 전문 (Full Text)
                    </h4>
                  </div>
                  <span className="text-[11px] text-[#8E8982] font-semibold">
                    동아일보 기사 표준 규격
                  </span>
                </div>

                <div className="text-[15.5px] leading-[1.88] text-[#27272A] space-y-4 font-sans">
                  {activeArticle.content ? (
                    activeArticle.content.split(/\n\n+/).map((paragraph, pIdx) => {
                      const trimmed = paragraph.trim();
                      if (!trimmed) return null;

                      const photoMatch = trimmed.match(/^\[사진 삽입:\s*(.*?)(?:\s*\(출처:\s*(.*?)\))?\]$/);
                      if (photoMatch) {
                        const caption = (photoMatch[1] || "").trim();
                        const matchedPhoto = activeArticle.photos?.find(p => p.caption === caption) || activeArticle.photos?.[0];
                        return (
                          <figure key={pIdx} className="my-5">
                            <div className="overflow-hidden bg-transparent rounded-lg">
                              {matchedPhoto?.url && (
                                <img src={matchedPhoto.url} alt={caption} className="w-full h-auto max-h-[420px] object-cover rounded-lg" />
                              )}
                            </div>
                            {caption && (
                              <figcaption className="mt-1.5 text-xs text-[#767676] text-center font-sans">
                                ▲ {caption}
                              </figcaption>
                            )}
                          </figure>
                        );
                      }

                      return (
                        <p key={pIdx} className="font-normal text-[#27272A] tracking-[-0.2px] text-justify leading-[1.88]">
                          {trimmed}
                        </p>
                      );
                    })
                  ) : (
                    <p className="text-stone-400 italic text-center py-10">
                      아직 작성된 본문 내용이 없습니다.
                    </p>
                  )}

                  {/* 바이라인 */}
                  {activeArticle.content && (
                    <div className="pt-6 mt-6 border-t border-[#F4F4F5] text-xs text-[#71717A] font-medium">
                      <p>김동아 기자 donga_reporter@donga.com</p>
                      <p className="text-[11px] text-[#A1A1AA] mt-0.5">
                        Copyright ⓒ 동아일보 & donga.com All rights reserved.
                      </p>
                    </div>
                  )}
                </div>

                {/* 하단 플랫폼 카드 편집 복귀 버튼 */}
                <div className="pt-4 border-t border-[#F4F4F5] flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setShowFullArticleModal(false)}
                    className="px-4 py-2 bg-[#292B2F] hover:bg-[#1F2124] text-[#FAF8F5] text-xs font-extrabold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span>플랫폼 카드 편집으로 돌아가기</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ⭐ 마우스 드래그 시 커서를 실시간으로 따라다니는 "위치 이동" 문구 뱃지 (드롭 시 깔끔하게 사라짐) */}
      {isDragging && (
        <div
          className={`fixed z-[99999] pointer-events-none -translate-x-1/2 -translate-y-full mb-3 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black shadow-2xl select-none animate-smooth-pop ${
            isFreeLayoutMode
              ? "bg-[#0095F6] text-white border border-white/60 shadow-[0_4px_20px_rgba(0,149,246,0.6)]"
              : "bg-[#18181B] text-[#F4A940] border border-[#F4A940]/50"
          }`}
          style={{
            left: mousePos.x,
            top: mousePos.y
          }}
        >
          <span className={`w-2 h-2 rounded-full ${isFreeLayoutMode ? "bg-white" : "bg-[#F4A940]"} animate-ping`} />
          <span>{isFreeLayoutMode ? "✨ 자유 위치 이동" : "위치 이동"}</span>
        </div>
      )}

      {/* ──────────────────────────────────────────
          5. 플로팅 토스트 알림
         ────────────────────────────────────────── */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#18181B] text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-xl border border-zinc-700 animate-bounce">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
