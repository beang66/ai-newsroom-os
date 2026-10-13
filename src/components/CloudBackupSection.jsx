import React, { useEffect, useState } from "react";
import { getBackup, backupNow, listBackups, restoreBackups, disableBackup } from "../api/editorial";

const when = (iso) => (iso ? new Date(iso).toLocaleString("ko-KR") : "");

// 작성 중 기사의 서버 백업(암호문만 서버에, 열쇠는 우리 백엔드가 관리 — 사용자는 복구 키를 다루지 않는다).
// 기사 텍스트·이력만 올리고 취재자료·사진·녹취는 올리지 않는다. 자동으로 올라가며(저장 뒤 30초 조용하면, 계속 쓰는 중에도 5분마다) 여기서는 상태와 복구만 다룬다.
export default function CloudBackupSection({ enabled: savedEnabled, ready, onToggle, onError }) {
  const [enabled, setEnabled] = useState(savedEnabled); // 누르면 바로 바뀌어 보이고, 실패하거나 취소하면 되돌린다
  useEffect(() => { setEnabled(savedEnabled); }, [savedEnabled]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [list, setList] = useState(null); // null = 닫힘, [] = 없음
  const [picked, setPicked] = useState([]);

  const refresh = () => getBackup().then(setStatus).catch(() => {});
  useEffect(() => { refresh(); }, [enabled]);

  const run = async (work) => {
    setBusy(true); setNotice(""); onError("");
    try { await work(); } catch (e) { onError(e?.message || String(e)); setEnabled(savedEnabled); }
    finally { setBusy(false); refresh(); }
  };

  // 켤 때 이 PC 의 기사를 한 번 조용히 올린다(이미 있던 기사도 보호). 올리지 못한 이유가 있으면(백엔드 키 없음·인터넷 끊김 등) 오류로 보여 준다
  const upload = async () => {
    const result = await backupNow();
    if (result.error) onError(result.error);
  };

  const toggle = async (next) => {
    setEnabled(next);
    if (next) {
      await run(async () => {
        await onToggle(true);
        await upload(); // 켜면 이 PC 의 기사를 한 번 올린다
      });
      return;
    }
    if (!window.confirm("클라우드 백업을 끌까요?")) { setEnabled(true); return; }
    const deleteServer = window.confirm("서버에 올려 둔 내 백업도 삭제할까요?\n확인 = 삭제, 취소 = 서버 백업은 남겨 둠");
    await run(async () => {
      await disableBackup(deleteServer);
      await onToggle(false, { alreadySaved: true });
      setNotice(deleteServer ? "백업을 끄고 서버 백업을 삭제했어요." : "백업을 껐어요. 서버 백업은 남아 있어요.");
      setList(null);
    });
  };

  const openRestore = () => run(async () => {
    const { backups } = await listBackups();
    setList(backups);
    setPicked(backups.map((b) => b.articleId));
  });

  const restore = () => run(async () => {
    const result = await restoreBackups(picked);
    setNotice(`복구했어요(${result.restored.length}건${result.skipped.length ? `, 건너뜀 ${result.skipped.length}건` : ""}). 화면을 다시 불러옵니다.`);
    setTimeout(() => window.location.reload(), 800);
  });

  return (
    <section className="space-y-3" aria-labelledby="cloud-backup-title">
      <h3 id="cloud-backup-title" className="font-black">작성 중 기사 클라우드 백업</h3>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" data-testid="settings-cloud-backup" checked={enabled} disabled={!ready || busy}
          onChange={(event) => toggle(event.target.checked)} />
        작성 중인 기사를 클라우드에 백업
      </label>
      <p className="text-xs text-[#666666] leading-relaxed">기사 본문과 저장 이력만 암호화해서 서버에 올려요(사진·취재자료·녹취는 올리지 않고 이 PC에만 있어요). 저장하고 30초쯤 지나면 자동으로 올라가고, 새 PC에서는 로그인한 뒤 아래에서 복구할 수 있어요. 열쇠는 우리 서버가 관리해서 따로 보관할 필요가 없어요.</p>
      {enabled && status && (
        <p data-testid="backup-status" role="status" className="text-xs font-bold">
          {status.lastUploadAt ? `마지막 백업: ${when(status.lastUploadAt)}` : "아직 이 실행에서 올린 백업이 없어요"}
          {status.pending ? ` · 대기 ${status.pending}건` : ""}
        </p>
      )}
      {enabled && status?.error && <p data-testid="backup-error" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">백업이 지연되고 있어요: {status.error} (자동으로 다시 시도합니다)</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="backup-restore-open" onClick={openRestore} disabled={busy}
          className="px-4 py-2 text-xs font-bold bg-[#EFECE6] border border-[#DDD6CB] rounded-full cursor-pointer disabled:opacity-50">서버 백업에서 복구</button>
      </div>
      {notice && <p role="status" data-testid="backup-notice" className="text-xs text-emerald-700">{notice}</p>}
      {list && (
        <div data-testid="backup-list" className="space-y-2 rounded-2xl border border-[#DDD6CB] bg-white p-3">
          {list.length === 0 ? <p className="text-xs">서버에 백업한 기사가 없어요.</p> : (
            <>
              <p className="text-xs text-[#666666]">복구할 기사를 고르세요. 이 PC의 기존 저장 이력은 지우지 않고 새 저장본으로 추가돼요.</p>
              <ul className="space-y-1">
                {list.map((b) => (
                  <li key={b.articleId}>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={picked.includes(b.articleId)}
                        onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, b.articleId] : prev.filter((id) => id !== b.articleId)))} />
                      <span className="font-bold">{b.title || "제목 없음"}</span>
                      <span className="text-[#666666]">{when(b.savedAt)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <button type="button" data-testid="backup-restore" onClick={restore} disabled={busy || !picked.length}
                className="px-4 py-2 text-xs font-bold bg-[#23211F] text-white rounded-full cursor-pointer disabled:opacity-50">선택한 기사 복구</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
