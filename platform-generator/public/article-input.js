// 개발용 편집실: 기존 플랫폼 초안의 입력만 복원한다. DB 조회·기사 업로드·URL 수집 경로는 없다.
(() => {
  const panel = document.getElementById('platform-panel'); if (!panel) return;
  const source = document.createElement('section'); source.className = 'panel'; source.id = 'article-source-panel';
  source.innerHTML = `<h2>불러온 기사</h2>
    <p id="article-import-status" class="notice" role="status">저장 기사 선택·고정본 생성은 팀 앱의 변환·배포 화면에서 진행해주세요. 이 창은 개발용 편집실입니다.</p>
    <h3>기사 제목</h3><p id="article-title" class="article-metadata"></p>
    <h3>부제목</h3><p id="article-subtitle" class="article-metadata"></p>
    <a id="article-link" target="_blank" rel="noreferrer" hidden>원문 출처 링크</a>
    <p id="article-source-summary" class="notice"></p>`;
  document.querySelector('.left').prepend(source);
  const conditions = document.createElement('section'); conditions.innerHTML = `<div id="article-generation-fields" style="margin-top:20px">
    <h2>키워드와 제작 조건</h2><label for="custom-keywords">직접 추가할 키워드 (선택)</label>
    <input id="custom-keywords" maxlength="2100" placeholder="예: 반도체, 인공지능"><p id="keyword-selection" class="notice"></p>
    <label for="article-requirements">제작 요구사항 (선택)</label>
    <textarea id="article-requirements" rows="4" maxlength="3000" placeholder="미입력 시 기본 작성 규칙을 적용합니다."></textarea></div>`;
  panel.append(conditions);
  const style = document.createElement('style'); style.textContent = `.article-metadata{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}
    #custom-keywords,#article-requirements{width:100%;padding:11px;border:1px solid #c9c9c1;border-radius:9px;font:inherit;margin-bottom:12px}
    #article-requirements{resize:vertical}section label[for]{display:block;font-size:13px;font-weight:700;margin:14px 0 7px}`;
  document.head.append(style);
  const $ = id => document.getElementById(id);
  let article = {article_id:'', title:'', content:''}, display = {}, sourceUrl = '';
  const keywords = () => [...new Set($('custom-keywords').value.split(/[,，\n]/u).map(word => word.trim()).filter(Boolean))];
  function showSource() {
    $('article-title').textContent = article.title || '기사 미선택';
    $('article-subtitle').textContent = display.subtitle === undefined ? '부제 전달 미연결' : display.subtitle || '부제목 없음';
    $('article-source-summary').textContent = article.content ? `복원 원문 ${article.content.length.toLocaleString()}자 · 개발용 입력이며 Core 고정본 연결 검증은 아닙니다.` : article.title ? '기사 본문 없음' : '기존 플랫폼 초안을 복원하거나 팀 앱을 이용해주세요.';
    $('article-link').hidden = !/^https?:\/\//iu.test(sourceUrl); $('article-link').href = sourceUrl;
  }
  function updateSelection() { const words = keywords(); $('keyword-selection').textContent = words.length ? '선택한 키워드: '+words.join(', ') : '미입력 시 기사 핵심을 기준으로 생성합니다.'; }
  window.NewsInput = {
    restore(saved) {
      const original = saved?.article || {};
      // 객체를 문자열화하거나 본문에서 캡션을 추측해 제거하지 않는다.
      article = {article_id:typeof original.article_id==='string'?original.article_id:'', title:typeof original.title==='string'?original.title:'', content:typeof original.content==='string'?original.content:''};
      display = structuredClone(saved?.article_display || (original.subtitle !== undefined ? {subtitle:original.subtitle} : {}));
      sourceUrl = typeof saved?.source_url==='string' ? saved.source_url : typeof original.url==='string' ? original.url : '';
      $('custom-keywords').value = (saved?.selected_keywords || []).join(', '); $('article-requirements').value = saved?.requirements || '';
      showSource(); updateSelection();
    },
    getRequest() { return {article:structuredClone(article), source_url:sourceUrl, article_display:structuredClone(display), selected_keywords:keywords(), requirements:$('article-requirements').value.trim(),
      include_card_news:$('include-card-news')?.checked===true, platforms:[...document.querySelectorAll('.platform input:checked')].map(el=>el.value)}; },
    isCurrent(input) { const current = this.getRequest(); return ['article','selected_keywords','requirements','include_card_news','platforms'].every(key=>JSON.stringify(input[key])===JSON.stringify(current[key])); },
    capture(input) {
      if (!this.isCurrent(input)) throw Error('기사·조건이 변경되어 결과를 적용하지 않았습니다.');
      // 새 공통 ID·고정본을 만들지 않는다. 단독 Node 결과를 Core 검증 결과로 표시하지 않는다.
      delete input.snapshot_id; input.development_only = true; return input;
    },
  };
  $('custom-keywords').addEventListener('input', updateSelection); showSource(); updateSelection();
})();
