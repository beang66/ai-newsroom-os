import React, { useState } from "react";
import { Bell, FileEdit, FileText } from "lucide-react";
import AutoLoginToggle from "./AutoLoginToggle";
import { signOut } from "../api/editorial";

export default function Header({
  currentArticleTitle = "",
  status = "작성 중",
  // 로컬 코어 상태 — App.jsx 가 /api/status · /api/session 결과를 넘겨준다(토큰은 오지 않고 상태만).
  coreReady = false,
  coreLabel = "",
  session = null,
  onSession = () => {},
  onLogin,
  onModels,
  saveStatus = "",
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signedIn = Boolean(session?.signedIn);
  const email = session?.email || "";
  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      onSession(await signOut());
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full pl-6 md:pl-8 pr-6 md:pr-8 pt-3.5 pb-2">
      <header className="w-full flex flex-wrap items-center justify-between z-10 relative gap-3">
        
        {/* 1. Left Brand & Workspace Badge Capsule */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="bg-white/85 backdrop-blur-md border border-black/5 rounded-full px-4 py-2 flex items-center gap-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            {/* 로고 옆 은은한 실버 breathing glow 원형 포인트 */}
            <span className="relative flex items-center justify-center w-3 h-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-slate-300/50 animate-ping" style={{ animationDuration: '3.5s' }} />
              <span className="relative inline-flex rounded-full w-2 h-2 bg-gradient-to-tr from-slate-400 to-slate-200 shadow-[0_0_8px_rgba(180,195,210,0.8)]" />
            </span>
            <h1 
              className="text-base font-extrabold text-[#292929] tracking-tight"
              style={{ fontFamily: "'Plus Jakarta Sans', 'Pretendard', sans-serif" }}
            >
              AI Newsroom
            </h1>
            <span
              className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold text-[#666666]"
              title={coreLabel || "로컬 코어 상태"}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${coreReady ? "bg-emerald-500" : "bg-amber-500"} animate-pulse`} />
              {coreLabel || "디지털 편집국"}
            </span>
          </div>
        </div>

        {/* 2. Center Active Article Capsule */}
        <div className="bg-white border border-[#E7E4DE] rounded-full px-4 py-1.5 hidden lg:flex items-center gap-2.5 shadow-[0_2px_12px_rgba(41,41,41,0.03)] max-w-xl">
          <div className="flex items-center gap-1.5 text-xs text-[#999999] flex-shrink-0">
            <FileText className="w-3.5 h-3.5 text-[#666666]" />
            <span>현재 작업:</span>
          </div>

          <span className="text-xs font-extrabold text-[#292929] truncate max-w-[220px]">
            {currentArticleTitle}
          </span>

          <div className="h-3 w-[1px] bg-[#E7E4DE] flex-shrink-0" />

          {/* 상태 배지 */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 text-xs font-bold rounded-full border ${
              status === "검증 완료" 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50/80 text-[#D97706] border-amber-200/80"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status === "검증 완료" ? "bg-emerald-500" : "bg-[#F4A940]"}`} />
              {status}
            </span>
          </div>

          <span className="text-[11px] text-[#999999] flex-shrink-0">
            {saveStatus}
          </span>
        </div>

        {/* 3. Right Notifications & User Profile Capsule */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 알림 버튼 Capsule */}
          <button 
            className="w-10 h-10 rounded-full bg-white border border-[#E7E4DE] text-[#666666] hover:text-[#292929] hover:bg-[#F8F7F4] flex items-center justify-center transition shadow-[0_2px_12px_rgba(41,41,41,0.03)] cursor-pointer relative"
            title="알림"
          >
            <Bell className="w-4 h-4" />
          </button>

          <AutoLoginToggle session={session} onSession={onSession} />

          <button onClick={onModels} className="px-4 py-1.5 bg-[#EFECE6] border border-[#DDD6CB] text-[#23211F] text-xs font-bold rounded-full cursor-pointer">모델 설치</button>

          {/* 사용자 정보 Capsule */}
          {signedIn ? (
            <div className="bg-white border border-[#E7E4DE] rounded-full px-3 py-1.5 flex items-center gap-2 shadow-[0_2px_12px_rgba(41,41,41,0.03)] cursor-pointer hover:bg-[#F8F7F4] transition">
              <div className="w-6 h-6 rounded-full bg-[#292929] text-white flex items-center justify-center text-[11px] font-bold">
                {email ? email.slice(0, 1).toUpperCase() : <FileEdit className="w-3 h-3 text-[#F4A940]" />}
              </div>
              <span className="text-xs font-extrabold text-[#292929] max-w-[160px] truncate" title={email}>{email || "로그인됨"}</span>
              <span className="text-xs text-[#999999]">편집부</span>
              <button onClick={logout} disabled={busy} data-testid="logout-button"
                className="text-xs font-bold text-[#666666] hover:text-[#23211F] cursor-pointer disabled:opacity-50">{busy ? "로그아웃 중…" : "로그아웃"}</button>
            </div>
          ) : (
            <button 
              onClick={onLogin}
              className="px-4 py-1.5 bg-[#292929] text-white text-xs font-bold rounded-full transition shadow-xs cursor-pointer hover:bg-black"
            >
              로그인
            </button>
          )}
        </div>

      </header>
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
