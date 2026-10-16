import React, { useState } from "react";
import { Check, Pencil, RotateCcw, Users, X } from "lucide-react";

// 화자 프로필: CLOVA 가 나눈 화자를 사용자가 고친다(이름 바꾸기 · 합치기 · 구간 지정). 원본 발언은 바꾸지 않고, 고친 내용만 따로 저장된다.
const SAVE_TEXT = { saving: "저장 중…", saved: "수정 내용 저장됨", error: "저장하지 못했어요. 다시 시도해 주세요." };
const button = "px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
const field = "px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 outline-none focus:border-slate-400";

export default function SpeakerProfiles({ speakers, edited, saveState, onRename, onMerge, onReset }) {
  const [openKey, setOpenKey] = useState(null);
  const [draft, setDraft] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  const current = speakers.find((speaker) => speaker.key === openKey) || null;
  const others = speakers.filter((speaker) => speaker.key !== openKey);

  const toggle = (speaker) => {
    if (openKey === speaker.key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(speaker.key);
    setDraft(speaker.name);
    setMergeInto("");
  };
  const rename = (event) => {
    event.preventDefault();
    if (current) onRename(current.key, draft);
  };
  const merge = () => {
    if (!current || !mergeInto) return;
    onMerge(current.key, mergeInto);
    setOpenKey(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5" data-testid="speaker-profiles">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <Users className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          <span>화자 프로필</span>
          <span className="font-normal text-slate-400">· 화자를 누르면 이름을 바꾸거나 다른 화자로 합칠 수 있어요</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500" role="status" aria-live="polite" data-testid="speaker-save-state">{SAVE_TEXT[saveState] || ""}</span>
          {edited && (
            <button type="button" onClick={onReset} data-testid="speaker-reset" className={`${button} bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center gap-1`}>
              <RotateCcw className="w-3 h-3" aria-hidden="true" />원본으로 되돌리기
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {speakers.map((speaker) => (
          <button
            key={speaker.key}
            type="button"
            aria-pressed={openKey === speaker.key}
            data-testid={`speaker-chip-${speaker.key}`}
            onClick={() => toggle(speaker)}
            className={`px-2.5 py-1 rounded-full text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
              openKey === speaker.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300 hover:border-slate-500"
            }`}
          >
            <Pencil className="w-3 h-3 opacity-60" aria-hidden="true" />
            {speaker.name}
            <span className={`font-mono text-[10px] ${openKey === speaker.key ? "text-slate-300" : "text-slate-400"}`}>{speaker.count}</span>
          </button>
        ))}
      </div>

      {current && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3" data-testid="speaker-editor">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">{current.name} 고치기</span>
            <button type="button" onClick={() => setOpenKey(null)} aria-label="닫기" className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <form onSubmit={rename} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-slate-500">
              이름
              <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={40} data-testid="speaker-name-input" className={`${field} w-44`} />
            </label>
            <button type="submit" data-testid="speaker-rename-save" className={`${button} bg-slate-900 text-white hover:bg-slate-700 flex items-center gap-1`}>
              <Check className="w-3 h-3" aria-hidden="true" />이름 적용
            </button>
            <span className="text-[11px] text-slate-400">이 화자의 모든 발언에 적용돼요. 비우면 원래 이름으로 돌아가요.</span>
          </form>
          {others.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-[11px] text-slate-500">
                다른 화자로 합치기
                <select value={mergeInto} onChange={(event) => setMergeInto(event.target.value)} data-testid="speaker-merge-select" className={`${field} w-44`}>
                  <option value="">합칠 화자 선택</option>
                  {others.map((speaker) => <option key={speaker.key} value={speaker.key}>{speaker.name}</option>)}
                </select>
              </label>
              <button type="button" onClick={merge} disabled={!mergeInto} data-testid="speaker-merge-apply" className={`${button} bg-slate-100 text-slate-800 hover:bg-slate-200`}>
                합치기
              </button>
              <span className="text-[11px] text-slate-400">{current.name}의 발언 {current.count}개가 선택한 화자로 옮겨져요.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 구간 지정: 목록에서 고른 단락을 한 화자로 지정한다. 고른 단락이 없으면 보이지 않는다. */
export function SpeakerAssignBar({ speakers, pickedCount, onAssign, onAssignNew, onClear }) {
  const [target, setTarget] = useState("");
  const [newName, setNewName] = useState("");
  if (pickedCount === 0) return null;
  const isNew = target === "__new__";
  const ready = isNew ? Boolean(newName.trim()) : Boolean(target);
  const apply = () => {
    if (!ready) return;
    if (isNew) onAssignNew(newName);
    else onAssign(target);
    setTarget("");
    setNewName("");
  };
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-300 bg-white p-2.5 shadow-xs" data-testid="speaker-assign-bar">
      <span className="text-xs font-bold text-slate-800 pb-1.5">단락 {pickedCount}개 선택</span>
      <label className="flex flex-col gap-1 text-[11px] text-slate-500">
        지정할 화자
        <select value={target} onChange={(event) => setTarget(event.target.value)} data-testid="speaker-assign-select" className={`${field} w-40`}>
          <option value="">화자 선택</option>
          {speakers.map((speaker) => <option key={speaker.key} value={speaker.key}>{speaker.name}</option>)}
          <option value="__new__">＋ 새 화자 만들기</option>
        </select>
      </label>
      {isNew && (
        <label className="flex flex-col gap-1 text-[11px] text-slate-500">
          새 화자 이름
          <input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={40} data-testid="speaker-assign-new-name" className={`${field} w-36`} />
        </label>
      )}
      <button type="button" onClick={apply} disabled={!ready} data-testid="speaker-assign-apply" className={`${button} bg-slate-900 text-white hover:bg-slate-700`}>
        화자 지정
      </button>
      <button type="button" onClick={onClear} data-testid="speaker-assign-clear" className={`${button} bg-slate-100 text-slate-700 hover:bg-slate-200`}>
        선택 해제
      </button>
    </div>
  );
}
