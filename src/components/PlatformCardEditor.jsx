import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {Download,Image as ImageIcon,ImageDown,Loader2,Plus,Search,SlidersHorizontal,Upload,X} from "lucide-react";
import PhotoSearch from "./photo/PhotoSearch.jsx";
import ImageEditor from "./photo/ImageEditor.jsx";
import {importPhoto,dongaPhotoData,trackPhotoDownload} from "../api/editorial.js";
import {blobToDataUrl,photoDataUrl,renderStoredCard,storedJpg} from "../api/platform.js";
import {articleId,fingerprint,invalidateDraft,renderKey,selectedCardPhoto,currentRender,sourceText} from "../lib/platformState.js";
import * as CardModel from "../../platform-generator/lib/card-model.js";
import * as CardTemplate from "../../platform-generator/lib/card-template.js";

const button="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50";
const LAYOUT_LABEL={standard:"기본형",comparison:"비교형",list:"목록형",steps:"단계형",stat:"수치형"};
const articleKey=article=>fingerprint([articleId(article),sourceText(article)]);

export default function PlatformCardEditor({draft,article,onChange,onAddPhoto}) {
  const [activeIndex,setActiveIndex]=useState(0);
  const [rendering,setRendering]=useState(false);
  const [downloading,setDownloading]=useState(false);
  const [error,setError]=useState("");
  const [searching,setSearching]=useState(false);
  const [editing,setEditing]=useState(null);
  const [settingsOpen,setSettingsOpen]=useState(false);

  const live=useRef({draft,article});
  useLayoutEffect(()=>{live.current={draft,article};},[draft,article]);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);

  const cards=draft?.cards||[],active=cards[activeIndex]||cards[0],photo=selectedCardPhoto(active,article);
  const [previewPhoto,setPreviewPhoto]=useState(null);

  useEffect(()=>{
    let cancelled=false;
    if(photo)photoDataUrl(photo).then(url=>{if(!cancelled)setPreviewPhoto({photo,url});}).catch(e=>{if(!cancelled){setPreviewPhoto(null);setError(e.message);}});
    return()=>{cancelled=true;};
  },[photo]);

  // iframe 내부 인라인 편집 메시지 수신(메인 미리보기에서 온 것만, 지금 보이는 카드에 적용)
  const previewRef=useRef(null);
  const activeId=active?.card_id;
  useEffect(()=>{
    const handler = (event) => {
      if (event.source !== previewRef.current?.contentWindow) return;
      if (event.data?.type === "CARD_FIELD_CHANGE" && event.data.field) {
        const { field, value } = event.data;
        onChange(current => invalidateDraft({
          ...current,
          cards: current.cards.map((c) => c.card_id === activeId ? {
            ...c,
            content: { ...(c.content || c), [field]: value },
            validation_status: "needs_recheck"
          } : c)
        }));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [activeId, onChange]);

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
      return rendered;
    }catch(e){setError(e.message);return null;}finally{setRendering(false);}
  };

  const downloadCurrentCard=async()=>{
    setDownloading(true);setError("");
    try{
      const copy=structuredClone(active),origin=structuredClone(draft);
      const rendered=await renderStoredCard(copy,article,origin);
      onChange(current=>({...current,cards:current.cards.map(card=>card.card_id===copy.card_id?{...card,rendered_image:rendered}:card)}));
      const blob=await storedJpg(rendered);
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=`card_${String(index+1).padStart(2,'0')}.jpg`;
      a.click();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
    }catch(e){setError("카드 JPG 다운로드 실패: "+e.message);}finally{setDownloading(false);}
  };

  const addCard=()=>{
    // 지금 카드와 같은 형식(content_version 2 면 content.answer·detail)으로 만들어 검수·렌더 기준을 맞춘다
    const modernCard = active.content_version === 2;
    const text = modernCard
      ? { keyword: content.keyword || "", headline: "새로운 카드 제목", answer: "", detail: "새로운 카드 본문 내용을 입력하세요." }
      : { keyword: content.keyword || "", headline: "새로운 카드 제목", body: "새로운 카드 본문 내용을 입력하세요." };
    const newCard = {
      card_id: "card-" + crypto.randomUUID(),
      page: cards.length + 1,
      role: "body",
      ...(modernCard ? { content_version: 2, content: text } : text),
      design: { layout: "standard", highlights: [], compact: false }
    };
    onChange(current => invalidateDraft({
      ...current,
      cards: [...(current.cards || []), newCard]
    }));
    setActiveIndex(cards.length);
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

  const normalized=CardModel.normalize({
    ...active,
    image:photo&&previewPhoto?.photo===photo?{...photo,url:previewPhoto.url,photographer:photo.photographer||photo.source,profile:photo.profile||photo.sourceUrl}:undefined,
    page:index+1,
    total_pages:cards.length
  });
  const template=CardTemplate;

  // 인라인 편집 가능한 메인 카드 HTML (첨부 이미지 디자인 매칭)
  // 미리보기는 JPG 렌더(card-renderer)와 같은 템플릿 CSS·fitCard 를 쓴다. 덧붙이는 것은 편집 중 표시(포커스 테두리)뿐
  const customCss = `
    .news-card [contenteditable=true]:focus { outline: 3px dashed #F59E0B !important; outline-offset: 8px !important; border-radius: 12px; }
  `;
  const inlineScript = `
    (${template.fitCard.toString()})();
    document.querySelectorAll('[contenteditable=true]').forEach(function(el){
      var before = el.innerText.trim();
      el.addEventListener('focus', function(){ before = el.innerText.trim(); });
      el.addEventListener('blur', function(){
        var field = el.getAttribute('data-field');
        if (el.innerText.trim() === before) return;
        window.parent.postMessage({ type: 'CARD_FIELD_CHANGE', field: field, value: el.innerText.trim() }, '*');
      });
    });
  `;
  const html='<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0}'+template.css+customCss+'</style>'+template.markup(normalized, true)+'<script>'+inlineScript+'</script></html>';

  const modern=normalized.content_version===2;
  const rendered=currentRender(active,photo,draft);


  // 카드 뷰 크기: 너비 360px, 높이 450px (scale = 360 / 1080 = 0.3333)
  const cardScale = 360 / 1080;

  return (
    <div className="flex w-full flex-col items-center py-2" data-testid="platform-card-editor">
      {/* 중앙 메인 카드뉴스 뷰어 (이미지와 동일한 다크 카드 + 오렌지 점선 박스) */}
      <div className="relative group flex justify-center py-4">
        <div
          className="relative overflow-hidden rounded-[28px] bg-[#18181B] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.45)] transition-all"
          style={{ width: 360, height: 450 }}
        >
          <iframe
            ref={previewRef}
            key={`${active.card_id}-${photo?.url || "nophoto"}`}
            title="카드 미리보기"
            sandbox="allow-scripts"
            srcDoc={html}
            style={{
              width: 1080,
              height: 1350,
              border: 0,
              transform: `scale(${cardScale})`,
              transformOrigin: "top left",
            }}
          />

          {/* 사진 및 옵션 변경 플로팅 버튼 */}
          <div className="absolute right-3.5 top-3.5 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="카드 사진 및 정보 편집"
              aria-label="카드 사진 및 정보 편집"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md shadow-md hover:bg-black/80 transition cursor-pointer"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 구분선 */}
      <div className="w-full max-w-[620px] border-t border-[#F0EFEA] mt-6 pt-6" />

      {/* 하단 썸네일 스트립: 이미지와 동일하게 1(선택), 2, 3 뱃지 및 + 버튼 */}
      <div className="flex w-full max-w-[620px] items-center justify-center gap-3.5 overflow-x-auto py-2 px-4 scrollbar-thin">
        {cards.map((c, i) => {
          const isSelected = c === active;
          const cardKeyword = c.content?.keyword || c.keyword || "콘텐츠 제작";
          const cardHeadline = c.content?.headline || c.headline || "제목 없음";
          const cardBody = c.content?.body || c.body || c.content?.detail || c.detail || "";

          return (
            <button
              type="button"
              key={c.card_id}
              onClick={() => setActiveIndex(i)}
              aria-pressed={isSelected}
              aria-label={`${i + 1}번 카드`}
              className={`relative shrink-0 overflow-hidden rounded-[8px] transition-all cursor-pointer text-left ${
                isSelected
                  ? "bg-[#18181B] border-2 border-white ring-1 ring-black/10 shadow-[0_12px_28px_rgba(0,0,0,0.35)] scale-105 z-10"
                  : "bg-[#33373D] border border-white/5 opacity-85 hover:opacity-100 hover:scale-102"
              }`}
              style={{ width: 78, height: 98 }}
            >
              <div className="flex flex-col justify-between h-full p-2 select-none pointer-events-none">
                {/* 상단: 키워드 (좌측) + 번호 뱃지 (우측) */}
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[7.5px] font-medium text-[#9CA3AF] tracking-tight truncate max-w-[44px]">
                    {cardKeyword}
                  </span>
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] text-[8px] ${
                      isSelected
                        ? "bg-white font-black text-black shadow-xs"
                        : "bg-white/20 font-bold text-white"
                    }`}
                  >
                    {i + 1}
                  </span>
                </div>

                {/* 중앙: 볼드체 제목 */}
                <div className="my-auto py-0.5">
                  <p className="text-[8.5px] font-extrabold leading-[1.25] text-white line-clamp-3 break-keep">
                    {cardHeadline}
                  </p>
                </div>

                {/* 하단: 본문 요약 */}
                <div className="mt-auto">
                  <p className="text-[6.5px] leading-[1.25] text-[#9CA3AF] line-clamp-2 break-keep">
                    {cardBody}
                  </p>
                </div>
              </div>
            </button>
          );
        })}

        {/* 썸네일 우측 끝 '+' 원형 카드 추가 버튼 */}
        <button
          type="button"
          onClick={addCard}
          title="새 카드 추가"
          aria-label="새 카드 추가"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#18181B] text-white shadow-md hover:bg-black hover:scale-105 transition cursor-pointer"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
        </button>
      </div>

      {/* 하단 테스트 및 다운로드 컨트롤 (단정하고 깔끔한 링크 형태) */}
      <div className="mt-4 w-full max-w-[540px] px-3">
        <section data-testid="card-image-section" className="text-right">
          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              data-testid="card-image-make"
              disabled={rendering || downloading}
              onClick={makeImage}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#8E8982] hover:text-[#18181B] transition cursor-pointer disabled:opacity-50"
            >
              {rendering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageDown className="h-3.5 w-3.5" />}
              <span>{rendering ? "이미지 생성 중…" : "카드 이미지 만들기"}</span>
            </button>
            <button
              type="button"
              disabled={rendering || downloading}
              onClick={downloadCurrentCard}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#8E8982] hover:text-[#18181B] transition cursor-pointer disabled:opacity-50"
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              <span>카드 JPG 다운로드</span>
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-[#B0AAA2]">{rendered ? "현재 카드 이미지를 Core 암호화 보관소에 보관했습니다." : active.rendered_image ? "카드·사진·위치가 변경됐습니다. 이미지를 다시 만들어 주세요." : "이미지를 만들어 암호화 보관소에 보관합니다. JPG 내보내기는 별도입니다."}</p>
          {rendered && <img data-testid="card-image-preview" src={rendered.uri} alt={`${content.headline || "카드"} 완성 이미지`} className="ml-auto mt-2 max-w-[160px] rounded-lg" />}
        </section>
      </div>

      {error && (
        <p role="alert" data-testid="card-image-error" className="mt-3 text-xs text-rose-700">
          {error}
        </p>
      )}

      {/* 설정 및 사진 편집 모달/드로어 */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-[480px] rounded-3xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#F0EFEA] pb-3">
              <h3 className="text-base font-black text-[#101010]">{index + 1}번 카드 사진 및 세부 편집</h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5 text-[#57514A]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 사진 첨부 섹션 */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-black text-[#101010]">
                  <ImageIcon className="h-4 w-4" />
                  이미지 첨부
                </span>
                <span className="text-[10px] text-[#B0AAA2]">카드 배경 적용</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-label="현재 카드 사진 찾기"
                  onClick={() => { setSettingsOpen(false); setSearching(true); }}
                  className="flex flex-col items-center gap-1 rounded-2xl border border-[#E7E2D9] py-3 text-[11px] font-bold text-[#292929] hover:bg-[#FAF8F5] cursor-pointer"
                >
                  <Search className="h-4 w-4" />
                  언플래쉬 · 동아 DB
                </button>
                <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-[#E7E2D9] py-3 text-[11px] font-bold text-[#292929] hover:bg-[#FAF8F5]">
                  <Upload className="h-4 w-4" />
                  내 PC
                  <input
                    aria-label="카드 사진 업로드"
                    className="hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => { setSettingsOpen(false); upload(e); }}
                  />
                </label>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <select
                  aria-label="기사 사진 사용"
                  value={active.photoId || ""}
                  onChange={(e) => patch({ photoId: e.target.value, image: undefined })}
                  className="min-w-0 flex-1 rounded-lg border border-[#DDD6CB] bg-white px-2 py-1.5 text-[11px] text-[#292929]"
                >
                  <option value="">사진 없음 (기본 검정 배경)</option>
                  {(article.photos || []).map((p) => (
                    <option value={p.id} key={p.id}>{p.caption || p.source || p.id}</option>
                  ))}
                </select>
                {photo && (
                  <button
                    type="button"
                    onClick={() => { setSettingsOpen(false); editPhoto(); }}
                    className="shrink-0 rounded-lg border border-[#DDD6CB] px-2.5 py-1.5 text-[11px] font-bold text-[#292929] hover:bg-[#FAF8F5] cursor-pointer"
                  >
                    사진 편집
                  </button>
                )}
              </div>
              {photo && <p className="mt-2 text-[11px] text-[#8E8982]">사진 출처: {photo.source || photo.photographer || photo.provider || "출처 미입력"} {photo.sourceUrl && <a className="underline" href={photo.sourceUrl} target="_blank" rel="noreferrer">원본 출처</a>}</p>}
            </div>

            {/* 정보 배치 및 텍스트 수정 */}
            <div className="space-y-3 border-t border-[#F0EFEA] pt-4">
              <label className="block text-xs font-bold text-[#292929]">
                정보 배치
                <select
                  aria-label="카드 정보 배치"
                  className="mt-1.5 block w-full rounded-lg border border-[#DDD6CB] bg-white px-3 py-2 text-sm font-medium text-[#101010]"
                  value={active.design?.layout || "standard"}
                  onChange={(e) => patch({ design: { ...active.design, layout: e.target.value } })}
                >
                  {["standard", "comparison", "list", "steps", "stat"].map((value) => (
                    <option key={value} value={value}>{LAYOUT_LABEL[value] || value}</option>
                  ))}
                </select>
              </label>

              {["keyword", "headline", ...(modern ? ["answer", "detail"] : ["body"]), "farewell"].map((key) => (
                <label className="block text-xs font-bold text-[#292929]" key={key}>
                  {({ keyword: "카드 키워드", headline: "카드 제목", answer: "핵심 답변", detail: "상세 설명", body: "카드 본문", farewell: "끝인사" })[key]}
                  <textarea
                    aria-label={key}
                    rows={key === "detail" || key === "body" ? 3 : 2}
                    className="mt-1.5 w-full resize-none rounded-lg border border-[#DDD6CB] bg-white px-3 py-2 text-sm font-medium leading-6 text-[#101010] outline-none focus:border-[#292929]"
                    value={content[key] || ""}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                </label>
              ))}
              <details className="rounded-lg border border-[#EFECE6] px-3 py-2"><summary className="cursor-pointer text-xs font-bold text-[#57514A]">텍스트 위치 조정</summary>{['headline',...(modern?['answer','detail']:['body'])].map(field=><div className="flex gap-2 text-xs" key={field}>{field}{['x','y'].map(axis=><label key={axis}>{axis}<input type="number" min={axis==='x'?-1080:-1350} max={axis==='x'?1080:1350} aria-label={field+' '+axis} value={active.text_positions?.[field]?.[axis]||0} onChange={e=>patch({text_positions:{...active.text_positions,[field]:{...active.text_positions?.[field],[axis]:Number(e.target.value)}}})}/></label>)}</div>)}<button className={button} onClick={()=>patch({text_positions:{}})}>위치 초기화</button></details>
            </div>

            <div className="border-t border-[#F0EFEA] pt-3 text-right">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-xl bg-[#292929] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-black"
              >
                완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 사진 검색 모달 */}
      {searching && (
        <PhotoSearch
          body={article.content}
          card={active}
          onClose={() => setSearching(false)}
          onChoose={choose}
        />
      )}

      {/* 사진 편집 모달 */}
      {editing && (
        <ImageEditor
          photo={editing.photo}
          onCancel={() => setEditing(null)}
          onError={(message) => setError(message)}
          onTrackDownload={() =>
            editing.photo.unsplashId ? trackPhotoDownload(editing.photo.unsplashId) : Promise.resolve()
          }
          onApply={(p) => {
            if (articleKey(live.current.article) !== editing.articleKey) {
              setError("편집 중 기사가 바뀌었습니다. 다시 선택해 주세요.");
              setEditing(null);
              return;
            }
            onAddPhoto(p, editing.cardId);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
