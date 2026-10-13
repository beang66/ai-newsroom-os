import {useEffect,useRef,useState} from 'react';
import AppDialog from './AppDialog.jsx';
import {listStudioArticles} from '../api/platform.js';
import {formatArticleTime} from '../data/article.js';

// 편집실 내부 목록: Core 목록의 실제 저장 기사만 표시. 기존 보관함·기사 작성 코드를 수정하지 않는다.
export default function PlatformArticlePicker({onSelect,onClose}) {
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [query,setQuery]=useState(''),[attempt,setAttempt]=useState(0);
  const epoch=useRef(0);
  useEffect(()=>{
    const ticket=++epoch.current,controller=new AbortController();
    listStudioArticles(controller.signal).then(items=>{if(ticket===epoch.current&&!controller.signal.aborted)setRows(items);})
      .catch(e=>{if(ticket===epoch.current&&!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(ticket===epoch.current&&!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[attempt]);
  const matches=rows.filter(row=>row.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <AppDialog title="저장 기사에서 선택" testId="platform-article-picker" onClose={onClose}>
    <label className="block text-xs font-bold">기사 제목 검색<input aria-label="기사 제목 검색" value={query} onChange={event=>setQuery(event.target.value)} className="mt-2 w-full rounded-xl border bg-white p-3"/></label>
    <p className="text-xs text-slate-500">검색은 불러온 목록 범위에서만 적용됩니다. 현재 Core API에는 검색·페이지 요청 항목이 없습니다.</p>
    {loading&&<p role="status">저장 기사 목록 불러오는 중…</p>}
    {error&&<p role="alert">목록 조회 실패: {error}</p>}
    {!loading&&!error&&!matches.length&&<p role="status">{rows.length?'검색 결과가 없습니다.':'저장된 기사가 없습니다.'}</p>}
    <div className="max-h-[45vh] space-y-2 overflow-auto">{matches.map(row=><button key={row.id} type="button" onClick={()=>{onSelect(row.id);onClose();}} className="block w-full rounded-xl border bg-white p-3 text-left">
      <strong className="block whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{row.title||'제목 없는 기사'}</strong>
      <span className="mt-2 block text-xs text-slate-500">{row.updated_at?`수정 ${formatArticleTime(row.updated_at)}`:row.created_at?`저장 ${formatArticleTime(row.created_at)}`:'저장·수정 시각 미전달'}</span>
    </button>)}</div>
    <button type="button" onClick={()=>{setLoading(true);setError('');setRows([]);setAttempt(value=>value+1);}} disabled={loading} className="text-xs underline">목록 다시 불러오기</button>
  </AppDialog>;
}
