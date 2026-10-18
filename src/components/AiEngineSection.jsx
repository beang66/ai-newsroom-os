import React, { useEffect, useState } from "react";
import { getSettings, saveSettings } from "../api/editorial";

// 환경 설정 > AI 엔진: 꺼짐(기본) = OpenAI, 켜짐 = 이 PC 의 로컬 모델(팩트체크 판정·제목/부제 초안·흐름 요약 초안).
export default function AiEngineSection() {
  const [localAi, setLocalAi] = useState(null); // null = 불러오는 중
  const [error, setError] = useState("");

  useEffect(() => {
    const request = new AbortController();
    getSettings(request.signal).then((s) => setLocalAi(Boolean(s.localAi))).catch((e) => {
      if (!request.signal.aborted) setError(e?.message || String(e));
    });
    return () => request.abort();
  }, []);

  const change = async (next) => {
    setError("");
    setLocalAi(next); // 바로 반영하고, 저장에 실패하면 되돌린다
    try { setLocalAi(Boolean((await saveSettings({ localAi: next })).localAi)); }
    catch (e) { setLocalAi(!next); setError(e?.message || String(e)); }
  };

  return (
    <section aria-labelledby="ai-engine-title" className="rounded-[28px] p-6 md:p-8 bg-white/80 backdrop-blur-xl border border-stone-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-3">
      <h2 id="ai-engine-title" className="text-lg font-black text-stone-950 tracking-tight">AI 엔진</h2>
      <label className="flex items-center gap-3 text-sm font-bold cursor-pointer w-fit">
        <input type="checkbox" role="switch" data-testid="settings-local-ai" checked={Boolean(localAi)} disabled={localAi === null}
          onChange={(event) => change(event.target.checked)} className="h-5 w-5 accent-stone-900" />
        로컬 AI 사용
        <span data-testid="settings-ai-engine" className="text-xs font-medium text-stone-500">
          (지금: {localAi === null ? "확인 중" : localAi ? "로컬 AI" : "OpenAI"})
        </span>
      </label>
      <p className="text-xs text-stone-500 leading-relaxed">
        꺼짐(기본): 팩트체크 판정, 제목·부제 추천, 기사 흐름 요약을 OpenAI가 합니다. 로그인과 인터넷 연결이 필요하고, 원고·근거 일부가 외부 서비스로 전송됩니다.
        켜짐: 이 PC에 설치한 로컬 모델이 판정과 초안을 만들어 토큰을 아낍니다. 위의 로컬 AI 모델 설치에서 모델을 먼저 설치해야 합니다.
      </p>
      {error && <p role="alert" data-testid="settings-ai-error" className="text-xs text-rose-700">{error}</p>}
    </section>
  );
}
