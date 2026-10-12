import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {renderStoredCard,snsAction,storedJpg} from "../api/platform.js";
import {assertSameSource,currentRender,draftText,fingerprint,reviewLabel,reviewStatus,selectedCardPhoto,sourceText} from "../lib/platformState.js";

const button="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50";
export default function PlatformDelivery({platform,draft,cards,article,onCards}) {
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
 return <section className="my-4 space-y-3 rounded-2xl border border-[#DDD6CB] p-4" data-testid="platform-delivery">
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
