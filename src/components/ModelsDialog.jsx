import React, { useEffect, useRef, useState } from "react";
import { modelStatus, installModels, cancelModelInstall, exportVault, restoreVault } from "../api/editorial";
import AppDialog from "./AppDialog";
import { beginRestore, endRestore } from "../restoreState";

const size = (bytes) => bytes >= 1024 ** 3
  ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
  : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export default function ModelsDialog({ onClose, onBeforeRestore }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [requestedId, setRequestedId] = useState("");
  const controller = useRef(null);
  const restoreInput = useRef(null);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupPending, setBackupPending] = useState(false);
  const [backupNotice, setBackupNotice] = useState("");
  const [backupError, setBackupError] = useState("");

  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    modelStatus(request.signal).then(setStatus).catch((e) => {
      if (!request.signal.aborted) setError(e?.message || String(e));
    });
    return () => request.abort();
  }, []);

  // 설치 중일 때만 폴링한다. 요청이 끝난 후 1초를 기다려 겹치는 요청을 피한다.
  useEffect(() => {
    if (!status?.busy || pending) return;
    const request = new AbortController();
    let timer;
    const poll = async () => {
      try {
        const next = await modelStatus(request.signal);
        if (request.signal.aborted) return;
        setStatus(next);
        setError("");
        if (next.busy) timer = setTimeout(poll, 1000);
      } catch (e) {
        if (request.signal.aborted) return;
        setError(e?.message || String(e));
        timer = setTimeout(poll, 1000);
      }
    };
    timer = setTimeout(poll, 1000);
    return () => { request.abort(); clearTimeout(timer); };
  }, [status?.busy, pending]);

  const action = async (modelId) => {
    if (pending) return;
    setPending(true);
    setError("");
    if (modelId) setRequestedId(modelId);
    const signal = controller.current.signal;
    try {
      const next = modelId ? await installModels(modelId, signal) : await cancelModelInstall(signal);
      if (!signal.aborted) setStatus(next);
    } catch (e) {
      if (!signal.aborted) setError(e?.message || String(e));
    } finally {
      if (!signal.aborted) setPending(false);
    }
  };

  const models = status?.models || [];
  const missing = models.filter((model) => !model.installed);
  const total = missing.reduce((sum, model) => sum + model.bytesTotal, 0);
  const progress = status?.progress;
  const percent = progress?.bytesTotal > 0
    ? Math.min(100, Math.max(0, Math.round(progress.bytesDone * 100 / progress.bytesTotal))) : 0;
  // 구형 코어는 progress.model 이 비어 있다. 재개 시 용량이 유일하게 일치할 때만 모델을 특정한다.
  const matching = missing.filter((model) => model.bytesTotal === progress?.bytesTotal);
  const activeId = progress?.model || requestedId || (matching.length === 1 ? matching[0].id : "");
  const problem = error || status?.lastError?.message;
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
    <AppDialog title="환경 설정" testId="models-dialog" onClose={onClose}>
      <h3 className="font-black">로컬 AI 모델</h3>
      <p className="text-xs text-[#666666] leading-relaxed">로컬 기능에 필요한 모델을 이 PC에 설치해요. 원하는 모델의 설치 버튼을 누르면 다운로드를 시작합니다.</p>
      {!status && !error && <p role="status">모델 상태를 불러오는 중…</p>}
      {status && <p className="font-bold">{models.length && !missing.length ? "모두 설치됨" : `미설치 모델 전체 용량: ${size(total)}`}</p>}
      {status && !models.length && <p className="text-xs text-[#666666]">등록된 모델이 없습니다.</p>}
      <ul className="space-y-3">
        {models.map((model) => {
          const installing = status.busy && model.id === activeId;
          return (
            <li key={model.id} className="p-4 bg-white border border-[#DDD6CB] rounded-2xl space-y-2">
              <p className="font-bold break-words">{model.label || model.id}</p>
              <p className="text-xs text-[#666666]">{size(model.bytesTotal)} · {installing ? "설치 중" : model.installed ? "설치됨" : "미설치"} · 파일 {model.filesDone}/{model.files}</p>
              {!model.installed && !model.sourceConfigured && <p className="text-xs text-amber-800">다운로드 원본이 아직 설정되지 않았어요.</p>}
              {!model.installed && <button type="button" data-testid="models-install" disabled={status.busy || pending}
                aria-label={`${model.label || model.id} 설치`} onClick={() => action(model.id)}
                className="px-4 py-1.5 text-xs font-bold bg-[#23211F] text-[#FAF8F5] rounded-full cursor-pointer disabled:opacity-50">
                {pending && model.id === requestedId ? "설치 요청 중…" : `설치 · ${size(model.bytesTotal)}`}
              </button>}
            </li>
          );
        })}
      </ul>
      {status?.busy && <div data-testid="models-progress" role="status" className="space-y-2">
        <p className="text-xs font-bold">설치 진행률 {percent}%{progress && ` · ${size(progress.bytesDone)} / ${size(progress.bytesTotal)}`}</p>
        <progress aria-label="모델 설치 진행률" max={100} value={progress?.bytesTotal ? percent : undefined} className="w-full accent-[#23211F]" />
        {progress?.file && <p className="text-xs text-[#666666] break-all">{progress.file}</p>}
        <button type="button" data-testid="models-cancel" disabled={pending} onClick={() => action()}
          className="px-4 py-1.5 text-xs font-bold bg-[#EFECE6] border border-[#DDD6CB] rounded-full cursor-pointer disabled:opacity-50">
          {pending ? "요청 중…" : "설치 취소"}
        </button>
      </div>}
      {problem && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{problem}</p>}
      <p className="text-xs text-[#666666]">창을 닫아도 진행 중인 설치는 계속됩니다. 중단하려면 설치 취소를 눌러 주세요.</p>
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
