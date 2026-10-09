// 기사 입력과 생성 조건. 원문은 화면 입력칸 대신 내부 상태로 보관합니다.
// 추후 DB 기사 선택 기능은 NewsInput.restore({ article, ... })로 같은 계약을 사용합니다.
(() => {
  const panel = document.getElementById("platform-panel") || document.querySelector(".left .panel");
  if (!panel) return;
  const source = document.createElement("section");
  source.className = "panel";
  source.id = "article-source-panel";
  source.innerHTML = `<h2>기사 원문 불러오기</h2>
    <label for="article-url">기사 URL</label>
    <input id="article-url" type="url" maxlength="2048" placeholder="https://신문사주소/기사주소">
    <button id="import-article" type="button">기사 불러오기</button>
    <p id="article-import-status" class="notice" role="status" aria-live="polite">URL을 입력하고 기사를 불러와주세요.</p>
    <label for="article-title">기사 제목</label>
    <input id="article-title" type="text" maxlength="500" placeholder="불러온 기사 제목">
    <p id="article-source-summary" class="notice"></p>`;
  document.querySelector(".left").prepend(source);
  const conditions = document.createElement("section");
  conditions.innerHTML = `<div id="article-generation-fields" style="margin-top:20px">
    <h2>키워드와 제작 조건</h2>
    <label for="custom-keywords">직접 추가할 키워드 (선택)</label>
    <input id="custom-keywords" type="text" placeholder="입력하지 않아도 생성됩니다. 예: 반도체, 인공지능">
    <p id="keyword-selection" class="notice"></p>
    <label for="article-requirements">제작 요구사항 (선택)</label>
    <textarea id="article-requirements" rows="4" maxlength="3000" placeholder="입력하지 않으면 기본 작성 규칙을 적용합니다."></textarea></div>`;
  panel.insertBefore(conditions, panel.querySelector(".photo-tools"));
  const style = document.createElement("style");
  style.textContent = `#article-url,#article-title,#custom-keywords,#article-requirements{width:100%;padding:11px;border:1px solid #c9c9c1;border-radius:9px;font:inherit;line-height:1.6;margin-bottom:12px}#article-requirements{resize:vertical}section label[for]{display:block;font-size:13px;font-weight:700;margin:14px 0 7px}`;
  document.head.append(style);
  const $ = id => document.getElementById(id);
  let article = { article_id: "article_01", url: "", title: "", content: "" };
  let importing = false;
  const getKeywords = () => [...new Set($("custom-keywords").value.split(/[,，\n]/).map(v=>v.trim()).filter(Boolean))];
  function updateSelection() {
    const words=getKeywords();
    $("keyword-selection").textContent=words.length ? "선택한 키워드: "+words.join(", ") : "미입력 시 기사 핵심을 기준으로 생성합니다.";
  }
  function showSource() {
    $("article-source-summary").textContent=article.content ? `원문 ${article.content.length.toLocaleString()}자 보관 중 · 생성과 검수에 사용합니다.` : "불러온 원문이 없습니다.";
  }
  // 생성·검수·저장이 사용하는 공통 입력 계약. DB 연결 시 원문 및 ID를 그대로 전달합니다.
  window.NewsInput = {
    restore(saved) {
      article = structuredClone(saved?.article || {article_id:"article_01",url:"",title:"",content:""});
      $("article-url").value=article.url || "";
      $("article-title").value=article.title || "";
      $("custom-keywords").value=Array.isArray(saved?.selected_keywords) ? saved.selected_keywords.join(", ") : "";
      $("article-requirements").value=saved?.requirements || "";
      showSource();updateSelection();
    },
    getRequest() {
      return {article:{...article,title:$("article-title").value.trim()},
        include_card_news:$("include-card-news")?.checked===true,
        selected_keywords:getKeywords(),requirements:$("article-requirements").value.trim(),
        platforms:[...document.querySelectorAll(".platform input:checked")].map(el=>el.value)};
    }
  };
  $("custom-keywords").addEventListener("input",updateSelection);
  // URL 변경 시 이전 기사 원문과 제목을 초기화합니다.
  $("article-url").addEventListener("input",()=>{
    article={article_id:"article_01",url:"",title:"",content:""};
    $("article-title").value="";showSource();
    $("article-import-status").textContent="";
  });
  $("import-article").addEventListener("click",async()=>{
    if(importing)return;
    const status=$("article-import-status"),url=$("article-url").value.trim();
    try { const u=new URL(url);if(!["http:","https:"].includes(u.protocol))throw Error(); }
    catch { status.textContent="http:// 또는 https://로 시작하는 기사 URL을 입력해주세요.";return; }
    if([...document.querySelectorAll("#generate-card-news,#generate-selected")].some(el=>el.disabled)){
      status.textContent="진행 중인 생성이 끝난 뒤 불러와주세요.";return;
    }
    if(article.content && !confirm("현재 기사를 새로 불러온 기사로 교체할까요?"))return;
    const fields=[...document.querySelectorAll("#article-source-panel input,#import-article,#generate-card-news,#generate-selected,#save,#load,#load-local-draft")];
    const previous=fields.map(el=>el.disabled);fields.forEach(el=>el.disabled=true);importing=true;
    status.textContent="기사를 불러오고 있습니다…";
    try {
      const result=await window.NewsApi.importArticle(url);
      if(!result.article?.title?.trim() || !result.article?.content?.trim())throw Error("기사 제목 또는 본문이 비어 있습니다.");
      article=structuredClone(result.article);
      $("article-url").value=article.url || url;$("article-title").value=article.title;
      showSource();status.textContent="불러오기 완료. 키워드와 제작 요구사항은 입력하지 않아도 됩니다.";
    }catch(error){status.textContent="불러오기 실패: "+error.message;}
    finally {fields.forEach((el,i)=>el.disabled=previous[i]);importing=false;}
  });
  updateSelection();showSource();
})();
