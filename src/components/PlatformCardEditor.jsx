import {useEffect,useLayoutEffect,useRef,useState} from "react";
import PhotoSearch from "./photo/PhotoSearch.jsx";
import ImageEditor from "./photo/ImageEditor.jsx";
import {importPhoto,dongaPhotoData,trackPhotoDownload} from "../api/editorial.js";
import {blobToDataUrl,photoDataUrl,renderStoredCard} from "../api/platform.js";
import {articleId,fingerprint,invalidateDraft,renderKey,selectedCardPhoto,currentRender,sourceText} from "../lib/platformState.js";
import * as CardModel from "../../platform-generator/lib/card-model.js";
import * as CardTemplate from "../../platform-generator/lib/card-template.js";

const button="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50";
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
  return <div className="space-y-4" data-testid="platform-card-editor">
    <div className="flex flex-wrap gap-2">{cards.map((c,i)=><button className={button} key={c.card_id} onClick={()=>setActiveIndex(i)} aria-pressed={c===active}>{i+1}번 카드</button>)}</div>
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="relative overflow-hidden rounded-2xl bg-black" style={{width:324,height:405}}><iframe title="카드 미리보기" sandbox="allow-scripts" srcDoc={html} style={{width:1080,height:1350,border:0,transform:'scale(.3)',transformOrigin:'top left'}}/></div>
      <div className="space-y-3">
        {['keyword','headline',...(modern?['answer','detail']:['body']),'farewell'].map(key=><label className="block text-xs font-bold" key={key}>{({keyword:'카드 키워드',headline:'카드 제목',answer:'핵심 답변',detail:'상세 설명',body:'카드 본문',farewell:'끝인사'})[key]}<textarea aria-label={key} rows={key==='detail'||key==='body'?4:2} className="mt-1 w-full rounded-xl border p-2 text-sm" value={content[key]||''} onChange={e=>setField(key,e.target.value)}/></label>)}
        <label className="block text-xs">정보 배치 <select aria-label="카드 정보 배치" value={active.design?.layout||'standard'} onChange={e=>patch({design:{...active.design,layout:e.target.value}})}>{['standard','comparison','list','steps','stat'].map(value=><option key={value}>{value}</option>)}</select></label>
        <details><summary className="text-xs font-bold">텍스트 위치 조정</summary>{['headline',...(modern?['answer','detail']:['body'])].map(field=><div className="flex gap-2 text-xs" key={field}>{field}{['x','y'].map(axis=><label key={axis}>{axis}<input type="number" min={axis==='x'?-1080:-1350} max={axis==='x'?1080:1350} aria-label={field+' '+axis} value={active.text_positions?.[field]?.[axis]||0} onChange={e=>patch({text_positions:{...active.text_positions,[field]:{...active.text_positions?.[field],[axis]:Number(e.target.value)}}})}/></label>)}</div>)}<button className={button} onClick={()=>patch({text_positions:{}})}>위치 초기화</button></details>
      </div>
    </div>
    <div className="flex flex-wrap gap-2"><select aria-label="기사 사진 사용" value={active.photoId||''} onChange={e=>patch({photoId:e.target.value,image:undefined})}><option value="">사진 없음</option>{(article.photos||[]).map(p=><option value={p.id} key={p.id}>{p.caption||p.source||p.id}</option>)}</select><button className={button} onClick={()=>setSearching(true)}>현재 카드 사진 찾기</button><label className={button}>사진 업로드<input aria-label="카드 사진 업로드" className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={upload}/></label>{photo&&<button className={button} onClick={editPhoto}>사진 편집</button>}</div>
    {photo&&<p className="text-xs">사진 출처: {photo.source||photo.photographer||photo.provider||'출처 미입력'} {photo.sourceUrl&&<a className="underline" href={photo.sourceUrl} target="_blank" rel="noreferrer">원본 출처</a>}</p>}
    <section data-testid="card-image-section"><button className={button} data-testid="card-image-make" disabled={rendering} onClick={makeImage}>{rendering?'이미지 생성 중…':'카드 이미지 만들기'}</button><p className="mt-2 text-xs">{rendered?'현재 카드 이미지를 Core 암호화 보관소에 보관했습니다.':active.rendered_image?'카드·사진·위치가 변경됐습니다. 이미지를 다시 만들어 주세요.':'이미지를 만들어 암호화 보관소에 보관합니다. JPG 내보내기는 별도입니다.'}</p>{rendered&&<img data-testid="card-image-preview" src={rendered.uri} alt={`${content.headline||'카드'} 완성 이미지`} className="mt-2 max-w-[220px]"/>}</section>
    {error&&<p role="alert" data-testid="card-image-error" className="text-xs text-rose-700">{error}</p>}
    {searching&&<PhotoSearch body={article.content} card={active} onClose={()=>setSearching(false)} onChoose={choose}/>}
    {editing&&<ImageEditor photo={editing.photo} onCancel={()=>setEditing(null)} onError={message=>setError(message)} onTrackDownload={()=>editing.photo.unsplashId?trackPhotoDownload(editing.photo.unsplashId):Promise.resolve()} onApply={p=>{if(articleKey(live.current.article)!==editing.articleKey){setError('편집 중 기사가 바뀌었습니다. 다시 선택해 주세요.');setEditing(null);return;}onAddPhoto(p,editing.cardId);setEditing(null);}}/>}
  </div>;
}
