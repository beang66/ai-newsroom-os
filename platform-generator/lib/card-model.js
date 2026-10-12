// 생성·편집·검수·출력에서 공유하는 카드 필드와 이전 초안 호환 규칙입니다.
(function(root){
  const text=value=>typeof value==='string'?value:'';
  function options(value={}) {
    return {closing_type:value.closing_type==='service'?'service':'summary',service_message:text(value.service_message)};
  }
  function roleAt(index,total){return index===0?'cover':index===total-1?'closing':'body';}
  function normalize(card={}) {
    const c=card.content||card;
    const {content,...rest}=card;
    return {...rest,keyword:text(c.keyword),headline:text(c.headline),body:text(c.body),
      answer:text(c.answer),detail:text(c.detail),
      content_version:card.content_version===1?1:card.content_version===2||typeof c.answer==='string'||typeof c.detail==='string'?2:1,
      show_keyword:c.show_keyword!==false&&card.show_keyword!==false,
      farewell:text(c.farewell||card.farewell),
      text_positions:positions(card.text_positions),
      closing_type:card.closing_type==='service'?'service':'summary',
      service_message:text(card.service_message)};
  }
  // 이전 초안의 알 수 없는 위치·자료형은 기본 배치로 처리합니다.
  function positions(value={}){
    const result={};
    for(const key of ['keyword','headline','body','answer','detail','farewell','service_message']){
      const p=value&&value[key];
      if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))result[key]={x:Math.max(-1080,Math.min(1080,p.x)),y:Math.max(-1350,Math.min(1350,p.y))};
    }
    return result;
  }
  function isService(card){return card.role==='closing'&&card.closing_type==='service';}
  function details(card){const c=normalize(card);return c.content_version===2?c.detail:c.body;}
  function display(card,index,total,settings) {
    const c=normalize(card),role=roleAt(index,total);
    return {...c,role,page:index+1,total_pages:total,
      // 서비스 안내만 저장된 이전 카드는 문구를 잃지 않고 이전 형식으로 엽니다.
      closing_type:role==='closing'&&isService(c)?'service':'summary',
      service_message:role==='closing'?c.service_message:''};
  }
  function normalizeRoles(cards,settings){return cards.map((c,i)=>display(c,i,cards.length,settings));}
  function layoutError(card) {
    const c=normalize(card),layout=c.design?.layout||'standard';
    if(isService(c))return c.service_message.trim()?'':'서비스 안내 문구를 입력해주세요.';
    if(!['standard','comparison','list','steps','stat'].includes(layout))return '지원하지 않는 정보 배치입니다.';
    if(c.role!=='body'&&layout!=='standard')return '표지와 마지막 카드는 설명형 배치를 사용해주세요.';
    const lines=details(c).split('\n').filter(line=>line.trim());
    if(layout==='comparison'&&lines.length!==2)return '비교형 상세 설명은 두 항목으로 줄바꿈해주세요.';
    if(['list','steps'].includes(layout)&&(lines.length<2||lines.length>4))return '목록·단계형 상세 설명은 2~4개 항목으로 줄바꿈해주세요.';
    return '';
  }
  const api={options,roleAt,normalize,isService,details,display,normalizeRoles,layoutError,positions};
  if(typeof module!=='undefined')module.exports=api;else root.CardModel=api;
})(typeof window!=='undefined'?window:globalThis);
