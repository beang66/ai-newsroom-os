// 텍스트 편집은 글 영역, 위치 이동은 전용 손잡이로 분리합니다. 위치는 카드의 1080×1350 좌표입니다.
(() => {
  const canvas=document.getElementById('canvas');
  const style=document.createElement('style');
  style.textContent=`#canvas [data-field].position-selected{outline:2px dashed #d1f38a;outline-offset:3px} #canvas [data-field].layout-problem{outline:2px solid #e55858;outline-offset:3px}
    #canvas .text-move-handle{position:absolute;z-index:20;background:#d1f38a;color:#101010;border:0;border-radius:8px;padding:8px 14px;font-size:24px;line-height:1.2;width:auto;cursor:move;touch-action:none;user-select:none}`;
  document.head.append(style);
  let selected=null,handle=null,drag=null;
  function clear(){selected?.classList.remove('position-selected');handle?.remove();selected=handle=null;}
  function placeHandle(){
    if(!selected?.isConnected){clear();return;}
    const article=selected.closest('.news-card'),a=article.getBoundingClientRect(),b=selected.getBoundingClientRect(),ratio=a.width/1080;
    handle.style.left=Math.max(0,Math.min(1080-handle.offsetWidth,(b.left-a.left)/ratio))+'px';
    handle.style.top=Math.max(0,Math.min(1350-handle.offsetHeight,(b.top-a.top)/ratio-handle.offsetHeight-8))+'px';
  }
  canvas.addEventListener('pointerdown',event=>{
    const field=event.target.closest('[data-field][contenteditable=true]');
    if(!field)return;
    clear();selected=field;selected.classList.add('position-selected');
    handle=document.createElement('button');handle.type='button';handle.tabIndex=-1;handle.className='text-move-handle';handle.textContent='↔ 이동';handle.setAttribute('aria-label',field.getAttribute('aria-label')+' 이동');
    field.closest('.news-card').append(handle);placeHandle();
    handle.addEventListener('pointerdown',start);
  });
  function start(event){
    if(event.button!==0||!selected?.isConnected)return;
    event.preventDefault();event.stopPropagation();
    const card=current(),article=selected.closest('.news-card'),a=article.getBoundingClientRect(),b=selected.getBoundingClientRect(),ratio=a.width/1080;
    const p=CardModel.positions(card.text_positions)[selected.dataset.field]||{x:0,y:0};
    drag={card,id:card.card_id,field:selected.dataset.field,p,clientX:event.clientX,clientY:event.clientY,ratio,
      baseX:(b.left-a.left)/ratio-p.x,baseY:(b.top-a.top)/ratio-p.y,width:b.width/ratio,height:b.height/ratio,changed:false,pointer:event.pointerId};
    handle.setPointerCapture(event.pointerId);
    handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  }
  function move(event){
    if(!drag||event.pointerId!==drag.pointer||current()!==drag.card)return;
    const clamp=(n,min,max)=>Math.max(min,Math.min(Math.max(min,max),n));
    const x=clamp(drag.p.x+(event.clientX-drag.clientX)/drag.ratio,-drag.baseX,1080-drag.width-drag.baseX);
    const y=clamp(drag.p.y+(event.clientY-drag.clientY)/drag.ratio,-drag.baseY,1350-drag.height-drag.baseY);
    drag.card.text_positions={...CardModel.positions(drag.card.text_positions),[drag.field]:{x,y}};
    selected.style.transform=`translate(${x}px,${y}px)`;drag.changed=drag.changed||x!==drag.p.x||y!==drag.p.y;
    placeHandle();checkCardFit();
  }
  function end(){
    if(!drag)return;const changed=drag.changed;drag=null;
    handle?.removeEventListener('pointermove',move);handle?.removeEventListener('pointerup',end);handle?.removeEventListener('pointercancel',end);
    if(changed){dirty();tell('텍스트 위치 변경됨 · 재검수 필요');}
    placeHandle();
  }
  new MutationObserver(()=>{if(selected&&!selected.isConnected)clear();}).observe(canvas,{childList:true,subtree:true});
  window.addEventListener('resize',()=>{if(selected)placeHandle();});
  canvas.addEventListener('input',()=>{if(selected)placeHandle();});
  document.getElementById('reset-text-positions').addEventListener('click',()=>{
    clear();current().text_positions={};dirty();draw();tell('현재 카드의 텍스트 위치를 기본 배치로 복원했습니다.');
  });
})();
