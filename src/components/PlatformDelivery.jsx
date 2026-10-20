import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {Check,Loader2,Send} from "lucide-react";
import {renderStoredCard,snsAction,storedJpg} from "../api/platform.js";
import {exportFiles} from "../api/editorial.js";
import ExportNotice from "./ExportNotice.jsx";
import {assertSameSource,draftText,fingerprint,reviewLabel,reviewStatus,sourceText,sameGenerationSource,articleId} from "../lib/platformState.js";
import {cardImageReadiness,prepareCardImages} from '../lib/cardPreparation.js';

const button = "inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#292929] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#292929]";
const buttonSecondary = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#DDD6CB] bg-white px-3.5 py-2.5 text-xs font-bold text-[#292929] shadow-sm transition hover:bg-[#F7F5F0] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";
// 화면 표시용 단계 줄(동작은 아래 connection·run·prepare 그대로). state: done | active | idle
const BADGE={done:['완료','bg-[#E8F5EC] text-[#2E7D4F]'],active:['진행 중','bg-[#101010] text-white'],idle:['대기 중','bg-[#F2F0EC] text-[#8E8982]']};
function Step({n,title,hint,state,icon,children}) {
 const [label,tone]=BADGE[state],Icon=icon==='send'?Send:Check;
 return <li className="relative" data-state={state}>
  <div className={`flex items-center gap-3 rounded-2xl px-2.5 py-2.5 ${state==='active'?'border border-[#E7E2D9] bg-[#FAF8F5]':'border border-transparent'}`}>
   <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${state==='done'?'bg-[#E8F5EC] text-[#2E7D4F]':'bg-[#F2F0EC] text-[#8E8982]'}`}>{state==='active'?<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true"/>:<Icon className="h-4 w-4" aria-hidden="true"/>}</span>
   <span className="min-w-0 flex-1"><span className="block text-xs font-black text-[#101010]">{String(n).padStart(2,'0')}. {title}</span>{hint&&<span className="block text-[10px] text-[#8E8982]">{hint}</span>}</span>
   <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>{label}</span>
  </div>
  {children&&<div className="ml-[3.25rem] mt-1 space-y-2">{children}</div>}
 </li>;
}
// status 요청은 직렬화하고 세대 번호로 화면 이탈/준비 작업 이전 응답을 무시한다.
function useSnsConnection(platform,browser,paused,onClosed) {
 const name=platform==='threads'?'Threads':'Instagram',isInstagram=platform==='instagram';
 const [state,setState]=useState({text:`${name} 로그인 연결을 눌러 주세요.`,checking:false});
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
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[browser,setBrowser]=useState('auto'),[attach,setAttach]=useState(true),[exported,setExported]=useState(null);
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
 const stateOf=(done,active)=>done?'done':active?'active':'idle';
 return <section className="space-y-4 rounded-3xl border border-[#DDD6CB] bg-white/90 p-5 shadow-sm" data-testid="platform-delivery">
  <div>
   <p className="text-sm font-black text-[#101010]">{sns?`${name} 로컬 앱 연결`:'이미지 내보내기'}</p>
   <p className="mt-0.5 text-[11px] text-[#8E8982]">{sns?'계정 연결과 작성창 채우기 순서로 진행 상태를 확인하세요. 게시 버튼은 누르지 않습니다.':'카드 JPG를 확인하고 내보냅니다.'}</p>
  </div>
  {sns&&<div className="flex items-center justify-between rounded-2xl bg-[#101010] px-4 py-3 text-white">
   <span className="text-xs font-black">{name} 로컬 앱 {connection.state.connected?'연결됨':'연결 전'}</span>
   <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold">{connection.state.checking?'확인 중':connection.state.connected?'연결 중':'대기'}</span>
  </div>}
  <ol className="relative space-y-3 pl-1">
   <span className="absolute bottom-4 left-[19px] top-4 w-px bg-[#E7E2D9]" aria-hidden="true" />
   {sns&&<Step n={1} title={`${name} 로그인 연결`} state={stateOf(connection.state.connected,connection.state.checking)}>
    {platform==='instagram'?<p className="text-xs text-[#57514A]">Instagram 전용 브라우저: <span className="font-semibold text-[#101010]">Chrome</span></p>:<label className="text-xs text-[#57514A]">로그인 브라우저 <select aria-label="SNS 브라우저" disabled={blocked||connection.state.checking} value={browser} onChange={e=>setBrowser(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#E7E2D9] px-2 py-1 text-xs"><option value="auto">자동 (Chrome → Edge → Chromium)</option><option value="chrome">Chrome</option><option value="msedge">Edge</option><option value="chromium">Chromium</option></select></label>}
    <div className="pt-1.5">
     <button className={`${button} w-full`} disabled={blocked||connection.state.checking} data-testid={`${platform}-connect`} onClick={()=>connection.start()}>{name} 로그인 연결</button>
    </div>
    <p role="status" data-testid={`${platform}-connection-status`} className="text-xs text-[#8E8982]">{connection.state.text}</p>
   </Step>}
   {!sns&&readiness.total>0&&<Step n={1} title="카드 JPG 준비" state={stateOf(readiness.complete,blocked&&!readiness.complete)}>
    <p role="status" data-testid="cards-jpg-status" className="text-xs">{readiness.complete?'카드 JPG 준비 완료':blocked?'카드뉴스 JPG 확인 중':'카드뉴스 JPG 준비 필요'} · 최신 JPG {readiness.ready}/{readiness.total}장 · 원고 검수·SNS 입력과 별도</p>
    {readiness.items.filter(item=>item.error).map(item=><p role="alert" key={item.index} className="text-xs text-rose-700">{item.index+1}번 카드: {item.error}</p>)}
    <div className="flex flex-col gap-2 pt-1.5">
     <button className={`${buttonSecondary} w-full`} disabled={blocked||!currentCards} data-testid="cards-check" onClick={()=>run(()=>renderAll(structuredClone(live.current)))}>JPG 준비 확인</button>
     <button className={`${button} w-full`} disabled={blocked||!currentCards} data-testid="cards-export" onClick={exportAll}>전체 카드 JPG 내보내기</button>
    </div>
   </Step>}
   {sns&&<Step n={2} title={`${name} 작성창 채우기`} state={stateOf(prepared,busy&&!prepared)}>
    <p data-testid="sns-review-status" className="text-xs text-[#57514A]">현재 원고: <span className="font-semibold">{currentDraft?reviewLabel(reviewStatus(draft)):'이전 원문 결과'}</span> · 카드: <span className="font-semibold">{cards&&!currentCards?'이전 원문 결과':reviewLabel(reviewStatus(cards))}</span>. 준비는 게시하지 않습니다. 검수 상태를 확인하고 사람이 최종 검토합니다.</p>
    {(!currentDraft||(attach&&cards&&!currentCards))&&<p role="alert" className="text-xs text-amber-700">이전 원문 결과는 보존되어 있습니다. 현재 원문·같은 고정본의 결과로 SNS 작성창을 채워 주세요.</p>}
    {attach&&currentDraft&&currentCards&&!sameBundle&&<p role="alert" className="text-xs text-amber-700">원문은 같지만 원고와 카드의 고정본이 다릅니다. 같은 생성 작업의 결과를 함께 사용해 주세요. 기존 결과는 보존됩니다.</p>}
    {evidenceMismatch&&<div role="alert" data-testid="evidence-warning" className="space-y-1 text-xs text-amber-700"><p>원문과 일치하지 않는 근거가 표시되어 있습니다. 기사에 없는 인용이 SNS 작성창에 들어갈 수 있으니 확인한 뒤 진행해 주세요.</p><label className="flex items-center gap-1.5"><input type="checkbox" data-testid="evidence-ack" checked={evidenceAck} disabled={blocked} onChange={e=>setEvidenceAck(e.target.checked)}/> 근거가 원문과 일치하지 않음을 확인했고, 그대로 작성창을 채웁니다.</label></div>}
    <div className="space-y-2.5 pt-2">
     <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#292929] cursor-pointer">
      <input type="checkbox" className="h-4 w-4 rounded accent-[#292929]" checked={attach} disabled={blocked} onChange={e=>setAttach(e.target.checked)}/> 현재 카드뉴스 첨부
     </label>
     <button className={`${button} w-full`} disabled={blocked||connection.state.checking||!currentDraft||(attach&&cards&&(!currentCards||!sameBundle))||(evidenceMismatch&&!evidenceAck)} data-testid="sns-prepare" onClick={prepare}>{name} 작성창 채우기</button>
    </div>
   </Step>}
   {sns&&<Step n={3} icon="send" title="게시 준비 완료" hint="전용 창에서 사진 순서·줄바꿈을 확인한 뒤 사람이 직접 게시합니다." state={stateOf(prepared,false)} />}
  </ol>
  {message&&<p role="status" className="whitespace-pre-wrap rounded-xl bg-[#FAF8F5] px-3 py-2 text-[11px] leading-5 text-[#57514A]" data-testid="delivery-status">{message}</p>}
  {!sns&&<ExportNotice result={exported} kind="cards"/>}
 </section>;
}
