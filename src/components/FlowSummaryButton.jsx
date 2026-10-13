// 본문 라벨 옆 '흐름 요약' 버튼 + 결과 창 — main 의 EditorialAssist.FlowSummaryButton 을 독립 파일로 옮긴 것.
// 코어(/api/assist, kind=flow)가 문단별 역할·핵심을 한 문장씩 요약한다.
import React, { useState } from "react";
import { ListOrdered } from "lucide-react";
import { flowSummary } from "../api/editorial";

const MIN_BODY = 20; // 코어 assist 하한(본문 20자)

/** 비동기 호출 상태 묶음 */
function useTask() {
  const idle = { busy: false, error: "", data: null };
  const [state, setState] = useState(idle);
  const run = async (fn) => {
    setState({ busy: true, error: "", data: null });
    try {
      const data = await fn();
      setState({ busy: false, error: "", data });
      return data;
    } catch (e) {
      setState({ busy: false, error: e?.message || String(e), data: null });
      return null;
    }
  };
  return [state, run, () => setState(idle)];
}

export default function FlowSummaryButton({ body }) {
  const [open, setOpen] = useState(false);
  const [state, run] = useTask();
  const refresh = () =>
    run(() => (body.trim().length < MIN_BODY ? Promise.reject(Error("본문을 20자 이상 작성하면 요약할 수 있어요.")) : flowSummary(body)));
  return (
    <>
      <button
        type="button"
        data-testid="flow-summary-open"
        onClick={() => {
          setOpen(true);
          refresh();
        }}
        className="text-[11px] px-2.5 py-0.5 bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] font-bold rounded-full border border-[#DDD6CB] cursor-pointer flex items-center gap-1"
      >
        <ListOrdered className="w-3 h-3" /> 흐름 요약
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-3 shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="flow-summary">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">기사 흐름 요약</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer">
                ×
              </button>
            </div>
            {state.busy && <div className="text-xs text-slate-500">요약을 준비 중입니다…</div>}
            {state.error && <div className="text-xs text-rose-600">{state.error}</div>}
            {state.data && (
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-slate-800">
                {state.data.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ol>
            )}
            <div className="flex justify-end">
              <button onClick={refresh} disabled={state.busy} className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60">
                새로고침
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
