import React, { useRef, useState } from "react";
import AppDialog from "./AppDialog";
import { beginRestore, endRestore } from "../restoreState";
import { downloadTransferFile, generateTransferCode, normalizeTransferCode, restoreTransferFile } from "../lib/vaultTransfer";

// 다른 PC로 이전 마법사: 옛 PC 에서 이전 파일 + 일회용 코드를 만들고, 새 PC 에서 같은 계정으로 로그인해 파일과 코드로 가져온다.
export default function TransferWizard({ onClose, onBeforeRestore }) {
  const [mode, setMode] = useState("export"); // export | import
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState(""); // 내보내기: 만든 코드
  const [fileName, setFileName] = useState("");
  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState(""); // 가져오기: 입력한 코드
  const fileInput = useRef(null);

  const switchMode = (next) => { setMode(next); setError(""); };

  const makeFile = async () => {
    setPending(true); setError(""); setCopied(false);
    const next = generateTransferCode();
    try {
      setFileName(await downloadTransferFile(next));
      setCode(next); // 파일이 만들어진 뒤에만 코드를 보여 준다
    } catch (e) { setError(e?.message || String(e)); }
    finally { setPending(false); }
  };

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); } catch { setCopied(false); }
  };

  const importFile = async () => {
    const file = fileInput.current?.files?.[0];
    const normalized = normalizeTransferCode(codeInput);
    if (!file) { setError("이전 파일을 선택해 주세요."); return; }
    if (!normalized) { setError("이전 코드 형식을 확인해 주세요(영문 대문자와 숫자 20자, 예: ABCDE-FGHJK-LMNPQ-RSTUV)."); return; }
    if (!window.confirm("이 PC의 현재 계정 자료를 이전 파일의 자료로 바꿀까요? 바꾸기 전 자료는 안전 복사본으로 남깁니다.")) return;
    setPending(true); setError("");
    try {
      await onBeforeRestore?.();
      beginRestore();
      await restoreTransferFile(normalized, file);
      window.location.reload();
    } catch (e) { endRestore(); setError(e?.message || String(e)); }
    finally { setPending(false); }
  };

  const tab = (id, label) => (
    <button type="button" role="tab" aria-selected={mode === id} data-testid={`transfer-tab-${id}`} onClick={() => switchMode(id)} disabled={pending}
      className={`px-4 py-2 text-xs font-bold rounded-full cursor-pointer ${mode === id ? "bg-[#23211F] text-white" : "bg-[#EFECE6] border border-[#DDD6CB]"}`}>{label}</button>
  );

  return (
    <AppDialog title="다른 PC로 이전" testId="transfer-dialog" onClose={onClose} busy={pending}>
      <div role="tablist" className="flex gap-2">
        {tab("export", "① 이 PC에서 내보내기")}
        {tab("import", "② 새 PC에서 가져오기")}
      </div>
      {mode === "export" && (
        <section className="space-y-3">
          <p className="text-xs text-[#666666] leading-relaxed">지금 로그인한 계정의 기사·취재자료·녹취를 이전 파일로 만듭니다. 파일은 <strong>일회용 코드</strong>로 암호화되며, 코드는 이 창에서만 보여요. 파일과 코드는 서로 다른 방법으로 전달하세요(예: 파일은 USB, 코드는 메신저).</p>
          <button type="button" data-testid="transfer-export" onClick={makeFile} disabled={pending}
            className="px-4 py-2 text-xs font-bold bg-[#23211F] text-white rounded-full cursor-pointer disabled:opacity-50">{pending ? "만드는 중…" : code ? "새 코드로 다시 만들기" : "이전 파일 만들기"}</button>
          {code && (
            <div className="space-y-2 rounded-2xl border border-[#DDD6CB] bg-white p-4">
              <p className="text-xs font-bold">이전 코드 <span className="font-normal text-[#666666]">(파일: {fileName})</span></p>
              <p data-testid="transfer-code" className="select-all font-mono text-lg font-black tracking-wider">{code}</p>
              <button type="button" data-testid="transfer-copy" onClick={copyCode}
                className="px-3 py-1 text-xs font-bold bg-[#EFECE6] border border-[#DDD6CB] rounded-full cursor-pointer">{copied ? "복사했어요" : "코드 복사"}</button>
              <p className="text-xs text-[#666666] leading-relaxed">이 창을 닫으면 코드를 다시 볼 수 없어요. 새 PC에서 가져온 뒤에는 이전 파일을 지우세요. 이전 파일에는 이 계정의 모든 자료가 들어 있습니다.</p>
            </div>
          )}
        </section>
      )}
      {mode === "import" && (
        <section className="space-y-3">
          <p className="text-xs text-[#666666] leading-relaxed">새 PC에서 옛 PC와 <strong>같은 계정으로 로그인한 뒤</strong> 이전 파일과 코드를 넣으면, 이 PC의 현재 계정 자료가 이전 파일의 자료로 바뀝니다. 바꾸기 전 자료는 안전 복사본으로 남아요.</p>
          <label className="block text-xs font-bold">이전 파일
            <input ref={fileInput} type="file" accept=".db,application/octet-stream" data-testid="transfer-file" disabled={pending}
              className="mt-1 block w-full text-xs" />
          </label>
          <label className="block text-xs font-bold">이전 코드
            <input type="text" data-testid="transfer-code-input" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} disabled={pending}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX" autoComplete="off" spellCheck={false}
              className="mt-1 w-full rounded-xl border border-[#DDD6CB] px-3 py-2 font-mono" />
          </label>
          <button type="button" data-testid="transfer-import" onClick={importFile} disabled={pending}
            className="px-4 py-2 text-xs font-bold bg-[#23211F] text-white rounded-full cursor-pointer disabled:opacity-50">{pending ? "가져오는 중…" : "가져오기"}</button>
        </section>
      )}
      {error && <p role="alert" data-testid="transfer-error" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}
    </AppDialog>
  );
}
