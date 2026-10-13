import React from "react";
import { AlertTriangle, X, Trash2 } from "lucide-react";

/**
 * 취재자료 삭제 확인 경고 모달 (사용 중인 기사가 있을 경우의 409 Conflict 대응)
 * - 불필요한 박스형태를 배제하고 절제된 단색 모노톤 아이콘 및 심플한 텍스트 구조 적용
 */
export default function SourceDeleteModal({ isOpen, source, onClose, onConfirmDelete }) {
  if (!isOpen || !source) return null;

  // 인용 중인 기사 목록 (시뮬레이션)
  const usedArticles = source.usedBy || [
    { id: "art-1", title: "AI 반도체 개척자들... 초거대 AI 시대의 차세대 주도권 경쟁" },
    { id: "art-2", title: "차세대 온디바이스 NPU 및 PIM 반도체 산업 전략" }
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/40 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-label="취재자료 삭제 경고"
        className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-stone-200/90 flex flex-col space-y-4 animate-in zoom-in-95 duration-200 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <h3 className="text-sm font-bold text-stone-900 tracking-tight">
              취재자료 삭제 확인
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-stone-400 hover:text-stone-700 transition cursor-pointer"
            title="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 본문 안내 */}
        <div className="space-y-3 text-xs leading-relaxed">
          <p className="font-bold text-stone-900 break-all">
            '{source.name || source.title || "선택한 취재자료"}'
          </p>

          <p className="text-stone-600 font-medium">
            이 자료를 인용하고 있는 기사가 <span className="font-bold text-rose-600">{usedArticles.length}건</span> 있습니다.
          </p>

          {/* 사용 중인 기사 목록 (박스 형태 대신 미니멀한 인라인 리스트) */}
          <ul className="space-y-1.5 py-1 text-stone-500 font-normal">
            {usedArticles.map((art) => (
              <li key={art.id} className="flex items-center gap-1.5 truncate">
                <span className="w-1 h-1 rounded-full bg-stone-400 shrink-0" />
                <span className="truncate">{art.title}</span>
              </li>
            ))}
          </ul>

          <p className="text-[11px] text-stone-400 pt-1">
            * 삭제하더라도 기존 팩트체크 판정 기록은 유지되지만, 원본 파일 및 근거 인용문 열람은 불가능해집니다.
          </p>
        </div>

        {/* 하단 액션 버튼 */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100 transition cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirmDelete(source)}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>그래도 삭제</span>
          </button>
        </div>
      </div>
    </div>
  );
}
