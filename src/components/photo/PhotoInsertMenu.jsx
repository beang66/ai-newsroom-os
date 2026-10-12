// '사진 넣기' — v30 처럼 '사진 검색하기 / 사진 첨부하기' 두 메뉴만. 메뉴 밖 클릭·Esc 로 닫힌다.
import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";

export default function PhotoInsertMenu({ onSearch, onUpload, className = "" }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !wrap.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const pick = (fn) => () => { setOpen(false); fn(); };
  return (
    <div ref={wrap} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)} className={className}>
        <ImageIcon className="w-4 h-4 text-purple-600" />
        <span>사진 넣기</span>
      </button>
      {open && (
        <div role="menu" data-testid="photo-menu" className="absolute left-0 top-full mt-1.5 z-40 w-40 bg-white rounded-xl shadow-lg border border-[#DDD6CB] py-1 text-xs font-bold text-slate-800">
          <button type="button" role="menuitem" onClick={pick(onSearch)} className="block w-full text-left px-3 py-2 hover:bg-slate-100 cursor-pointer">사진 검색하기</button>
          <button type="button" role="menuitem" onClick={pick(onUpload)} className="block w-full text-left px-3 py-2 hover:bg-slate-100 cursor-pointer">사진 첨부하기</button>
        </div>
      )}
    </div>
  );
}
