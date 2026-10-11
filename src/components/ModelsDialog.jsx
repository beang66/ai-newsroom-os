import React, { useEffect, useRef, useState } from "react";
import { modelStatus, installModels, cancelModelInstall } from "../api/editorial";
import AppDialog from "./AppDialog";

const size = (bytes) => bytes >= 1024 ** 3
  ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
  : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export default function ModelsDialog({ onClose }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [requestedId, setRequestedId] = useState("");
  const controller = useRef(null);

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

  return (
    <AppDialog title="모델 설치" testId="models-dialog" onClose={onClose}>
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
    </AppDialog>
  );
}
