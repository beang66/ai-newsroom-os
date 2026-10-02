import React, { useRef, useEffect } from 'react';
import { formatTime } from '../../utils/transcribe';

export default function InputControls({
  activeTab,
  setActiveTab,
  // Live mic props
  isRecording,
  isPaused,
  timerSeconds,
  onToggleMic,
  onTogglePause,
  interviewMode,
  analyser,
  // File props
  audioFile,
  onFileSelected,
  onRemoveFile,
  onStartTranscribe,
  isTranscribing,
  progressText,
  progressPercent,
  onLoadDemoSample
}) {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const animFrameIdRef = useRef(null);

  // Canvas visualizer animation
  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animFrameIdRef.current = requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 1.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;
        ctx.fillStyle = interviewMode === 'inperson' ? '#4e6af3' : '#10b981';
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }
    };

    render();

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [analyser, interviewMode]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="input-controls-column">
      <div className="input-tabs">
        <button
          className={`tab-pill ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => setActiveTab('live')}
        >
          <span className="live-dot-icon"></span> 바로 실시간 녹음
        </button>
        <button
          className={`tab-pill ${activeTab === 'file' ? 'active' : ''}`}
          onClick={() => setActiveTab('file')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tab-svg">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          녹음 파일 업로드
        </button>
      </div>

      {/* Subpanel 1: Live Mic */}
      {activeTab === 'live' && (
        <div className="input-panel active">
          <div className="live-action-bar">
            <button
              className={`btn-primary-record ${isRecording ? 'recording' : ''}`}
              onClick={onToggleMic}
              title="마이크 녹음 시작/중지"
            >
              <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <span>{isRecording ? '녹음 중지' : '녹음 시작'}</span>
            </button>

            <button
              className="btn-secondary"
              onClick={onTogglePause}
              disabled={!isRecording}
            >
              <span>{isPaused ? '▶ 계속하기' : '⏸️ 일시정지'}</span>
            </button>

            <div className="recording-meta">
              <span className="timer-display">{formatTime(timerSeconds)}</span>
              <span className="status-caption">
                {isRecording
                  ? isPaused
                    ? '일시정지됨'
                    : interviewMode === 'inperson'
                    ? '대면 고음질 수음 중...'
                    : '전화 통화 필터링 수음 중...'
                  : '마이크 대기 중'}
              </span>
            </div>

            <div className="live-waveform-wrap">
              <canvas ref={canvasRef} width="220" height="38" />
            </div>
          </div>
        </div>
      )}

      {/* Subpanel 2: File Upload (PhantomBuster Dashed Style) */}
      {activeTab === 'file' && (
        <div className="input-panel active">
          <div
            className="drop-card-dashed"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm,.aac,.flac"
              className="file-input-hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onFileSelected(e.target.files[0]);
                }
              }}
            />
            <div className="drop-text-content">
              <span className="drop-icon">📂</span>
              <div>
                <span className="drop-main-text">
                  인터뷰 녹음 파일을 끌어놓거나 <strong>파일 선택</strong>
                </span>
                <span className="drop-sub-text">MP3, M4A(스마트폰 통화녹음), WAV 등 최대 50MB</span>
              </div>
            </div>
            <div className="drop-actions">
              <button
                className="btn-link"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLoadDemoSample();
                }}
              >
                💡 예시 인터뷰(취재 데모) 불러오기
              </button>
            </div>
          </div>

          {/* File Selected Strip */}
          {audioFile && (
            <div className="file-info-strip">
              <div className="file-icon-wrap">🎵</div>
              <div className="file-details-wrap">
                <p className="file-title">{audioFile.name}</p>
                <p className="file-meta-line">
                  {(audioFile.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              </div>
              <button
                className="btn-primary-small"
                onClick={onStartTranscribe}
                disabled={isTranscribing}
              >
                {isTranscribing ? '분석 중...' : '⚡ 텍스트 & 화자 분리 시작'}
              </button>
              <button className="btn-icon-clear" onClick={onRemoveFile} title="파일 제거">
                ✕
              </button>
            </div>
          )}

          {/* Progress Bar */}
          {isTranscribing && (
            <div className="progress-bar-wrap">
              <div className="progress-info-row">
                <span>{progressText}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
