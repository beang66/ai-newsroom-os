import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {renderStoredCard,snsAction,storedJpg} from "../api/platform.js";
import {assertSameSource,draftText,fingerprint,reviewLabel,reviewStatus,sourceText,sameGenerationSource,articleId} from "../lib/platformState.js";
import {cardImageReadiness,prepareCardImages} from '../lib/cardPreparation.js';

const button="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50";
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
     setState({text:`${isInstagram?'Chrome':({chrome:'Chrome',msedge:'Edge',chromium:'Chromium'}[result.browser]||'브라우저 확인 필요')} 로그인 연결됨 · ${result.username?'계정 이름 확인됨':'계정 이름 확인 필요'}${result.pending?.status==='ready'?' · 기존 작성창을 유지하고 있습니다.':''}`,checking:false});
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
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[browser,setBrowser]=useState('auto'),[attach,setAttach]=useState(true),[downloads,setDownloads]=useState([]);
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
  const links=[];
  for(const [index,asset] of assets.entries()){
   try{
    const blob=await storedJpg(asset);
    if(!mounted.current||expected!==exportKey(live.current))throw Error('JPG 읽기 중 기사·원고·카드·사진이 바뀌었습니다. 최신 결과로 다시 내보내 주세요.');
    const url=URL.createObjectURL(blob),name=`card_${String(index+1).padStart(2,'0')}.jpg`;
    links.push({url,name});
   }catch(error){setDownloads(links);throw Error(`${index+1}번 카드 JPG 읽기 실패: ${error.message} 다시 내보내기를 눌러 재시도해 주세요.`);}
  }
  downloads.forEach(item=>URL.revokeObjectURL(item.url));setDownloads(links);
  links.forEach(item=>{const a=document.createElement('a');a.href=item.url;a.download=item.name;a.click();});
  setMessage(`${links.length}장 JPG 다운로드를 요청했습니다. 브라우저가 여러 다운로드를 막으면 아래 카드별 링크를 누르세요. Core 보관과 사용자 폴더 내보내기는 별도입니다.`);
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
 return <section className="my-4 space-y-3 rounded-2xl border border-[#DDD6CB] p-4" data-testid="platform-delivery">
  <p className="text-sm font-bold">이미지 내보내기 · SNS 작성창 준비</p>
  {readiness.total>0&&<>
   <p role="status" data-testid="cards-jpg-status" className="text-xs">{readiness.complete?'카드 JPG 준비 완료':blocked?'카드뉴스 JPG 확인 중':'카드뉴스 JPG 준비 필요'} · 최신 JPG {readiness.ready}/{readiness.total}장 · 원고 검수·SNS 입력과 별도</p>
   {readiness.items.filter(item=>item.error).map(item=><p role="alert" key={item.index} className="text-xs text-rose-700">{item.index+1}번 카드: {item.error}</p>)}
   <button className={button} disabled={blocked||!currentCards} data-testid="cards-check" onClick={()=>run(()=>renderAll(structuredClone(live.current)))}>JPG 준비 확인</button>
   <button className={button} disabled={blocked||!currentCards} data-testid="cards-export" onClick={exportAll}>전체 카드 JPG 내보내기</button>
  </>}
  {['instagram','threads'].includes(platform)&&draft&&<>
   <p data-testid="sns-review-status" className="text-xs">현재 원고: {currentDraft?reviewLabel(reviewStatus(draft)):'이전 원문 결과'} · 카드: {cards&&!currentCards?'이전 원문 결과':reviewLabel(reviewStatus(cards))}. 준비는 게시하지 않습니다. 검수 상태를 확인하고 사람이 최종 검토합니다.</p>
   {(!currentDraft||(attach&&cards&&!currentCards))&&<p role="alert" className="text-xs text-amber-700">이전 원문 결과는 보존되어 있습니다. 현재 원문·같은 고정본의 결과로 SNS 작성창을 채워 주세요.</p>}
   {attach&&currentDraft&&currentCards&&!sameBundle&&<p role="alert" className="text-xs text-amber-700">원문은 같지만 원고와 카드의 고정본이 다릅니다. 같은 생성 작업의 결과를 함께 사용해 주세요. 기존 결과는 보존됩니다.</p>}
   {evidenceMismatch&&<div role="alert" data-testid="evidence-warning" className="space-y-1 text-xs text-amber-700"><p>원문과 일치하지 않는 근거가 표시되어 있습니다. 기사에 없는 인용이 SNS 작성창에 들어갈 수 있으니 확인한 뒤 진행해 주세요.</p><label className="flex items-center gap-1.5"><input type="checkbox" data-testid="evidence-ack" checked={evidenceAck} disabled={blocked} onChange={e=>setEvidenceAck(e.target.checked)}/> 근거가 원문과 일치하지 않음을 확인했고, 그대로 작성창을 채웁니다.</label></div>}
   {platform==='instagram'?<p className="text-xs">Instagram 전용 브라우저: Chrome</p>:<label className="text-xs">로그인 브라우저 <select aria-label="SNS 브라우저" disabled={blocked||connection.state.checking} value={browser} onChange={e=>setBrowser(e.target.value)}><option value="auto">자동 (Chrome → Edge → Chromium)</option><option value="chrome">Chrome</option><option value="msedge">Edge</option><option value="chromium">Chromium</option></select></label>}
   <button className={button} disabled={blocked||connection.state.checking} data-testid={`${platform}-connect`} onClick={()=>connection.start()}>{platform==='threads'?'Threads':'Instagram'} 로그인 연결</button>
   <p role="status" data-testid={`${platform}-connection-status`} className="text-xs">{connection.state.text}</p>
   <label className="text-xs"><input type="checkbox" checked={attach} disabled={blocked} onChange={e=>setAttach(e.target.checked)}/> 현재 카드뉴스 첨부</label><button className={button} disabled={blocked||connection.state.checking||!currentDraft||(attach&&cards&&(!currentCards||!sameBundle))||(evidenceMismatch&&!evidenceAck)} data-testid="sns-prepare" onClick={prepare}>{platform==='threads'?'Threads':'Instagram'} 작성창 채우기</button>
  </>}
  {message&&<p role="status" className="whitespace-pre-wrap text-xs" data-testid="delivery-status">{message}</p>}
  {downloads.map(item=><a className="mr-3 text-xs underline" key={item.url} href={item.url} download={item.name}>{item.name}</a>)}
 </section>;
}
