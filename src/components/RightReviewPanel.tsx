import React from 'react';
import {
  ListTree,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { useNewsroom } from '../context/NewsroomContext';
import { StructureReviewPanel } from './StructureReviewPanel';
import { VerificationPanel } from './VerificationPanel';

export const RightReviewPanel: React.FC = () => {
  const {
    rightPanelTab,
    setRightPanelTab,
    isRightPanelOpen,
    setIsRightPanelOpen,
    verificationIssues,
    selectedIssueId,
    jumpToIssueSentence,
  } = useNewsroom();

  const unconfirmedIssues = verificationIssues.filter(
    i => i.status === 'unconfirmed'
  );
  const criticalCount = unconfirmedIssues.filter(i => i.severity === 'critical').length;
  const reviewCount = unconfirmedIssues.filter(i => i.severity === 'review').length;

  const activeSelectedIssue = verificationIssues.find(i => i.id === selectedIssueId);

  // If panel is collapsed, show compact vertical rail with issue badges and toggle
  if (!isRightPanelOpen) {
    return (
      <aside className="w-12 bg-white border-l border-[#E3E6E9] flex flex-col items-center py-3 select-none shrink-0 z-20">
        <button
          onClick={() => setIsRightPanelOpen(true)}
          className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 mb-3"
          title="검토 패널 펼치기"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Vertical mode indicators */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => {
              setRightPanelTab('structure');
              setIsRightPanelOpen(true);
            }}
            className="p-2 rounded text-slate-500 hover:text-[#2457D6] hover:bg-slate-100"
            title="구조 점검 패널"
          >
            <ListTree className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setRightPanelTab('verification');
              setIsRightPanelOpen(true);
            }}
            className="p-2 rounded relative text-slate-500 hover:text-[#2457D6] hover:bg-slate-100"
            title="검증 패널"
          >
            <CheckCircle2 className="w-4 h-4" />
            {criticalCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-600" />
            )}
          </button>
        </div>

        {/* Selected Issue Badge on collapsed rail for easy return */}
        {activeSelectedIssue && (
          <div className="mt-auto px-1 flex flex-col items-center">
            <button
              onClick={() => {
                setIsRightPanelOpen(true);
                setRightPanelTab('verification');
              }}
              className="p-1.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300"
              title={`현재 검토 중인 이슈: ${activeSelectedIssue.category}`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            </button>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside
      className="w-[360px] lg:w-[380px] bg-[#F6F7F8] border-l border-[#E3E6E9] flex flex-col select-none shrink-0 z-20"
      aria-label="원고 검토 및 검증 도구"
    >
      {/* Panel Top Tabs (구조 / 검증) & Collapse button */}
      <div className="h-[48px] bg-white border-b border-[#E3E6E9] px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1 p-0.5 bg-[#F6F7F8] rounded-md border border-[#E3E6E9]">
          <button
            onClick={() => setRightPanelTab('structure')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
              rightPanelTab === 'structure'
                ? 'bg-white text-[#2457D6] font-bold shadow-xs'
                : 'text-[#626C78] hover:text-[#20252C]'
            }`}
          >
            <ListTree className="w-3.5 h-3.5" />
            <span>구조</span>
          </button>

          <button
            onClick={() => setRightPanelTab('verification')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
              rightPanelTab === 'verification'
                ? 'bg-white text-[#2457D6] font-bold shadow-xs'
                : 'text-[#626C78] hover:text-[#20252C]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>검증</span>
            {unconfirmedIssues.length > 0 && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full tabular-nums ${
                  criticalCount > 0
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {unconfirmedIssues.length}
              </span>
            )}
          </button>
        </div>

        {/* Collapse button */}
        <button
          onClick={() => setIsRightPanelOpen(false)}
          className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors"
          title="검토 패널 닫기"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Panel Content */}
      {rightPanelTab === 'structure' ? (
        <StructureReviewPanel />
      ) : (
        <VerificationPanel />
      )}
    </aside>
  );
};
