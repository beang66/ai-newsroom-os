import {Component,useEffect,useLayoutEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUp,Blend,Image as ImageIcon,LayoutGrid,Layers,RotateCcw,Square} from "lucide-react";
import PhotoSearch from "./photo/PhotoSearch.jsx";
import {importPhoto,dongaPhotoData,trackPhotoDownload,exportFiles,imageExtension} from "../api/editorial.js";
import ExportNotice from "./ExportNotice.jsx";
import {blobToDataUrl,photoDataUrl,renderStoredCard} from "../api/platform.js";
import {articleId,fingerprint,invalidateDraft,renderKey,selectedCardPhoto,currentRender,sourceText} from "../lib/platformState.js";
import {CardModel,CardTemplate} from "../lib/cardRuntime.js";
import {cardFrameEditor} from "../lib/cardFrameEditor.js";
import {droppedFiles,hasDroppedFiles} from "../lib/fileDrop.js";

const button="rounded-xl border border-[#DDD6CB] bg-white px-3 py-2 text-xs font-bold text-[#292929] hover:bg-[#FAF8F5] disabled:opacity-50";
const LAYOUT_LABEL={standard:"기본형",comparison:"비교형",list:"목록형",steps:"단계형",stat:"수치형"};
const FIELD="mt-1.5 w-full resize-none rounded-lg border border-[#DDD6CB] bg-white px-3 py-2 text-sm font-medium leading-6 text-[#101010] outline-none focus:border-[#292929]";
const photoKey=photo=>photo?.id||photo?.url||photo?.data||'';
const articleKey=article=>fingerprint([articleId(article),sourceText(article)]);
class CardPreviewBoundary extends Component {
  state={failed:false,card:this.props.card};
  static getDerivedStateFromProps(props,state){return props.card!==state.card?{failed:false,card:props.card}:null;}
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed
    ?<p role="alert" className="p-4 text-sm text-rose-700">{this.props.page}번 카드 미리보기를 표시하지 못했습니다. 카드 데이터를 확인해 주세요.</p>
    :this.props.children;}
}
const TEXT_FIELDS=['keyword','headline','body','answer','detail','farewell','service_message'];
// 글·위치(text)와 그 밖의 구조(struct)를 나눠 키를 만든다. 글·위치는 iframe 안에서 직접 고치므로 iframe 을 다시 만들지 않고,
// 구조(사진·배치·역할 등)나 바깥(입력창 등)에서 바뀐 글·위치만 iframe 을 새로 만든다.
const textKeyOf=card=>{const n=CardModel.normalize(card);return fingerprint([n.keyword,n.headline,n.body,n.answer,n.detail,n.farewell,n.service_message,n.text_positions]);};
const structKeyOf=(n,index,total)=>fingerprint([n.role,n.design,n.image,n.show_keyword,n.content_version,n.closing_type,n.auto_fit,index,total]);
let frameSeq=0;
function CardPreview({card,index,total,photo,previewPhoto,onEdit,onMove}){
  const frame=useRef(null),[measurement,setMeasurement]=useState(null),[,tick]=useState(0);
  const normalized=CardModel.normalize({...card,image:photo&&previewPhoto&&previewPhoto.key===photoKey(photo)?{...photo,url:previewPhoto.url,photographer:photo.photographer||photo.source,profile:photo.profile||photo.sourceUrl}:undefined,page:index+1,total_pages:total});
  const structKey=structKeyOf(normalized,index,total),textKey=textKeyOf(card);
  const shown=useRef({id:0,structKey:null,textKey:null,html:''}),current=shown.current;
  if(current.structKey!==structKey||current.textKey!==textKey){
    const id=++frameSeq;
    current.id=id;current.structKey=structKey;current.textKey=textKey;
    current.html='<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0}'+CardTemplate.css+'</style>'+CardTemplate.markup(normalized,true)
      +'<script>(function(){const fitCard='+CardTemplate.fitCard.toString()+';Promise.all([document.fonts.ready,...[...document.images].map(image=>image.decode())]).then(()=>('+cardFrameEditor.toString()+')('+id+',fitCard));})();</script></html>';
  }
  const live=useRef({});live.current={card,onEdit,onMove};
  useEffect(()=>{
    const receive=event=>{
      if(event.source!==frame.current?.contentWindow)return;
      const message=event.data;
      if(!message||message.frameId!==shown.current.id)return; // 카드·기사 전환 뒤 도착한 오래된 이벤트는 버린다
      if(message.type==='card-fit'){setMeasurement({frameId:message.frameId,fit:message.fit});return;}
      const {card:now,onEdit:edit,onMove:move}=live.current;
      if(message.type==='card-edit'&&TEXT_FIELDS.includes(message.field)&&typeof message.text==='string'){
        shown.current.textKey=textKeyOf({...now,content:{...(now.content||now),[message.field]:message.text}});
        edit(message.field,message.text);
      }else if(message.type==='card-move'&&TEXT_FIELDS.includes(message.field)&&Number.isFinite(message.x)&&Number.isFinite(message.y)){
        shown.current.textKey=textKeyOf({...now,text_positions:{...CardModel.positions(now.text_positions),[message.field]:{x:message.x,y:message.y}}});
        move(message.field,{x:message.x,y:message.y});
      }else if(message.type==='card-commit'){shown.current.textKey=null;tick(n=>n+1);}
    };
    const release=()=>frame.current?.contentWindow?.postMessage({type:'card-pointer-up'},'*');
    window.addEventListener('message',receive);window.addEventListener('pointerup',release);
    return()=>{window.removeEventListener('message',receive);window.removeEventListener('pointerup',release);};
  },[]);
  const fit=measurement?.frameId===current.id?measurement.fit:null;
  const fields=(fit?.overflowFields||[]).map(field=>({keyword:'키워드',headline:'제목',answer:'핵심 문구',detail:'상세 설명',body:'본문',farewell:'끝인사'})[field]||field).join('·');
  return <div><div className="relative overflow-hidden rounded-2xl bg-black" style={{width:432,height:540}}><iframe ref={frame} title="카드 미리보기" sandbox="allow-scripts" srcDoc={current.html} style={{width:1080,height:1350,border:0,transform:'scale(.4)',transformOrigin:'top left'}}/></div>
    {fit&&(fit.overflow||fit.overlap)&&<p role="alert" data-testid="card-fit-error" className="mt-2 text-xs text-rose-300">{index+1}번 카드: {fit.overlap?'텍스트 박스 겹침':`글 넘침 (${fields||'본문 영역'}, ${fit.contentHeight}/${fit.availableHeight}px)`}. 문안·위치를 편집한 뒤 JPG 준비를 확인해 주세요.</p>}</div>;
}
export default function PlatformCardEditor({draft,article,onChange,onAddPhoto,preparing=false}) {
  const [activeIndex,setActiveIndex]=useState(0),[rendering,setRendering]=useState(false),[error,setError]=useState("");
  const [searching,setSearching]=useState(false),[anchor,setAnchor]=useState(null),[layoutAnchor,setLayoutAnchor]=useState(null),[shadeAnchor,setShadeAnchor]=useState(null),[exported,setExported]=useState(null);
  const [uploadDragging,setUploadDragging]=useState(false);
  const live=useRef({draft,article});useLayoutEffect(()=>{live.current={draft,article};},[draft,article]);
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const cards=Array.isArray(draft?.cards)?draft.cards:[],index=activeIndex<cards.length?activeIndex:0,active=cards[index];
  const invalid=cards.length>0&&(!active||typeof active!=='object'||Array.isArray(active)||typeof active.card_id!=='string'||!active.card_id
    ||(active.content!==undefined&&(!active.content||typeof active.content!=='object'||Array.isArray(active.content))));
  const photo=active&&!invalid?selectedCardPhoto(active,article):null;
  const [previewPhoto,setPreviewPhoto]=useState(null);
  useEffect(()=>{
    let cancelled=false;
    if(photo)photoDataUrl(photo).then(url=>{if(!cancelled)setPreviewPhoto({key:photoKey(photo),url});}).catch(e=>{if(!cancelled){setPreviewPhoto(null);setError(e.message);}});
    return()=>{cancelled=true;};
  },[photoKey(photo)]);
  if(draft?.cards!==undefined&&!Array.isArray(draft.cards))return <p role="alert" className="p-6 text-sm text-rose-700">카드 목록 데이터 형식을 확인할 수 없습니다. 생성 결과를 다시 확인해 주세요.</p>;
  if(!cards.length)return <p className="p-6 text-sm">아직 생성된 카드뉴스가 없습니다.</p>;
  if(invalid)return <div className="space-y-3" data-testid="platform-card-editor">
    <div className="flex flex-wrap gap-2">{cards.map((_,i)=><button className={button} key={i} onClick={()=>setActiveIndex(i)} aria-pressed={i===index}>{i+1}번 카드</button>)}</div>
    <p role="alert" className="rounded-xl border border-rose-300 p-4 text-sm text-rose-700">{index+1}번 카드 데이터 형식을 확인할 수 없습니다. 다른 카드는 선택해 확인할 수 있습니다.</p>
  </div>;
  const content=active.content||active;
  const patch=change=>{setError('');onChange(current=>invalidateDraft({...current,cards:current.cards.map(card=>card?.card_id===active.card_id?{...card,...change,validation_status:"needs_recheck"}:card)}));};
  const setField=(key,value)=>patch({content:{...content,[key]:value}});
  // 미리보기 안에서 직접 고친 글·옮긴 위치: 이벤트가 연달아 와도 서로 덮지 않게 현재 카드 기준으로 갱신한다(card_id 로 해당 카드만)
  const patchCard=(change,recheck=true)=>{const id=active.card_id;setError('');onChange(current=>invalidateDraft({...current,cards:current.cards.map(card=>card?.card_id===id?{...card,...change(card),...(recheck?{validation_status:"needs_recheck"}:{})}:card)}));};
  // 사진 그라데이션: 이 카드의 photoPresentation 에만 저장(사진 데이터·출처·편집 정보와 다른 카드는 그대로). 공통 normalizePhoto 로 정규화한다.
  const shade=(key,value)=>patchCard(card=>({photoPresentation:{...CardTemplate.normalizePhoto({presentation:{...photo?.presentation,...card.photoPresentation}}),[key]:value}}),false);
  const shadeReset=()=>patchCard(card=>({photoPresentation:{...CardTemplate.normalizePhoto({presentation:{...photo?.presentation,...card.photoPresentation}}),direction:'bottom',strength:86}}),false);
  const editText=(field,text)=>patchCard(card=>({content:{...(card.content||card),[field]:text}}));
  const movePart=(field,point)=>patchCard(card=>({text_positions:{...CardModel.positions(card.text_positions),[field]:{x:point.x,y:point.y}}}));
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
    onAddPhoto(imported,cardId);
  };
  const uploadFile=async file=>{
    if(!file)return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>15*1024*1024){setError("JPEG·PNG·WebP 사진 15MB 이하를 선택해 주세요.");return;}
    const cardId=active.card_id,sourceKey=articleKey(article),originKey=fingerprint(draft?.generation_input);
    const url=await blobToDataUrl(file);
    if(articleKey(live.current.article)!==sourceKey||fingerprint(live.current.draft?.generation_input)!==originKey){setError('업로드 중 기사가 바뀌었습니다. 다시 선택해 주세요.');return;}
    const photoObj={id:'photo-'+crypto.randomUUID(),url,original:url,caption:file.name,source:'직접 업로드',provider:'upload'};
    onAddPhoto(photoObj,cardId);
    setSearching(false);
  };
  const upload=event=>{const file=event.target.files?.[0];event.target.value='';void uploadFile(file);};
  const modern=active.content_version===2||(active.content_version!==1&&(typeof content.answer==='string'||typeof content.detail==='string'));
  const rendered=cards.every(card=>card&&typeof card==='object')?currentRender(active,photo,draft):null;
  return <div className="space-y-6" data-testid="platform-card-editor">
    <div className="flex flex-col sm:flex-row items-center sm:items-start justify-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <div className="rounded-[28px] bg-[#18181B] p-3 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.45)]">
          <CardPreviewBoundary card={active} page={index+1}><CardPreview card={active} index={index} total={cards.length} photo={photo} previewPhoto={previewPhoto} onEdit={editText} onMove={movePart}/></CardPreviewBoundary>
        </div>
        <button type="button" data-testid="card-reset-positions" onClick={()=>patchCard(()=>({text_positions:{}}))} className="text-[11px] font-bold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline cursor-pointer">텍스트 위치 초기화</button>
      </div>
      <div className="flex flex-row sm:flex-col gap-3 overflow-x-auto sm:overflow-y-auto max-h-[564px] p-1">
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
      <div className="flex flex-col pt-1">
        <button
          type="button"
          onClick={event=>{setAnchor(event.currentTarget.getBoundingClientRect());setSearching(true);}}
          aria-label="이미지 교체"
          title="이미지 교체"
          data-testid="card-photo-modal-btn"
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#DDD6CB] bg-white text-slate-700 shadow-sm transition hover:scale-105 hover:bg-[#FAF8F5] active:scale-95 cursor-pointer"
        >
          <ImageIcon className="h-5 w-5" strokeWidth={1.6} aria-hidden="true"/>
        </button>
        <button
          type="button"
          onClick={event=>setLayoutAnchor(layoutAnchor?null:event.currentTarget.getBoundingClientRect())}
          aria-label="정보 배치 선택"
          aria-expanded={!!layoutAnchor}
          title="정보 배치 선택"
          data-testid="card-layout-btn"
          className="mt-2 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#DDD6CB] bg-white text-slate-700 shadow-sm transition hover:scale-105 hover:bg-[#FAF8F5] active:scale-95 cursor-pointer"
        >
          <LayoutGrid className="h-5 w-5" strokeWidth={1.6} aria-hidden="true"/>
        </button>
        <button
          type="button"
          disabled={!photo}
          onClick={event=>setShadeAnchor(shadeAnchor?null:event.currentTarget.getBoundingClientRect())}
          aria-label="사진 그라데이션"
          aria-expanded={!!shadeAnchor}
          title="사진 그라데이션"
          data-testid="card-shade-btn"
          className="mt-2 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#DDD6CB] bg-white text-slate-700 shadow-sm transition hover:scale-105 hover:bg-[#FAF8F5] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
        >
          <Blend className="h-5 w-5" strokeWidth={1.6} aria-hidden="true"/>
        </button>
      </div>
    </div>
    {/* 입력칸·이미지 첨부·카드 이미지 만들기는 화면에서 숨긴다(카드 썸네일과 이미지 교체 버튼만 표시) */}
    <div data-testid="card-fields" className="hidden min-w-0 space-y-4 rounded-2xl border border-[#E7E2D9] bg-white p-5">
      {['keyword','headline',...(modern?['answer','detail']:['body']),'farewell'].map(key=><label className="block text-xs font-bold text-[#292929]" key={key}>{({keyword:'카드 키워드',headline:'카드 제목',answer:'핵심 문구',detail:'상세 설명',body:'카드 본문',farewell:'끝인사'})[key]}<textarea aria-label={key} rows={key==='detail'||key==='body'?4:2} className={FIELD} value={content[key]||''} onChange={e=>setField(key,e.target.value)}/></label>)}
      <label className="block text-xs font-bold text-[#292929]">정보 배치 <select aria-label="카드 정보 배치" className="mt-1.5 block w-full rounded-lg border border-[#DDD6CB] bg-white px-3 py-2 text-sm font-medium text-[#101010]" value={active.design?.layout||'standard'} onChange={e=>patch({design:{...active.design,layout:e.target.value}})}>{['standard','comparison','list','steps','stat'].map(value=><option key={value} value={value}>{LAYOUT_LABEL[value]||value}</option>)}</select></label>
      <details className="rounded-lg border border-[#EFECE6] px-3 py-2"><summary className="cursor-pointer text-xs font-bold text-[#57514A]">텍스트 위치 조정</summary>{['headline',...(modern?['answer','detail']:['body'])].map(field=><div className="flex gap-2 text-xs" key={field}>{field}{['x','y'].map(axis=><label key={axis}>{axis}<input type="number" min={axis==='x'?-1080:-1350} max={axis==='x'?1080:1350} aria-label={field+' '+axis} value={active.text_positions?.[field]?.[axis]||0} onChange={e=>patch({text_positions:{...active.text_positions,[field]:{x:active.text_positions?.[field]?.x||0,y:active.text_positions?.[field]?.y||0,[axis]:Number(e.target.value)||0}}})}/></label>)}</div>)}<button className={button} onClick={()=>patch({text_positions:{}})}>위치 초기화</button></details>
      <div data-testid="card-photo-dropzone" onDragEnter={event=>{if(hasDroppedFiles(event)){event.preventDefault();setUploadDragging(true);}}} onDragOver={event=>{if(hasDroppedFiles(event)){event.preventDefault();event.dataTransfer.dropEffect='copy';}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget))setUploadDragging(false);}} onDrop={async event=>{event.preventDefault();setUploadDragging(false);await uploadFile((await droppedFiles(event.dataTransfer))[0]);}} className={`space-y-2 border-t pt-4 rounded-xl transition ${uploadDragging?'border-slate-900 bg-slate-100 p-3 ring-2 ring-slate-300':'border-[#F0EFEA]'}`}>
        <p className="text-xs font-black text-[#101010]">이미지 첨부 <span className="font-normal text-[#B0AAA2]">카드 배경 적용</span></p>
        <div className="flex flex-wrap gap-2"><select aria-label="기사 사진 사용" className="min-w-0 flex-1 rounded-lg border border-[#DDD6CB] bg-white px-2 py-2 text-xs text-[#292929]" value={active.photoId||''} onChange={e=>patch({photoId:e.target.value,image:undefined})}><option value="">사진 없음</option>{(article.photos||[]).map(p=><option value={p.id} key={p.id}>{p.caption||p.source||p.id}</option>)}</select><button className={button} onClick={()=>setSearching(true)}>현재 카드 사진 찾기</button><label className={`${button} cursor-pointer`}>사진 업로드<input aria-label="카드 사진 업로드" className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={upload}/></label></div>
        <p className="text-[11px] text-[#8E8982]">JPEG·PNG·WebP 파일을 이 영역에 끌어놓을 수 있습니다.</p>
        {photo&&<p className="text-[11px] text-[#8E8982]">사진 출처: {photo.source||photo.photographer||photo.provider||'출처 미입력'} {photo.sourceUrl&&<a className="underline" href={photo.sourceUrl} target="_blank" rel="noreferrer">원본 출처</a>}</p>}
      </div>
      <section data-testid="card-image-section" className="border-t border-[#F0EFEA] pt-4"><button className={button} data-testid="card-image-make" disabled={rendering||preparing} onClick={makeImage}>{rendering?'이미지 생성 중…':'카드 이미지 만들기'}</button><p className="mt-2 text-[11px] text-[#8E8982]">{rendered?'현재 카드 이미지를 Core 암호화 저장소에 보관했습니다.':active.rendered_image?'카드·사진·위치가 변경됐습니다. 이미지를 다시 만들어 주세요.':'이미지를 만들어 암호화 저장소에 보관합니다. JPG 내보내기는 별도입니다.'}</p>{rendered&&<img data-testid="card-image-preview" src={rendered.uri} alt={`${content.headline||'카드'} 완성 이미지`} className="mt-2 max-w-[220px] rounded-lg"/>}</section>
    </div>
    {error&&<p role="alert" data-testid="card-image-error" className="text-xs text-rose-700">{error}</p>}
    <ExportNotice result={exported} kind="photos"/>
    {layoutAnchor&&(()=>{
      const left=layoutAnchor.right+12,top=Math.max(16,Math.min(layoutAnchor.top-8,window.innerHeight-340));
      const role=active.role||'body',layout=active.design?.layout||'standard';
      const warning=CardModel.layoutError({...active,role,design:{...active.design,layout}});
      // 편집 화면의 변형(transform) 안에서는 fixed 위치가 어긋나 잘리므로 body 로 띄운다
      return createPortal(<div className="fixed inset-0 z-50" onMouseDown={e=>e.target===e.currentTarget&&setLayoutAnchor(null)}>
        <div role="dialog" aria-label="정보 배치 선택" data-testid="card-layout-popover" className="photo-popover fixed w-56 rounded-2xl border border-[#DDD6CB] bg-white p-3 shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)]"
          style={{left,top}}>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-black text-slate-900"><LayoutGrid className="h-4 w-4" strokeWidth={1.6} aria-hidden="true"/>정보 배치</p>
          <div className="space-y-1" role="group" aria-label="카드 정보 배치">
            {Object.entries(LAYOUT_LABEL).map(([id,label])=>{
              const locked=role!=='body'&&id!=='standard',on=layout===id;
              return <button key={id} type="button" disabled={locked} aria-pressed={on} data-testid={'card-layout-'+id}
                onClick={()=>patch({design:{...active.design,layout:id}})}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${on?'border border-slate-900/[0.08] bg-slate-900/[0.08] text-slate-800':'border border-transparent text-slate-500 hover:bg-slate-900/[0.04] hover:text-slate-800'}`}>{label}{on&&<span aria-hidden="true">✓</span>}</button>;
            })}
          </div>
          {role!=='body'&&<p className="mt-2 text-[11px] text-slate-400">표지와 마지막 카드는 기본형만 쓸 수 있습니다.</p>}
          {warning&&<p role="alert" className="mt-2 text-[11px] text-amber-700">{warning}</p>}
        </div>
      </div>,document.body);
    })()}
    {shadeAnchor&&photo&&(()=>{
      const left=shadeAnchor.right+12,top=Math.max(16,Math.min(shadeAnchor.top-8,window.innerHeight-200));
      const p=CardTemplate.normalizePhoto(photo),DIRECTIONS=[['legacy',Layers],['bottom',ArrowDown],['top',ArrowUp],['left',ArrowLeft],['right',ArrowRight],['uniform',Square]],LABEL={legacy:'기존 기본',bottom:'아래쪽 어둡게',top:'위쪽 어둡게',left:'왼쪽 어둡게',right:'오른쪽 어둡게',uniform:'전체 어둡게'};
      return createPortal(<div className="fixed inset-0 z-50" onMouseDown={e=>e.target===e.currentTarget&&setShadeAnchor(null)}>
        <div role="dialog" aria-label="사진 그라데이션" data-testid="card-shade-popover" className="photo-popover fixed w-64 rounded-2xl border border-[#DDD6CB] bg-white p-3 shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)]" style={{left,top,transformOrigin:"left center"}}>
          <div className="flex items-center gap-1" role="group" aria-label="그라데이션 방향">
            {DIRECTIONS.map(([id,Icon])=><button key={id} type="button" aria-label={LABEL[id]} title={LABEL[id]} aria-pressed={p.direction===id} data-testid={'card-shade-'+id} onClick={()=>shade('direction',id)}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border transition cursor-pointer ${p.direction===id?'border-slate-900/[0.08] bg-slate-900/[0.08] text-slate-800':'border-transparent text-slate-500 hover:bg-slate-900/[0.04] hover:text-slate-800'}`}><Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden="true"/></button>)}
            <button type="button" aria-label="그라데이션 초기화" title="그라데이션 초기화" data-testid="card-shade-reset" onClick={shadeReset} className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-900/[0.04] hover:text-slate-800 cursor-pointer"><RotateCcw className="h-4 w-4" strokeWidth={1.6} aria-hidden="true"/></button>
          </div>
          <div className="mt-3 flex items-center gap-3 px-1">
            <input type="range" min="0" max="100" step="1" aria-label="그라데이션 강도" data-testid="card-shade-strength" value={p.strength} onChange={e=>shade('strength',Number(e.target.value))} className="h-1 min-w-0 flex-1 cursor-pointer accent-slate-700"/>
            <output className="w-8 text-right font-mono text-[11px] text-slate-500">{p.strength}</output>
          </div>
        </div>
      </div>,document.body);
    })()}
    {searching&&<PhotoSearch anchor={anchor} body={article.content} card={active} onClose={()=>setSearching(false)} onChoose={choose} onUpload={uploadFile}/>}
  </div>;
}
