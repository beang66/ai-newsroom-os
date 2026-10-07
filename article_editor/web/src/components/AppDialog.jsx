import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// 네이티브 모달이 키보드 포커스를 가두고, 닫으면 원래 버튼으로 돌려준다.
export default function AppDialog({ title, testId, onClose, busy = false, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    (dialog.querySelector("input") || dialog.querySelector("button"))?.focus();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return createPortal(
    <dialog ref={ref} role="dialog" aria-modal="true" aria-label={title} data-testid={testId}
      onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[85vh] overflow-auto rounded-3xl border border-[#DDD6CB] bg-[#FAF8F5] p-0 text-[#23211F] shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-xs">
      <div className="flex items-center justify-between gap-3 border-b border-[#DDD6CB] px-6 py-4">
        <h2 className="text-base font-extrabold">{title}</h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label="닫기"
          className="order-last p-1.5 rounded-full hover:bg-[#EFECE6] cursor-pointer disabled:opacity-50">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-6 text-sm space-y-4">{children}</div>
    </dialog>, document.body,
  );
}
