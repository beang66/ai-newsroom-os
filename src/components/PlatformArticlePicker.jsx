import {useEffect,useRef,useState} from 'react';
import AppDialog from './AppDialog.jsx';
import {listStudioArticles} from '../api/platform.js';
import {formatArticleTime} from '../data/article.js';

// 편집실 내부 목록: Core 목록의 실제 저장 기사만 표시. 기존 보관함·기사 작성 코드를 수정하지 않는다.
export default function PlatformArticlePicker({onSelect,onConfirm,onClose,currentArticleId}) {
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [query,setQuery]=useState(''),[attempt,setAttempt]=useState(0);
  const [selectedId,setSelectedId]=useState(currentArticleId||null);
  const [confirming,setConfirming]=useState(false);
  const epoch=useRef(0);
  useEffect(()=>{
    const ticket=++epoch.current,controller=new AbortController();
    listStudioArticles(controller.signal).then(items=>{if(ticket===epoch.current&&!controller.signal.aborted)setRows(items);})
      .catch(e=>{if(ticket===epoch.current&&!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(ticket===epoch.current&&!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[attempt]);
  const matches=rows.filter(row=>row.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  const handleConfirm = async (idToConfirm) => {
    const targetId = idToConfirm || selectedId;
    if (!targetId || confirming) return;
    setConfirming(true);
    try {
      if (onConfirm) {
        await onConfirm(targetId);
      } else if (onSelect) {
        await onSelect(targetId);
      }
      onClose();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setConfirming(false);
    }
  };

  return <AppDialog title="저장 기사에서 선택" testId="platform-article-picker" onClose={onClose} busy={confirming}>
    <label className="block text-xs font-bold">기사 제목 검색<input aria-label="기사 제목 검색" value={query} onChange={event=>setQuery(event.target.value)} className="mt-2 w-full rounded-xl border bg-white p-3"/></label>
    <p className="text-xs text-slate-500">검색은 불러온 목록 범위에서만 적용됩니다. 현재 Core API에는 검색·페이지 요청 항목이 없습니다.</p>
    {loading&&<p role="status">저장 기사 목록 불러오는 중…</p>}
    {error&&<p role="alert">목록 조회 실패: {error}</p>}
    {!loading&&!error&&!matches.length&&<p role="status">{rows.length?'검색 결과가 없습니다.':'저장된 기사가 없습니다.'}</p>}
    <div className="max-h-[45vh] space-y-2 overflow-auto">
      {matches.map(row=>{
        const isSelected = selectedId === row.id;
        return (
          <button
            key={row.id}
            type="button"
            onClick={()=>setSelectedId(row.id)}
            onDoubleClick={()=>{
              setSelectedId(row.id);
              void handleConfirm(row.id);
            }}
            className={`block w-full rounded-xl border p-3 text-left transition ${
              isSelected
                ? "border-slate-900 bg-slate-100 ring-2 ring-slate-900/10"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <strong className="block whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{row.title||'제목 없는 기사'}</strong>
            <span className="mt-2 block text-xs text-slate-500">{row.updated_at?`수정 ${formatArticleTime(row.updated_at)}`:row.created_at?`저장 ${formatArticleTime(row.created_at)}`:'저장·수정 시각 미전달'}</span>
          </button>
        );
      })}
    </div>
    <div className="flex items-center justify-between border-t border-slate-200/80 pt-3">
      <button type="button" onClick={()=>{setLoading(true);setError('');setRows([]);setAttempt(value=>value+1);}} disabled={loading||confirming} className="text-xs text-slate-500 underline disabled:opacity-50">목록 다시 불러오기</button>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClose} disabled={confirming} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">취소</button>
        <button type="button" onClick={()=>handleConfirm(selectedId)} disabled={!selectedId||confirming||loading} className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40">{confirming?'기사 적용 중…':'확인'}</button>
      </div>
    </div>
  </AppDialog>;
}
