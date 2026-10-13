import React, { useState } from "react";
import { ArrowLeft, Check, Sparkles, Lock, Mail, User, Building } from "lucide-react";
import { signIn, signUp } from "../api/editorial";

// required: 로그인하지 않으면 자료를 볼 수 없으므로 닫을 수 없다(main 의 로그인 창과 같은 규칙 — 계정마다 자기 자료만 본다)
export default function LoginScreen({ initialMode = "login", onClose, onLoginSuccess, required = false }) {
  const [mode, setMode] = useState(initialMode); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(false); // 이 PC 에서 로그인 유지
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("김동아");
  const [department, setDepartment] = useState("디지털편집국");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    const signup = mode === "signup";
    if (signup && password !== confirmPassword) {
      setError("비밀번호 확인이 일치하지 않아요.");
      return;
    }
    setBusy(true);
    try {
      const session = signup
        ? await signUp(email.trim(), password, remember)
        : await signIn(email.trim(), password, remember);
      if (signup && session.needsConfirmation) {
        // 이메일 확인이 켜져 있으면 확인 메일의 링크를 누른 뒤 로그인한다.
        setNotice("가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.");
        setMode("login");
        return;
      }
      if (!session.signedIn) throw new Error("로그인 상태를 확인하지 못했어요. 다시 시도해 주세요.");
      onLoginSuccess?.(session);
    } catch (err) {
      // Supabase 가 영어로 돌려주는 흔한 오류만 한국어로 바꾼다.
      setError(err.message === "Invalid login credentials" ? "이메일 또는 비밀번호가 올바르지 않습니다." : err.message);
    } finally {
      setPassword("");
      setConfirmPassword("");
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto my-auto animate-in fade-in zoom-in-95 duration-200">
      {/* 상단 작업 화면 복귀 버튼 */}
      <div className="mb-4 flex items-center justify-between">
        {required ? <span /> : (
        <button
          type="button"
          onClick={onClose}
          className="text-slate-600 hover:text-slate-950 transition-colors cursor-pointer p-1 active:scale-90"
          title="에디터로 돌아가기"
        >
          <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
        </button>
        )}

        <span className="text-[11px] font-semibold text-slate-400">
          동아일보 AI 뉴스룸
        </span>
      </div>

      {/* 메인 로그인 / 회원가입 글래스모피즘 카드 */}
      <div className="bg-white/85 backdrop-blur-2xl border border-white/90 rounded-[32px] p-7 md:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.06)] space-y-6">

        {/* 헤더 */}
        <div className="text-center">
          <h2
            className="text-xl md:text-2xl font-extrabold text-[#292929] tracking-tight"
            style={{ fontFamily: "'Plus Jakarta Sans', 'Pretendard', sans-serif" }}
          >
            AI Newsroom
          </h2>
        </div>

        {/* 탭 전환: 로그인 / 회원가입 */}
        <div className="grid grid-cols-2 p-1 bg-slate-100/80 rounded-2xl border border-slate-200/60 text-xs font-bold">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`py-2 rounded-xl transition-all cursor-pointer ${mode === "login"
                ? "bg-white text-[#292929] shadow-xs"
                : "text-slate-500 hover:text-slate-800"
              }`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`py-2 rounded-xl transition-all cursor-pointer ${mode === "signup"
                ? "bg-white text-[#292929] shadow-xs"
                : "text-slate-500 hover:text-slate-800"
              }`}
          >
            회원가입
          </button>
        </div>

        {/* 폼 입력 영역 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">이름</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="김동아"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50/80 border border-slate-200/80 rounded-xl text-xs md:text-sm font-medium text-slate-900 focus:bg-white focus:border-slate-800 outline-none transition"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">소속 부서</label>
                <div className="relative">
                  <Building className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="디지털편집국"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50/80 border border-slate-200/80 rounded-xl text-xs md:text-sm font-medium text-slate-900 focus:bg-white focus:border-slate-800 outline-none transition"
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">이메일</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="reporter@donga.com"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50/80 border border-slate-200/80 rounded-xl text-xs md:text-sm font-medium text-slate-900 focus:bg-white focus:border-slate-800 outline-none transition"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">비밀번호</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 입력"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50/80 border border-slate-200/80 rounded-xl text-xs md:text-sm font-medium text-slate-900 focus:bg-white focus:border-slate-800 outline-none transition"
              />
            </div>
          </div>

          {mode === "signup" && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">비밀번호 확인</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호를 한 번 더 입력"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50/80 border border-slate-200/80 rounded-xl text-xs md:text-sm font-medium text-slate-900 focus:bg-white focus:border-slate-800 outline-none transition"
                />
              </div>
            </div>
          )}

          {mode === "login" && (
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-1.5 text-slate-600 font-medium cursor-pointer">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-slate-300 accent-slate-900 cursor-pointer" />
                <span>로그인 상태 유지</span>
              </label>
              <button type="button" onClick={() => alert("사내 계정 관리 시스템으로 문의해 주세요.")} className="text-slate-400 hover:text-slate-700 font-medium cursor-pointer">
                비밀번호 찾기
              </button>
            </div>
          )}

          {notice && (
            <p role="status" className="text-xs font-medium text-emerald-700 leading-snug">
              {notice}
            </p>
          )}

          {error && (
            <p role="alert" className="text-xs font-medium text-rose-600 leading-snug">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full mt-2 py-3.5 disabled:opacity-60 bg-[#292929] hover:bg-black text-white text-xs md:text-sm font-extrabold rounded-2xl shadow-sm transition-all duration-200 cursor-pointer active:scale-98"
          >
            {busy ? "처리 중…" : mode === "login" ? "로그인" : "회원가입 완료"}
          </button>
        </form>

      </div>
    </div>
  );
}
