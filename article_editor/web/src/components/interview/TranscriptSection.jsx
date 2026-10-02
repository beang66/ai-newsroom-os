import React, { useState } from 'react';
import { formatTime, stripHtml } from '../../utils/transcribe';

export default function TranscriptSection({
  dialogues = [],
  speakerNames = {},
  onOpenRenameModal,
  onSeekAndPlay,
  onCopyQuote,
  onAddToVault,
  onInsertQuoteToDraft,
  onCopyHwp,
  onDownloadTxt,
  onOpenClearModal,
  onToggleSpeaker,
  interimText,
  isRecording,
  currentTime = 0
}) {
  // Always default to continuous natural reading flow (줄글 문서형)
  const [viewMode, setViewMode] = useState('document');

  const plainText = dialogues
    .map((d) => `${speakerNames[d.speaker] || '화자'}: ${stripHtml(d.text)}`)
    .join('\n\n');

  const charCount = plainText.length;
  const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;

  return (
    <section className="card transcript-column-card">
      {/* Streamlined Header */}
      <div className="transcript-topbar">
        <div className="topbar-left">
          <div className="transcript-title-wrap">
            <span className="badge-verbatim-pill">[원본 녹취]</span>
            <h2 className="section-heading">인터뷰 줄글 녹취록</h2>
            <span className="verbatim-notice-tag" title="실제 음성에서 변환된 그대로의 원본 데이터">
              줄글 형태 • 화자 구분 • 클릭 시 즉시 재생
            </span>
          </div>
          <div className="word-stats">
            <span>{charCount}자</span> • <span>{wordCount}단어</span>
          </div>
        </div>

        <div className="topbar-right" style={{ display: 'flex', alignItems: 'center' }}>
          {/* Main Action Group: Speaker Settings & Safe Export Actions */}
          <div className="topbar-actions-main" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn-toolbar-subtle"
              onClick={onOpenRenameModal}
              title="화자(참석자) 이름 관리 및 추가"
            >
              👥 화자 설정
            </button>

            <button
              className="btn-export-primary"
              onClick={onCopyHwp}
              title="기사용 포맷으로 전체 복사"
            >
              📋 전체 복사
            </button>

            <button
              className="btn-toolbar-subtle"
              onClick={onDownloadTxt}
              title="TXT 파일 저장"
            >
              💾 TXT
            </button>
          </div>

          {/* Isolated Danger Zone: Moved away to the side to prevent accidental clicks */}
          <div
            className="topbar-actions-danger"
            style={{
              marginLeft: '14px',
              paddingLeft: '14px',
              borderLeft: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <button
              className="btn-toolbar-subtle danger"
              onClick={onOpenClearModal}
              type="button"
              title="녹취록 텍스트 비우기 (삭제 전 안전 확인창이 뜹니다)"
              style={{
                color: '#dc2626',
                borderColor: '#fecaca',
                backgroundColor: '#fef2f2',
                fontSize: '12px',
                padding: '6px 10px',
                fontWeight: 600,
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              🗑️ 텍스트 비우기
            </button>
          </div>
        </div>
      </div>

      {/* Helpful Journalist Tip Banner */}
      <div className="transcript-hint-banner">
        <span className="hint-icon">💡</span>
        <span className="hint-text">
          <strong>팁:</strong> 텍스트 문장을 클릭하면 <strong>해당 발언 구간의 실제 녹음 음성이 즉시 재생</strong>됩니다. 발언자 이름을 클릭하면 화자를 바로 변경할 수 있습니다.
        </span>
      </div>

      {/* Main Transcript Body Container */}
      <div className="transcript-scroll-area mode-document">
        {dialogues.length === 0 ? (
          <div className="empty-transcript-state">
            <span className="empty-icon">🎙️</span>
            <p className="empty-title">변환된 인터뷰 녹취가 없습니다</p>
            <p className="empty-desc">
              상단의 <strong>'녹음 파일 업로드'</strong>에서 파일을 넣고 <strong>'텍스트로 변환하기'</strong>를 누르시거나,<br />
              <strong>'예시 인터뷰(데모) 불러오기'</strong>를 눌러 바로 체험해 보세요.
            </p>
          </div>
        ) : (
          /* ================= 줄글 문서형 (Document Flow + 화자 구분 + 텍스트 클릭 시 즉시 재생) ================= */
          <div className="document-sheet">
            {dialogues.map((d, index) => {
              const speakerLabel = speakerNames[d.speaker] || `화자 ${d.speaker}`;
              const displayHtml = d.text;
              
              // Audio Playback Sync: Check if this dialogue is currently playing
              const nextTime = dialogues[index + 1] ? dialogues[index + 1].timestamp : d.timestamp + 12;
              const isPlayingNow = currentTime >= d.timestamp && currentTime < nextTime;

              return (
                <div
                  key={d.id || index}
                  className={`doc-paragraph-row spk-${d.speaker} ${isPlayingNow ? 'audio-active-row' : ''}`}
                >
                  {/* Speaker Identifier Column */}
                  <div className="doc-speaker-indicator">
                    <button
                      className={`doc-time-badge ${isPlayingNow ? 'playing-pulse' : ''}`}
                      onClick={() => onSeekAndPlay(d.timestamp)}
                      title="클릭 시 해당 구간 음성 재생"
                    >
                      {isPlayingNow ? '🔊' : '▶'} {formatTime(d.timestamp)}
                    </button>
                    <span
                      className={`doc-speaker-name spk-${d.speaker}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onToggleSpeaker) onToggleSpeaker(index);
                      }}
                      title="클릭하면 화자를 변경할 수 있습니다"
                      style={{ cursor: onToggleSpeaker ? 'pointer' : 'default' }}
                    >
                      {speakerLabel} {onToggleSpeaker ? '▾' : ''}
                    </span>
                  </div>

                  {/* Verbatim Speech Text Column (Click text to play audio!) */}
                  <div
                    className={`doc-speech-content speech-interactive ${isPlayingNow ? 'text-highlighted' : ''}`}
                    onClick={() => onSeekAndPlay(d.timestamp)}
                    title="클릭하면 이 발언의 실제 녹음이 바로 재생됩니다."
                  >
                    <span
                      className="doc-speech-text"
                      dangerouslySetInnerHTML={{ __html: displayHtml }}
                    />

                    {/* Action: Add to Quote Vault & Insert to Article Draft */}
                    <div className="speech-hover-actions">
                      <button
                        className="doc-hover-quote-btn play-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSeekAndPlay(d.timestamp);
                        }}
                        title="이 발언 구간 녹취 음성 재생"
                      >
                        ▶ 재생
                      </button>

                      {onInsertQuoteToDraft && (
                        <button
                          className="doc-hover-quote-btn insert-draft-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInsertQuoteToDraft(stripHtml(d.cleanText || d.text), speakerLabel);
                          }}
                          title="오른쪽 기사 초안 작성 박스에 이 문장 즉시 삽입"
                        >
                          + 초안에 삽입
                        </button>
                      )}

                      <button
                        className="doc-hover-quote-btn"
                        onClick={(e) => {
                          e.stopPropagation(); // prevent audio seek
                          if (onAddToVault) {
                            onAddToVault(d);
                          } else {
                            onCopyQuote(d);
                          }
                        }}
                        title="기사 작성용 원본 인용구 보관함에 담기"
                      >
                        📦 보관함
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        )}
      </div>

      {/* Live Interim Streaming Bar */}
      {isRecording && interimText && (
        <div className="interim-stream-bar">
          <span className="interim-pulse-dot" />
          <span className="interim-label">듣는 중:</span>
          <span className="interim-content">{interimText}</span>
        </div>
      )}
    </section>
  );
}
