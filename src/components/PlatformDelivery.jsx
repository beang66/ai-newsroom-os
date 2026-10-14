import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {Check,Download,ExternalLink,Loader2,Send} from "lucide-react";
import {renderStoredCard,snsAction,storedJpg} from "../api/platform.js";
import {assertSameSource,currentRender,draftText,fingerprint,reviewLabel,reviewStatus,selectedCardPhoto,sourceText} from "../lib/platformState.js";

const button="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50";
export default function PlatformDelivery({platform,draft,cards,article,onCards}) {
 const [open,setOpen]=useState(false),[steps,setSteps]=useState({}),[current,setCurrent]=useState(''); // 화면 표시용(연결 펼침·단계 완료 표시)
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[browser,setBrowser]=useState('auto'),[attach,setAttach]=useState(true),[downloads,setDownloads]=useState([]);
 const live=useRef({platform,draft,cards,article});useLayoutEffect(()=>{live.current={platform,draft,cards,article};},[platform,draft,cards,article]);
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const run=async work=>{setBusy(true);setMessage('');try{await work();}catch(error){setMessage(error.message);}finally{setBusy(false);}};
 const renderAll=async(capture)=>{
  assertSameSource(capture.cards,null,capture.article);
  const source=sourceText(capture.article),expected=fingerprint({draft:capture.draft,cards:capture.cards,photos:capture.article.photos});
  const unchanged=()=>mounted.current&&source===sourceText(live.current.article)&&expected===fingerprint({draft:live.current.draft,cards:live.current.cards,photos:live.current.article.photos});
  const assets=[];
  for(const [index,card] of (capture.cards?.cards||[]).entries()){
   try{
    if(!unchanged())throw Error('원고·사진·카드가 바뀌었습니다.');
    setMessage(`최신 카드 이미지 준비 ${index+1}/${capture.cards.cards.length}장`);
    const photo=selectedCardPhoto(card,capture.article);
    const rendered=currentRender(card,photo,capture.cards)||await renderStoredCard(card,capture.article,capture.cards);
    if(!unchanged())throw Error('렌더 도중 원고·사진·카드가 바뀌었습니다.');
    const image=rendered;
    onCards(current=>({...current,cards:current.cards.map(item=>item.card_id===card.card_id?{...item,rendered_image:image}:item)}));
    // 렌더 메타데이터 갱신은 검수나 편집 변경으로 보지 않는다.
    assets.push({...image,order:index+1});
   }catch(error){throw Error(`${index+1}번 카드 (${card.content?.headline||card.headline||'제목 없음'}) 실패: ${error.message} 완료된 이미지는 보관됐습니다. 실패 카드를 수정하고 같은 버튼으로 다시 시도해 주세요. SNS에는 일부 카드만 첨부하지 않았습니다.`);}
  }
  return assets;
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
  if(platform==='instagram'&&!hasCards)throw Error('Instagram은 카드 이미지가 필요합니다. 카드뉴스를 포함해 주세요.');
  const expected=fingerprint({draft:capture.draft,cards:capture.cards,photos:capture.article.photos}),source=sourceText(capture.article);
  const assets=hasCards?await renderAll(capture):[];
  if(expected!==fingerprint({draft:live.current.draft,cards:live.current.cards,photos:live.current.article.photos})||source!==sourceText(live.current.article))throw Error('작성 준비 중 원고·카드·사진이 변경됐습니다. 다시 준비해 주세요.');
  const result=await snsAction(platform,'prepare',{text:draftText(platform,capture.draft),assets},capture.draft);
  if(!mounted.current||expected!==fingerprint({draft:live.current.draft,cards:live.current.cards,photos:live.current.article.photos})||source!==sourceText(live.current.article))throw Error('SNS 작성 준비 도중 원고·카드·사진 또는 원본 기사가 바뀌었습니다. 전용 창에는 이전 내용이 있을 수 있습니다. 게시하지 말고 전용 창을 닫아 최신 결과로 다시 준비해 주세요.');
  setMessage(`${result.message}\n연결 계정: ${result.username||'확인 필요'} · 사진 ${result.image_count}장\n원고 ${reviewLabel(reviewStatus(live.current.draft))} · 카드 ${reviewLabel(reviewStatus(live.current.cards))}. 전용 창에서 사진 순서·줄바꿈을 확인해 주세요. 게시 버튼은 누르지 않았습니다.`);
 });
 // 화면 표시용 진행 상태(동작은 위 run·prepare·exportAll 그대로): 각 단계가 성공하면 완료로 표시한다
 const sns=['instagram','threads'].includes(platform)&&draft;
 const name=platform==='threads'?'Threads':'Instagram',post=platform==='threads'?'타래':'게시물';
 const prepared=/게시 버튼은 누르지 않았습니다/.test(message);
 const stateOf=(key)=>steps[key]?'완료':busy&&current===key?'진행 중':'대기 중';
 const badge={'완료':'bg-[#E8F5EC] text-[#2E7D4F]','진행 중':'bg-[#101010] text-white','대기 중':'bg-[#F2F0EC] text-[#8E8982]'};
 const flow=[
  {key:'connect',title:`${name} 계정 연결`,hint:'전용 창에서 계정을 연결합니다.',icon:'check',onClick:()=>{setCurrent('connect');run(async()=>{const result=await snsAction(platform,'connect',{browser});setMessage(result.message);setSteps(v=>({...v,connect:true}));});}},
  {key:'status',title:'로그인 상태 확인',hint:`전용 ${name} 창의 로그인 상태를 확인합니다.`,icon:'check',onClick:()=>{setCurrent('status');run(async()=>{const result=await snsAction(platform,'status');setMessage(result.connected?`연결 계정: ${result.username} · 브라우저: ${result.browser}`:'전용 창에서 로그인한 뒤 다시 확인해 주세요. '+(result.reason||''));if(result.connected)setSteps(v=>({...v,status:true}));});}},
  {key:'prepare',title:`${post}·원고 준비`,hint:`현재 원고와 ${post}의 작성 상태를 확인합니다.`,icon:'check',testid:'sns-prepare',onClick:()=>{setCurrent('prepare');prepare();}},
  {key:'ready',title:'게시 준비 완료',hint:`${post} 게시 전 필수 조건을 확인합니다.`,icon:'send'},
 ];
 const stepsDone={...steps,prepare:prepared||steps.prepare,ready:prepared};
 return sns ? <section className="space-y-3 rounded-[28px] bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.06)]" data-testid="platform-delivery">
  <div>
   <p className="text-sm font-black text-[#101010]">{name} 로컬 앱 연결</p>
   <p className="mt-0.5 text-[11px] text-[#8E8982]">계정 연결부터 {post} 게시 준비까지 진행 상태를 확인하세요.</p>
  </div>
  {!open ? <button type="button" onClick={()=>setOpen(true)} className="flex w-full items-center justify-between rounded-2xl border border-[#E7E2D9] bg-[#FAF8F5] px-4 py-3 text-left text-xs font-bold text-[#292929] shadow-sm cursor-pointer hover:bg-white">연결 시작하기<span className="rounded-full bg-[#EFECE6] px-2.5 py-1 text-[10px] font-bold text-[#57514A]">시작</span></button> : <>
   <div className="flex items-center justify-between rounded-2xl bg-[#101010] px-4 py-3 text-white">
    <span className="text-xs font-black">{name} 로컬 앱 {steps.connect?'연결됨':'연결'}</span>
    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold">{busy?'연결 중':steps.connect?'연결 중':'대기'}</span>
   </div>
   <label className="flex items-center gap-2 px-1 text-[11px] text-[#8E8982]"><span className="shrink-0 whitespace-nowrap">로그인 브라우저</span><select aria-label="SNS 브라우저" value={browser} onChange={e=>setBrowser(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-[#E7E2D9] bg-white px-1.5 py-1 text-[11px] text-[#292929]"><option value="auto">자동 (Chrome → Edge → Chromium)</option><option value="chrome">Chrome</option><option value="msedge">Edge</option><option value="chromium">Chromium</option></select></label>
   <ol className="relative space-y-2 pl-1">
    <span className="absolute bottom-4 left-[19px] top-4 w-px bg-[#E7E2D9]" aria-hidden="true" />
    {flow.map((step,index)=>{const state=step.key==='prepare'||step.key==='ready'?(stepsDone[step.key]?'완료':busy&&current===step.key?'진행 중':'대기 중'):stateOf(step.key);const Tag=step.onClick?'button':'div';return <li key={step.key} className="relative">
     <Tag {...(step.onClick?{type:'button',disabled:busy,onClick:step.onClick}:{})} data-testid={step.testid} className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition ${state==='진행 중'?'border border-[#E7E2D9] bg-[#FAF8F5]':'border border-transparent'} ${step.onClick?'cursor-pointer hover:bg-[#FAF8F5] disabled:cursor-wait':''}`}>
      <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${state==='완료'?'bg-[#E8F5EC] text-[#2E7D4F]':'bg-[#F2F0EC] text-[#8E8982]'}`}>{state==='진행 중'?<Loader2 className="h-4 w-4 animate-spin" />:step.icon==='send'?<Send className="h-4 w-4" />:<Check className="h-4 w-4" />}</span>
      <span className="min-w-0 flex-1"><span className="block text-xs font-black text-[#101010]">{String(index+1).padStart(2,'0')}. {step.title}</span><span className="block text-[10px] text-[#8E8982]">{step.hint}</span></span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge[state]}`}>{state}</span>
     </Tag>
     {step.key==='prepare'&&<label className="ml-12 mt-1 flex items-center gap-1.5 text-[11px] text-[#8E8982]"><input type="checkbox" checked={attach} onChange={e=>setAttach(e.target.checked)}/> 현재 카드뉴스 첨부</label>}
    </li>;})}
   </ol>
   <p data-testid="sns-review-status" className="px-1 text-[10px] leading-4 text-[#B0AAA2]">현재 원고: {reviewLabel(reviewStatus(draft))} · 카드: {reviewLabel(reviewStatus(cards))}. 준비는 게시하지 않습니다. 검수 상태를 확인하고 사람이 최종 검토합니다.</p>
   <button type="button" disabled={busy} onClick={()=>{setCurrent('close');run(async()=>{await snsAction(platform,'close');setMessage('전용 창을 닫았습니다. 로그인 프로필은 다음 연결에 사용합니다.');setSteps({});});}} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#E7E2D9] bg-white px-4 py-3 text-xs font-bold text-[#292929] shadow-sm cursor-pointer hover:bg-[#FAF8F5] disabled:opacity-50"><ExternalLink className="h-4 w-4" />전용 창 닫기 · 로그인 상태는 보존</button>
  </>}
  {cards?.cards?.length>0&&<button type="button" className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#E7E2D9] bg-white px-4 py-2.5 text-xs font-bold text-[#292929] cursor-pointer hover:bg-[#FAF8F5] disabled:opacity-50" disabled={busy} data-testid="cards-export" onClick={exportAll}><Download className="h-4 w-4" />전체 카드 JPG 내보내기</button>}
  {message&&<p role="status" className="whitespace-pre-wrap rounded-xl bg-[#FAF8F5] px-3 py-2 text-[11px] leading-5 text-[#57514A]" data-testid="delivery-status">{message}</p>}
  {downloads.map(item=><a className="mr-3 text-xs underline" key={item.url} href={item.url} download={item.name}>{item.name}</a>)}
 </section> : <section className="my-4 space-y-3 rounded-2xl border border-[#DDD6CB] p-4" data-testid="platform-delivery">
  <p className="text-sm font-bold">이미지 내보내기 · SNS 작성창 준비</p>
  {cards?.cards?.length>0&&<button className={button} disabled={busy} data-testid="cards-export" onClick={exportAll}>전체 카드 JPG 내보내기</button>}
  {['instagram','threads'].includes(platform)&&draft&&<>
   <p data-testid="sns-review-status" className="text-xs">현재 원고: {reviewLabel(reviewStatus(draft))} · 카드: {reviewLabel(reviewStatus(cards))}. 준비는 게시하지 않습니다. 검수 상태를 확인하고 사람이 최종 검토합니다.</p>
   <label className="text-xs">로그인 브라우저 <select aria-label="SNS 브라우저" value={browser} onChange={e=>setBrowser(e.target.value)}><option value="auto">자동 (Chrome → Edge → Chromium)</option><option value="chrome">Chrome</option><option value="msedge">Edge</option><option value="chromium">Chromium</option></select></label>
   <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={()=>run(async()=>{const result=await snsAction(platform,'connect',{browser});setMessage(result.message);})}>전용 창에서 로그인</button><button className={button} disabled={busy} onClick={()=>run(async()=>{const result=await snsAction(platform,'status');setMessage(result.connected?`연결 계정: ${result.username} · 브라우저: ${result.browser}`:'전용 창에서 로그인한 뒤 다시 확인해 주세요. '+(result.reason||''));})}>로그인 연결 확인</button><button className={button} disabled={busy} onClick={()=>run(async()=>{await snsAction(platform,'close');setMessage('전용 창을 닫았습니다. 로그인 프로필은 다음 연결에 사용합니다.');})}>전용 창 닫기</button></div>
   <label className="text-xs"><input type="checkbox" checked={attach} onChange={e=>setAttach(e.target.checked)}/> 현재 카드뉴스 첨부</label><button className={button} disabled={busy} data-testid="sns-prepare" onClick={prepare}>현재 원고·카드로 작성창 준비</button>
  </>}
  {message&&<p role="status" className="whitespace-pre-wrap text-xs" data-testid="delivery-status">{message}</p>}
  {downloads.map(item=><a className="mr-3 text-xs underline" key={item.url} href={item.url} download={item.name}>{item.name}</a>)}
 </section>;
}
