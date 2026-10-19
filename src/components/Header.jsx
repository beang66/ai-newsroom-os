import React, { useState, useRef, useEffect } from "react";
import { Bell, FileEdit, ChevronDown, FileText } from "lucide-react";

export default function Header({ 
  currentArticleTitle = "AI 반도체 개척자들... 초거대 AI 시대의 차세대 주도권 경쟁", 
  status: _status = "작성 중",
  reporterName = "김동아 기자",
  department = "디지털편집국",
  onOpenAuth,
  isLoggedIn,
  setIsLoggedIn,
  onLogout,
  onSave,
  onArchive
}) {
  const [internalLoggedIn, setInternalLoggedIn] = useState(false);
  const loggedIn = isLoggedIn !== undefined ? isLoggedIn : internalLoggedIn;
  const setLoggedIn = setIsLoggedIn || setInternalLoggedIn;
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState(null);

  // 보관/저장 물방울 무빙 인디케이터 상태 및 ref
  const [activeBubble, setActiveBubble] = useState("save");
  const [bubblePos, setBubblePos] = useState({ left: 0, width: 0, isReady: false });
  const bubbleContainerRef = useRef(null);
  const bubbleBtnRefs = useRef({});

  const updateBubblePosition = (key) => {
    const btn = bubbleBtnRefs.current[key];
    const container = bubbleContainerRef.current;
    if (btn && container) {
      const containerRect = container.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      setBubblePos({
        left: btnRect.left - containerRect.left,
        width: btnRect.width,
        isReady: true,
      });
    }
  };

  useEffect(() => {
    updateBubblePosition(activeBubble);
    const timer = setTimeout(() => updateBubblePosition(activeBubble), 50);
    return () => clearTimeout(timer);
  }, [activeBubble]);

  const handleSave = async () => {
    const saved = await onSave?.();
    if (saved === false) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    setLastSavedTime(timeStr);
  };

  const handleArchive = async () => {
    // 저장 결과를 기다려, 실패했을 때는 보관되었다고 알리지 않는다(화면 하단 상태줄에 사유가 표시됨).
    const archived = await onArchive?.();
    if (archived !== false) alert("기사가 보관되었습니다.");
  };

  return (
    <div className="newsroom-header w-full pl-6 md:pl-8 pr-6 md:pr-8 pt-3.5 pb-2">
      <header className="w-full flex items-center justify-between z-10 relative gap-3">
        
        {/* 1. Left Brand */}
        <div className="flex items-center gap-2.5">
          <div className="bg-white/85 backdrop-blur-md border border-black/5 rounded-full px-4 py-2 flex items-center gap-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            <h1 
              className="text-base font-extrabold text-[#292929] tracking-tight"
              style={{ fontFamily: "'Plus Jakarta Sans', 'Pretendard', sans-serif" }}
            >
              AI Newsroom
            </h1>
          </div>
        </div>

        {/* 2. Center Active Article Capsule */}
        <div className="absolute left-1/2 -translate-x-1/2 bg-white/85 backdrop-blur-md border border-black/5 rounded-full px-4 py-1.5 hidden lg:flex items-center gap-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] max-w-2xl">
          <div className="flex items-center gap-1.5 text-xs text-[#999999] flex-shrink-0">
            <FileText className="w-3.5 h-3.5 text-[#666666]" />
            <span>현재 작업:</span>
          </div>

          {/* 작성 중인 기사 제목: 커서 올리면 제목의 풀네임이 사이드로 표시 */}
          <div className="relative group flex items-center">
            <span className="text-xs font-extrabold text-[#292929] truncate max-w-[200px] cursor-pointer hover:text-blue-600 transition-colors">
              {currentArticleTitle}
            </span>
            {/* 사이드로 뜨는 제목 풀네임 툴팁 말풍선 */}
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden group-hover:flex items-center z-50 pointer-events-none">
              <div className="bg-white/95 backdrop-blur-md text-slate-900 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-xl whitespace-nowrap border border-slate-200/90 flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150">
                <span className="text-slate-500 font-bold">[전체 제목]</span>
                <span>{currentArticleTitle}</span>
              </div>
            </div>
          </div>

          <div className="h-3 w-[1px] bg-[#E7E4DE] flex-shrink-0" />

          {/* 부드러운 물방울 모양의 보관, 저장 버튼 그룹 */}
          <div
            ref={bubbleContainerRef}
            className="relative flex items-center gap-1 px-1.5 py-0.5 rounded-full select-none bg-slate-100/90 border border-slate-200/80 shadow-2xs"
          >
            {/* 버튼 클릭 시 물방울처럼 부드럽게 이동하는 인디케이터 */}
            {bubblePos.isReady && (
              <span
                className="absolute h-[26px] rounded-full pointer-events-none transition-all duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-0"
                style={{
                  left: `${bubblePos.left}px`,
                  width: `${bubblePos.width}px`,
                  backgroundColor: "#292929",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.16), inset 0 1px 1.5px rgba(255, 255, 255, 0.2)",
                }}
              />
            )}

            <button
              ref={(el) => (bubbleBtnRefs.current["archive"] = el)}
              type="button"
              onClick={() => {
                setActiveBubble("archive");
                handleArchive();
              }}
              className={`relative z-10 px-3 py-1 text-xs tracking-tight transition-colors duration-200 cursor-pointer whitespace-nowrap rounded-full flex items-center justify-center active:scale-95 ${
                activeBubble === "archive"
                  ? "text-white font-bold"
                  : "text-slate-600 hover:text-slate-900 font-medium"
              }`}
              title="기사 보관"
            >
              보관
            </button>

            <span className="text-slate-300 select-none text-[10px] font-light z-0">ㅣ</span>

            <button
              ref={(el) => (bubbleBtnRefs.current["save"] = el)}
              type="button"
              onClick={() => {
                setActiveBubble("save");
                handleSave();
              }}
              className={`relative z-10 px-3 py-1 text-xs tracking-tight transition-colors duration-200 cursor-pointer whitespace-nowrap rounded-full flex items-center justify-center active:scale-95 ${
                activeBubble === "save"
                  ? "text-white font-bold"
                  : "text-slate-600 hover:text-slate-900 font-medium"
              }`}
              title="기사 저장"
            >
              저장
            </button>
          </div>

          {/* 저장 누르면 중앙 상단 옆에 마지막으로 저장한 시간 표시 */}
          <span className="text-[11px] text-[#777777] flex-shrink-0 font-medium">
            {lastSavedTime ? `마지막 저장: ${lastSavedTime}` : "마지막 저장 시간 없음"}
          </span>
        </div>

        {/* 3. Right Notifications & Login/User Profile Capsule */}
        <div className="flex items-center gap-2.5">
          {/* 알림 버튼 Capsule */}
          <button 
            className="w-10 h-10 rounded-full bg-white/85 backdrop-blur-md border border-black/5 text-[#666666] hover:text-[#292929] hover:bg-white flex items-center justify-center transition shadow-[0_2px_12px_rgba(0,0,0,0.03)] cursor-pointer relative"
            title="알림"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-slate-400 shadow-[0_0_4px_rgba(180,195,210,0.6)]" />
          </button>

          {/* 로그인하기, 회원가입하기 버튼 (처음 화면: 우측 상단) 
              누르면 '김동아 기자' 버튼으로 생성 및 전환됨 */}
          {!loggedIn ? (
            <div className="flex items-center gap-1.5 bg-white/85 backdrop-blur-md border border-black/5 rounded-full p-1 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
              <button
                type="button"
                onClick={() => onOpenAuth?.("login")}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:text-black hover:bg-slate-100/80 rounded-full transition cursor-pointer active:scale-95"
              >
                로그인하기
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth?.("signup")}
                className="px-3.5 py-1.5 text-xs font-bold bg-[#292929] hover:bg-black text-white rounded-full transition shadow-xs cursor-pointer active:scale-95"
              >
                회원가입하기
              </button>
            </div>
          ) : (
            /* 로그인 완료 후 생성되는 '김동아 기자' 버튼 */
            <div className="relative">
              <button 
                type="button"
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="bg-white/85 backdrop-blur-md border border-black/5 rounded-full px-3.5 py-1.5 flex items-center gap-2 shadow-[0_2px_12px_rgba(0,0,0,0.03)] cursor-pointer hover:bg-white transition active:scale-95 animate-in fade-in zoom-in-95 duration-200"
                title="기자 정보"
              >
                <div className="w-6 h-6 rounded-full bg-[#292929] text-white flex items-center justify-center text-[11px] font-bold">
                  <FileEdit className="w-3 h-3 text-slate-300" />
                </div>
                <span className="text-xs font-extrabold text-[#292929]">{reporterName}</span>
                <span className="text-xs text-[#999999]">{department}</span>
                <ChevronDown className="w-3 h-3 text-[#999999]" />
              </button>

              {/* 클릭 시 드롭다운 (로그인 화면 열기 / 로그아웃) */}
              {showUserDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-xs font-extrabold text-slate-900">{reporterName}</p>
                    <p className="text-[11px] text-slate-500">{department}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      onOpenAuth?.("login");
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-xl transition cursor-pointer mt-1"
                  >
                    로그인 화면 열기
                  </button>
                  <button
                    type="button"
                    data-testid="logout-button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      if (onLogout) onLogout();
                      else setLoggedIn(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                  >
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </header>
    </div>
  );
}
