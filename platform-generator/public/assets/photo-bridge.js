import './photo-tools.js';
// 가운데 카드 사진 패널: 선택과 편집을 분리하고 원본과 출처는 보존합니다.
// 모든 서버 요청은 기존 NewsApi 사진 함수로만 수행합니다.
const tools = document.querySelector('.photo-tools');
if (tools) {
  const workspace = document.getElementById('card-workspace');
  workspace.append(tools);
  const credit = tools.querySelector('#photo-credit') || document.createElement('div');
  credit.id = 'photo-credit';
  tools.replaceChildren();
  tools.innerHTML = `<h2 class="photo-panel-title" data-photo-title></h2>
    <p class="notice" data-photo-status role="status" aria-live="polite"></p>
    <section data-photo-selection>
      <strong>주제 관련 참고 이미지</strong>
      <p class="notice">기사 속 실제 인물·사건 현장 사진이 아닐 수 있습니다. 선택할 때만 카드에 적용됩니다.</p>
      <label>사진 검색어<input data-recommend-query maxlength="150" placeholder="카드 주제에 맞는 검색어"></label>
      <div class="photo-panel-actions"><button type="button" data-recommend-search>추천 보기</button><button type="button" data-recommend-refresh>다른 추천</button></div>
      <div class="recommendation-grid" data-recommendations></div>
      <div class="photo-panel-actions"><button type="button" data-search>사진 검색하기</button><button type="button" data-upload>내 사진 첨부</button></div>
      <button type="button" data-keep-photo>사진 없이 유지</button>
    </section>
    <section data-photo-edit>
      <div class="photo-panel-actions"><button type="button" data-replace>사진 바꾸기</button><button type="button" data-remove>사진 삭제</button></div>
      <div class="photo-edit-controls">
        <label>사진 확대·축소 <output data-value="zoom"></output><input data-photo="zoom" type="range" min="100" max="300" step="1" aria-label="사진 확대 축소"></label>
        <details><summary>사진 위치 세부 조절</summary>
          <label>가로 위치<input data-photo="x" type="range" min="0" max="100" aria-label="사진 가로 위치"></label>
          <label>세로 위치<input data-photo="y" type="range" min="0" max="100" aria-label="사진 세로 위치"></label>
        </details>
        <label>그라데이션 방향<select data-photo="direction" aria-label="그라데이션 방향"><option value="legacy">기존 기본</option><option value="bottom">아래쪽 어둡게</option><option value="top">위쪽 어둡게</option><option value="uniform">전체 어둡게</option><option value="left">왼쪽 어둡게</option><option value="right">오른쪽 어둡게</option></select></label>
        <label>그라데이션 강도 <output data-value="strength"></output><input data-photo="strength" type="range" min="0" max="100" aria-label="그라데이션 강도"></label>
        <button type="button" data-photo-reset>사진 배치·그라데이션 초기화</button>
      </div>
    </section>
    <button type="button" data-photo-undo>사진 변경 되돌리기</button>`;
  tools.append(credit);
  const q = selector => tools.querySelector(selector);
  const records = new WeakMap(); // 카드 객체별 캐시: 다른 기사의 카드와 섞이지 않습니다.
  const history = new WeakMap();
  const changing = new WeakSet();
  const skipped = new WeakSet();
  let observedCard = null, observedSignature = '', controller = null, selecting = false;
  let selectionToken = 0, gesture = null, selectionController = null;
  let renderedPhotos = null, renderedSelecting = null;
  function contextFor(card) {
    const content = Object.fromEntries(['keyword','headline','body'].map(key => [key,typeof card[key] === 'string' ? card[key].trim() : '']));
    return {card:content,text:Object.values(content).filter(Boolean).join('\n')};
  }
  function signature(card) { return contextFor(card).text; }
  function recordFor(card) {
    const key = signature(card), previous = records.get(card);
    if (previous?.signature === key) return previous;
    const context = contextFor(card);
    const record = {signature:key,query:(context.card.keyword || context.card.headline || context.card.body || '').replace(/\s+/g,' ').slice(0,150),page:1,photos:[],loading:false,loaded:false,error:''};
    records.set(card,record);return record;
  }
  function remember(card) {
    const past = history.get(card) || [];
    past.push(card.image ? structuredClone(card.image) : null);
    if(past.length > 12)past.shift();history.set(card,past);
  }
  function commit(card, image) {
    remember(card);if(image)card.image=image;else delete card.image;
    changing.delete(card);gesture=null;dirty(false);draw();sync();
  }
  // 검색 중에도 카드 본문 편집은 유지합니다. 카드 전환 후의 오래된 응답은 적용하지 않습니다.
  async function recommend({manual=false,next=false}={}) {
    const card=current();if(!card || selecting)return;
    const record=recordFor(card);
    if(record.loading)return;
    if(manual){record.query=q('[data-recommend-query]').value.trim();record.page=next?record.page+1:1;}
    controller?.abort();controller=new AbortController();const signal=controller.signal;
    record.loading=true;record.error='';sync();
    try {
      if(!manual && !record.loaded) {
        const context=contextFor(card);
        const body=context.text;
        if(body.length>0) {
          try {
            const result=await window.NewsApi.suggestPhotoKeywords(body,signal,context.card);
            if(signal.aborted || records.get(card)!==record || signature(card)!==record.signature)return;
            const keyword=result.keywords?.find(value=>typeof value==='string'&&value.trim());
            if(keyword)record.query=keyword.trim().slice(0,150);
          }catch(error){if(signal.aborted || records.get(card)!==record || signature(card)!==record.signature)return;/* AI 추천 실패 시 카드 키워드로 검색합니다. */}
        }
      }
      if(!record.query)throw new Error('검색어를 입력해주세요.');
      const result=await window.NewsApi.searchTeamPhotos(record.query,record.page,signal,4);
      if(signal.aborted || !state.cards.includes(card) || records.get(card)!==record || signature(card)!==record.signature)return;
      record.photos=(result.photos || []).slice(0,4);record.loaded=true;
    }catch(error){if(!signal.aborted){record.error=error.message;record.loaded=true;}}
    finally{record.loading=false;if(current()===card && records.get(card)===record)sync();}
  }
  // 추천 썸네일은 URL만 표시하고, 선택한 사진만 원본 파일로 가져옵니다.
  function renderRecommendations(record) {
    const grid=q('[data-recommendations]');
    if(renderedPhotos===record.photos && renderedSelecting===selecting)return;
    renderedPhotos=record.photos;renderedSelecting=selecting;grid.replaceChildren();
    for(const photo of record.photos) {
      const box=document.createElement('div');box.className='recommendation-item';
      const button=document.createElement('button');button.type='button';button.className='recommended-photo';
      button.disabled=selecting;button.setAttribute('aria-label',(photo.alt_description || '추천 사진')+' 선택');
      const img=document.createElement('img');img.src=photo.urls.small;img.alt=photo.alt_description || '주제 관련 참고 이미지';img.loading='lazy';
      button.append(img);button.onclick=()=>selectRecommended(photo);
      const author=document.createElement('a');author.textContent=photo.user.name+' / Unsplash';author.target='_blank';author.rel='noopener noreferrer';
      author.href=photo.user.links.html+'?utm_source=article_workspace&utm_medium=referral';box.append(button,author);grid.append(box);
    }
  }
  async function selectRecommended(photo) {
    if(selecting)return;
    const card=current(), token=++selectionToken;selecting=true;selectionController=new AbortController();recordFor(card).selectionError='';sync();
    q('[data-photo-status]').textContent='선택한 사진을 불러오고 있습니다…';
    try {
      // 이 함수의 서버 경로가 Unsplash 다운로드 추적을 함께 수행합니다.
      const blob=await window.NewsApi.getTeamPhotoBlob(photo.id,selectionController.signal);
      const data=await picker.blobData(blob);
      if(token!==selectionToken || current()!==card || !state.cards.includes(card))return;
      applyPhoto(card,{id:crypto.randomUUID(),original:data,data,unsplashId:photo.id,remoteOriginal:photo.urls.full,
        photographer:photo.user.name,profile:photo.user.links.html,source:photo.user.name+' / Unsplash',sourceUrl:photo.links.html,alt:photo.alt_description || ''});
    }catch(error){if(token===selectionToken && current()===card){recordFor(card).selectionError='사진 적용 실패: '+error.message;}}
    finally{selecting=false;sync();}
  }
  function applyPhoto(card,photo) {
    const url=CardTemplate.validImage(photo.data);if(!url)throw new Error('지원하지 않는 사진 형식입니다.');
    // 새 사진은 기본 그라데이션으로 적용하고 카드별 조절값으로 보관합니다.
    commit(card,{url,presentation:{zoom:1,x:50,y:50,direction:'bottom',strength:86},photographer:photo.photographer || '',profile:photo.profile || '',source:photo.source || '',sourceUrl:photo.sourceUrl || '',photo_edit:structuredClone(photo)});
  }
  function sync() {
    const card=current();if(!card)return;
    const isCardView=window.TextEditor?.getPlatform()==='card_news';tools.hidden=!isCardView;
    q('[data-photo-title]').textContent=(state.cards.indexOf(card)+1)+'번 카드 사진';
    const changed=card!==observedCard, key=signature(card);
    if(changed || key!==observedSignature) {
      controller?.abort();if(changed){selectionController?.abort();selectionToken++;}observedCard=card;observedSignature=key;gesture=null;
    }
    const hasPhoto=!!card.image?.url, choosing=!hasPhoto || changing.has(card),record=recordFor(card);
    q('[data-photo-selection]').hidden=!choosing;q('[data-photo-edit]').hidden=choosing;
    q('[data-keep-photo]').textContent=hasPhoto?'취소 · 현재 사진 유지':'사진 없이 유지';
    if(document.activeElement!==q('[data-recommend-query]'))q('[data-recommend-query]').value=record.query;
    q('[data-photo-status]').textContent=record.selectionError?record.selectionError:selecting?'선택한 사진을 불러오고 있습니다…':record.loading?'사진을 추천 중입니다. 카드 글은 계속 수정할 수 있습니다.':record.error?'추천을 불러오지 못했습니다: '+record.error:choosing?record.loaded && !record.photos.length?'검색 결과가 없습니다. 검색어를 바꾸거나 직접 첨부해주세요.':'사진을 선택하면 이 카드에만 적용됩니다.':'카드를 보면서 사진을 조절하세요.';
    renderRecommendations(record);
    const p=CardTemplate.normalizePhoto(card.image);
    tools.querySelectorAll('[data-photo]').forEach(el=>{el.disabled=!hasPhoto || selecting;el.value=el.dataset.photo==='zoom'?Math.round(p.zoom*100):p[el.dataset.photo];});
    q('[data-value="zoom"]').textContent=Math.round(p.zoom*100)+'%';q('[data-value="strength"]').textContent=p.strength+'%';
    q('[data-photo-undo]').disabled=!(history.get(card)?.length) || selecting;
    q('[data-recommend-search]').disabled=record.loading || selecting;q('[data-recommend-refresh]').disabled=record.loading || selecting;
    // 검정 배경의 실제 생성 카드만 자동 추천합니다. 예시 카드에서 API를 낭비하지 않습니다.
    if(isCardView && choosing && state.card_news && !record.loaded && !record.loading && !skipped.has(card))void recommend();
  }
  tools.querySelectorAll('[data-photo]').forEach(el=>{
    el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{
      const card=current();if(!card?.image?.url || selecting)return;
      const key=el.dataset.photo;
      if(!gesture || gesture.card!==card || gesture.key!==key){remember(card);gesture={card,key};}
      const value=key==='direction'?el.value:Number(el.value)/(key==='zoom'?100:1);
      card.image.presentation={...CardTemplate.normalizePhoto(card.image),[key]:value};dirty(false);draw();sync();
      if(el.tagName==='SELECT')gesture=null;
    });
    el.addEventListener('change',()=>{gesture=null;});el.addEventListener('blur',()=>{gesture=null;});
  });
  q('[data-replace]').onclick=()=>{changing.add(current());skipped.delete(current());sync();};
  q('[data-remove]').onclick=()=>{skipped.add(current());commit(current(),null);};
  q('[data-keep-photo]').onclick=()=>{const card=current();skipped.add(card);changing.delete(card);sync();};
  q('[data-photo-reset]').onclick=()=>{const card=current();if(!card.image)return;commit(card,{...card.image,presentation:{zoom:1,x:50,y:50,direction:'bottom',strength:86}});};
  q('[data-photo-undo]').onclick=()=>{
    const card=current(),past=history.get(card);if(!past?.length)return;
    const image=past.pop();if(image)card.image=image;else delete card.image;changing.delete(card);skipped.add(card);gesture=null;dirty(false);draw();sync();
  };
  q('[data-recommend-search]').onclick=()=>{skipped.delete(current());void recommend({manual:true});};
  q('[data-recommend-refresh]').onclick=()=>{skipped.delete(current());void recommend({manual:true,next:true});};
  q('[data-recommend-query]').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void recommend({manual:true});}};
  // 검색·파일 선택창은 유지하고 별도 사진 편집창은 열지 않습니다.
  const dialog=document.createElement('dialog');dialog.style.cssText='width:min(1100px,96vw);max-height:94vh;overflow:auto;border:0;border-radius:12px';
  const close=document.createElement('button');close.textContent='사진 선택 창 닫기';close.type='button';
  const picker=document.createElement('photo-tools');dialog.append(close,picker);document.body.append(dialog);
  let target=null;
  function finish(){picker.sessionToken=(picker.sessionToken||0)+1;picker.controller.abort();picker.closeModal();dialog.close();target=null;}
  function open(mode='search') {
    if(window.TextEditor?.getPlatform()!=='card_news')window.TextEditor.showPlatform('card_news');
    picker.controller.abort();picker.controller=new AbortController();picker.sessionToken=(picker.sessionToken||0)+1;
    target=current();picker.articleText=contextFor(target).text;picker.selectedPhoto=null;picker.mode='edit';picker.render();dialog.showModal();
    if(mode==='upload')picker.choosePhotoFile();else picker.media();
  }
  close.onclick=finish;dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});
  picker.addEventListener('photo-selected',event=>{
    if(!target || !state.cards.includes(target) || current()!==target){picker.notice('대상 카드가 변경되었습니다. 다시 사진을 선택해주세요.');return;}
    try{applyPhoto(target,event.detail);finish();}catch(error){picker.notice(error.message);}
  });
  q('[data-search]').onclick=()=>open('search');q('[data-upload]').onclick=()=>open('upload');
  const stage=document.getElementById('stage');
  new MutationObserver(()=>sync()).observe(stage,{childList:true,subtree:true});
  window.addEventListener('news:platform-changed',sync);
  window.TeamPhotos={open};sync();
}
