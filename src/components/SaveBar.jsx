import { useState } from "react";
import { Save } from "lucide-react";

// 화면 하단 '저장하기' — 지금 기사(원고·연결한 자료·녹취·변환본)를 수동 저장해 보관함·데이터맵에 남긴다. 결과는 상단 저장 상태에 표시된다.
export default function SaveBar({ onSave, testId = "screen-save" }) {
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await onSave(); } finally { setSaving(false); }
  };
  return <div className="mt-8 flex justify-end border-t border-[#E7E2D9] pt-4">
    <button type="button" data-testid={testId} disabled={saving} onClick={save}
      className="inline-flex items-center gap-2 rounded-full bg-[#101010] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 cursor-pointer">
      <Save className="h-4 w-4" aria-hidden="true" />{saving ? "저장 중…" : "저장하기"}
    </button>
  </div>;
}
