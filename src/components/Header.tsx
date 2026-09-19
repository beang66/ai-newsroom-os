import React from 'react';
import { 
  FileText, 
  Sparkles, 
  Share2, 
  CheckCircle2, 
  Clock, 
  Layers, 
  FolderGit2, 
  BookOpen,
  ArrowRight
} from 'lucide-react';
import { Article, NavSection } from '../types';

interface HeaderProps {
  article: Article;
  currentNav: NavSection;
  onNavigate: (section: NavSection) => void;
  onRunReview: () => void;
  onOpenExport: () => void;
  isReviewing?: boolean;
  critiqueCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  article,
  currentNav,
  onNavigate,
  onRunReview,
  onOpenExport,
  isReviewing = false,
  critiqueCount,
}) => {
  // Compute word count
  const wordCount = article.nodes.reduce((acc, node) => {
    return acc + (node.text.trim() ? node.text.trim().split(/\s+/).length : 0);
  }, 0);

  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 225));

  return (
    <header className="h-13 border-b border-neutral-200 bg-white flex items-center justify-between px-3.5 select-none sticky top-0 z-30">
      {/* Brand & Nav */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2.5 pr-3.5 border-r border-neutral-200">
          <div className="w-6 h-6 bg-[#008285] text-white flex items-center justify-center font-mono-code font-bold text-[10pt] tracking-tight rounded-xs shadow-2xs">
            OS
          </div>
          <span className="font-semibold text-[11.5pt] tracking-tight text-black">
            AI Newsroom OS
          </span>
          <span className="font-mono-code text-[10pt] text-[#006b6e] bg-[#edf7f7] px-2 py-0.5 border border-[#bce3e4] uppercase font-semibold rounded-xs">
            실시간 데스크
          </span>
        </div>

        {/* Minimal Navigation: Home / Articles / Sources */}
        <nav className="flex items-center space-x-1.5" aria-label="메인 내비게이션">
          <button
            id="nav-workspace-btn"
            onClick={() => onNavigate('workspace')}
            className={`px-3 py-1.5 rounded-xs font-medium transition-colors flex items-center space-x-1.5 text-[10.5pt] cursor-pointer ${
              currentNav === 'workspace'
                ? 'bg-black text-white'
                : 'text-neutral-700 hover:text-black hover:bg-neutral-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>워크스페이스</span>
          </button>

          <button
            id="nav-articles-btn"
            onClick={() => onNavigate('articles')}
            className={`px-3 py-1.5 rounded-xs font-medium transition-colors flex items-center space-x-1.5 text-[10.5pt] cursor-pointer ${
              currentNav === 'articles'
                ? 'bg-black text-white'
                : 'text-neutral-700 hover:text-black hover:bg-neutral-100'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>기사 목록</span>
          </button>

          <button
            id="nav-sources-btn"
            onClick={() => onNavigate('sources')}
            className={`px-3 py-1.5 rounded-xs font-medium transition-colors flex items-center space-x-1.5 text-[10.5pt] cursor-pointer ${
              currentNav === 'sources'
                ? 'bg-black text-white'
                : 'text-neutral-700 hover:text-black hover:bg-neutral-100'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>취재 자료 보관소</span>
          </button>
        </nav>
      </div>

      {/* Story Metadata & Live Status */}
      <div className="hidden lg:flex items-center space-x-3.5 text-neutral-500 font-mono-code text-[10pt]">
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-[#008285] animate-pulse"></span>
          <span className="text-black font-medium">자동 저장: {article.lastSaved}</span>
        </div>
        <span className="text-neutral-300">|</span>
        <div className="flex items-center space-x-1">
          <span className="font-semibold text-black">{wordCount}단어</span>
          <span className="text-neutral-500">(읽기 약 {readingTimeMinutes}분)</span>
        </div>
        <span className="text-neutral-300">|</span>
        <div>
          <span className="font-semibold text-black">{article.nodes.length}개 노드</span>
        </div>
      </div>

      {/* Workspace Actions */}
      <div className="flex items-center space-x-2">
        <button
          id="header-run-review-btn"
          onClick={onRunReview}
          disabled={isReviewing}
          className={`h-8 px-3 border text-[10.5pt] font-medium rounded-xs flex items-center space-x-1.5 transition-colors cursor-pointer ${
            critiqueCount > 0
              ? 'bg-[#edf7f7] text-[#006b6e] border-[#bce3e4] hover:bg-[#e2f3f4]'
              : 'bg-white text-black border-neutral-300 hover:bg-neutral-50'
          }`}
          title="팩트, 논리, 균형성, 출처 정밀 AI 에디토리얼 검토 실행"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isReviewing ? 'animate-spin text-[#008285]' : 'text-[#008285]'}`} />
          <span>{isReviewing ? '분석 중...' : 'AI 기사 검토'}</span>
          {critiqueCount > 0 && (
            <span className="ml-1 bg-[#008285] text-white text-[10pt] px-1.5 py-0.2 rounded font-mono-code font-bold">
              {critiqueCount}
            </span>
          )}
        </button>

        <button
          id="header-export-btn"
          onClick={onOpenExport}
          className="h-8 px-3.5 bg-black text-white hover:bg-[#008285] text-[10.5pt] font-medium rounded-xs flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>기사 송고 / 내보내기</span>
        </button>
      </div>
    </header>
  );
};
