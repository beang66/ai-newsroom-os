import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, RotateCcw } from "lucide-react";

// 화자 프로필: CLOVA 가 나눈 화자 박스는 그대로 두고, 이름만 바꾼다. 프로필 아이콘을 누르면 작은 메뉴가 열려 화자를 고르거나 이름을 적는다.
// "화자 수정하기"로 여러 박스를 골라 한 번에 바꿀 수도 있다. CLOVA 가 준 발언 원본은 바꾸지 않고, 고친 내용만 따로 저장된다.
// 아이콘은 메신저 기본 프로필처럼 둥근 사각형 바탕에 사람 실루엣을 직접 그린 것이다(파스텔 주황·파랑 등).
const AVATAR_TONES = ["#FFCB9A", "#A8CFFF", "#B5E6BF", "#FFC1D3", "#D2C5FF", "#FFE79E", "#A6E7DB", "#FFB9AA"];
const SAVE_TEXT = { saving: "저장 중…", saved: "수정 내용 저장됨", error: "저장하지 못했어요" };
const button = "px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
const field = "px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 outline-none focus:border-slate-400";

/** 기본 프로필 모양 아이콘. index 에 따라 바탕색이 정해진다(같은 화자는 늘 같은 색). */
export function SpeakerAvatar({ index, size = 24 }) {
  const clip = `avatar${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <clipPath id={clip}><rect width="48" height="48" rx="16" /></clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect width="48" height="48" fill={AVATAR_TONES[index % AVATAR_TONES.length]} />
        <circle cx="24" cy="19" r="8" fill="#fff" fillOpacity="0.95" />
        <path d="M8 48c0-10 7-17 16-17s16 7 16 17z" fill="#fff" fillOpacity="0.95" />
      </g>
    </svg>
  );
}

function MenuBody({ name, roster, currentKey, onPick, onRename }) {
  const [draft, setDraft] = useState(name);
  const submit = (event) => {
    event.preventDefault();
    onRename(draft);
  };
  return (
    <div onClick={(event) => event.stopPropagation()} role="menu" className="absolute left-0 top-full mt-1.5 z-30 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg" data-testid="speaker-editor">
      <ul className="max-h-48 overflow-y-auto">
        {roster.map((speaker, index) => (
          <li key={speaker.key}>
            <button
              type="button"
              onClick={() => onPick(speaker.key)}
              aria-current={speaker.key === currentKey}
              data-testid={`speaker-roster-${speaker.key}`}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs hover:bg-slate-50 cursor-pointer"
            >
              <SpeakerAvatar index={index} size={20} />
              <span className="font-bold text-slate-800">{speaker.name}</span>
              {speaker.originals.length > 0 && <span className="text-[10px] text-slate-400 truncate">원래 {speaker.originals.join("·")}</span>}
              {speaker.key === currentKey && <Check className="ml-auto w-3.5 h-3.5 text-slate-700 shrink-0" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-slate-100">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={40}
          autoFocus
          aria-label="화자 이름"
          placeholder="이름 바꾸기"
          data-testid="speaker-name-input"
          className={`${field} flex-1 min-w-0`}
        />
        <button type="submit" data-testid="speaker-name-submit" className={`${button} bg-slate-900 text-white hover:bg-slate-700`}>변경</button>
      </form>
    </div>
  );
}

/** 박스 맨 앞의 프로필: 아이콘 + 이름. 아이콘을 누르면 작은 메뉴가 아래로 열린다(박스는 그대로). */
export function SpeakerProfileMenu({ index, name, open, disabled, testId, nameTestId, roster, currentKey, onToggle, onClose, onPick, onRename }) {
  const rootRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) onClose();
    };
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={Boolean(open)}
        aria-haspopup="menu"
        aria-label={`${name} 프로필 메뉴`}
        data-testid={testId}
        className="flex items-center gap-0.5 rounded-lg p-0.5 transition enabled:hover:bg-slate-100 enabled:cursor-pointer disabled:cursor-default"
      >
        <SpeakerAvatar index={index} size={26} />
        {!disabled && <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />}
      </button>
      <span className="text-xs font-bold text-slate-800" data-testid={nameTestId}>{name}</span>
      {open && !disabled && <MenuBody name={name} roster={roster} currentKey={currentKey} onPick={onPick} onRename={onRename} />}
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

/** 화자 수정하기 중에 나타나는 막대: 고른 박스들의 화자 이름을 한 번에 바꾼다. */
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
        <span className="text-xs font-bold text-slate-800" data-testid="speaker-picked-count">박스 {pickedCount}개 선택됨</span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onSelectAll} disabled={pickedCount === totalCount} data-testid="speaker-select-all" className={`${button} bg-slate-100 text-slate-700 hover:bg-slate-200`}>전체 선택</button>
          <button type="button" onClick={onClear} disabled={pickedCount === 0} data-testid="speaker-select-none" className={`${button} bg-slate-100 text-slate-700 hover:bg-slate-200`}>선택 해제</button>
          <button type="button" onClick={onDone} data-testid="speaker-edit-done" className={`${button} bg-white border border-slate-300 text-slate-700 hover:bg-slate-100`}>수정 끝내기</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {roster.map((speaker, index) => (
          <button
            key={speaker.key}
            type="button"
            onClick={() => setName(speaker.name)}
            data-testid={`speaker-bulk-roster-${speaker.key}`}
            className="flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full border border-slate-300 bg-white text-[11px] text-slate-700 hover:border-slate-500 transition cursor-pointer"
          >
            <SpeakerAvatar index={index} size={18} />
            <span className="font-bold">{speaker.name}</span>
            {speaker.originals.length > 0 && <span className="text-slate-400">원래 {speaker.originals.join("·")}</span>}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          aria-label="고른 박스에 쓸 화자 이름"
          placeholder="위에서 고르거나 이름 적기"
          data-testid="speaker-bulk-name"
          className={`${field} w-52`}
        />
        <button type="submit" disabled={!pickedCount || !name.trim()} data-testid="speaker-bulk-apply" className={`${button} bg-slate-900 text-white hover:bg-slate-700`}>
          선택한 박스에 이름 적용
        </button>
      </div>
      <p className="text-[11px] text-slate-400">재생이 멈췄어요. 박스를 눌러 여러 개 고른 뒤 이름을 적으면 한 번에 바뀌고, 이미 있는 이름이면 그 화자와 같은 이름이 돼요.</p>
    </form>
  );
}
