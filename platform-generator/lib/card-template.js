// 화면과 JPG에 같은 디자인·글 맞춤을 적용합니다. 이전 초안은 기본 배치로 표시합니다.
(function(root){
const CardModel=typeof module!=='undefined'?require('./card-model'):root.CardModel;
const baseCss="*{box-sizing:border-box}\n.news-card{--accent:#d1f38a;--text-scale:1;--words-top:154px;--words-limit:1056px;width:1080px;height:1350px;position:relative;overflow:hidden;background:#101010;color:#f6f6f2;font-family:Arial,'Malgun Gothic','Noto Sans KR',sans-serif}\n.news-card .photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}\n.news-card .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.65),rgba(0,0,0,.86))}\n.news-card .card-top{position:absolute;top:54px;left:80px;right:80px;display:flex;justify-content:space-between;color:#aaa;font-size:22px;letter-spacing:1px}\n.news-card .card-top span:last-child{color:var(--accent)}\n.news-card .words{position:absolute;left:80px;right:80px;top:var(--words-top);max-height:var(--words-limit);overflow:visible;min-width:0}\n.news-card .keyword{color:var(--accent);font-size:calc(29px * var(--text-scale));font-weight:700;line-height:1.45;margin-bottom:30px;padding-top:22px;position:relative}\n.news-card .keyword:before{content:'';position:absolute;top:0;left:0;width:72px;height:6px;background:var(--accent)}\n.news-card .headline{font-size:calc(66px * var(--text-scale));font-weight:900;line-height:1.24;margin-bottom:40px;text-wrap:balance;letter-spacing:-1px}\n.news-card .body{font-size:calc(37px * var(--text-scale));line-height:1.65;color:#e2e2dd}\n.news-card [data-field]{white-space:pre-wrap;overflow-wrap:anywhere;word-break:keep-all;min-height:1em}\n.news-card [contenteditable=true]:focus{outline:2px dashed var(--accent);outline-offset:8px}\n.news-card mark{background:transparent;color:var(--accent);font-weight:800}\n.news-card .body .card-line{white-space:pre-wrap;min-width:0}\n.news-card.role-cover{--words-top:210px;--words-limit:960px}\n.news-card.role-cover .headline{font-size:calc(94px * var(--text-scale));line-height:1.2;margin-bottom:48px}\n.news-card.role-cover .body{font-size:calc(34px * var(--text-scale));line-height:1.55;color:#c8c8c2}\n.news-card.role-closing{--words-top:220px;--words-limit:950px}\n.news-card.role-closing .headline{font-size:calc(78px * var(--text-scale));margin-bottom:42px}\n.news-card.role-closing .body{border-top:2px solid #45453f;padding-top:30px}\n.news-card.layout-comparison .body{display:grid;grid-template-columns:1fr 1fr;gap:24px;font-size:calc(33px * var(--text-scale))}\n.news-card.layout-comparison .card-line{padding:26px;background:rgba(255,255,255,.065);border-top:5px solid var(--accent)}\n.news-card.layout-list .body,.news-card.layout-steps .body{display:grid;gap:24px;counter-reset:step}\n.news-card.layout-list .card-line,.news-card.layout-steps .card-line{position:relative;padding-left:58px;padding-bottom:22px;border-bottom:1px solid #444}\n.news-card.layout-list .card-line:before{content:'•';position:absolute;left:6px;color:var(--accent)}\n.news-card.layout-steps .card-line:before{counter-increment:step;content:counter(step,decimal-leading-zero);position:absolute;left:0;top:5px;color:var(--accent);font-size:calc(25px * var(--text-scale));font-weight:800}\n.news-card.layout-stat .body{font-size:calc(46px * var(--text-scale));line-height:1.5}\n.news-card.layout-stat .body mark{font-size:calc(64px * var(--text-scale))}\n.news-card .credit{position:absolute;left:80px;right:80px;bottom:32px;text-align:right;font-size:18px;color:#aaa}\n.news-card .card-footer{position:absolute;left:80px;right:80px;bottom:80px;font-size:21px;color:#aaa;border-top:1px solid #333;padding-top:18px}\n.news-card a{color:inherit}";

 const css=baseCss + '.news-card .answer{font-size:calc(44px * var(--text-scale));font-weight:800;line-height:1.45;margin-bottom:32px;color:#f6f6f2}.news-card .service_message{font-size:calc(48px * var(--text-scale));font-weight:700;line-height:1.6}.news-card .headline{white-space:pre-wrap;overflow-wrap:normal;word-break:keep-all}.news-card .body{margin-bottom:0}.news-card .answer:empty,.news-card .body:empty{display:none}.news-card .farewell{font-size:32px;line-height:1.6;margin-top:28px;color:#c8c8c2}';
 // 마지막 항목 뒤의 불필요한 구분선·여백이 본문을 경계 밖으로 밀지 않게 한다.
 const trailingCss='.news-card.layout-list .card-line:last-child,.news-card.layout-steps .card-line:last-child{padding-bottom:0;border-bottom:0}';
 // 새 생성본에만 여백을 줄일 수 있게 한다. 기존 저장본과 수동 배치는 원래 크기를 유지한다.
 const adaptiveCss='.news-card[data-auto-fit="true"]{--space-scale:1}.news-card[data-auto-fit="true"] .keyword{margin-bottom:calc(30px * var(--space-scale));padding-top:calc(22px * var(--space-scale))}.news-card[data-auto-fit="true"] .headline{margin-bottom:calc(40px * var(--space-scale))}.news-card[data-auto-fit="true"].role-cover .headline{margin-bottom:calc(48px * var(--space-scale))}.news-card[data-auto-fit="true"].role-closing .headline{margin-bottom:calc(42px * var(--space-scale))}.news-card[data-auto-fit="true"] .answer{margin-bottom:calc(32px * var(--space-scale))}.news-card[data-auto-fit="true"].layout-list .body,.news-card[data-auto-fit="true"].layout-steps .body{gap:calc(24px * var(--space-scale))}.news-card[data-auto-fit="true"].layout-list .card-line,.news-card[data-auto-fit="true"].layout-steps .card-line{padding-bottom:calc(22px * var(--space-scale))}.news-card[data-auto-fit="true"].role-closing .body{padding-top:calc(30px * var(--space-scale))}.news-card[data-auto-fit="true"] .farewell{margin-top:calc(28px * var(--space-scale))}';
 const layouts=['standard','comparison','list','steps','stat'];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function normalizeDesign(card){const d=card.design||{};return {layout:layouts.includes(d.layout)?d.layout:'standard',highlights:Array.isArray(d.highlights)?d.highlights.filter(t=>typeof t==='string'&&t.trim()).slice(0,8).map(t=>t.trim()):[],compact:d.compact===true};}
 function validImage(v){if(!v)return '';if(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v))return v;try{const u=new URL(v);if(u.protocol==='https:'&&u.hostname==='images.unsplash.com')return u.href;}catch{}return '';}
 // 사진 표현값은 미리보기·저장 JPG가 같은 함수로 정규화합니다.
 function normalizePhoto(image={}) {
   const p=image.presentation||{};
   const limit=(value,min,max,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
   return {zoom:limit(p.zoom,1,3,1),x:limit(p.x,0,100,50),y:limit(p.y,0,100,50),strength:limit(p.strength,0,100,86),direction:['legacy','bottom','top','left','right','uniform'].includes(p.direction)?p.direction:'legacy'};
 }
 function photoStyles(image) {
   const p=normalizePhoto(image),alpha=p.strength/100;
   const angle={legacy:180,bottom:180,top:0,left:270,right:90}[p.direction];
   const start=p.direction==='legacy'?alpha*(65/86):0;
   return {photo:`object-position:${p.x}% ${p.y}%;transform:scale(${p.zoom});transform-origin:${p.x}% ${p.y}%`,shade:p.direction==='uniform'?`background:rgba(0,0,0,${alpha})`:`background:linear-gradient(${angle}deg,rgba(0,0,0,${start}),rgba(0,0,0,${alpha}))`};
 }
 function creditUrl(v){try{const u=new URL(v);if(u.protocol==='https:'&&u.hostname==='unsplash.com'){u.searchParams.set('utm_source','news_card_editor');u.searchParams.set('utm_medium','referral');return u.href;}}catch{}return 'https://unsplash.com/?utm_source=news_card_editor&utm_medium=referral';}
 function creditMarkup(image={}){
   const name=image.photographer||image.source;
   if(!name)return '';
   const link=image.sourceUrl||image.profile;
   let external='';try{const u=new URL(link);if(u.protocol==='https:')external=u.href;}catch{}
   const unsplash=image.provider==='unsplash'||image.unsplashId||(!image.provider&&external&&new URL(external).hostname==='unsplash.com');
   const label=unsplash?'Photo by '+esc(name):esc(name);
   return '<div class="credit">'+(external?'<a target="_blank" rel="noopener" href="'+esc(unsplash?creditUrl(external):external)+'">'+label+'</a>':label)+(unsplash?' on <a target="_blank" rel="noopener" href="https://unsplash.com/?utm_source=news_card_editor&utm_medium=referral">Unsplash</a>':'')+'</div>';
 }
 // 현재 글에 있는 구절만 강조합니다. 원고에 새로운 표현을 추가하지 않습니다.
 function highlighted(text,d){const value=String(text??'');const terms=[...d.highlights];const candidates=[...new Set(terms)].filter(t=>value.includes(t)).sort((a,b)=>b.length-a.length);if(!candidates.length)return esc(value);const re=new RegExp(candidates.map(t=>t.replace(/[.*+?^$(){}|[\]\\]/g,'\\$&')).join('|'),'gu');let result='',end=0;for(const m of value.matchAll(re)){result+=esc(value.slice(end,m.index))+'<mark>'+esc(m[0])+'</mark>';end=m.index+m[0].length;}return result+esc(value.slice(end));}
 // 본문 줄바꿈을 정보 배치에 사용하며, 텍스트·사진·출처는 그대로 보존합니다.
 function markup(card,editable=false){
   card=CardModel.normalize(card);
   const d=normalizeDesign(card),role=['cover','body','closing'].includes(card.role)?card.role:'body';
   const service=CardModel.isService(card),url=validImage(card.image?.url),photoStyle=photoStyles(card.image);
   const labels={keyword:'키워드',headline:'제목',body:'기존 본문',answer:'핵심 문구',detail:'상세 설명',farewell:'끝인사',service_message:'이전 안내 문구'};
   const field=k=>{
     const value=k==='detail'?CardModel.details(card):card[k];
     const text=['detail','body'].includes(k)&&['comparison','list','steps'].includes(d.layout)?String(value??'').split('\n').filter(line=>line.trim()).map(line=>'<div class="card-line">'+highlighted(line,d)+'</div>').join(''):highlighted(value,d);
     const p=card.text_positions[k]||{x:0,y:0};
     return '<div class="'+k+(k==='detail'?' body':'')+'" data-field="'+k+'" style="transform:translate('+p.x+'px,'+p.y+'px)" '+(editable?'contenteditable="true" role="textbox" aria-label="'+labels[k]+'"':'')+'>'+text+'</div>';
   };
   let words;
   if(service) words=field('service_message');
   else words=(card.show_keyword&&card.keyword?field('keyword'):'')+field('headline')+
     (card.content_version===2?(role!=='cover'&&(editable||card.answer)?field('answer'):'')+((editable||card.detail)?field('detail'):''):((editable||card.body)?field('body'):''))+
     (role==='closing'&&card.farewell?field('farewell'):'');
   const page=Number.isInteger(card.page)?card.page:1,total=Number.isInteger(card.total_pages)?card.total_pages:null;
   return '<article class="news-card role-'+role+' layout-'+d.layout+'" data-layout="'+d.layout+'" data-compact="'+d.compact+'" data-auto-fit="'+(card.auto_fit===true)+'">'+
     (url?'<img class="photo" style="'+esc(photoStyle.photo)+'" alt="선택한 사진" src="'+esc(url)+'"><div class="shade" style="'+esc(photoStyle.shade)+'"></div>':'')+
     '<div class="card-top"><span>'+(service?'서비스 안내':{cover:'핵심 뉴스',body:'주요 내용',closing:'핵심 정리'}[role])+'</span><span>'+page+(total?' / '+total:'')+'</span></div><div class="words">'+words+'</div><div class="card-footer">카드뉴스</div>'+
     (url?creditMarkup(card.image):'')+'</article>';
 }
// 새 생성본만 여백과 글자를 제한적으로 맞춘다. 미리보기와 JPG에서 같은 함수를 사용한다.
function fitCard(card){
  card=card||document.querySelector('.news-card');
  if(!card)return {measured:false,overflow:false,scale:1};
  const words=card.querySelector('.words');
  if(!words||card.getBoundingClientRect().width===0)return {measured:false,overflow:false,scale:1};
  const bounds=card.getBoundingClientRect(),ratio=bounds.width/1080;
  const baseScale=card.dataset.compact==='true'?.9:1,baseLayout=card.dataset.layout||'standard';
  const fields=[...words.querySelectorAll('[data-field]')];
  const moved=fields.some(el=>el.style.transform&&!/^translate\(0px,\s*0px\)$/.test(el.style.transform));
  const setLayout=layout=>{card.classList.remove('layout-standard','layout-comparison','layout-list','layout-steps','layout-stat');card.classList.add('layout-'+layout);};
  const measure=(layout,scale,spaceScale)=>{
    setLayout(layout);
    card.style.setProperty('--text-scale',String(scale));
    card.style.setProperty('--space-scale',String(spaceScale));
    words.style.height=getComputedStyle(card).getPropertyValue('--words-limit');
    let cursor=0;
    for(const el of fields){
      el.style.position='absolute';el.style.left='0';el.style.width='100%';el.style.top=cursor+'px';
      const style=getComputedStyle(el),height=el.getBoundingClientRect().height/ratio;
      if(height>0)cursor+=height+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);
    }
    const visible=fields.filter(el=>el.getBoundingClientRect().height>0);
    const overflowFields=visible.filter(el=>{const r=el.getBoundingClientRect();return el.scrollWidth>el.clientWidth+2||
      r.left<bounds.left-2*ratio||r.right>bounds.right+2*ratio||r.top<bounds.top-2*ratio||r.bottom>bounds.bottom+2*ratio||
      (!moved&&r.bottom>words.getBoundingClientRect().top+words.clientHeight*ratio+2*ratio);}).map(el=>el.dataset.field);
    const overflow=(!moved&&(words.scrollHeight>words.clientHeight+2||words.scrollWidth>words.clientWidth+2))||overflowFields.length>0;
    const overlaps=[];
    visible.forEach(el=>el.classList.remove('layout-problem'));
    for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
      const a=visible[i].getBoundingClientRect(),b=visible[j].getBoundingClientRect();
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2*ratio&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2*ratio){
        overlaps.push([visible[i].dataset.field,visible[j].dataset.field]);
        visible[i].classList.add('layout-problem');visible[j].classList.add('layout-problem');
      }
    }
    card.dataset.overflow=String(overflow);card.dataset.overlap=String(overlaps.length>0);
    return {measured:true,overflow,overlap:overlaps.length>0,overlaps,scale,spaceScale,layout,overflowFields,contentHeight:words.scrollHeight,availableHeight:words.clientHeight};
  };
  const initial=measure(baseLayout,baseScale,1);
  if(!initial.overflow&&!initial.overlap||moved||card.dataset.autoFit!=='true')return initial;
  const layouts=baseLayout==='standard'?[baseLayout]:[baseLayout,'standard'];
  const scales=baseScale===1?[1,.96,.92,.88]:[.9,.87,.85];
  let last=initial;
  for(const scale of scales)for(const layout of layouts)for(const space of [.82,.65]){
    last=measure(layout,scale,space);
    if(!last.overflow&&!last.overlap)return last;
  }
  // 어느 후보도 맞지 않으면 원래 배치로 되돌린 상태에서 명시적으로 실패한다.
  return measure(baseLayout,baseScale,1);
}const api={css:css+adaptiveCss+trailingCss,markup,validImage,normalizeDesign,normalizePhoto,photoStyles,fitCard};if(typeof module!=="undefined")module.exports=api;else root.CardTemplate=api;
})(typeof window!=="undefined"?window:globalThis);
