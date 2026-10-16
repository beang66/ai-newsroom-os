import React, { useState } from "react";
import { Check, ChevronDown, Pencil, RotateCcw, X } from "lucide-react";

// 화자 프로필: 발언 앞의 프로필(이모지+이름)을 누르면 화자를 고르거나 이름을 적는 칸이 열리고, "화자 수정하기"로 여러 단락을 골라 한 번에 바꾼다.
// CLOVA 가 준 발언 원본은 바꾸지 않고, 고친 내용만 따로 저장된다.
const AVATARS = ["😀", "😎", "🤓", "🧐", "😊", "🤠", "😇", "🙂"]; // 한 글자짜리 이모지만(이어 붙인 이모지는 Windows 10 에서 둘로 갈라져 보인다)
const TONES = ["bg-slate-100 border-slate-300", "bg-blue-50 border-blue-200", "bg-amber-50 border-amber-200", "bg-emerald-50 border-emerald-200", "bg-violet-50 border-violet-200", "bg-rose-50 border-rose-200"];
const SAVE_TEXT = { saving: "저장 중…", saved: "수정 내용 저장됨", error: "저장하지 못했어요" };
const button = "px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
const field = "px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 outline-none focus:border-slate-400";

/** 발언 앞에 붙는 프로필: 이모지 + 이름. 누르면 아래로 펼쳐진다. */
export function SpeakerBadge({ index, name, open, disabled, onClick, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={Boolean(open)}
      aria-label={`${name} 이름 바꾸기`}
      data-testid={testId}
      className={`flex items-center gap-1.5 pr-2 rounded-full border text-[11px] font-bold transition ${TONES[index % TONES.length]} ${
        disabled ? "cursor-default" : "cursor-pointer hover:border-slate-500"
      }`}
    >
      <span className="w-6 h-6 rounded-full bg-white/80 flex items-center justify-center text-sm leading-none" aria-hidden="true">{AVATARS[index % AVATARS.length]}</span>
      <span className="text-slate-800">{name}</span>
      {!disabled && <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />}
    </button>
  );
}

/** 지금까지 나온 화자들(고친 이름 + 처음 CLOVA 가 붙인 이름). 눌러서 고른다. */
function RosterChips({ roster, currentKey, onPick, testPrefix }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {roster.map((speaker, index) => (
        <button
          key={speaker.key}
          type="button"
          onClick={() => onPick(speaker)}
          aria-pressed={speaker.key === currentKey}
          data-testid={`${testPrefix}-${speaker.key}`}
          className={`flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full border text-[11px] transition cursor-pointer ${
            speaker.key === currentKey ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300 hover:border-slate-500"
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs leading-none" aria-hidden="true">{AVATARS[index % AVATARS.length]}</span>
          <span className="font-bold">{speaker.name}</span>
          {speaker.originals.length > 0 && (
            <span className={speaker.key === currentKey ? "text-slate-300" : "text-slate-400"}>원래 {speaker.originals.join("·")}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** 프로필을 눌렀을 때 아래로 펼쳐지는 칸: 이미 나온 화자 중에 고르거나, 새 이름을 적는다. */
export function SpeakerNameEditor({ initialName, roster, currentKey, onPick, onWhole, onOnly, onClose }) {
  const [draft, setDraft] = useState(initialName);
  const submit = (event) => {
    event.preventDefault();
    onWhole(draft);
  };
  return (
    <div onClick={(event) => event.stopPropagation()} className="mt-2 mb-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2.5" data-testid="speaker-editor">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-600">이 단락은 누가 말했나요?</span>
        <button type="button" onClick={onClose} aria-label="닫기" className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-200 cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <RosterChips roster={roster} currentKey={currentKey} onPick={(speaker) => onPick(speaker.key)} testPrefix="speaker-roster" />
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={40}
          autoFocus
          aria-label="화자 이름"
          placeholder="새 이름 적기"
          data-testid="speaker-name-input"
          className={`${field} w-40`}
        />
        <button type="submit" data-testid="speaker-name-whole" className={`${button} bg-slate-900 text-white hover:bg-slate-700 flex items-center gap-1`}>
          <Check className="w-3 h-3" aria-hidden="true" />이 화자 전체에 적용
        </button>
        <button type="button" onClick={() => onOnly(draft)} data-testid="speaker-name-only" className={`${button} bg-white border border-slate-200 text-slate-700 hover:bg-slate-100`}>
          이 단락만
        </button>
      </form>
      <p className="text-[11px] text-slate-400">다른 화자와 같은 이름을 쓰면 같은 화자로 합쳐져요. 이름을 비우면 원래 이름으로 돌아가요.</p>
    </div>
  );
}

/** "화자별 전사" 제목 줄 오른쪽: 화자 수정하기 · 원본으로 되돌리기 · 저장 상태 */
export function SpeakerHeaderActions({ editMode, edited, saveState, onStart, onReset }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-500" role="status" aria-live="polite" data-testid="speaker-save-state">{SAVE_TEXT[saveState] || ""}</span>
      {edited && !editMode && (
        <button type="button" onClick={onReset} data-testid="speaker-reset" className={`${button} bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center gap-1`}>
          <RotateCcw className="w-3 h-3" aria-hidden="true" />원본으로
        </button>
      )}
      {!editMode && (
        <button type="button" onClick={onStart} data-testid="speaker-edit-start" className={`${button} bg-slate-900 text-white hover:bg-slate-700 flex items-center gap-1`}>
          <Pencil className="w-3 h-3" aria-hidden="true" />화자 수정하기
        </button>
      )}
    </div>
  );
}

/** 화자 수정하기 중에 나타나는 막대: 고른 단락들의 화자 이름을 한 번에 바꾼다. */
export function SpeakerEditBar({ pickedCount, totalCount, roster, onSelectAll, onClear, onApply, onDone }) {
  const [name, setName] = useState("");
  const submit = (event) => {
    event.preventDefault();
    if (!pickedCount || !name.trim()) return;
    onApply(name);
    setName("");
  };
  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-300 bg-white p-2.5 shadow-xs space-y-2" data-testid="speaker-edit-bar">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-800" data-testid="speaker-picked-count">단락 {pickedCount}개 선택됨</span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onSelectAll} disabled={pickedCount === totalCount} data-testid="speaker-select-all" className={`${button} bg-slate-100 text-slate-700 hover:bg-slate-200`}>전체 선택</button>
          <button type="button" onClick={onClear} disabled={pickedCount === 0} data-testid="speaker-select-none" className={`${button} bg-slate-100 text-slate-700 hover:bg-slate-200`}>선택 해제</button>
          <button type="button" onClick={onDone} data-testid="speaker-edit-done" className={`${button} bg-white border border-slate-300 text-slate-700 hover:bg-slate-100`}>수정 끝내기</button>
        </div>
      </div>
      <RosterChips roster={roster} currentKey={null} onPick={(speaker) => setName(speaker.name)} testPrefix="speaker-bulk-roster" />
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          aria-label="고른 단락에 쓸 화자 이름"
          placeholder="위에서 고르거나 이름 적기"
          data-testid="speaker-bulk-name"
          className={`${field} w-52`}
        />
        <button type="submit" disabled={!pickedCount || !name.trim()} data-testid="speaker-bulk-apply" className={`${button} bg-slate-900 text-white hover:bg-slate-700`}>
          선택한 단락에 이름 적용
        </button>
      </div>
      <p className="text-[11px] text-slate-400">재생이 멈췄어요. 단락 박스를 눌러 여러 개 고른 뒤 이름을 적으면 한 번에 바뀌고, 이미 있는 이름이면 그 화자로 합쳐져요.</p>
    </form>
  );
}
