import React, { useState } from "react";
import { signIn, signUp } from "../api/editorial";
import AppDialog from "./AppDialog";

export default function LoginDialog({ onClose, onSession }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [mode, setMode] = useState("login"); // login | signup
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const signup = mode === "signup";

  const switchMode = () => { setMode(signup ? "login" : "signup"); setError(""); setNotice(""); setPassword(""); setConfirm(""); };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    if (signup && password !== confirm) { setError("비밀번호 확인이 일치하지 않아요."); return; }
    setBusy(true);
    const request = signup ? signUp(email.trim(), password) : signIn(email.trim(), password);
    setPassword("");
    setConfirm("");
    try {
      const session = await request;
      if (signup && session.needsConfirmation) {
        // 이메일 확인이 켜져 있으면 확인 메일의 링크를 누른 뒤 로그인한다
        setNotice("가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.");
        setMode("login");
        return;
      }
      if (!session.signedIn) throw Error("로그인 상태를 확인하지 못했어요. 다시 시도해 주세요.");
      onSession(session);
      onClose();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setPassword("");
      setConfirm("");
      setBusy(false);
    }
  };

  return (
    <AppDialog title={signup ? "회원가입" : "로그인"} testId="login-dialog" onClose={onClose} busy={busy}>
      <p className="text-xs leading-relaxed text-[#666666]">로그인하면 서버 연결 기능을 사용할 수 있어요. 나중에 로그인해도 로컬 글쓰기·저장·팩트체크를 계속할 수 있어요.</p>
      <form onSubmit={submit} aria-busy={busy} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block mb-1.5 text-xs font-bold">이메일</label>
          <input id="login-email" data-testid="login-email" type="email" autoComplete="username" autoFocus
            required maxLength={200} disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 bg-white border border-[#DDD6CB] rounded-xl focus:outline-2 focus:outline-[#23211F]" />
        </div>
        <div>
          <label htmlFor="login-password" className="block mb-1.5 text-xs font-bold">비밀번호</label>
          <input id="login-password" data-testid="login-password" type="password" autoComplete={signup ? "new-password" : "current-password"}
            required maxLength={200} disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 bg-white border border-[#DDD6CB] rounded-xl focus:outline-2 focus:outline-[#23211F]" />
        </div>
        {signup && <div>
          <label htmlFor="signup-confirm" className="block mb-1.5 text-xs font-bold">비밀번호 확인 <span className="font-normal text-[#666666]">(8자 이상)</span></label>
          <input id="signup-confirm" data-testid="signup-confirm" type="password" autoComplete="new-password"
            required minLength={8} maxLength={200} disabled={busy} value={confirm} onChange={(e) => setConfirm(e.target.value)}
            className="w-full px-4 py-2.5 bg-white border border-[#DDD6CB] rounded-xl focus:outline-2 focus:outline-[#23211F]" />
        </div>}
        {notice && <p role="status" data-testid="login-notice" className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{notice}</p>}
        {error && <p role="alert" data-testid="login-error" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}
        <button type="button" data-testid="login-mode-toggle" onClick={switchMode} disabled={busy}
          className="text-xs font-bold underline cursor-pointer disabled:opacity-50">{signup ? "이미 계정이 있어요 · 로그인" : "계정이 없어요 · 회원가입"}</button>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="px-4 py-2 font-bold bg-[#EFECE6] border border-[#DDD6CB] rounded-full cursor-pointer disabled:opacity-50">나중에</button>
          <button type="submit" disabled={busy} data-testid="login-submit"
            className="px-5 py-2 font-bold bg-[#23211F] text-[#FAF8F5] rounded-full cursor-pointer disabled:opacity-50">
            {busy ? (signup ? "가입 중…" : "로그인 중…") : (signup ? "가입하기" : "로그인")}
          </button>
        </div>
      </form>
    </AppDialog>
  );
}
