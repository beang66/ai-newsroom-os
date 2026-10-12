// DB 원문은 팀 Core에서만 읽는다. 제목·부제는 기사 편집 화면에서 수정한다.
(() => {
  const panel=document.getElementById('platform-panel'); if(!panel)return;
  const source=document.createElement('section'); source.className='panel'; source.id='article-source-panel';
  source.innerHTML=`<h2>불러온 기사</h2><label for="db-article">DB 기사 선택</label>
    <select id="db-article"><option value="">기사 선택</option></select><button id="refresh-db-articles">목록 새로고침</button>
    <p id="article-import-status" class="notice" role="status" aria-live="polite">기사 미선택</p>
    <h3>기사 제목</h3><p id="article-title" class="article-metadata"></p>
    <h3>부제목</h3><p id="article-subtitle" class="article-metadata">부제목 없음</p>
    <a id="article-link" target="_blank" rel="noreferrer" hidden>원문 출처 링크</a>
    <p id="article-source-summary" class="notice"></p>`;
  document.querySelector('.left').prepend(source);
  const conditions=document.createElement('section'); conditions.innerHTML=`<div id="article-generation-fields" style="margin-top:20px">
    <h2>키워드와 제작 조건</h2><label for="custom-keywords">직접 추가할 키워드 (선택)</label>
    <input id="custom-keywords" maxlength="2100" placeholder="예: 반도체, 인공지능"><p id="keyword-selection" class="notice"></p>
    <label for="article-requirements">제작 요구사항 (선택)</label>
    <textarea id="article-requirements" rows="4" maxlength="3000" placeholder="미입력 시 기본 작성 규칙을 적용합니다."></textarea></div>`;
  panel.append(conditions);
  const style=document.createElement('style');style.textContent=`.article-metadata{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}
    #db-article,#custom-keywords,#article-requirements{width:100%;padding:11px;border:1px solid #c9c9c1;border-radius:9px;font:inherit;margin-bottom:12px}
    #article-requirements{resize:vertical}section label[for]{display:block;font-size:13px;font-weight:700;margin:14px 0 7px}`;document.head.append(style);
  const $=id=>document.getElementById(id),empty=()=>({article_id:'',title:'',subtitle:'',content:'',url:''});
  let article=empty(),epoch=0,listEpoch=0,busy=false;
  let editorBaseline=window.CardEditor?.getRevision() || 0;
  const getKeywords=()=>[...new Set($('custom-keywords').value.split(/[,，\n]/u).map(word=>word.trim()).filter(Boolean))];
  function updateSelection(){const words=getKeywords();$('keyword-selection').textContent=words.length?'선택한 키워드: '+words.join(', '):'미입력 시 기사 핵심을 기준으로 생성합니다.';}
  function showSource(){
    $('article-title').textContent=article.title || '기사 미선택';$('article-subtitle').textContent=article.subtitle || '부제목 없음';
    $('article-source-summary').textContent=article.content?`원문 ${article.content.length.toLocaleString()}자 · Core 고정본으로 생성합니다.`:article.title?'기사 본문 없음':'DB 기사를 선택해주세요.';
    $('article-link').hidden=!/^https?:\/\//iu.test(article.url || '');$('article-link').href=article.url || '';
    $('db-article').value=article.article_id || '';
  }
  window.NewsInput={
    restore(saved){++epoch;article=structuredClone(saved?.article || empty());
      editorBaseline=window.CardEditor?.getRevision() || 0;
      $('custom-keywords').value=(saved?.selected_keywords || []).join(', ');$('article-requirements').value=saved?.requirements || '';showSource();updateSelection();},
    getRequest(){return {article:structuredClone(article),selected_keywords:getKeywords(),requirements:$('article-requirements').value.trim(),
      include_card_news:$('include-card-news')?.checked===true,platforms:[...document.querySelectorAll('.platform input:checked')].map(el=>el.value)};},
    isCurrent(input){return ['article_id','title','subtitle','url','content'].every(key=>String(input.article?.[key] || '').replace(/\s+/gu,' ').trim()===String(article[key] || '').replace(/\s+/gu,' ').trim());},
    // 단일·일괄 생성은 같은 불변 고정본을 사용한다. 플랫폼 편집본과 원문을 분리한다.
    async freeze(input){const expected=JSON.stringify(article),ticket=epoch;
      const snap=await window.NewsApi.freezeDbArticle(input.article);
      if(ticket!==epoch || expected!==JSON.stringify(article))throw Error('기사가 변경되어 결과를 적용하지 않았습니다.');
      input.snapshot_id=snap.id;input.article={article_id:snap.article_id,title:snap.title,subtitle:snap.subtitle,url:snap.url,content:snap.body_text};
      return input;
    },
    async select(id){
      if(busy || ['generate-selected','generate-card-news','validate-current-draft'].some(key=>$(key)?.disabled)){showSource();return;}
      busy=true;const ticket=++epoch,previous=article;let preserved=false;
      try {
        if(window.CardEditor?.getRevision()!==editorBaseline || getKeywords().length || $('article-requirements').value.trim()){
          if(!confirm('현재 플랫폼 편집을 초안에 저장하고 다른 기사를 불러올까요?'))return;
          await window.NewsApi.saveLocalDraft(window.CardEditor.snapshot());
        }
        preserved=true;article=empty();showSource();$('article-import-status').textContent='기사 불러오는 중…';
        const response=await window.NewsApi.getDbArticle(id);if(ticket!==epoch)return;
        const draft=response.draft;if(!draft)throw Error('기사가 삭제되었거나 조회되지 않습니다.');
        let content=draft.content;
        if(typeof content!=='string'){
          if(typeof draft.bodyHtml!=='string')throw Error('기사 본문 형식을 읽을 수 없습니다.');
          const doc=new DOMParser().parseFromString(draft.bodyHtml.replace(/<br\s*\/?>/gu,'\n').replace(/<\/p>/gu,'\n'),'text/html');
          doc.querySelectorAll('figure,s,del').forEach(el=>el.remove());content=doc.body.textContent.trim();
        }
        content=content.split('\n').filter(line=>!/^\s*\[사진:[^\]]+\]\s*$/u.test(line)).join('\n');
        const next={article_id:draft.articleId,title:draft.title || '',subtitle:draft.subtitle || '',url:draft.url || '',content};
        window.CardEditor?.resetForArticle();window.NewsInput.restore({article:next});
        $('include-card-news').checked=false;$('custom-keywords').value='';$('article-requirements').value='';updateSelection();
        $('article-import-status').textContent=content?'DB 기사 불러오기 완료':'기사 본문 없음 · 기사 편집 화면에서 확인해주세요.';
      }catch(error){if(ticket===epoch){article=preserved?empty():previous;showSource();$('article-import-status').textContent='기사 조회 실패: '+error.message;}}
      finally{busy=false;showSource();}
    },
  };
  async function refresh(){const ticket=++listEpoch;$('article-import-status').textContent='기사 목록 불러오는 중…';
    try{const result=await window.NewsApi.listDbArticles();if(ticket!==listEpoch)return;
      $('db-article').replaceChildren(new Option('기사 선택',''),...(result.articles || []).map(item=>new Option(item.title || '제목 없는 기사',item.id.replaceAll('-',''))));
      showSource();$('article-import-status').textContent=article.article_id?'DB 기사 선택됨':'기사 미선택';
    }catch(error){if(ticket===listEpoch)$('article-import-status').textContent='기사 목록 조회 실패: '+error.message;}}
  $('custom-keywords').addEventListener('input',updateSelection);$('db-article').addEventListener('change',event=>event.target.value&&window.NewsInput.select(event.target.value));
  $('refresh-db-articles').addEventListener('click',refresh);updateSelection();showSource();void refresh();
})();
