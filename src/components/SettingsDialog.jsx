import React, { useEffect, useState } from "react";
import { getSettings, saveSettings, setKeepLogin, getDiagnostics } from "../api/editorial";
import AppDialog from "./AppDialog";
import CloudBackupSection from "./CloudBackupSection";

// 환경 설정: 이 PC·계정의 설정만 다룬다(모델 설치는 ModelsDialog 가 따로 맡는다).
export default function SettingsDialog({ onClose, session, onSession, onTransfer }) {
  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState("");

  useEffect(() => {
    const request = new AbortController();
    getSettings(request.signal).then(setSettings).catch((e) => {
      if (!request.signal.aborted) setSettingsError(e?.message || String(e));
    });
    return () => request.abort();
  }, []);

  const [diagnostics, setDiagnostics] = useState("");
  const [diagnosticsNotice, setDiagnosticsNotice] = useState("");
  const copyDiagnostics = async () => {
    setSettingsError(""); setDiagnosticsNotice("");
    try {
      const d = await getDiagnostics();
      const text = [
        `앱 버전: ${d.appVersion}${d.builtAt ? ` (빌드 ${d.builtAt})` : ""}`,
        `파이프라인: ${d.pipelineVersion}`,
        `연결 방식: ${window.pywebview?.api?.core ? "IPC" : "HTTP"} · ${d.frozen ? "배포본(EXE)" : "개발 실행"}`,
        `OS: ${d.os}`,
        `AI 엔진: ${d.factcheckMode === "local" ? "로컬 AI" : "OpenAI"}`,
        `모델: ${d.models.map((m) => `${m.id} ${m.installed ? "설치됨" : `미설치(${m.files})`}`).join(", ") || "없음"}`,
        `로그인: ${d.signedIn ? "예" : "아니오"} · 로그인 유지: ${d.keepLogin ? "켜짐" : "꺼짐"}`,
        `설정: ${JSON.stringify(d.settings)}`,
        `저장 실패 기록: ${d.storageErrorLog}`,
      ].join("\n");
      setDiagnostics(text);
      try { await navigator.clipboard.writeText(text); setDiagnosticsNotice("복사했어요. 문제 보고에 붙여 넣어 주세요."); }
      catch { setDiagnosticsNotice("자동 복사가 안 돼요. 아래 내용을 직접 복사해 주세요."); }
    } catch (e) { setSettingsError(e?.message || String(e)); }
  };

  const [keep, setKeep] = useState(Boolean(session?.keepLogin));
  const changeKeepLogin = async (enabled) => {
    setSettingsError("");
    setKeep(enabled); // 바로 반영하고, 실패하면 되돌린다
    try { onSession?.(await setKeepLogin(enabled)); }
    catch (e) { setKeep(!enabled); setSettingsError(e?.message || String(e)); }
  };

  const change = async (patch) => {
    const before = settings;
    setSettingsError("");
    setSettings({ ...settings, ...patch }); // 바로 반영하고, 저장에 실패하면 되돌린다
    try { const updated = await saveSettings(patch); setSettings(updated); return updated; }
    catch (e) { setSettings(before); setSettingsError(e?.message || String(e)); }
  };

  return (
    <AppDialog title="환경 설정" testId="settings-dialog" onClose={onClose}>
      <CloudBackupSection enabled={settings?.cloudBackup ?? true} ready={Boolean(settings)} onError={setSettingsError}
        onToggle={async (next, { alreadySaved } = {}) => { if (alreadySaved) setSettings({ ...settings, cloudBackup: next }); else await change({ cloudBackup: next }); }} />
      {settingsError && <p role="alert" data-testid="settings-error" className="text-xs text-rose-700">{settingsError}</p>}
      <hr className="border-[#DDD6CB]" />
      <section className="space-y-3" aria-labelledby="keep-login-title">
        <h3 id="keep-login-title" className="font-black">로그인 유지</h3>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" data-testid="settings-keep-login" checked={keep} disabled={!session?.signedIn}
            onChange={(event) => changeKeepLogin(event.target.checked)} />
          이 PC에서 로그인 유지
        </label>
        <p className="text-xs text-[#666666] leading-relaxed">켜면 다음에 앱을 열 때 바로 로그인된 상태로 시작해요. 비밀번호는 저장하지 않고, 로그인 유지용 토큰만 이 PC의 Windows 자격 증명 관리자에 보관합니다. 로그아웃하면 자동으로 꺼집니다. 공용 PC에서는 켜지 마세요.</p>
      </section>
      <hr className="border-[#DDD6CB]" />
      <section className="space-y-3" aria-labelledby="diagnostics-title">
        <h3 id="diagnostics-title" className="font-black">문제 보고</h3>
        <p className="text-xs text-[#666666] leading-relaxed">문제가 생기면 아래 버튼으로 앱 버전·모델 설치 상태·설정을 복사해 보고에 붙여 주세요. 기사·자료 내용과 이메일은 들어가지 않습니다.</p>
        <button type="button" data-testid="settings-copy-diagnostics" onClick={copyDiagnostics}
          className="px-4 py-2 text-xs font-bold bg-[#EFECE6] border border-[#DDD6CB] rounded-full cursor-pointer">진단 정보 복사</button>
        {diagnosticsNotice && <p role="status" data-testid="settings-diagnostics-notice" className="text-xs text-emerald-700">{diagnosticsNotice}</p>}
        {diagnostics && <textarea readOnly data-testid="settings-diagnostics-text" value={diagnostics} rows={9} className="w-full rounded-xl border border-[#DDD6CB] bg-white p-3 text-xs font-mono" />}
      </section>
      <hr className="border-[#DDD6CB]" />
      <section className="space-y-3" aria-labelledby="transfer-title">
        <h3 id="transfer-title" className="font-black">다른 PC로 이전</h3>
        <p className="text-xs text-[#666666] leading-relaxed">PC를 바꿀 때 기사·취재자료를 옮기는 안내 마법사예요. 일회용 코드로 암호화한 이전 파일을 만들고, 새 PC에서 그 코드로 풀어요.</p>
        <button type="button" data-testid="settings-open-transfer" onClick={onTransfer}
          className="px-4 py-2 text-xs font-bold bg-[#EFECE6] border border-[#DDD6CB] rounded-full cursor-pointer">이전 마법사 열기</button>
      </section>
    </AppDialog>
  );
}
