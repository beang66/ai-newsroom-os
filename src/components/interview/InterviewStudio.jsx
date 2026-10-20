import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { requestSTT, requestInterviewAnalysis, listStoredTranscripts, loadStoredTranscript, saveSpeakerEdits, saveTranscriptNotes, getTranscriptFolders, saveTranscriptFolders, deleteStoredTranscript, renameStoredTranscript } from "../../services/sttService";
import { SpeakerEditBar, SpeakerProfileMenu } from "./SpeakerProfiles.jsx";
import { BoxText, SelectionToolbar } from "./BoxTools.jsx";
import TranscriptFolderTree from "./TranscriptFolderTree.jsx";
import { readBoxSelection } from "../../lib/boxSelection.js";
import { createSpectrumState, runSpectrum } from "../../lib/audioSpectrum.js";
import { canMoveTranscriptFolder, moveTranscriptFolder, removeTranscriptFolder, transcriptFolderChildren } from "../../lib/transcriptFolders.js";

// 내보내기 결과는 화면에 띄우지 않고 헤더의 종 모양 알림으로 보낸다(Header.jsx 가 "newsroom:alert" 를 받는다)
const notifyHeader = (text, openKind) => window.dispatchEvent(new CustomEvent("newsroom:alert", { detail: { text, openKind } }));
import { exportFiles } from "../../api/editorial";
import SaveBar from "../SaveBar.jsx";
import { MARK_COLORS, addMark, applySpeakerEdits, assignByName, assignDialogues, buildBoxes, emptyEdits, isEdited, removeMarks, renameSpeakerSmart, resetSpeakers, sanitizeEdits, segmentsOf, setBoxText, speakerIndex, speakerList, speakerRoster } from "../../lib/speakerEdits.js";
import {
  Upload,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Copy,
  Check,
  Download,
  Search,
  FileText,
  Speech,
  ChevronDown,
  ArrowUpRight,
  Sparkles,
  RefreshCw,
  Volume2,
  VolumeX,
  StickyNote,
  FolderOpen,
  Folder,
  FolderPlus,
  ChevronRight,
  GripVertical,
  Trash2,
  X
} from "lucide-react";

// 초 단위를 '00:00:00' (시:분:초) 형태의 시각 문자열로 포맷팅
function formatDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// 오디오 스펙트럼 막대: 가운데가 가장 높고 양끝으로 갈수록 낮아지는 마름모 모양(가장자리는 흐려짐)
const SPECTRUM_BARS = Array.from({ length: 81 }, (_, index) => {
  const edge = Math.abs(index - 40) / 40; // 0(가운데) → 1(가장자리)
  const wobble = 0.82 + 0.18 * Math.abs(Math.sin(index * 12.9898)); // 막대마다 조금씩 다른 높이(항상 같은 값)
  return {
    height: Math.max(8, Math.round(100 * Math.pow(1 - edge, 1.2) * wobble)),
    fade: +(0.28 + 0.72 * Math.pow(1 - edge, 0.7)).toFixed(2)
  };
});

// 흔히 쓰이는 의미 없는 조사/접속사/일반 단어 (오탐 방지용 불용어)
const EVIDENCE_STOPWORDS = new Set([
  "그것", "이것", "저것", "우리는", "저희는", "그리고", "하지만", "그러나", "때문에",
  "대해서", "통해서", "이러한", "저러한", "있는", "없는", "하는", "되는", "대한",
  "위한", "관한", "경우", "생각", "오늘", "내일", "지금", "매우", "가장", "어떤",
  "있습니다", "합니다", "됩니다", "입니다", "것입니다", "있다고", "밝혔습니다"
]);

// 텍스트에서 2글자 이상의 의미 있는 단어 토큰 추출
function extractEvidenceTokens(text) {
  if (!text) return [];
  return text
    .replace(/[^\w가-힣\s]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !EVIDENCE_STOPWORDS.has(token));
}

// 안전 임계값 기반 가장 유력한 녹취 근거 박스 탐색 (단어 1개로 인한 엉뚱한 화면 튐 원천 차단)
function findBestEvidenceBox(allBoxes, queryText) {
  if (!queryText || !allBoxes?.length) return null;
  const trimmed = queryText.trim().toLowerCase();
  if (trimmed.length < 2) return null;

  // 1순위: 원문에 글자 전체가 그대로 포함된 경우 (Exact Match)
  const exact = allBoxes.find((box) => box.text.toLowerCase().includes(trimmed));
  if (exact) return exact;

  // 2순위: 핵심 단어 토큰 기반 스코어링 (Paraphrased 문장 대응)
  const tokens = extractEvidenceTokens(trimmed);
  // 단어가 1개 이하인데 전체 일치도 안 되었다면 오탐 방지를 위해 스크롤 이동 차단
  if (tokens.length < 2) return null;

  let bestBox = null;
  let maxScore = 0;

  for (const box of allBoxes) {
    const boxLower = box.text.toLowerCase();
    let matchCount = 0;
    for (const token of tokens) {
      if (boxLower.includes(token)) {
        matchCount++;
      }
    }
    const score = matchCount / tokens.length;
    // 안전 임계값: 핵심 단어가 최소 2개 이상 일치하고, 일치율이 50% 이상일 때만 유효 후보로 인정
    if (matchCount >= 2 && score >= 0.5 && score > maxScore) {
      maxScore = score;
      bestBox = box;
    }
  }

  return bestBox;
}

export default function InterviewStudio({ onReturnToArticle, onSave, accountId }) {
  // 1. 녹음 파일 및 인터뷰 상태
  const [audioUrl, setAudioUrl] = useState(null);
  // 저장된 전사를 다시 연 경우(원본 오디오 없음). 목록은 처음 펼칠 때 불러온다.
  const [storedSource, setStoredSource] = useState(null);
  const [storedMenu, setStoredMenu] = useState({ open: false, status: "idle", items: [], error: "" });
  const [storedQuery, setStoredQuery] = useState("");
  const [editingStoredId, setEditingStoredId] = useState(null);
  const [editingStoredTitle, setEditingStoredTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);

  // 1-1. STT 파일 보관함 폴더 및 드래그 앤 드롭 상태 관리
  const [folders, setFolders] = useState([]);
  const [fileFolderMap, setFileFolderMap] = useState({});
  const [folderStateOwner, setFolderStateOwner] = useState(null);

  const [openFolders, setOpenFolders] = useState({});
  const [viewOnlyFolders, setViewOnlyFolders] = useState(false);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 });
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingFolderName, setEditingFolderName] = useState("");

  // 폴더 구조는 현재 계정의 Core 암호화 저장소에서 불러온다.
  // 전역 localStorage를 쓰던 이전 버전 자료는 로그인한 첫 계정으로 한 번만 이전한다.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let result = await getTranscriptFolders();
      if ((result.folders?.length || 0) === 0 && Object.keys(result.fileFolderMap || {}).length === 0) {
        try {
          const legacyFolders = JSON.parse(localStorage.getItem("newsroom_stt_folders_v1") || "[]");
          const legacyMap = JSON.parse(localStorage.getItem("newsroom_stt_file_folder_map_v1") || "{}");
          if (Array.isArray(legacyFolders) && (legacyFolders.length || Object.keys(legacyMap || {}).length)) {
            result = await saveTranscriptFolders(legacyFolders, legacyMap || {});
            localStorage.removeItem("newsroom_stt_folders_v1");
            localStorage.removeItem("newsroom_stt_file_folder_map_v1");
          }
        } catch {
          // 손상된 레거시 값은 계정 저장소에 섞지 않는다.
        }
      }
      if (cancelled) return;
      setFolders(Array.isArray(result.folders) ? result.folders : []);
      setFileFolderMap(result.fileFolderMap && typeof result.fileFolderMap === "object" ? result.fileFolderMap : {});
      setOpenFolders({});
      setFolderStateOwner(accountId || "signed-out");
    };
    load().catch(() => {
      if (!cancelled) notifyHeader("폴더 구성을 불러오지 못했습니다. Core 연결을 확인해 주세요.");
    });
    return () => { cancelled = true; };
  }, [accountId]);

  useEffect(() => {
    if (folderStateOwner !== (accountId || "signed-out")) return undefined;
    const timer = setTimeout(() => {
      saveTranscriptFolders(folders, fileFolderMap).catch(() => {
        notifyHeader("폴더 구성을 저장하지 못했습니다. 다시 시도해 주세요.");
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [folders, fileFolderMap, folderStateOwner, accountId]);

  // 컨텍스트 메뉴 닫기 핸들러
  useEffect(() => {
    if (!contextMenu.visible) return;
    const handleCloseContext = () => setContextMenu({ visible: false, x: 0, y: 0 });
    window.addEventListener("click", handleCloseContext);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") handleCloseContext();
    });
    return () => {
      window.removeEventListener("click", handleCloseContext);
    };
  }, [contextMenu.visible]);

  // 새 폴더 생성 핸들러
  const handleCreateFolder = (name = "새 폴더") => {
    const newFolder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || "새 폴더",
      createdAt: new Date().toISOString(),
    };
    setFolders((prev) => [...prev, newFolder]);
    setOpenFolders((prev) => ({ ...prev, [newFolder.id]: true }));
    setEditingFolderId(newFolder.id);
    setEditingFolderName(newFolder.name);
    setContextMenu({ visible: false, x: 0, y: 0 });
  };

  // 폴더 이름 변경 저장
  const handleSaveRenameFolder = (folderId) => {
    const trimmed = editingFolderName.trim() || "새 폴더";
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f)));
    setEditingFolderId(null);
    setEditingFolderName("");
  };

  // 폴더 삭제 핸들러 (파일은 루트, 하위 폴더는 삭제한 폴더의 부모로 이동)
  const handleDeleteFolder = (e, folderId) => {
    e.stopPropagation();
    const folder = folders.find((f) => f.id === folderId);
    if (!window.confirm(`'${folder?.name || "폴더"}'을(를) 삭제하시겠습니까? (안에 있는 전사 파일은 보존됩니다)`)) return;
    const next = removeTranscriptFolder(folders, fileFolderMap, folderId);
    setFolders(next.folders);
    setFileFolderMap(next.fileFolderMap);
  };

  // 폴더 열림/접힘 토글
  const toggleFolderOpen = (folderId) => {
    setOpenFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  // 드롭 처리: 파일 또는 폴더를 특정 폴더로 이동
  const handleDropIntoFolder = (targetFolderId, dragData) => {
    if (!dragData) return;
    if (dragData.type === "file") {
      setFileFolderMap((prev) => ({
        ...prev,
        [dragData.id]: targetFolderId,
      }));
      setOpenFolders((prev) => ({ ...prev, [targetFolderId]: true }));
    } else if (dragData.type === "folder") {
      if (!canMoveTranscriptFolder(folders, dragData.id, targetFolderId)) return;
      setFolders((prev) => moveTranscriptFolder(prev, dragData.id, targetFolderId));
      setOpenFolders((prev) => ({ ...prev, [targetFolderId]: true }));
    }
    setDragOverFolderId(null);
  };

  // 파일을 폴더 밖(루트)으로 꺼내기
  const handleMoveFileToRoot = (e, fileId) => {
    e.stopPropagation();
    setFileFolderMap((prev) => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
  };

  const handleMoveFolderToRoot = (e, folderId) => {
    e.stopPropagation();
    setFolders((prev) => moveTranscriptFolder(prev, folderId));
  };

  // 보관함 우클릭 핸들러
  const handleArchiveContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  };

  // 저장된 전사 삭제 핸들러
  const handleDeleteStoredTranscript = async (e, item) => {
    e.stopPropagation();
    if (!window.confirm(`'${item.filename || "전사 파일"}'을(를) 삭제하시겠습니까?`)) return;
    try {
      await deleteStoredTranscript(item.id);
      setStoredMenu((prev) => ({
        ...prev,
        items: prev.items.filter((i) => i.id !== item.id),
      }));
      setFileFolderMap((prev) => {
        if (!prev[item.id]) return prev;
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      if (storedSource?.id === item.id || transcriptId === item.id) {
        setStoredSource(null);
        setTranscriptId(null);
        setFileName("");
        setFileSize(0);
        setBaseDialogues([]);
        setSpeakerEdits(emptyEdits);
        setCurrentTranscript(null);
        summaryRun.current += 1;
        savedNotes.current = { memo: "", summary: null, speakerNotes: {} };
        applyNotes(null);
        setAudioUrl(null);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
      }
    } catch (err) {
      alert(err.message || "삭제 중 오류가 발생했습니다.");
    }
  };

  // 저장된 전사 제목 변경 시작
  const handleStartRenameStored = (e, item) => {
    e.stopPropagation();
    setEditingStoredId(item.id);
    setEditingStoredTitle(item.filename || "");
  };

  // 저장된 전사 제목 변경 저장
  const handleSaveRenameStored = async (e, item) => {
    e.stopPropagation();
    const trimmed = editingStoredTitle.trim();
    if (!trimmed) {
      alert("변경할 제목을 입력해 주세요.");
      return;
    }
    try {
      await renameStoredTranscript(item.id, trimmed);
      setStoredMenu((prev) => ({
        ...prev,
        items: prev.items.map((i) => (i.id === item.id ? { ...i, filename: trimmed } : i)),
      }));
      if (storedSource?.id === item.id || transcriptId === item.id) {
        setFileName(trimmed);
        if (storedSource) setStoredSource((prev) => ({ ...prev, filename: trimmed }));
      }
      setEditingStoredId(null);
      setEditingStoredTitle("");
    } catch (err) {
      alert(err.message || "제목 변경 중 오류가 발생했습니다.");
    }
  };

  // 저장된 전사 제목 변경 취소
  const handleCancelRenameStored = (e) => {
    if (e) e.stopPropagation();
    setEditingStoredId(null);
    setEditingStoredTitle("");
  };
  // CLOVA 가 준 발언 원본. 화면에 쓰는 dialogues 는 여기에 사용자의 화자 수정(이름 바꾸기·합치기·구간 지정)을 덧씌운 것이다.
  const [baseDialogues, setBaseDialogues] = useState([]);
  const [speakerEdits, setSpeakerEdits] = useState(emptyEdits);
  const [transcriptId, setTranscriptId] = useState(null);
  const [speakerSave, setSpeakerSave] = useState("");
  const [pickedIds, setPickedIds] = useState([]);
  const [editMode, setEditMode] = useState(false); // 화자 수정하기: 재생을 멈추고 여러 단락을 골라 한 번에 바꾼다
  const [showUnifiedInSpeakerBox, setShowUnifiedInSpeakerBox] = useState(false); // 화자 구분 박스 영역에서 통합 텍스트로 전환 여부
  const [openParagraphId, setOpenParagraphId] = useState(null); // 프로필을 눌러 이름 입력칸이 열린 단락
  const [selection, setSelection] = useState(null); // 박스 글을 드래그해 선택한 곳(텍스트 수정바 위치)
  const [editingBoxId, setEditingBoxId] = useState(null); // 글 수정칸이 열린 박스
  const [editSelection, setEditSelection] = useState(null); // 수정칸을 열 때 미리 선택해 둘 글자 범위
  const dialogues = useMemo(() => applySpeakerEdits(baseDialogues, speakerEdits), [baseDialogues, speakerEdits]);
  const speakers = useMemo(() => speakerList(baseDialogues, speakerEdits), [baseDialogues, speakerEdits]);
  // 화자 고르기 목록: 고친 이름과 처음 CLOVA 가 붙인 이름이 함께 남는다
  const roster = useMemo(() => speakerRoster(baseDialogues, speakerEdits), [baseDialogues, speakerEdits]);
  // 화면의 화자 박스: CLOVA 가 나눈 박스(원래 화자가 같은 연속 발언)에 고친 이름·글·형광펜을 덧씌운 것.
  // 이름을 고치거나 같은 이름으로 바꿔도 박스는 그대로이고 이름만 바뀐다.
  const allBoxes = useMemo(() => buildBoxes(baseDialogues, speakerEdits), [baseDialogues, speakerEdits]);
  const boxesPlainText = () => allBoxes.map((box) => box.text.trim()).filter(Boolean).join(" ");
  const [sttStatus, setSttStatus] = useState("대기 중");
  const [currentTranscript, setCurrentTranscript] = useState(null);

  // 2. 검색 및 선택 상태
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedDialogueId, setSelectedDialogueId] = useState(null);

  // 3. 오디오 플레이어 상태
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);

  // 4. 복사 피드백 및 드래그 상태
  const [copiedId, setCopiedId] = useState(null);
  const [isAllCopied, setIsAllCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // 5. AI 요약 상태
  const [aiSummary, setAiSummary] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [isSummaryCopied, setIsSummaryCopied] = useState(false);

  // 6. 핵심요약 텍스트 드래그(선택) 기반 녹취 근거 하이라이트 상태
  const [evidenceQuery, setEvidenceQuery] = useState("");

  // 7. 화자 발언별 메모 및 전체 취재 메모장 상태
  const [speakerNotes, setSpeakerNotes] = useState({});
  const [activeMemoBoxId, setActiveMemoBoxId] = useState(null);
  const [overallMemo, setOverallMemo] = useState("");
  const [isMemoCopied, setIsMemoCopied] = useState(false);

  // 하단 전체 메모장 및 AI 핵심 요약 박스 드래그 앤 드롭 순서 관리
  const [panelOrder, setPanelOrder] = useState(["memo", "summary"]);
  const [draggingPanel, setDraggingPanel] = useState(null);
  const [dragOverPanel, setDragOverPanel] = useState(null);

  const handlePanelDrop = (targetPanel) => {
    if (draggingPanel && draggingPanel !== targetPanel) {
      setPanelOrder((prev) => (prev[0] === targetPanel ? [prev[1], prev[0]] : [...prev].reverse()));
    }
    setDraggingPanel(null);
    setDragOverPanel(null);
  };

  // 하단 우측 박스 사이 미니멀 리사이즈 바(크기 조절) 상태 및 핸들러
  const [rightSplitRatio, setRightSplitRatio] = useState(() => {
    try {
      const saved = localStorage.getItem("newsroom_interview_split_ratio");
      return saved ? parseFloat(saved) : 57; // 기본값 약 57% (4:3 비율)
    } catch {
      return 57;
    }
  });
  const [isResizing, setIsResizing] = useState(false);
  const rightSplitContainerRef = useRef(null);

  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleResetSplitRatio = () => {
    setRightSplitRatio(57);
    try {
      localStorage.setItem("newsroom_interview_split_ratio", "57");
    } catch {}
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      if (!rightSplitContainerRef.current) return;
      const rect = rightSplitContainerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const offsetX = e.clientX - rect.left;
      const newRatio = (offsetX / rect.width) * 100;
      // 각 패널 최소 20%, 최대 80%로 안전하게 너비 제한
      const clamped = Math.max(20, Math.min(80, newRatio));
      setRightSplitRatio(clamped);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      try {
        localStorage.setItem("newsroom_interview_split_ratio", rightSplitRatio.toString());
      } catch {}
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, rightSplitRatio]);

  // 전체 메모·발언 메모·AI 요약은 녹취 파일마다 코어(이 PC 의 암호화 저장소)에 따로 저장된다. 서버(Supabase)로는 보내지 않는다.
  // 메모는 자동으로 저장하지 않는다: 화면 아래 "저장하기" · Ctrl+S · 다른 전사로 옮길 때 뜨는 창의 "저장하기" 로 저장한다. AI 요약은 만들어지면 바로 저장한다.
  const summaryRun = useRef(0); // 파일을 옮길 때마다 올린다 — 요약을 만드는 동안 파일을 옮겼는지 가리는 표시
  const emptyNotes = () => ({ memo: "", summary: null, speakerNotes: {} });
  const isEmptyNotes = (notes) => !notes.memo.trim() && !notes.summary && !Object.keys(notes.speakerNotes).length;
  const latestNotes = useRef(emptyNotes()); // 화면에 있는 최신 메모·요약
  const savedNotes = useRef(emptyNotes()); // 마지막으로 저장했거나 불러온 내용 — 이것과 다르면 '저장하지 않은 변경'
  const legacyAdopted = useRef(false);
  const [notesSave, setNotesSave] = useState("");
  const [leavePrompt, setLeavePrompt] = useState(null); // 저장하지 않은 메모가 있는데 다른 전사로 옮기려 할 때 { go }
  const normalizeNotes = (notes) => ({ memo: notes?.memo || "", summary: notes?.summary || null, speakerNotes: notes?.speakerNotes || {} });
  const applyNotes = (notes) => {
    const next = normalizeNotes(notes);
    latestNotes.current = next;
    setOverallMemo(next.memo);
    setAiSummary(next.summary);
    setSpeakerNotes(next.speakerNotes);
  };
  // 예전에는 브라우저에 하나만 저장했다. 비어 있는 첫 녹취에 한 번 옮겨 보여 주고, 그 녹취를 저장하면 브라우저의 것을 지운다.
  const readLegacyNotes = () => {
    try {
      const memo = localStorage.getItem("newsroom_overall_memo") || "";
      const legacySpeakerNotes = JSON.parse(localStorage.getItem("newsroom_speaker_notes") || "{}");
      return memo.trim() || Object.keys(legacySpeakerNotes).length ? { memo, summary: null, speakerNotes: legacySpeakerNotes } : null;
    } catch {
      return null;
    }
  };
  const clearLegacyNotes = () => {
    try {
      localStorage.removeItem("newsroom_overall_memo");
      localStorage.removeItem("newsroom_speaker_notes");
    } catch {}
  };
  // 녹취를 열었을 때(serverNotes 있음)나 방금 전사를 마쳤을 때(없음 — 전사 중에 적은 메모를 이어 받는다)
  const startNotesFor = (_id, serverNotes) => {
    const saved = normalizeNotes(serverNotes);
    let next = serverNotes ? saved : latestNotes.current;
    const legacy = isEmptyNotes(next) ? readLegacyNotes() : null;
    legacyAdopted.current = Boolean(legacy);
    if (legacy) next = legacy;
    savedNotes.current = saved;
    applyNotes(next);
    setNotesSave("");
  };
  const notesDirty = () => Boolean(transcriptId) && JSON.stringify(latestNotes.current) !== JSON.stringify(savedNotes.current);
  const saveNotesNow = async () => {
    if (!transcriptId) return true;
    const payload = latestNotes.current;
    setNotesSave("saving");
    try {
      await saveTranscriptNotes(transcriptId, payload);
      savedNotes.current = payload;
      if (legacyAdopted.current) {
        clearLegacyNotes();
        legacyAdopted.current = false;
      }
      setNotesSave("saved");
      return true;
    } catch {
      setNotesSave("error");
      return false;
    }
  };
  // 저장하지 않은 메모가 있으면 다른 전사로 옮기기 전에 묻는다
  const guardLeave = (go) => {
    if (notesDirty()) setLeavePrompt({ go });
    else go();
  };

  const updateSpeakerNote = (boxId, text) => {
    const next = { ...latestNotes.current.speakerNotes };
    if (text.trim()) {
      next[boxId] = text;
    } else {
      delete next[boxId];
    }
    setSpeakerNotes(next);
    latestNotes.current = { ...latestNotes.current, speakerNotes: next };
  };

  const updateOverallMemo = (text) => {
    setOverallMemo(text);
    latestNotes.current = { ...latestNotes.current, memo: text };
  };

  const handleCopyOverallMemo = () => {
    if (!overallMemo.trim()) return;
    navigator.clipboard?.writeText(overallMemo);
    setIsMemoCopied(true);
    setTimeout(() => setIsMemoCopied(false), 2000);
  };

  // 메모장·AI 요약 TXT: 전사 TXT 와 같은 내보내기 폴더(내 문서\AI Newsroom\내보내기\녹취)에 저장된다. 이름 = <제목>-메모장 / <제목>-AI요약
  const exportNoteTxt = async (text, suffix) => {
    try {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const title = fileName ? fileName.replace(/\.[^/.]+$/, "") : "인터뷰";
      const saved = await exportFiles("transcripts", [{ data: blob, ext: "txt" }], { label: `${title}-${suffix}` });
      notifyHeader(`${saved.files.length}개 파일을 저장했어요: ${saved.folder}`, "transcripts");
    } catch (error) {
      notifyHeader(error?.message || String(error));
    }
  };
  const handleDownloadMemoTxt = () => {
    if (!overallMemo.trim()) return;
    void exportNoteTxt(overallMemo, "메모장");
  };

  const handleInsertUnifiedTextToMemo = () => {
    const fullText = allBoxes.map((box) => box.text).join("\n\n");
    if (!fullText) return;
    const separator = overallMemo.trim() ? "\n\n---\n[STT 전문 불러옴]\n" : "";
    updateOverallMemo(overallMemo + separator + fullText);
  };

  // 오디오 타이머 및 참조
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  // 스펙트럼: 재생 중인 소리의 진폭에 맞춰 막대 높이가 움직이고, 멈추면 원래 마름모 모양으로 돌아온다
  const spectrumBars = useRef([]);
  const spectrumState = useRef(createSpectrumState());
  useEffect(
    () => runSpectrum(spectrumState.current, audioRef.current, spectrumBars.current, SPECTRUM_BARS.map((bar) => bar.height), isPlaying),
    [isPlaying, audioUrl]
  );

  // 오디오 타이머 제어
  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000 / playbackSpeed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, duration, playbackSpeed]);

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  // 음량 조절
  const handleVolumeChange = (newVol) => {
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
    if (newVol > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (audioRef.current) audioRef.current.volume = volume || 1.0;
    } else {
      setIsMuted(true);
      if (audioRef.current) audioRef.current.volume = 0;
    }
  };

  // AI 요약 생성 함수
  const handleGenerateSummary = (transcriptObj, forId = transcriptId) => {
    const run = summaryRun.current;
    const target = transcriptObj || (currentTranscript ? { ...currentTranscript, text: boxesPlainText() || currentTranscript.text } : null); // 재분석은 고친 글로
    if (!target) return;
    setIsAnalyzing(true);
    setAnalysisError("");
    requestInterviewAnalysis(target)
      .then((res) => {
        setIsAnalyzing(false);
        if (run !== summaryRun.current) return; // 요약을 만드는 동안 다른 파일로 옮겼으면 그 파일에 붙이지 않는다
        setAiSummary(res);
        latestNotes.current = { ...latestNotes.current, summary: res };
        if (forId) {
          const payload = { ...savedNotes.current, summary: res };
          saveTranscriptNotes(forId, payload).then(() => { savedNotes.current = payload; }).catch(() => setNotesSave("error"));
        }
      })
      .catch((err) => {
        setAnalysisError(err?.message || "AI 요약 생성에 실패했습니다.");
        setIsAnalyzing(false);
      });
  };

  // 녹음 파일 처리 및 STT 요청 공통 함수
  const loadFileNow = (file) => {
    if (!file) return;
    summaryRun.current += 1;
    setStoredSource(null);
    setFileName(file.name);
    setFileSize(file.size || 0);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);

    setCurrentTime(0);
    setIsPlaying(false);

    setBaseDialogues([]);
    setSpeakerEdits(emptyEdits());
    setTranscriptId(null);
    setSpeakerSave("");
    setPickedIds([]);
    setEditMode(false);
    setOpenParagraphId(null);
    setEditingBoxId(null);
    setSelection(null);
    applyNotes(null);
    savedNotes.current = emptyNotes();
    setAnalysisError("");
    setEvidenceQuery("");
    setSttStatus("전사 진행 중…");

    requestSTT(file)
      .then((result) => {
        if (result.dialogues && result.dialogues.length > 0) {
          setBaseDialogues(result.dialogues);
          setTranscriptId(result.transcriptId || null);
          if (result.transcriptId) startNotesFor(result.transcriptId, null);
          setSelectedDialogueId(result.dialogues[0].id);
          setSttStatus("전사 완료 100%");
          if (result.transcript) {
            setCurrentTranscript(result.transcript);
            handleGenerateSummary(result.transcript, result.transcriptId);
          }
        } else {
          setSttStatus("전사 완료 (발언 없음)");
        }
      })
      .catch((error) => {
        setSttStatus("전사 실패: " + (error?.message || error));
      });
  };

  // 저장된 전사 목록 조회 함수
  const fetchStoredList = useCallback(async () => {
    setStoredMenu((prev) => ({ ...prev, status: "loading", error: "" }));
    try {
      const items = await listStoredTranscripts();
      setStoredMenu((prev) => ({ ...prev, status: "done", items }));
    } catch (error) {
      setStoredMenu((prev) => ({ ...prev, status: "error", items: [], error: error.message }));
    }
  }, []);

  // 컴포넌트 마운트 시 저장된 전사 목록 자동 불러오기
  useEffect(() => {
    fetchStoredList();
  }, [fetchStoredList]);

  // 저장된 전사 메뉴 토글
  const toggleStoredMenu = async () => {
    const open = !storedMenu.open;
    setStoredMenu((prev) => ({ ...prev, open }));
    if (open) fetchStoredList();
  };

  const openStoredNow = async (item) => {
    summaryRun.current += 1;
    setStoredMenu((prev) => ({ ...prev, open: false }));
    setSttStatus("저장된 전사를 여는 중…");
    try {
      const result = await loadStoredTranscript(item.id);
      setAudioUrl(result.audioUrl);
      setStoredSource(item);
      setFileName(item.filename || "저장된 전사");
      setFileSize(0);
      setCurrentTime(0);
      setDuration(result.duration || 0);
      setIsPlaying(false);
      setAiSummary(null);
      setAnalysisError("");
      setEvidenceQuery("");
      setBaseDialogues(result.dialogues);
      setSpeakerEdits(sanitizeEdits(result.speakerEdits));
      setTranscriptId(result.id || item.id);
      startNotesFor(result.id || item.id, result.notes || emptyNotes()); // 이 파일의 메모·AI 요약·발언 메모
      setSpeakerSave("");
      setPickedIds([]);
      setEditMode(false);
      setOpenParagraphId(null);
      setEditingBoxId(null);
      setSelection(null);
      setSelectedDialogueId(result.dialogues[0]?.id ?? null);
      setCurrentTranscript(result.transcript);
      setSttStatus(result.dialogues.length > 0 ? "저장된 전사 불러옴" : "저장된 전사 (발언 없음)");
    } catch (error) {
      setSttStatus("저장된 전사 열기 실패: " + (error?.message || error));
    }
  };

  // 파일 업로드 핸들러
  const processFile = (file) => guardLeave(() => loadFileNow(file));
  const openStoredTranscript = (item) => guardLeave(() => openStoredNow(item));

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // 드래그 앤 드롭 핸들러
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  // 화자 발언별 개별 복사
  const handleCopySentence = (id, text, speakerName) => {
    const formatted = `[${speakerName}]\n"${text}"`;
    navigator.clipboard.writeText(formatted);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // 통 텍스트 전체 복사
  const handleCopyAllText = () => {
    const fullText = boxesPlainText();
    navigator.clipboard.writeText(fullText);
    setIsAllCopied(true);
    setTimeout(() => setIsAllCopied(false), 2000);
  };

  // AI 요약 전체 복사
  const summaryText = () => [
    `[AI 핵심 요약]`,
    aiSummary.summary || "",
    "",
    `[주요 키워드]`,
    (aiSummary.keywords || []).map((k) => `#${k}`).join(" "),
    "",
    `[핵심 발언]`,
    ...(aiSummary.keyPoints || []).map((p, i) => `${i + 1}. ${p}`)
  ].join("\n");
  const handleDownloadSummaryTxt = () => {
    if (!aiSummary) return;
    void exportNoteTxt(summaryText(), "AI요약");
  };
  const handleCopySummaryAll = () => {
    if (!aiSummary) return;
    navigator.clipboard.writeText(summaryText());
    setIsSummaryCopied(true);
    setTimeout(() => setIsSummaryCopied(false), 2000);
  };

  // TXT 내보내기 → 내 문서\AI Newsroom\내보내기\녹취\YYYYMMDD_<녹음 파일 이름>_전사.txt
  const handleDownloadTxt = async () => {
    try {
      const blob = new Blob([boxesPlainText()], { type: "text/plain;charset=utf-8" });
      const label = `${fileName ? fileName.replace(/\.[^/.]+$/, "") : "interview"}_전사`;
      const saved = await exportFiles("transcripts", [{ data: blob, ext: "txt" }], { label });
      notifyHeader(`${saved.files.length}개 파일을 저장했어요: ${saved.folder}`, "transcripts");
    } catch (error) {
      notifyHeader(error?.message || String(error));
    }
  };

  // 재생/일시정지
  const handleTogglePlay = () => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // 오디오 오프셋 이동
  const handleSeekOffset = (seconds) => {
    if (!audioRef.current || !audioUrl) return;
    const target = Math.max(0, Math.min(currentTime + seconds, duration));
    setCurrentTime(target);
    audioRef.current.currentTime = target;
  };

  // 슬라이더 이동
  const handleSliderSeek = (e) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current && audioUrl) {
      audioRef.current.currentTime = val;
    }
  };

  // 파형을 누르거나 끌면 그 위치로 이동한다(재생 중이면 그대로 이어서 재생, 멈춰 있으면 위치만 옮긴다)
  const seekToFraction = (fraction) => {
    if (!(duration > 0)) return;
    const target = Math.max(0, Math.min(1, fraction)) * duration;
    setCurrentTime(target);
    if (audioRef.current && audioUrl) {
      audioRef.current.currentTime = target;
    }
  };
  const seekFromPointer = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pad = 16; // 파형 좌우 여백(px-4)
    const width = rect.width - pad * 2;
    if (width > 0) seekToFraction((e.clientX - rect.left - pad) / width);
  };

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  // 화자 선택 시 재생 및 우측 통합 텍스트 스크롤
  const handleSelectDialogue = (sec, id) => {
    setCurrentTime(sec);
    if (id) {
      setSelectedDialogueId(id);
      const targetEl = document.getElementById(`unified_text_${id}`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    if (audioRef.current && audioUrl) {
      audioRef.current.currentTime = sec;
      audioRef.current.play();
    }
    setIsPlaying(true);
  };

  // 핵심요약 텍스트 드래그(선택) 시 녹취 근거 자동 매칭 & 안전 임계값 기반 부드러운 자동 스크롤
  const handleSummaryTextSelection = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString()?.trim();
    if (selectedText && selectedText.length >= 2) {
      setEvidenceQuery(selectedText);
      // 안전 임계값(단어 1개 오탐 차단, 핵심 단어 2개 이상 & 일치도 50% 이상) 충족 시에만 매칭
      const matched = findBestEvidenceBox(allBoxes, selectedText);
      if (matched) {
        setSelectedDialogueId(matched.id);
        // 화자별 전사 카드 또는 통합 텍스트 문단 요소를 찾아 부드럽게 중앙으로 스크롤
        setTimeout(() => {
          const targetEl =
            document.getElementById(`speaker_segment_${matched.id}`) ||
            document.getElementById(`box_unified_text_${matched.id}`) ||
            document.getElementById(`unified_text_${matched.id}`);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 50);
      }
    }
  };

  // 현재 재생 중인 발언 식별
  const activeDialogueId = useMemo(() => {
    for (let i = dialogues.length - 1; i >= 0; i--) {
      if (currentTime >= dialogues[i].timestamp) {
        return dialogues[i].id;
      }
    }
    return dialogues[0]?.id || null;
  }, [currentTime, dialogues]);

  // 검색 필터 적용된 발언 목록
  // 검색은 박스 글과 화자 이름으로 거른다.
  const paragraphs = useMemo(() => {
    const query = searchKeyword.trim().toLowerCase();
    if (!query) return allBoxes;
    return allBoxes.filter((box) => box.text.toLowerCase().includes(query) || box.speakerName.toLowerCase().includes(query));
  }, [allBoxes, searchKeyword]);

  // 화자 수정: 화면에 바로 반영하고, 저장된 녹취면 코어 암호화 저장소에도 보낸다(발언 원본은 그대로 둔다)
  const persistSpeakerEdits = (next) => {
    setSpeakerEdits(next);
    if (!transcriptId) return;
    setSpeakerSave("saving");
    saveSpeakerEdits(transcriptId, next)
      .then(() => setSpeakerSave("saved"))
      .catch(() => setSpeakerSave("error"));
  };
  // Ctrl+Z / Ctrl+Y: 화자·글·형광펜 수정을 한 단계씩 되돌리거나 다시 적용한다(녹취를 새로 열면 기록이 비워진다)
  const editHistory = useRef({ base: null, undo: [], redo: [] });
  const historyOf = () => {
    if (editHistory.current.base !== baseDialogues) editHistory.current = { base: baseDialogues, undo: [], redo: [] };
    return editHistory.current;
  };
  const commitSpeakerEdits = (next) => {
    const history = historyOf();
    history.undo.push(speakerEdits);
    if (history.undo.length > 50) history.undo.shift();
    history.redo = [];
    persistSpeakerEdits(next);
  };
  const stepEditHistory = (redo) => {
    const history = historyOf();
    const [from, to] = redo ? [history.redo, history.undo] : [history.undo, history.redo];
    const target = from.pop();
    if (!target) return;
    to.push(speakerEdits);
    persistSpeakerEdits(target);
  };
  // STT 화면 단축키(입력칸 안에서는 브라우저 기본 동작을 그대로 둔다):
  //  Ctrl+Z / Ctrl+Y(Ctrl+Shift+Z) 수정 되돌리기·다시 하기, Ctrl+C 고른 박스 복사(글자를 드래그해 두었으면 그 글자),
  //  Ctrl+V 클립보드의 음성 파일 불러오기, F2 지금 열린 전사 제목 변경
  const shortcutRef = useRef(null);
  useEffect(() => {
    shortcutRef.current = {
      stepEditHistory,
      processFile,
      copyText: () => allBoxes.find((box) => box.ids.includes(selectedDialogueId))?.text || "",
      saveNotes: saveNotesNow,
      current: storedMenu.items.find((item) => storedSource?.id === item.id || transcriptId === item.id),
      renaming: Boolean(editingStoredId),
      startRename: handleStartRenameStored
    };
  });
  useEffect(() => {
    const isTyping = (target) => target instanceof HTMLElement
      && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const onKeyDown = (event) => {
      const act = shortcutRef.current;
      if (act && (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") void act.saveNotes();
      if (!act || isTyping(event.target) || event.defaultPrevented) return;
      if (event.key === "F2") {
        if (act.current && !act.renaming) {
          event.preventDefault();
          act.startRename(event, act.current);
        }
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") {
        event.preventDefault();
        act.stepEditHistory(key === "y" || event.shiftKey);
      } else if (key === "c") {
        if (window.getSelection()?.toString()) return; // 드래그해 둔 글자는 기본 복사
        const text = act.copyText();
        if (!text) return;
        event.preventDefault();
        navigator.clipboard?.writeText(text).catch(() => {});
      }
    };
    const onPaste = (event) => {
      const act = shortcutRef.current;
      const file = event.clipboardData?.files?.[0];
      if (!act || !file || isTyping(event.target)) return;
      if (/^(audio|video)\//.test(file.type) || /\.(mp3|m4a|wav|webm)$/i.test(file.name)) {
        event.preventDefault();
        act.processFile(file);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
    };
  }, []);
  const pickedDialogueIds = paragraphs.filter((paragraph) => pickedIds.includes(paragraph.id)).flatMap((paragraph) => paragraph.ids);
  const togglePicked = (id) => setPickedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  const startSpeakerEdit = () => {
    if (audioRef.current) audioRef.current.pause();
    setIsPlaying(false);
    setOpenParagraphId(null);
    setPickedIds([]);
    setEditMode(true);
  };
  const endSpeakerEdit = () => {
    setEditMode(false);
    setPickedIds([]);
  };
  const applyNameToPicked = (name) => {
    commitSpeakerEdits(assignByName(speakerEdits, speakers, pickedDialogueIds, name));
    setPickedIds([]);
  };
  const renameWholeSpeaker = (key, name) => {
    commitSpeakerEdits(renameSpeakerSmart(speakerEdits, speakers, key, name));
    setOpenParagraphId(null);
  };
  const pickSpeakerForParagraph = (ids, key) => {
    commitSpeakerEdits(assignDialogues(speakerEdits, ids, key));
    setOpenParagraphId(null);
  };

  // 텍스트 수정바: 왼쪽 박스의 글을 드래그하면 선택 위치 위에 형광펜·수정 막대가 뜬다
  useEffect(() => {
    const hide = () => setSelection(null);
    const onSelectionChange = () => {
      const current = window.getSelection();
      if (!current || current.isCollapsed) hide();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);
  const refreshSelection = () => setSelection(editMode ? null : readBoxSelection());
  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };
  const selectedBox = selection ? allBoxes.find((box) => box.id === selection.boxId) : null;
  const markSelection = (color) => {
    if (!selectedBox) return;
    commitSpeakerEdits(addMark(speakerEdits, selectedBox.id, selection.start, selection.end, color, selectedBox.text.length));
    clearSelection();
  };
  const unmarkSelection = () => {
    if (!selectedBox) return;
    commitSpeakerEdits(removeMarks(speakerEdits, selectedBox.id, selection.start, selection.end));
    clearSelection();
  };
  const startTextEdit = () => {
    if (!selectedBox) return;
    setEditSelection({ start: selection.start, end: selection.end });
    setEditingBoxId(selectedBox.id);
    clearSelection();
  };
  const saveBoxText = (box, value) => {
    commitSpeakerEdits(setBoxText(speakerEdits, box.id, value, box.originalText));
    setEditingBoxId(null);
  };

  // 핵심요약에서 드래그된 근거 매칭 세그먼트 ID Set (안전 임계값 적용)
  const evidenceMatchedIds = useMemo(() => {
    if (!evidenceQuery.trim()) return new Set();
    const best = findBestEvidenceBox(allBoxes, evidenceQuery);
    if (!best) return new Set();
    return new Set([best.id]);
  }, [allBoxes, evidenceQuery]);

  // STT 처리 완료 여부 (하단 큰 결과 박스 표시 조건)
  const hasSource = Boolean(audioUrl || storedSource);
  const storedItems = useMemo(() => {
    const needle = storedQuery.trim().toLowerCase();
    return needle ? storedMenu.items.filter((item) => (item.filename || "").toLowerCase().includes(needle)) : storedMenu.items;
  }, [storedMenu.items, storedQuery]);
  const rootFiles = useMemo(() => {
    return storedItems.filter((item) => !fileFolderMap[item.id]);
  }, [storedItems, fileFolderMap]);
  const isSTTCompleted = hasSource && dialogues.length > 0;
  const folderTreeContext = {
    folders,
    items: storedMenu.items,
    fileFolderMap,
    openFolders,
    dragOverFolderId,
    editingFolderId,
    editingFolderName,
    editingStoredId,
    editingStoredTitle,
    currentId: transcriptId || storedSource?.id,
    setDragOverFolderId,
    setEditingFolderId,
    setEditingFolderName,
    setEditingStoredTitle,
    toggleFolder: toggleFolderOpen,
    dropIntoFolder: handleDropIntoFolder,
    deleteFolder: handleDeleteFolder,
    moveFolderToRoot: handleMoveFolderToRoot,
    saveRenameFolder: handleSaveRenameFolder,
    openFile: openStoredTranscript,
    startRenameFile: handleStartRenameStored,
    saveRenameFile: handleSaveRenameStored,
    cancelRenameFile: handleCancelRenameStored,
    moveFileToRoot: handleMoveFileToRoot,
    deleteFile: handleDeleteStoredTranscript,
  };

  // 통합 텍스트 문단 렌더링 함수
  const renderUnifiedParagraphs = (keyPrefix = "unified") => {
    const segmentSpan = (item) => {
      const isSelected = item.ids.includes(selectedDialogueId);
      const isEvidence = evidenceMatchedIds.has(item.id);
      const isMatchKeyword = searchKeyword.trim() && item.text.toLowerCase().includes(searchKeyword.toLowerCase());
      const query = isMatchKeyword ? searchKeyword.trim() : isEvidence && evidenceQuery ? evidenceQuery.trim() : "";
      const queryMarks = (value) => {
        if (!query) return value;
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return value.split(new RegExp(`(${escaped})`, "gi")).map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <span
              key={i}
              style={{
                backgroundImage: "repeating-linear-gradient(45deg, rgba(14, 165, 233, 0.3), rgba(14, 165, 233, 0.3) 2px, transparent 2px, transparent 6px)",
              }}
              className="text-slate-950 font-bold px-0.5 rounded-xs"
            >
              {part}
            </span>
          ) : part
        );
      };
      return (
        <span
          key={`${keyPrefix}_text_${item.id}`}
          id={`${keyPrefix}_text_${item.id}`}
          className={`transition-colors ${isSelected ? "text-slate-950 font-medium" : "text-slate-700"}`}
        >
          {segmentsOf(item.text, item.marks).map((part) =>
            part.color ? (
              <mark key={part.start} style={{ background: MARK_COLORS[part.color].bg }} className="rounded-sm text-slate-900">{queryMarks(part.text)}</mark>
            ) : (
              <React.Fragment key={part.start}>{queryMarks(part.text)}</React.Fragment>
            )
          )}
        </span>
      );
    };
    const spaced = (items) => items.flatMap((item, index) => (index ? [" ", segmentSpan(item)] : [segmentSpan(item)]));
    return <p className="leading-relaxed">{spaced(paragraphs)}</p>;
  };

  // 하단 전체 메모장 / AI 핵심 요약 패널 렌더링
  const renderBottomPanel = (panelId) => {
    if (panelId === "memo") {
      return (
        <div
          key="bottom_panel_memo"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (dragOverPanel !== "memo") setDragOverPanel("memo");
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget)) return;
            setDragOverPanel(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            handlePanelDrop("memo");
          }}
          className={`w-full h-full p-5 flex flex-col justify-between space-y-3 transition-all duration-150 ${
            draggingPanel === "memo" ? "opacity-50" : ""
          } ${
            dragOverPanel === "memo" && draggingPanel !== "memo" ? "ring-2 ring-sky-400 bg-sky-50/20" : ""
          }`}
        >
          {/* 영역 헤더: 제목 + 가져오기 / 복사 / 다운로드 툴바 */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", "memo");
                setDraggingPanel("memo");
              }}
              onDragEnd={() => {
                setDraggingPanel(null);
                setDragOverPanel(null);
              }}
              className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none py-0.5 rounded hover:bg-slate-50 px-1 -ml-1 transition-colors"
              title="드래그하여 AI 요약 박스와 위치를 맞바꿉니다"
            >
              <GripVertical className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">
                전체 메모장
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                ({overallMemo.length}자)
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* 전체 복사 버튼 */}
              <button
                type="button"
                onClick={handleCopyOverallMemo}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer bg-transparent border-0 outline-none flex items-center justify-center active:scale-95"
                title="메모 복사 (전체 메모 클립보드에 복사)"
                aria-label="메모 복사"
              >
                {isMemoCopied ? <Check className="w-4 h-4 text-emerald-600 stroke-[1.8]" /> : <Copy className="w-4 h-4 stroke-[1.8]" />}
              </button>

              {/* TXT 다운로드 버튼 */}
              <button
                type="button"
                onClick={handleDownloadMemoTxt}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer bg-transparent border-0 outline-none flex items-center justify-center active:scale-95"
                title="TXT 저장 (메모를 TXT 파일로 다운로드)"
                aria-label="TXT 저장"
              >
                <Download className="w-4 h-4 stroke-[1.8]" />
              </button>
            </div>
          </div>

          {/* 전체 메모장 에디터 본문 */}
          <div className="flex-1 min-h-[500px] flex flex-col">
            <textarea
              value={overallMemo}
              onChange={(e) => updateOverallMemo(e.target.value)}
              placeholder="인터뷰 취재 메모를 자유롭게 작성하세요..."
              className="w-full flex-1 min-h-[480px] p-2 bg-transparent border-0 outline-none resize-none text-xs md:text-sm leading-relaxed text-slate-900 font-sans focus:outline-none"
            />
            <div className="flex items-center justify-end pt-2 px-1 text-[11px] text-slate-400">
              {notesSave === "error" && <span className="mr-3 text-rose-600">메모를 저장하지 못했습니다</span>}
              <span className="font-mono">{overallMemo.trim() ? `${overallMemo.trim().split(/\s+/).length}단어 · ${overallMemo.length}자` : "0자"}</span>
            </div>
          </div>
        </div>
      );
    }

    /* AI 핵심 요약 박스 */
    return (
      <div
        key="bottom_panel_summary"
        onMouseUp={handleSummaryTextSelection}
        onKeyUp={handleSummaryTextSelection}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOverPanel !== "summary") setDragOverPanel("summary");
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget)) return;
          setDragOverPanel(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          handlePanelDrop("summary");
        }}
        className={`w-full h-full p-5 flex flex-col justify-between space-y-3 transition-all duration-150 ${
          draggingPanel === "summary" ? "opacity-50" : ""
        } ${
          dragOverPanel === "summary" && draggingPanel !== "summary" ? "ring-2 ring-sky-400 bg-sky-50/20" : ""
        }`}
      >
        {/* 카드 헤더 */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", "summary");
              setDraggingPanel("summary");
            }}
            onDragEnd={() => {
              setDraggingPanel(null);
              setDragOverPanel(null);
            }}
            className="flex items-center gap-1.5 shrink-0 cursor-grab active:cursor-grabbing select-none py-0.5 rounded hover:bg-slate-50 px-1 -ml-1 transition-colors"
            title="드래그하여 전체 메모장과 위치를 맞바꿉니다"
          >
            <GripVertical className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700 shrink-0" />
            <Sparkles className="w-4 h-4 text-slate-700 shrink-0" />
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              AI 핵심 요약
            </h3>
          </div>

          {/* 재분석 / 복사 버튼 */}
          <div className="flex items-center gap-1">
            {currentTranscript && (
              <button
                onClick={() => handleGenerateSummary()}
                disabled={isAnalyzing}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                title="AI 요약 다시 생성"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isAnalyzing ? "animate-spin" : ""}`} />
              </button>
            )}
            {aiSummary && (
              <button
                onClick={handleDownloadSummaryTxt}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1 cursor-pointer"
                title="요약 TXT 저장 (제목-AI요약)"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
              </button>
            )}
            {aiSummary && (
              <button
                onClick={handleCopySummaryAll}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1 cursor-pointer"
                title="요약 전체 복사"
              >
                {isSummaryCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              </button>
            )}
          </div>
        </div>

        {/* 카드 본문: 분석 중 vs 분석 완료 vs 안내 */}
        <div className="flex-1 flex flex-col min-h-0">
          {isAnalyzing ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
              <RefreshCw className="w-5 h-5 text-slate-700 animate-spin" />
              <p className="text-xs font-bold text-slate-800">
                AI 전문 분석 중…
              </p>
            </div>
          ) : analysisError ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
              <p className="text-xs text-rose-600 font-medium">{analysisError}</p>
              <button
                onClick={() => handleGenerateSummary()}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold"
              >
                다시 시도
              </button>
            </div>
          ) : aiSummary ? (
            <div className="flex-1 max-h-[500px] overflow-y-auto pr-1 space-y-3.5 select-text cursor-text scrollbar-thin">
              {/* 1. 핵심 요약 (3~5문장) */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-900">요약</span>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  {aiSummary.summary}
                </p>
              </div>

              {/* 2. 주요 키워드 */}
              {aiSummary.keywords && aiSummary.keywords.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-900">주요 키워드</span>
                  <div className="flex flex-wrap gap-1">
                    {aiSummary.keywords.map((kw, idx) => (
                      <button
                        key={`kw_${idx}`}
                        onClick={() => setSearchKeyword(kw)}
                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700 cursor-pointer"
                        title="이 키워드로 통합 텍스트 검색"
                      >
                        #{kw}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. 핵심 발언 내용 */}
              {aiSummary.keyPoints && aiSummary.keyPoints.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-900">핵심 발언</span>
                  <div className="space-y-1">
                    {aiSummary.keyPoints.map((point, idx) => (
                      <div key={`kp_${idx}`} className="flex items-start gap-1.5 text-xs text-slate-700">
                        <span className="text-slate-400 font-mono text-[10px] shrink-0 mt-0.5">
                          {idx + 1}.
                        </span>
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
              <p className="text-xs text-slate-500">
                {hasSource ? "전사가 완료되었습니다." : "파일을 업로드하면 요약이 생성됩니다."}
              </p>
              {hasSource && (
                <button
                  onClick={() => handleGenerateSummary()}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold cursor-pointer"
                >
                  AI 핵심 요약 생성
                </button>
              )}
            </div>
          )}
        </div>

        {/* 하단 안내 문구 */}
        <div className="pt-2 text-[10px] text-slate-400 font-medium border-t border-slate-100 flex items-center justify-between">
          <span>드래그 시 녹취 근거 자동 매칭</span>
          {aiSummary && <span className="text-slate-600 font-bold">생성 완료</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto pb-16 font-sans text-slate-800" data-testid="interview-studio">
      {/* 실제 HTML5 오디오 요소 */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleAudioTimeUpdate}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* ──────────────────────────────────────────────────────────
          상단 헤더 바
         ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-5 mb-5 border-b border-slate-200">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#292929] tracking-tight">
            STT 인터뷰 전사 & AI 요약
          </h1>
        </div>

        {onReturnToArticle && (
          <button
            onClick={() => {
              const exportParts = [];
              if (aiSummary?.summary) {
                exportParts.push(`[AI 핵심 요약]\n${aiSummary.summary}`);
              }
              if (overallMemo && overallMemo.trim()) {
                exportParts.push(`[취재 메모]\n${overallMemo.trim()}`);
              }
              const exportText = allBoxes.map((box) => box.text).join("\n\n");
              if (exportText) {
                exportParts.push(`[통합 전사 전문]\n${exportText}`);
              }
              onReturnToArticle(exportParts.join("\n\n---\n\n"), { id: transcriptId || storedSource?.id, filename: fileName });
            }}
            className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95"
            title="기사 작성기로 내보내기"
          >
            <span>기사 작성기로 내보내기</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-300" />
          </button>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────
          1. 상단 두 개 박스 (와이어프레임 상단 가로 2분할)
             - 상단 왼쪽: 오디오 파일 업로드 및 재생
             - 상단 오른쪽: AI 핵심 요약
         ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        
        {/* ==========================================================
            [상단 왼쪽: 6컬럼] 오디오 파일 업로드 및 재생 (이미지 기반 뉴모피즘 플레이어)
           ========================================================== */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between min-h-[380px]">
          {/* 카드 헤더 */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 min-w-0">
            <div className="flex items-center gap-2 truncate min-w-0 max-w-[70%]">
              <h2
                className="text-sm font-bold text-slate-900 tracking-tight truncate"
                title={hasSource && fileName ? fileName : "오디오 파일 업로드 및 재생"}
              >
                {hasSource && fileName ? fileName : "오디오 파일 업로드 및 재생"}
              </h2>
              {hasSource && fileSize > 0 && (
                <span className="text-[11px] text-slate-400 font-mono shrink-0">
                  ({(fileSize / (1024 * 1024)).toFixed(1)}MB)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {storedSource && (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium border border-slate-200 shrink-0 select-none">
                  저장된 전사
                </span>
              )}
              {hasSource && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1 rounded-full bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="다른 파일로 변경"
                >
                  <Upload className="w-3 h-3 text-slate-500" />
                  <span>파일 변경</span>
                </button>
              )}
            </div>
          </div>

          {/* 카드 본문: 업로드 전 vs 업로드 후 */}
          {!hasSource ? (
            /* [빈 상태] 깊게 파인 음각 드래그 앤 드롭 영역 */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 my-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center p-6 text-center space-y-3 ${
                isDragging ? "border-slate-400 bg-white/70 scale-[0.99]" : "hover:bg-slate-100"
              }`}
            >
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-600">
                <Upload className="w-6 h-6 stroke-[2]" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-800">
                  음성 파일을 드래그하여 놓거나 클릭하여 선택하세요
                </p>
                <p className="text-[11px] text-slate-500">
                  지원 형식: MP3, M4A, WAV, WebM (최대 100MB)
                </p>
              </div>
              <button
                type="button"
                className="px-4 py-1.5 rounded-full bg-gradient-to-br from-white/90 via-slate-100/80 to-slate-300/60 backdrop-blur-md border border-white/80 text-slate-800 shadow-[0_4px_14px_rgba(100,116,139,0.22),inset_0_1px_0_rgba(255,255,255,0.9)] hover:from-white hover:to-slate-300/80 text-xs font-bold transition cursor-pointer active:scale-95"
              >
                파일 선택
              </button>
            </div>
          ) : (
            /* [업로드 완료 상태] 음각 파형 트레이, 음각 레일 프로그레스 슬라이더 및 하단 재생시간, 딥블루 원형 재생 컨트롤러 */
            <div className="flex-1 flex flex-col justify-between py-2 space-y-4">
              {/* [참고 이미지 도형] 음각 파형 스크린 트레이 (Waveform Well) */}
              <div
                role="slider"
                tabIndex={0}
                aria-label="재생 위치"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration) || 0}
                aria-valuenow={Math.round(currentTime)}
                data-testid="audio-waveform"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  seekFromPointer(e);
                }}
                onPointerMove={(e) => {
                  if (e.buttons === 1) seekFromPointer(e);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    handleSeekOffset(e.key === "ArrowLeft" ? -5 : 5);
                  }
                }}
                className="w-full h-28 bg-[#e6ebf2] shadow-[inset_4px_4px_9px_rgba(166,178,198,0.5),_inset_-4px_-4px_9px_rgba(255,255,255,0.95)] rounded-[20px] px-5 relative flex items-center justify-between gap-1 overflow-hidden cursor-pointer touch-none"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.95),rgba(255,255,255,0))]"
                />
                <div className="relative flex h-full w-full items-center justify-between">
                  {SPECTRUM_BARS.map((bar, idx) => {
                    const barProgress = idx / SPECTRUM_BARS.length;
                    const currentProgress = duration > 0 ? currentTime / duration : 0;
                    const isPlayed = barProgress <= currentProgress;

                    return (
                      <div key={idx} className="flex-1 flex items-center justify-center h-full">
                        <div
                          ref={(element) => { spectrumBars.current[idx] = element; }}
                          className={`w-full max-w-[3px] rounded-full transition-colors duration-100 ${
                            isPlayed ? "bg-gradient-to-b from-slate-500 to-slate-700" : "bg-slate-400/60"
                          }`}
                          style={{ height: `${bar.height}%`, opacity: bar.fade }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* [참고 이미지 도형] 음각 레일 프로그레스 슬라이더 및 하단 재생 시간 */}
              <div className="space-y-1.5">
                <div className="relative flex items-center w-full h-3">
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden relative cursor-pointer">
                    <div
                      className="h-full bg-gradient-to-r from-slate-300 to-slate-500 rounded-full transition-all duration-700"
                      style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSliderSeek}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                {/* 재생바 아래쪽 시간 표시 (현재 재생 초 / 전체 초) */}
                <div className="flex items-center justify-between text-xs font-mono font-semibold px-0.5 text-slate-500">
                  <span className="text-slate-700 font-bold">{formatDuration(currentTime)}</span>
                  <span>{formatDuration(duration)}</span>
                </div>
              </div>

              {/* [참고 이미지 도형] 딥블루 원형 재생 버튼 및 뉴모픽 컨트롤 바 */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  {/* 딥블루 원형 메인 재생 버튼 */}
                  <button
                    onClick={handleTogglePlay}
                    className="w-11 h-11 rounded-full bg-gradient-to-br from-white/90 via-slate-100/80 to-slate-300/60 backdrop-blur-md border border-white/80 text-slate-800 shadow-[0_4px_14px_rgba(100,116,139,0.22),inset_0_1px_0_rgba(255,255,255,0.9)] hover:from-white hover:to-slate-300/80 flex items-center justify-center transition cursor-pointer active:scale-95 shrink-0"
                    title={isPlaying ? "일시정지" : "재생"}
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4 fill-slate-700 text-slate-700" />
                    ) : (
                      <Play className="w-4 h-4 fill-slate-700 text-slate-700 ml-0.5" />
                    )}
                  </button>

                  {/* 알약형 뉴모픽 -10초 버튼 */}
                  <button
                    onClick={() => handleSeekOffset(-10)}
                    className="px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1 transition cursor-pointer active:scale-95"
                    title="10초 뒤로 이동"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-500" />
                    <span>-10초</span>
                  </button>

                  {/* 알약형 뉴모픽 +10초 버튼 */}
                  <button
                    onClick={() => handleSeekOffset(10)}
                    className="px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1 transition cursor-pointer active:scale-95"
                    title="10초 앞으로 이동"
                  >
                    <span>+10초</span>
                    <RotateCw className="w-3 h-3 text-slate-500" />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {/* 음량 조절 */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleToggleMute}
                      className="text-slate-500 hover:text-slate-800 transition cursor-pointer"
                      title={isMuted ? "음소거 해제" : "음소거"}
                    >
                      {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-16 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-500"
                    />
                  </div>

                  {/* 재생 속도 캡슐 버튼 */}
                  <div className="relative">
                    <button
                      onClick={() => setIsSpeedMenuOpen(!isSpeedMenuOpen)}
                      className="px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>{playbackSpeed}x</span>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>
                    {isSpeedMenuOpen && (
                      <div className="absolute right-0 bottom-full mb-1 w-20 bg-white rounded-xl p-1 z-50 space-y-0.5 border border-slate-200 shadow-lg">
                        {[0.8, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                          <button
                            key={rate}
                            onClick={() => {
                              handleSpeedChange(rate);
                              setIsSpeedMenuOpen(false);
                            }}
                            className={`w-full px-2 py-1 text-left rounded-lg text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                              playbackSpeed === rate ? "bg-gradient-to-br from-white to-slate-200 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]" : "text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            <span>{rate}x</span>
                            {playbackSpeed === rate && <Check className="w-3 h-3" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 하단 소프트 음각 상태 안내 */}
          <div className="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>상태: <strong className="text-slate-700">{sttStatus}</strong></span>
            {evidenceQuery && (
              <span className="text-slate-700 bg-gradient-to-br from-white/90 to-slate-200/70 backdrop-blur-md border border-white/80 px-2 py-0.5 rounded-full font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                선택 근거 매칭 중
              </span>
            )}
          </div>
        </div>

        {/* [상단 오른쪽] 파일 불러오기 · 폴더 모음 토글 · 파일명 검색 · 파일/폴더 보관함 (우클릭 폴더생성, 드래그 앤 드롭 이동) */}
        <div
          onContextMenu={handleArchiveContextMenu}
          className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col min-h-[380px] relative"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="audio/*,video/*,.mp3,.m4a,.wav,.webm"
            className="hidden"
          />
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            {/* 1. 파일명 검색기 */}
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={storedQuery}
                onChange={(e) => setStoredQuery(e.target.value)}
                placeholder="파일명 검색"
                aria-label="파일명 검색"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs outline-none focus:border-slate-400"
              />
            </label>

            {/* 2. 폴더 모아보기 토글 아이콘 (노란색 선) */}
            <button
              type="button"
              onClick={() => setViewOnlyFolders((prev) => !prev)}
              className="inline-flex shrink-0 items-center justify-center p-1.5 transition-transform hover:scale-110 active:scale-95 cursor-pointer text-amber-500 hover:text-amber-600"
              title={viewOnlyFolders ? "전체 보기로 전환 (폴더 + 파일)" : "폴더로만 따로 모아보기"}
              aria-label="폴더 모아보기"
              aria-pressed={viewOnlyFolders}
            >
              <Folder className={`w-4 h-4 stroke-[2] ${viewOnlyFolders ? "stroke-amber-500 fill-amber-300/40" : "stroke-amber-500 fill-none"}`} />
            </button>

            {/* 3. 파일 불러오기 버튼 (박스/텍스트 없이 단순 선 아이콘 형태) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex shrink-0 items-center justify-center p-1.5 transition-transform hover:scale-110 active:scale-95 cursor-pointer text-slate-600 hover:text-slate-900"
              title="파일 불러오기"
              aria-label="파일 불러오기"
            >
              <Upload className="w-4 h-4 stroke-[2]" />
            </button>
          </div>

          {/* 우클릭 시 뜨는 '폴더 만들기' 컨텍스트 메뉴 */}
          {contextMenu.visible && (
            <div
              style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
              className="fixed z-50 min-w-[140px] bg-white rounded-xl border border-slate-200 shadow-xl p-1 animate-in fade-in zoom-in-95 duration-100"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => handleCreateFolder()}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-left"
              >
                <FolderPlus className="w-4 h-4 text-amber-500" />
                <span>새 폴더 만들기</span>
              </button>
            </div>
          )}

          <ul
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              try {
                const data = JSON.parse(e.dataTransfer.getData("application/json"));
                if (data?.type === "file") handleMoveFileToRoot(e, data.id);
                if (data?.type === "folder") handleMoveFolderToRoot(e, data.id);
              } catch {
                // ignore
              }
              setDragOverFolderId(null);
            }}
            className="mt-3 max-h-[300px] flex-1 divide-y divide-slate-200/70 overflow-y-auto scrollbar-thin select-none"
          >
            {storedMenu.status === "loading" && (
              <li className="py-6 text-center text-xs text-slate-400">불러오는 중…</li>
            )}
            {storedMenu.status === "error" && (
              <li className="py-6 text-center text-xs text-rose-600">{storedMenu.error}</li>
            )}
            {storedMenu.status === "done" && storedMenu.items.length === 0 && folders.length === 0 && (
              <li className="py-6 text-center text-xs text-slate-400">
                보관된 전사 파일이나 폴더가 없습니다.<br />
                <span className="text-[11px] text-slate-400/80 mt-1 inline-block">(우클릭하여 폴더를 만들 수 있습니다)</span>
              </li>
            )}
            {storedMenu.status === "done" && storedQuery.trim() && storedItems.length === 0 && (
              <li className="py-6 text-center text-xs text-slate-400">검색 결과가 없습니다.</li>
            )}

            {/* 1. 검색어가 있을 때는 검색된 파일 목록 직접 렌더링 */}
            {storedQuery.trim() ? (
              storedItems.map((item) => {
                const isCurrent = (storedSource?.id === item.id) || (transcriptId === item.id);
                const isEditingThis = editingStoredId === item.id;
                return (
                  <li
                    key={item.id}
                    onClick={() => !isEditingThis && openStoredTranscript(item)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "F2" && !isEditingThis) {
                        e.preventDefault();
                        handleStartRenameStored(e, item);
                      }
                    }}
                    className="group flex cursor-pointer items-center gap-2.5 py-2 px-2 rounded-lg outline-none hover:bg-slate-50 focus-visible:bg-slate-50 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 group-hover:text-blue-600" />
                    <div className="min-w-0 flex-1">
                      {isEditingThis ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editingStoredTitle}
                            onChange={(e) => setEditingStoredTitle(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveRenameStored(e, item);
                              if (e.key === "Escape") handleCancelRenameStored(e);
                            }}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs font-bold text-slate-900 outline-none focus:border-slate-500"
                          />
                          <button type="button" onClick={(e) => handleSaveRenameStored(e, item)} className="shrink-0 cursor-pointer rounded p-1 text-emerald-600 hover:bg-emerald-50" title="제목 저장">
                            <Check className="w-3.5 h-3.5 stroke-[2]" />
                          </button>
                          <button type="button" onClick={handleCancelRenameStored} className="shrink-0 cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" title="취소">
                            <X className="w-3.5 h-3.5 stroke-[2]" />
                          </button>
                        </div>
                      ) : (
                        <p
                          onDoubleClick={(e) => handleStartRenameStored(e, item)}
                          title="더블클릭 또는 F2로 제목 변경"
                          className={`truncate text-xs ${isCurrent ? "font-extrabold text-slate-900" : "font-bold text-slate-800"}`}
                        >
                          {item.filename || "(파일명 없음)"}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-slate-400">
                      {new Date(item.createdAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                    </span>
                    {!isEditingThis && (
                      <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={(e) => handleDeleteStoredTranscript(e, item)} className="cursor-pointer rounded-lg p-1 text-slate-400 hover:text-rose-600" title="전사 삭제">
                          <Trash2 className="w-3.5 h-3.5 stroke-[1.8]" />
                        </button>
                      </span>
                    )}
                  </li>
                );
              })
            ) : (
              <>
                {/* 2. 폴더 목록 렌더링 (아코디언 및 드롭 타깃) */}
                {transcriptFolderChildren(folders).map((folder) => {
                  const isOver = dragOverFolderId === folder.id;
                  const isOpen = Boolean(openFolders[folder.id]);
                  const isEditingThis = editingFolderId === folder.id;
                  const childFolders = transcriptFolderChildren(folders, folder.id);
                  const folderFiles = storedMenu.items.filter((item) => fileFolderMap[item.id] === folder.id);

                  return (
                    <li
                      key={folder.id}
                      draggable={!isEditingThis}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData("application/json", JSON.stringify({ type: "folder", id: folder.id }));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (dragOverFolderId !== folder.id) setDragOverFolderId(folder.id);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget)) {
                          setDragOverFolderId(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          const data = JSON.parse(e.dataTransfer.getData("application/json"));
                          handleDropIntoFolder(folder.id, data);
                        } catch {
                          // ignore
                        }
                        setDragOverFolderId(null);
                      }}
                      className="py-1"
                    >
                      <div
                        onClick={() => !isEditingThis && toggleFolderOpen(folder.id)}
                        className={`group flex items-center gap-2 py-1.5 px-2 rounded-xl cursor-pointer transition-all border ${
                          isOver
                            ? "bg-blue-50 border-blue-400 ring-2 ring-blue-300"
                            : "hover:bg-slate-100/80 border-transparent bg-slate-50/50"
                        }`}
                        title="클릭하여 열기/접기 (파일/폴더를 드래그하여 안에 넣을 수 있습니다)"
                      >
                        <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-90 text-slate-700" : ""}`} />
                        {isOpen ? (
                          <FolderOpen className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0" />
                        ) : (
                          <Folder className="w-4 h-4 text-amber-500 fill-amber-400/50 shrink-0" />
                        )}

                        <div className="min-w-0 flex-1">
                          {isEditingThis ? (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editingFolderName}
                                onChange={(e) => setEditingFolderName(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveRenameFolder(folder.id);
                                  if (e.key === "Escape") setEditingFolderId(null);
                                }}
                                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs font-bold text-slate-900 outline-none focus:border-slate-500"
                              />
                              <button type="button" onClick={() => handleSaveRenameFolder(folder.id)} className="shrink-0 cursor-pointer rounded p-1 text-emerald-600 hover:bg-emerald-50" title="폴더명 저장">
                                <Check className="w-3.5 h-3.5 stroke-[2]" />
                              </button>
                              <button type="button" onClick={() => setEditingFolderId(null)} className="shrink-0 cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" title="취소">
                                <X className="w-3.5 h-3.5 stroke-[2]" />
                              </button>
                            </div>
                          ) : (
                            <span
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setEditingFolderId(folder.id);
                                setEditingFolderName(folder.name);
                              }}
                              className="text-xs font-bold text-slate-800 truncate block"
                              title="더블클릭하여 폴더 이름 변경"
                            >
                              {folder.name}
                            </span>
                          )}
                        </div>

                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-200/70 text-slate-600 font-semibold shrink-0">
                          {folderFiles.length}
                        </span>

                        {!isEditingThis && (
                          <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteFolder(e, folder.id)}
                              className="cursor-pointer rounded-lg p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="폴더 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5 stroke-[1.8]" />
                            </button>
                          </span>
                        )}
                      </div>

                      {/* 폴더 내부 파일 목록 (열려있을 때 표시) */}
                      {isOpen && (
                        <ul className="mt-1 space-y-0.5 pl-2">
                          <TranscriptFolderTree context={folderTreeContext} parentId={folder.id} />
                          {folderFiles.length === 0 && childFolders.length === 0 ? (
                            <li className="py-2 pl-7 text-[11px] text-slate-400 italic">
                              (파일을 드래그해서 이 폴더에 넣으세요)
                            </li>
                          ) : (
                            folderFiles.map((file) => {
                              const isCurrent = (storedSource?.id === file.id) || (transcriptId === file.id);
                              const isEditingFile = editingStoredId === file.id;
                              return (
                                <li
                                  key={file.id}
                                  draggable={!isEditingFile}
                                  onDragStart={(e) => {
                                    e.stopPropagation();
                                    e.dataTransfer.setData("application/json", JSON.stringify({ type: "file", id: file.id }));
                                    e.dataTransfer.effectAllowed = "move";
                                  }}
                                  onClick={() => !isEditingFile && openStoredTranscript(file)}
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === "F2" && !isEditingFile) {
                                      e.preventDefault();
                                      handleStartRenameStored(e, file);
                                    }
                                  }}
                                  className="group flex cursor-pointer items-center gap-2 py-1.5 px-2 rounded-lg outline-none ml-4 border-l-2 border-slate-200 hover:bg-slate-50 focus-visible:bg-slate-50 transition-colors"
                                >
                                  <FileText className="w-3 h-3 text-slate-400 shrink-0 group-hover:text-blue-600" />
                                  <div className="min-w-0 flex-1">
                                    {isEditingFile ? (
                                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        <input
                                          type="text"
                                          value={editingStoredTitle}
                                          onChange={(e) => setEditingStoredTitle(e.target.value)}
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") handleSaveRenameStored(e, file);
                                            if (e.key === "Escape") handleCancelRenameStored(e);
                                          }}
                                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs font-bold text-slate-900 outline-none focus:border-slate-500"
                                        />
                                        <button type="button" onClick={(e) => handleSaveRenameStored(e, file)} className="shrink-0 cursor-pointer rounded p-1 text-emerald-600 hover:bg-emerald-50" title="제목 저장">
                                          <Check className="w-3.5 h-3.5 stroke-[2]" />
                                        </button>
                                        <button type="button" onClick={handleCancelRenameStored} className="shrink-0 cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" title="취소">
                                          <X className="w-3.5 h-3.5 stroke-[2]" />
                                        </button>
                                      </div>
                                    ) : (
                                      <p
                                        onDoubleClick={(e) => handleStartRenameStored(e, file)}
                                        title="더블클릭 또는 F2로 제목 변경 (드래그하여 다른 폴더로 이동 가능)"
                                        className={`truncate text-xs ${isCurrent ? "font-extrabold text-slate-900" : "font-bold text-slate-800"}`}
                                      >
                                        {file.filename || "(파일명 없음)"}
                                      </p>
                                    )}
                                  </div>
                                  <span className="shrink-0 font-mono text-[10px] text-slate-400">
                                    {new Date(file.createdAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                                  </span>
                                  {!isEditingFile && (
                                    <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={(e) => handleMoveFileToRoot(e, file.id)}
                                        className="cursor-pointer rounded p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                        title="폴더 밖으로 꺼내기"
                                      >
                                        <ArrowUpRight className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => handleDeleteStoredTranscript(e, file)}
                                        className="cursor-pointer rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                        title="전사 삭제"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 stroke-[1.8]" />
                                      </button>
                                    </span>
                                  )}
                                </li>
                              );
                            })
                          )}
                        </ul>
                      )}
                    </li>
                  );
                })}

                {/* 3. 폴더 모아보기 모드가 아닐 때, 폴더에 속하지 않은 루트 파일들을 폴더와 함께 표시 */}
                {!viewOnlyFolders && rootFiles.map((item) => {
                  const isCurrent = (storedSource?.id === item.id) || (transcriptId === item.id);
                  const isEditingThis = editingStoredId === item.id;
                  return (
                    <li
                      key={item.id}
                      draggable={!isEditingThis}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData("application/json", JSON.stringify({ type: "file", id: item.id }));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => !isEditingThis && openStoredTranscript(item)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "F2" && !isEditingThis) {
                          e.preventDefault();
                          handleStartRenameStored(e, item);
                        }
                      }}
                      className="group flex cursor-pointer items-center gap-2.5 py-2 px-2 rounded-lg outline-none hover:bg-slate-50 focus-visible:bg-slate-50 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 group-hover:text-blue-600" />
                      <div className="min-w-0 flex-1">
                        {isEditingThis ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editingStoredTitle}
                              onChange={(e) => setEditingStoredTitle(e.target.value)}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveRenameStored(e, item);
                                if (e.key === "Escape") handleCancelRenameStored(e);
                              }}
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs font-bold text-slate-900 outline-none focus:border-slate-500"
                            />
                            <button type="button" onClick={(e) => handleSaveRenameStored(e, item)} className="shrink-0 cursor-pointer rounded p-1 text-emerald-600 hover:bg-emerald-50" title="제목 저장">
                              <Check className="w-3.5 h-3.5 stroke-[2]" />
                            </button>
                            <button type="button" onClick={handleCancelRenameStored} className="shrink-0 cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" title="취소">
                              <X className="w-3.5 h-3.5 stroke-[2]" />
                            </button>
                          </div>
                        ) : (
                          <p
                            onDoubleClick={(e) => handleStartRenameStored(e, item)}
                            title="더블클릭 또는 F2로 제목 변경 (드래그하여 원하는 폴더에 넣을 수 있습니다)"
                            className={`truncate text-xs ${isCurrent ? "font-extrabold text-slate-900" : "font-bold text-slate-800"}`}
                          >
                            {item.filename || "(파일명 없음)"}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-slate-400">
                        {new Date(item.createdAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                      </span>
                      {!isEditingThis && (
                        <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={(e) => handleDeleteStoredTranscript(e, item)} className="cursor-pointer rounded-lg p-1 text-slate-400 hover:text-rose-600" title="전사 삭제">
                            <Trash2 className="w-3.5 h-3.5 stroke-[1.8]" />
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </>
            )}
          </ul>
        </div>

      </div>

      {/* ──────────────────────────────────────────────────────────
          2. 하단 큰 전사 결과 박스 (STT 처리 완료 후에만 표시!)
             - 중앙 세로 구분선(| divider)으로 좌우 분할
             - 왼쪽: 화자별 전사 (화자 1, 화자 2 등 대화형 세그먼트 목록)
             - 오른쪽: 통합 텍스트 (줄글 전문, 자체 스크롤, 검색/다운로드/복사)
             - 하단: 배경과 경계 없이 자연스럽게 이어지는 그라데이션
         ────────────────────────────────────────────────────────── */}
      {isSTTCompleted && (
        <div className="relative w-full mt-6">
          <div className="w-full bg-white border-t border-x border-slate-200 rounded-t-2xl shadow-xs overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
              
              {/* ==========================================================
                  [하단 왼쪽: 5컬럼] 화자별 전사 (진행 중인 화자 구간 박스 강조)
                 ========================================================== */}
              <div className="lg:col-span-5 p-5 flex flex-col justify-start space-y-3">
                {/* 영역 헤더: 제목 + 검색창 + 전체복사 + TXT저장 + 모드전환 툴바 */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 shrink-0">
                    <h3 className="text-sm font-bold text-slate-900">
                      {showUnifiedInSpeakerBox ? "통합 텍스트" : "화자별 전사"}
                    </h3>
                    {!showUnifiedInSpeakerBox && (
                      <span className="text-xs text-slate-400 font-mono">
                        ({paragraphs.length}개 단락)
                      </span>
                    )}
                  </div>

                  {/* 툴바: 인라인 검색창 + 전체 복사 + TXT 저장 + 화자구분/통글 전환 (선 형태 아이콘 + 호버 툴팁) */}
                  <div className="flex items-center gap-1">
                    {/* 인라인 검색창 */}
                    <div className="relative w-28 sm:w-36">
                      <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        placeholder="단어 검색..."
                        className="w-full pl-7 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-400 transition"
                      />
                    </div>

                    {/* 전체 복사 버튼 (텍스트 없이 선 형태 아이콘만, 호버 시 툴팁) */}
                    <button
                      type="button"
                      onClick={handleCopyAllText}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer bg-transparent border-0 outline-none flex items-center justify-center"
                      title="전체 복사"
                      aria-label="전체 복사"
                    >
                      {isAllCopied ? <Check className="w-4 h-4 text-emerald-600 stroke-[1.8]" /> : <Copy className="w-4 h-4 stroke-[1.8]" />}
                    </button>

                    {/* TXT 저장 버튼 (텍스트 없이 선 형태 아이콘만, 호버 시 툴팁) */}
                    <button
                      type="button"
                      onClick={handleDownloadTxt}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer bg-transparent border-0 outline-none flex items-center justify-center"
                      title="TXT 저장"
                      aria-label="TXT 저장"
                    >
                      <Download className="w-4 h-4 stroke-[1.8]" />
                    </button>

                    <span className="w-px h-3.5 bg-slate-200 mx-0.5" aria-hidden="true" />

                    {/* 화자구분 / 통글 텍스트 전환 버튼 (선 형태 아이콘, 호버 시 툴팁) */}
                    <button
                      type="button"
                      onClick={() => setShowUnifiedInSpeakerBox((prev) => !prev)}
                      title={showUnifiedInSpeakerBox ? "화자별 전사로 전환" : "통합텍스트로 전환"}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer bg-transparent border-0 outline-none flex items-center justify-center"
                      aria-label={showUnifiedInSpeakerBox ? "화자별 전사로 전환" : "통합텍스트로 전환"}
                    >
                      {showUnifiedInSpeakerBox ? (
                        <Speech className="w-4.5 h-4.5 stroke-[1.8]" />
                      ) : (
                        <FileText className="w-4.5 h-4.5 stroke-[1.8]" />
                      )}
                    </button>
                  </div>
                </div>
                {showUnifiedInSpeakerBox ? (
                  <div className="max-h-[580px] overflow-y-auto pr-2 space-y-3.5 text-xs md:text-sm leading-relaxed select-text font-sans scrollbar-thin">
                    {renderUnifiedParagraphs("box_unified")}
                  </div>
                ) : (
                  <>

                {/* 화자 수정하기: 재생을 멈추고 단락 박스를 여러 개 골라 화자 이름을 한 번에 바꾼다 */}
                {editMode && (
                  <SpeakerEditBar
                    pickedCount={pickedIds.length}
                    totalCount={paragraphs.length}
                    roster={roster}
                    onSelectAll={() => setPickedIds(paragraphs.map((paragraph) => paragraph.id))}
                    onClear={() => setPickedIds([])}
                    onApply={applyNameToPicked}
                    onDone={endSpeakerEdit}
                  />
                )}

                {/* 텍스트 수정바: 글을 드래그하면 선택 위치 위에 뜬다 */}
                {selection && !editMode && <SelectionToolbar selection={selection} onMark={markSelection} onClear={unmarkSelection} onEdit={startTextEdit} />}

                {/* 화자별 세그먼트 대화 목록 */}
                <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1" onMouseUp={() => setTimeout(refreshSelection, 0)} onKeyUp={refreshSelection}>
                  {paragraphs.map((item) => {
                    const isSelected = item.ids.includes(selectedDialogueId);
                    const isCurrentActive = item.ids.includes(activeDialogueId);
                    const isEvidence = item.ids.some((segmentId) => evidenceMatchedIds.has(segmentId));

                    return (
                      <div
                        key={`speaker_segment_${item.id}`}
                        id={`speaker_segment_${item.id}`}
                        onClick={() => {
                          if (editMode) return togglePicked(item.id);
                          if (editingBoxId === item.id || window.getSelection()?.toString()) return; // 글을 드래그했거나 고치는 중에는 이동·재생하지 않는다
                          return handleSelectDialogue(item.timestamp, item.id);
                        }}
                        className={`group p-3 rounded-xl transition cursor-pointer ${editMode && pickedIds.includes(item.id) ? "ring-2 ring-slate-900 " : ""}${
                          isCurrentActive
                            ? "bg-white border-2 border-slate-900 shadow-sm ring-2 ring-slate-900/10"
                            : isSelected
                            ? "bg-slate-50 border border-slate-300"
                            : isEvidence
                            ? "bg-amber-50/90 border border-amber-300"
                            : "bg-white border border-slate-200/70 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {/* 세그먼트 상단: 화자명 태그 + 타임스탬프 */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            {editMode && (
                              <input
                                type="checkbox"
                                checked={pickedIds.includes(item.id)}
                                onChange={() => togglePicked(item.id)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`${item.speakerName} 단락 선택`}
                                data-testid={`speaker-pick-${item.id}`}
                                className="w-3.5 h-3.5 accent-slate-900 cursor-pointer"
                              />
                            )}
                            <SpeakerProfileMenu
                              index={speakerIndex(speakers, item.speaker)}
                              name={item.speakerName}
                              open={openParagraphId === item.id}
                              disabled={editMode}
                              testId={`speaker-badge-${item.id}`}
                              nameTestId={`speaker-name-${item.id}`}
                              roster={roster}
                              currentKey={item.speaker}
                              onToggle={(e) => {
                                e.stopPropagation();
                                setOpenParagraphId((prev) => (prev === item.id ? null : item.id));
                              }}
                              onClose={() => setOpenParagraphId((prev) => (prev === item.id ? null : prev))}
                              onPick={(key) => pickSpeakerForParagraph(item.ids, key)}
                              onRename={(name) => renameWholeSpeaker(item.speaker, name)}
                            />
                            <span className="font-mono text-[11px] text-slate-400">
                              {formatDuration(item.timestamp)}
                            </span>
                            {isCurrentActive && isPlaying && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-900 bg-slate-100 border border-slate-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-900 animate-pulse" />
                                재생 중
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {isEvidence && (
                              <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                                요약 근거
                              </span>
                            )}
                            {/* 화자 발언별 메모 버튼 (📝) */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMemoBoxId((prev) => (prev === item.id ? null : item.id));
                                }}
                                className={`p-1 rounded text-xs leading-none transition cursor-pointer flex items-center justify-center ${
                                  speakerNotes[item.id]
                                    ? "opacity-100 bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs"
                                    : "opacity-0 group-hover:opacity-100 hover:bg-slate-200 text-slate-500"
                                }`}
                                title={speakerNotes[item.id] ? "발언 메모 보기/수정" : "발언 메모 작성"}
                              >
                                <StickyNote className="w-3.5 h-3.5 stroke-[1.8]" />
                              </button>

                              {/* 메모 입력 팝업 */}
                              {activeMemoBoxId === item.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-0 top-full mt-1.5 w-64 sm:w-72 p-3 bg-white border border-slate-200 rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150"
                                >
                                  <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-100">
                                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                      <StickyNote className="w-3.5 h-3.5 text-slate-600 stroke-[1.8]" />
                                      <span>{item.speakerName} 메모</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setActiveMemoBoxId(null)}
                                      className="text-slate-400 hover:text-slate-700 text-xs p-0.5 rounded cursor-pointer"
                                      title="닫기"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  <textarea
                                    value={speakerNotes[item.id] || ""}
                                    onChange={(e) => updateSpeakerNote(item.id, e.target.value)}
                                    placeholder="이 발언에 대한 취재 메모를 작성하세요..."
                                    rows={3}
                                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-slate-400 outline-none resize-none leading-relaxed text-slate-900"
                                    autoFocus
                                  />
                                  <div className="flex items-center justify-between pt-2">
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {(speakerNotes[item.id] || "").length}자
                                    </span>
                                    <div className="flex items-center gap-1">
                                      {speakerNotes[item.id] && (
                                        <button
                                          type="button"
                                          onClick={() => updateSpeakerNote(item.id, "")}
                                          className="px-2 py-0.5 text-[11px] text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                        >
                                          삭제
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setActiveMemoBoxId(null)}
                                        className="px-2.5 py-0.5 rounded bg-slate-900 hover:bg-black text-white text-[11px] font-bold cursor-pointer transition shadow-xs"
                                      >
                                        완료
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopySentence(item.id, item.text, item.speakerName);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition opacity-0 group-hover:opacity-100"
                              title="발언 복사"
                            >
                              {copiedId === item.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>

                        {/* 발화 텍스트 */}
                        <BoxText
                          box={item}
                          editing={editingBoxId === item.id}
                          selection={editSelection}
                          onSave={(value) => saveBoxText(item, value)}
                          onCancel={() => setEditingBoxId(null)}
                          searchKeyword={searchKeyword}
                        />

                        {/* 작성된 메모가 있을 때의 인라인 메모 표시 */}
                        {speakerNotes[item.id] && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMemoBoxId(item.id);
                            }}
                            className="mt-2 p-2 rounded-lg bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-950 leading-relaxed cursor-pointer hover:bg-amber-100/80 transition flex items-start gap-1.5"
                            title="클릭하여 메모 수정"
                          >
                            <StickyNote className="w-3.5 h-3.5 text-amber-800 stroke-[1.8] shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{speakerNotes[item.id]}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                  </>
                )}
              </div>

              {/* ==========================================================
                  [하단 우측 영역: 7컬럼] 전체 메모장과 AI 핵심 요약 (드래그 위치 변경 & 미니멀 리사이즈 바)
                 ========================================================== */}
              <div
                ref={rightSplitContainerRef}
                style={{ "--left-ratio": `${rightSplitRatio}%` }}
                className={`lg:col-span-7 flex flex-col lg:flex-row min-w-0 divide-y lg:divide-y-0 divide-slate-200 ${
                  isResizing ? "select-none cursor-col-resize" : ""
                }`}
              >
                {/* 첫 번째 패널 (드래그 순서에 따름) */}
                <div className="w-full lg:w-[var(--left-ratio)] min-w-0 flex flex-col">
                  {renderBottomPanel(panelOrder[0])}
                </div>

                {/* 두 박스 사이 미니멀 크기 조절 바 (lg 이상 화면에서 표시) */}
                <div
                  onMouseDown={handleResizeStart}
                  onDoubleClick={handleResetSplitRatio}
                  className="hidden lg:flex items-center justify-center w-2.5 -mx-1.5 relative z-10 cursor-col-resize group select-none shrink-0"
                  title="좌우로 드래그하여 박스 너비 조절 (더블클릭 시 기본 4:3 비율로 복원)"
                >
                  <div className={`w-[1px] h-full transition-colors ${isResizing ? "bg-slate-400" : "bg-slate-200 group-hover:bg-slate-300"}`} />
                  <div
                    className={`absolute w-1.5 h-7 rounded-full border border-slate-300/80 transition-all pointer-events-none shadow-sm ${
                      isResizing
                        ? "bg-slate-600 border-slate-600 shadow-md scale-y-110"
                        : "bg-slate-200 group-hover:bg-slate-400 group-hover:border-slate-400 group-hover:shadow"
                    }`}
                  />
                </div>

                {/* 두 번째 패널 (드래그 순서에 따름) */}
                <div className="w-full lg:flex-1 min-w-0 flex flex-col">
                  {renderBottomPanel(panelOrder[1])}
                </div>
              </div>

            </div>
          </div>

          {/* 하단에 큰 박스 밑에 배경과 박스와 구분 없는 자연스러운 페이드 그라데이션 */}
          <div className="w-full h-16 bg-gradient-to-b from-white via-white/60 to-transparent pointer-events-none rounded-b-2xl border-b border-transparent" />
        </div>
      )}
      {onSave && <SaveBar onSave={async () => {
        if (!await saveNotesNow()) return false;
        return onSave({ id: transcriptId || storedSource?.id, filename: fileName || storedSource?.filename || "녹취 파일" });
      }} testId="interview-save" />}
      {leavePrompt && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4"
          onClick={() => setLeavePrompt(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setLeavePrompt(null); }}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="저장하지 않은 메모"
            data-testid="leave-prompt"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[340px] rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <p className="text-sm font-bold text-slate-900">저장하지 않으면 메모가 삭제됩니다.</p>
            {notesSave === "error" && <p role="alert" className="mt-1 text-xs text-rose-600">저장하지 못했습니다. 다시 시도해 주세요.</p>}
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                autoFocus
                data-testid="leave-save"
                onClick={async () => {
                  if (await saveNotesNow()) {
                    const { go } = leavePrompt;
                    setLeavePrompt(null);
                    go();
                  }
                }}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 cursor-pointer"
              >
                저장하기
              </button>
              <button
                type="button"
                data-testid="leave-discard"
                onClick={() => {
                  const { go } = leavePrompt;
                  setLeavePrompt(null);
                  go();
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
              >
                저장하지 않고 나가기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
