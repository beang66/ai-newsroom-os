import React, { useEffect, useRef, useState } from "react";
import { Eraser, Pencil } from "lucide-react";
import { MARK_COLORS, segmentsOf } from "../../lib/speakerEdits.js";

// 화자 박스 안의 글 도구: 글을 드래그하면 선택 위치 위에 "텍스트 수정바"(형광펜 · 지우기 · 수정)가 뜬다.
// 형광펜과 고친 글은 CLOVA 원본 위에 덧씌워 저장되고, 원본 발언은 바뀌지 않는다.

/** 화면 가장자리에서 잘리지 않게 막대 위치를 정한다(위에 자리가 없으면 선택 아래에 둔다). */
const place = (selection) => {
  const width = globalThis.innerWidth || 1200;
  const above = selection.top > 56;
  return {
    position: "fixed",
    left: Math.min(Math.max(selection.x, 150), width - 150),
    top: above ? selection.top - 8 : selection.bottom + 8,
    transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
  };
};

const TOOLBAR_COLORS = ["yellow", "green", "pink"];

/** 텍스트 수정바 */
export function SelectionToolbar({ selection, onMark, onClear, onEdit }) {
  return (
    <div
      role="toolbar"
      aria-label="텍스트 수정바"
      data-testid="text-toolbar"
      onMouseDown={(event) => event.preventDefault()} // 눌러도 글 선택이 풀리지 않게
      style={place(selection)}
      className="z-50 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-lg"
    >
      {TOOLBAR_COLORS.map((key) => {
        const color = MARK_COLORS[key];
        if (!color) return null;
        return (
          <button
            key={key}
            type="button"
            title={`${color.label} 형광펜`}
            aria-label={`${color.label} 형광펜`}
            data-testid={`mark-${key}`}
            onClick={() => onMark(key)}
            style={{ background: color.bg }}
            className="w-5 h-5 rounded-full border border-black/10 cursor-pointer hover:scale-110 transition"
          />
        );
      })}
      <button type="button" title="형광펜 지우기" aria-label="형광펜 지우기" data-testid="mark-clear" onClick={onClear} className="p-1 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer">
        <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <span className="w-px h-4 bg-slate-200" aria-hidden="true" />
      <button type="button" data-testid="text-edit-start" onClick={onEdit} className="flex items-center gap-1 px-1.5 py-1 rounded-md text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer">
        <Pencil className="w-3 h-3" aria-hidden="true" />수정
      </button>
    </div>
  );
}

function BoxEditor({ value, original, selection, onSave, onCancel }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.focus();
    if (selection) element.setSelectionRange(selection.start, selection.end); // 드래그한 부분이 이미 선택돼 있다
    else element.setSelectionRange(value.length, value.length);
    // 열릴 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const valid = draft.trim().length > 0;
  const save = () => {
    if (valid) onSave(draft);
  };
  return (
    <div onClick={(event) => event.stopPropagation()} className="space-y-1.5" data-testid="text-editor">
      <textarea
        ref={ref}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            save();
          }
        }}
        rows={Math.min(12, Math.max(3, Math.ceil(draft.length / 34)))}
        aria-label="텍스트 수정"
        data-testid="text-editor-input"
        className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs leading-relaxed text-slate-900 outline-none focus:border-slate-500 resize-y"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={save} disabled={!valid} data-testid="text-editor-save" className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 disabled:opacity-40 cursor-pointer">저장</button>
        <button type="button" onClick={onCancel} data-testid="text-editor-cancel" className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer">취소</button>
        {draft !== original && (
          <button type="button" onClick={() => setDraft(original)} data-testid="text-editor-original" className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 cursor-pointer">원문으로</button>
        )}
        <span className="text-[11px] text-slate-400">Ctrl+Enter 저장 · Esc 취소 · 칠한 글을 고치면 형광펜도 함께 늘거나 줄어요</span>
      </div>
    </div>
  );
}

/** 검색어 강조 렌더링: 일치하는 단어에 밝은 회색빛 형태의 밑줄 적용 */
function highlightSearch(text, searchKeyword) {
  const query = searchKeyword ? searchKeyword.trim() : "";
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  if (parts.length <= 1) return text;
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <span
        key={index}
        style={{
          backgroundImage: "repeating-linear-gradient(45deg, rgba(14, 165, 233, 0.3), rgba(14, 165, 233, 0.3) 2px, transparent 2px, transparent 6px)",
        }}
        className="text-slate-950 font-bold px-0.5 rounded-xs"
      >
        {part}
      </span>
    ) : (
      part
    )
  );
}

/** 박스 안의 글: 형광펜이 칠해진 부분을 보여 주고, 수정 중이면 글 수정칸으로 바뀐다. */
export function BoxText({ box, editing, selection, onSave, onCancel, searchKeyword = "" }) {
  if (editing) return <BoxEditor value={box.text} original={box.originalText} selection={selection} onSave={onSave} onCancel={onCancel} />;
  return (
    <p className="text-xs text-slate-700 leading-relaxed font-sans pl-1 select-text" data-box-text={box.id} data-testid={`box-text-${box.id}`}>
      {segmentsOf(box.text, box.marks).map((part) =>
        part.color ? (
          <mark key={part.start} style={{ background: MARK_COLORS[part.color].bg }} className="rounded-sm text-slate-900">
            {highlightSearch(part.text, searchKeyword)}
          </mark>
        ) : (
          <React.Fragment key={part.start}>
            {highlightSearch(part.text, searchKeyword)}
          </React.Fragment>
        )
      )}
    </p>
  );
}
