import React, { useEffect, useState } from "react";
import { deleteUtEvents, exportUtEvents, getUtEvents, openExportFolder, setUtConsent } from "../api/editorial";

// 사용자 테스트 기록: 동의 기반 선택 측정. 켜기·미리보기 후 내보내기·폴더 열기·기록 삭제만 다룬다.
// 동의는 로그인한 계정마다 따로 저장된다 — 한 PC에서 참여자가 계정을 바꾸면 그 참여자가 다시 켜야 한다.
export default function UtMeasurementSection() {
  const [enabled, setEnabled] = useState(null); // null = 아직 설정을 못 읽음
  const [status, setStatus] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const request = new AbortController();
    getUtEvents(request.signal).then((s) => { setStatus(s); setEnabled(Boolean(s?.enabled)); }).catch((e) => {
      if (!request.signal.aborted) setError(e?.message || String(e));
    });
    return () => request.abort();
  }, []);

  const changeMeasurement = async (next) => {
    if (next && !window.confirm("사용자 테스트 기록 v2를 켤까요? 기사 저장·다시 열기·내보내기, 팩트체크·변환·발행 같은 작업의 성공/실패 종류와 시간, 플랫폼별 변환 결과, 화면 이동만 이 PC의 암호화 저장소에 기록합니다. 원고·음성·이메일·검색어·파일명·경로·오류 문구는 기록하거나 전송하지 않습니다.")) return;
    const before = enabled;
    setError(""); setNotice("");
    setEnabled(next); // 바로 반영하고, 저장에 실패하면 되돌린다
    try {
      const updated = await setUtConsent(next);
      setEnabled(Boolean(updated?.enabled));
      setStatus(updated);
    } catch (e) { setEnabled(before); setError(e?.message || String(e)); }
  };

  const exportMeasurement = async () => {
    setError(""); setNotice("");
    try {
      const preview = await getUtEvents(); setStatus(preview);
      const summary = `${preview.count}건, ${preview.eventNames.join(", ") || "이벤트 없음"}\n필드: ${preview.fields.join(", ") || "없음"}`;
      if (!window.confirm(`다음 사용자 테스트 기록을 JSONL 파일로 이 PC에 내보낼까요?\n\n${summary}\n\n외부로 자동 전송되지 않습니다.`)) return;
      const result = await exportUtEvents();
      setNotice(`${result.count}건을 내보냈습니다.`);
    } catch (e) { setError(e?.message || String(e)); }
  };

  const deleteMeasurement = async () => {
    if (!window.confirm("이 PC의 사용자 테스트 기록만 모두 삭제할까요? 기사와 취재자료는 지워지지 않습니다.")) return;
    setError(""); setNotice("");
    try { const result = await deleteUtEvents(); setStatus(await getUtEvents()); setNotice(`${result.deleted}건을 삭제했습니다.`); }
    catch (e) { setError(e?.message || String(e)); }
  };

  const buttonClass = "px-4 py-2 rounded-2xl bg-white hover:bg-stone-100 text-stone-800 text-xs font-bold border border-stone-200/90 transition cursor-pointer shadow-2xs active:scale-95";

  return (
    <div className="space-y-3 pt-4 border-t border-stone-200/80" aria-labelledby="ut-measurement-title">
      <h3 id="ut-measurement-title" className="text-sm font-black text-stone-950">사용자 테스트 기록</h3>
      <label className="flex items-center gap-2 text-sm font-bold text-stone-800">
        <input type="checkbox" role="switch" data-testid="settings-ut-measurement" checked={enabled ?? false} disabled={enabled === null}
          onChange={(event) => changeMeasurement(event.target.checked)} />
        선택 측정 켜기
      </label>
      <p className="text-xs text-stone-500 leading-relaxed">v2 범위: 기사 저장·다시 열기·내보내기, 팩트체크·변환·발행 등 작업의 결과(오류 종류)와 처리 시간, 플랫폼별 변환 결과, 화면 이동만 이 PC의 암호화 저장소에 최대 7일·10,000건 보관합니다. 동의와 기록은 로그인한 계정마다 따로입니다. 원고·음성·개인정보·검색어·파일명·경로·토큰은 기록하지 않으며 외부 전송도 하지 않습니다.</p>
      <p className="text-xs text-stone-500">현재 {status?.count ?? 0}건{status?.dropped ? ` · 용량 제한으로 ${status.dropped}건 정리` : ""}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="settings-export-ut-events" onClick={exportMeasurement} className={buttonClass}>미리보기 후 내보내기</button>
        <button type="button" data-testid="settings-open-ut-folder" onClick={() => openExportFolder("diagnostics").catch((e) => setError(e?.message || String(e)))} className={buttonClass}>폴더 열기</button>
        <button type="button" data-testid="settings-delete-ut-events" onClick={deleteMeasurement}
          className="px-4 py-2 rounded-2xl bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200 transition cursor-pointer shadow-2xs active:scale-95">기록 삭제</button>
      </div>
      {error && <p role="alert" data-testid="settings-ut-error" className="text-xs text-rose-700">{error}</p>}
      {notice && <p role="status" data-testid="settings-ut-notice" className="text-xs text-emerald-700">{notice}</p>}
    </div>
  );
}
