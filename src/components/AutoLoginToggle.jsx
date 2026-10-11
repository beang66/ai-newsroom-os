import React, { useState } from "react";
import { setAutoLogin } from "../api/core";

/** 공용 테스트 계정 자동 로그인 토글 — 코어가 쓸 수 있다고 알려줄 때만(개발 실행 + .env 에 계정) 보인다.
 *  계정·비밀번호·토큰은 코어에만 있고 여기에는 상태만 온다. */
export default function AutoLoginToggle({ session, onSession }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const auto = session?.autoLogin;
  if (!auto?.available) return null;

  const toggle = async () => {
    setBusy(true);
    setError("");
    try {
      onSession(await setAutoLogin(!auto.enabled));
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const problem = error || auto.error;
  return (
    <button
      onClick={toggle}
      disabled={busy}
      data-testid="auto-login-toggle"
      title={problem ? `자동 로그인 실패: ${problem}` : `공용 테스트 계정(${auto.email}) 자동 로그인 — 개발 실행 전용`}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer disabled:opacity-50 ${
        problem ? "border-rose-300 text-rose-700" : auto.enabled ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-slate-300 text-slate-500"
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${problem ? "bg-rose-500" : auto.enabled ? "bg-emerald-500" : "bg-slate-300"}`} />
      테스트 계정 자동 로그인 {auto.enabled ? "켜짐" : "꺼짐"}
    </button>
  );
}
