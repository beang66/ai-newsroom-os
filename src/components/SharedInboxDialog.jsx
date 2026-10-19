import React, { useEffect, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { core } from "../api/core";
import AppDialog from "./AppDialog";

const ROLE_LABEL = { viewer: "보기", importer: "가져오기 허용", owner: "소유자" };
const field = "rounded-xl border border-[#DDD6CB] bg-white px-3 py-2 text-xs";
const pill = "inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-full cursor-pointer disabled:opacity-50 disabled:cursor-default";
const formatDate = (value) => (value ? new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : "");

// 다른 사람이 보낸 본문 HTML 은 그대로 넣지 않는다(스크립트·외부 주소 차단): 글과 data:image 사진만 골라 그린다.
function SharedBody({ html }) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const blocks = [];
  const walk = (node) => {
    for (const child of node.children) {
      if (child.tagName === "IMG") {
        const src = child.getAttribute("src") || "";
        if (/^data:image\/(png|jpe?g|webp);base64,/i.test(src)) blocks.push({ img: src, alt: child.getAttribute("alt") || "" });
      } else if (["P", "H1", "H2", "H3", "H4", "LI", "BLOCKQUOTE", "FIGCAPTION"].includes(child.tagName) && !child.querySelector("img")) {
        const text = child.textContent.trim();
        if (text) blocks.push({ text, caption: child.tagName === "FIGCAPTION" });
      } else walk(child);
    }
  };
  walk(doc.body);
  if (!blocks.length && doc.body.textContent.trim()) blocks.push({ text: doc.body.textContent.trim() });
  return <div className="space-y-3 text-sm leading-relaxed" data-testid="shared-body">
    {blocks.map((block, index) => block.img
      ? <img key={index} src={block.img} alt={block.alt} className="w-full rounded-xl" />
      : <p key={index} className={block.caption ? "text-xs text-[#666666]" : "whitespace-pre-wrap"}>{block.text}</p>)}
  </div>;
}

// 공유받은 항목: 나에게 초대된 공유 목록 + 링크 붙여 넣기 → 읽기 전용으로 열기 → (권한이 있으면) 내 보관함으로 가져오기.
export default function SharedInboxDialog({ onClose, onImported }) {
  const [shares, setShares] = useState(null);
  const [link, setLink] = useState("");
  const [opened, setOpened] = useState(null); // { target, share, article }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const request = new AbortController();
    core.listReceivedShares(request.signal).then((result) => setShares(result.shares))
      .catch((e) => { if (!request.signal.aborted) { setShares([]); setError(e?.message || String(e)); } });
    return () => request.abort();
  }, []);

  const open = async (target) => {
    setBusy(true); setError(""); setNotice("");
    try { setOpened({ target, ...(await core.openShare(target)) }); }
    catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const importArticle = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await core.importShare(opened.target);
      setNotice(`'${result.title || "제목 없는 기사"}'을(를) 내 보관함에 새 기사로 가져왔어요.`);
      onImported?.(result.articleId);
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  return (
    <AppDialog title="공유받은 항목" testId="shared-inbox-dialog" onClose={onClose} busy={busy}>
      {opened ? <section className="space-y-3">
        <button type="button" onClick={() => { setOpened(null); setNotice(""); setError(""); }} disabled={busy}
          className="inline-flex items-center gap-1 text-xs font-bold cursor-pointer"><ArrowLeft className="w-3.5 h-3.5" />목록으로</button>
        <div>
          <h3 className="text-lg font-black leading-snug">{opened.article.title || "제목 없는 기사"}</h3>
          {opened.article.subtitle && <p className="mt-1 text-xs text-[#666666] whitespace-pre-wrap">{opened.article.subtitle}</p>}
          <p className="mt-2 text-xs text-[#666666]">{opened.share.ownerEmail} · {ROLE_LABEL[opened.share.role]} · {formatDate(opened.share.updatedAt)}에 올린 판</p>
        </div>
        <div className="max-h-[45vh] overflow-auto rounded-2xl border border-[#DDD6CB] bg-white p-4"><SharedBody html={opened.article.bodyHtml} /></div>
        {opened.share.role === "importer" || opened.share.role === "owner"
          ? <button type="button" data-testid="shared-import" disabled={busy} onClick={importArticle} className={`${pill} bg-stone-900 text-white`}>
            <Download className="w-3.5 h-3.5" />{busy ? "가져오는 중…" : "내 보관함으로 가져오기"}</button>
          : <p className="text-xs text-[#666666]">보기 전용 공유예요. 내 보관함에 가져오려면 공유한 사람에게 가져오기 권한을 요청해 주세요.</p>}
      </section> : <>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (link.trim()) open({ link: link.trim() }); }}>
          <input data-testid="shared-link-input" placeholder="공유 링크를 붙여 넣으세요" value={link} disabled={busy}
            onChange={(e) => setLink(e.target.value)} className={`${field} flex-1 min-w-0`} />
          <button type="submit" data-testid="shared-link-open" disabled={busy || !link.trim()} className={`${pill} bg-stone-900 text-white`}>링크로 받기</button>
        </form>
        <section className="space-y-1" aria-labelledby="shared-invited-title">
          <h3 id="shared-invited-title" className="font-black text-sm">나에게 초대된 기사</h3>
          {shares === null ? <p className="text-xs text-[#666666]">불러오는 중…</p>
            : shares.length === 0 ? <p className="text-xs text-[#666666]">아직 초대받은 기사가 없어요.</p>
            : <ul className="divide-y divide-[#DDD6CB]">{shares.map((item) => <li key={item.shareId}>
              <button type="button" disabled={busy} onClick={() => open({ shareId: item.shareId })}
                className="w-full py-2.5 text-left cursor-pointer hover:bg-[#EFECE6] rounded-lg px-2">
                <span className="block text-sm font-bold truncate">{item.title}</span>
                <span className="block text-xs text-[#666666]">{item.ownerEmail} · {ROLE_LABEL[item.role]} · {formatDate(item.updatedAt)}{item.expiresAt ? ` · ${formatDate(item.expiresAt)} 만료` : ""}</span>
              </button>
            </li>)}</ul>}
        </section>
      </>}
      {error && <p role="alert" data-testid="shared-error" className="text-xs text-rose-700">{error}</p>}
      {notice && <p role="status" data-testid="shared-notice" className="text-xs text-emerald-700">{notice}</p>}
    </AppDialog>
  );
}
