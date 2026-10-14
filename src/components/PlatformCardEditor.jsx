import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {ChevronLeft,ChevronRight,Image as ImageIcon,ImageDown,Loader2,Search,Upload} from "lucide-react";
import PhotoSearch from "./photo/PhotoSearch.jsx";
import ImageEditor from "./photo/ImageEditor.jsx";
import {importPhoto,dongaPhotoData,trackPhotoDownload} from "../api/editorial.js";
import {blobToDataUrl,photoDataUrl,renderStoredCard} from "../api/platform.js";
import {articleId,fingerprint,invalidateDraft,renderKey,selectedCardPhoto,currentRender,sourceText} from "../lib/platformState.js";
import * as CardModel from "../../platform-generator/lib/card-model.js";
import * as CardTemplate from "../../platform-generator/lib/card-template.js";

const button="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50";
const LAYOUT_LABEL={standard:"기본형",comparison:"비교형",list:"목록형",steps:"단계형",stat:"수치형"};
const articleKey=article=>fingerprint([articleId(article),sourceText(article)]);
export default function PlatformCardEditor({draft,article,onChange,onAddPhoto}) {
  const [activeIndex,setActiveIndex]=useState(0),[rendering,setRendering]=useState(false),[error,setError]=useState("");
  const [searching,setSearching]=useState(false),[editing,setEditing]=useState(null);
  const live=useRef({draft,article});useLayoutEffect(()=>{live.current={draft,article};},[draft,article]);
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const cards=draft?.cards||[],active=cards[activeIndex]||cards[0],photo=selectedCardPhoto(active,article);
  const [previewPhoto,setPreviewPhoto]=useState(null);
  useEffect(()=>{
    let cancelled=false;
    if(photo)photoDataUrl(photo).then(url=>{if(!cancelled)setPreviewPhoto({photo,url});}).catch(e=>{if(!cancelled){setPreviewPhoto(null);setError(e.message);}});
    return()=>{cancelled=true;};
  },[photo]);
  if(!active)return <p className="p-6 text-sm">아직 생성된 카드뉴스가 없습니다.</p>;
  const index=cards.indexOf(active),content=active.content||active;
  const patch=change=>onChange(current=>invalidateDraft({...current,cards:current.cards.map(card=>card.card_id===active.card_id?{...card,...change,validation_status:"needs_recheck"}:card)}));
  const setField=(key,value)=>patch({content:{...content,[key]:value}});
  const makeImage=async()=>{
    const copy=structuredClone(active),origin=structuredClone(draft),key=renderKey(copy,photo,origin),source=sourceText(article);
    setRendering(true);setError("");
    try{
      const rendered=await renderStoredCard(copy,article,origin);
      const now=live.current,current=now.draft?.cards.find(card=>card.card_id===copy.card_id);
      if(!mounted.current||!current||source!==sourceText(now.article)||renderKey(current,selectedCardPhoto(current,now.article),now.draft)!==key)throw Error("이미지 생성 중 카드·사진·원본이 바뀌었습니다. 결과를 적용하지 않았습니다. 다시 만들어 주세요.");
      onChange(current=>({...current,cards:current.cards.map(card=>card.card_id===copy.card_id?{...card,rendered_image:rendered}:card)}));
    }catch(e){setError(e.message);}finally{setRendering(false);}
  };
  const choose=async(p,action)=>{
    const cardId=active.card_id,originKey=fingerprint(draft.generation_input),sourceKey=articleKey(article);
    const imported=p.provider==='donga'?{id:'donga-'+p.id,url:await dongaPhotoData(p),caption:p.title,source:'동아일보 DB',provider:'donga',sourceUrl:'https://www.donga.com/archive/newslibrary/list?m=photo'}:await importPhoto(p);
    imported.original=imported.url;
    if(articleKey(live.current.article)!==sourceKey||fingerprint(live.current.draft?.generation_input)!==originKey||!live.current.draft.cards.some(c=>c.card_id===cardId))throw Error("사진을 가져오는 동안 기사가 바뀌었습니다. 다시 선택해 주세요.");
    if(action==='download'){const a=document.createElement('a');a.href=imported.url;a.download='photo.jpg';a.click();return;}
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
  const normalized=CardModel.normalize({...active,image:photo&&previewPhoto?.photo===photo?{...photo,url:previewPhoto.url,photographer:photo.photographer||photo.source,profile:photo.profile||photo.sourceUrl}:undefined,page:index+1,total_pages:cards.length});
  const template=CardTemplate;
  const html='<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0}'+template.css+'</style>'+template.markup(normalized)+'<script>('+template.fitCard.toString()+')();</script></html>';
  const modern=normalized.content_version===2;
  const rendered=currentRender(active,photo,draft);
  // 아래 썸네일 줄: 카드마다 같은 템플릿으로 작게 그린다(사진은 지금 고친 카드만 불러와 보여 준다)
  const thumbHtml=(card,i)=>'<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0}'+template.css+'</style>'+template.markup(CardModel.normalize({...card,image:undefined,page:i+1,total_pages:cards.length}))+'<script>('+template.fitCard.toString()+')();</script></html>';
  const go=(next)=>setActiveIndex(Math.max(0,Math.min(cards.length-1,next)));
  return <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]" data-testid="platform-card-editor">
    {/* 왼쪽: 지금 고치는 카드 크게 + 카드 목록 + 페이지·이미지 만들기 */}
    <section className="flex min-w-0 flex-col rounded-[28px] bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between border-b border-[#F0EFEA] pb-3">
        <h3 className="text-sm font-black text-[#101010]">{index+1}번 카드 수정 중</h3>
        <span className="rounded-full bg-[#F2F0EC] px-2.5 py-0.5 text-[11px] font-bold text-[#756F67]">{index+1}/{cards.length}</span>
      </div>
      <div className="flex justify-center py-6">
        <div className="relative overflow-hidden rounded-[22px] bg-black shadow-[0_24px_50px_rgba(0,0,0,0.28)]" style={{width:288,height:360}}><iframe title="카드 미리보기" sandbox="allow-scripts" srcDoc={html} style={{width:1080,height:1350,border:0,transform:'scale(.26667)',transformOrigin:'top left'}}/></div>
      </div>
      <div className="overflow-x-auto border-t border-[#F0EFEA] pt-4 pb-1"><div className="mx-auto flex w-max gap-2 p-1">
        {cards.map((c,i)=><button type="button" key={c.card_id} onClick={()=>setActiveIndex(i)} aria-pressed={c===active} aria-label={`${i+1}번 카드`} className={`relative shrink-0 overflow-hidden rounded-lg bg-black transition cursor-pointer ${c===active?'ring-2 ring-[#292929] ring-offset-2 shadow-lg':'opacity-70 hover:opacity-100'}`} style={{width:64,height:80}}><iframe title={`${i+1}번 카드 썸네일`} tabIndex={-1} sandbox="allow-scripts" srcDoc={thumbHtml(c,i)} style={{width:1080,height:1350,border:0,transform:'scale(.05926)',transformOrigin:'top left',pointerEvents:'none'}}/></button>)}
      </div></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border border-[#E7E2D9] px-2 py-1">
          <button type="button" aria-label="이전 카드" disabled={index<=0} onClick={()=>go(index-1)} className="flex h-7 w-7 items-center justify-center rounded-full text-[#57514A] hover:bg-[#F5F2ED] disabled:opacity-30 cursor-pointer"><ChevronLeft className="h-4 w-4"/></button>
          <span className="px-1 text-xs font-bold text-[#292929]">페이지 {index+1}/{cards.length}</span>
          <button type="button" aria-label="다음 카드" disabled={index>=cards.length-1} onClick={()=>go(index+1)} className="flex h-7 w-7 items-center justify-center rounded-full text-[#57514A] hover:bg-[#F5F2ED] disabled:opacity-30 cursor-pointer"><ChevronRight className="h-4 w-4"/></button>
        </div>
        <section data-testid="card-image-section" className="text-right">
          <button type="button" data-testid="card-image-make" disabled={rendering} onClick={makeImage} className="inline-flex items-center gap-2 rounded-full border border-[#E7E2D9] bg-white px-4 py-2 text-xs font-bold text-[#292929] shadow-sm hover:bg-[#FAF8F5] disabled:opacity-50 cursor-pointer">{rendering?'이미지 생성 중…':'카드 이미지 만들기'}<span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-200/80 text-[#1F5F8B]">{rendering?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<ImageDown className="h-3.5 w-3.5"/>}</span></button>
          <p className="mt-2 text-[11px] text-[#8E8982]">{rendered?'현재 카드 이미지를 Core 암호화 보관소에 보관했습니다.':active.rendered_image?'카드·사진·위치가 변경됐습니다. 이미지를 다시 만들어 주세요.':'이미지를 만들어 암호화 보관소에 보관합니다. JPG 내보내기는 별도입니다.'}</p>
          {rendered&&<img data-testid="card-image-preview" src={rendered.uri} alt={`${content.headline||'카드'} 완성 이미지`} className="ml-auto mt-2 max-w-[160px] rounded-lg"/>}
        </section>
      </div>
      {error&&<p role="alert" data-testid="card-image-error" className="text-xs text-rose-700">{error}</p>}
    </section>

    {/* 오른쪽: 이미지 첨부 + 카드 내용 */}
    <section className="space-y-4 rounded-[28px] bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.06)]">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-black text-[#101010]"><ImageIcon className="h-4 w-4"/>이미지 첨부</span>
          <span className="text-[10px] text-[#B0AAA2]">카드 배경 적용</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-label="현재 카드 사진 찾기" title="현재 카드 사진 찾기 (언플래쉬 · 동아일보 DB)" onClick={()=>setSearching(true)} className="flex flex-col items-center gap-1 rounded-2xl border border-[#E7E2D9] py-3 text-[11px] font-bold text-[#292929] hover:bg-[#FAF8F5] cursor-pointer"><Search className="h-4 w-4"/>언플래쉬 · 동아일보 DB</button>
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-[#E7E2D9] py-3 text-[11px] font-bold text-[#292929] hover:bg-[#FAF8F5]"><Upload className="h-4 w-4"/>내 PC<input aria-label="카드 사진 업로드" className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={upload}/></label>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <select aria-label="기사 사진 사용" value={active.photoId||''} onChange={e=>patch({photoId:e.target.value,image:undefined})} className="min-w-0 flex-1 rounded-lg border border-[#DDD6CB] bg-white px-2 py-1.5 text-[11px] text-[#292929]"><option value="">사진 없음 (기본 검정 배경)</option>{(article.photos||[]).map(p=><option value={p.id} key={p.id}>{p.caption||p.source||p.id}</option>)}</select>
          {photo&&<button type="button" onClick={editPhoto} className="shrink-0 rounded-lg border border-[#DDD6CB] px-2.5 py-1.5 text-[11px] font-bold text-[#292929] hover:bg-[#FAF8F5] cursor-pointer">사진 편집</button>}
        </div>
        {photo?<p className="mt-2 text-[11px] text-[#8E8982]">사진 출처: {photo.source||photo.photographer||photo.provider||'출처 미입력'} {photo.sourceUrl&&<a className="underline" href={photo.sourceUrl} target="_blank" rel="noreferrer">원본 출처</a>}</p>:<p className="mt-2 rounded-xl border border-dashed border-[#E7E2D9] py-3 text-center text-[11px] text-[#B0AAA2]">기본 검정 배경 사용 중</p>}
      </div>
      <div className="space-y-3 border-t border-[#F0EFEA] pt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-[#101010]">{index+1}번 카드 내용</span>
          <span className="rounded-full bg-[#F2F0EC] px-2 py-0.5 text-[10px] font-bold text-[#756F67]">{index+1}/{cards.length}</span>
        </div>
        <label className="block text-xs font-bold text-[#292929]">정보 배치<select aria-label="카드 정보 배치" className="mt-1.5 block w-full rounded-lg border border-[#DDD6CB] bg-white px-3 py-2 text-sm font-medium text-[#101010]" value={active.design?.layout||'standard'} onChange={e=>patch({design:{...active.design,layout:e.target.value}})}>{['standard','comparison','list','steps','stat'].map(value=><option key={value} value={value}>{LAYOUT_LABEL[value]||value}</option>)}</select></label>
        {['keyword','headline',...(modern?['answer','detail']:['body']),'farewell'].map(key=><label className="block text-xs font-bold text-[#292929]" key={key}>{({keyword:'카드 키워드',headline:'카드 제목',answer:'핵심 답변',detail:'상세 설명',body:'카드 본문',farewell:'끝인사'})[key]}<textarea aria-label={key} rows={key==='detail'||key==='body'?4:2} className="mt-1.5 w-full resize-none rounded-lg border border-[#DDD6CB] bg-white px-3 py-2 text-sm font-medium leading-6 text-[#101010] outline-none focus:border-[#292929]" value={content[key]||''} onChange={e=>setField(key,e.target.value)}/></label>)}
        <details className="rounded-lg border border-[#EFECE6] px-3 py-2"><summary className="cursor-pointer text-xs font-bold text-[#57514A]">텍스트 위치 조정</summary>{['headline',...(modern?['answer','detail']:['body'])].map(field=><div className="flex gap-2 text-xs" key={field}>{field}{['x','y'].map(axis=><label key={axis}>{axis}<input type="number" min={axis==='x'?-1080:-1350} max={axis==='x'?1080:1350} aria-label={field+' '+axis} value={active.text_positions?.[field]?.[axis]||0} onChange={e=>patch({text_positions:{...active.text_positions,[field]:{...active.text_positions?.[field],[axis]:Number(e.target.value)}}})}/></label>)}</div>)}<button className={button} onClick={()=>patch({text_positions:{}})}>위치 초기화</button></details>
      </div>
    </section>
    {searching&&<PhotoSearch body={article.content} card={active} onClose={()=>setSearching(false)} onChoose={choose}/>}
    {editing&&<ImageEditor photo={editing.photo} onCancel={()=>setEditing(null)} onError={message=>setError(message)} onTrackDownload={()=>editing.photo.unsplashId?trackPhotoDownload(editing.photo.unsplashId):Promise.resolve()} onApply={p=>{if(articleKey(live.current.article)!==editing.articleKey){setError('편집 중 기사가 바뀌었습니다. 다시 선택해 주세요.');setEditing(null);return;}onAddPhoto(p,editing.cardId);setEditing(null);}}/>}
  </div>;
}
