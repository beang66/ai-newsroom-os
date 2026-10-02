import React, { useState, useEffect } from 'react';

export default function ArticleEditorModal({
  isOpen,
  onClose,
  interview,
  questions = [],
  rawTranscripts = [],
  showToast
}) {
  const [articleFormat, setArticleFormat] = useState('qa'); // 'qa' | 'straight' | 'feature'
  const [articleTitle, setArticleTitle] = useState('');
  const [articleBody, setArticleBody] = useState('');

  const intervieweeName = interview?.interviewee || '취재원';
  const interviewTitle = interview?.title || '인터뷰';

  // Build draft according to format
  const generateDraft = (format) => {
    let title = `[인터뷰] ${intervieweeName} 대표에게 듣는 "${interviewTitle}"`;
    let body = '';

    if (format === 'qa') {
      body = `[단독 인터뷰] ${intervieweeName} 인터뷰 전문\n\n`;
      body += `일시: ${new Date().toLocaleDateString('ko-KR')}\n`;
      body += `취재 대상: ${intervieweeName}\n`;
      body += `주요 사안: ${interviewTitle}\n`;
      body += `--------------------------------------------------------\n\n`;

      questions.forEach((q, idx) => {
        const analysis = q.analyses?.[0];
        const status = analysis?.analysis_status || 'unanswered';
        const quote = analysis?.matched_segment_text;
        const summary = analysis?.answer_summary;

        body += `Q${idx + 1}. ${q.question_text}\n\n`;
        if (quote) {
          body += `A. (발언 원문 인용)\n"${quote}"\n\n`;
          body += `[답변 핵심 요약]\n${summary}\n\n`;
        } else {
          body += `A. (해당 질문에 대한 유의미한 답변 없음 - 추가 사실확인 필요)\n\n`;
        }
        body += `--------------------------------------------------------\n\n`;
      });

      // Append unaddressed / follow-up points
      body += `[향후 후속 취재 및 쟁점 확인]\n`;
      questions.forEach((q) => {
        if (q.followUps && q.followUps.length > 0) {
          q.followUps.forEach((fu) => {
            body += `• ${fu.suggested_question} (사유: ${fu.reason || '추가 검증'})\n`;
          });
        }
      });
    } else if (format === 'straight') {
      title = `[속보] ${intervieweeName}, "${interviewTitle}" 관련 입장 표명`;
      body = `${intervieweeName}은 30일 본지와의 인터뷰에서 ${interviewTitle}에 대한 세부 계획과 입장을 밝혔다.\n\n`;

      // Extract answered summaries
      const answeredList = questions.filter((q) => q.analyses?.[0]?.matched_segment_text);
      if (answeredList.length > 0) {
        answeredList.forEach((q) => {
          const a = q.analyses[0];
          body += `이날 인터뷰에서 ${intervieweeName} 측은 "${a.matched_segment_text}"라고 강조했다. (${a.answer_summary})\n\n`;
        });
      } else {
        body += `현재 취재원의 핵심 발언을 검증 중이다.\n\n`;
      }

      body += `한편 본 취재팀은 향후 확인되지 않은 쟁점에 대해 추가 서면 질의 및 후속 취재를 이어갈 예정이다.`;
    } else {
      // Feature / In-depth
      title = `[집중취재] ${intervieweeName} 심층 인터뷰와 과제`;
      body = `◆ 쟁점별 취재원 발언과 팩트체크\n\n`;
      questions.forEach((q, i) => {
        const a = q.analyses?.[0];
        body += `■ 쟁점 ${i + 1}: ${q.question_text}\n`;
        if (a?.matched_segment_text) {
          body += `- 취재원 실제 발언: "${a.matched_segment_text}"\n`;
          body += `- AI 분석 및 핵심 요지: ${a.answer_summary}\n\n`;
        } else {
          body += `- 취재원 발언 없음: 공식 확인 필요\n\n`;
        }
      });
    }

    setArticleTitle(title);
    setArticleBody(body);
  };

  useEffect(() => {
    if (isOpen) {
      generateDraft(articleFormat);
    }
  }, [isOpen, articleFormat, interview, questions]);

  if (!isOpen) return null;

  const handleCopyAll = () => {
    const fullArticle = `${articleTitle}\n\n${articleBody}`;
    navigator.clipboard.writeText(fullArticle).then(() => {
      showToast('📋 기사 본문이 클립보드에 복사되었습니다!', 'success');
    });
  };

  const handleInsertQuote = (quoteText) => {
    setArticleBody((prev) => `${prev}\n\n"${quoteText}"\n`);
    showToast('💬 원본 인용구가 기사 에디터에 삽입되었습니다.', 'info');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-full-screen" onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div className="modal-header editor-header">
          <div className="editor-brand-group">
            <span className="editor-badge">기사 작성 스튜디오</span>
            <h3 className="modal-title">인터뷰 분석 데이터 기반 기사 작성</h3>
          </div>

          <div className="editor-format-tabs">
            <button
              className={`btn-format-tab ${articleFormat === 'qa' ? 'active' : ''}`}
              onClick={() => setArticleFormat('qa')}
            >
              문답형 (Q&A 전문)
            </button>
            <button
              className={`btn-format-tab ${articleFormat === 'straight' ? 'active' : ''}`}
              onClick={() => setArticleFormat('straight')}
            >
              스트레이트 (단신 속보)
            </button>
            <button
              className={`btn-format-tab ${articleFormat === 'feature' ? 'active' : ''}`}
              onClick={() => setArticleFormat('feature')}
            >
              기획 심층 분석형
            </button>
          </div>

          <div className="editor-header-actions">
            <button className="btn-secondary" onClick={handleCopyAll}>
              📋 기사 전체 복사
            </button>
            <button className="btn-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Studio 3-Column Layout */}
        <div className="editor-studio-grid">
          {/* Left Panel: Verified Verbatim Quotes Source */}
          <aside className="editor-source-panel">
            <div className="source-panel-header">
              <span className="source-title-badge">[원본 녹취록 보관함]</span>
              <p className="source-subtitle">클릭하면 에디터에 원문 그대로 인용됩니다.</p>
            </div>

            <div className="source-quotes-scroll">
              {questions.map((q, idx) => {
                const quote = q.analyses?.[0]?.matched_segment_text;
                if (!quote) return null;

                return (
                  <div key={q.question_id || idx} className="source-quote-card">
                    <div className="quote-card-top">
                      <span className="quote-q-tag">Q{idx + 1} 발언</span>
                      <button
                        className="btn-quote-insert"
                        onClick={() => handleInsertQuote(quote)}
                        title="기사 본문에 바로 인용"
                      >
                        + 인용 삽입
                      </button>
                    </div>
                    <p className="quote-card-text">"{quote}"</p>
                  </div>
                );
              })}

              {/* Entire Raw Transcripts if any */}
              {rawTranscripts.length > 0 && (
                <div className="full-raw-transcript-box">
                  <span className="box-title">전체 STT 원문 전체보기</span>
                  <p className="box-content">{rawTranscripts.join(' ')}</p>
                </div>
              )}
            </div>
          </aside>

          {/* Center Main Editor */}
          <main className="editor-main-panel">
            <div className="editor-inputs-wrap">
              <div className="editor-title-wrap">
                <label className="editor-label">기사 제목</label>
                <input
                  type="text"
                  className="article-title-input"
                  value={articleTitle}
                  onChange={(e) => setArticleTitle(e.target.value)}
                  placeholder="기사 제목을 입력하세요..."
                />
              </div>

              <div className="editor-body-wrap">
                <div className="editor-body-toolbar">
                  <span className="editor-label">기사 본문 에디터 (자유 편집 가능)</span>
                  <span className="char-count-pill">{articleBody.length}자</span>
                </div>
                <textarea
                  className="article-body-textarea"
                  value={articleBody}
                  onChange={(e) => setArticleBody(e.target.value)}
                  placeholder="기사 본문 내용..."
                  rows={20}
                />
              </div>
            </div>
          </main>

          {/* Right Panel: AI Verification & Checklist */}
          <aside className="editor-checklist-panel">
            <div className="source-panel-header">
              <span className="source-title-badge">[AI 분석 요약 및 추천 질문]</span>
              <p className="source-subtitle">오보 방지 및 후속 기사 아이템</p>
            </div>

            <div className="checklist-scroll">
              <div className="checklist-card">
                <h4 className="checklist-title">사전 질문 답변 현황</h4>
                <div className="status-progress-items">
                  {questions.map((q, idx) => {
                    const status = q.analyses?.[0]?.analysis_status || 'unanswered';
                    return (
                      <div key={q.question_id || idx} className="q-mini-row">
                        <span className="mini-q-num">Q{idx + 1}</span>
                        <span className="mini-q-text">{q.question_text.slice(0, 20)}...</span>
                        <span className={`mini-badge badge-${status}`}>
                          {status === 'answered' ? '완료' : status === 'partial' ? '부분' : '미답변'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="checklist-card">
                <h4 className="checklist-title">추천 후속 취재 아이템</h4>
                <ul className="followup-bullets">
                  {questions
                    .flatMap((q) => q.followUps || [])
                    .slice(0, 5)
                    .map((fu, i) => (
                      <li key={i} className="followup-item">
                        <strong>• {fu.suggested_question}</strong>
                      </li>
                    ))}
                </ul>
              </div>

              <div className="checklist-notice-box">
                <span className="notice-icon">⚖️</span>
                <span className="notice-text">
                  <strong>기자 윤리 강령 준수:</strong> AI가 생성한 요약이나 초안은 참고용이며,
                  최종 보도 기사는 기자의 사실관계 검증을 거쳐야 합니다.
                </span>
              </div>
            </div>
          </aside>
        </div>

        {/* Modal Bottom Footer */}
        <div className="modal-footer editor-footer">
          <span className="footer-meta-info">
            인터뷰 대상: {intervieweeName} • 원본 녹취 불변성 보장됨
          </span>
          <div className="footer-btns">
            <button className="btn-secondary" onClick={onClose}>
              닫기
            </button>
            <button className="btn-primary" onClick={handleCopyAll}>
              기사 복사 및 취재 완료
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
