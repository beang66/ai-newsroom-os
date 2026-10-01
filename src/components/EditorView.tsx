import React, { useRef, useEffect } from 'react';
import {
  Bold,
  Italic,
  Heading2,
  Quote,
  List,
  Link as LinkIcon,
  Highlighter,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Info,
  Check,
} from 'lucide-react';
import { useNewsroom } from '../context/NewsroomContext';
import { ArticleCategory } from '../types';

export const EditorView: React.FC = () => {
  const {
    article,
    updateArticleContent,
    updateArticleTitle,
    updateArticleSubtitle,
    updateArticleCategory,
    selectedParagraphIndex,
    setSelectedParagraphIndex,
    highlightedSentence,
    setHighlightedSentence,
    verificationIssues,
    selectedIssueId,
    jumpToIssueSentence,
    runFullVerification,
    isVerifying,
    aiErrorMessage,
  } = useNewsroom();

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const paragraphRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Split content into paragraphs
  const paragraphs = article.content.split('\n\n');

  // Character and word count metrics
  const charCountWithSpace = article.content.length;
  const charCountNoSpace = article.content.replace(/\s+/g, '').length;
  const wordCount = article.content.trim() ? article.content.trim().split(/\s+/).length : 0;
  const estReadMinutes = Math.max(1, Math.ceil(wordCount / 220));

  // Scroll to selected paragraph if changed
  useEffect(() => {
    if (
      selectedParagraphIndex !== null &&
      paragraphRefs.current[selectedParagraphIndex]
    ) {
      paragraphRefs.current[selectedParagraphIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [selectedParagraphIndex]);

  // Handle single paragraph text edit
  const handleParagraphChange = (index: number, newParaText: string) => {
    const updatedParas = [...paragraphs];
    updatedParas[index] = newParaText;
    updateArticleContent(updatedParas.join('\n\n'));
  };

  // Minimal format insertion helper (simulated format decoration)
  const insertFormatting = (prefix: string, suffix: string = '') => {
    // For general document editing, append or wrap
    const activeIdx = selectedParagraphIndex ?? 0;
    if (paragraphs[activeIdx] !== undefined) {
      const current = paragraphs[activeIdx];
      const updated = `${prefix}${current}${suffix}`;
      handleParagraphChange(activeIdx, updated);
    }
  };

  const categories: ArticleCategory[] = [
    '탐사보도',
    '심층기획',
    '스트레이트',
    '해설·분석',
    '인터뷰',
  ];

  return (
    <div
      ref={editorContainerRef}
      className="flex-1 overflow-y-auto bg-[#F6F7F8] flex flex-col items-center py-6 px-4 md:px-8 select-text"
    >
      {/* Sticky Editorial Toolbar */}
      <div className="sticky top-0 z-20 w-full max-w-[840px] bg-white/95 backdrop-blur-xs border border-[#E3E6E9] rounded-lg shadow-xs px-3 py-1.5 mb-6 flex items-center justify-between text-xs select-none">
        <div className="flex items-center gap-1">
          {/* Format buttons */}
          <button
            onClick={() => insertFormatting('**', '**')}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
            title="굵게 (Ctrl+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('*', '*')}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
            title="기울임 (Ctrl+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <span className="w-px h-4 bg-slate-200 mx-1" />
          <button
            onClick={() => insertFormatting('## ')}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
            title="소제목 (H2)"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('> "')}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
            title="인용구 삽입"
          >
            <Quote className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('- ')}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
            title="목록"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('==', '==')}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
            title="강조 표시"
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Word count & Read time */}
        <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px] tabular-nums">
          <span>
            공백 포함 {charCountWithSpace}자 / 공백 제외 {charCountNoSpace}자
          </span>
          <span className="text-slate-300">·</span>
          <span>단어 {wordCount}개</span>
          <span className="text-slate-300">·</span>
          <span>약 {estReadMinutes}분 분량</span>
        </div>
      </div>

      {/* Outdated analysis warning banner */}
      {article.isEditedSinceReview && (
        <div className="w-full max-w-[840px] mb-4 p-3 bg-amber-50/90 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-900 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>원고 수정됨</strong>: 검증 이후 본문 변경 사항이 있습니다.
              (기준 원고: v{article.lastReviewedVersion} → 현재 v{article.version})
            </span>
          </div>
          <button
            onClick={runFullVerification}
            disabled={isVerifying}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded transition-colors flex items-center gap-1 shrink-0"
          >
            <RotateCcw className={`w-3 h-3 ${isVerifying ? 'animate-spin' : ''}`} />
            {isVerifying ? '검증 중...' : '원고 재검토 실행'}
          </button>
        </div>
      )}

      {/* AI Error simulation banner if triggered */}
      {aiErrorMessage && (
        <div className="w-full max-w-[840px] mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-xs text-red-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{aiErrorMessage}</span>
          </div>
          <button
            onClick={runFullVerification}
            className="px-2.5 py-1 bg-red-600 text-white rounded font-medium hover:bg-red-700"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* White Paper Manuscript Container (Document Centric) */}
      <article className="w-full max-w-[840px] bg-white border border-[#E3E6E9] rounded-lg shadow-xs p-8 md:p-12 transition-all">
        {/* Article Meta Bar: Category, Byline, Date */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-[#E3E6E9] mb-6 text-xs text-[#626C78]">
          <div className="flex items-center gap-2">
            <label htmlFor="article-category-select" className="text-slate-400 font-mono text-[11px]">
              분류:
            </label>
            <select
              id="article-category-select"
              value={article.category}
              onChange={e => updateArticleCategory(e.target.value as ArticleCategory)}
              className="bg-[#F6F7F8] border border-[#E3E6E9] rounded px-2.5 py-1 text-xs font-semibold text-[#2457D6] focus:outline-hidden focus:ring-1 focus:ring-[#2457D6] cursor-pointer"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              value={article.byline}
              onChange={e => updateArticleContent(article.content)} // preserves context
              className="text-xs text-[#626C78] bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[#2457D6] focus:outline-hidden text-right"
              placeholder="기자 바이라인"
            />
            <span className="text-slate-300">·</span>
            <span className="font-mono text-slate-400 tabular-nums">
              버전 v{article.version}
            </span>
          </div>
        </div>

        {/* Article Main Headline (editorial-title 30-34px) */}
        <div className="mb-4">
          <textarea
            value={article.title}
            onChange={e => updateArticleTitle(e.target.value)}
            rows={2}
            className="w-full resize-none font-bold text-[30px] md:text-[33px] text-[#20252C] leading-[1.3] tracking-tight bg-transparent focus:outline-hidden focus:bg-slate-50/50 rounded-sm p-1 -m-1 placeholder-slate-300"
            placeholder="기사 제목을 입력하세요..."
          />
        </div>

        {/* Article Subtitle (17-18px, 1.55 line-height) */}
        <div className="mb-8">
          <textarea
            value={article.subtitle}
            onChange={e => updateArticleSubtitle(e.target.value)}
            rows={2}
            className="w-full resize-none text-[17px] text-[#626C78] leading-[1.6] bg-transparent focus:outline-hidden focus:bg-slate-50/50 rounded-sm p-1 -m-1 placeholder-slate-300 font-normal"
            placeholder="기사 부제 또는 핵심 요약문을 입력하세요..."
          />
        </div>

        {/* Article Body Paragraphs (editorial-body, 17.5px, line-height 1.75) */}
        <div className="space-y-6">
          {paragraphs.map((paraText, pIdx) => {
            const isSelected = selectedParagraphIndex === pIdx;

            // Check if this paragraph contains the active issue or highlighted sentence
            const paraIssues = verificationIssues.filter(
              i => i.paragraphIndex === pIdx && i.status !== 'ignored'
            );
            const hasCriticalIssue = paraIssues.some(i => i.severity === 'critical');
            const hasReviewIssue = paraIssues.some(i => i.severity === 'review');

            return (
              <div
                key={pIdx}
                ref={el => {
                  paragraphRefs.current[pIdx] = el;
                }}
                onClick={() => setSelectedParagraphIndex(pIdx)}
                className={`relative group rounded-md p-3 -m-3 transition-colors ${
                  isSelected
                    ? 'bg-blue-50/30 ring-1 ring-[#2457D6]/30'
                    : 'hover:bg-slate-50/50'
                }`}
              >
                {/* Paragraph role indicator tag on left margin */}
                <div className="absolute -left-7 top-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-[10px] text-slate-400 font-mono font-medium">
                    P{pIdx + 1}
                  </span>
                </div>

                {/* Issue badge attached to paragraph if issues exist */}
                {paraIssues.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5 select-none">
                    {paraIssues.map(iss => {
                      const isTarget = selectedIssueId === iss.id;
                      return (
                        <button
                          key={iss.id}
                          onClick={e => {
                            e.stopPropagation();
                            jumpToIssueSentence(iss.id);
                          }}
                          className={`text-[11px] px-2 py-0.5 rounded flex items-center gap-1 font-medium transition-all ${
                            iss.severity === 'critical'
                              ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                              : iss.severity === 'review'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                              : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                          } ${isTarget ? 'ring-2 ring-[#2457D6] font-bold' : ''}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              iss.severity === 'critical'
                                ? 'bg-red-600'
                                : iss.severity === 'review'
                                ? 'bg-amber-500'
                                : 'bg-blue-500'
                            }`}
                          />
                          <span>{iss.category}</span>
                          <span className="text-[10px] opacity-75">
                            ({iss.status === 'confirmed' ? '확인됨' : '확인 필요'})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Paragraph editable textarea with auto height */}
                <textarea
                  value={paraText}
                  onChange={e => handleParagraphChange(pIdx, e.target.value)}
                  rows={Math.max(2, Math.ceil(paraText.length / 42))}
                  className={`w-full resize-none editorial-body bg-transparent focus:outline-hidden transition-colors ${
                    highlightedSentence && paraText.includes(highlightedSentence)
                      ? 'bg-amber-50/70 border-b-2 border-amber-400'
                      : ''
                  }`}
                  placeholder="문단을 작성하세요..."
                />
              </div>
            );
          })}
        </div>

        {/* Add Paragraph button at end of article */}
        <div className="mt-8 pt-6 border-t border-[#E3E6E9] flex items-center justify-between text-xs text-slate-400">
          <button
            onClick={() => {
              const newContent = `${article.content}\n\n새로운 문단을 입력하세요.`;
              updateArticleContent(newContent);
            }}
            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-[#626C78] hover:text-[#20252C] rounded border border-[#E3E6E9] font-medium transition-colors"
          >
            + 새 문단 추가
          </button>

          <span className="font-mono text-[11px]">
            마지막 저장: {article.lastSavedAt}
          </span>
        </div>
      </article>
    </div>
  );
};
