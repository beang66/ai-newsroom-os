import React, { useState, useRef, useEffect, useMemo } from "react";
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
  Volume2,
  FileText,
  Users,
  Clock,
  Sparkles,
  AlignLeft,
  MessageSquare,
  FileAudio,
  ChevronDown
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

// 1시간 분량(약 58분)의 실전 취재 인터뷰 샘플 데이터
const DEFAULT_1HOUR_DIALOGUES = [
  {
    id: 1,
    speaker: "reporter",
    speakerName: "김동아 기자",
    timestamp: 0,
    text: "대표님, 바쁘신 일정 중에도 시간 내주셔서 감사합니다. 이번에 개발 완료된 차세대 온디바이스 NPU 및 PIM 반도체 성과 발표에 대해 업계의 관심이 매우 뜨겁습니다. 먼저 이번 프로젝트를 시작하시게 된 계기와 배경부터 설명 부탁드립니다."
  },
  {
    id: 2,
    speaker: "interviewee",
    speakerName: "홍길동 대표 (○○반도체)",
    timestamp: 42,
    text: "찾아와 주셔서 감사합니다. 아시다시피 최근 생성형 AI가 스마트폰부터 자율주행, 로봇까지 광범위하게 확산되면서 기존 GPU 기반 클라우드 연산 방식의 한계가 명확해졌습니다. 엄청난 전력 소모와 데이터센터 인프라 비용, 그리고 실시간 응답 지연 문제가 대표적이죠. 저희는 디바이스 자체에서 고성능 LLM을 초저전력으로 구동할 수 있는 칩셋이 필수적이라 판단하고 약 3년 전부터 독자 아키텍처 개발에 매진해 왔습니다."
  },
  {
    id: 3,
    speaker: "reporter",
    speakerName: "김동아 기자",
    timestamp: 165,
    text: "공개된 자료에 따르면 기존 상용 칩 대비 전력 효율이 70% 이상 개선되었다고 들었습니다. 하드웨어 설계 관점에서 이를 어떻게 구현할 수 있었는지 기술적 핵심을 짚어주실 수 있나요?"
  },
  {
    id: 4,
    speaker: "interviewee",
    speakerName: "홍길동 대표 (○○반도체)",
    timestamp: 215,
    text: "핵심은 크게 두 가지입니다. 첫째는 'PIM(Processing-In-Memory)' 구조를 채택하여 메모리와 연산 유닛 간의 데이터 병목(메모리 월 현상)을 원천 차단했습니다. 둘째는 정밀도를 잃지 않으면서도 연산량을 획기적으로 줄이는 동적 가중치 프루닝(Pruning) 및 양자화 전용 가속 회로를 내장한 것입니다. 이를 통해 불필요한 데이터 전송 전력을 완전히 없앴습니다."
  },
  {
    id: 5,
    speaker: "reporter",
    speakerName: "김동아 기자",
    timestamp: 410,
    text: "현재 글로벌 빅테크 기업들도 자체 AI 가속기를 경쟁적으로 쏟아내고 있습니다. 국내 스타트업 및 연구진으로서 수율과 양산 가격 경쟁력은 어떻게 확보하고 계신가요?"
  },
  {
    id: 6,
    speaker: "interviewee",
    speakerName: "홍길동 대표 (○○반도체)",
    timestamp: 472,
    text: "좋은 질문입니다. 저희는 최신 극미세 공정 대신 4나노 및 7나노 레거시/성숙 공정에서도 최고 효율을 낼 수 있는 회로 최적화에 집중했습니다. 그 결과 웨이퍼당 칩 생산 단가를 기존 글로벌 경쟁사 대비 40% 이상 낮출 수 있었고, 국내 파운드리 파트너십을 통해 초기 양산 수율을 이미 85% 이상 안정적으로 확보했습니다."
  },
  {
    id: 7,
    speaker: "reporter",
    speakerName: "김동아 기자",
    timestamp: 730,
    text: "소프트웨어 생태계와의 호환성도 중요한 과제일 텐데요. PyTorch나 Hugging Face 같은 오픈소스 프레임워크와의 연동은 어떻게 지원됩니까?"
  },
  {
    id: 8,
    speaker: "interviewee",
    speakerName: "홍길동 대표 (○○반도체)",
    timestamp: 785,
    text: "개발자 경험(DX)이 승패를 가른다고 생각합니다. 별도의 코드 수정 없이 단 한 줄의 플러그인 로드로 기존 파이토치 모델을 저희 NPU 바이너리로 원클릭 컴파일해 주는 전용 툴체인 소프트웨어를 함께 무료 공개했습니다. 이미 국내외 50여 개 AI 솔루션 파트너사에서 테스트를 진행하고 있습니다."
  },
  {
    id: 9,
    speaker: "reporter",
    speakerName: "김동아 기자",
    timestamp: 1120,
    text: "올해 하반기와 2027년을 아우르는 상용화 로드맵과 글로벌 진출 계획은 어떻게 구체화되고 있습니까?"
  },
  {
    id: 10,
    speaker: "interviewee",
    speakerName: "홍길동 대표 (○○반도체)",
    timestamp: 1180,
    text: "올해 3분기 말까지 주요 제조사용 양산 샘플 칩 공급을 완료하고, 내년 상반기 출시될 스마트 기기 및 AI 엣지 디바이스에 탑재될 예정입니다. 또한 미국 실리콘밸리에 현지 법인 설립을 마무리하여 북미와 일본의 자율주행 및 로봇 제조사들을 타깃으로 현지 PoC를 확대하고 있습니다."
  },
  {
    id: 11,
    speaker: "reporter",
    speakerName: "김동아 기자",
    timestamp: 1640,
    text: "정부의 AI 반도체 육성 정책이나 인재 확보 측면에서 현업에서 체감하시는 가장 큰 애로사항은 무엇인가요?"
  },
  {
    id: 12,
    speaker: "interviewee",
    speakerName: "홍길동 대표 (○○반도체)",
    timestamp: 1710,
    text: "가장 절실한 것은 실전 양산 경험을 갖춘 하드웨어-소프트웨어 풀스택 엔지니어의 공급입니다. 정부의 R&D 바우처나 실증 펀드 지원은 큰 힘이 되고 있지만, 장기적으로는 대학과 기업이 연계된 설계 전문 인력 양성 파이프라인이 더욱 촘촘해져야 글로벌 격차를 유지할 수 있습니다."
  },
  {
    id: 13,
    speaker: "reporter",
    speakerName: "김동아 기자",
    timestamp: 2280,
    text: "마지막으로 이번 인터뷰 기사를 접할 산업계 관계자들과 독자들에게 전하고 싶으신 메시지가 있다면 말씀 부탁드립니다."
  },
  {
    id: 14,
    speaker: "interviewee",
    speakerName: "홍길동 대표 (○○반도체)",
    timestamp: 2340,
    text: "한국이 메모리 반도체 강국을 넘어 AI 시대 시스템 반도체와 NPU 분야에서도 세계 최고 수준의 경쟁력을 가질 수 있다는 것을 이번 성과로 입증하고자 합니다. 국내 엔지니어들의 집념이 만든 혁신에 많은 관심과 응원을 부탁드립니다. 감사합니다."
  }
];

export default function InterviewStudio({ onReturnToArticle }) {
  // 1. 녹음 파일 및 인터뷰 상태
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [fileName, setFileName] = useState("2026_AI반도체_심층인터뷰_현장녹취.m4a");
  const [dialogues, setDialogues] = useState(DEFAULT_1HOUR_DIALOGUES);

  // 2. 뷰 모드 토글: 'speaker' (화자별 대화형) vs 'fullText' (전체 통 텍스트)
  const [viewMode, setViewMode] = useState("speaker");

  // 3. 검색 필터
  const [searchKeyword, setSearchKeyword] = useState("");

  // 4. 오디오 플레이어 상태
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(3520); // 58분 40초
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);

  // 5. 복사 피드백 상태
  const [copiedId, setCopiedId] = useState(null);
  const [isAllCopied, setIsAllCopied] = useState(false);

  // 가상 오디오 타이머 및 실제 Audio element ref
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const timelineRef = useRef(null);

  // 오디오 객체 재생/시간 제어
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

  // 실제 업로드 파일이 있는 경우 동기화
  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 3520);
    }
  };

  // 1. 녹음 파일 업로드 핸들러
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setFileName(file.name);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);

      // 새 파일 로드 시 시간 초기화
      setCurrentTime(0);
      setIsPlaying(false);

      // 간단한 안내
      alert(`"${file.name}" 파일이 성공적으로 로드되었습니다. 오디오 재생바와 인터뷰 텍스트를 바로 확인하실 수 있습니다.`);
    }
  };

  // 4. 화자 발언별 개별 복사 핸들러
  const handleCopySentence = (id, text, speakerName) => {
    const formatted = `[${speakerName}]\n"${text}"`;
    navigator.clipboard.writeText(formatted);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // 통 텍스트 전체 복사
  const handleCopyAllText = () => {
    const fullText = dialogues
      .map((d) => `[${d.speakerName} · ${formatDuration(d.timestamp)}]\n${d.text}`)
      .join("\n\n");
    navigator.clipboard.writeText(fullText);
    setIsAllCopied(true);
    setTimeout(() => setIsAllCopied(false), 2000);
  };

  // TXT 파일 다운로드
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

  // 5. 오디오 제어: 재생/일시정지
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

  // 되감기 / 빨리감기 (5초)
  const handleSeekOffset = (seconds) => {
    const target = Math.max(0, Math.min(duration, currentTime + seconds));
    setCurrentTime(target);
    if (audioRef.current && audioUrl) {
      audioRef.current.currentTime = target;
    }
  };

  // 재생 프로그레스 슬라이더 변경
  const handleSliderSeek = (e) => {
    const target = parseFloat(e.target.value);
    setCurrentTime(target);
    if (audioRef.current && audioUrl) {
      audioRef.current.currentTime = target;
    }
  };

  // 재생 속도 변경
  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  // 6. 화자 발언 구간으로 즉시 이동 (다시듣기)
  const handleJumpToTimestamp = (sec) => {
    setCurrentTime(sec);
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

  // 검색 적용된 발언 목록
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

  // 전체 통 텍스트 문자열
  const rawContinuousText = useMemo(() => {
    return dialogues
      .map((d) => `[${d.speakerName} · ${formatDuration(d.timestamp)}]\n${d.text}`)
      .join("\n\n");
  }, [dialogues]);

  // 통계 계산
  const totalWords = useMemo(() => {
    return dialogues.reduce((acc, cur) => acc + cur.text.split(/\s+/).length, 0);
  }, [dialogues]);

  const totalChars = useMemo(() => {
    return dialogues.reduce((acc, cur) => acc + cur.text.length, 0);
  }, [dialogues]);

  return (
    <div className="w-full space-y-5 animate-float-in pb-16">
      {/* 숨겨진 실제 HTML5 Audio 태그 (파일 업로드 시 구동) */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleAudioTimeUpdate}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* ──────────────────────────────────────────
          1. 상단 정보 카드 & 파일 업로드
         ────────────────────────────────────────── */}
      <div className="bg-white/95 rounded-3xl border border-slate-200/90 p-5 md:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-slate-900 text-white shadow-2xs">
              <FileAudio className="w-4 h-4 text-white" />
            </span>
            <h2 className="text-xl font-black text-slate-950 tracking-tight">
              인터뷰·녹취 스튜디오
            </h2>
            <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              전사 완료 (100%)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium pt-0.5">
            <span className="text-slate-800 font-bold truncate max-w-xs">{fileName}</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-slate-700 font-bold">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              총 {formatDuration(duration)} (약 58분)
            </span>
            <span>•</span>
            <span>화자 2명</span>
            <span>•</span>
            <span>{totalChars.toLocaleString()}자 ({totalWords.toLocaleString()}단어)</span>
          </div>
        </div>

        {/* 상단 업로드 및 기사 연동 액션 버튼 */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold transition shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>새 녹음 파일 업로드</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="audio/*,video/*,.mp3,.m4a,.wav"
            className="hidden"
          />

          {onReturnToArticle && (
            <button
              onClick={() => onReturnToArticle(rawContinuousText.slice(0, 300))}
              className="px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-xs font-extrabold transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
              title="녹취록 핵심 발췌를 기사 작성 화면으로 인계합니다"
            >
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              <span>기사 작성기로 내보내기</span>
            </button>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────
          4 & 5. 상단 고정(Sticky) 오디오 재생바 & 속도 조절
          (1시간 분량의 긴 녹취를 스크롤하면서도 항상 상단에서 조작 가능)
         ────────────────────────────────────────── */}
      <div className="sticky top-2 z-40 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 p-3.5 md:p-4 shadow-md space-y-2.5 transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* 재생 컨트롤 버튼 그룹: [ ▶ 재생하기 ] [ ↺ - 10초 ] [ +10초 ↻ ] [ 00:00 / 58:40 ] */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 1. 메인 재생 / 일시정지 (가장 앞) */}
            <button
              onClick={handleTogglePlay}
              className="px-5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-black text-xs md:text-sm flex items-center gap-2 shadow-xs transition cursor-pointer active:scale-95"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-white" />
                  <span>일시정지</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white ml-0.5" />
                  <span>재생하기</span>
                </>
              )}
            </button>

            {/* 2. 10초 뒤로: [ ↺ - 10초 ] */}
            <button
              onClick={() => handleSeekOffset(-10)}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 hover:text-slate-950 text-xs font-black transition cursor-pointer flex items-center gap-1.5 active:scale-95 border border-slate-200/70 shadow-2xs"
              title="10초 뒤로 이동"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
              <span>- 10초</span>
            </button>

            {/* 3. 10초 앞으로: [ +10초 ↻ ] */}
            <button
              onClick={() => handleSeekOffset(10)}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 hover:text-slate-950 text-xs font-black transition cursor-pointer flex items-center gap-1.5 active:scale-95 border border-slate-200/70 shadow-2xs"
              title="10초 앞으로 이동"
            >
              <span>+10초</span>
              <RotateCw className="w-3.5 h-3.5 text-slate-600" />
            </button>

            {/* 타임스탬프 표시: [ 00:00 / 58:40 ] */}
            <div className="ml-1 font-mono text-xs md:text-sm font-black text-slate-900 bg-slate-100 px-3.5 py-2 rounded-xl border border-slate-200/70">
              <span className="text-blue-600">{formatDuration(currentTime)}</span>
              <span className="text-slate-400 mx-1">/</span>
              <span className="text-slate-600">{formatDuration(duration)}</span>
            </div>
          </div>

          {/* 재생 속도 조절: 버튼 클릭 시 드롭다운 컨트롤바가 아래로 내려옴 */}
          <div className="relative self-end md:self-auto">
            <button
              onClick={() => setIsSpeedMenuOpen(!isSpeedMenuOpen)}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs md:text-sm transition cursor-pointer flex items-center gap-1.5 border border-slate-200/80 shadow-2xs active:scale-95"
              title="재생 속도 조절 메뉴 열기"
            >
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>재생속도: <strong className="text-slate-950">{playbackSpeed}x</strong></span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${isSpeedMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {/* 드롭다운 컨트롤 메뉴 (0.8x, 1.0x, 1.25x, 1.5x, 2.0x 간결한 표시) */}
            {isSpeedMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-2xl border border-slate-200 shadow-xl p-1.5 z-50 animate-float-in space-y-0.5">
                {[
                  { rate: 0.8, label: "0.8x" },
                  { rate: 1.0, label: "1.0x" },
                  { rate: 1.25, label: "1.25x" },
                  { rate: 1.5, label: "1.5x" },
                  { rate: 2.0, label: "2.0x" }
                ].map((item) => (
                  <button
                    key={item.rate}
                    onClick={() => {
                      handleSpeedChange(item.rate);
                      setIsSpeedMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                      playbackSpeed === item.rate
                        ? "bg-slate-950 text-white font-extrabold shadow-2xs"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span>{item.label}</span>
                    {playbackSpeed === item.rate && <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* 인터랙티브 타임라인 슬라이더 바 (호버 시 늘어나지 않고 h-2 크기 완전 고정) */}
        <div className="relative flex items-center w-full">
          <input
            type="range"
            min="0"
            max={duration}
            value={currentTime}
            onChange={handleSliderSeek}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-950"
          />
        </div>
      </div>

      {/* ──────────────────────────────────────────
          2. 뷰 모드 전환 및 유틸리티 툴바 (화자 필터 제거 & 버튼 사이즈 확대)
          [화자별 나누어 보기] vs [전체 통 텍스트 보기]
         ────────────────────────────────────────── */}
      <div className="bg-white/95 rounded-3xl border border-slate-200/90 p-4 md:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        
        {/* 좌측: 뷰 모드 전환 탭 (버튼 사이즈 크게 확대) */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/70 shadow-inner">
          <button
            onClick={() => setViewMode("speaker")}
            className={`px-5 md:px-6 py-2.5 md:py-3 rounded-xl text-xs md:text-sm font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
              viewMode === "speaker"
                ? "bg-white text-slate-950 shadow-sm font-black scale-[1.02]"
                : "text-slate-600 hover:text-slate-950"
            }`}
          >
            <MessageSquare className="w-4 h-4 md:w-5 md:h-5 text-slate-800" />
            <span>화자별 나누어 보기</span>
          </button>

          <button
            onClick={() => setViewMode("fullText")}
            className={`px-5 md:px-6 py-2.5 md:py-3 rounded-xl text-xs md:text-sm font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
              viewMode === "fullText"
                ? "bg-white text-slate-950 shadow-sm font-black scale-[1.02]"
                : "text-slate-600 hover:text-slate-950"
            }`}
          >
            <AlignLeft className="w-4 h-4 md:w-5 md:h-5 text-slate-800" />
            <span>전체 통 텍스트 보기</span>
          </button>
        </div>

        {/* 우측: 넉넉한 사이즈의 키워드 검색 및 전체 복사 / 다운로드 액션 */}
        <div className="flex items-center gap-3 flex-1 sm:flex-initial justify-end flex-wrap">
          {/* 키워드 검색창 */}
          <div className="relative min-w-[200px] md:min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="단어/키워드 검색..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm text-slate-900 outline-none focus:bg-white focus:border-slate-800 transition shadow-2xs"
            />
          </div>

          {/* 전체 복사 버튼 (확대) */}
          <button
            onClick={handleCopyAllText}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs md:text-sm font-black transition cursor-pointer flex items-center gap-2 shadow-xs active:scale-95"
            title="전체 인터뷰 녹취록 전문을 복사합니다"
          >
            {isAllCopied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                <span className="text-emerald-300">전체 복사됨</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-200" />
                <span>전체 복사</span>
              </>
            )}
          </button>

          {/* TXT 다운로드 (확대) */}
          <button
            onClick={handleDownloadTxt}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-xs md:text-sm font-extrabold transition cursor-pointer flex items-center gap-1.5 shadow-2xs border border-slate-200 active:scale-95"
            title="TXT 파일로 다운로드"
          >
            <Download className="w-4 h-4 text-slate-700" />
            <span className="hidden sm:inline">TXT 저장</span>
          </button>
        </div>

      </div>

      {/* ──────────────────────────────────────────
          MAIN WORKSPACE:
          모드 1. [화자별 대화형 뷰]
          모드 2. [전체 통 텍스트 뷰]
         ────────────────────────────────────────── */}
      {viewMode === "speaker" ? (
        /* ──────────────────────────────────────────
            모드 1. 화자별 나누어 보기 (화자 카드 & 타임스탬프 다시듣기 & 작은 복사 아이콘)
           ────────────────────────────────────────── */
        <div className="space-y-3.5">
          {filteredDialogues.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center text-slate-400 space-y-2">
              <Search className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-600">검색 조건에 맞는 발언이 없습니다.</p>
              <button
                onClick={() => {
                  setSearchKeyword("");
                  setSpeakerFilter("all");
                }}
                className="text-xs text-blue-600 font-bold hover:underline"
              >
                검색 조건 초기화
              </button>
            </div>
          ) : (
            filteredDialogues.map((item) => {
              const isActive = activeDialogueId === item.id;
              const isReporter = item.speaker === "reporter";

              return (
                <div
                  key={item.id}
                  className={`p-4 md:p-5 rounded-2xl border transition-all duration-200 group relative ${
                    isActive
                      ? "bg-blue-50/30 border-blue-400/80 shadow-md ring-2 ring-blue-500/20"
                      : isReporter
                      ? "bg-white/95 border-slate-200/90 hover:border-slate-300 shadow-2xs"
                      : "bg-[#F8FAFC] border-slate-200/90 hover:border-slate-300 shadow-2xs"
                  }`}
                >
                  {/* 카드 상단: 타임스탬프(다시듣기 링크) + 화자 명칭 + [복사 아이콘] */}
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      {/* 화자 뱃지 */}
                      <span
                        className={`text-xs font-black px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
                          isReporter
                            ? "bg-blue-50 text-blue-800 border-blue-200"
                            : "bg-slate-900 text-white border-slate-900"
                        }`}
                      >
                        <Users className="w-3 h-3" />
                        <span>{item.speakerName}</span>
                      </span>

                      {/* 6. 화자 발언 구간으로 이동 (다시듣기 버튼 - 확대) */}
                      <button
                        onClick={() => handleJumpToTimestamp(item.timestamp)}
                        className={`px-3 py-1 rounded-lg font-mono text-xs md:text-sm font-black transition flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 ${
                          isActive
                            ? "bg-blue-600 text-white shadow-xs scale-102"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-800 hover:text-slate-950"
                        }`}
                        title="이 발언 구간으로 즉시 이동하여 다시 재생합니다"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{formatDuration(item.timestamp)} 다시듣기</span>
                      </button>

                      {isActive && (
                        <span className="text-[11px] font-extrabold text-blue-600 bg-blue-100 px-2.5 py-0.5 rounded-full animate-pulse">
                          현재 재생 중
                        </span>
                      )}
                    </div>

                    {/* 3. 화자별 발언별 복사 아이콘 (확대) */}
                    <button
                      onClick={() => handleCopySentence(item.id, item.text, item.speakerName)}
                      className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition cursor-pointer flex items-center gap-1.5 active:scale-90"
                      title="이 발언 복사하기"
                    >
                      {copiedId === item.id ? (
                        <>
                          <Check className="w-4.5 h-4.5 text-emerald-600 stroke-[3]" />
                          <span className="text-xs font-black text-emerald-600">복사됨!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4.5 h-4.5 text-slate-500 hover:text-slate-800" />
                          <span className="text-xs font-bold text-slate-500 hidden sm:inline">복사</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* 발언 텍스트 (1시간 분량도 눈이 편안한 행간과 폰트 크기) */}
                  <p className="text-xs md:text-sm text-slate-900 leading-relaxed font-sans select-text">
                    {searchKeyword.trim() ? (
                      // 검색어 하이라이트 표시
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
            })
          )}
        </div>
      ) : (
        /* ──────────────────────────────────────────
            모드 2. 전체 통 텍스트 보기 (조서/신문 문서형 연속 텍스트)
           ────────────────────────────────────────── */
        <div className="bg-white/95 rounded-3xl border border-slate-200/90 p-6 md:p-10 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base md:text-lg font-black text-slate-950 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-700" />
                인터뷰 줄글 전문 (통 텍스트 뷰)
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                1시간 분량의 긴 녹취록을 한눈에 끊김 없이 읽고 필요한 단락을 자유롭게 복사할 수 있습니다.
              </p>
            </div>

            <button
              onClick={handleCopyAllText}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold transition shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              {isAllCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>전체 텍스트 복사 완료!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>통 텍스트 전체 복사</span>
                </>
              )}
            </button>
          </div>

          {/* 편안한 리딩 뷰 (적절한 줄바꿈과 넉넉한 폰트 리딩감) */}
          <div className="space-y-6 text-xs md:text-sm text-slate-800 leading-loose font-sans select-text max-w-4xl mx-auto">
            {dialogues.map((item) => (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                  <span
                    onClick={() => handleJumpToTimestamp(item.timestamp)}
                    className="font-mono text-blue-600 hover:underline cursor-pointer"
                    title="클릭 시 해당 시간부터 재생"
                  >
                    [{formatDuration(item.timestamp)}]
                  </span>
                  <span>{item.speakerName}</span>
                </div>
                <p className="text-slate-700 pl-4 border-l-2 border-slate-200">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
