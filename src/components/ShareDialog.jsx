import React, { useEffect, useState } from "react";
import { Copy, Link2, Lock, RefreshCw, X } from "lucide-react";
import { core } from "../api/core";
import AppDialog from "./AppDialog";

const ROLE_LABEL = { viewer: "보기", importer: "가져오기 허용" };
const EXPIRES = [["", "그대로 두기"], ["none", "만료 없음"], ["1", "1일 뒤 만료"], ["7", "7일 뒤 만료"], ["30", "30일 뒤 만료"]];
const field = "rounded-xl border border-[#DDD6CB] bg-white px-3 py-2 text-xs";
const pill = "inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-full cursor-pointer disabled:opacity-50 disabled:cursor-default";

const formatDate = (value) => (value ? new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : "");

// 보관함 기사 공유(노션식): 이메일 초대 + 일반 액세스(초대된 사람만 / 링크가 있는 로그인 사용자) + 권한(보기 / 가져오기 허용).
// 바꾸는 즉시 저장한다. 공유본은 마지막 수동 저장본이며 '최신본으로 업데이트'로 다시 올린다.
export default function ShareDialog({ articleId, title, onClose }) {
  const [share, setShare] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");

  useEffect(() => {
    const request = new AbortController();
    core.getArticleShare(articleId, request.signal).then(setShare)
      .catch((e) => { if (!request.signal.aborted) setError(e?.message || String(e)); })
      .finally(() => { if (!request.signal.aborted) setBusy(false); });
    return () => request.abort();
  }, [articleId]);

  const save = async (patch = {}, message = "") => {
    setBusy(true); setError(""); setNotice("");
    const settings = {
      generalAccess: share?.generalAccess || "restricted",
      linkRole: share?.linkRole || "viewer",
      members: share?.members || [],
      ...patch,
    };
    try { const saved = await core.saveArticleShare(articleId, settings); setShare(saved); if (message) setNotice(message); return saved; }
    catch (e) { setError(e?.message || String(e)); return null; }
    finally { setBusy(false); }
  };

  // 링크를 만들기 전에 고르는 설정(만들 때 한 번에 저장한다)
  const [setup, setSetup] = useState({ generalAccess: "restricted", linkRole: "viewer", expires: "none", members: [] });
  const addSetupMember = () => {
    const address = email.trim().toLowerCase();
    if (!address) return;
    setSetup({ ...setup, members: [...setup.members.filter((m) => m.email !== address), { email: address, role }] });
    setEmail("");
  };
  const create = async (event) => {
    event.preventDefault();
    const typed = email.trim().toLowerCase(); // 추가를 누르지 않고 입력만 해 둔 이메일도 함께 초대한다
    const members = typed ? [...setup.members.filter((m) => m.email !== typed), { email: typed, role }] : setup.members;
    const created = await save({ generalAccess: setup.generalAccess, linkRole: setup.linkRole, members,
      expiresInDays: setup.expires === "none" ? null : Number(setup.expires) });
    if (!created) return;
    setEmail("");
    try { await navigator.clipboard.writeText(created.link); setNotice("공유 링크를 만들고 복사했어요."); }
    catch { setNotice("공유 링크를 만들었어요. '링크 복사'로 복사해 주세요."); }
  };

  const invite = async (event) => {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address) return;
    const members = [...(share.members || []).filter((m) => m.email !== address), { email: address, role }];
    if (await save({ members }, `${address} 님을 초대했어요. 상대가 이 이메일로 로그인하면 '공유받은 항목'에 보입니다.`)) setEmail("");
  };

  const copyLink = async () => {
    setError(""); setNotice("");
    try { await navigator.clipboard.writeText(share.link); setNotice("링크를 복사했어요."); }
    catch { setNotice(`자동 복사가 안 돼요. 직접 복사해 주세요: ${share.link}`); }
  };

  const stop = async () => {
    if (!window.confirm("공유를 중지할까요? 링크와 초대가 모두 끊깁니다. 이미 가져간 복사본은 받는 사람에게 남아요.")) return;
    setBusy(true); setError(""); setNotice("");
    try { setShare(await core.stopArticleShare(articleId)); setNotice("공유를 중지했어요."); }
    catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  return (
    <AppDialog title={`공유 · ${title || "제목 없는 기사"}`} testId="share-dialog" onClose={onClose}>
      {share === null && busy && <p className="text-xs text-[#666666]">공유 설정을 불러오는 중…</p>}

      {share && !share.shared && <form className="space-y-3" onSubmit={create}>
        <p className="text-xs text-[#666666] leading-relaxed">이 기사의 <b>마지막으로 저장한 판</b>을 암호화해 올리고 공유 링크를 만듭니다. 기사 본문과 사진만 공유되고 취재자료·녹취는 포함되지 않아요. 링크를 만든 뒤에도 권한은 바꿀 수 있어요.</p>
        <section className="space-y-2" aria-labelledby="share-setup-access">
          <h3 id="share-setup-access" className="font-black text-sm">링크 접근 권한</h3>
          <div className="flex flex-wrap items-center gap-2">
            {setup.generalAccess === "link" ? <Link2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            <select data-testid="share-setup-access" aria-label="링크 접근 권한" value={setup.generalAccess} disabled={busy} className={field}
              onChange={(e) => setSetup({ ...setup, generalAccess: e.target.value })}>
              <option value="restricted">초대된 사람만</option><option value="link">링크가 있는 로그인 사용자</option>
            </select>
            {setup.generalAccess === "link" && <select data-testid="share-setup-link-role" aria-label="링크 권한" value={setup.linkRole} disabled={busy} className={field}
              onChange={(e) => setSetup({ ...setup, linkRole: e.target.value })}>
              <option value="viewer">보기</option><option value="importer">가져오기 허용</option>
            </select>}
            <select data-testid="share-setup-expires" aria-label="만료" value={setup.expires} disabled={busy} className={field}
              onChange={(e) => setSetup({ ...setup, expires: e.target.value })}>
              {EXPIRES.slice(1).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <p className="text-xs text-[#666666] leading-relaxed">{setup.generalAccess === "link"
            ? `링크를 받은 사람은 누구나 앱에 로그인해 ${ROLE_LABEL[setup.linkRole]} 권한으로 열 수 있어요.`
            : "아래에 초대한 이메일로 로그인한 사람만 열 수 있어요. 링크가 퍼져도 다른 사람은 열지 못합니다."}</p>
        </section>
        <section className="space-y-2" aria-labelledby="share-setup-members">
          <h3 id="share-setup-members" className="font-black text-sm">초대할 사람</h3>
          <div className="flex gap-2">
            <input type="email" data-testid="share-setup-email" placeholder="이메일" value={email} disabled={busy}
              onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSetupMember(); } }}
              className={`${field} flex-1 min-w-0`} />
            <select aria-label="초대 권한" value={role} disabled={busy} onChange={(e) => setRole(e.target.value)} className={field}>
              <option value="viewer">보기</option><option value="importer">가져오기 허용</option>
            </select>
            <button type="button" data-testid="share-setup-add" disabled={busy || !email.trim()} onClick={addSetupMember}
              className={`${pill} bg-[#EFECE6] border border-[#DDD6CB]`}>추가</button>
          </div>
          {setup.members.length > 0 && <ul className="space-y-1">{setup.members.map((member) => <li key={member.email} className="flex items-center gap-2 text-xs">
            <span className="flex-1 min-w-0 truncate">{member.email}</span><span className="text-[#666666]">{ROLE_LABEL[member.role]}</span>
            <button type="button" aria-label={`${member.email} 빼기`} disabled={busy} className="p-1.5 rounded-full hover:bg-[#EFECE6] cursor-pointer"
              onClick={() => setSetup({ ...setup, members: setup.members.filter((m) => m.email !== member.email) })}><X className="w-3.5 h-3.5" /></button>
          </li>)}</ul>}
        </section>
        <button type="submit" data-testid="share-start" disabled={busy} className={`${pill} bg-stone-900 text-white`}>
          <Link2 className="w-4 h-4" />{busy ? "만드는 중…" : "공유 링크 만들기"}</button>
      </form>}

      {share?.shared && <>
        <form className="flex gap-2" onSubmit={invite}>
          <input type="email" data-testid="share-invite-email" placeholder="이메일로 초대" value={email} disabled={busy}
            onChange={(e) => setEmail(e.target.value)} className={`${field} flex-1 min-w-0`} />
          <select aria-label="초대 권한" value={role} disabled={busy} onChange={(e) => setRole(e.target.value)} className={field}>
            <option value="viewer">보기</option><option value="importer">가져오기 허용</option>
          </select>
          <button type="submit" data-testid="share-invite" disabled={busy || !email.trim()} className={`${pill} bg-stone-900 text-white`}>초대</button>
        </form>

        <ul className="space-y-1" aria-label="공유 대상">
          <li className="flex items-center justify-between py-1.5 text-xs"><span className="font-bold">나 (소유자)</span><span className="text-[#666666]">전체 권한</span></li>
          {share.members.map((member) => <li key={member.email} className="flex items-center gap-2 py-1.5 text-xs">
            <span className="flex-1 min-w-0 truncate">{member.email}</span>
            <select aria-label={`${member.email} 권한`} value={member.role} disabled={busy} className={field}
              onChange={(e) => save({ members: share.members.map((m) => (m.email === member.email ? { ...m, role: e.target.value } : m)) })}>
              <option value="viewer">보기</option><option value="importer">가져오기 허용</option>
            </select>
            <button type="button" aria-label={`${member.email} 초대 취소`} disabled={busy} className="p-1.5 rounded-full hover:bg-[#EFECE6] cursor-pointer"
              onClick={() => save({ members: share.members.filter((m) => m.email !== member.email) })}><X className="w-3.5 h-3.5" /></button>
          </li>)}
        </ul>

        <hr className="border-[#DDD6CB]" />
        <section className="space-y-2" aria-labelledby="share-general-title">
          <h3 id="share-general-title" className="font-black text-sm">일반 액세스</h3>
          <div className="flex flex-wrap items-center gap-2">
            {share.generalAccess === "link" ? <Link2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            <select data-testid="share-general-access" aria-label="일반 액세스" value={share.generalAccess} disabled={busy} className={field}
              onChange={(e) => save({ generalAccess: e.target.value })}>
              <option value="restricted">초대된 사람만</option><option value="link">링크가 있는 로그인 사용자</option>
            </select>
            {share.generalAccess === "link" && <select aria-label="링크 권한" value={share.linkRole} disabled={busy} className={field}
              onChange={(e) => save({ linkRole: e.target.value })}>
              <option value="viewer">보기</option><option value="importer">가져오기 허용</option>
            </select>}
          </div>
          <p className="text-xs text-[#666666] leading-relaxed">{share.generalAccess === "link"
            ? `링크를 받은 사람은 누구나 앱에 로그인해 ${ROLE_LABEL[share.linkRole]} 권한으로 열 수 있어요.`
            : "초대한 이메일로 로그인한 사람만 열 수 있어요. 링크가 퍼져도 다른 사람은 열지 못합니다."}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select aria-label="만료" value="" disabled={busy} className={field}
              onChange={(e) => { const v = e.target.value; if (v) save({ expiresInDays: v === "none" ? null : Number(v) }, "만료 기간을 바꿨어요."); }}>
              {EXPIRES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <span className="text-[#666666]">{share.expiresAt ? `${formatDate(share.expiresAt)}에 만료` : "만료 없음"}</span>
          </div>
        </section>

        <hr className="border-[#DDD6CB]" />
        <p className="text-xs text-[#666666]">공유본: {formatDate(share.updatedAt)}에 올린 판. 기사를 고쳐 저장한 뒤 업데이트하면 받는 사람에게 새 판이 보여요.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="share-copy-link" disabled={busy} onClick={copyLink} className={`${pill} bg-stone-900 text-white`}><Copy className="w-3.5 h-3.5" />링크 복사</button>
          <button type="button" data-testid="share-refresh" disabled={busy} onClick={() => save({ refresh: true }, "최신 저장본으로 업데이트했어요.")}
            className={`${pill} bg-[#EFECE6] border border-[#DDD6CB]`}><RefreshCw className="w-3.5 h-3.5" />최신본으로 업데이트</button>
          <button type="button" data-testid="share-stop" disabled={busy} onClick={stop} className={`${pill} bg-white border border-rose-200 text-rose-700`}>공유 중지</button>
        </div>
      </>}

      {error && <p role="alert" data-testid="share-error" className="text-xs text-rose-700">{error}</p>}
      {notice && <p role="status" data-testid="share-notice" className="text-xs text-emerald-700 break-all">{notice}</p>}
    </AppDialog>
  );
}
