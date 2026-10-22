import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Check,Clock,Loader2} from "lucide-react";
import {renderStoredCard,snsAction,storedJpg} from "../api/platform.js";
import {exportFiles} from "../api/editorial.js";
import ExportNotice from "./ExportNotice.jsx";
import {assertSameSource,draftText,fingerprint,reviewLabel,reviewStatus,sourceText,sameGenerationSource,articleId,prepareBlockers} from "../lib/platformState.js";
import {cardImageReadiness,prepareCardImages} from '../lib/cardPreparation.js';

const button = "inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#292929] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#292929]";
// 연결·작성창 채우기 버튼: 흰회색 글래스 알약(밝은 테두리·위쪽 빛·부드러운 그림자)
const glassButton = "inline-flex items-center justify-center rounded-full border border-white/90 bg-gradient-to-b from-white/80 to-slate-200/70 px-6 py-3 text-sm font-extrabold text-slate-700 backdrop-blur-md shadow-[0_12px_26px_-10px_rgba(15,23,42,0.28),inset_0_1px_1px_rgba(255,255,255,0.95),inset_0_-1px_2px_rgba(148,163,184,0.35)] transition hover:from-white hover:to-slate-200/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:from-white/80";
const buttonSecondary = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#DDD6CB] bg-white px-3.5 py-2.5 text-xs font-bold text-[#292929] shadow-sm transition hover:bg-[#F7F5F0] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";
// 화면 표시용 단계 줄(동작은 아래 connection·run·prepare 그대로). state: done | active | idle
const BADGE={done:['완료','bg-sky-50 text-sky-700 font-bold'],active:['진행 중','bg-[#101010] text-white'],idle:['대기 중','bg-[#F2F0EC] text-[#8E8982]']};
// 진행 노드: 완료 = 투명감 있는 주황이 가운데에서 퍼져 채워진 원 + 체크, 진행 중 = 주황 테두리 + 은은한 번짐 + 시계, 대기 = 회색 테두리 + 시계.
// 완료·진행 중 단계 아래 연결선은 위에서 아래로 주황색이 부드럽게 차오른다.
function Step({n,title,hint,state,last,children}) {
 const [label,tone]=BADGE[state],reached=state!=='idle';
 return <li className="relative" data-state={state}>
  {!last&&<span className="absolute bottom-[-1.375rem] left-[25px] top-[2.625rem] w-0.5 overflow-hidden rounded-full bg-[#E3E3E8]" aria-hidden="true">
   <span className={`absolute inset-0 origin-top bg-gradient-to-b from-sky-500/70 to-sky-400/40 transition-transform duration-700 ease-out ${reached?'scale-y-100':'scale-y-0'}`}/>
  </span>}
  <div className="flex items-center gap-3 rounded-2xl border border-transparent px-2.5 py-2.5">
   <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-white transition-all duration-700 ease-out ${state==='done'?'border-sky-400/60 shadow-[0_0_14px_rgba(56,189,248,0.35)]':state==='active'?'border-sky-500/70 shadow-[0_0_0_4px_rgba(56,189,248,0.15)]':'border-[#E3E3E8]'}`}>
    <span className={`absolute inset-0 rounded-full bg-gradient-to-br from-sky-300/85 to-sky-500/60 transition-all duration-700 ease-out ${state==='done'?'scale-100 opacity-100':state==='active'?'scale-75 opacity-30':'scale-0 opacity-0'}`} aria-hidden="true"/>
    {state==='done'?<Check className="relative h-4 w-4 text-white" aria-hidden="true"/>:<Clock className={`relative h-4 w-4 ${state==='active'?'text-sky-600':'text-[#9A9AA3]'}`} aria-hidden="true"/>}
   </span>
   <span className="min-w-0 flex-1"><span className="block text-xs font-black text-[#101010]">{String(n).padStart(2,'0')}. {title}</span>{hint&&<span className="block text-[10px] text-[#8E8982]">{hint}</span>}</span>
   <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>{label}</span>
  </div>
  {children&&<div className="ml-[3.25rem] mt-1 space-y-2">{children}</div>}
 </li>;
}
// 꺼진 버튼에 마우스를 올리거나(키보드는 Tab 으로 초점) 막는 이유를 띄운다. 꺼진 버튼은 마우스 이벤트를 받지 않으므로 감싼 상자가 받는다.
// 왼쪽 패널은 넘치면 스크롤되므로(overflow-y-auto) 안내는 body 에 고정 위치로 띄운다 — 버튼 아래 공간이 모자라면 위로.
// 화면 읽기 프로그램용 같은 목록은 상자 안에 숨겨 두고 aria-describedby 로 잇는다.
function BlockedReasons({id,reasons,children}) {
 const box=useRef(null),[at,setAt]=useState(null);
 const show=()=>{
  const r=box.current?.getBoundingClientRect();if(!r)return;
  const below=window.innerHeight-r.bottom>=240||r.top<240;
  setAt({left:r.left,width:r.width,...(below?{top:r.bottom+8}:{bottom:window.innerHeight-r.top+8})});
 };
 useEffect(()=>{
  if(!at)return undefined;
  const hide=()=>setAt(null);
  window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);
  return()=>{window.removeEventListener('scroll',hide,true);window.removeEventListener('resize',hide);};
 },[at]);
 if(!reasons.length)return children;
 const list=<ul className="list-disc space-y-1 pl-4">{reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>;
 return <div ref={box} tabIndex={0} aria-describedby={id} data-testid="sns-prepare-wrap"
   className="cursor-not-allowed rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
   onMouseEnter={show} onMouseLeave={()=>setAt(null)} onFocus={show} onBlur={()=>setAt(null)}>
  {children}
  <div id={id} className="sr-only">지금 누를 수 없는 이유: {reasons.join(' ')}</div>
  {at&&createPortal(
   <div role="tooltip" aria-hidden="true" data-testid="sns-prepare-blockers" style={at}
    className="pointer-events-none fixed z-[1000] rounded-xl bg-slate-900/95 px-3 py-2.5 text-[11px] leading-5 text-white shadow-lg">
    <p className="mb-1 font-bold">지금 누를 수 없는 이유</p>{list}
   </div>,document.body)}
 </div>;
}
// status 요청은 직렬화하고 세대 번호로 화면 이탈/준비 작업 이전 응답을 무시한다.
function useSnsConnection(platform,browser,paused,onClosed) {
 const name=platform==='threads'?'Threads':'Instagram',isInstagram=platform==='instagram';
 const [state,setState]=useState({text:"",checking:false});
 const epoch=useRef(0),timer=useRef(),flight=useRef(),connecting=useRef(false),closed=useRef(onClosed);
 closed.current=onClosed;
 const stop=()=>{epoch.current++;connecting.current=false;clearTimeout(timer.current);};
 const query=()=>{
  if(!flight.current)flight.current=snsAction(platform,'status').finally(()=>{flight.current=null;});
  return flight.current;
 };
 const start=(connect=true)=>{
  if(connect&&connecting.current)return;
  stop();connecting.current=connect;const token=epoch.current,started=Date.now();let opened=false,focused=false;
  setState({text:`${name} 연결 상태를 확인하고 있습니다.`,checking:true});
  const tick=async()=>{
   const active=()=>epoch.current===token;
   const again=()=>{if(active())timer.current=setTimeout(tick,2000);};
   try {
    const result=await query();if(!active())return;
    if(result.busy||result.pending?.status==='preparing'){
     setState({text:`${name} 작업이 진행 중입니다. 완료 후 연결을 확인합니다.`,checking:true});again();return;
    }
    if(isInstagram&&result.browser&&result.browser!=='chrome'){
     connecting.current=false;
     setState({text:'기존 전용 창은 Chrome 연결이 아닙니다. 작성 내용을 보존하고 기존 창을 직접 닫은 뒤 다시 연결해 주세요.',checking:false});return;
    }
    if(connect&&!focused){
     focused=true;
     if(!result.connected&&!result.pending){
      await snsAction(platform,'connect',{browser:isInstagram?'chrome':browser});if(!active())return;
      opened=true;again();return;
     }
     opened=true;
    }
    if(result.reason==='browser_closed'){
     connecting.current=false;
     closed.current();setState({text:`${name} 창 또는 페이지가 닫혔습니다. 다시 로그인 연결해 주세요.`,checking:false});return;
    }
    if(result.connected&&(!isInstagram||result.browser==='chrome')){
     connecting.current=false;
     setState({text:`${isInstagram?'Chrome':({chrome:'Chrome',msedge:'Edge',chromium:'Chromium'}[result.browser]||'브라우저 확인 필요')} 로그인 연결됨 · ${result.username?'계정 이름 확인됨':'계정 이름 확인 필요'}${result.pending?.status==='ready'?' · 기존 작성창을 유지하고 있습니다.':''}`,checking:false,connected:true});
     again();return;
    }
    if(Date.now()-started>5*60*1000){connecting.current=false;setState({text:`자동 확인을 중지했습니다. 전용 창에서 로그인 후 ${name} 로그인 연결을 다시 눌러 주세요.`,checking:false});return;}
    const waiting=result.reason==='profile_not_identified'?'Threads 계정 이름을 확인하지 못했습니다. 로그인 여부를 단정할 수 없습니다. 전용 창의 로그인·프로필 상태를 확인해 주세요.':result.reason===`${platform}_page_required`?`전용 창에서 ${name} 페이지를 열어 주세요. 연결을 자동 확인합니다.`:`전용 창에서 로그인해 주세요. 로그인 완료를 자동 확인합니다.`;
    setState({text:waiting,checking:true});
    if(opened||!connect)again();
   }catch(error){
    if(!active())return;
    if(/busy|pending|진행\s*중/i.test(error.message||'')){
     focused=false;setState({text:'이전 SNS 작업을 기다리고 있습니다. 연결 실패가 아닙니다.',checking:true});again();
    }else {connecting.current=false;setState({text:error.message,checking:false});}
   }
  };
  tick();
 };
 useEffect(()=>{if(paused){stop();setState(value=>({...value,checking:false}));}return stop;},[platform,paused]);
 return {state,start,stop,pause:()=>{stop();setState(value=>({...value,checking:false}));},settled:()=>flight.current?.catch(()=>{})};
}
export default function PlatformDelivery({platform,draft,cards,article,onCards,preparing=false}) {
 const currentDraft=!!draft&&draft.article_id===articleId(article)&&sameGenerationSource(draft,article);
 const currentCards=!!cards&&cards.article_id===articleId(article)&&sameGenerationSource(cards,article);
 const sameBundle=!cards||(cards.article_id===draft?.article_id&&(cards.snapshot_id||null)===(draft?.snapshot_id||null));
 const evidenceError=value=>value?.evidence_valid===false||value?.core_text?.evidence_valid===false||(Array.isArray(value?.cards)&&value.cards.some(card=>card?.evidence_valid===false));
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[browser]=useState('chrome'),[attach,setAttach]=useState(true),[exported,setExported]=useState(null);
 const live=useRef({platform,draft,cards,article});useLayoutEffect(()=>{live.current={platform,draft,cards,article};},[platform,draft,cards,article]);
 const inputKey=fingerprint({draft,cards,photos:article?.photos,source:sourceText(article)});
 const [evidenceAck,setEvidenceAck]=useState(false); // 근거 불일치를 사람이 확인했는지(입력이 바뀌면 다시 확인)
 const evidenceMismatch=evidenceError(draft)||(attach&&evidenceError(cards));
 useEffect(()=>{setMessage('');setEvidenceAck(false);},[inputKey]);
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const operation=useRef(false);
 const connection=useSnsConnection(platform,browser,preparing,()=>setMessage(''));
 const run=async(work,resume=false)=>{
  if(operation.current)return;operation.current=true;connection.pause();setBusy(true);setMessage('');
  try{await connection.settled();if(mounted.current)await work();}catch(error){if(mounted.current)setMessage(error.message);}
  finally{operation.current=false;if(mounted.current){setBusy(false);if(resume&&['instagram','threads'].includes(platform)&&!preparing)connection.start(false);}}
 };
 const renderAll=async(capture)=>{
  assertSameSource(capture.cards,null,capture.article);
  const source=sourceText(capture.article),expected=fingerprint({draft:capture.draft,cards:capture.cards,photos:capture.article.photos});
  const unchanged=()=>mounted.current&&source===sourceText(live.current.article)&&expected===fingerprint({draft:live.current.draft,cards:live.current.cards,photos:live.current.article.photos});
  const result=await prepareCardImages({draft:capture.cards,article:capture.article,render:renderStoredCard,isCurrent:unchanged,
    onProgress:(index,total)=>setMessage(`최신 카드 JPG 확인 ${index}/${total}장`),
    onCard:(id,patch)=>onCards(current=>({...current,cards:current.cards.map(card=>card.card_id===id?{...card,...patch}:card)}))});
  const timing=`새 렌더 ${result.rendered}장 · 재사용 ${result.reused}장 · ${(result.elapsed_ms/1000).toFixed(1)}초`;
  if(!result.complete)throw Error(result.errors.map(error=>`${error.index+1}번 카드: ${error.reason}`).join('\n')+`\n${timing}. 정상 이미지는 보관했습니다. 실패 카드를 편집한 뒤 JPG 준비를 다시 확인해 주세요. SNS에는 일부 카드만 첨부하지 않았습니다.`);
  setMessage(`카드 JPG 준비 완료 · ${timing}`);
  return result.assets;
 };
 const exportAll=()=>run(async()=>{
  const capture=structuredClone(live.current);
  const assets=await renderAll(capture);
  const exportKey=value=>fingerprint({draft:value.draft,cards:value.cards,photos:value.article.photos,origin:[value.article.articleId||value.article.id,sourceText(value.article)]});
  const expected=exportKey(capture);
  const blobs=[];
  for(const [index,asset] of assets.entries()){
   try{
    const blob=await storedJpg(asset);
    if(!mounted.current||expected!==exportKey(live.current))throw Error('JPG 읽기 중 기사·원고·카드·사진이 바뀌었습니다. 최신 결과로 다시 내보내 주세요.');
    blobs.push({data:blob,ext:'jpg'});
   }catch(error){throw Error(`${index+1}번 카드 JPG 읽기 실패: ${error.message} 다시 내보내기를 눌러 재시도해 주세요.`);}
  }
  // 내 문서\AI Newsroom\내보내기\카드뉴스\YYYYMMDD_<기사 제목>\01.jpg … (브라우저 다운로드 폴더로 흩어지지 않게)
  const saved=await exportFiles('cards',blobs,{title:capture.article.title});
  setExported(saved);
  setMessage(`${blobs.length}장 JPG를 저장했습니다.`);
 });
 const prepare=()=>run(async()=>{
  const capture=structuredClone(live.current),hasCards=attach&&capture.cards?.cards?.length;
  assertSameSource(capture.draft,hasCards?capture.cards:null,capture.article);
  if((evidenceError(capture.draft)||(hasCards&&evidenceError(capture.cards)))&&!evidenceAck)throw Error('원문과 일치하지 않는 근거가 표시된 결과입니다. 확인 체크를 한 뒤 작성창을 채워 주세요.');
  if(platform==='instagram'&&!hasCards)throw Error('Instagram은 카드 이미지가 필요합니다. 카드뉴스를 포함해 주세요.');
  const expected=fingerprint({draft:capture.draft,cards:capture.cards,photos:capture.article.photos}),source=sourceText(capture.article);
  const assets=hasCards?await renderAll(capture):[];
  if(expected!==fingerprint({draft:live.current.draft,cards:live.current.cards,photos:live.current.article.photos})||source!==sourceText(live.current.article))throw Error('작성 준비 중 원고·카드·사진이 변경됐습니다. 다시 준비해 주세요.');
  const result=await snsAction(platform,'prepare',{text:draftText(platform,capture.draft),assets},capture.draft);
  if(!result.success||result.status!=='ready'||!result.id||result.image_count!==assets.length)throw Error(`${platform==='threads'?'Threads':'Instagram'} 작성창의 ${assets.length?'카드 첨부·':''}원고 입력 완료를 확인하지 못했습니다. 전용 창에서 확인해 주세요. 게시하지 않았습니다.`);
  if(!mounted.current||expected!==fingerprint({draft:live.current.draft,cards:live.current.cards,photos:live.current.article.photos})||source!==sourceText(live.current.article))throw Error('SNS 작성 준비 도중 원고·카드·사진 또는 원본 기사가 바뀌었습니다. 전용 창에는 이전 내용이 있을 수 있습니다. 게시하지 말고 전용 창을 닫아 최신 결과로 다시 준비해 주세요.');
  setMessage(`${result.message}\n연결 계정: ${result.username||'확인 필요'} · 사진 ${result.image_count}장\n원고 ${reviewLabel(reviewStatus(live.current.draft))} · 카드 ${reviewLabel(reviewStatus(live.current.cards))}. 전용 창에서 사진 순서·줄바꿈을 확인해 주세요. 게시 버튼은 누르지 않았습니다.`);
 },true);
 const readiness=cardImageReadiness(cards,article),blocked=busy||preparing;
 const sns=['instagram','threads'].includes(platform),name=platform==='threads'?'Threads':'Instagram';
 const prepared=/게시 버튼은 누르지 않았습니다/.test(message);
 // 작성창 채우기를 막는 이유 — 버튼 disabled 와 마우스를 올렸을 때 보이는 안내가 같은 목록을 쓴다
 const blockers=sns?prepareBlockers({platform,draft,cards,article,attach,busy,preparing,checking:connection.state.checking,evidenceMismatch,evidenceAck}):[];
 const stateOf=(done,active)=>done?'done':active?'active':'idle';
 return <section className="space-y-3" data-testid="platform-delivery">
  <ol className="relative space-y-3 pl-1">
   {sns&&<Step n={1} title={`${name} 로그인 연결`} state={stateOf(connection.state.connected,connection.state.checking)}>
    {/* 로컬 앱 연결 전·후 안내: 알림처럼 첫 단계 맨 위에 둔다 */}
    <p role="status" data-testid={`${platform}-app-status`} className={`flex items-center gap-2 py-0.5 px-0.5 text-xs font-bold ${connection.state.connected?'text-sky-700':connection.state.checking?'text-sky-600':'text-slate-500'}`}>
     <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${connection.state.connected?'bg-sky-500':connection.state.checking?'bg-sky-400 animate-pulse':'bg-slate-300'}`} aria-hidden="true"/>
     {name} 로컬 앱 {connection.state.checking?'확인 중':connection.state.connected?'연결됨':'연결 전'}
    </p>
    <div className="pt-1.5">
     <button className={`${glassButton} w-full`} disabled={blocked||connection.state.checking} data-testid={`${platform}-connect`} onClick={()=>connection.start()}>{name} 로그인 연결</button>
    </div>
    {connection.state.text ? <p role="status" data-testid={`${platform}-connection-status`} className="text-xs text-[#8E8982]">{connection.state.text}</p> : <span data-testid={`${platform}-connection-status`} className="sr-only"/>}
   </Step>}
   {!sns&&readiness.total>0&&<Step n={1} title="카드 JPG 준비" last state={stateOf(readiness.complete,blocked&&!readiness.complete)}>
    <p role="status" data-testid="cards-jpg-status" className="text-xs">{readiness.complete?'카드 JPG 준비 완료':blocked?'카드뉴스 JPG 확인 중':'카드뉴스 JPG 준비 필요'} · 최신 JPG {readiness.ready}/{readiness.total}장</p>
    {readiness.items.filter(item=>item.error).map(item=><p role="alert" key={item.index} className="text-xs text-rose-700">{item.index+1}번 카드: {item.error}</p>)}
    <div className="flex flex-col gap-2 pt-1.5">
     <button className={`${buttonSecondary} w-full`} disabled={blocked||!currentCards} data-testid="cards-check" onClick={()=>run(()=>renderAll(structuredClone(live.current)))}>JPG 준비 확인</button>
     <button className={`${button} w-full`} disabled={blocked||!currentCards} data-testid="cards-export" onClick={exportAll}>전체 카드 JPG 내보내기</button>
    </div>
   </Step>}
   {sns&&<Step n={2} title={`${name} 작성창 채우기`} state={stateOf(prepared,busy&&!prepared)}>
    {attach&&currentDraft&&currentCards&&!sameBundle&&<p role="alert" className="text-xs text-amber-700">원문은 같지만 원고와 카드의 고정본이 다릅니다. 같은 생성 작업의 결과를 함께 사용해 주세요. 기존 결과는 보존됩니다.</p>}
    {evidenceMismatch && (
     <div role="alert" data-testid="evidence-warning" className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-900 shadow-xs">
      <p className="font-medium leading-snug">원문과 일치하지 않는 근거가 표시되어 있습니다. 인용 내용을 확인 후 진행해 주세요.</p>
      <label className="flex items-center gap-2 font-bold text-amber-950 cursor-pointer select-none">
       <input type="checkbox" data-testid="evidence-ack" checked={evidenceAck} disabled={blocked} onChange={e=>setEvidenceAck(e.target.checked)} className="h-4 w-4 rounded accent-amber-600 cursor-pointer"/>
       <span>확인했습니다.</span>
      </label>
     </div>
    )}
    <div className="space-y-2.5 pt-2">
     <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#292929] cursor-pointer">
      <input type="checkbox" className="h-4 w-4 rounded accent-[#292929]" checked={attach} disabled={blocked} onChange={e=>setAttach(e.target.checked)}/> 현재 카드뉴스 첨부
     </label>
     <BlockedReasons id={`${platform}-prepare-blockers`} reasons={blockers}>
      <button className={`${glassButton} w-full flex items-center justify-center gap-2 disabled:pointer-events-none`} disabled={blockers.length>0} data-testid="sns-prepare" onClick={prepare}>
       {blocked ? <><Loader2 className="h-4 w-4 animate-spin text-slate-600"/><span>{name} 작성창 채우는 중…</span></> : <span>{name} 작성창 채우기</span>}
      </button>
     </BlockedReasons>
    </div>
   </Step>}
   {sns&&<Step n={3} title="게시 준비 완료" last state={stateOf(prepared,false)} />}
  </ol>
  {message&&<p role="status" className="whitespace-pre-wrap rounded-xl bg-[#FAF8F5] px-3 py-2 text-[11px] leading-5 text-[#57514A]" data-testid="delivery-status">{message}</p>}
  {!sns&&<ExportNotice result={exported} kind="cards"/>}
 </section>;
}
