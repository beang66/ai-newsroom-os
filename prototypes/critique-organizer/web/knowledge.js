/* Independent organizer controller. No untrusted HTML, inferred identity or file moves. */
(() => {
  'use strict';
  const ui={
    catalog:null,graph:{
      nodes:[],edges:[]
    },mode:'list',filters:{
    },generation:0,detailGeneration:0,
    selected:null,focus:null,depth:1,limit:60,angle:0,tilt:.25,zoom:1,panX:0,panY:0,projected:[],drag:null,controller:null
  };
  const kinds={
    document:'자료',project:'취재 건',topic:'주제',person_candidate:'인명 후보',organization_candidate:'기관명 후보'
  };
  const origins={
    user:'사용자 지정',rule_suggestion:'규칙 제안'
  };
  const relations={
    mentions:'문서에 이름이 등장',tagged:'주제 분류',filed_in:'사용자가 취재 건에 연결'
  };
  const post=(url,body)=>api(url,{
    method:'POST',body:JSON.stringify(body)
  });
  const report=e=>{
    $('libraryStatus').textContent=e.message;
  };
  function button(label,fn){
    const b=el('button','',label);
    b.type='button';
    b.onclick=async()=>{
      b.disabled=true;
      try{
        await fn();
      }
      catch(e){
        report(e);
      }
      finally{
        b.disabled=false;
      }
    };
    return b;
  }
  function options(id,items,placeholder){
    const target=$(id),previous=target.value;
    target.replaceChildren();
    for(const [value,label] of [['',placeholder],...items]){
      const o=el('option','',label);
      o.value=value;
      target.append(o);
    }
    target.value=previous;
  }
  const query=extra=>new URLSearchParams({
    ...ui.filters,...extra
  }).toString();
  function readFilters(){
    const fields={
      q:'libraryQuery',project:'projectFilter',type:'typeFilter',status:'statusFilter',date_field:'dateField',from:'dateFrom',to:'dateTo'
    };
    ui.filters=Object.fromEntries(Object.entries(fields).map(([key,id])=>[key,$(id).value.trim()]).filter(([,v])=>v));
    ui.focus=null;
    ui.depth=1;
    ui.limit=60;
    ui.selected=null;
  }
  function clearDetail(){
    ui.detailGeneration++;
    $('libraryDetail').replaceChildren(el('h2','','자료 상세'),el('p','','자료나 노드를 선택하세요.'));
  }
  async function refresh(){
    const generation=++ui.generation;
    ui.controller?.abort();
    ui.controller=new AbortController();
    $('libraryStatus').textContent='자료를 불러오는 중…';
    try{
      const [catalog,all]=await Promise.all([api('/api/catalog?'+query(),{
        signal:ui.controller.signal
      }),api('/api/documents',{
        signal:ui.controller.signal
      })]);
      if(generation!==ui.generation)return;
      if(state.corpusRevision!==null&&state.corpusRevision!==catalog.corpus_revision){
        invalidate('자료가 변경됐습니다. 다시 점검하세요.');
        clearDetail();
      }
      state.corpusRevision=catalog.corpus_revision;
      ui.catalog=catalog;
      options('projectFilter',catalog.projects.map(p=>[p.id,p.title]),'전체 취재 건');
      options('typeFilter',Object.entries(catalog.types),'전체 유형');
      const known=new Set(all.documents.map(d=>d.id));
      state.selectedSources=new Set([...state.selectedSources].filter(id=>known.has(id)));
      saveDraft();
      $('sourceChoices').replaceChildren();
      for(const doc of all.documents){
        const label=el('label','source-choice'),input=el('input');
        input.type='checkbox';
        input.checked=state.selectedSources.has(doc.id);
        input.onchange=()=>{
          if(input.checked)state.selectedSources.add(doc.id);
          else state.selectedSources.delete(doc.id);
          updateInput('비교 자료가 변경됐습니다. 다시 점검하세요.');
        };
        label.append(input,document.createTextNode(doc.title));
        $('sourceChoices').append(label);
      }
      if(!all.documents.length)$('sourceChoices').append(el('p','','자료를 올린 뒤 선택하세요.'));
      renderList();
      renderFailures();
      $('docCount').textContent=`${catalog.matched} / ${catalog.total}개`;
      $('libraryStatus').textContent='자동 분류는 제한된 규칙 제안 · 요약은 원문 발췌 · 원본은 변경하지 않습니다.';
      if(ui.mode==='graph')await loadGraph(generation);
    }
    catch(e){
      if(e.name!=='AbortError'&&generation===ui.generation)report(e);
    }
  }
  function renderList(){
    const root=$('documents');
    root.replaceChildren();
    for(const doc of ui.catalog.documents){
      const m=doc.organization,card=el('article','library-file');
      card.append(button(doc.title,()=>openDetail(doc.id)),el('p','',`${ui.catalog.types[m.type]} · ${origins[m.type_origin]} · ${doc.processing_status==='partial'?'제한된 추출':'텍스트 추출 완료'}`),el('p','',`${doc.path} · 등록 ${doc.created_at.slice(0,10)} · 자료 날짜 ${m.document_date||'미입력'}`));
      const tags=el('div','library-tags');
      for(const t of m.tags)tags.append(el('span','tag',t.label));
      card.append(tags);
      root.append(card);
    }
    if(!ui.catalog.documents.length)root.append(el('p','','조건에 맞는 자료가 없습니다. 미분류·처리 실패 또는 검색 조건을 확인하세요.'));
  }
  function renderFailures(){
    const root=$('failureList');
    root.replaceChildren();
    if(ui.filters.status&&ui.filters.status!=='failed')return;
    const rows=ui.catalog.failures.filter(f=>!ui.filters.q||(f.title+' '+f.path).toLowerCase().includes(ui.filters.q.toLowerCase()));
    if(!rows.length)return;
    root.append(el('h3','','처리 실패 · 원본 보관'),el('p','','실패 자료는 본문·유형·취재 건·기간 필터 대상이 아닙니다. 파일명 검색만 적용합니다.'));
    for(const item of rows){
      const card=el('article','library-file'),link=el('a','','보관 원본 다운로드');
      link.href='/api/failed-original/'+encodeURIComponent(item.id);
      card.append(el('strong','',item.title),el('p','',item.reason),link,button('다시 처리',async()=>{
        const r=await post('/api/intake/retry',{
          failure_id:item.id
        });
        $('uploadStatus').textContent=r.status==='failed'?r.reason:'다시 처리했습니다.';
        await refresh();
      }),button('보관 원본 삭제',async()=>{
        if(!confirm('처리 실패 원본을 영구 삭제할까요? PC의 원본은 유지됩니다.'))return;
        await post('/api/intake/remove',{
          failure_id:item.id
        });
        await refresh();
        $('uploadStatus').textContent='처리 실패 보관 원본을 삭제했습니다. 복구할 수 없습니다.';
      }));
      root.append(card);
    }
  }
  function proofButton(doc,proof,label='원문 위치로'){
    return button(label,()=>showDocument(doc.id,{
      ...proof,document_id:doc.id,title:doc.title
    }));
  }
  async function openDetail(id){
    ui.selected=id;
    const generation=++ui.detailGeneration,root=$('libraryDetail');
    root.replaceChildren(el('p','','상세 정보를 불러오는 중…'));
    const {
      document:doc
    }
    =await api('/api/organized/'+encodeURIComponent(id));
    if(generation!==ui.detailGeneration)return;
    const m=doc.organization;
    root.replaceChildren(el('h2','',doc.title),el('p','',doc.path));
    root.append(button('원문 열기',()=>showDocument(id)),button('현재 기사 자료로 연결',async()=>{
      state.selectedSources.add(id);
      updateInput('참고자료를 연결했습니다. 근거 검증 완료를 의미하지 않습니다.');
      await refresh();
      $('libraryStatus').textContent='기사의 비교 자료에 연결했습니다.';
    }),el('h3','','원문 발췌 · 생성형 요약 아님'));
    root.append(el('p','scope-note','버튼을 누르면 이 자료의 앞 12블록에서 최대 6,000자가 OpenAI API로 전송됩니다. 제안은 확인 후 적용됩니다.'),
      button('OpenAI 분류·발췌 제안 받기',async()=>{
      const proposal=await post('/api/organization/suggest',{document_id:id});
      if(generation!==ui.detailGeneration||proposal.base_revision!==m.revision)return;
      const panel=el('section','ai-proposal');
      panel.append(el('h3','','OpenAI 제안 · 적용 전 확인'),
        el('p','',`유형: ${ui.catalog.types[proposal.document_type]} · 입력 범위 ${proposal.scope.reviewed_blocks}/${proposal.scope.total_blocks}블록. 모델은 사실 검증을 하지 않았습니다.`),
        el('p','',`태그: ${proposal.tags.map(t=>t.label).join(', ')||'없음'}`));
      for(const tag of proposal.tags){
        panel.append(el('p','',`태그 근거 · ${tag.label}`));
        for(const part of tag.evidence)panel.append(proofButton(doc,part));
      }
      for(const part of proposal.summary)panel.append(el('blockquote','',part.excerpt),proofButton(doc,part));
      panel.append(button('유형·태그·발췌 적용',async()=>{
        if(generation!==ui.detailGeneration)return;
        await post('/api/organization',{document_id:id,revision:m.revision,changes:{
          type:proposal.document_type,tags:proposal.tags.map(t=>t.label),summary:proposal.summary}});
        await refresh();await openDetail(id);
      }),button('제안 닫기',()=>panel.remove()));
      root.append(panel);
    }));
    for(const part of m.summary)root.append(el('blockquote','',part.excerpt),proofButton(doc,part));
    root.append(el('p','',doc.parse_info.warnings.join(' / ')||'지원 범위의 텍스트를 추출했습니다.'));
    const type=el('select'),tags=el('input'),date=el('input'),box=el('div'),checks=[];
    type.id='editType';
    tags.id='editTags';
    date.id='editDate';
    date.type='date';
    date.value=m.document_date||'';
    for(const [value,label] of Object.entries(ui.catalog.types)){
      const o=el('option','',label);
      o.value=value;
      type.append(o);
    }
    type.value=m.type;
    tags.value=m.tags.map(t=>t.label).join(', ');
    for(const p of ui.catalog.projects){
      const label=el('label','source-choice'),input=el('input');
      input.type='checkbox';
      input.checked=m.project_ids.includes(p.id);
      checks.push([p.id,input]);
      label.append(input,document.createTextNode(p.title));
      box.append(label);
    }
    for(const [text,control] of [['자료 유형',type],['태그 (쉼표 구분)',tags],['자료 날짜 (직접 확인)',date]]){
      const label=el('label','',text);
      label.htmlFor=control.id;
      root.append(label,control);
    }
    root.append(el('h3','','취재 건 연결'),box);
    root.append(button('분류 저장',async()=>{
      const change={
      },values=tags.value.split(',').map(t=>t.trim()).filter(Boolean),ids=checks.filter(([,input])=>input.checked).map(([id])=>id);
      if(type.value!==m.type)change.type=type.value;
      if(JSON.stringify(values)!==JSON.stringify(m.tags.map(t=>t.label)))change.tags=values;
      if((date.value||null)!==m.document_date)change.document_date=date.value||null;
      if(JSON.stringify(ids)!==JSON.stringify(m.project_ids))change.project_ids=ids;
      if(!Object.keys(change).length)return;
      await post('/api/organization',{
        document_id:id,revision:m.revision,changes:change
      });
      await refresh();
      await openDetail(id);
    }),button('마지막 분류 변경 되돌리기',async()=>{
      await post('/api/organization/undo',{
        document_id:id,revision:m.revision
      });
      await refresh();
      await openDetail(id);
    }));
    for(const p of doc.project_suggestions)root.append(button(`연결 제안: ${p.title}`,async()=>{
      await post('/api/organization',{
        document_id:id,revision:m.revision,changes:{
          project_ids:[...m.project_ids,p.id]
        }
      });
      await refresh();
      await openDetail(id);
    }),el('p','',p.reason+' · 선택 전에는 연결하지 않음'));
    root.append(el('h3','','연결 이유'));
    for(const tag of m.tags){
      root.append(el('p','',`${tag.label} · ${origins[tag.origin]}`));
      for(const proof of tag.evidence)root.append(proofButton(doc,proof,`분류 단서: ${proof.excerpt}`));
    }
    for(const mention of m.mentions.slice(0,30))root.append(proofButton(doc,mention.evidence,`${kinds[mention.kind]}: ${mention.label}`));
    if(m.mentions.length>30)root.append(el('p','',`이름 후보 ${m.mentions.length}개 중 30개 표시`));
    root.append(button('저장 자료 삭제',async()=>{
      if(!confirm('저장 원본·분류 이력·연결 검토를 삭제합니다. 복구할 수 없습니다. PC 원본은 삭제하지 않습니다. 계속할까요?'))return;
      const r=await api('/api/documents/'+id,{
        method:'DELETE'
      });
      clearDetail();
      ui.selected=null;
      $('sourceDialog').close();
      $('sourceBlocks').replaceChildren();
      invalidate('자료를 삭제했습니다. 다시 점검하세요.');
      await refresh();
      $('uploadStatus').textContent=`저장 원본과 연결 검토 ${r.deleted_review_count}건 삭제. 보관 사본은 복구할 수 없습니다.`;
    }));
    draw();
  }
  async function loadGraph(generation){
    const extra={
      depth:String(ui.depth),limit:String(ui.limit)
    };
    if(ui.focus)extra.focus=ui.focus;
    if($('nodeKind').value)extra.node_kind=$('nodeKind').value;
    const graph=await api('/api/explore?'+query(extra),{
      signal:ui.controller?.signal
    });
    if(generation!==ui.generation)return;
    ui.graph=graph;
    $('graphCoverage').textContent=`조건 내 ${graph.total_nodes}개 · 탐색 범위 ${graph.matched_nodes}개 · 표시 ${graph.displayed_nodes}개 · 숨김 ${graph.hidden_nodes}개 (최대 150개)`;
    const root=$('graphNodeList');
    root.replaceChildren();
    for(const node of graph.nodes)root.append(button(`${kinds[node.kind]} · ${node.label}`,()=>selectNode(node)));
    draw();
  }
  async function selectNode(node){
    ui.selected=node.id;
    draw();
    if(node.kind==='document')return openDetail(node.id);
    ++ui.detailGeneration;
    const root=$('libraryDetail');
    root.replaceChildren(el('h2','',node.label),el('p','',kinds[node.kind]));
    if(node.kind.includes('candidate'))root.append(el('p','','이름의 출현 위치입니다. 동일 인물·기관 또는 인물 간 관계를 확정하지 않습니다.'));
    for(const edge of ui.graph.edges.filter(e=>e.source===node.id||e.target===node.id)){
      const doc=ui.catalog.documents.find(d=>d.id===edge.document_id);
      if(!doc)continue;
      root.append(el('p','',`${relations[edge.relation]} · ${origins[edge.origin]}`),button(doc.title,()=>openDetail(doc.id)));
      for(const proof of edge.evidence)root.append(el('blockquote','',proof.excerpt),proofButton(doc,proof));
    }
    root.append(el('p','','현재 표시된 연결만 나옵니다. 연결 더 보기로 범위를 넓힐 수 있습니다.'));
  }
  function coordinates(id){
    let hash=2166136261;
    for(const char of id)hash=Math.imul(hash^char.charCodeAt(0),16777619);
    const y=((hash>>>0)%10000)/5000-1,angle=(((Math.imul(hash,2654435761)>>>0)%10000)/10000)*Math.PI*2,r=Math.sqrt(1-y*y);
    return [r*Math.cos(angle),y,r*Math.sin(angle)];
  }
  function selectEdge(edge){
    ++ui.detailGeneration;
    const doc=ui.catalog.documents.find(d=>d.id===edge.document_id);
    if(!doc)return;
    const root=$('libraryDetail');
    root.replaceChildren(el('h2','','연결 이유'),el('p','',`${relations[edge.relation]} · ${origins[edge.origin]}`),button(doc.title,()=>openDetail(doc.id)));
    for(const proof of edge.evidence)root.append(el('blockquote','',proof.excerpt),proofButton(doc,proof));
    if(!edge.evidence.length)root.append(el('p','','사용자가 지정한 분류·연결입니다. 원문이 입증한 관계라는 뜻은 아닙니다.'));
  }
  function draw(){
    if(ui.mode!=='graph')return;
    const canvas=$('map'),box=canvas.getBoundingClientRect();
    if(!box.width)return;
    const dpr=devicePixelRatio||1;
    canvas.width=box.width*dpr;
    canvas.height=box.height*dpr;
    const ctx=canvas.getContext('2d');
    ctx.scale(dpr,dpr);
    const w=box.width,h=box.height,coords=new Map();
    ctx.clearRect(0,0,w,h);
    const adjacent=new Set([ui.selected]);
    for(const e of ui.graph.edges){
      if(e.source===ui.selected)adjacent.add(e.target);
      if(e.target===ui.selected)adjacent.add(e.source);
    }
    for(const node of ui.graph.nodes){
      const [x,y,z]=coordinates(node.id),a=ui.angle,t=ui.tilt,rx=x*Math.cos(a)-z*Math.sin(a),rz=x*Math.sin(a)+z*Math.cos(a),ry=y*Math.cos(t)-rz*Math.sin(t),depth=y*Math.sin(t)+rz*Math.cos(t),scale=1+depth*.2;
      coords.set(node.id,{
        node,x:w/2+ui.panX+rx*Math.min(w,h)*.34*scale*ui.zoom,y:h/2+ui.panY+ry*h*.34*scale*ui.zoom,depth,scale
      });
    }
    for(const e of ui.graph.edges){
      const s=coords.get(e.source),t=coords.get(e.target);
      if(!s||!t)continue;
      const selected=e.source===ui.selected||e.target===ui.selected;
      ctx.strokeStyle=selected?'#ccebd4':'#476457';
      ctx.lineWidth=selected?2:1;
      ctx.setLineDash(e.origin==='user'?[]:[3,4]);
      ctx.beginPath();
      ctx.moveTo(s.x,s.y);
      ctx.lineTo(t.x,t.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ui.projected=[...coords.values()].sort((a,b)=>a.depth-b.depth);
    const colors={
      document:'#f0f6e9',project:'#f8c986',topic:'#a7d6f0',person_candidate:'#d4baf2',organization_candidate:'#92d7ae'
    };
    for(const p of ui.projected){
      ctx.globalAlpha=ui.selected&&!adjacent.has(p.node.id)?.3:1;
      ctx.fillStyle=colors[p.node.kind];
      ctx.beginPath();
      ctx.arc(p.x,p.y,(p.node.id===ui.selected?8:5)*p.scale,0,Math.PI*2);
      ctx.fill();
      ctx.font='11px sans-serif';
      ctx.fillText(p.node.label.slice(0,22),p.x+10,p.y+4);
    }
    ctx.globalAlpha=1;
    if(!ui.projected.length){
      ctx.fillStyle='#c4d9cb';
      ctx.font='13px sans-serif';
      ctx.fillText('조건에 맞는 연결이 없습니다. 필터를 확인하세요.',20,h/2);
    }
  }
  function mode(value){
    ui.mode=value;
    $('documents').classList.toggle('hidden',value!=='list');
    $('graphPane').classList.toggle('hidden',value!=='graph');
    $('listView').setAttribute('aria-pressed',String(value==='list'));
    $('graphView').setAttribute('aria-pressed',String(value==='graph'));
    if(value==='graph')return refresh();
  }
  const toBase64=file=>new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(String(r.result).split(',')[1]);
    r.onerror=()=>reject(new Error('파일 읽기 실패'));
    r.readAsDataURL(file);
  });
  async function upload(files){
    const projectId=$('projectFilter').value;
    let ok=0,failed=0,duplicate=0;
    const messages=[];
    $('chooseFiles').disabled=true;
    $('chooseFolder').disabled=true;
    invalidate('자료를 가져오는 중입니다. 완료 후 다시 점검하세요.');
    try{
      for(const file of files){
        try{
          if(file.size>10*1024*1024)throw new Error('10MB 초과: 서버에 보관하지 않음');
          const r=await post('/api/intake',{
            name:file.name,path:file.webkitRelativePath||file.name,data:await toBase64(file),project_id:projectId||null
          });
          if(r.status==='failed'){
            failed++;
            messages.push(file.name+': '+r.reason);
          }
          else{
            ok++;
            if(r.duplicate)duplicate++;
          }
        }
        catch(e){
          failed++;
          messages.push(file.name+': '+e.message);
        }
        $('uploadStatus').textContent=`처리 ${ok+failed}/${files.length}`;
      }
      clearDetail();
      await refresh();
      $('uploadStatus').textContent=`등록 ${ok}개 (내용 중복 ${duplicate}개) · 실패 ${failed}개\n${messages.join('\n')}`;
    }
    finally{
      $('chooseFiles').disabled=false;
      $('chooseFolder').disabled=false;
    }
  }
  $('chooseFiles').onclick=()=>$('files').click();
  $('chooseFolder').onclick=()=>$('folder').click();
  for(const id of ['files','folder'])$(id).addEventListener('change',e=>{
    upload([...e.target.files]).catch(report);
    e.target.value='';
  });
  $('drop').addEventListener('dragover',e=>e.preventDefault());
  $('drop').addEventListener('drop',e=>{
    e.preventDefault();
    upload([...e.dataTransfer.files]).catch(report);
  });
  $('createProject').onclick=async()=>{
    try{
      const p=await post('/api/projects',{
        title:$('projectName').value
      });
      $('projectName').value='';
      await refresh();
      $('projectFilter').value=p.id;
      readFilters();
      clearDetail();
      await refresh();
    }
    catch(e){
      report(e);
    }
  };
  $('importTranscript').onclick=async()=>{
    try{
      const r=await post('/api/transcripts',JSON.parse($('transcriptInput').value));
      await refresh();
      await openDetail(r.id);
      $('uploadStatus').textContent='STT 결과 등록 완료 · 음성 변환은 수행하지 않았습니다.';
    }
    catch(e){
      report(e);
    }
  };
  $('applyFilters').onclick=()=>{
    readFilters();
    clearDetail();
    return refresh();
  };
  $('libraryQuery').addEventListener('keydown',e=>{
    if(e.key==='Enter')$('applyFilters').click();
  });
  $('resetFilters').onclick=()=>{
    for(const id of ['libraryQuery','projectFilter','typeFilter','statusFilter','dateFrom','dateTo','nodeKind'])$(id).value='';
    $('dateField').value='registered';
    readFilters();
    clearDetail();
    return refresh();
  };
  $('listView').onclick=()=>mode('list');
  $('graphView').onclick=()=>mode('graph');
  $('nodeKind').onchange=()=>refresh();
  $('zoomIn').onclick=()=>{
    ui.zoom=Math.min(3,ui.zoom*1.2);
    draw();
  };
  $('zoomOut').onclick=()=>{
    ui.zoom=Math.max(.4,ui.zoom/1.2);
    draw();
  };
  $('focusNode').onclick=()=>{
    const p=ui.projected.find(p=>p.node.id===ui.selected);
    if(!p)return;
    const b=$('map').getBoundingClientRect();
    ui.panX+=b.width/2-p.x;
    ui.panY+=b.height/2-p.y;
    draw();
  };
  $('expandGraph').onclick=()=>{
    ui.focus=ui.selected||ui.focus;
    ui.depth=Math.min(3,ui.depth+1);
    ui.limit=Math.min(150,ui.limit+30);
    return refresh();
  };
  $('resetGraph').onclick=()=>{
    ui.angle=0;
    ui.tilt=.25;
    ui.zoom=1;
    ui.panX=ui.panY=0;
    ui.focus=null;
    ui.depth=3;
    ui.limit=150;
    return refresh();
  };
  const canvas=$('map');
  canvas.addEventListener('pointerdown',e=>{
    ui.drag={
      x:e.clientX,y:e.clientY,distance:0
    };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(!ui.drag)return;
    const dx=e.clientX-ui.drag.x,dy=e.clientY-ui.drag.y;
    ui.drag.distance+=Math.abs(dx)+Math.abs(dy);
    ui.angle+=dx*.008;
    ui.tilt+=dy*.008;
    ui.drag.x=e.clientX;
    ui.drag.y=e.clientY;
    draw();
  });
  canvas.addEventListener('pointerup',e=>{
    const drag=ui.drag;
    ui.drag=null;
    if(!drag||drag.distance>5)return;
    const b=canvas.getBoundingClientRect(),p=[...ui.projected].reverse().find(p=>Math.hypot(p.x-e.clientX+b.left,p.y-e.clientY+b.top)<18);
    if(p){selectNode(p.node).catch(report);return;}
    const x=e.clientX-b.left,y=e.clientY-b.top;
    const points=new Map(ui.projected.map(p=>[p.node.id,p]));
    const hit=ui.graph.edges.find(edge=>{
      const s=points.get(edge.source),t=points.get(edge.target);
      if(!s||!t)return false;
      const dx=t.x-s.x,dy=t.y-s.y,length=dx*dx+dy*dy;
      if(!length)return false;
      const position=Math.max(0,Math.min(1,((x-s.x)*dx+(y-s.y)*dy)/length));
      return Math.hypot(x-s.x-position*dx,y-s.y-position*dy)<5;
    });
    if(hit)selectEdge(hit);
  });
  canvas.addEventListener('pointercancel',()=>{
    ui.drag=null;
  });
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();
    ui.zoom=Math.max(.4,Math.min(3,ui.zoom*(e.deltaY<0?1.1:.9)));
    draw();
  },{
    passive:false
  });
  window.addEventListener('resize',draw);
  window.NewsroomKnowledge={
    refresh,draw,coordinates
  };
  checkHealth();
  refresh();
})();
