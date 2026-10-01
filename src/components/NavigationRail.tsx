import React from 'react';
import {
  FileText,
  Search,
  Mic,
  Image,
  FolderArchive,
  ChevronLeft,
  ChevronRight,
  Database,
  Shield,
} from 'lucide-react';
import { useNewsroom } from '../context/NewsroomContext';
import { LeftNavView } from '../types';

export const NavigationRail: React.FC = () => {
  const {
    leftNavView,
    setLeftNavView,
    isLeftRailCollapsed,
    setIsLeftRailCollapsed,
    sources,
    interview,
    mediaAssets,
    archiveFiles,
    setWorkMode,
  } = useNewsroom();

  const navItems: Array<{
    id: LeftNavView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
    description: string;
  }> = [
    {
      id: 'editor',
      label: '기사',
      icon: FileText,
      description: '본문 문서 작성 및 퇴고',
    },
    {
      id: 'source_search',
      label: '자료 검색',
      icon: Search,
      count: sources.length,
      description: '공식 문서 및 보도자료 검색',
    },
    {
      id: 'interview',
      label: '인터뷰',
      icon: Mic,
      count: 1,
      description: '원음 연동 녹취 전사본',
    },
    {
      id: 'media',
      label: '미디어',
      icon: Image,
      count: mediaAssets.length,
      description: '보도 사진 및 크롭 규격',
    },
    {
      id: 'files',
      label: '파일',
      icon: FolderArchive,
      count: archiveFiles.length,
      description: '취재 자산 및 파생물 관리',
    },
  ];

  const handleSelect = (id: LeftNavView) => {
    setLeftNavView(id);
    if (id === 'files') {
      setWorkMode('archive');
    } else {
      setWorkMode('draft_review');
    }
  };

  return (
    <aside
      className={`bg-white border-r border-[#E3E6E9] flex flex-col justify-between transition-all duration-150 select-none shrink-0 z-20 ${
        isLeftRailCollapsed ? 'w-[56px]' : 'w-[190px]'
      }`}
      aria-label="취재 도구 메뉴"
    >
      {/* Menu items */}
      <div className="py-2 space-y-0.5 px-2">
        {navItems.map(item => {
          const isActive = leftNavView === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors group relative ${
                isActive
                  ? 'bg-slate-100 text-[#2457D6] font-semibold'
                  : 'text-[#626C78] hover:bg-slate-50 hover:text-[#20252C]'
              }`}
              title={isLeftRailCollapsed ? `${item.label} (${item.description})` : undefined}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-colors ${
                  isActive ? 'text-[#2457D6]' : 'text-slate-400 group-hover:text-slate-600'
                }`}
              />

              {!isLeftRailCollapsed && (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="truncate">{item.label}</span>
                  {item.count !== undefined && (
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums px-1.5 py-0.2 bg-slate-100 rounded-sm">
                      {item.count}
                    </span>
                  )}
                </div>
              )}

              {/* Collapsed view tooltip pill on hover */}
              {isLeftRailCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-white text-[11px] rounded shadow-md pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                  {item.label} {item.count !== undefined && `(${item.count})`}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Rail bottom collapse toggle & Desk note */}
      <div className="p-2 border-t border-[#E3E6E9]">
        {!isLeftRailCollapsed && (
          <div className="px-2 py-1.5 mb-1 bg-slate-50 rounded text-[11px] text-[#626C78] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="truncate font-mono">로컬 세션 유지됨</span>
          </div>
        )}

        <button
          onClick={() => setIsLeftRailCollapsed(prev => !prev)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-[#626C78] hover:text-[#20252C] hover:bg-slate-100 rounded transition-colors"
          title={isLeftRailCollapsed ? '메뉴 펼치기 (190px)' : '메뉴 접기 (56px 레일)'}
        >
          {isLeftRailCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <div className="flex items-center gap-1.5 w-full px-2">
              <ChevronLeft className="w-4 h-4" />
              <span className="text-[11px]">메뉴 축소</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
};
