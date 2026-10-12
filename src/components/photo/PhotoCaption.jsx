// '설명 넣기' — v30 caption(): 선택한 사진, 사진 설명·사진 출처를 직접 입력하고 '적용'. Esc·바깥 클릭으로 닫힌다.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function PhotoCaption({ photo, onClose, onSave }) {
  const [caption, setCaption] = useState(photo.caption || "");
  const [source, setSource] = useState(photo.source || "");
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const field = "w-full rounded-xl border border-[#DDD6CB] p-2 text-sm text-slate-800 outline-none focus:border-slate-800";
  // 팀 레이아웃의 transform 이 있는 조상 아래에서는 position: fixed 가 화면이 아니라 그 조상 기준이 되므로 body 에 띄운다
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="사진 설명" data-testid="photo-caption" className="w-full max-w-md bg-white rounded-3xl border border-[#DDD6CB] shadow-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-900">사진 설명</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="p-1 rounded-full hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <img src={photo.url} alt="선택한 사진" className="w-full max-h-56 object-contain rounded-xl bg-slate-50" />
        <label className="block space-y-1 text-xs font-black text-slate-900">
          <span>사진 설명</span>
          <textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} className={`${field} resize-none`} />
        </label>
        <label className="block space-y-1 text-xs font-black text-slate-900">
          <span>사진 출처</span>
          <input value={source} onChange={(e) => setSource(e.target.value)} className={field} />
        </label>
        <div className="flex justify-end">
          <button type="button" onClick={() => onSave(caption, source)} className="px-5 py-2 rounded-full text-sm font-black bg-[#23211F] text-white cursor-pointer">적용</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
