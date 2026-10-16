import React, { useState, useRef, useEffect, useMemo } from "react";
import { requestSTT, requestInterviewAnalysis, listStoredTranscripts, loadStoredTranscript, saveSpeakerEdits } from "../../services/sttService";
import { mergeBySpeaker, speakerText, plainText } from "../../lib/transcriptText.js";
import { SpeakerBadge, SpeakerEditBar, SpeakerHeaderActions, SpeakerNameEditor } from "./SpeakerProfiles.jsx";
import { applySpeakerEdits, assignByName, assignDialogues, emptyEdits, isEdited, renameSpeakerSmart, sanitizeEdits, speakerIndex, speakerList, speakerRoster } from "../../lib/speakerEdits.js";
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
  FileAudio,
  ChevronDown,
  ArrowUpRight,
  Sparkles,
  RefreshCw,
  Volume2,
  VolumeX
} from "lucide-react";

// 초 단위를 '00:00:00' (시:분:초) 형태의 시각 문자열로 포맷팅
function formatDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// 절제된 오디오 파형 바 생성용 더미 높이 배열
const WAVEFORM_BARS = [
  30, 45, 60, 25, 75, 40, 85, 55, 90, 35, 65, 80, 45, 70, 95, 60, 40, 80, 50, 75,
  35, 60, 90, 45, 70, 85, 30, 65, 50, 80, 40, 75, 90, 55, 65, 40, 70, 85, 35, 60
];

export default function InterviewStudio({ onReturnToArticle }) {
  // 1. 녹음 파일 및 인터뷰 상태
  const [audioUrl, setAudioUrl] = useState(null);
  // 저장된 전사를 다시 연 경우(원본 오디오 없음). 목록은 처음 펼칠 때 불러온다.
  const [storedSource, setStoredSource] = useState(null);
  const [storedMenu, setStoredMenu] = useState({ open: false, status: "idle", items: [], error: "" });
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  // CLOVA 가 준 발언 원본. 화면에 쓰는 dialogues 는 여기에 사용자의 화자 수정(이름 바꾸기·합치기·구간 지정)을 덧씌운 것이다.
  const [baseDialogues, setBaseDialogues] = useState([]);
  const [speakerEdits, setSpeakerEdits] = useState(emptyEdits);
  const [transcriptId, setTranscriptId] = useState(null);
  const [speakerSave, setSpeakerSave] = useState("");
  const [pickedIds, setPickedIds] = useState([]);
  const [editMode, setEditMode] = useState(false); // 화자 수정하기: 재생을 멈추고 여러 단락을 골라 한 번에 바꾼다
  const [openParagraphId, setOpenParagraphId] = useState(null); // 프로필을 눌러 이름 입력칸이 열린 단락
  const dialogues = useMemo(() => applySpeakerEdits(baseDialogues, speakerEdits), [baseDialogues, speakerEdits]);
  const speakers = useMemo(() => speakerList(baseDialogues, speakerEdits), [baseDialogues, speakerEdits]);
  // 화자 고르기 목록: 고친 이름과 처음 CLOVA 가 붙인 이름이 함께 남는다
  const roster = useMemo(() => speakerRoster(baseDialogues, speakerEdits), [baseDialogues, speakerEdits]);
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
  // 통합 텍스트 형태: "speaker" 화자·단락 구분 | "plain" 통글
  const [textMode, setTextMode] = useState("speaker");
  const [isDragging, setIsDragging] = useState(false);

  // 5. AI 요약 상태
  const [aiSummary, setAiSummary] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [isSummaryCopied, setIsSummaryCopied] = useState(false);

  // 6. 핵심요약 텍스트 드래그(선택) 기반 녹취 근거 하이라이트 상태
  const [evidenceQuery, setEvidenceQuery] = useState("");

  // 오디오 타이머 및 참조
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

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
  const handleGenerateSummary = (transcriptObj) => {
    const target = transcriptObj || currentTranscript;
    if (!target) return;
    setIsAnalyzing(true);
    setAnalysisError("");
    requestInterviewAnalysis(target)
      .then((res) => {
        setAiSummary(res);
        setIsAnalyzing(false);
      })
      .catch((err) => {
        setAnalysisError(err?.message || "AI 요약 생성에 실패했습니다.");
        setIsAnalyzing(false);
      });
  };

  // 녹음 파일 처리 및 STT 요청 공통 함수
  const processFile = (file) => {
    if (!file) return;
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
    setAiSummary(null);
    setAnalysisError("");
    setEvidenceQuery("");
    setSttStatus("전사 진행 중…");

    requestSTT(file)
      .then((result) => {
        if (result.dialogues && result.dialogues.length > 0) {
          setBaseDialogues(result.dialogues);
          setTranscriptId(result.transcriptId || null);
          setSelectedDialogueId(result.dialogues[0].id);
          setSttStatus("전사 완료 100%");
          if (result.transcript) {
            setCurrentTranscript(result.transcript);
            handleGenerateSummary(result.transcript);
          }
        } else {
          setSttStatus("전사 완료 (발언 없음)");
        }
      })
      .catch((error) => {
        setSttStatus("전사 실패: " + (error?.message || error));
      });
  };

  // 저장된 전사 목록(코어 암호화 저장소)
  const toggleStoredMenu = async () => {
    const open = !storedMenu.open;
    setStoredMenu((prev) => ({ ...prev, open }));
    if (!open) return;
    setStoredMenu((prev) => ({ ...prev, status: "loading", error: "" }));
    try {
      const items = await listStoredTranscripts();
      setStoredMenu((prev) => ({ ...prev, status: "done", items }));
    } catch (error) {
      setStoredMenu((prev) => ({ ...prev, status: "error", items: [], error: error.message }));
    }
  };

  const openStoredTranscript = async (item) => {
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
      setSpeakerSave("");
      setPickedIds([]);
      setEditMode(false);
      setOpenParagraphId(null);
      setSelectedDialogueId(result.dialogues[0]?.id ?? null);
      setCurrentTranscript(result.transcript);
      setSttStatus(result.dialogues.length > 0 ? "저장된 전사 불러옴" : "저장된 전사 (발언 없음)");
    } catch (error) {
      setSttStatus("저장된 전사 열기 실패: " + (error?.message || error));
    }
  };

  // 파일 업로드 핸들러
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
    const fullText = textMode === "plain" ? plainText(dialogues) : speakerText(dialogues, formatDuration);
    navigator.clipboard.writeText(fullText);
    setIsAllCopied(true);
    setTimeout(() => setIsAllCopied(false), 2000);
  };

  // AI 요약 전체 복사
  const handleCopySummaryAll = () => {
    if (!aiSummary) return;
    const lines = [
      `[AI 핵심 요약]`,
      aiSummary.summary || "",
      "",
      `[주요 키워드]`,
      (aiSummary.keywords || []).map((k) => `#${k}`).join(" "),
      "",
      `[핵심 발언]`,
      ...(aiSummary.keyPoints || []).map((p, i) => `${i + 1}. ${p}`)
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    setIsSummaryCopied(true);
    setTimeout(() => setIsSummaryCopied(false), 2000);
  };

  // TXT 파일 다운로드
  const handleDownloadTxt = () => {
    const content = textMode === "plain" ? plainText(dialogues) : speakerText(dialogues, formatDuration);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName ? fileName.replace(/\.[^/.]+$/, "") : "interview"}_${textMode === "plain" ? "plain" : "speakers"}_transcript.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  // 핵심요약 텍스트 드래그(선택) 시 녹취 근거 자동 매칭 & 스크롤
  const handleSummaryTextSelection = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString()?.trim();
    if (selectedText && selectedText.length >= 2) {
      setEvidenceQuery(selectedText);
      const matched = dialogues.find((d) =>
        d.text.toLowerCase().includes(selectedText.toLowerCase())
      );
      if (matched) {
        setSelectedDialogueId(matched.id);
        const targetEl = document.getElementById(`unified_text_${matched.id}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
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
  const filteredDialogues = useMemo(() => {
    if (!searchKeyword.trim()) return dialogues;
    const query = searchKeyword.toLowerCase();
    return dialogues.filter((item) => {
      return (
        item.text.toLowerCase().includes(query) ||
        item.speakerName.toLowerCase().includes(query)
      );
    });
  }, [dialogues, searchKeyword]);

  // 같은 화자의 연속 발언을 한 단락으로 묶은 목록(화자·단락 구분 표시용)
  const paragraphs = useMemo(() => mergeBySpeaker(filteredDialogues), [filteredDialogues]);

  // 화자 수정: 화면에 바로 반영하고, 저장된 녹취면 코어 암호화 저장소에도 보낸다(발언 원본은 그대로 둔다)
  const commitSpeakerEdits = (next) => {
    setSpeakerEdits(next);
    if (!transcriptId) return;
    setSpeakerSave("saving");
    saveSpeakerEdits(transcriptId, next)
      .then(() => setSpeakerSave("saved"))
      .catch(() => setSpeakerSave("error"));
  };
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
  const renameParagraphOnly = (ids, name) => {
    commitSpeakerEdits(assignByName(speakerEdits, speakers, ids, name));
    setOpenParagraphId(null);
  };
  const pickSpeakerForParagraph = (ids, key) => {
    commitSpeakerEdits(assignDialogues(speakerEdits, ids, key));
    setOpenParagraphId(null);
  };

  // 핵심요약에서 드래그된 근거 매칭 세그먼트 ID Set
  const evidenceMatchedIds = useMemo(() => {
    if (!evidenceQuery.trim()) return new Set();
    const q = evidenceQuery.toLowerCase();
    const matched = new Set();
    dialogues.forEach((d) => {
      if (d.text.toLowerCase().includes(q)) {
        matched.add(d.id);
      }
    });
    return matched;
  }, [dialogues, evidenceQuery]);

  // 화자 태그별 차분한 색상 매핑 (접근성 높은 단색/파스텔톤)
  const getSpeakerBadgeStyle = (speakerName) => {
    if (speakerName.includes("1") || speakerName.includes("기자") || speakerName.includes("A")) {
      return "bg-slate-100 text-slate-800 border-slate-300";
    }
    if (speakerName.includes("2") || speakerName.includes("취재") || speakerName.includes("B")) {
      return "bg-blue-50 text-blue-800 border-blue-200";
    }
    return "bg-zinc-100 text-zinc-800 border-zinc-200";
  };

  // STT 처리 완료 여부 (하단 큰 결과 박스 표시 조건)
  const hasSource = Boolean(audioUrl || storedSource);
  const isSTTCompleted = hasSource && dialogues.length > 0;

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
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
            STT 인터뷰 전사 & AI 요약
          </h1>
          <div className="relative mt-2">
            <button
              type="button"
              data-testid="stored-transcripts-toggle"
              onClick={toggleStoredMenu}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
              title="이전에 전사해 저장된 인터뷰를 다시 엽니다"
            >
              <FileAudio className="w-3 h-3 text-slate-500" />
              <span>저장된 전사 불러오기</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {storedMenu.open && (
              <div data-testid="stored-transcripts-menu" className="absolute left-0 top-full mt-1.5 w-[360px] max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-1.5 space-y-0.5">
                {storedMenu.status === "loading" && <p className="p-2 text-xs text-slate-500">저장된 전사를 불러오는 중…</p>}
                {storedMenu.status === "error" && <p role="alert" className="p-2 text-xs text-rose-600">{storedMenu.error}</p>}
                {storedMenu.status === "done" && storedMenu.items.length === 0 && (
                  <p className="p-2 text-xs text-slate-500">저장된 전사가 없습니다.</p>
                )}
                {storedMenu.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openStoredTranscript(item)}
                    className="w-full text-left p-2 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-900 truncate">{item.filename || "(파일명 없음)"}</span>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">
                        {new Date(item.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">발언 {item.segmentCount}개 · {formatDuration(item.durationSec)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {onReturnToArticle && (
          <button
            onClick={() => {
              const exportParts = [];
              if (aiSummary?.summary) {
                exportParts.push(`[AI 핵심 요약]\n${aiSummary.summary}`);
              }
              const exportText = dialogues.map((d) => d.text).join("\n\n");
              if (exportText) {
                exportParts.push(`[통합 전사 전문]\n${exportText}`);
              }
              onReturnToArticle(exportParts.join("\n\n---\n\n"), { id: storedSource?.id || currentTranscript?.id, filename: fileName });
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
            [상단 왼쪽: 6컬럼] 오디오 파일 업로드 및 재생
           ========================================================== */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between min-h-[350px]">
          {/* 카드 헤더 */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <FileAudio className="w-4 h-4 text-slate-700" />
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                오디오 파일 업로드 및 재생
              </h2>
            </div>
            {hasSource && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                title="다른 파일로 변경"
              >
                <Upload className="w-3 h-3 text-slate-500" />
                <span>파일 변경</span>
              </button>
            )}
          </div>

          {/* 카드 본문: 업로드 전 vs 업로드 후 */}
          {!hasSource ? (
            /* [빈 상태] 드래그 앤 드롭 업로드 영역 */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 my-3 rounded-xl border border-dashed transition-all duration-200 cursor-pointer flex flex-col items-center justify-center p-6 text-center space-y-3 ${
                isDragging
                  ? "border-slate-900 bg-slate-100 scale-[1.01]"
                  : "border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50"
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-2xs">
                <Upload className="w-6 h-6" />
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
                className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-black text-white text-xs font-bold transition shadow-xs"
              >
                파일 선택
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="audio/*,video/*,.mp3,.m4a,.wav,.webm"
                className="hidden"
              />
            </div>
          ) : (
            /* [업로드 완료 상태] 파일 정보, 절제된 파형 미리보기, 오디오 컨트롤러 */
            <div className="flex-1 flex flex-col justify-between py-2 space-y-4">
              {/* 파일명 및 재생 시간 정보 */}
              <div className="flex items-center justify-between text-xs pt-1">
                <div className="flex items-center gap-2 truncate max-w-[65%]">
                  <span className="font-bold text-slate-900 truncate" title={fileName}>
                    {fileName}
                  </span>
                  {fileSize > 0 && (
                    <span className="text-[11px] text-slate-400 font-mono shrink-0">
                      ({(fileSize / (1024 * 1024)).toFixed(1)}MB)
                    </span>
                  )}
                </div>
                {storedSource && (
                  <span className="text-[11px] text-slate-500 shrink-0 mr-2">저장된 전사 · 원본 오디오 없음</span>
                )}
                <div className="font-mono text-xs font-bold text-slate-600 shrink-0">
                  <span className="text-slate-950 font-bold">{formatDuration(currentTime)}</span>
                  <span className="mx-1 text-slate-300">/</span>
                  <span>{formatDuration(duration)}</span>
                </div>
              </div>

              {/* 절제된 파형 미리보기 (Waveform bars) */}
              <div className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl px-4 flex items-center justify-between gap-1 overflow-hidden">
                {WAVEFORM_BARS.map((heightPercent, idx) => {
                  const barProgress = idx / WAVEFORM_BARS.length;
                  const currentProgress = duration > 0 ? currentTime / duration : 0;
                  const isPlayed = barProgress <= currentProgress;

                  return (
                    <div
                      key={idx}
                      className="flex-1 flex items-center justify-center h-full"
                    >
                      <div
                        className={`w-full rounded-full transition-all duration-100 ${
                          isPlayed ? "bg-slate-900" : "bg-slate-200"
                        }`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* 프로그레스 슬라이더 */}
              <div className="space-y-1">
                <div className="relative flex items-center w-full h-3">
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden relative cursor-pointer">
                    <div
                      className="h-full bg-slate-900 rounded-full transition-all duration-700"
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
              </div>

              {/* 재생 컨트롤 바: 재생/일시정지, -10초, +10초, 볼륨, 재생속도 */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleTogglePlay}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5 fill-white" />
                        <span>일시정지</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
                        <span>재생</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleSeekOffset(-10)}
                    className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                    title="10초 뒤로 이동"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-500" />
                    <span>-10초</span>
                  </button>

                  <button
                    onClick={() => handleSeekOffset(10)}
                    className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
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
                      className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                    />
                  </div>

                  {/* 재생 속도 */}
                  <div className="relative">
                    <button
                      onClick={() => setIsSpeedMenuOpen(!isSpeedMenuOpen)}
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>{playbackSpeed}x</span>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>
                    {isSpeedMenuOpen && (
                      <div className="absolute right-0 bottom-full mb-1 w-20 bg-white rounded-xl p-1 z-50 space-y-0.5 border border-slate-200 shadow-md">
                        {[0.8, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                          <button
                            key={rate}
                            onClick={() => {
                              handleSpeedChange(rate);
                              setIsSpeedMenuOpen(false);
                            }}
                            className={`w-full px-2 py-1 text-left rounded-lg text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                              playbackSpeed === rate ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
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

          {/* 하단 상태 텍스트 */}
          <div className="pt-2 text-[11px] text-slate-400 font-medium border-t border-slate-100 flex items-center justify-between">
            <span>상태: {sttStatus}</span>
            {evidenceQuery && (
              <span className="text-slate-600 bg-amber-100 px-1.5 py-0.5 rounded font-bold">
                선택 근거 매칭 중
              </span>
            )}
          </div>
        </div>

        {/* ==========================================================
            [상단 오른쪽: 6컬럼] AI 핵심 요약
           ========================================================== */}
        <div
          className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between min-h-[350px]"
          onMouseUp={handleSummaryTextSelection}
          onKeyUp={handleSummaryTextSelection}
        >
          {/* 카드 헤더 */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-slate-700" />
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                AI 핵심 요약
              </h2>
            </div>

            {/* 재분석 / 복사 버튼 */}
            <div className="flex items-center gap-1.5">
              {currentTranscript && (
                <button
                  onClick={() => handleGenerateSummary()}
                  disabled={isAnalyzing}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="AI 요약 다시 생성"
                >
                  <RefreshCw className={`w-3 h-3 text-slate-500 ${isAnalyzing ? "animate-spin" : ""}`} />
                  <span>재분석</span>
                </button>
              )}
              {aiSummary && (
                <button
                  onClick={handleCopySummaryAll}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  title="요약 전체 복사"
                >
                  {isSummaryCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                  <span>{isSummaryCopied ? "복사됨" : "복사"}</span>
                </button>
              )}
            </div>
          </div>

          {/* 카드 본문: 첫 화면(빈 상태) vs 분석 중 vs 완료 */}
          {!hasSource ? (
            /* [첫 화면 빈 상태] */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
              <p className="text-xs font-bold text-slate-700">
                파일을 업로드하면 AI 핵심 요약이 표시됩니다
              </p>
              <p className="text-[11px] text-slate-400 max-w-xs">
                STT 전사 완료 후 3~5문장 요약, 주요 키워드, 핵심 발언이 자동으로 도출됩니다.
              </p>
            </div>
          ) : isAnalyzing ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
              <RefreshCw className="w-5 h-5 text-slate-700 animate-spin" />
              <p className="text-xs font-bold text-slate-800">
                AI가 녹취록 전문을 분석하고 있습니다…
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
            /* [분석 완료 상태] 독립적으로 세로 스크롤 가능 (얇은 스크롤바) */
            <div className="flex-1 my-2 max-h-[240px] overflow-y-auto pr-1 space-y-3.5 select-text cursor-text scrollbar-thin">
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
              <p className="text-xs text-slate-500">전사가 완료되었습니다.</p>
              <button
                onClick={() => handleGenerateSummary()}
                className="px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                AI 핵심 요약 생성
              </button>
            </div>
          )}

          {/* 하단 안내 문구 */}
          <div className="pt-2 text-[11px] text-slate-400 font-medium border-t border-slate-100 flex items-center justify-between">
            <span>요약 텍스트 드래그 시 하단 녹취 근거 자동 매칭</span>
            {aiSummary && <span className="text-slate-600 font-bold">생성 완료</span>}
          </div>
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
              <div className="lg:col-span-5 p-5 flex flex-col justify-between space-y-3">
                {/* 영역 헤더 */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      화자별 전사
                    </h3>
                    <span className="text-xs text-slate-400 font-mono">
                      ({paragraphs.length}개 단락)
                    </span>
                  </div>
                  <SpeakerHeaderActions editMode={editMode} edited={isEdited(speakerEdits)} saveState={speakerSave} onStart={startSpeakerEdit} onReset={() => commitSpeakerEdits(emptyEdits())} />
                </div>

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

                {/* 화자별 세그먼트 대화 목록 */}
                <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
                  {paragraphs.map((item) => {
                    const isSelected = item.ids.includes(selectedDialogueId);
                    const isCurrentActive = item.ids.includes(activeDialogueId);
                    const isEvidence = item.ids.some((segmentId) => evidenceMatchedIds.has(segmentId));

                    return (
                      <div
                        key={`speaker_segment_${item.id}`}
                        onClick={() => (editMode ? togglePicked(item.id) : handleSelectDialogue(item.timestamp, item.id))}
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
                            <SpeakerBadge
                              index={speakerIndex(speakers, item.speaker)}
                              name={item.speakerName}
                              open={openParagraphId === item.id}
                              disabled={editMode}
                              testId={`speaker-badge-${item.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenParagraphId((prev) => (prev === item.id ? null : item.id));
                              }}
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

                        {openParagraphId === item.id && !editMode && (
                          <SpeakerNameEditor
                            initialName={item.speakerName}
                            roster={roster}
                            currentKey={item.speaker}
                            onPick={(key) => pickSpeakerForParagraph(item.ids, key)}
                            onWhole={(name) => renameWholeSpeaker(item.speaker, name)}
                            onOnly={(name) => renameParagraphOnly(item.ids, name)}
                            onClose={() => setOpenParagraphId(null)}
                          />
                        )}

                        {/* 발화 텍스트 */}
                        <p className="text-xs text-slate-700 leading-relaxed font-sans pl-1">
                          {item.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ==========================================================
                  [하단 오른쪽: 7컬럼] 통합 텍스트 (박스 없는 순수 줄글 형태)
                 ========================================================== */}
              <div className="lg:col-span-7 p-5 flex flex-col justify-between space-y-3">
                {/* 영역 헤더: 제목 + 검색창 + 다운로드/복사 툴바 */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      통합 텍스트
                    </h3>
                    <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5" role="group" aria-label="통합 텍스트 형태">
                      {[["speaker", "화자·단락 구분"], ["plain", "통글"]].map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={textMode === mode}
                          data-testid={`text-mode-${mode}`}
                          onClick={() => setTextMode(mode)}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer ${
                            textMode === mode ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* 인라인 검색창 */}
                    <div className="relative w-36 sm:w-44">
                      <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        placeholder="단어 검색..."
                        className="w-full pl-7 pr-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                      />
                    </div>

                    {/* 전체 복사 버튼 */}
                    <button
                      onClick={handleCopyAllText}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer active:scale-95"
                      title="전체 텍스트 복사"
                    >
                      {isAllCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                      <span>전체 복사</span>
                    </button>

                    {/* 전문 다운로드 버튼 */}
                    <button
                      onClick={handleDownloadTxt}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer active:scale-95"
                      title="TXT 다운로드"
                    >
                      <Download className="w-3 h-3 text-slate-500" />
                      <span>다운로드</span>
                    </button>
                  </div>
                </div>

                {/* 통합 텍스트: 화자·단락 구분(같은 화자 발언을 한 단락으로) 또는 통글(이어진 한 덩어리 글) */}
                <div className="max-h-[580px] overflow-y-auto pr-2 space-y-3.5 text-xs md:text-sm leading-relaxed select-text font-sans scrollbar-thin" data-testid="unified-text" data-mode={textMode}>
                  {(() => {
                    // 발언 하나의 글자(검색어·요약 근거 강조 포함). 눌러서 그 시점으로 이동하는 동작은 그대로 둔다.
                    const segmentSpan = (item) => {
                      const isSelected = selectedDialogueId === item.id;
                      const isEvidence = evidenceMatchedIds.has(item.id);
                      const isMatchKeyword = searchKeyword.trim() && item.text.toLowerCase().includes(searchKeyword.toLowerCase());
                      const mark = (query) => item.text.split(new RegExp(`(${query})`, "gi")).map((part, i) =>
                        part.toLowerCase() === query.toLowerCase() ? (
                          <mark key={i} className="bg-amber-200 text-slate-950 font-bold px-0.5 rounded">{part}</mark>
                        ) : part
                      );
                      return (
                        <span
                          key={`unified_text_${item.id}`}
                          id={`unified_text_${item.id}`}
                          onClick={() => {
                            setSelectedDialogueId(item.id);
                            if (audioRef.current && audioUrl) {
                              setCurrentTime(item.timestamp);
                              audioRef.current.currentTime = item.timestamp;
                            }
                          }}
                          className={`cursor-pointer transition-colors ${isSelected ? "text-slate-950 font-medium" : "text-slate-700 hover:text-slate-900"}`}
                        >
                          {isMatchKeyword ? mark(searchKeyword) : isEvidence && evidenceQuery ? mark(evidenceQuery) : item.text}
                        </span>
                      );
                    };
                    const spaced = (items) => items.flatMap((item, index) => (index ? [" ", segmentSpan(item)] : [segmentSpan(item)]));
                    if (textMode === "plain") {
                      return <p className="leading-relaxed">{spaced(filteredDialogues)}</p>;
                    }
                    return paragraphs.map((paragraph) => (
                      <div key={`unified_paragraph_${paragraph.id}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${getSpeakerBadgeStyle(paragraph.speakerName)}`}>{paragraph.speakerName}</span>
                          <span className="font-mono text-[11px] text-slate-400">{formatDuration(paragraph.timestamp)}</span>
                        </div>
                        <p className="leading-relaxed">{spaced(paragraph.items)}</p>
                      </div>
                    ));
                  })()}
                </div>
              </div>

            </div>
          </div>

          {/* 하단에 큰 박스 밑에 배경과 박스와 구분 없는 자연스러운 페이드 그라데이션 */}
          <div className="w-full h-16 bg-gradient-to-b from-white via-white/60 to-transparent pointer-events-none rounded-b-2xl border-b border-transparent" />
        </div>
      )}
    </div>
  );
}
