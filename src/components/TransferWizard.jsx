import React, { useEffect, useRef, useState } from "react";
import AppDialog from "./AppDialog";
import { beginRestore, endRestore } from "../restoreState";
import { getTransfer, uploadTransfer, downloadTransfer, deleteTransfer, getTransferFile, makeTransferFile, deleteTransferFile } from "../api/editorial";
import { generateTransferCode, normalizeTransferCode, restoreTransferFile } from "../lib/vaultTransfer";

const size = (bytes) => (bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`);
const CODE_HELP = "이전 코드 형식을 확인해 주세요(영문 대문자와 숫자 20자, 예: ABCDE-FGHJK-LMNPQ-RSTUV).";

// 다른 PC로 이전 마법사. 기본은 서버 경유(암호문만 서버에 둔다): 옛 PC 에서 서버로 보내고, 새 PC 에서 같은 계정으로 로그인해 코드만 입력한다.
// 자료가 서버 한도를 넘거나 서버를 쓰기 어려우면 파일로 옮기는 방법을 쓴다.
export default function TransferWizard({ onClose, onBeforeRestore }) {
  const [mode, setMode] = useState("export"); // export | import
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState(""); // 내보내기: 만든 코드
  const [sentTo, setSentTo] = useState(""); // "server" | 파일 이름
  const [tooLarge, setTooLarge] = useState(false);
  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState(""); // 가져오기: 입력한 코드
  const [serverInfo, setServerInfo] = useState(null); // 가져오기: 서버 상태 { exists, bytes, updatedAt } | { error }
  const fileInput = useRef(null);
  const [localFile, setLocalFile] = useState(null); // 이 PC 에 만들어 둔 이전 복제본 { exists, path, bytes }

  useEffect(() => {
    getTransferFile().then(setLocalFile).catch(() => {});
  }, []);

  useEffect(() => {
    if (mode !== "import") return undefined;
    const request = new AbortController();
    setServerInfo(null);
    getTransfer(request.signal).then(setServerInfo).catch((e) => {
      if (!request.signal.aborted) setServerInfo({ error: e?.message || String(e) });
    });
    return () => request.abort();
  }, [mode]);

  const switchMode = (next) => { setMode(next); setError(""); };

  const sendToServer = async () => {
    setPending(true); setError(""); setCopied(false); setTooLarge(false);
    const next = generateTransferCode();
    try {
      await uploadTransfer(next);
      setSentTo("server");
      setCode(next); // 올린 뒤에만 코드를 보여 준다
    } catch (e) {
      setError(e?.message || String(e));
      setTooLarge(e?.code === "TRANSFER_TOO_LARGE");
    } finally { setPending(false); }
  };

  const makeFile = async () => {
    setPending(true); setError(""); setCopied(false);
    const next = generateTransferCode();
    try {
      setLocalFile(await makeTransferFile(next));
      setSentTo("file");
      setCode(next);
    } catch (e) { setError(e?.message || String(e)); }
    finally { setPending(false); }
  };

  const cancelServerCopy = async () => {
    setPending(true); setError("");
    try { await deleteTransfer(); setCode(""); setSentTo(""); }
    catch (e) { setError(e?.message || String(e)); }
    finally { setPending(false); }
  };

  const removeLocalFile = async () => {
    if (!window.confirm("이 PC에 만든 이전 복제본 파일을 지울까요? 새 PC로 옮기기 전이면 다시 만들어야 해요.")) return;
    setPending(true); setError("");
    try { setLocalFile(await deleteTransferFile()); if (sentTo === "file") { setCode(""); setSentTo(""); } }
    catch (e) { setError(e?.message || String(e)); }
    finally { setPending(false); }
  };

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); } catch { setCopied(false); }
  };

  const confirmReplace = () => window.confirm("이 PC의 현재 계정 자료를 이전 파일의 자료로 바꿀까요? 바꾸기 전 자료는 안전 복사본으로 남깁니다.");

  const importFrom = async (source) => {
    const normalized = normalizeTransferCode(codeInput);
    const file = fileInput.current?.files?.[0];
    if (!normalized) { setError(CODE_HELP); return; }
    if (source === "file" && !file) { setError("이전 파일을 선택해 주세요."); return; }
    if (!confirmReplace()) return;
    setPending(true); setError("");
    try {
      await onBeforeRestore?.();
      beginRestore();
      await (source === "server" ? downloadTransfer(normalized) : restoreTransferFile(normalized, file));
      window.location.reload();
    } catch (e) { endRestore(); setError(e?.message || String(e)); }
    finally { setPending(false); }
  };

  const tab = (id, label) => (
    <button type="button" role="tab" aria-selected={mode === id} data-testid={`transfer-tab-${id}`} onClick={() => switchMode(id)} disabled={pending}
      className={`px-4 py-2 text-xs font-bold rounded-full cursor-pointer ${mode === id ? "bg-[#23211F] text-white" : "bg-[#EFECE6] border border-[#DDD6CB]"}`}>{label}</button>
  );
  const primary = "px-4 py-2 text-xs font-bold bg-[#23211F] text-white rounded-full cursor-pointer disabled:opacity-50";
  const secondary = "px-4 py-2 text-xs font-bold bg-[#EFECE6] border border-[#DDD6CB] rounded-full cursor-pointer disabled:opacity-50";

  return (
    <AppDialog title="다른 PC로 이전" testId="transfer-dialog" onClose={onClose} busy={pending}>
      <div role="tablist" className="flex gap-2">
        {tab("export", "① 이 PC에서 내보내기")}
        {tab("import", "② 새 PC에서 가져오기")}
      </div>
      {mode === "export" && (
        <section className="space-y-3">
          <p className="text-xs text-[#666666] leading-relaxed">지금 로그인한 계정의 기사·취재자료·녹취를 <strong>일회용 코드로 암호화</strong>해서 서버로 보냅니다. 서버에는 암호문만 있고 코드는 가지 않아요. 새 PC에서 같은 계정으로 로그인해 이 코드만 입력하면 됩니다.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="transfer-export-server" onClick={sendToServer} disabled={pending} className={primary}>
              {pending ? "처리 중…" : sentTo === "server" ? "새 코드로 다시 보내기" : "서버로 보내기 (권장)"}
            </button>
            <button type="button" data-testid="transfer-export-file" onClick={makeFile} disabled={pending} className={secondary}>파일로 만들기</button>
          </div>
          {tooLarge && <p data-testid="transfer-too-large" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">자료가 서버 한도를 넘어요. <strong>파일로 만들기</strong>로 옮겨 주세요(메신저·클라우드로 보내도 됩니다).</p>}
          {code && (
            <div className="space-y-2 rounded-2xl border border-[#DDD6CB] bg-white p-4">
              <p className="text-xs font-bold">{sentTo === "server" ? "서버에 올렸어요. 이전 코드" : "이전 코드 (파일은 아래 위치에 만들었어요)"}</p>
              <p data-testid="transfer-code" className="select-all font-mono text-lg font-black tracking-wider">{code}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" data-testid="transfer-copy" onClick={copyCode} className={secondary}>{copied ? "복사했어요" : "코드 복사"}</button>
                {sentTo === "server" && <button type="button" data-testid="transfer-cancel-server" onClick={cancelServerCopy} disabled={pending} className={secondary}>서버에서 지우기</button>}
              </div>
              <p className="text-xs text-[#666666] leading-relaxed">이 창을 닫으면 코드를 다시 볼 수 없어요. {sentTo === "server" ? "서버 파일은 새 PC에서 가져오면 자동으로 지워지고, 다시 보내면 덮어써요." : "파일과 코드는 서로 다른 방법으로 전달하세요."}</p>
            </div>
          )}
          {localFile?.exists && (
            <div data-testid="transfer-local-file" className="space-y-2 rounded-2xl border border-[#DDD6CB] bg-white p-4">
              <p className="text-xs font-bold">이 PC에 이전 복제본 파일이 있어요 ({size(localFile.bytes)})</p>
              <p data-testid="transfer-local-path" className="select-all break-all font-mono text-xs">{localFile.path}</p>
              <p className="text-xs text-[#666666] leading-relaxed">이 파일을 새 PC로 옮겨(USB·메신저 등) 새 PC의 "이전 파일로 가져오기"에서 선택하세요. 암호화돼 있어 이전 코드 없이는 열 수 없지만, 옮기고 나면 지워 주세요.</p>
              <button type="button" data-testid="transfer-delete-file" onClick={removeLocalFile} disabled={pending} className={secondary}>복제본 파일 지우기</button>
            </div>
          )}
        </section>
      )}
      {mode === "import" && (
        <section className="space-y-3">
          <p className="text-xs text-[#666666] leading-relaxed">새 PC에서 옛 PC와 <strong>같은 계정으로 로그인한 뒤</strong> 이전 코드를 넣으면, 이 PC의 현재 계정 자료가 이전 자료로 바뀝니다. 바꾸기 전 자료는 안전 복사본으로 남아요.</p>
          <p data-testid="transfer-server-status" role="status" className="text-xs font-bold">
            {serverInfo === null ? "서버를 확인하는 중…"
              : serverInfo.error ? `서버를 확인하지 못했어요: ${serverInfo.error}`
              : serverInfo.exists ? `서버에 이전 파일이 있어요 (${size(serverInfo.bytes)}${serverInfo.updatedAt ? `, ${new Date(serverInfo.updatedAt).toLocaleString("ko-KR")}` : ""})`
              : "서버에 이전 파일이 없어요. 옛 PC에서 먼저 서버로 보내 주세요."}
          </p>
          <label className="block text-xs font-bold">이전 코드
            <input type="text" data-testid="transfer-code-input" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} disabled={pending}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX" autoComplete="off" spellCheck={false}
              className="mt-1 w-full rounded-xl border border-[#DDD6CB] px-3 py-2 font-mono" />
          </label>
          <button type="button" data-testid="transfer-import-server" onClick={() => importFrom("server")} disabled={pending || !serverInfo?.exists} className={primary}>
            {pending ? "가져오는 중…" : "서버에서 가져오기"}
          </button>
          <details className="rounded-xl border border-[#DDD6CB] p-3">
            <summary className="cursor-pointer text-xs font-bold">이전 파일로 가져오기 (서버를 쓰지 않았을 때)</summary>
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-bold">이전 파일
                <input ref={fileInput} type="file" accept=".db,application/octet-stream" data-testid="transfer-file" disabled={pending} className="mt-1 block w-full text-xs" />
              </label>
              <button type="button" data-testid="transfer-import-file" onClick={() => importFrom("file")} disabled={pending} className={secondary}>파일로 가져오기</button>
            </div>
          </details>
        </section>
      )}
      {error && <p role="alert" data-testid="transfer-error" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}
    </AppDialog>
  );
}
