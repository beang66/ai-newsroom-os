import React from 'react';
import {
  ListTree,
  ChevronRight,
  Info,
  Lightbulb,
  Compass,
  ArrowRight,
  FileCheck,
} from 'lucide-react';
import { useNewsroom } from '../context/NewsroomContext';
import { OutlineRole } from '../types';

export const StructureReviewPanel: React.FC = () => {
  const {
    outlineNodes,
    selectedParagraphIndex,
    setSelectedParagraphIndex,
    article,
    setHighlightedSentence,
  } = useNewsroom();

  const getRoleBadgeStyle = (role: OutlineRole) => {
    switch (role) {
      case 'Lead':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Fact':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Quote':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Background':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'Analysis':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Conclusion':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const handleNodeClick = (pIdx: number, snippet: string) => {
    setSelectedParagraphIndex(pIdx);
    setHighlightedSentence(snippet.slice(0, 30));
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs select-none">
      {/* Structural Constitution Banner */}
      <div className="p-3 bg-slate-50 rounded-lg border border-[#E3E6E9]">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1">
          <Compass className="w-3.5 h-3.5 text-[#2457D6]" />
          <span>기사 유형: {article.category}</span>
        </div>
        <p className="text-[11px] text-[#626C78] leading-relaxed">
          도입부(Lead) → 핵심 데이터(Fact) → 현장 증언(Quote) → 입법 배경(Background) → 전망(Analysis)으로 이어지는 탐사보도 표준 구성 흐름입니다.
        </p>
      </div>

      {/* Paragraph Nodes Outline List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 font-mono">
          <span>문단별 역할 및 아웃라인</span>
          <span>{outlineNodes.length}개 문단</span>
        </div>

        {outlineNodes.map((node, idx) => {
          const isSelected = selectedParagraphIndex === node.paragraphIndex;
          const roleStyle = getRoleBadgeStyle(node.role);

          return (
            <div
              key={node.id}
              onClick={() => handleNodeClick(node.paragraphIndex, node.snippet)}
              className={`p-3 rounded-lg border transition-all cursor-pointer text-left ${
                isSelected
                  ? 'bg-blue-50/50 border-[#2457D6] shadow-xs'
                  : 'bg-white border-[#E3E6E9] hover:border-slate-300 hover:bg-slate-50/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-slate-400 font-bold text-[11px]">
                    §{idx + 1}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${roleStyle}`}
                  >
                    {node.role}
                  </span>
                  <span className="font-medium text-[#20252C] truncate max-w-[170px]">
                    {node.roleLabel}
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </div>

              {/* Core Summary */}
              <p className="text-[#20252C] font-normal leading-snug mb-1 text-[12px]">
                {node.summary}
              </p>

              {/* Snippet preview */}
              <p className="text-[11px] text-slate-400 truncate font-mono">
                {node.snippet}
              </p>

              {/* Structural Suggestion if exists */}
              {node.suggestion && (
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-start gap-1.5 text-[11px] text-amber-900 bg-amber-50/60 p-1.5 rounded">
                  <Lightbulb className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                  <span>{node.suggestion}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Editorial Flow Guideline Notice */}
      <div className="p-3 bg-white rounded-lg border border-[#E3E6E9] text-[11px] text-[#626C78] space-y-1">
        <div className="font-semibold text-slate-700 flex items-center gap-1">
          <Info className="w-3 h-3 text-slate-400" />
          <span>편집 원칙 안내</span>
        </div>
        <p>
          본 시스템은 문단을 자동으로 재배열하거나 문장을 임의로 삭제하지 않습니다. 제안 사항을 참고하여 직접 원고를 보완하십시오.
        </p>
      </div>
    </div>
  );
};
