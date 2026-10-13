import React, { useState } from "react";
import { signIn } from "../api/editorial";
import AppDialog from "./AppDialog";

export default function LoginDialog({ onClose, onSession }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const request = signIn(email.trim(), password);
    setPassword("");
    try {
      const session = await request;
      if (!session.signedIn) throw Error("로그인 상태를 확인하지 못했어요. 다시 시도해 주세요.");
      onSession(session);
      onClose();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setPassword("");
      setBusy(false);
    }
  };

  return (
    <AppDialog title="로그인" testId="login-dialog" onClose={onClose} busy={busy}>
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
          <input id="login-password" data-testid="login-password" type="password" autoComplete="current-password"
            required maxLength={200} disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 bg-white border border-[#DDD6CB] rounded-xl focus:outline-2 focus:outline-[#23211F]" />
        </div>
        {error && <p role="alert" data-testid="login-error" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="px-4 py-2 font-bold bg-[#EFECE6] border border-[#DDD6CB] rounded-full cursor-pointer disabled:opacity-50">나중에</button>
          <button type="submit" disabled={busy} data-testid="login-submit"
            className="px-5 py-2 font-bold bg-[#23211F] text-[#FAF8F5] rounded-full cursor-pointer disabled:opacity-50">
            {busy ? "로그인 중…" : "로그인"}
          </button>
        </div>
      </form>
    </AppDialog>
  );
}
