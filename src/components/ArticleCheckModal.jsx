import React from "react";
import { Check, MoreHorizontal } from "lucide-react";

// 검증 항목은 main 의 팩트체크 판정 기준(서랍 배지와 같은 이름·색)으로 나눈다.
//  팩트 일치(SUPPORTED, 초록) · 자료와 불일치(CONFLICT, 빨강) · 근거 부족(EVIDENCE_GAP, 노랑) · 검토 필요(REVIEW·EXTERNAL_REQUIRED·UNAVAILABLE, 보라)
// 항목의 버튼을 누르면 FACT_CATEGORY_EVENT 가 발생하고, 기사 작성 화면이 그 분류의 문장만 모아 보여 준다.
export const FACT_CATEGORY_EVENT = "factcheck-category";

const CATEGORIES = [
  { key: "SUPPORTED", title: "팩트 일치", tone: "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100", count: (c) => c.SUPPORTED || 0 },
  { key: "CONFLICT", title: "자료와 불일치", tone: "text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100", count: (c) => c.CONFLICT || 0 },
  { key: "EVIDENCE_GAP", title: "근거 부족", tone: "text-amber-800 bg-amber-50 border-amber-200 hover:bg-amber-100", count: (c) => c.EVIDENCE_GAP || 0 },
  { key: "REVIEW", title: "검토 필요", tone: "text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100", count: (c) => (c.REVIEW || 0) + (c.EXTERNAL_REQUIRED || 0) + (c.UNAVAILABLE || 0) },
];

/**
 * 항목 상태를 계산한다. state: ok(통과) | warn(확인 필요) | idle(아직 확인할 수 없음)
 * 팩트체크 실행 결과(summary)가 있을 때만 분류별 문장 수를 센다.
 */
// eslint-disable-next-line no-unused-vars
export function buildChecks(article, summary) {
  const counts = summary?.counts || {};
  return CATEGORIES.map((category) => {
    const count = category.count(counts);
    if (!summary) return { key: category.key, title: category.title, state: "idle", text: "전체 검증을 실행하면 확인됩니다." };
    if (count === 0) return { key: category.key, title: category.title, state: category.key === "SUPPORTED" ? "idle" : "ok", text: "해당하는 문장이 없습니다." };
    return {
      key: category.key,
      title: category.title,
      state: category.key === "SUPPORTED" ? "ok" : "warn",
      text: (
        <button
          type="button"
          data-testid={`check-category-${category.key}`}
          onClick={() => window.dispatchEvent(new CustomEvent(FACT_CATEGORY_EVENT, { detail: category.key }))}
          title="이 분류의 문장만 모아 봅니다"
          className={`px-2 py-0.5 rounded-full border text-[11px] font-bold cursor-pointer transition ${category.tone}`}
        >
          {count}문장 · 모아보기
        </button>
      ),
    };
  });
}

/** 일치로 판정된 문장의 비율(%). 검증 전이면 null. */
export function verifiedPercent(summary) {
  if (!summary || !summary.total) return null;
  return Math.round(((summary.counts?.SUPPORTED || 0) / summary.total) * 100);
}

const STATE_STYLE = {
  ok: "bg-[#dcfce7] text-[#16a34a]",
  warn: "bg-[#fef9c3] text-[#ca8a04]",
  idle: "bg-stone-100 text-stone-400",
};

/**
 * 기사 검증률 (ARTICLE CHECK) 사전 팝업 모달
 * - 팩트체크 실행 결과와 기사 구조에서 계산한 검증률·항목 상태를 요약 표시
 * - [전체 검증 실행 →] 클릭 시 기존 FactCheckDrawer 사이드박스 오픈
 */
export default function ArticleCheckModal({ isOpen, onClose, onStartCheck, isSideBySide = false, article, summary }) {
  if (!isOpen) return null;

  const checks = buildChecks(article, summary);
  const percentage = verifiedPercent(summary);
  const warnCount = checks.filter((check) => check.state === "warn").length;

  // 원형 프로그레스
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ((percentage ?? 0) / 100) * circumference;

  const headline = percentage === null ? "검증 전입니다" : warnCount > 0 ? "검토가 필요합니다" : "확인할 항목이 없습니다";
  const subline = percentage === null
    ? "전체 검증을 실행해 주세요."
    : warnCount > 0 ? `${warnCount}개의 항목을 확인해주세요.` : "모든 항목이 통과했습니다.";

  const contentCard = (
    <div
      className={`w-full ${
        isSideBySide
          ? "w-[330px] lg:w-[340px] xl:w-[350px] flex-shrink-0 h-[calc(100vh-100px)] min-h-[760px] max-h-[920px] sticky top-4 rounded-3xl overflow-y-auto no-scrollbar border border-slate-200/90 shadow-xs"
          : "max-w-[340px] sm:max-w-[360px] rounded-[36px] shadow-[0_24px_50px_-12px_rgba(0,0,0,0.18)] border border-stone-100/80"
      } bg-white p-6 sm:p-7 flex flex-col justify-between animate-in zoom-in-95 duration-200 select-none`}
      onClick={(e) => e.stopPropagation()}
    >
      <div>
        {/* 1. 상단 소제목 & 더보기/닫기 */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase">
            ARTICLE CHECK
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 transition cursor-pointer p-0.5 -mr-1 rounded-full hover:bg-stone-100"
            title="닫기"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>

        {/* 2. 메인 타이틀 */}
        <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight mb-5">
          기사 검증률
        </h2>

        {/* 3. 원형 도넛 게이지 & 안내 문구 */}
        <div className="flex items-center gap-4.5 mb-5 pb-2">
          {/* 라임/연두색 원형 도넛 차트 */}
          <div className="relative w-22 h-22 flex-shrink-0 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
              {/* 배경 링 */}
              <circle
                cx="48"
                cy="48"
                r={radius}
                className="stroke-stone-100"
                strokeWidth="7"
                fill="transparent"
              />
              {/* 진행 링 (형광 연두/라임색) — 검증 전에는 그리지 않는다 */}
              {percentage !== null && (
                <circle
                  cx="48"
                  cy="48"
                  r={radius}
                  stroke="#A3E635"
                  strokeWidth="7"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              )}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-black text-stone-900 tracking-tight">
              {percentage === null ? (
                <span className="text-2xl font-black leading-none text-stone-300">—</span>
              ) : (
                <>
                  <span className="text-2xl font-black leading-none" data-testid="check-percent">{percentage}</span>
                  <span className="text-xs font-bold self-start mt-4 ml-0.5">%</span>
                </>
              )}
            </div>
          </div>

          {/* 우측 설명 */}
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-stone-900 tracking-tight">
              {headline}
            </h3>
            <p className="text-xs text-stone-400 font-medium">
              {subline}
            </p>
            {percentage !== null && (
              <p className="text-[10px] text-stone-400">근거와 일치한 문장 비율 ({summary.total}문장 기준)</p>
            )}
          </div>
        </div>

        {/* 4. 4대 체크리스트 항목 */}
        <div className="divide-y divide-stone-100/90 border-t border-stone-100/90 mb-6">
          {checks.map((check) => (
            <div key={check.key} className="flex items-start gap-3 py-3" data-testid={`check-${check.key}`} data-state={check.state}>
              <div className={`w-5.5 h-5.5 rounded-full ${STATE_STYLE[check.state]} flex items-center justify-center shrink-0 mt-0.5 shadow-2xs leading-none font-bold text-xs`}>
                {check.state === "ok" ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : check.state === "warn" ? "!" : "–"}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-stone-900 tracking-tight">
                  {check.title}
                </h4>
                <p className="text-[11px] text-stone-400 mt-0.5 font-normal">
                  {check.text}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* 5. 하단 액션 버튼: 전체 검증 실행 → */}
        <button
          type="button"
          onClick={() => {
            if (onStartCheck) onStartCheck();
          }}
          className="w-full py-3.5 rounded-2xl bg-stone-950 hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-98 shadow-sm cursor-pointer mt-4"
        >
          <span>전체 검증 실행</span>
          <span className="text-sm font-light">→</span>
        </button>
      </div>
    </div>
  );

  if (isSideBySide) {
    return contentCard;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/40 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      {contentCard}
    </div>
  );
}
