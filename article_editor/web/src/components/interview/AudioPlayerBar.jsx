import React from 'react';
import { formatTime } from '../../utils/transcribe';

export default function AudioPlayerBar({
  audioRef,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onStepTime,
  onSeek,
  onSpeedChange,
  speed
}) {
  return (
    <div className="player-controls-column">
      <div className="player-header">
        <span className="player-title-label">🎧 오디오 동기화 플레이어 (팩트체크용)</span>
        <span className="player-hint">문장을 클릭하면 해당 시점으로 바로 점프합니다</span>
      </div>
      <div className="player-deck">
        <div className="player-buttons-group">
          <button className="btn-player-step" onClick={() => onStepTime(-3)} title="3초 뒤로 감기 (Alt+←)">
            -3s
          </button>
          <button className="btn-player-main" onClick={onTogglePlay} title="재생 / 일시정지 (Tab)">
            {isPlaying ? '❚❚' : '▶'}
          </button>
          <button className="btn-player-step" onClick={() => onStepTime(3)} title="3초 앞으로 감기 (Alt+→)">
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
            <option value="1.0">1.0x (기본)</option>
            <option value="1.25">1.25x (빠르게)</option>
            <option value="1.5">1.5x (속청)</option>
            <option value="2.0">2.0x (2배속)</option>
          </select>
        </div>
      </div>
    </div>
  );
}
