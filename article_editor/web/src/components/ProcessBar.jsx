import React from "react";
import { PenTool, Send, Sparkles, FileCheck2 } from "lucide-react";

/**
 * 인덱스 바인더 탭(Binder Tab) 네비게이션 컴포넌트
 * - 메인 박스와 바닥 가로선 없이 시원하게 하나로 뚫려 결합되는 파일 탭
 */
export default function ProcessBar({ activeTab, setActiveTab }) {
  const steps = [
    { id: "writer", label: "작성·검토", icon: PenTool },
    { id: "convert", label: "플랫폼 변환", icon: Sparkles },
    { id: "archive", label: "보관함", icon: FileCheck2 },
  ];

  // 활성 탭 식별 (writer 관련 하위 단계 포함)
  const isStepActive = (tabId) => {
    if (tabId === "writer") {
      return ["writer", "factcheck", "search", "interview"].includes(activeTab);
    }
    return activeTab === tabId;
  };

  return (
    <div className="w-full flex items-end justify-start gap-2 md:gap-3 px-4 md:px-8 select-none relative z-30">
      {steps.map((step) => {
        const active = isStepActive(step.id);
        const Icon = step.icon;

        return (
          <button
            key={step.id}
            onClick={() => setActiveTab(step.id)}
            className={`transition-all duration-200 cursor-pointer select-none flex items-center justify-center gap-2.5 h-10 md:h-11 rounded-t-2xl px-5 md:px-6 relative ${active
              ? "binder-tab-active text-slate-950 font-black text-sm md:text-base shadow-xs"
              : "binder-tab-inactive text-slate-600 hover:text-slate-950 font-extrabold text-sm md:text-base"
              }`}
            title={step.label}
          >
            {/* 좌측 하단 메인 박스 연결 오목 곡선 */}
            {active && (
              <div className="absolute -bottom-[3px] -left-3 w-3 h-3 pointer-events-none z-40">
                <svg viewBox="0 0 12 12" fill="none" className="w-full h-full">
                  <path d="M 0 12 A 12 12 0 0 0 12 0 V 12 H 0 Z" fill="#ffffff" />
                  <path d="M 0 12 A 12 12 0 0 0 12 0" stroke="rgba(226, 232, 240, 0.95)" strokeWidth="1" fill="none" />
                </svg>
              </div>
            )}

            {/* 바닥 메인 박스 가로 경계선 완전 삭제 화이트 패치 */}
            {active && (
              <div className="absolute -bottom-[3px] left-0 right-0 h-[5px] bg-white z-40 pointer-events-none" />
            )}

            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${active ? "bg-slate-900 text-white" : "text-slate-500"
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>
            <span>{step.label}</span>

            {/* 우측 하단 메인 박스 연결 오목 곡선 */}
            {active && (
              <div className="absolute -bottom-[3px] -right-3 w-3 h-3 pointer-events-none z-40">
                <svg viewBox="0 0 12 12" fill="none" className="w-full h-full">
                  <path d="M 0 0 A 12 12 0 0 0 12 12 H 0 V 0 Z" fill="#ffffff" />
                  <path d="M 0 0 A 12 12 0 0 0 12 12" stroke="rgba(226, 232, 240, 0.95)" strokeWidth="1" fill="none" />
                </svg>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}