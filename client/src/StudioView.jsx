import React, { useState, useRef, useEffect, useMemo } from 'react';
import './StudioView.css';

/**
 * 밀리초(ms)를 MM:SS 형식으로 변환
 */
function formatTime(ms) {
  if (typeof ms !== 'number' || isNaN(ms)) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * 초(sec)를 MM:SS 형식으로 변환
 */
function formatSeconds(sec) {
  if (typeof sec !== 'number' || isNaN(sec)) return '00:00';
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// 실제 STT 변환 전에도 UI를 미리 확인할 수 있는 기본 샘플 데이터
const DEFAULT_SAMPLE_TRANSCRIPT = {
  text: "할 것 같아요. 얼마든지 그다음에 시간이 지나면 AI 기자도 나온다고 하잖아요. 근데 그렇게 될 수 있겠지만 근데 어쨌든 취재라는 것 자체가 개인적인 영역을 취재를 해가지고 기사를 쓰는 거기 때문에 AI가 기자를 완전히 대체하기는 어려울 거라고 봅니다.",
  confidence: 0.88,
  segments: [
    {
      start: 0,
      end: 7000,
      text: "할 것 같아요. 얼마든지 그다음에 시간이 지나면 AI 기자도 나온다고 하잖아요.",
      confidence: 0.82,
      words: [
        { start: 0, end: 1200, text: "할 것 같아요." },
        { start: 1300, end: 2500, text: "얼마든지" },
        { start: 2600, end: 4000, text: "그다음에" },
        { start: 4100, end: 5200, text: "시간이 지나면" },
        { start: 5300, end: 7000, text: "AI 기자도 나온다고 하잖아요." }
      ]
    },
    {
      start: 7000,
      end: 11000,
      text: "근데 그렇게 될 수 있겠지만 근데 어쨌든",
      confidence: 0.88,
      words: [
        { start: 7000, end: 8500, text: "근데" },
        { start: 8600, end: 9800, text: "그렇게 될 수 있겠지만" },
        { start: 9900, end: 11000, text: "근데 어쨌든" }
      ]
    },
    {
      start: 11000,
      end: 18000,
      text: "취재라는 것 자체가 개인적인 영역을 취재를 해가지고 기사를 쓰는 거기 때문에 AI가 기자를 완전히 대체하기는 어려울 거라고 봅니다.",
      confidence: 0.92,
      words: [
        { start: 11000, end: 12800, text: "취재라는 것 자체가" },
        { start: 12900, end: 14500, text: "개인적인 영역을 취재를 해가지고" },
        { start: 14600, end: 16200, text: "기사를 쓰는 거기 때문에" },
        { start: 16300, end: 18000, text: "완전히 대체하기는 어려울 거라고 봅니다." }
      ]
    }
  ]
};

const DEFAULT_SAMPLE_AI_RESULT = {
  summary: "시간이 흐름에 따라 AI 기자의 도입 가능성은 점차 높아지고 있으나, 취재 활동 본연의 인간적이고 개별적인 영역으로 인해 AI가 인간 기자를 완전히 대체하는 데에는 명확한 한계가 존재한다는 분석입니다.",
  keyPoints: [
    "기술 발전에 따른 AI 기자 등장 가능성 인정",
    "취재의 본질은 개인적이고 심층적인 영역 탐구",
    "인간 고유의 취재 역량은 AI로 완전 대체 불가",
    "미래 저널리즘에서 인간 기자의 차별화된 역할 부각"
  ],
  keywords: ["AI 기자", "취재 본질", "인간 대체", "저널리즘", "개인적 영역"]
};

export default function StudioView({
  transcriptData = null,
  audioSource = null,
  fileName = 'interview_recording_01.mp3',
  selectedFile = null,
  recordedBlob = null,
  isRecording = false,
  recordingDuration = 0,
  onStartRecording = () => {},
  onStopRecording = () => {},
  aiResult = null,
  serverHealth = null,
  onFileSelect = () => {},
  onRunSTT = () => {},
  onReset = () => {},
  isSTTLoading = false,
  sttError = null,
  onRunAiAnalysis = null,
  isAiAnalyzing = false
}) {
  // 실제 STT 변환 결과가 있을 때만 데이터 사용 (기본 화면은 빈 화면으로 출력)
  const currentTranscript = transcriptData || null;
  const currentAiResult = aiResult || null;

  // 1. 오디오 플레이어 참조 및 상태
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  // 2. 사용자가 클릭하여 선택한 세그먼트 인덱스
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(null);

  // 3. 단어 시간 보기 펼침 상태 (세그먼트 인덱스 Set)
  const [expandedWordSegments, setExpandedWordSegments] = useState(new Set());

  // 4. 통 텍스트 검색어 상태
  const [searchTerm, setSearchTerm] = useState('');

  // 5. 토스트 알림 상태
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  // 리셋 핸들러 (오디오 정지 및 초기 기본 샘플로 복귀)
  const handleResetClick = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setSelectedSegmentIndex(null);
    onReset();
    showToast('기본 화면으로 리셋되었습니다.');
  };

  // 단어 총합 계산
  const totalWordCount = useMemo(() => {
    if (!currentTranscript?.segments) return 0;
    return currentTranscript.segments.reduce((acc, seg) => {
      const wordsCount = Array.isArray(seg.words) && seg.words.length > 0
        ? seg.words.length
        : (seg.text ? seg.text.trim().split(/\s+/).length : 0);
      return acc + wordsCount;
    }, 0);
  }, [currentTranscript]);

  // [Audio Debug] 콘솔 출력 함수 (요구사항 18)
  const logAudioDebug = (label = 'Status Check') => {
    const audio = audioRef.current;
    console.log(`========== [Audio Debug] (${label}) ==========`);
    console.log('파일명:', selectedFile?.name || (recordedBlob ? 'recording.webm' : fileName));
    console.log('파일 타입:', selectedFile?.type || (recordedBlob ? recordedBlob.type : 'audio/unknown'));
    console.log('파일 크기:', selectedFile?.size ? `${selectedFile.size} bytes` : (recordedBlob?.size ? `${recordedBlob.size} bytes` : '0 bytes'));
    console.log('audio.src:', audio ? audio.src : 'undefined');
    console.log('audio.duration:', audio ? audio.duration : 'undefined');
    console.log('audio.currentTime:', audio ? audio.currentTime : 'undefined');
    console.log('audio.paused:', audio ? audio.paused : 'undefined');
    console.log('audio.readyState:', audio ? audio.readyState : 'undefined');
    console.log('================================================');
  };

  // 총 재생 시간 계산 (실제 오디오 duration 우선, 없으면 transcript의 마지막 세그먼트 end 사용)
  const totalDurationMs = useMemo(() => {
    if (duration > 0 && !isNaN(duration) && isFinite(duration)) {
      return duration * 1000;
    }
    if (currentTranscript?.segments?.length > 0) {
      return currentTranscript.segments[currentTranscript.segments.length - 1].end || 0;
    }
    return 0;
  }, [duration, currentTranscript]);

  // 오디오 소스 변경 및 명시적 로드 처리 (요구사항 3, 19, 20)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audioSource) {
      audio.src = audioSource;
      audio.load();
      logAudioDebug('오디오 소스 설정 및 로드 시작');
    } else {
      audio.removeAttribute('src');
      audio.load();
      setDuration(0);
      setCurrentTime(0);
      setIsPlaying(false);
    }
  }, [audioSource]);

  // 오디오 이벤트 연결 (요구사항 4, 5, 6, 8, 18, 20)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      logAudioDebug('loadedmetadata (메타데이터 로드 완료)');
    };

    const handleCanPlay = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      logAudioDebug('canplay (재생 가능)');
    };

    const handlePlay = () => {
      setIsPlaying(true);
      logAudioDebug('play (재생 시작)');
    };

    const handlePause = () => {
      setIsPlaying(false);
      logAudioDebug('pause (일시정지)');
    };

    const handleEnded = () => {
      setIsPlaying(false);
      logAudioDebug('ended (재생 종료)');
    };

    const handleError = (e) => {
      console.error('[Audio Error]:', e);
      logAudioDebug('error (오디오 오류)');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [audioSource, selectedFile, recordedBlob, fileName]);

  // 재생 / 일시정지 토글 (요구사항 4, 5, 6)
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.src || audio.src === '' || audio.src === window.location.href) {
      alert('재생할 오디오 파일이 없습니다. 먼저 상단의 "파일 업로드" 버튼으로 음성 파일(interview_sample.wav 등)을 선택해 주세요.');
      logAudioDebug('재생 실패 (오디오 src 없음)');
      return;
    }

    if (isPlaying) {
      audio.pause();
    } else {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[Audio Play Promise Rejected]:', err);
          showToast('오디오 재생을 시작할 수 없습니다: ' + err.message);
          logAudioDebug('play promise rejected');
        });
      }
    }
  };

  // 시간 점프 (-10초, +10초) (요구사항 7)
  const jumpTime = (seconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    const maxDuration = (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration))
      ? audio.duration
      : (totalDurationMs / 1000);
    const target = Math.max(0, Math.min(maxDuration, audio.currentTime + seconds));
    audio.currentTime = target;
    setCurrentTime(target);
    logAudioDebug(`jumpTime (${seconds > 0 ? '+' + seconds : seconds}초 이동)`);
  };

  // 특정 세그먼트 시간으로 이동 (요구사항 16)
  const handleSeekSegment = (seg, idx) => {
    const audio = audioRef.current;
    const startSec = (seg.start || 0) / 1000;
    setSelectedSegmentIndex(idx);

    if (audio) {
      audio.currentTime = startSec;
      setCurrentTime(startSec);
    }

    logAudioDebug(`handleSeekSegment (구간 #${idx + 1} 이동: ${startSec}초)`);
    showToast(`${formatTime(seg.start)} 위치로 이동했습니다.`);
  };

  // 재생 속도 변경 (0.5x, 1x, 1.5x, 2x) (요구사항 7)
  const handleSpeedChange = (e) => {
    const rate = parseFloat(e.target.value);
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
      logAudioDebug(`playbackRate 변경: ${rate}x`);
    }
  };

  // 단어 시간 보기 토글
  const toggleWordsView = (idx, e) => {
    e.stopPropagation();
    setExpandedWordSegments((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  // 파일 선택 변경 핸들러
  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 지원 형식 검증
    const allowedExts = ['.wav', '.mp3', '.m4a', '.webm'];
    const lowerName = file.name.toLowerCase();
    const isAllowed = allowedExts.some(ext => lowerName.endsWith(ext)) || file.type.startsWith('audio/');

    if (!isAllowed) {
      alert('지원하지 않는 음성 파일 형식입니다. (.wav, .mp3, .m4a, .webm 파일을 선택해 주세요)');
      return;
    }

    // 디버깅 로그 (요구사항 14)
    console.log('========== [선택한 실제 녹취 파일 정보] ==========');
    console.log(`파일명: ${file.name}`);
    console.log(`파일 크기: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`MIME 타입: ${file.type}`);
    console.log('==================================================');

    onFileSelect(file);
    showToast(`음성 파일 '${file.name}'을 성공적으로 불러왔습니다.`);
  };

  // 전체 복사 핸들러
  const handleCopyAll = () => {
    if (currentTranscript?.text) {
      navigator.clipboard.writeText(currentTranscript.text);
      showToast('전체 녹취록이 클립보드에 복사되었습니다.');
    }
  };

  // TXT 저장 핸들러
  const handleSaveTxt = () => {
    if (!currentTranscript?.text) return;
    const blob = new Blob([currentTranscript.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.replace(/\.[^/.]+$/, '')}_녹취록.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('녹취록 텍스트 파일(.txt)이 다운로드되었습니다.');
  };

  // 통 텍스트 검색 하이라이트 렌더러
  const renderHighlightedText = (fullText, term) => {
    if (!term || !term.trim()) return fullText;
    const escapedTerm = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    const parts = fullText.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="highlight-match">{part}</mark>
      ) : (
        part
      )
    );
  };

  // 현재 재생 중인 세그먼트 인덱스 계산 (요구사항 8: start <= currentTime < end)
  const activeSegmentIndex = useMemo(() => {
    const currentMs = Math.floor(currentTime * 1000);
    if (!currentTranscript?.segments) return selectedSegmentIndex;

    const playingIdx = currentTranscript.segments.findIndex(
      (seg) => currentMs >= seg.start && currentMs < seg.end
    );

    // 재생 중일 때는 현재 위치 구간, 일시정지 상태에서 사용자가 클릭한 구간이 있으면 그것을 유지
    return playingIdx !== -1 ? playingIdx : selectedSegmentIndex;
  }, [currentTime, currentTranscript, selectedSegmentIndex]);

  return (
    <div className="studio-container">
      {/* 실제 브라우저 오디오 객체 */}
      <audio
        ref={audioRef}
        src={audioSource || undefined}
        preload="metadata"
      />

      {/* 숨김 파일 입력 필드 (상단 녹음 파일 변경 클릭 시 트리거) */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".wav,.mp3,.m4a,.webm,audio/*"
        onChange={handleFileInputChange}
      />

      {/* ================= 1. 상단 헤더 ================= */}
      <header className="studio-header">
        <div className="studio-title-area">
          <h1 className="studio-main-title">인터뷰·녹취 스튜디오</h1>
          <div className="studio-meta-bar">
            <span className="studio-meta-item">
              <strong>파일명:</strong> {fileName}
            </span>
            <span className="studio-meta-divider">|</span>
            <span className="studio-meta-item">
              <strong>녹음 시간:</strong> {formatTime(totalDurationMs)}
            </span>
            <span className="studio-meta-divider">|</span>
            <span className="studio-meta-item">
              <strong>단어 수:</strong> {totalWordCount}개
            </span>
            <span className="studio-meta-divider">|</span>
            <span className="status-badge">
              <span className="dot"></span> {isSTTLoading ? '전사 처리 중...' : (transcriptData ? '전사 완료' : '대기 중')}
            </span>
          </div>
        </div>

        <div className="studio-header-actions">
          {/* 1. 파일 업로드 버튼 */}
          <button
            className="btn-studio"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
          >
            📁 파일 업로드
          </button>

          {/* 2. STT 변환 실행 버튼 (파일 업로드 바로 옆에 배치) */}
          <button
            className="btn-studio btn-studio-primary"
            onClick={onRunSTT}
            disabled={isSTTLoading}
          >
            {isSTTLoading ? 'STT 변환 중...' : '🎙️ STT 변환 실행'}
          </button>

          {/* 3. 기본 샘플로 리셋 버튼 */}
          <button
            className="btn-studio"
            onClick={handleResetClick}
            title="초기 기본 녹음 파일 및 샘플 데이터로 복귀"
          >
            🔄 리셋
          </button>

          {/* 4. 기사 작성기로 내보내기 버튼 */}
          <button
            className="btn-studio"
            onClick={() => showToast('기사 작성기 연동 모듈로 데이터를 전송합니다.')}
          >
            기사 작성기로 내보내기 →
          </button>
        </div>
      </header>

      {/* STT 변환 중 로딩 상태 표시 */}
      {isSTTLoading && (
        <div className="player-card" style={{ background: '#f0fdf4', borderColor: '#86efac', textAlign: 'center', padding: '16px' }}>
          <strong style={{ color: '#166534' }}>🎙️ CLOVA Speech 음성 인식을 진행하고 있습니다... 잠시만 기다려주세요.</strong>
        </div>
      )}

      {/* STT 오류 발생 시 알림 표시 */}
      {sttError && (
        <div className="player-card" style={{ background: '#fef2f2', borderColor: '#fca5a5', padding: '16px' }}>
          <strong style={{ color: '#991b1b' }}>⚠️ {sttError.error || 'STT 처리 중 오류가 발생했습니다.'}</strong>
          {sttError.detail && <p style={{ color: '#b91c1c', fontSize: '0.85rem', marginTop: '4px' }}>{String(sttError.detail)}</p>}
        </div>
      )}

      {/* ================= 2. 음성 플레이어 ================= */}
      <section className="player-card">
        <div className="player-top-row">
          <div className="player-filename">
            <span>🎙️</span>
            <span>{fileName}</span>
          </div>
          <div className="player-time-display">
            {formatSeconds(currentTime)} / {formatTime(totalDurationMs)}
          </div>
        </div>

        {/* 진행 상태 바 (Seek 가능) */}
        <div
          className="player-progress-bar"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const audio = audioRef.current;
            const maxDuration = (audio?.duration && !isNaN(audio.duration) && isFinite(audio.duration))
              ? audio.duration
              : (duration || (totalDurationMs / 1000) || 0);
            const targetSec = clickRatio * maxDuration;
            if (audio) {
              audio.currentTime = targetSec;
              setCurrentTime(targetSec);
              logAudioDebug(`progress bar click seek (${targetSec.toFixed(2)}초)`);
            }
          }}
        >
          <div
            className="player-progress-fill"
            style={{
              width: `${Math.min(100, (currentTime / (duration || (totalDurationMs / 1000) || 1)) * 100)}%`
            }}
          ></div>
        </div>

        <div className="player-controls-row">
          <div className="player-btn-group">
            <button className="player-ctrl-btn" onClick={() => jumpTime(-10)}>
              -10초
            </button>
            <button
              className="player-ctrl-btn player-play-btn"
              onClick={togglePlay}
            >
              {isPlaying ? '일시정지' : '재생'}
            </button>
            <button className="player-ctrl-btn" onClick={() => jumpTime(10)}>
              +10초
            </button>
          </div>

          <div className="player-speed-area">
            {/* 재생 속도: 0.5x, 1x, 1.5x, 2x (요구사항 2) */}
            <select
              className="speed-select"
              value={playbackRate}
              onChange={handleSpeedChange}
            >
              <option value="0.5">0.5x</option>
              <option value="1">재생속도 1x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>
          </div>
        </div>
      </section>

      {/* ================= 3. 메인 콘텐츠 (6 : 4 2열 구조) ================= */}
      <main className="studio-main-grid">
        {/* 왼쪽: 인터뷰 녹취 (6) */}
        <section className="content-pane left-pane">
          <div className="pane-header">
            <h2 className="pane-title">인터뷰 녹취</h2>
            <span className="pane-badge">
              {currentTranscript?.segments?.length || 0}개 구간
            </span>
          </div>

          <div className="segments-scroll-area">
            {currentTranscript?.segments?.map((seg, idx) => {
              const isActive = activeSegmentIndex === idx;
              const isWordsOpen = expandedWordSegments.has(idx);
              const confPct = Math.round((seg.confidence || 0) * 100);

              // 화자 정보가 존재하는 경우에만 사용, 없으면 '구간 N' 표기 (요구사항 5)
              const speakerLabel = seg.speaker?.displayName ||
                (seg.speaker?.name ? seg.speaker.name : (seg.speaker?.label ? `화자 ${seg.speaker.label}` : null));
              const displayTag = speakerLabel ? speakerLabel : `구간 ${idx + 1}`;

              return (
                <article
                  key={idx}
                  className={`segment-card ${isActive ? 'active-segment' : ''}`}
                  onClick={() => handleSeekSegment(seg, idx)}
                >
                  <div className="segment-card-header">
                    <div className="segment-tag-row">
                      <span className="segment-label">{displayTag}</span>
                      <span className="segment-time">
                        {formatTime(seg.start)} - {formatTime(seg.end)}
                      </span>
                    </div>
                    {confPct > 0 && (
                      <span className="segment-confidence">신뢰도 {confPct}%</span>
                    )}
                  </div>

                  <p className="segment-body">{seg.text}</p>

                  {/* 단어 단위 시간 보기 버튼 */}
                  {Array.isArray(seg.words) && seg.words.length > 0 && (
                    <div className="segment-words-section">
                      <button
                        className="words-toggle-btn"
                        onClick={(e) => toggleWordsView(idx, e)}
                      >
                        {isWordsOpen ? '단어 시간 접기 ▲' : '단어 단위 시간 보기 ▼'}
                      </button>

                      {isWordsOpen && (
                        <div className="words-grid">
                          {seg.words.map((w, wIdx) => (
                            <span key={wIdx} className="word-pill">
                              {w.text} <small>({formatTime(w.start)}~{formatTime(w.end)})</small>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {/* 오른쪽: 통 텍스트 (4) */}
        <section className="content-pane right-pane">
          <div className="pane-header">
            <h2 className="pane-title">통 텍스트 (전체 줄글)</h2>
            <div className="pane-actions">
              <button className="btn-studio btn-small" onClick={handleCopyAll}>
                전체 복사
              </button>
              <button className="btn-studio btn-small" onClick={handleSaveTxt}>
                TXT 저장
              </button>
            </div>
          </div>

          {/* 검색창 */}
          <div className="transcript-search-row">
            <input
              type="text"
              className="transcript-search-input"
              placeholder="🔍 전체 녹취록 내 키워드 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* 줄글 본문 영역 */}
          <div className="full-text-scroll-area">
            {renderHighlightedText(currentTranscript?.text || '', searchTerm)}
          </div>
        </section>
      </main>

      {/* ================= 4. 하단: AI 인터뷰 분석 ================= */}
      <footer className="studio-ai-card">
        <div className="ai-header-row">
          <h2 className="ai-header-title">
            <span>🤖</span> AI 인터뷰 분석
          </h2>
          {onRunAiAnalysis && !currentAiResult && (
            <button
              className="btn-studio btn-studio-primary"
              onClick={onRunAiAnalysis}
              disabled={isAiAnalyzing}
            >
              {isAiAnalyzing ? '분석 진행 중...' : '✨ AI 분석 시작'}
            </button>
          )}
        </div>

        {currentAiResult ? (
          <div className="ai-grid">
            {/* ① 인터뷰 요약 */}
            <div className="ai-section-box">
              <h3 className="ai-section-title">📌 인터뷰 요약</h3>
              <p className="ai-summary-text">{currentAiResult.summary}</p>
            </div>

            {/* ② 핵심 내용 */}
            <div className="ai-section-box">
              <h3 className="ai-section-title">🎯 핵심 내용</h3>
              <ul className="ai-keypoints-list">
                {currentAiResult.keyPoints?.map((item, idx) => (
                  <li key={idx} className="ai-keypoint-item">
                    <span className="ai-bullet">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* ③ 주요 키워드 */}
            <div className="ai-section-box">
              <h3 className="ai-section-title">🏷️ 주요 키워드</h3>
              <div className="ai-keywords-flex">
                {currentAiResult.keywords?.map((kw, idx) => (
                  <span key={idx} className="ai-keyword-tag">
                    [{kw}]
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="ai-empty-box">
            <p className="ai-empty-main">💡 AI 분석 결과가 아직 생성되지 않았습니다.</p>
            <p className="ai-empty-sub">
              STT 변환 완료 후 'AI 분석 시작'을 실행하시면 인터뷰 요약, 핵심 내용, 주요 키워드가 여기에 표시됩니다.
            </p>
          </div>
        )}
      </footer>

      {/* 토스트 알림 */}
      {toastMessage && (
        <div className="studio-toast">{toastMessage}</div>
      )}
    </div>
  );
}
