import React, { useEffect, useState } from "react";
import { History, X, RotateCcw } from "lucide-react";
import { listRevisions, previewRevision, restoreRevision } from "../api/editorial";

// 저장 이력 보기·복원. 이력은 지우지 않는다 — 복원하면 그 저장본이 새 최신 저장본이 되고, 복원 직전 상태도 이력에 남는다.
const when = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function VersionHistory({ article, emptyArticle, onClose, onRestored }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null); // 선택한 revisionNo
  const [preview, setPreview] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    listRevisions(article.articleId)
      .then((list) => alive && setItems(list))
      .catch((e) => alive && setError(e?.message || String(e)));
    return () => { alive = false; };
  }, [article.articleId]);

  const choose = async (revisionNo) => {
    setSelected(revisionNo);
    setPreview(null);
    setConfirming(false);
    setError("");
    try {
      setPreview(await previewRevision(article.articleId, revisionNo));
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const restore = async () => {
    setBusy(true);
    setError("");
    try {
      const { article: restored, revisionNo } = await restoreRevision(article.articleId, selected, emptyArticle);
      onRestored(restored, revisionNo);
    } catch (e) {
      setError(e?.message || String(e));
      setBusy(false);
    }
  };

  const latest = items?.[0]?.revisionNo;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div role="dialog" aria-label="저장 이력" data-testid="version-history"
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2 font-extrabold text-slate-900">
            <History className="w-5 h-5 text-slate-600" />
            <span>저장 이력</span>
            {items && <span className="text-xs font-semibold text-slate-500">{items.length}개</span>}
          </div>
          <button onClick={onClose} aria-label="닫기" className="p-1.5 rounded-full hover:bg-slate-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && <p role="alert" className="mx-6 mt-3 px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">{error}</p>}

        <div className="flex flex-col md:flex-row min-h-0 flex-1">
          <ul className="md:w-72 md:border-r border-slate-200 overflow-auto p-3 space-y-1.5" data-testid="revision-list">
            {!items && !error && <li className="px-3 py-2 text-xs text-slate-500">불러오는 중…</li>}
            {items?.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">저장된 이력이 없습니다.</li>}
            {items?.map((item) => (
              <li key={item.revisionNo}>
                <button
                  onClick={() => choose(item.revisionNo)}
                  aria-pressed={selected === item.revisionNo}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs cursor-pointer transition ${
                    selected === item.revisionNo ? "bg-[#23211F] text-[#FAF8F5] border-[#23211F]" : "bg-white border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2 font-bold">
                    <span>{when(item.createdAt)}</span>
                    <span className="opacity-70">#{item.revisionNo}{item.revisionNo === latest ? " · 최신" : ""}</span>
                  </span>
                  <span className="block mt-1 truncate font-semibold">{item.title || "(제목 없음)"}</span>
                  <span className="block mt-0.5 truncate opacity-70">{item.excerpt || "(본문 없음)"}</span>
                  <span className="block mt-0.5 opacity-60">{item.chars}자 · 사진 {item.photoCount} · 자료 {item.sourceCount}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex-1 min-w-0 overflow-auto p-6 space-y-3" data-testid="revision-preview">
            {!selected && <p className="text-sm text-slate-500">왼쪽에서 저장 시점을 고르면 그때의 제목과 본문을 볼 수 있습니다. 보기만 하면 아무것도 바뀌지 않습니다.</p>}
            {selected && !preview && !error && <p className="text-sm text-slate-500">불러오는 중…</p>}
            {preview && (
              <>
                <h3 className="text-lg font-black text-slate-900">{preview.title || "(제목 없음)"}</h3>
                {preview.subtitle && <p className="text-sm font-semibold text-slate-600">{preview.subtitle}</p>}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{preview.content || "(본문 없음)"}</p>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50/70">
          <p className="text-[11px] text-slate-500">복원해도 지금까지의 이력은 지워지지 않고, 복원 직전 상태도 이력에 남습니다.</p>
          {selected && selected !== latest && (
            confirming ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">#{selected}로 복원할까요?</span>
                <button onClick={() => setConfirming(false)} disabled={busy}
                  className="px-4 py-1.5 text-xs font-bold bg-[#EFECE6] text-[#23211F] rounded-full border border-[#DDD6CB] cursor-pointer">취소</button>
                <button onClick={restore} disabled={busy} data-testid="revision-restore-confirm"
                  className="px-4 py-1.5 text-xs font-extrabold bg-[#23211F] text-[#FAF8F5] rounded-full cursor-pointer disabled:opacity-50">
                  {busy ? "복원 중…" : "복원"}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)} disabled={!preview} data-testid="revision-restore"
                className="px-4 py-2 text-xs font-extrabold bg-[#23211F] text-[#FAF8F5] rounded-full cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
                <RotateCcw className="w-3.5 h-3.5" />
                이 저장본으로 복원
              </button>
            )
          )}
          {selected && selected === latest && <span className="text-xs font-semibold text-slate-500">지금 보고 있는 최신 저장본입니다.</span>}
        </div>
      </div>
    </div>
  );
}
