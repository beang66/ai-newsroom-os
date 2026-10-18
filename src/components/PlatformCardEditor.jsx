import {Component,useEffect,useLayoutEffect,useRef,useState} from "react";
import PhotoSearch from "./photo/PhotoSearch.jsx";
import ImageEditor from "./photo/ImageEditor.jsx";
import {importPhoto,dongaPhotoData,trackPhotoDownload,exportFiles,imageExtension} from "../api/editorial.js";
import ExportNotice from "./ExportNotice.jsx";
import {blobToDataUrl,photoDataUrl,renderStoredCard} from "../api/platform.js";
import {articleId,fingerprint,invalidateDraft,renderKey,selectedCardPhoto,currentRender,sourceText} from "../lib/platformState.js";
import {CardModel,CardTemplate} from "../lib/cardRuntime.js";

const button="rounded-xl border border-[#DDD6CB] bg-white px-3 py-2 text-xs font-bold text-[#292929] hover:bg-[#FAF8F5] disabled:opacity-50";
const LAYOUT_LABEL={standard:"기본형",comparison:"비교형",list:"목록형",steps:"단계형",stat:"수치형"};
const FIELD="mt-1.5 w-full resize-none rounded-lg border border-[#DDD6CB] bg-white px-3 py-2 text-sm font-medium leading-6 text-[#101010] outline-none focus:border-[#292929]";
const articleKey=article=>fingerprint([articleId(article),sourceText(article)]);
class CardPreviewBoundary extends Component {
  state={failed:false,card:this.props.card};
  static getDerivedStateFromProps(props,state){return props.card!==state.card?{failed:false,card:props.card}:null;}
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed
    ?<p role="alert" className="p-4 text-sm text-rose-700">{this.props.page}번 카드 미리보기를 표시하지 못했습니다. 카드 데이터를 확인해 주세요.</p>
    :this.props.children;}
}
function CardPreview({card,index,total,photo,previewPhoto}){
  const frame=useRef(null),[measurement,setMeasurement]=useState(null);
  const signature=fingerprint([card,index,total,previewPhoto?.url]);
  useLayoutEffect(()=>{
    const receive=event=>{if(event.source===frame.current?.contentWindow&&event.data?.type==='card-fit'&&event.data.signature===signature)setMeasurement(event.data);};
    window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
  },[signature]);
  const normalized=CardModel.normalize({...card,image:photo&&previewPhoto?.photo===photo?{...photo,url:previewPhoto.url,photographer:photo.photographer||photo.source,profile:photo.profile||photo.sourceUrl}:undefined,page:index+1,total_pages:total});
  const html='<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0}'+CardTemplate.css+'</style>'+CardTemplate.markup(normalized)+'<script>Promise.all([document.fonts.ready,...[...document.images].map(image=>image.decode())]).then(()=>parent.postMessage({type:"card-fit",signature:'+JSON.stringify(signature).replace(/</g,'\\u003c')+',fit:('+CardTemplate.fitCard.toString()+')()},"*"));</script></html>';
  const fit=measurement?.signature===signature?measurement.fit:null;
  const fields=(fit?.overflowFields||[]).map(field=>({keyword:'키워드',headline:'제목',answer:'핵심 문구',detail:'상세 설명',body:'본문',farewell:'끝인사'})[field]||field).join('·');
  return <div><div className="relative overflow-hidden rounded-2xl bg-black" style={{width:324,height:405}}><iframe ref={frame} title="카드 미리보기" sandbox="allow-scripts" srcDoc={html} style={{width:1080,height:1350,border:0,transform:'scale(.3)',transformOrigin:'top left'}}/></div>
    {fit&&(fit.overflow||fit.overlap)&&<p role="alert" data-testid="card-fit-error" className="mt-2 text-xs text-rose-300">{index+1}번 카드: {fit.overlap?'텍스트 박스 겹침':`글 넘침 (${fields||'본문 영역'}, ${fit.contentHeight}/${fit.availableHeight}px)`}. 문안·위치를 편집한 뒤 JPG 준비를 확인해 주세요.</p>}</div>;
}
export default function PlatformCardEditor({draft,article,onChange,onAddPhoto,preparing=false}) {
  const [activeIndex,setActiveIndex]=useState(0),[rendering,setRendering]=useState(false),[error,setError]=useState("");
  const [searching,setSearching]=useState(false),[editing,setEditing]=useState(null),[exported,setExported]=useState(null);
  const live=useRef({draft,article});useLayoutEffect(()=>{live.current={draft,article};},[draft,article]);
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const cards=Array.isArray(draft?.cards)?draft.cards:[],index=activeIndex<cards.length?activeIndex:0,active=cards[index];
  const invalid=cards.length>0&&(!active||typeof active!=='object'||Array.isArray(active)||typeof active.card_id!=='string'||!active.card_id
    ||(active.content!==undefined&&(!active.content||typeof active.content!=='object'||Array.isArray(active.content))));
  const photo=active&&!invalid?selectedCardPhoto(active,article):null;
  const [previewPhoto,setPreviewPhoto]=useState(null);
  useEffect(()=>{
    let cancelled=false;
    if(photo)photoDataUrl(photo).then(url=>{if(!cancelled)setPreviewPhoto({photo,url});}).catch(e=>{if(!cancelled){setPreviewPhoto(null);setError(e.message);}});
    return()=>{cancelled=true;};
  },[photo]);
  if(draft?.cards!==undefined&&!Array.isArray(draft.cards))return <p role="alert" className="p-6 text-sm text-rose-700">카드 목록 데이터 형식을 확인할 수 없습니다. 생성 결과를 다시 확인해 주세요.</p>;
  if(!cards.length)return <p className="p-6 text-sm">아직 생성된 카드뉴스가 없습니다.</p>;
  if(invalid)return <div className="space-y-3" data-testid="platform-card-editor">
    <div className="flex flex-wrap gap-2">{cards.map((_,i)=><button className={button} key={i} onClick={()=>setActiveIndex(i)} aria-pressed={i===index}>{i+1}번 카드</button>)}</div>
    <p role="alert" className="rounded-xl border border-rose-300 p-4 text-sm text-rose-700">{index+1}번 카드 데이터 형식을 확인할 수 없습니다. 다른 카드는 선택해 확인할 수 있습니다.</p>
  </div>;
  const content=active.content||active;
  const patch=change=>{setError('');onChange(current=>invalidateDraft({...current,cards:current.cards.map(card=>card?.card_id===active.card_id?{...card,...change,validation_status:"needs_recheck"}:card)}));};
  const setField=(key,value)=>patch({content:{...content,[key]:value}});
  const makeImage=async()=>{
    if(cards.some(card=>!card||typeof card!=='object')){setError('다른 카드의 데이터 형식을 먼저 확인해 주세요.');return;}
    const copy=structuredClone(active),origin=structuredClone(draft),key=renderKey(copy,photo,origin),source=sourceText(article);
    setRendering(true);setError("");
    try{
      const rendered=currentRender(copy,photo,origin)||await renderStoredCard(copy,article,origin);
      const now=live.current,current=now.draft?.cards.find(card=>card.card_id===copy.card_id);
      if(!mounted.current||!current||source!==sourceText(now.article)||renderKey(current,selectedCardPhoto(current,now.article),now.draft)!==key)throw Error("이미지 생성 중 카드·사진·원본이 바뀌었습니다. 결과를 적용하지 않았습니다. 다시 만들어 주세요.");
      onChange(current=>({...current,cards:current.cards.map(card=>card.card_id===copy.card_id?{...card,rendered_image:rendered,render_error:undefined}:card)}));
    }catch(e){setError(e.message);}finally{setRendering(false);}
  };
  const choose=async(p,action)=>{
    const cardId=active.card_id,originKey=fingerprint(draft.generation_input),sourceKey=articleKey(article);
    const imported=p.provider==='donga'?{id:'donga-'+p.id,url:await dongaPhotoData(p),caption:p.title,source:'동아일보 DB',provider:'donga',sourceUrl:'https://www.donga.com/archive/newslibrary/list?m=photo'}:await importPhoto(p);
    imported.original=imported.url;
    if(articleKey(live.current.article)!==sourceKey||fingerprint(live.current.draft?.generation_input)!==originKey||!live.current.draft.cards.some(c=>c?.card_id===cardId))throw Error("사진을 가져오는 동안 기사가 바뀌었습니다. 다시 선택해 주세요.");
    if(action==='download'){setExported(await exportFiles('photos',[{data:imported.url,ext:imageExtension(imported.url)}],{title:article?.title,label:'카드사진'}));return;}
    setSearching(false);
    if(action==='edit'){setEditing({photo:imported,cardId,articleKey:sourceKey});return;}
    onAddPhoto(imported,cardId);
  };
  const upload=async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>15*1024*1024){setError("JPEG·PNG·WebP 사진 15MB 이하를 선택해 주세요.");return;}
    const cardId=active.card_id,sourceKey=articleKey(article);
    const url=await blobToDataUrl(file);
    if(articleKey(live.current.article)!==sourceKey){setError('업로드 중 기사가 바뀌었습니다. 다시 선택해 주세요.');return;}
    setEditing({photo:{id:'photo-'+crypto.randomUUID(),url,original:url,caption:file.name,source:'직접 업로드',provider:'upload'},cardId,articleKey:sourceKey});
  };
  const editPhoto=async()=>{const sourceKey=articleKey(article),cardId=active.card_id;try{const url=await photoDataUrl(photo);if(articleKey(live.current.article)!==sourceKey)throw Error('사진을 불러오는 동안 기사가 바뀌었습니다.');setEditing({photo:{...photo,url},cardId,articleKey:sourceKey});}catch(e){setError(e.message);}};
  const modern=active.content_version===2||(active.content_version!==1&&(typeof content.answer==='string'||typeof content.detail==='string'));
  const rendered=cards.every(card=>card&&typeof card==='object')?currentRender(active,photo,draft):null;
  return <div className="space-y-5" data-testid="platform-card-editor">
    <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
      <div className="flex min-w-0 flex-col items-center">
        <div className="rounded-[28px] bg-[#18181B] p-3 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.45)]">
          <CardPreviewBoundary card={active} page={index+1}><CardPreview card={active} index={index} total={cards.length} photo={photo} previewPhoto={previewPhoto}/></CardPreviewBoundary>
        </div>
        <div className="mt-4 flex w-full max-w-[420px] items-center justify-center gap-3 overflow-x-auto px-2 py-2">
          {cards.map((c,i)=>{const on=c===active,head=c?.content?.headline||c?.headline||'제목 없음',key=c?.content?.keyword||c?.keyword||'',body=c?.content?.answer||c?.content?.body||c?.body||c?.content?.detail||c?.detail||'';
            return <button type="button" key={c?.card_id||i} onClick={()=>setActiveIndex(i)} aria-pressed={on} aria-label={`${i+1}번 카드`}
              className={`relative shrink-0 cursor-pointer overflow-hidden rounded-lg text-left transition ${on?'z-10 scale-105 border-2 border-white bg-[#18181B] shadow-[0_12px_28px_rgba(0,0,0,0.35)] ring-1 ring-black/10':'border border-white/5 bg-[#33373D] opacity-85 hover:opacity-100'}`} style={{width:78,height:98}}>
              <span className="pointer-events-none flex h-full select-none flex-col justify-between p-2">
                <span className="flex items-center justify-between gap-1"><span className="max-w-[44px] truncate text-[7.5px] font-medium text-[#9CA3AF]">{key}</span><span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] text-[8px] ${on?'bg-white font-black text-black':'bg-white/20 font-bold text-white'}`}>{i+1}</span></span>
                <span className="my-auto line-clamp-3 break-keep text-[8.5px] font-extrabold leading-[1.25] text-white">{head}</span>
                <span className="line-clamp-2 break-keep text-[6.5px] leading-[1.25] text-[#9CA3AF]">{body}</span>
              </span>
            </button>;})}
        </div>
      </div>
      <div className="min-w-0 space-y-3 rounded-2xl border border-[#E7E2D9] bg-white p-5">
        {['keyword','headline',...(modern?['answer','detail']:['body']),'farewell'].map(key=><label className="block text-xs font-bold text-[#292929]" key={key}>{({keyword:'카드 키워드',headline:'카드 제목',answer:'핵심 문구',detail:'상세 설명',body:'카드 본문',farewell:'끝인사'})[key]}<textarea aria-label={key} rows={key==='detail'||key==='body'?4:2} className={FIELD} value={content[key]||''} onChange={e=>setField(key,e.target.value)}/></label>)}
        <label className="block text-xs font-bold text-[#292929]">정보 배치 <select aria-label="카드 정보 배치" className="mt-1.5 block w-full rounded-lg border border-[#DDD6CB] bg-white px-3 py-2 text-sm font-medium text-[#101010]" value={active.design?.layout||'standard'} onChange={e=>patch({design:{...active.design,layout:e.target.value}})}>{['standard','comparison','list','steps','stat'].map(value=><option key={value} value={value}>{LAYOUT_LABEL[value]||value}</option>)}</select></label>
        <details className="rounded-lg border border-[#EFECE6] px-3 py-2"><summary className="cursor-pointer text-xs font-bold text-[#57514A]">텍스트 위치 조정</summary>{['headline',...(modern?['answer','detail']:['body'])].map(field=><div className="flex gap-2 text-xs" key={field}>{field}{['x','y'].map(axis=><label key={axis}>{axis}<input type="number" min={axis==='x'?-1080:-1350} max={axis==='x'?1080:1350} aria-label={field+' '+axis} value={active.text_positions?.[field]?.[axis]||0} onChange={e=>patch({text_positions:{...active.text_positions,[field]:{...active.text_positions?.[field],[axis]:Number(e.target.value)}}})}/></label>)}</div>)}<button className={button} onClick={()=>patch({text_positions:{}})}>위치 초기화</button></details>
        <div className="space-y-2 border-t border-[#F0EFEA] pt-4">
          <p className="text-xs font-black text-[#101010]">이미지 첨부 <span className="font-normal text-[#B0AAA2]">카드 배경 적용</span></p>
          <div className="flex flex-wrap gap-2"><select aria-label="기사 사진 사용" className="min-w-0 flex-1 rounded-lg border border-[#DDD6CB] bg-white px-2 py-2 text-xs text-[#292929]" value={active.photoId||''} onChange={e=>patch({photoId:e.target.value,image:undefined})}><option value="">사진 없음</option>{(article.photos||[]).map(p=><option value={p.id} key={p.id}>{p.caption||p.source||p.id}</option>)}</select><button className={button} onClick={()=>setSearching(true)}>현재 카드 사진 찾기</button><label className={`${button} cursor-pointer`}>사진 업로드<input aria-label="카드 사진 업로드" className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={upload}/></label>{photo&&<button className={button} onClick={editPhoto}>사진 편집</button>}</div>
          {photo&&<p className="text-[11px] text-[#8E8982]">사진 출처: {photo.source||photo.photographer||photo.provider||'출처 미입력'} {photo.sourceUrl&&<a className="underline" href={photo.sourceUrl} target="_blank" rel="noreferrer">원본 출처</a>}</p>}
        </div>
        <section data-testid="card-image-section" className="border-t border-[#F0EFEA] pt-4"><button className={button} data-testid="card-image-make" disabled={rendering||preparing} onClick={makeImage}>{rendering?'이미지 생성 중…':'카드 이미지 만들기'}</button><p className="mt-2 text-[11px] text-[#8E8982]">{rendered?'현재 카드 이미지를 Core 암호화 보관소에 보관했습니다.':active.rendered_image?'카드·사진·위치가 변경됐습니다. 이미지를 다시 만들어 주세요.':'이미지를 만들어 암호화 보관소에 보관합니다. JPG 내보내기는 별도입니다.'}</p>{rendered&&<img data-testid="card-image-preview" src={rendered.uri} alt={`${content.headline||'카드'} 완성 이미지`} className="mt-2 max-w-[220px] rounded-lg"/>}</section>
        {error&&<p role="alert" data-testid="card-image-error" className="text-xs text-rose-700">{error}</p>}
        <ExportNotice result={exported} kind="photos"/>
      </div>
    </div>
    {searching&&<PhotoSearch body={article.content} card={active} onClose={()=>setSearching(false)} onChoose={choose}/>}
    {editing&&<ImageEditor photo={editing.photo} onCancel={()=>setEditing(null)} onError={message=>setError(message)} onTrackDownload={()=>editing.photo.unsplashId?trackPhotoDownload(editing.photo.unsplashId):Promise.resolve()} onApply={p=>{if(articleKey(live.current.article)!==editing.articleKey){setError('편집 중 기사가 바뀌었습니다. 다시 선택해 주세요.');setEditing(null);return;}onAddPhoto(p,editing.cardId);setEditing(null);}}/>}
  </div>;
}
