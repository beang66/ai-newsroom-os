import React, { useState } from 'react';
import {
  Search,
  ExternalLink,
  Link2,
  FileText,
  Filter,
  CheckCircle2,
  AlertCircle,
  X,
  FileCheck,
  ChevronLeft,
  RotateCcw,
} from 'lucide-react';
import { useNewsroom } from '../context/NewsroomContext';
import { SourceDocument } from '../types';

export const SourceSearchPanel: React.FC = () => {
  const {
    sources,
    sourceSearchQuery,
    setSourceSearchQuery,
    linkSourceToArticle,
    unlinkSourceFromArticle,
    linkSourceToIssue,
    activeIssueForSourceLink,
    setActiveIssueForSourceLink,
    jumpToIssueSentence,
    setLeftNavView,
    sourceSearchState,
    setSourceSearchState,
  } = useNewsroom();

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('전체');
  const [selectedSourceForDetail, setSelectedSourceForDetail] = useState<SourceDocument | null>(null);

  const categories = ['전체', '정부보고서', '공식통계', '국회회의록'];

  const filteredSources = sources.filter(src => {
    // Search query filter
    const matchesQuery =
      !sourceSearchQuery.trim() ||
      src.title.toLowerCase().includes(sourceSearchQuery.toLowerCase()) ||
      src.snippet.toLowerCase().includes(sourceSearchQuery.toLowerCase()) ||
      src.publisher.toLowerCase().includes(sourceSearchQuery.toLowerCase());

    // Category filter
    const matchesCat =
      activeCategoryFilter === '전체' ||
      src.tags.includes(activeCategoryFilter);

    return matchesQuery && matchesCat;
  });

  const handleLinkToActiveIssue = (sourceId: string) => {
    if (activeIssueForSourceLink) {
      linkSourceToIssue(activeIssueForSourceLink, sourceId);
      // Return to draft sentence
      jumpToIssueSentence(activeIssueForSourceLink);
      setActiveIssueForSourceLink(null);
    } else {
      linkSourceToArticle(sourceId);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F6F7F8] overflow-hidden select-none">
      {/* Search Header Bar */}
      <div className="bg-white border-b border-[#E3E6E9] p-4 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLeftNavView('editor')}
              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors"
              title="기사 편집기로 돌아가기"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="font-semibold text-sm text-[#20252C] flex items-center gap-1.5">
              <span>취재 자료 검색 및 원문 인용</span>
              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                시뮬레이션
              </span>
            </h2>
          </div>

          {activeIssueForSourceLink && (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">
              <span className="font-semibold">검증 이슈 연결 모드</span>
              <button
                onClick={() => setActiveIssueForSourceLink(null)}
                className="text-amber-700 hover:text-amber-900 font-bold"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={sourceSearchQuery}
            onChange={e => setSourceSearchQuery(e.target.value)}
            placeholder="자료명, 발행처, 법안 번호, 통계 키워드 검색..."
            className="w-full pl-9 pr-8 py-2 bg-[#F6F7F8] border border-[#E3E6E9] rounded-lg text-xs text-[#20252C] focus:outline-hidden focus:ring-1 focus:ring-[#2457D6] focus:bg-white"
          />
          {sourceSearchQuery && (
            <button
              onClick={() => setSourceSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Filters & State Test Switches */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto text-xs">
          <div className="flex items-center gap-1">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  activeCategoryFilter === cat
                    ? 'bg-[#2457D6] text-white'
                    : 'bg-[#F6F7F8] text-[#626C78] hover:text-[#20252C]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Test toggle between normal, empty, failed */}
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 shrink-0 font-mono">
            <span>테스트 상태:</span>
            <button
              onClick={() => setSourceSearchState('idle')}
              className={`px-1.5 py-0.5 rounded ${sourceSearchState === 'idle' ? 'bg-slate-200 text-slate-800' : 'hover:bg-slate-100'}`}
            >
              정상
            </button>
            <button
              onClick={() => setSourceSearchState('empty')}
              className={`px-1.5 py-0.5 rounded ${sourceSearchState === 'empty' ? 'bg-amber-100 text-amber-800' : 'hover:bg-slate-100'}`}
            >
              결과없음
            </button>
            <button
              onClick={() => setSourceSearchState('failed')}
              className={`px-1.5 py-0.5 rounded ${sourceSearchState === 'failed' ? 'bg-red-100 text-red-800' : 'hover:bg-slate-100'}`}
            >
              실패
            </button>
          </div>
        </div>
      </div>

      {/* Results Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sourceSearchState === 'failed' ? (
          <div className="p-8 text-center bg-white rounded-lg border border-red-200 space-y-2">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
            <div className="text-xs font-semibold text-red-800">
              외부 공공 데이터 저장소 연결 타임아웃 (시뮬레이션)
            </div>
            <p className="text-[11px] text-slate-500">
              연결 포트 점검 및 검색 쿼리를 다시 확인하십시오.
            </p>
            <button
              onClick={() => setSourceSearchState('idle')}
              className="mt-2 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded font-medium"
            >
              다시 시도
            </button>
          </div>
        ) : sourceSearchState === 'empty' || filteredSources.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-lg border border-[#E3E6E9] space-y-2">
            <Search className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-xs font-semibold text-slate-700">일치하는 취재 자료가 없습니다</div>
            <p className="text-[11px] text-slate-400">
              검색어를 변경하거나 다른 카테고리를 선택해 보세요.
            </p>
            <button
              onClick={() => {
                setSourceSearchQuery('');
                setActiveCategoryFilter('전체');
                setSourceSearchState('idle');
              }}
              className="mt-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded"
            >
              전체 목록 보기
            </button>
          </div>
        ) : (
          filteredSources.map(src => {
            return (
              <div
                key={src.id}
                className="bg-white p-4 rounded-lg border border-[#E3E6E9] hover:border-slate-300 transition-all space-y-2.5"
              >
                {/* Source Title & Meta */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <h3 className="font-semibold text-xs text-[#20252C] leading-snug">
                      {src.title}
                    </h3>
                    <div className="flex items-center gap-2 text-[11px] text-[#626C78]">
                      <span>{src.publisher}</span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono tabular-nums">{src.publishDate}</span>
                    </div>
                  </div>

                  {/* Distinction between Raw Quote vs AI Summary */}
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                      src.isAiSummary
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {src.isAiSummary ? 'AI 요약본' : '공식 원문 인용'}
                  </span>
                </div>

                {/* Snippet preview */}
                <div className="p-2.5 bg-[#F6F7F8] rounded text-[11.5px] text-[#20252C] leading-relaxed font-serif border-l-2 border-[#2457D6]">
                  {src.snippet}
                </div>

                {/* Tags */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {src.tags.map(t => (
                    <span
                      key={t}
                      className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono"
                    >
                      #{t}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    onClick={() => setSelectedSourceForDetail(src)}
                    className="text-[#2457D6] hover:underline font-medium flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>원문 전체 확인</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {src.isLinkedToArticle ? (
                      <div className="flex items-center gap-1.5">
                        <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          기사에 연결됨
                        </span>
                        <button
                          onClick={() => unlinkSourceFromArticle(src.id)}
                          className="text-[11px] text-slate-400 hover:text-red-600"
                        >
                          연결 해제
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleLinkToActiveIssue(src.id)}
                        className="px-2.5 py-1 bg-[#2457D6] hover:bg-[#1D46AF] text-white rounded font-medium text-[11px] transition-colors flex items-center gap-1"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>
                          {activeIssueForSourceLink ? '이 문장의 근거로 연결' : '기사에 출처 연결'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Full Document Reader Drawer / Modal */}
      {selectedSourceForDetail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[700px] max-h-[85vh] flex flex-col overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#E3E6E9] flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-semibold text-sm text-[#20252C]">
                  {selectedSourceForDetail.title}
                </h3>
                <div className="text-xs text-[#626C78] mt-0.5">
                  {selectedSourceForDetail.publisher} · {selectedSourceForDetail.publishDate}
                </div>
              </div>
              <button
                onClick={() => setSelectedSourceForDetail(null)}
                className="p-1 hover:bg-slate-200 rounded text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Full Document Text */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs leading-relaxed text-[#20252C] font-serif whitespace-pre-wrap select-text">
              {selectedSourceForDetail.fullText}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-[#E3E6E9] bg-slate-50 flex items-center justify-between text-xs">
              <a
                href={selectedSourceForDetail.originalUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#626C78] hover:text-[#20252C] flex items-center gap-1 font-mono text-[11px]"
              >
                <ExternalLink className="w-3 h-3" />
                외부 원문 링크 (가상 URL)
              </a>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedSourceForDetail(null)}
                  className="px-3 py-1.5 bg-white border border-[#E3E6E9] rounded text-slate-700 hover:bg-slate-100"
                >
                  닫기
                </button>
                <button
                  onClick={() => {
                    handleLinkToActiveIssue(selectedSourceForDetail.id);
                    setSelectedSourceForDetail(null);
                  }}
                  className="px-3 py-1.5 bg-[#2457D6] text-white rounded font-medium hover:bg-[#1D46AF]"
                >
                  기사 근거로 연결
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
