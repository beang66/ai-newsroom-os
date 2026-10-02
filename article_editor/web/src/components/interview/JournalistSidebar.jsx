import React, { useState } from 'react';
import { stripHtml, formatTime } from '../../utils/transcribe';

export default function JournalistSidebar({
  dialogues = [],
  speakerNames = {},
  onSeekAndPlay,
  showToast,
  questions = [],
  quoteVault = [],
  onRemoveFromVault,
  onInsertQuoteToDraft,
  articleDraft,
  setArticleDraft,
  onRunAnalysis,
  isAnalyzing
}) {
  // Focus exclusively on user's core requests:
  // 1. 'draft'   -> 기사 작성에 활용 (기사 초안 작성) - 기본 뷰
  // 2. 'summary' -> AI 분석/요약
  // 3. 'vault'   -> 원본 인용구 보관함
  const [activeTab, setActiveTab] = useState('draft');
  const [draftFormat, setDraftFormat] = useState('qa'); // 'qa' | 'straight'

  const spk1 = speakerNames[1] || '기자';
  const spk2 = speakerNames[2] || '취재원';

  // 1. Generate Automatic AI Summaries
  const fullText = dialogues.map((d) => stripHtml(d.text)).join(' ');
  const sentences = fullText.split(/[.?!]\s+/).filter((s) => s.length > 8);
  const s1 = sentences[0] || '취재원 발언 녹취 대기 중.';
  const s2 = sentences[Math.floor(sentences.length / 2)] || '주요 사실관계 및 쟁점 확인.';
  const s3 = sentences[sentences.length - 1] || '향후 후속 계획 및 추가 확인 필요.';

  // 2. Copy Draft to Clipboard
  const handleCopyDraft = () => {
    if (!articleDraft) {
      showToast('복사할 기사 내용이 없습니다.', 'warning');
      return;
    }
    navigator.clipboard.writeText(articleDraft).then(() => {
      showToast('📋 기사 본문이 클립보드에 복사되었습니다!', 'success');
    });
  };

  const handleClearDraft = () => {
    if (!articleDraft || window.confirm('작성 중인 기사 초안을 비우시겠습니까?')) {
      setArticleDraft('');
      showToast('기사 초안 에디터가 비워졌습니다.', 'info');
    }
  };

  // 3. Switch Draft Format & Regenerate
  const handleFormatChange = (fmt) => {
    setDraftFormat(fmt);
    let newDraft = '';

    if (dialogues.length === 0) {
      newDraft = '녹취록 데이터가 없습니다. 오디오 파일을 변환하거나 데모를 불러와 주세요.';
    } else if (fmt === 'qa') {
      newDraft = `[단독 인터뷰] ${spk2} 인터뷰 전문\n\n`;
      newDraft += `일시: ${new Date().toLocaleDateString('ko-KR')}\n`;
      newDraft += `취재: ${spk1} / 대상: ${spk2}\n`;
      newDraft += `--------------------------------------------------\n\n`;

      dialogues.slice(0, 8).forEach((d) => {
        const label = d.speaker === 1 ? `Q. (${spk1})` : `A. (${spk2})`;
        newDraft += `${label}: "${stripHtml(d.cleanText || d.text)}"\n\n`;
      });

      if (quoteVault.length > 0) {
        newDraft += `\n[핵심 인용구 모음]\n`;
        quoteVault.forEach((q) => {
          newDraft += `• "${q.text}" (${q.speakerLabel})\n`;
        });
      }
    } else {
      newDraft = `[속보] ${spk2}, 인터뷰서 주요 입장 표명\n\n`;
      newDraft += `${spk2}은(는) 최근 사안과 관련해 "${stripHtml(sentences[0] || '')}"라고 입장을 밝혔다.\n\n`;
      if (sentences[1]) {
        newDraft += `또한 "${stripHtml(sentences[1])}"라며 구체적인 배경을 설명했다.\n\n`;
      }
      newDraft += `이에 대해 ${spk1} 측은 향후 추가적인 사실관계 확인 및 후속 취재를 이어갈 방침이다.`;
    }

    setArticleDraft(newDraft);
    showToast(`📰 기사 형식이 '${fmt === 'qa' ? '문답형(Q&A)' : '스트레이트 속보'}'로 변경되었습니다.`, 'info');
  };

  return (
    <aside className="sidebar-column">
      <div className="card assistant-widget-card unified-assistant-card">
        {/* 3 Core Tabs: Draft First as requested */}
        <div className="assistant-tabs-header">
          <button
            className={`assistant-nav-tab ${activeTab === 'draft' ? 'active' : ''}`}
            onClick={() => setActiveTab('draft')}
          >
            📰 기사 초안 작성
          </button>
          <button
            className={`assistant-nav-tab ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            ⚡ AI 분석/요약
          </button>
          <button
            className={`assistant-nav-tab ${activeTab === 'vault' ? 'active' : ''}`}
            onClick={() => setActiveTab('vault')}
          >
            📦 원본 인용구 보관함
            {quoteVault.length > 0 && <span className="tab-count-pill">{quoteVault.length}</span>}
          </button>
        </div>


        {/* ================= TAB 1: AI 분석/요약 ================= */}
        {activeTab === 'summary' && (
          <div className="assistant-tab-pane">
            <div className="pane-header-row">
              <span className="pane-subtitle">사전 질문 및 원본 녹취 핵심 분석</span>
              {onRunAnalysis && (
                <button
                  className="btn-widget-action"
                  onClick={onRunAnalysis}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? '분석 중...' : '🔄 새로고침'}
                </button>
              )}
            </div>

            {/* Question by Question Summaries (if questions exist) */}
            {questions && questions.length > 0 ? (
              <div className="summary-q-list">
                {questions.map((q, idx) => {
                  const a = q.analyses?.[0];
                  const status = a?.analysis_status || 'unanswered';
                  return (
                    <div key={q.question_id || idx} className={`summary-q-card status-${status}`}>
                      <div className="q-card-top-line">
                        <span className="q-card-num">Q{q.order_num || idx + 1}</span>
                        <span className={`q-status-badge badge-${status}`}>
                          {status === 'answered' ? '답변 완료' : status === 'partial' ? '부분 답변' : '답변 대기'}
                        </span>
                      </div>
                      <p className="q-card-question">{q.question_text}</p>
                      
                      <div className="q-card-summary-box">
                        <span className="summary-tag">[AI 요약]</span>
                        <p className="summary-text-val">
                          {a?.answer_summary || '실제 녹취 대조 대기 중'}
                        </p>
                      </div>

                      {a?.matched_segment_text && (
                        <div className="q-card-verbatim-box">
                          <span className="verbatim-tag">[원본 발언]</span>
                          <p className="verbatim-text-val">"{a.matched_segment_text}"</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* General 3-Point Summary Fallback */
              <div className="summary-list">
                <div className="summary-item">
                  <span className="summary-num">1</span>
                  <p className="summary-text">
                    <strong>핵심 발언:</strong> {s1}
                  </p>
                </div>
                <div className="summary-item">
                  <span className="summary-num">2</span>
                  <p className="summary-text">
                    <strong>주요 쟁점:</strong> {s2}
                  </p>
                </div>
                <div className="summary-item">
                  <span className="summary-num">3</span>
                  <p className="summary-text">
                    <strong>후속 확인:</strong> {s3}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: 원본 인용구 보관함 ================= */}
        {activeTab === 'vault' && (
          <div className="assistant-tab-pane">
            <div className="pane-header-row">
              <span className="pane-subtitle">
                녹취록에서 담은 원본 인용구 ({quoteVault.length}개)
              </span>
            </div>

            {quoteVault.length === 0 ? (
              <div className="vault-empty-state">
                <span className="vault-empty-icon">📦</span>
                <p className="vault-empty-title">보관된 인용구가 없습니다</p>
                <p className="vault-empty-desc">
                  좌측 녹취록에서 원하는 발언 옆의 <strong>[📦 인용구 보관함 담기]</strong> 버튼을 누르면 이곳에 모입니다.
                </p>
              </div>
            ) : (
              <div className="vault-cards-scroll">
                {quoteVault.map((quote) => (
                  <div key={quote.id} className="vault-quote-card">
                    <div className="vault-card-header">
                      <span className="vault-speaker-tag">
                        {quote.speakerLabel || '취재원'} ({formatTime(quote.timestamp)})
                      </span>
                      <div className="vault-card-actions">
                        <button
                          className="btn-vault-insert"
                          onClick={() => onInsertQuoteToDraft(quote.text, quote.speakerLabel)}
                          title="기사 초안 에디터에 인용 삽입"
                        >
                          + 기사에 삽입
                        </button>
                        <button
                          className="btn-vault-del"
                          onClick={() => onRemoveFromVault(quote.id)}
                          title="보관함에서 제거"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <blockquote className="vault-quote-body">
                      "{quote.text}"
                    </blockquote>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: 기사 작성에 활용 & 기사 초안 작성 ================= */}
        {activeTab === 'draft' && (
          <div className="assistant-tab-pane draft-pane-flex">
            <div className="pane-header-row">
              <div className="draft-format-pills">
                <button
                  className={`format-pill ${draftFormat === 'qa' ? 'active' : ''}`}
                  onClick={() => handleFormatChange('qa')}
                >
                  문답형(Q&A)
                </button>
                <button
                  className={`format-pill ${draftFormat === 'straight' ? 'active' : ''}`}
                  onClick={() => handleFormatChange('straight')}
                >
                  스트레이트 속보
                </button>
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn-export-primary" onClick={handleCopyDraft}>
                  📋 기사 복사
                </button>
                <button
                  className="btn-toolbar-subtle"
                  onClick={handleClearDraft}
                  title="초안 에디터 내용 비우기"
                  style={{ padding: '6px 10px', fontSize: '12px' }}
                >
                  비우기
                </button>
              </div>
            </div>

            {/* Live Editable Article Draft Area */}
            <div className="draft-editor-wrapper">
              <textarea
                className="draft-editor-textarea"
                value={articleDraft}
                onChange={(e) => setArticleDraft(e.target.value)}
                placeholder="왼쪽 녹취록을 보며 이곳에 기사 초안을 작성하세요. 왼쪽 문장의 [+ 초안에 삽입]을 누르면 즉시 인용구가 추가됩니다..."
                rows={16}
              />
              <div className="draft-editor-footer">
                <span className="char-count">{articleDraft ? articleDraft.length : 0}자</span>
                <span className="draft-tip">💡 왼쪽 문장 클릭 시 해당 녹취 음성 재생 | [+ 초안에 삽입]으로 즉시 인용</span>
              </div>
            </div>

          </div>
        )}
      </div>
    </aside>
  );
}
