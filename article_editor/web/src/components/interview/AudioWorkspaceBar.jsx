import React, { useRef, useEffect } from 'react';
import { formatTime } from '../../utils/transcribe';

export default function AudioWorkspaceBar({
  activeTab,
  setActiveTab,
  // Live mic
  isRecording,
  isPaused,
  timerSeconds,
  onToggleMic,
  onTogglePause,
  analyser,
  // File upload
  audioFile,
  onFileSelected,
  onRemoveFile,
  onStartTranscribe,
  onCancelTranscribe,
  isTranscribing,
  progressText,
  progressPercent,
  onLoadDemoSample,
  onOpenApiModal,
  cloudConfig,
  // Audio Player
  hasAudio,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onStepTime,
  onSeek,
  onSpeedChange,
  speed
}) {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const animFrameIdRef = useRef(null);

  // Canvas visualizer
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
        ctx.fillStyle = '#4e6af3';
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
  }, [analyser]);

  return (
    <section className="card unified-audio-card">
      {/* Top: Source Switcher & Demo Link */}
      <div className="audio-card-topbar">
        <div className="source-tabs">
          <button
            className={`source-tab-btn ${activeTab === 'live' ? 'active' : ''}`}
            onClick={() => setActiveTab('live')}
          >
            <span className="live-dot-icon" /> 바로 실시간 녹음
          </button>
          <button
            className={`source-tab-btn ${activeTab === 'file' ? 'active' : ''}`}
            onClick={() => setActiveTab('file')}
          >
            📂 녹음 파일 업로드
          </button>
        </div>

        <button className="btn-link" onClick={onLoadDemoSample} type="button">
          💡 예시 인터뷰(데모) 불러오기
        </button>
      </div>

      {/* Middle: Active Source Input Area */}
      <div className="audio-card-body">
        {activeTab === 'live' ? (
          <div className="live-unified-row">
            <button
              className={`btn-primary-record ${isRecording ? 'recording' : ''}`}
              onClick={onToggleMic}
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
              <span>{isPaused ? '▶ 재개' : '⏸️ 일시정지'}</span>
            </button>

            <div className="live-info-block">
              <span className="timer-display">{formatTime(timerSeconds)}</span>
              <span className="status-caption">
                {isRecording
                  ? isPaused
                    ? '일시정지'
                    : '실시간 음성 수음 중'
                  : '마이크 대기 중'}
              </span>
            </div>

            <div className="live-waveform-wrap">
              <canvas ref={canvasRef} width="200" height="34" />
            </div>
          </div>
        ) : (
          <div className="file-unified-wrap">
            {!audioFile ? (
              <div
                className="drop-card-dashed"
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    onFileSelected(e.dataTransfer.files[0]);
                  }
                }}
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
                <span className="drop-icon">📂</span>
                <div>
                  <span className="drop-main-text">
                    인터뷰 녹음 파일을 끌어놓거나 <strong>파일 선택</strong>
                  </span>
                  <span className="drop-sub-text">MP3, M4A(통화녹음), WAV 등 지원</span>
                </div>
              </div>
            ) : (
              <div className="file-info-strip">
                <div className="file-icon-wrap">🎵</div>
                <div className="file-details-wrap">
                  <p className="file-title">{audioFile.name}</p>
                  <p className="file-meta-line">
                    {(audioFile.size / (1024 * 1024)).toFixed(1)} MB • {formatTime(duration)}
                  </p>
                </div>
                <button
                  className="btn-primary-small btn-convert-text"
                  onClick={onStartTranscribe}
                  disabled={isTranscribing}
                  title="녹음된 오디오를 텍스트로 변환합니다"
                  style={{
                    backgroundColor: isTranscribing ? '#9ca3af' : '#2563eb',
                    color: '#ffffff',
                    fontWeight: 600,
                    padding: '7px 14px',
                    borderRadius: '7px',
                    cursor: isTranscribing ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isTranscribing ? '⏳ 텍스트로 변환 중...' : '📝 텍스트로 변환하기'}
                </button>

                {isTranscribing && (
                  <button
                    className="btn-danger-small btn-stop-transcribe"
                    onClick={onCancelTranscribe}
                    type="button"
                    title="진행 중인 텍스트 변환 작업을 멈춥니다"
                    style={{
                      backgroundColor: '#ef4444',
                      color: '#ffffff',
                      fontWeight: 600,
                      padding: '7px 12px',
                      borderRadius: '7px',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      animation: 'pulse 1.5s infinite'
                    }}
                  >
                    🛑 변환 멈추기
                  </button>
                )}

                <button
                  className="btn-subtle-engine"
                  onClick={onOpenApiModal}
                  type="button"
                  style={{
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    color: '#374151',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="STT 엔진 및 API Key 설정 변경"
                >
                  ⚙️ {cloudConfig?.provider === 'clova' ? 'CLOVA (화자분리)' : (cloudConfig?.provider ? cloudConfig.provider.toUpperCase() : 'STT 설정')}
                </button>
                <button className="btn-icon-clear" onClick={onRemoveFile} title="파일 제거">
                  ✕
                </button>
              </div>
            )}


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

      {/* Bottom: Synchronized Audio Player Bar */}
      {hasAudio && (
        <div className="audio-card-player-strip">
          <div className="player-deck">
            <div className="player-buttons-group">
              <button className="btn-player-step" onClick={() => onStepTime(-3)} title="3초 뒤로 (Alt+←)">
                -3s
              </button>
              <button className="btn-player-main" onClick={onTogglePlay} title="재생 / 일시정지 (Tab)">
                {isPlaying ? '❚❚' : '▶'}
              </button>
              <button className="btn-player-step" onClick={() => onStepTime(3)} title="3초 앞으로 (Alt+→)">
                +3s
              </button>
            </div>

            <div className="player-timeline-group">
              <span className="time-readout">{formatTime(currentTime)}</span>
              <input
                type="range"
                className="seek-slider"
                min="0"
                max={duration || 100}
                value={currentTime || 0}
                onChange={(e) => onSeek(parseFloat(e.target.value))}
              />
              <span className="time-readout">{formatTime(duration)}</span>
            </div>

            <div className="player-speed-group">
              <select
                className="speed-select"
                value={speed}
                onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                title="배속 조절"
              >
                <option value="0.8">0.8x</option>
                <option value="1.0">1.0x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="2.0">2.0x</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
