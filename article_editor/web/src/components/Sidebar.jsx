import React from "react";
import {
  PenTool,
  Mic,
  Send,
  Settings,
  FolderArchive,
  ChevronsLeft,
  ChevronRight
} from "lucide-react";

// 사용자 첨부 이미지와 100% 동일한 AI 스파클 별 아이콘 (4각 별 + 우측 상단 플러스 + 좌측 하단 점)
function AiSparkleStarIcon({ className = "w-5 h-5", strokeWidth = 2.2 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* 중앙 곡선 4각 별 */}
      <path d="M12 3C12 7.5 8.5 11 4 11C8.5 11 12 14.5 12 19C12 14.5 15.5 11 20 11C15.5 11 12 7.5 12 3Z" />
      {/* 우측 상단 작은 플러스 (+) */}
      <path d="M19.5 3.5v3M18 5h3" />
      {/* 좌측 하단 작은 원형 도트 (•) */}
      <circle cx="5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Modern Glassmorphism Slim & Expandable Sidebar
 * - 상단: AI 스파클 아이콘 + AI Newsroom
 * - 메뉴: 영문(English) 인터페이스 표기
 * - 접힌 상태: 세로형 슬림 Glass 캡슐 패널 (w: ~76px)
 * - 펼친 상태: 가로 확장 Glass Navigation Drawer (w: ~295px)
 */
export default function Sidebar({ isCollapsed, setIsCollapsed, activeTab, setActiveTab, session = null, onModels }) {
  // 프로필 칸은 코어가 알려주는 세션 상태를 보여 준다(가짜 이름·요금제 없음).
  const email = session?.email || "";
  const profileName = session?.signedIn ? (email || "로그인됨") : "로그인하지 않음";
  const profileInitial = email ? email.slice(0, 1).toUpperCase() : "👤";
  // 펼침 상태: isCollapsed가 false이면 펼쳐진 상태
  const isExpanded = !isCollapsed;

  // 영문 네비게이션 아이템 리스트 (기존 탭 기능 100% 보존)
  const navItems = [
    { id: "writer", label: "Article Writer", icon: PenTool, isTab: true },
    { id: "interview", label: "Interview & Audio", icon: Mic, isTab: true },
    { id: "convert", label: "Publish & Convert", icon: Send, isTab: true },
    { id: "archive", label: "Saved Archive", icon: FolderArchive, isTab: true },
  ];

  // 활성 탭 식별 함수
  const isTabActive = (tabId) => {
    if (tabId === "writer") {
      return ["writer", "factcheck"].includes(activeTab);
    }
    return activeTab === tabId;
  };

  const handleToggleExpand = () => {
    if (setIsCollapsed) {
      setIsCollapsed(!isCollapsed);
    }
  };

  return (
    <aside className="sticky top-4 self-start z-30 select-none flex flex-col items-center flex-shrink-0 transition-all duration-300 ease-out">
      <div
        className={`relative flex flex-col transition-all duration-300 ease-out ${isExpanded
          ? "w-[285px] md:w-[300px] p-5"
          : "w-[72px] md:w-[76px] py-5 px-3 items-center"
          }`}
        style={{
          minHeight: "calc(100vh - 90px)",
          background: isExpanded ? "rgba(255, 255, 255, 0.78)" : "rgba(255, 255, 255, 0.72)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
          boxShadow: isExpanded
            ? "0 16px 40px rgba(40, 35, 25, 0.09)"
            : "0 10px 32px rgba(40, 35, 25, 0.07)",
          borderRadius: isExpanded ? "38px" : "42px"
        }}
      >

        {/* ──────────────────────────────────────────
            1. 상단 로고 및 펼치기/접기 헤더
           ────────────────────────────────────────── */}
        {isExpanded ? (
          /* [펼친 상태 상단 헤더]: 배경 박스 없이 스파클 아이콘 + AI Newsroom + [« 접기 버튼] */
          <div className="flex items-center justify-between w-full mb-6 pt-1 px-1">
            <button
              onClick={() => setActiveTab("writer")}
              className="flex items-center gap-2.5 transition cursor-pointer group text-left"
              title="menu"
            >
              <AiSparkleStarIcon className="w-6 h-6 text-slate-400 group-hover:text-slate-300 drop-shadow-[0_0_6px_rgba(180,195,210,0.5)] group-hover:scale-110 transition-all" strokeWidth={2.4} />
              <span
                className="text-base font-extrabold text-[#292929] tracking-tight"
                style={{ fontFamily: "'Plus Jakarta Sans', 'Pretendard', sans-serif" }}
              >
                menu
              </span>
            </button>

            {/* 깔끔한 접기 버튼 («) */}
            <button
              onClick={handleToggleExpand}
              className="w-8 h-8 rounded-full bg-white/70 hover:bg-white text-[#555] hover:text-[#222] border border-white/80 flex items-center justify-center transition shadow-2xs cursor-pointer active:scale-95"
              title="Collapse Sidebar"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* [접힌 상태 상단 심볼]: 클릭 시 사이드바 펼치기 */
          <button
            onClick={handleToggleExpand}
            className="w-10 h-10 mb-4 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-300 drop-shadow-[0_0_6px_rgba(180,195,210,0.5)] hover:bg-white/60 transition-all cursor-pointer group"
            title="Expand Sidebar"
          >
            <AiSparkleStarIcon className="w-6 h-6 text-slate-400 group-hover:text-slate-300 drop-shadow-[0_0_6px_rgba(180,195,210,0.5)] group-hover:scale-110 transition-all" strokeWidth={2.4} />
          </button>
        )}

        {/* ──────────────────────────────────────────
            3. 메인 네비게이션 메뉴 (영문 Contents 섹션)
           ────────────────────────────────────────── */}
        {isExpanded && (
          <div className="w-full text-[11px] font-bold text-[#8E8982] px-2 mb-2 tracking-tight uppercase">
            Contents
          </div>
        )}

        <div className={`flex flex-col w-full ${isExpanded ? "gap-1.5" : "gap-3 items-center"}`}>
          {navItems.map((item) => {
            const active = item.isTab && isTabActive(item.id);
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.isTab) {
                    setActiveTab(item.id);
                  } else if (item.onClick) {
                    item.onClick();
                  }
                }}
                title={!isExpanded ? item.label : undefined}
                className={`transition-all duration-200 cursor-pointer relative group text-left ${isExpanded
                  ? active
                    ? "w-full bg-white/85 shadow-sm border border-white/90 rounded-[20px] p-2 pr-3.5 flex items-center justify-between"
                    : "w-full hover:bg-white/50 rounded-[20px] p-2 pr-3.5 flex items-center gap-3 text-[#444444] hover:text-[#222222]"
                  : active
                    ? "w-11 h-11 rounded-full flex items-center justify-center bg-[#292929] text-[#8ECAE6] shadow-[0_4px_14px_rgba(41,41,41,0.16)] scale-105"
                    : "w-11 h-11 rounded-full flex items-center justify-center text-[#555555] hover:text-[#222222] hover:bg-white/50"
                  }`}
              >
                {/* 펼친 상태의 아이콘 + 영문 텍스트 */}
                {isExpanded ? (
                  <>
                    <div className="flex items-center gap-3 truncate">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${active
                        ? "bg-[#292929] text-[#8ECAE6] shadow-xs"
                        : "text-[#555555] group-hover:text-[#222222]"
                        }`}>
                        <Icon className="w-4.5 h-4.5" />
                      </div>
                      <span className={`text-xs md:text-sm truncate ${active ? "font-bold text-[#222222]" : "font-medium text-[#444444] group-hover:text-[#222222]"
                        }`}>
                        {item.label}
                      </span>
                    </div>

                    {active && (
                      <ChevronRight className="w-4 h-4 text-[#8E8982] flex-shrink-0 ml-1" />
                    )}
                  </>
                ) : (
                  /* 접힌 상태의 단독 아이콘 + 영문 툴팁 */
                  <>
                    <Icon
                      className={`w-4.5 h-4.5 transition-colors ${active ? "text-[#8ECAE6]" : "text-[#555555] group-hover:text-[#222222]"
                        }`}
                    />

                    {/* 접힌 상태용 호버 툴팁 */}
                    <div className="absolute left-[82px] bg-[#292929] text-white text-xs font-medium px-2.5 py-1 rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-md z-50">
                      {item.label}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* ──────────────────────────────────────────
            4. 구분선
           ────────────────────────────────────────── */}
        <div className={`h-[1px] bg-black/5 my-3.5 ${isExpanded ? "w-full px-1" : "w-8"}`} />

        {/* ──────────────────────────────────────────
            5. 설정 영역 (영문 Settings 섹션)
           ────────────────────────────────────────── */}
        {isExpanded && (
          <div className="w-full text-[11px] font-bold text-[#8E8982] px-2 mb-2 tracking-tight uppercase">
            Settings
          </div>
        )}

        <button
          onClick={onModels}
          title={!isExpanded ? "모델 설치 설정" : undefined}
          aria-label="모델 설치 설정"
          className={`transition-all duration-200 cursor-pointer relative group text-left ${isExpanded
            ? "w-full hover:bg-white/50 rounded-[20px] p-2 pr-3.5 flex items-center gap-3 text-[#444444] hover:text-[#222222]"
            : "w-11 h-11 rounded-full flex items-center justify-center text-[#555555] hover:text-[#222222] hover:bg-white/50"
            }`}
        >
          {isExpanded ? (
            <div className="flex items-center gap-3 truncate">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[#555555] group-hover:text-[#222222]">
                <Settings className="w-4.5 h-4.5" />
              </div>
              <span className="text-xs md:text-sm font-medium text-[#444444] group-hover:text-[#222222] truncate">
                Settings
              </span>
            </div>
          ) : (
            <>
              <Settings className="w-4.5 h-4.5" />
              <div className="absolute left-[82px] bg-[#292929] text-white text-xs font-medium px-2.5 py-1 rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-md z-50">
                Settings
              </div>
            </>
          )}
        </button>

        {/* ──────────────────────────────────────────
            6. 최하단 사용자 프로필 영역
           ────────────────────────────────────────── */}
        <div className="mt-auto pt-4 w-full flex flex-col items-center">
          {isExpanded ? (
            /* [펼친 상태의 프로필 카드]: 사람 이모지 + Reporter Profile + [>] 화살표 */
            <div
              className="w-full bg-white/65 hover:bg-white/85 border border-white/80 rounded-[22px] p-2.5 flex items-center justify-between transition cursor-pointer shadow-2xs group"
              title={profileName}
            >
              <div className="flex items-center gap-2.5 truncate">
                <div className="w-10 h-10 rounded-full bg-[#EFECE6] border border-[#E7E2D9] flex items-center justify-center text-lg flex-shrink-0 shadow-2xs">
                  {profileInitial}
                </div>
                <div className="truncate text-left">
                  <div className="text-xs md:text-sm font-bold text-[#222222] truncate">
                    {profileName}
                  </div>
                  <div className="text-[10px] text-[#8E8982] font-medium truncate">
                    {session?.signedIn ? "AI Newsroom" : "로컬 작업 가능"}
                  </div>
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-[#8E8982] group-hover:text-[#222] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </div>
          ) : (
            /* [접힌 상태의 프로필 원형 아바타]: 사람 이모지 */
            <div
              className="w-10 h-10 rounded-full bg-[#EFECE6] border border-[#E7E2D9] hover:border-[#F4A940] transition-colors cursor-pointer shadow-xs flex items-center justify-center text-lg group relative"
              title={profileName}
            >
              <span>{profileInitial}</span>
              <div className="absolute left-[82px] bg-[#292929] text-white text-xs font-medium px-2.5 py-1 rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-md z-50">
                Reporter Profile
              </div>
            </div>
          )}
        </div>

      </div>
    </aside>
  );
}
