import React from "react";

// 팩트체크 판정 표시의 색·아이콘을 한곳에 둔다(본문 말풍선·순서형 검사·패널 카드·검증 창이 같이 쓴다).
// 색은 기자가 해야 할 일에 따라 3벌 + 무채색 하나:
//   고칠 것(주홍) = 자료와 불일치 · 확인할 것(황토) = 근거 부족·검토 필요 · 끝난 것(파랑) = 팩트 일치 · 판정 아님(회색) = AI 재판정 등
// 판정마다 아이콘 모양도 달라(✕ ! ? ✓) 색만으로 구분하지 않아도 된다. 본문 형광·밑줄은 lib/factHighlights.css.
export const FACT_TONE = {
  SUPPORTED: { label: "팩트 일치", icon: "check", solid: "#1f6fb2", ink: "#134a78", badge: "bg-[#ebf3fb] text-[#134a78] border-[#bcd6ee]", panel: "border-[#bcd6ee] bg-[#ebf3fb]/70 text-[#134a78]", category: "text-[#134a78] bg-[#ebf3fb] border-[#bcd6ee] hover:bg-[#dcebf8]" },
  CONFLICT: { label: "자료와 불일치", icon: "x", solid: "#c9440e", ink: "#8a2c08", badge: "bg-[#fdeee6] text-[#8a2c08] border-[#f4c3a8]", panel: "border-[#f4c3a8] bg-[#fdeee6]/70 text-[#8a2c08]", category: "text-[#8a2c08] bg-[#fdeee6] border-[#f4c3a8] hover:bg-[#fbe0d1]" },
  EVIDENCE_GAP: { label: "근거 부족", icon: "bang", solid: "#c58a00", ink: "#6e4a00", badge: "bg-[#fff7df] text-[#6e4a00] border-[#f0d68a]", panel: "border-[#f0d68a] bg-[#fff7df]/70 text-[#6e4a00]", category: "text-[#6e4a00] bg-[#fff7df] border-[#f0d68a] hover:bg-[#ffefc2]" },
  REVIEW: { label: "검토 필요", icon: "q", solid: "#c58a00", ink: "#6e4a00", badge: "bg-[#fff7df] text-[#6e4a00] border-[#f0d68a]", panel: "border-[#f0d68a] bg-[#fff7df]/70 text-[#6e4a00]", category: "text-[#6e4a00] bg-[#fff7df] border-[#f0d68a] hover:bg-[#ffefc2]" },
};
/** 판정 판정값(EXTERNAL_REQUIRED·UNAVAILABLE 포함)에 맞는 표시. 모르는 값은 검토 필요 */
export const toneOf = (verdict) => FACT_TONE[verdict] || FACT_TONE.REVIEW;
/** 판정이 아닌 표시(AI 재판정·AI 제안 등)의 무채색 칩 */
export const NEUTRAL_CHIP = "bg-[#f8fafc] text-[#334155] border-[#cbd5e1]";

const PATHS = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M7 7l10 10M17 7L7 17" />,
  bang: <><path d="M12 5v9" /><circle cx="12" cy="19" r="1.2" fill="currentColor" /></>,
  q: <><path d="M8.5 9a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.2-1.5 2.3v.5" /><circle cx="12" cy="19.3" r="1.2" fill="currentColor" /></>,
};

/** 판정 아이콘(✓ ✕ ! ?) */
export function FactIcon({ verdict, className = "w-3 h-3" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[toneOf(verdict).icon]}
    </svg>
  );
}

/** 판정 배지: 아이콘 + 이름 */
export function VerdictBadge({ verdict, className = "" }) {
  const tone = toneOf(verdict);
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${tone.badge} ${className}`}>
      <FactIcon verdict={verdict} />
      {tone.label}
    </span>
  );
}
