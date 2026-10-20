import React, { useState, useRef, useEffect } from "react";
import { Bell, ChevronDown, FileText } from "lucide-react";
import AutoLoginToggle from "./AutoLoginToggle";
import { openExportFolder } from "../api/editorial";
import logoUrl from "../assets/ai-newsroom-logo.png";

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
  onArchive,
  storageStatus,
  switching,
  session,
  applySession
}) {
  const [internalLoggedIn, setInternalLoggedIn] = useState(false);
  const loggedIn = isLoggedIn !== undefined ? isLoggedIn : internalLoggedIn;
  const setLoggedIn = setIsLoggedIn || setInternalLoggedIn;
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showStoragePopup, setShowStoragePopup] = useState(false);
  const storagePopupRef = useRef(null);
  // 저장이 끝날 때마다(수동 "저장됨", 자동 "임시 저장됨") 알림 캡슐이 왼쪽으로 잠깐 열리고, 팝업을 열어 보기 전까지 안 본 횟수가 쌓인다
  const [lastStatus, setLastStatus] = useState(storageStatus);
  const [alerts, setAlerts] = useState([]); // 아직 열어 보지 않은 저장 알림(최신이 앞)
  const [viewed, setViewed] = useState([]); // 방금 열어 본 알림 — 알림창 안에서 스크롤해 확인한다
  const [peek, setPeek] = useState(false);
  const [peekText, setPeekText] = useState(""); // 저장 알림이 아닌 알림(예: 내보내기)이 와서 열렸을 때 캡슐에 보여 줄 문구
  const [saveTick, setSaveTick] = useState(0);
  if (lastStatus !== storageStatus) {
    setLastStatus(storageStatus);
    if (/^(저장됨|임시 저장됨)/.test(storageStatus || "")) {
      setSaveTick((count) => count + 1);
      setPeek(true);
      setPeekText("");
      const id = saveTick + 1;
      if (!showStoragePopup) setAlerts((list) => [{ id, text: storageStatus, at: Date.now() }, ...list].slice(0, 100));
    }
  }
  // 팝업: 열면 바로 그려 위에서 부드럽게 내려오고, 닫으면 모션이 끝난 뒤에 지운다
  const [popupMounted, setPopupMounted] = useState(false);
  if (showStoragePopup && !popupMounted) setPopupMounted(true);
  useEffect(() => {
    if (showStoragePopup || !popupMounted) return undefined;
    const timer = setTimeout(() => setPopupMounted(false), 540);
    return () => clearTimeout(timer);
  }, [showStoragePopup, popupMounted]);
  useEffect(() => {
    if (!peek) return undefined;
    const timer = setTimeout(() => setPeek(false), 2600);
    return () => clearTimeout(timer);
  }, [peek, saveTick]);
  // 다른 화면이 보내는 알림(예: STT 에서 파일을 내보냈을 때)도 저장 알림처럼 벨에 쌓인다
  useEffect(() => {
    const onAlert = (event) => {
      const { text, openKind } = event.detail || {};
      if (!text) return;
      const item = { id: `${Date.now()}-${Math.random()}`, text, openKind, at: Date.now() };
      setSaveTick((count) => count + 1);
      setPeekText(text);
      setPeek(true);
      if (showStoragePopup) setViewed((list) => [item, ...list]);
      else setAlerts((list) => [item, ...list].slice(0, 100));
    };
    window.addEventListener("newsroom:alert", onAlert);
    return () => window.removeEventListener("newsroom:alert", onAlert);
  }, [showStoragePopup]);

  // 저장 내역 팝업 바깥 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (storagePopupRef.current && !storagePopupRef.current.contains(e.target)) {
        setShowStoragePopup(false);
      }
    };
    if (showStoragePopup) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showStoragePopup]);

  return (
    <div className="newsroom-header w-full pl-6 md:pl-8 pr-6 md:pr-8 pt-3.5 pb-2">
      {/* 저장 상태는 알림창 안에만 보이지만, 보조기기와 화면 시험이 읽을 수 있게 같은 문구를 화면 밖에 항상 둔다 */}
      <span className="sr-only" role="status" data-testid="storage-status">{switching ? "현재 원고를 저장하고 작업을 전환합니다…" : storageStatus}</span>
      <header className="w-full flex items-center justify-between z-10 relative gap-3">
        
        {/* 1. Left Brand */}
        <div className="flex items-center">
          <h1 className="select-none leading-none">
            <img src={logoUrl} alt="AI NEWSROOM" className="block h-[18px] w-auto" draggable={false} />
          </h1>
        </div>

        {/* 2. Center Active Article Capsule (프로필 바와 동일한 h-10 높이 및 스타일 규격) */}
        <div className="absolute left-1/2 -translate-x-1/2 h-10 bg-white/85 backdrop-blur-md border border-black/5 rounded-full px-3.5 hidden lg:flex items-center gap-2 shadow-[0_2px_12px_rgba(0,0,0,0.03)] max-w-2xl">
          <div className="w-6 h-6 rounded-full bg-[#292929] text-white flex items-center justify-center flex-shrink-0">
            <FileText className="w-3 h-3 text-slate-300" />
          </div>
          <span className="text-xs text-[#999999] flex-shrink-0 font-medium">현재 작업:</span>

          {/* 작성 중인 기사 제목: 커서 올리면 제목의 풀네임이 사이드로 표시 */}
          <div className="relative group flex items-center">
            <span className="text-xs font-extrabold text-[#292929] truncate max-w-[240px] cursor-pointer hover:text-blue-600 transition-colors">
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

        </div>

        {/* 3. Right Notifications & Login/User Profile Capsule */}
        <div className="flex items-center gap-2.5">
          {/* 알림 버튼 Capsule (저장 상태 및 계정 설정 기능) */}
          <div className="relative h-10 w-10" ref={storagePopupRef}>
            <button 
              type="button"
              onClick={() => {
                if (!showStoragePopup) {
                  setViewed(alerts); // 열어 보면 확인한 것으로 본다
                  setAlerts([]);
                }
                setShowStoragePopup((prev) => !prev);
              }}
              className={`group/btn absolute right-0 top-0 h-10 min-w-[40px] rounded-full bg-white/85 backdrop-blur-md border border-black/5 text-[#666666] hover:text-[#292929] hover:bg-white flex flex-row-reverse items-center overflow-hidden transition-all duration-300 ease-out shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-lg cursor-pointer active:scale-95 ${peek || showStoragePopup ? "w-[300px] z-30" : "w-10 hover:w-[300px] z-10 hover:z-30"}`}
              title="저장 내역 및 알림"
              aria-expanded={showStoragePopup}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                <Bell className="w-4 h-4" />
              </span>
              <span className={`min-w-0 flex-1 overflow-hidden whitespace-nowrap pl-4 text-left text-xs font-bold text-[#292929] transition-all duration-300 truncate ${peek || showStoragePopup ? "max-w-[260px] opacity-100" : "max-w-0 opacity-0 group-hover/btn:max-w-[260px] group-hover/btn:opacity-100"}`}>
                {switching ? "현재 원고를 저장하고 작업을 전환합니다…" : (peek && peekText ? peekText : (storageStatus || "정상 저장됨"))}
              </span>
              {alerts.length > 0 ? (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm" aria-label={`확인하지 않은 저장 ${alerts.length}건`}>
                  {alerts.length > 99 ? "99+" : alerts.length}
                </span>
              ) : (
                <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_4px_rgba(16,185,129,0.5)]" />
              )}
            </button>

            {/* 클릭 시 노출되는 저장 내역 팝업 카드 (가로형 와이드 알림 카드) */}
            {popupMounted && (
              <div className="absolute right-0 top-0 z-20 drop-shadow-[0_14px_22px_rgba(15,23,42,0.14)]">
              <div className={`w-[300px] p-3.5 pt-[52px] bg-gradient-to-b from-white via-white/95 to-sky-50 backdrop-blur-md rounded-[28px] border border-slate-200/70 transition-[clip-path] duration-[520ms] ease-[cubic-bezier(0.4,0,0.2,1)] starting:[clip-path:inset(0_0_calc(100%_-_40px)_0_round_20px)] ${showStoragePopup ? "[clip-path:inset(0_round_28px)]" : "pointer-events-none [clip-path:inset(0_0_calc(100%_-_40px)_0_round_20px)]"}`}>
              <div className={`flex flex-col gap-2.5 transition-opacity duration-300 starting:opacity-0 ${showStoragePopup ? "opacity-100 delay-200" : "opacity-0"}`}>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowStoragePopup(false)}
                    className="text-slate-400 hover:text-slate-700 text-xs p-1 rounded-md cursor-pointer transition-colors"
                    title="닫기"
                  >
                    ✕
                  </button>
                </div>
                {viewed.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto divide-y divide-slate-100 pr-1" aria-label="확인하지 않았던 저장 알림">
                    {viewed.map((item) => (
                      <li key={item.id} className="flex items-start justify-between gap-3 py-1.5 text-[11px] text-slate-600">
                        <span className="min-w-0 break-all" title={item.text}>
                          {item.text}
                          {item.openKind && (
                            <>
                              {" "}
                              <button type="button" data-testid="alert-open-folder" className="underline font-bold cursor-pointer" onClick={() => openExportFolder(item.openKind).catch(() => {})}>폴더 열기</button>
                            </>
                          )}
                        </span>
                        <span className="shrink-0 pt-0.5 font-mono text-[10px] text-slate-400">{new Date(item.at).toLocaleTimeString("en-GB")}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {/* 가로로 늘어나는 수평 배치 영역: 저장 상태 메시지 + 자동 로그인 토글 */}
                <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <div className="text-[11px] text-slate-600 leading-relaxed font-mono flex-1 truncate" role="status" title={switching ? "현재 원고를 저장하고 작업을 전환합니다…" : (storageStatus || "정상 저장됨")}>
                    {switching ? "현재 원고를 저장하고 작업을 전환합니다…" : (storageStatus || "정상 저장됨")}
                  </div>
                  <div className="shrink-0 flex items-center">
                    <AutoLoginToggle session={session} onSession={applySession} />
                  </div>
                </div>
              </div>
              </div>
              </div>
            )}
          </div>

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
                <span className="text-xs font-extrabold text-[#292929]">{reporterName}</span>
                <span className="text-xs text-[#999999]">{department}</span>
                <ChevronDown className="w-3 h-3 text-[#999999]" />
              </button>

              {/* 클릭 시 드롭다운 (로그아웃) */}
              {showUserDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-xs font-extrabold text-slate-900">{reporterName}</p>
                    <p className="text-[11px] text-slate-500">{department}</p>
                  </div>
                  <button
                    type="button"
                    data-testid="logout-button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      if (onLogout) onLogout();
                      else setLoggedIn(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer mt-1"
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
