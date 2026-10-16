// 오늘의 데스크 달력 — "선택한 날짜" 칸 + 월 달력. 하루를 누르면 그날, 이어서 다른 날을 누르면 그 사이 기간이 선택된다.
// 날짜 값은 "YYYY-MM-DD" 글자. 화면 표시만 담당하고 일정 계산은 부모(DeskView)가 한다.
import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n) => String(n).padStart(2, "0");
const stampOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const dotted = (stamp) => { const [y, m, d] = stamp.split("-").map(Number); return `${y}.${m}.${d}`; };

/** value: { start, end, picking } (end 는 없을 수 있음, picking: 끝 날짜를 기다리는 중), today: 오늘 "YYYY-MM-DD", onChange(nextValue) */
export default function DeskCalendar({ value, today, onChange }) {
  const [ty, tm] = today.split("-").map(Number);
  const [view, setView] = useState({ y: ty, m: tm - 1 });
  const { start, end } = value;
  const last = end || start;

  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const move = (delta) => setView(({ y, m }) => {
    const next = new Date(y, m + delta, 1);
    return { y: next.getFullYear(), m: next.getMonth() };
  });
  // 첫 번째 누름: 그 하루를 고르고 끝 날짜를 기다린다(picking). 두 번째 누름: 기간 완성(같은 날이면 그 하루).
  const pick = (stamp) => {
    if (!value.picking) return onChange({ start: stamp, end: null, picking: true });
    if (stamp === start) return onChange({ start, end: null, picking: false });
    return stamp < start ? onChange({ start: stamp, end: start, picking: false }) : onChange({ start, end: stamp, picking: false });
  };

  return (
    <div className="flex h-full flex-col gap-3" data-testid="desk-calendar">
      <div className="rounded-[24px] bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.06)]">
        <p className="text-[12px] font-bold text-[#292929]">선택한 날짜</p>
        <div className="mt-2 flex items-center justify-between rounded-xl border border-[#E7E2D9] px-3 py-2.5 text-[13px] text-[#292929]">
          <span data-testid="desk-calendar-range">{start ? `${dotted(start)}${end ? ` ~ ${dotted(end)}` : ""}` : "날짜를 선택하세요"}</span>
          <CalendarDays className="h-4 w-4 text-[#756F67]" aria-hidden="true" />
        </div>
      </div>

      <div className="flex flex-1 flex-col rounded-[24px] bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[15px] font-bold text-[#101010]">
            {view.y}년 {view.m + 1}월 <ChevronDown className="h-4 w-4 text-[#8E8982]" aria-hidden="true" />
          </span>
          <div className="flex items-center rounded-full border border-[#E7E2D9]">
            <button type="button" aria-label="이전 달" onClick={() => move(-1)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#F5F2ED] cursor-pointer"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="다음 달" onClick={() => move(1)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#F5F2ED] cursor-pointer"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-center text-[11px] text-[#B0AAA2]">
          {WEEK.map((w) => <span key={w} className="py-1">{w}</span>)}
        </div>
        <div className="mt-1 grid flex-1 grid-cols-7 content-evenly gap-y-1 text-center text-[14px]">
          {cells.map((day, index) => {
            if (!day) return <span key={`blank-${index}`} />;
            const stamp = stampOf(view.y, view.m, day);
            const isEdge = stamp === start || stamp === last;
            const inBand = start && end && stamp > start && stamp < end;
            const col = index % 7;
            // 기간 띠: 시작~끝 사이 칸을 연분홍으로 잇는다(시작은 오른쪽 절반, 끝은 왼쪽 절반)
            const band = start && end && (inBand || isEdge)
              ? `${stamp === start ? (col === 6 ? "" : "bg-gradient-to-r from-transparent from-50% to-sky-200/40 to-50%") : stamp === end ? (col === 0 ? "" : "bg-gradient-to-r from-sky-200/40 from-50% to-transparent to-50%") : "bg-sky-200/40"} ${inBand && col === 0 ? "rounded-l-full" : ""} ${inBand && col === 6 ? "rounded-r-full" : ""}`
              : "";
            return (
              <div key={stamp} className={`flex justify-center ${band}`}>
                <button
                  type="button"
                  onClick={() => pick(stamp)}
                  aria-pressed={isEdge}
                  aria-label={`${view.m + 1}월 ${day}일`}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full transition cursor-pointer ${isEdge ? "border border-white/70 bg-sky-400/60 font-bold text-white shadow-[0_4px_14px_rgba(56,152,214,0.35)] backdrop-blur-md" : "text-[#292929] hover:bg-sky-100/60"}`}
                >
                  {day}
                  {stamp === today && !isEdge && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-sky-500" aria-hidden="true" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
