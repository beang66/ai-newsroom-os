import React, { useState, useRef, useEffect, useMemo } from "react";
import { transcribeAudio } from "../../api/editorial";
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
  Clock,
  FileAudio,
  ChevronDown,
  ArrowUpRight,
  Share2,
  SlidersHorizontal,
  Volume2
} from "lucide-react";

// 초 단위를 '00:00' 또는 '00:00:00' 문자열로 포맷팅
function formatDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// 디자인 레퍼런스(Skiff Mail 스타일의 통합 2-Column 인터페이스) 초기 데이터
const DEFAULT_DEMO_DATA = {
  fileName: "2026_AI반도체_심층인터뷰_현장녹취.m4a",
  duration: 3520, // 58분 40초
  dialogues: [
    {
      id: "diag_01",
      speaker: "reporter",
      speakerName: "김동아 기자",
      role: "질문자",
      timestamp: 0,
      avatarBg: "bg-blue-500",
      avatarEmoji: "🎙️",
      text: "대표님, 바쁘신 일정 중에도 시간 내주셔서 감사합니다. 이번에 개발 완료된 차세대 온디바이스 NPU 및 PIM 반도체 성과 발표에 대해 업계의 관심이 매우 뜨겁습니다. 먼저 이번 프로젝트를 시작하시게 된 계기와 배경부터 설명 부탁드립니다."
    },
    {
      id: "diag_02",
      speaker: "interviewee",
      speakerName: "홍길동 대표 (OO반도체)",
      role: "답변자",
      timestamp: 42,
      avatarBg: "bg-amber-500",
      avatarEmoji: "💼",
      text: "찾아와 주셔서 감사합니다. 아시다시피 최근 생성형 AI가 스마트폰부터 자율주행, 로봇까지 광범위하게 확산되면서 기존 GPU 기반 클라우드 연산 방식의 한계가 명확해졌습니다. 엄청난 전력 소모와 데이터센터 인프라 비용, 그리고 실시간 응답 지연 문제가 대표적이죠. 저희는 디바이스 자체에서 고성능 LLM을 초저전력으로 구동할 수 있는 칩셋이 필수적이라 판단하고 약 3년 전부터 독자 아키텍처 개발에 매진해 왔습니다."
    },
    {
      id: "diag_03",
      speaker: "reporter",
      speakerName: "김동아 기자",
      role: "질문자",
      timestamp: 165,
      avatarBg: "bg-blue-500",
      avatarEmoji: "🎙️",
      text: "공개된 자료에 따르면 기존 상용 칩 대비 전력 효율이 70% 이상 개선되었다고 들었습니다. 하드웨어 설계 관점에서 이를 어떻게 구현할 수 있었는지 기술적 핵심을 짚어주실 수 있나요?"
    },
    {
      id: "diag_04",
      speaker: "interviewee",
      speakerName: "홍길동 대표 (OO반도체)",
      role: "답변자",
      timestamp: 215,
      avatarBg: "bg-amber-500",
      avatarEmoji: "💼",
      text: "핵심은 크게 두 가지입니다. 첫째는 'PIM(Processing-In-Memory)' 구조를 채택하여 메모리와 연산 유닛 간의 데이터 병목(메모리 월 현상)을 원천 차단했습니다. 둘째는 정밀도를 잃지 않으면서도 연산량을 획기적으로 줄이는 동적 가중치 프루닝(Pruning) 및 양자화 전용 가속 회로를 내장한 것입니다. 이를 통해 불필요한 데이터 전송 전력을 완전히 없앴습니다."
    },
    {
      id: "diag_05",
      speaker: "reporter",
      speakerName: "김동아 기자",
      role: "질문자",
      timestamp: 410,
      avatarBg: "bg-blue-500",
      avatarEmoji: "🎙️",
      text: "현재 글로벌 빅테크 기업들도 자체 AI 가속기를 경쟁적으로 쏟아내고 있습니다. 국내 스타트업 및 연구진으로서 수율과 양산 가격 경쟁력은 어떻게 확보하고 계신가요?"
    },
    {
      id: "diag_06",
      speaker: "interviewee",
      speakerName: "홍길동 대표 (OO반도체)",
      role: "답변자",
      timestamp: 472,
      avatarBg: "bg-amber-500",
      avatarEmoji: "💼",
      text: "좋은 질문입니다. 저희는 최신 극미세 공정 대신 4나노 및 7나노 레거시/성숙 공정에서도 최고 효율을 낼 수 있는 회로 최적화에 집중했습니다. 그 결과 웨이퍼당 칩 생산 단가를 기존 글로벌 경쟁사 대비 40% 이상 낮출 수 있었고, 국내 파운드리 파트너십을 통해 초기 양산 수율을 이미 85% 이상 안정적으로 확보했습니다."
    }
  ]
};

export default function InterviewStudio({ onReturnToArticle }) {
  // 1. 녹음 파일 및 인터뷰 상태
  const [audioUrl, setAudioUrl] = useState(null);
  const [fileName, setFileName] = useState(DEFAULT_DEMO_DATA.fileName);
  const [dialogues, setDialogues] = useState(DEFAULT_DEMO_DATA.dialogues);
  const [sttStatus, setSttStatus] = useState("전사 완료 100%");

  // 2. 검색 및 선택 상태
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedDialogueId, setSelectedDialogueId] = useState(DEFAULT_DEMO_DATA.dialogues[0].id);

  // 3. 오디오 플레이어 상태
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(DEFAULT_DEMO_DATA.duration);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);

  // 4. 복사 피드백 상태
  const [copiedId, setCopiedId] = useState(null);
  const [isAllCopied, setIsAllCopied] = useState(false);

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
      setDuration(audioRef.current.duration || DEFAULT_DEMO_DATA.duration);
    }
  };

  // 1. 녹음 파일 업로드 핸들러
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);

      setCurrentTime(0);
      setIsPlaying(false);

      setDialogues([]);
      setSttStatus("전사 진행 중…");
      transcribeAudio(file)
        .then((result) => {
          if (result.dialogues && result.dialogues.length > 0) {
            setDialogues(result.dialogues);
            setSelectedDialogueId(result.dialogues[0].id);
            setSttStatus("전사 완료 100%");
          } else {
            setSttStatus("전사 완료 (발언 없음)");
          }
        })
        .catch((error) => {
          setSttStatus("전사 실패: " + (error?.message || error));
        });
    }
  };

  // 2. 화자 발언별 개별 복사 핸들러
  const handleCopySentence = (id, text, speakerName) => {
    const formatted = `[${speakerName}]\n"${text}"`;
    navigator.clipboard.writeText(formatted);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // 3. 통 텍스트 전체 복사
  const handleCopyAllText = () => {
    const fullText = dialogues
      .map((d) => `[${d.speakerName} · ${formatDuration(d.timestamp)}]\n${d.text}`)
      .join("\n\n");
    navigator.clipboard.writeText(fullText);
    setIsAllCopied(true);
    setTimeout(() => setIsAllCopied(false), 2000);
  };

  // 4. TXT 파일 다운로드
  const handleDownloadTxt = () => {
    const fullText = dialogues
      .map((d) => `[${d.speakerName} · ${formatDuration(d.timestamp)}]\n${d.text}`)
      .join("\n\n");
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName.replace(/\.[^/.]+$/, "")}_녹취록.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 5. 오디오 제어
  const handleTogglePlay = () => {
    if (audioRef.current && audioUrl) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeekOffset = (seconds) => {
    const target = Math.max(0, Math.min(duration, currentTime + seconds));
    setCurrentTime(target);
    if (audioRef.current && audioUrl) {
      audioRef.current.currentTime = target;
    }
  };

  const handleSliderSeek = (e) => {
    const target = parseFloat(e.target.value);
    setCurrentTime(target);
    if (audioRef.current && audioUrl) {
      audioRef.current.currentTime = target;
    }
  };

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const handleJumpToTimestamp = (sec, id) => {
    setCurrentTime(sec);
    if (id) setSelectedDialogueId(id);
    if (audioRef.current && audioUrl) {
      audioRef.current.currentTime = sec;
      audioRef.current.play();
    }
    setIsPlaying(true);
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

  return (
    <div className="w-full max-w-[1580px] mx-auto animate-float-in pb-16 font-sans text-slate-800">
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
          1. 상단 타이틀 & 설명 헤더 영역 (레퍼런스 이미지 헤더 스타일)
         ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-6 pt-1">
        <div className="space-y-1.5">
          {/* 미니 핑크 칩 태그 */}
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#FCE7F3] text-[#BE185D] text-[10px] font-extrabold uppercase tracking-wider">
            <span>STT STUDIO</span>
          </div>

          {/* 메인 타이틀 */}
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-950 tracking-tight">
            인터뷰·녹취 스튜디오
          </h1>

          {/* 서브 설명 문구 */}
          <p className="text-xs md:text-sm text-slate-400 font-normal leading-relaxed max-w-2xl">
            실시간 AI 화자 분리와 발언 타임라인 분석을 통해 인터뷰 녹취록을 안전하고 체계적으로 관리합니다.
          </p>
        </div>

        {/* 우측 상단: 기사 작성기로 내보내기 액션 (우측 상단 ↗ 아이콘 버튼) */}
        {onReturnToArticle && (
          <button
            onClick={() => {
              const exportText = dialogues
                .map((d) => `[${d.speakerName} · ${formatDuration(d.timestamp)}]\n${d.text}`)
                .join("\n\n");
              onReturnToArticle(exportText);
            }}
            className="w-10 h-10 rounded-2xl bg-[#F0F3F8] text-slate-700 hover:text-slate-950 flex items-center justify-center transition cursor-pointer active:scale-95 shrink-0"
            style={{
              boxShadow: "-3px -3px 8px rgba(255, 255, 255, 0.9), 3px 3px 8px rgba(166, 180, 200, 0.28)"
            }}
            title="녹취록 전체를 기사 작성기로 내보내기"
          >
            <ArrowUpRight className="w-4 h-4 text-slate-600" />
          </button>
        )}
      </div>      {/* ──────────────────────────────────────────────────────────
          2. 독립된 오디오 컨트롤 Surface (Soft UI / Neumorphism)
         ────────────────────────────────────────────────────────── */}
      <div
        className="w-full rounded-[30px] p-5 md:p-6 mb-7 space-y-4"
        style={{
          background: "#F0F3F7",
          boxShadow: "-12px -12px 26px rgba(255, 255, 255, 0.85), 12px 12px 26px rgba(166, 180, 200, 0.28)"
        }}
      >
        {/* 상단: 화자 구분 대화 / 전사 완료 100% / 파일 변경 버튼 */}
        <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-200/50">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              화자 구분 대화
            </h2>
            <span
              className="text-[11px] font-bold text-emerald-700 bg-[#E8F5E9] px-2.5 py-0.5 rounded-full ml-1"
              style={{
                boxShadow: "inset 1px 1px 2px rgba(166, 180, 200, 0.2), inset -1px -1px 2px rgba(255, 255, 255, 0.7)"
              }}
            >
              {sttStatus}
            </span>
          </div>

          {/* [녹음 파일 변경] 업로드 버튼 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 rounded-xl bg-[#F0F3F8] hover:bg-[#EAEFF5] text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              style={{
                boxShadow: "-2px -2px 5px rgba(255, 255, 255, 0.9), 2px 2px 5px rgba(166, 180, 200, 0.22)"
              }}
              title="새로운 오디오 녹음 파일을 선택하여 업로드하고 분석합니다"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>파일 변경</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="audio/*,video/*,.mp3,.m4a,.wav,.webm"
              className="hidden"
            />
          </div>
        </div>

        {/* 중간: 파일 아이콘 + 파일명 + 타임코드 & 음각 프로그레스 슬라이더 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 truncate max-w-[65%]">
              <FileAudio className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="truncate tracking-tight" title={fileName}>{fileName}</span>
            </div>
            <div className="font-mono text-xs font-bold text-slate-500 shrink-0">
              <span className="text-slate-900 font-extrabold">{formatDuration(currentTime)}</span>
              <span className="mx-1 text-slate-400">/</span>
              <span className="text-slate-500">{formatDuration(duration)}</span>
            </div>
          </div>

          {/* 음각 프로그레스 슬라이더 트랙 */}
          <div className="relative flex items-center w-full">
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSliderSeek}
              className="w-full h-1.5 bg-[#E2E8F0] rounded-full appearance-none cursor-pointer accent-slate-900"
              style={{
                boxShadow: "inset 1px 1px 3px rgba(166, 180, 200, 0.4), inset -1px -1px 3px rgba(255, 255, 255, 0.9)"
              }}
              title={`재생 위치: ${formatDuration(currentTime)}`}
            />
          </div>
        </div>

        {/* 하단: 미니 컨트롤러 바 (재생/일시정지, -10초, +10초, 배속) */}
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-2">
            <button
              onClick={handleTogglePlay}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
              title={isPlaying ? "일시정지" : "재생"}
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
              className="px-2.5 py-1.5 rounded-xl bg-[#F0F3F8] hover:bg-[#EAEFF5] text-slate-700 text-xs font-medium flex items-center gap-1 transition cursor-pointer active:scale-95"
              style={{
                boxShadow: "-2px -2px 5px rgba(255, 255, 255, 0.9), 2px 2px 5px rgba(166, 180, 200, 0.22)"
              }}
              title="10초 뒤로 이동"
            >
              <RotateCcw className="w-3 h-3 text-slate-500" />
              <span>-10초</span>
            </button>

            <button
              onClick={() => handleSeekOffset(10)}
              className="px-2.5 py-1.5 rounded-xl bg-[#F0F3F8] hover:bg-[#EAEFF5] text-slate-700 text-xs font-medium flex items-center gap-1 transition cursor-pointer active:scale-95"
              style={{
                boxShadow: "-2px -2px 5px rgba(255, 255, 255, 0.9), 2px 2px 5px rgba(166, 180, 200, 0.22)"
              }}
              title="10초 앞으로 이동"
            >
              <span>+10초</span>
              <RotateCw className="w-3 h-3 text-slate-500" />
            </button>
          </div>

          {/* 재생 속도 드롭다운 */}
          <div className="relative">
            <button
              onClick={() => setIsSpeedMenuOpen(!isSpeedMenuOpen)}
              className="px-2.5 py-1.5 rounded-xl bg-[#F0F3F8] hover:bg-[#EAEFF5] text-slate-700 text-xs font-medium flex items-center gap-1 transition cursor-pointer active:scale-95"
              style={{
                boxShadow: "-2px -2px 5px rgba(255, 255, 255, 0.9), 2px 2px 5px rgba(166, 180, 200, 0.22)"
              }}
              title="재생 속도 조절"
            >
              <span>{playbackSpeed}x</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {isSpeedMenuOpen && (
              <div
                className="absolute right-0 bottom-full mb-2 w-24 bg-[#F0F3F8] rounded-2xl p-1.5 z-50 space-y-0.5 border border-slate-200/60"
                style={{
                  boxShadow: "-4px -4px 10px rgba(255, 255, 255, 0.9), 6px 6px 12px rgba(166, 180, 200, 0.3)"
                }}
              >
                {[0.8, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => {
                      handleSpeedChange(rate);
                      setIsSpeedMenuOpen(false);
                    }}
                    className={`w-full px-2 py-1 text-left rounded-lg text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                      playbackSpeed === rate
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-[#E2E8F0]"
                    }`}
                  >
                    <span>{rate}x</span>
                    {playbackSpeed === rate && <Check className="w-3 h-3 text-emerald-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────
          3. STT 콘텐츠 Surface (화자 구분 대화 & 통글 원문)
         ────────────────────────────────────────────────────────── */}
      <div
        className="relative rounded-t-[32px] rounded-b-none grid grid-cols-1 lg:grid-cols-12 overflow-hidden items-stretch"
        style={{
          background: "linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 50%, rgba(248, 247, 244, 0.7) 75%, #F8F7F4 100%)",
          boxShadow: "0 -4px 20px -2px rgba(0, 0, 0, 0.02), -10px 0 24px -6px rgba(0, 0, 0, 0.02), 10px 0 24px -6px rgba(0, 0, 0, 0.02)",
          WebkitMaskImage: "linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 75%, rgba(0, 0, 0, 0) 100%)",
          maskImage: "linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 75%, rgba(0, 0, 0, 0) 100%)"
        }}
      >
        
        {/* ==========================================================
            [좌측 영역] 화자별 STT 대화록 (lg:col-span-7)
           ========================================================== */}
        <div className="lg:col-span-7 border-b lg:border-b-0 lg:border-r border-slate-100/70 p-6 md:p-8 flex flex-col justify-between space-y-6 bg-transparent">
          <div className="space-y-4">
            
            {/* 좌측 상단 헤더: 화자별 발언 타임라인 안내 */}
            <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                화자별 발언 타임라인
              </h3>
              <span className="text-xs text-slate-400 font-medium">
                총 {dialogues.length}개 발언
              </span>
            </div>

            {/* STT 화자 구분 결과 리스트 (분량이 방대해지면 내부 스크롤 가능하도록 max-h 지정) */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1.5">
              {filteredDialogues.map((item) => {
                const isCurrentActive = activeDialogueId === item.id;
                const isSelected = selectedDialogueId === item.id;
                const isReporter = item.speaker === "reporter" || item.speakerName.includes("기자");

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedDialogueId(item.id);
                      handleJumpToTimestamp(item.timestamp, item.id);
                    }}
                    className={`group flex items-start gap-3.5 p-3.5 rounded-2xl transition cursor-pointer ${
                      isSelected
                        ? "bg-white shadow-sm border border-slate-100"
                        : "hover:bg-slate-50/70"
                    }`}
                  >
                    {/* 선택 인디케이터 도트 */}
                    <div className="pt-1.5 shrink-0">
                      <span
                        className={`block w-2.5 h-2.5 rounded-full transition-all ${
                          isSelected
                            ? "bg-[#E11D48] ring-4 ring-rose-200/60"
                            : isCurrentActive
                            ? "bg-blue-600 ring-4 ring-blue-200/60"
                            : "bg-slate-300 group-hover:bg-slate-400"
                        }`}
                      />
                    </div>

                    {/* 화자 아바타 (소프트 칩) */}
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                        isReporter ? "bg-blue-100/90 text-blue-700" : "bg-amber-100/90 text-amber-700"
                      }`}
                    >
                      {isReporter ? "기자" : "대표"}
                    </div>

                    {/* 화자명 & 발언 요약 */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-slate-900 truncate">
                          {item.speakerName}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 font-medium shrink-0">
                          {formatDuration(item.timestamp)}
                        </span>
                      </div>

                      {/* 발언 텍스트 */}
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {item.text}
                      </p>
                    </div>

                    {/* 개별 발언 복사 버튼 [📋] */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopySentence(item.id, item.text, item.speakerName);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer self-center opacity-0 group-hover:opacity-100"
                      title="이 발언 내용 복사"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        {/* ==========================================================
            [오른쪽 영역] 통글 원문 — 단일 Soft Surface 리딩 뷰어 (lg:col-span-5)
           ========================================================== */}
        <div className="lg:col-span-5 p-6 md:p-8 flex flex-col justify-between space-y-5 bg-transparent">
          <div className="space-y-4">
            
            {/* 우측 상단 툴바: 음각 검색창 & 양각 복사 / TXT 다운로드 액션 */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              {/* 인라인 음각 검색창 */}
              <div className="relative flex-1 max-w-[210px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="단어 검색..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none transition"
                  style={{
                    boxShadow: "inset 1px 1px 3px rgba(0, 0, 0, 0.04)"
                  }}
                />
              </div>

              {/* 툴바 아이콘 그룹: 전체 복사, TXT 저장 (소프트 양각 버튼) */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyAllText}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-950 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95 border border-slate-100/80 shadow-xs"
                  title="전체 대화록 전문 클립보드 복사"
                >
                  {isAllCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                  <span>전체 복사</span>
                </button>

                <button
                  onClick={handleDownloadTxt}
                  className="p-1.5 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-xl text-xs font-medium transition cursor-pointer active:scale-95 border border-slate-100/80 shadow-xs"
                  title="TXT 파일로 다운로드"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 통글 원문 섹션 타이틀 */}
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                통글 원문 (Full Transcript)
              </h3>
              <p className="text-xs text-slate-400">
                인터뷰 전체 발언을 단락 구분 없이 통글 형태로 매끄럽게 열람합니다.
              </p>
            </div>

            {/* 자연스러운 통글 리딩 뷰어 (분량이 방대해지면 내부 스크롤 가능하도록 max-h 지정) */}
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1.5 select-text leading-relaxed font-sans text-xs md:text-sm text-slate-800">
              {dialogues.map((item) => {
                const isSelected = selectedDialogueId === item.id;
                const isMatch =
                  searchKeyword.trim() &&
                  item.text.toLowerCase().includes(searchKeyword.toLowerCase());

                return (
                  <div
                    key={`transcript_${item.id}`}
                    onClick={() => handleJumpToTimestamp(item.timestamp, item.id)}
                    className={`space-y-1 p-2.5 rounded-2xl transition cursor-pointer ${
                      isSelected
                        ? "bg-white shadow-xs border border-slate-100"
                        : "hover:bg-slate-50/70"
                    }`}
                  >
                    {/* [화자명 - 타임코드] */}
                    <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                      <span className="font-mono text-blue-600">
                        [{formatDuration(item.timestamp)}]
                      </span>
                      <span>{item.speakerName}</span>
                    </div>

                    {/* 통글 본문 */}
                    <p className="text-slate-700 leading-relaxed pl-2 border-l-2 border-slate-200">
                      {isMatch ? (
                        item.text.split(new RegExp(`(${searchKeyword})`, "gi")).map((part, i) =>
                          part.toLowerCase() === searchKeyword.toLowerCase() ? (
                            <mark key={i} className="bg-amber-200 text-slate-950 font-bold px-0.5 rounded">
                              {part}
                            </mark>
                          ) : (
                            part
                          )
                        )
                      ) : (
                        item.text
                      )}
                    </p>
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        {/* 박스 하단 경계를 완전히 없애고 배경(#F8F7F4)과 자연스럽게 연결하는 대형 그라데이션 페이드 */}
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-36 md:h-44 bg-gradient-to-t from-[#F8F7F4] via-[#F8F7F4]/80 to-transparent z-20" />

      </div>
    </div>
  );
}
