import React from "react";
import { 
  Sparkles, 
  PenTool, 
  Mic, 
  FileCheck2, 
  ChevronLeft, 
  Minus,
  FolderOpen
} from "lucide-react";

/**
 * 모던 레퍼런스 스타일 사이드바 컴포넌트
 * - 단일 컨테이너 구조로 접고 펼칠 때 아이콘(이모지)의 X/Y 위치가 완벽히 고정됨
 * - 접기/펼치기 화살표 버튼 위치 고정 및 제자리 회전(rotate-180) 애니메이션
 * - 상단: 기사 작성, 녹음 파일, 플랫폼 변환
 * - 세로선 아래 "나의 메뉴" 및 부속 메뉴 "나의 기사 모아보기"
 */
export default function Sidebar({ isCollapsed, setIsCollapsed, activeTab, setActiveTab }) {
  // 상단 메인 메뉴 그룹
  const mainMenus = [
    { id: "writer", label: "기사 작성", icon: PenTool },
    { id: "interview", label: "녹음 파일", icon: Mic },
    { id: "convert", label: "플랫폼 변환", icon: Sparkles },
  ];

  // 활성 탭 식별 함수
  const isTabActive = (tabId) => {
    if (tabId === "writer") {
      return ["writer", "factcheck", "search"].includes(activeTab);
    }
    return activeTab === tabId;
  };

  return (
    <aside
      className={`h-full z-20 select-none transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] flex flex-col ${
        isCollapsed ? "w-16" : "w-64 md:w-72"
      }`}
    >
      <div className="w-full h-full py-5 px-2.5 flex flex-col bg-[#F1F3F5]/75 backdrop-blur-xl backdrop-saturate-150 rounded-[28px] border border-white/80 shadow-[0_8px_32px_0_rgba(15,23,42,0.06)] relative overflow-hidden transition-all duration-300">
        
        {/* 1. 상단 브랜드 헤더: ✦ 심볼 + Menu 텍스트 (위치 고정) */}
        <div className="flex items-center h-10 px-0.5 mb-4">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center text-slate-900 cursor-pointer hover:scale-105 transition-transform"
            title={isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
          >
            <Sparkles className="w-5 h-5 fill-slate-900 text-slate-900" />
          </button>
          
          <div
            className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${
              isCollapsed ? "w-0 opacity-0 -translate-x-2" : "w-auto opacity-100 translate-x-0 ml-1.5"
            }`}
          >
            <span className="text-lg font-bold text-slate-900 tracking-tight">Menu</span>
          </div>
        </div>

        {/* 2. 메인 메뉴 그룹: 기사 작성, 녹음 파일, 플랫폼 변환 */}
        <div className="flex flex-col gap-2 w-full">
          {mainMenus.map((menu) => {
            const active = isTabActive(menu.id);
            const Icon = menu.icon;

            return (
              <button
                key={menu.id}
                onClick={() => setActiveTab(menu.id)}
                title={menu.label}
                className={`h-11 rounded-full flex items-center transition-all duration-300 cursor-pointer group relative ${
                  isCollapsed ? "w-11 justify-center px-0" : "w-full px-1"
                } ${
                  active
                    ? isCollapsed
                      ? "bg-white text-slate-900 shadow-md border border-slate-200/80 scale-105"
                      : "bg-[#18181B] text-white shadow-md shadow-slate-900/10"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
              >
                {/* 아이콘 컨테이너: 항상 정확한 고정 좌표(44x44px)에 중앙 정렬 */}
                <div className="w-11 h-11 flex-shrink-0 flex items-center justify-center">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      active
                        ? isCollapsed
                          ? "text-slate-900"
                          : "text-white"
                        : "text-slate-600 group-hover:text-slate-900"
                    }`}
                  />
                </div>

                {/* 메뉴 텍스트: 펼침 시 부드럽게 나타남 */}
                <div
                  className={`overflow-hidden transition-all duration-300 whitespace-nowrap flex items-center justify-between flex-1 ${
                    isCollapsed ? "w-0 opacity-0 -translate-x-2" : "w-auto opacity-100 translate-x-0 mr-3"
                  }`}
                >
                  <span className="text-sm font-medium truncate">{menu.label}</span>
                  {active && <Minus className="w-3.5 h-3.5 text-white/80 flex-shrink-0 ml-2" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* 3. 세로선 / 구분선 영역 */}
        <div className="my-4 flex flex-col items-center w-full transition-all duration-300">
          {isCollapsed ? (
            // 접혔을 때: 레퍼런스 스타일 세로 가이드 라인 + 중앙 도트
            <div className="flex flex-col items-center my-1">
              <div className="w-px h-7 bg-slate-300" />
              <div className="w-1.5 h-1.5 rounded-full bg-slate-400 my-1" />
              <div className="w-px h-7 bg-slate-300" />
            </div>
          ) : (
            // 펼쳐졌을 때: 얇은 가로 구분선과 "나의 메뉴" 라벨
            <div className="w-full">
              <div className="w-full h-px bg-slate-200/80 mb-3" />
              <div className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                나의 메뉴
              </div>
            </div>
          )}
        </div>

        {/* 4. "나의 메뉴" 부속 메뉴: 나의 기사 모아보기 */}
        <div className="w-full">
          {/* 펼쳐졌을 때 서브트리 연결선 구조 (레퍼런스 이미지 Threads 하위 스타일) */}
          <div className={`${!isCollapsed ? "ml-3.5 pl-2 border-l border-slate-300" : ""}`}>
            <button
              onClick={() => setActiveTab("archive")}
              title="나의 기사 모아보기"
              className={`h-11 rounded-full flex items-center transition-all duration-300 cursor-pointer group relative ${
                isCollapsed ? "w-11 justify-center px-0" : "w-full px-1"
              } ${
                activeTab === "archive"
                  ? isCollapsed
                    ? "bg-white text-slate-900 shadow-md border border-slate-200/80 scale-105"
                    : "bg-[#18181B] text-white shadow-md shadow-slate-900/10"
                  : !isCollapsed
                    ? "bg-white/80 text-slate-700 hover:bg-white hover:text-slate-900 shadow-sm border border-slate-200/60"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              {/* 아이콘: 고정 위치 */}
              <div className="w-11 h-11 flex-shrink-0 flex items-center justify-center">
                <FileCheck2
                  className={`w-4 h-4 transition-colors ${
                    activeTab === "archive"
                      ? isCollapsed
                        ? "text-slate-900"
                        : "text-white"
                      : "text-slate-600 group-hover:text-slate-900"
                  }`}
                />
              </div>

              {/* 텍스트 라벨 */}
              <div
                className={`overflow-hidden transition-all duration-300 whitespace-nowrap flex items-center justify-between flex-1 ${
                  isCollapsed ? "w-0 opacity-0 -translate-x-2" : "w-auto opacity-100 translate-x-0 mr-3"
                }`}
              >
                <span className="text-sm font-medium truncate">나의 기사 모아보기</span>
                {activeTab === "archive" && (
                  <Minus className="w-3.5 h-3.5 text-white/80 flex-shrink-0 ml-2" />
                )}
              </div>
            </button>
          </div>
        </div>

        {/* 5. 최하단: 접기/펼치기 화살표 버튼 (위치 완벽 고정 & 180도 회전) */}
        <div className="mt-auto pt-3 flex items-center h-11 px-0.5">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-11 h-11 flex items-center justify-center flex-shrink-0 cursor-pointer group"
            title={isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
          >
            <div className="w-9 h-9 rounded-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 shadow-sm flex items-center justify-center transition-all duration-200 group-hover:scale-105 active:scale-95">
              <ChevronLeft
                className={`w-4 h-4 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                  isCollapsed ? "rotate-180" : "rotate-0"
                }`}
              />
            </div>
          </button>
        </div>

      </div>
    </aside>
  );
}
