import React, { useState } from "react";
import { Newspaper, Bell, Clock, CheckCircle2, FileEdit } from "lucide-react";

export default function Header({ currentArticleTitle = "AI 반도체 개척자들...", status = "작성 중" }) {
  const [isLoggedIn, setIsLoggedIn] = useState(true);

  return (
    <div className="w-full px-3 md:px-6 pt-3 pb-1">
      {/* Separated Oval Floating Glass Pills Container */}
      <header className="w-full flex items-center justify-between z-10 relative gap-3 md:gap-4">
        
        {/* 1. Left Brand & Workspace Badge Oval Pill */}
        <div className="floating-light-glass-header rounded-full px-4 md:px-5 py-2.5 flex items-center gap-3 min-w-max shadow-xs border border-white/80">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Newspaper className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 
              className="text-base md:text-lg font-extrabold text-slate-900 tracking-tight"
              style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}
            >
              AI Newsroom
            </h1>
          </div>

          <div className="hidden sm:block h-3.5 w-[1px] bg-slate-200" />

          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-100/90 px-2.5 py-0.5 rounded-full border border-slate-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            디지털 편집국
          </span>
        </div>

        {/* 2. Center Active Article Status Oval Pill */}
        <div className="floating-light-glass-header rounded-full px-5 py-2 hidden lg:flex items-center gap-3 shadow-xs border border-white/80 max-w-md truncate">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <FileEdit className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span>현재 작업:</span>
          </div>

          <span className="text-xs font-bold text-slate-800 truncate max-w-[180px]">
            {currentArticleTitle}
          </span>

          <div className="h-3 w-[1px] bg-slate-200 flex-shrink-0" />

          <div className="flex items-center gap-1 flex-shrink-0">
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-extrabold rounded-full border ${
              status === "검증 완료" 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-blue-50 text-blue-700 border-blue-200"
            }`}>
              {status === "검증 완료" ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              ) : (
                <Clock className="w-3 h-3 text-blue-600" />
              )}
              {status}
            </span>
          </div>

          <span className="text-[10px] text-slate-400 font-semibold flex-shrink-0">
            방금 저장됨
          </span>
        </div>

        {/* 3. Right User & Quick Actions Oval Pill */}
        <div className="floating-light-glass-header rounded-full px-3.5 md:px-4 py-2 flex items-center gap-2.5 min-w-max shadow-xs border border-white/80">
          {/* Notification Icon */}
          <button 
            className="relative p-1.5 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
            title="알림"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-600 border-2 border-white" />
          </button>

          <div className="h-3.5 w-[1px] bg-slate-200 my-auto" />

          {isLoggedIn ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-100/90 hover:bg-slate-200/70 border border-slate-200/80 rounded-full text-xs font-bold text-slate-800 transition cursor-pointer">
                <div className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-extrabold">
                  김
                </div>
                <span className="hidden sm:inline">김동아 기자</span>
                <span className="text-[10px] font-normal text-slate-400">| 편집부</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsLoggedIn(true)}
                className="px-3 py-1 text-xs font-extrabold text-slate-700 hover:text-slate-950 transition cursor-pointer"
              >
                Login
              </button>
              <button 
                onClick={() => setIsLoggedIn(true)}
                className="px-3.5 py-1 bg-slate-900 text-white text-xs font-extrabold rounded-full shadow-xs transition cursor-pointer"
              >
                Try for free
              </button>
            </div>
          )}
        </div>

      </header>
    </div>
  );
}
