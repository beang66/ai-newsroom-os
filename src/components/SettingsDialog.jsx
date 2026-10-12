import React, { useEffect, useRef, useState } from "react";
import { exportVault, restoreVault, getSettings, saveSettings } from "../api/editorial";
import AppDialog from "./AppDialog";
import { beginRestore, endRestore } from "../restoreState";

// 환경 설정: 이 PC·계정의 설정만 다룬다(모델 설치는 ModelsDialog 가 따로 맡는다).
export default function SettingsDialog({ onClose, onBeforeRestore }) {
  const restoreInput = useRef(null);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupPending, setBackupPending] = useState(false);
  const [backupNotice, setBackupNotice] = useState("");
  const [backupError, setBackupError] = useState("");
  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState("");

  useEffect(() => {
    const request = new AbortController();
    getSettings(request.signal).then(setSettings).catch((e) => {
      if (!request.signal.aborted) setSettingsError(e?.message || String(e));
    });
    return () => request.abort();
  }, []);

  const change = async (patch) => {
    const before = settings;
    setSettingsError("");
    setSettings({ ...settings, ...patch }); // 바로 반영하고, 저장에 실패하면 되돌린다
    try { setSettings(await saveSettings(patch)); }
    catch (e) { setSettings(before); setSettingsError(e?.message || String(e)); }
  };

  const backup = async () => {
    setBackupPending(true); setBackupError(""); setBackupNotice("");
    try {
      const result = await exportVault(backupPassword);
      const raw = atob(result.data);
      const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
      const link = document.createElement("a");
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
      link.href = url;
      link.download = result.filename || "ai-newsroom-backup.db";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setBackupNotice("암호화 백업을 내려받았습니다. 암호를 별도로 안전하게 보관하세요.");
      setBackupPassword("");
    } catch (e) { setBackupError(e?.message || String(e)); }
    finally { setBackupPending(false); }
  };
  const restore = async (file) => {
    if (!file || !window.confirm("현재 자료를 선택한 백업으로 교체할까요? 교체 전 DB는 안전 복사본으로 남깁니다.")) return;
    setBackupPending(true); setBackupError(""); setBackupNotice("");
    try {
      await onBeforeRestore?.();
      beginRestore();
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      await restoreVault(backupPassword, data);
      setBackupNotice("복구했습니다. 자료를 다시 불러옵니다.");
      setBackupPassword("");
      window.location.reload();
    } catch (e) { endRestore(); setBackupError(e?.message || String(e)); }
    finally { setBackupPending(false); if (restoreInput.current) restoreInput.current.value = ""; }
  };

  return (
    <AppDialog title="환경 설정" testId="settings-dialog" onClose={onClose}>
      <section className="space-y-3" aria-labelledby="cloud-backup-title">
        <h3 id="cloud-backup-title" className="font-black">작성 중 기사 클라우드 백업</h3>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" data-testid="settings-cloud-backup" checked={settings?.cloudBackup ?? true} disabled={!settings}
            onChange={(event) => change({ cloudBackup: event.target.checked })} />
          작성 중인 기사를 클라우드에 백업
        </label>
        <p className="text-xs text-[#666666] leading-relaxed">기본값은 켜짐입니다. 끄면 기사가 이 PC에만 저장됩니다. 취재자료는 이 설정과 관계없이 항상 이 PC에만 저장돼요. (지금은 설정만 저장하며, 실제 클라우드 저장은 아직 연결되지 않았어요.)</p>
        {settingsError && <p role="alert" data-testid="settings-error" className="text-xs text-rose-700">{settingsError}</p>}
      </section>
      <hr className="border-[#DDD6CB]" />
      <section className="space-y-3" aria-labelledby="local-factcheck-title">
        <h3 id="local-factcheck-title" className="font-black">팩트체크 판정 방식</h3>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" data-testid="settings-local-factcheck" checked={settings?.localFactcheck ?? true} disabled={!settings}
            onChange={(event) => change({ localFactcheck: event.target.checked })} />
          팩트체크에 로컬 모델 사용
        </label>
        <p className="text-xs text-[#666666] leading-relaxed">켜면 이 PC의 판정 모델이 문장을 판정하고, 확정하지 못한 문장만 직접 골라 외부 모델에 재검토를 요청해요(토큰 절약). 끄면 모든 문장을 외부 모델(API)이 판정해요(성능 우선, 토큰 사용 증가). 끄면 로컬 판정 모델을 설치하지 않아도 되지만 로그인과 인터넷 연결이 필요해요. 문장과 근거 조각 일부가 외부 서비스로 전송됩니다.</p>
      </section>
      <hr className="border-[#DDD6CB]" />
      <section className="space-y-3" aria-labelledby="backup-title">
        <h3 id="backup-title" className="font-black">사용자 자료 백업·복구</h3>
        <p className="text-xs text-[#666666] leading-relaxed">기사·취재자료·녹음·녹취를 이동식 암호화 백업으로 저장합니다. 이 PC의 기기 키는 백업에 포함하지 않습니다.</p>
        <label className="block text-xs font-bold">백업 암호
          <input type="password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} minLength={12} maxLength={200}
            autoComplete="new-password" placeholder="12자 이상" className="mt-1 w-full rounded-xl border border-[#DDD6CB] px-3 py-2" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={backup} disabled={backupPending || backupPassword.length < 12}
            className="px-4 py-2 text-xs font-bold bg-[#23211F] text-white rounded-full disabled:opacity-50">암호화 백업 받기</button>
          <button type="button" onClick={() => restoreInput.current?.click()} disabled={backupPending || backupPassword.length < 12}
            className="px-4 py-2 text-xs font-bold bg-[#EFECE6] border border-[#DDD6CB] rounded-full disabled:opacity-50">백업에서 복구</button>
          <input ref={restoreInput} type="file" accept=".db,application/octet-stream" className="hidden" onChange={(event) => restore(event.target.files?.[0])} />
        </div>
        {backupPending && <p role="status" className="text-xs">암호화 자료를 처리하는 중…</p>}
        {backupNotice && <p role="status" className="text-xs text-emerald-700">{backupNotice}</p>}
        {backupError && <p role="alert" className="text-xs text-rose-700">{backupError}</p>}
      </section>
    </AppDialog>
  );
}
