// Instagram·Threads 로컬 Playwright 게시 UI. 네트워크·이미지 요청은 NewsApi 함수로만 실행합니다.
(() => {
  if (!window.NewsApi || !window.TextEditor || !window.CardEditor) return;
  let busy = false;
  const sessions={instagram:{prepared:null,preparedRevision:null},threads:{prepared:null,preparedRevision:null}};
  const report = [];
  function attach() {
    const platform=window.TextEditor.getPlatform();
    const old=document.getElementById('local-publish-tools');old?.refreshReview?.();
    if(!['instagram','threads'].includes(platform)){old?.remove();return;}
    if(old&&old.dataset.platform!==platform)old.remove();
    const name=platform==='instagram'?'Instagram':'Threads',api=platform==='instagram'?'instagramLocal':'threadsLocal',session=sessions[platform];
    const host = document.getElementById('text-edit-status')?.parentElement;
    if (!host || document.getElementById('local-publish-tools')) return;
    const section = document.createElement('section');
    section.id = 'local-publish-tools';section.dataset.platform=platform;
    section.style.cssText = 'margin-top:18px;padding:16px;border:1px solid #9aa8bc;border-radius:12px;';
    const title = document.createElement('h3'); title.textContent = name+' 로컬앱 연결';
    const description = document.createElement('p'); description.className = 'notice';
    description.textContent = '전용 '+name+' 창에서 직접 로그인합니다. 생성된 카드뉴스가 있으면 글과 함께 첨부합니다. 계정 연결과 작성창 준비는 게시하지 않습니다.';
    const reviewStatus=document.createElement('p');reviewStatus.className='notice';
    const label=value=>({passed:'검수 통과',needs_revision:'수정 필요',needs_recheck:'재검수 필요'}[value]||'미검수');
    const refreshReview=()=>{const textRecord=state.validation_results?.[platform],cardRecord=state.validation_results?.card_news;const text='현재 원고: '+label(textRecord?.invalidated?'needs_recheck':state.text_drafts?.[platform]?.validation_status)+' · 카드: '+label(cardRecord?.invalidated?'needs_recheck':state.card_news?.validation_status);if(reviewStatus.textContent!==text)reviewStatus.textContent=text;};
    const status = document.createElement('p'); status.className = 'notice'; status.style.whiteSpace = 'pre-wrap';
    status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
    const connect = document.createElement('button'); connect.type='button'; connect.textContent='1. '+name+' 계정 연결';
    const check = document.createElement('button'); check.type='button'; check.textContent='2. 로그인 연결 확인';
    const prepare = document.createElement('button'); prepare.type='button'; prepare.textContent='3. 현재 원고·카드로 작성창 준비';
    const reviewLabel = document.createElement('label');
    const reviewed = document.createElement('input'); reviewed.type='checkbox'; reviewed.style.width='auto';
    reviewLabel.append(reviewed,' 전용 '+name+' 창에서 계정·글·사진 장수·순서를 확인했습니다.');
    const share = document.createElement('button'); share.type='button'; share.textContent='확인하고 '+name+'에 실제 게시'; share.disabled=true;
    const close = document.createElement('button'); close.type='button'; close.textContent='전용 창 닫기 · 로그인 상태는 보존';
    const metrics = document.createElement('p'); metrics.className='notice'; metrics.style.whiteSpace='pre-wrap';
    const controls = [connect,check,prepare,share,close,reviewed];
    const browser=document.createElement('select');browser.setAttribute('aria-label','SNS 로그인 브라우저');for(const [value,label] of [['auto','자동 (Chrome → Edge → Chromium)'],['chrome','Chrome'],['msedge','Edge'],['chromium','Chromium']]){const option=document.createElement('option');option.value=value;option.textContent=label;browser.append(option);}
    section.append(title,description,reviewStatus,browser,connect,check,prepare,reviewLabel,share,close,status,metrics); host.append(section);section.refreshReview=refreshReview;refreshReview();
    function updateShare() { share.disabled = busy || !reviewed.checked || !session.prepared || session.prepared.status !== 'ready'; }
    reviewed.onchange=updateShare;
    async function run(label, action) {
      if (busy) return;
      busy=true; controls.forEach(el=>{el.disabled=true;}); status.textContent=label+' 진행 중…';
      const start=performance.now();
      try {
        await action();
        report.push(`${label}: 성공 · ${((performance.now()-start)/1000).toFixed(1)}초`);
      } catch(error) { status.textContent='안내: '+error.message; report.push(`${label}: 확인 필요 · ${((performance.now()-start)/1000).toFixed(1)}초`); }
      finally {busy=false;controls.forEach(el=>{el.disabled=false;});updateShare();metrics.textContent=report.slice(-8).join('\n');}
    }
    connect.onclick=()=>run('계정 연결',async()=>{
      const result=await NewsApi[api+'Connect'](browser.value); status.textContent=result.message;
    });
    check.onclick=()=>run('연결 확인',async()=>{
      const result=await NewsApi[api+'Status']();
      if(!result.connected)throw new Error('전용 '+name+' 창에서 로그인과 인증을 완료한 뒤 다시 연결 확인을 눌러주세요. Threads 프로필 메뉴가 보이는지도 확인해주세요.');
      status.textContent=`연결됨${result.username?' · @'+result.username:''}\n계정 이름이 표시되지 않으면 전용 SNS 창에서 계정을 직접 확인해주세요.`;
    });
    prepare.onclick=()=>run('이미지·캡션 준비',async()=>{
      session.prepared=null; reviewed.checked=false;
      if(typeof state==='undefined'||!state.text_drafts?.[platform])throw new Error(name+' 원고를 먼저 생성해주세요.');
      const hasCards=!!state.card_news&&Array.isArray(state.cards)&&state.cards.length>0;
      if(platform==='instagram'&&!hasCards)throw new Error('Instagram에 첨부할 카드뉴스를 먼저 생성해주세요.');
      if(document.getElementById('include-card-news')?.checked&&!hasCards)throw new Error('카드뉴스 포함이 선택되어 있습니다. 카드뉴스를 먼저 생성해주세요.');
      const draft=structuredClone(state.text_drafts[platform]);
      let text=[draft.opening,...(draft.paragraphs||[]),draft.closing||'',Array.isArray(draft.hashtags)?draft.hashtags.join(' '):'']
        .filter(value=>typeof value==='string'&&value.trim()).join('\n\n');
      if(platform==='threads'&&draft.include_source_link!==false&&draft.source_url){
        const url=new URL(draft.source_url);
        if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('원문 링크를 확인해주세요.');
        text+='\n\n'+url.href;
      }
      if(!text.trim())throw new Error('원고를 확인해주세요.');
      if(platform==='threads'&&text.length>500)throw new Error('Threads 글·줄바꿈·링크를 합쳐 500자 이내로 수정해주세요. 현재 '+text.length+'자입니다.');
      const a=hasCards?state.card_news_generation_input?.article:null,b=draft.generation_input?.article;
      if(a&&b&&(a.title!==b.title||a.content!==b.content))throw new Error('원고와 카드뉴스의 기사 원문이 다릅니다. 같은 원문으로 생성해주세요.');
      if(hasCards&&state.card_news?.article_id&&draft.article_id&&state.card_news.article_id!==draft.article_id)throw new Error('원고와 카드뉴스의 기사 ID가 다릅니다. 같은 기사로 다시 생성해주세요.');
      if(hasCards&&(state.card_news?.snapshot_id||draft.snapshot_id)&&state.card_news?.snapshot_id!==draft.snapshot_id)throw new Error('원고와 카드뉴스의 고정본이 다릅니다. 같은 고정본으로 다시 생성해주세요.');
      refreshReview();
      const cards=hasCards?structuredClone(state.cards):[];
      const expected=CardEditor.getRevision();
      const surfaces=[...document.querySelectorAll('.panel')],previous=surfaces.map(el=>el.inert);
      surfaces.forEach(el=>{el.inert=true;});
      try {
        const assets=cards.length?await NewsApi.renderPublishCards(cards,(page,total)=>{status.textContent=`최신 카드 이미지 생성 ${page}/${total}장`;}):[];
        if(CardEditor.getRevision()!==expected)throw new Error('편집 내용이 변경됐습니다. 다시 준비해주세요.');
        status.textContent=name+' 전용 창에 글과 사진을 넣고 있습니다…';
        session.prepared=await NewsApi[api+'Prepare']({text,assets}); session.preparedRevision=expected;
        status.textContent=session.prepared.message+'\n이미지 '+session.prepared.image_count+'장. 확인 전에는 공유하지 않습니다.\n'+reviewStatus.textContent;
      } finally {surfaces.forEach((el,index)=>{el.inert=previous[index];});}
    });
    share.onclick=()=>run('실제 공유',async()=>{
      if(!session.prepared||!reviewed.checked)throw new Error('계정과 작성 내용을 먼저 확인해주세요.');
      if(CardEditor.getRevision()!==session.preparedRevision)throw new Error('앱의 편집 내용이 바뀌었습니다. 전용 창을 닫고 새 원고로 다시 준비해주세요.');
      const id=session.prepared.id;
      // 통신 결과가 불확실해도 동일 묶음을 재공유하지 않습니다.
      session.prepared={...session.prepared,status:'sharing'};
      const result=await NewsApi[api+'Publish'](id,true);
      session.prepared={...session.prepared,status:result.status};status.textContent=result.message;
    });
    close.onclick=()=>run('전용 창 닫기',async()=>{
      await NewsApi[api+'Close']();session.prepared=null;reviewed.checked=false;
      status.textContent='전용 창을 닫았습니다. 다음 연결 시 저장된 로그인 상태를 다시 사용합니다. 인증이 만료되면 다시 로그인해야 합니다.';
    });
    section.addEventListener('input',refreshReview);
    window.addEventListener('news:cards-changed',refreshReview);
    updateShare();
  }
  const observer=new MutationObserver(attach);
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('pagehide',()=>observer.disconnect(),{once:true}); attach();
})();
