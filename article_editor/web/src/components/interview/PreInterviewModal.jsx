import React, { useState } from 'react';

export default function PreInterviewModal({
  isOpen,
  onClose,
  onSaveInterview,
  showToast
}) {
  const [title, setTitle] = useState('');
  const [interviewee, setInterviewee] = useState('');
  const [questions, setQuestions] = useState([
    '올해 신제품 출시 계획은 어떻게 되나요?',
    '가장 중점적으로 개발한 기능은 무엇인가요?',
    '시장에서 어떤 반응을 예상하고 있나요?',
    '향후 해외 진출 계획이 있나요?'
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAddQuestion = () => {
    setQuestions([...questions, '']);
  };

  const handleQuestionChange = (index, value) => {
    const updated = [...questions];
    updated[index] = value;
    setQuestions(updated);
  };

  const handleRemoveQuestion = (index) => {
    if (questions.length <= 1) {
      showToast('최소 1개 이상의 사전 질문이 필요합니다.', 'warning');
      return;
    }
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleLoadSample = () => {
    setTitle('2026년 신제품 출시 관련 인터뷰');
    setInterviewee('홍길동 / ○○기업 대표');
    setQuestions([
      '올해 신제품 출시 계획은 어떻게 되나요?',
      '가장 중점적으로 개발한 기능은 무엇인가요?',
      '시장에서 어떤 반응을 예상하고 있나요?',
      '향후 해외 진출 계획이 있나요?'
    ]);
    showToast('💡 기사 취재 표준 예시 데이터가 입력되었습니다.', 'info');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('인터뷰 제목을 입력해 주세요.', 'warning');
      return;
    }
    if (!interviewee.trim()) {
      showToast('인터뷰 대상자(소속/직책/성함)를 입력해 주세요.', 'warning');
      return;
    }

    const validQuestions = questions.map((q) => q.trim()).filter(Boolean);
    if (validQuestions.length === 0) {
      showToast('사전 질문을 1개 이상 입력해 주세요.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSaveInterview({
        title: title.trim(),
        interviewee: interviewee.trim(),
        questions: validQuestions
      });
      onClose();
    } catch (err) {
      console.error(err);
      showToast(`인터뷰 생성 실패: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-badge-step">[인터뷰 전] 1단계</span>
            <h3 className="modal-title">새 인터뷰 생성 및 사전 질문 등록</h3>
          </div>
          <button className="btn-modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body modal-scroll-body">
          <div className="modal-notice-banner">
            <span className="notice-icon">📋</span>
            <div className="notice-text">
              <strong>원칙 준수 안내:</strong> 미리 입력하신 사전 질문은 실제 인터뷰 녹음 후
              <strong> '녹취 분석 및 질문별 답변 매칭 기준'</strong>으로만 활용됩니다.
              AI 음성 변환 시 원본 발언은 사전 질문에 맞춰 임의로 수정되지 않고 그대로 보존됩니다.
            </div>
            <button
              type="button"
              className="btn-sample-load"
              onClick={handleLoadSample}
            >
              예시 불러오기
            </button>
          </div>

          <div className="input-group-row">
            <div className="input-field flex-2">
              <label className="field-label">
                인터뷰 제목 <span className="req-star">*</span>
              </label>
              <input
                type="text"
                className="custom-text-input"
                placeholder="예: 2026년 신제품 출시 관련 인터뷰"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="input-field flex-1">
              <label className="field-label">
                인터뷰 대상자 (취재원) <span className="req-star">*</span>
              </label>
              <input
                type="text"
                className="custom-text-input"
                placeholder="예: 홍길동 / ○○기업 대표"
                value={interviewee}
                onChange={(e) => setInterviewee(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="pre-questions-section">
            <div className="pre-questions-header">
              <label className="field-label-bold">
                사전 질문 목록 ({questions.length}개)
              </label>
              <button
                type="button"
                className="btn-add-question"
                onClick={handleAddQuestion}
              >
                + 질문 추가
              </button>
            </div>
            <p className="field-subtext">
              취재 전 준비한 질문을 순서대로 등록하세요. 인터뷰 후 실제 취재원의 발화와 자동으로 대조 분석됩니다.
            </p>

            <div className="questions-input-list">
              {questions.map((q, idx) => (
                <div key={idx} className="question-input-row">
                  <span className="question-index-tag">Q{idx + 1}</span>
                  <input
                    type="text"
                    className="custom-text-input question-input"
                    placeholder={`Q${idx + 1} 질문을 입력하세요`}
                    value={q}
                    onChange={(e) => handleQuestionChange(idx, e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="btn-remove-q"
                    onClick={() => handleRemoveQuestion(idx)}
                    title="질문 삭제"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
              취소
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? '저장 중...' : '인터뷰 및 사전 질문 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
