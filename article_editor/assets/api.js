// The only UI network boundary. Feature files never call fetch directly.
export function transportFetch(url, options={}) { return fetch(url,options); }
export const CONTRACT_VERSION='0.8.1';
export const LIFECYCLE_STATUSES=['queued','running','succeeded','failed','cancelled'];
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function requireUuid(id){if(!uuidPattern.test(id||''))throw Error('공통 UUID가 필요합니다.');return id.toLowerCase();}
function coreError(result){const e=Error(result.error?.message||'Core 요청 실패');e.code=result.error?.code;e.retryable=result.error?.retryable;return e;}

// Same named method and payload for the browser HTTP adapter and pywebview IPC.
export function createCoreClient({base='/api/core/v0.8',ipc=null,token=null,signal}={}) {
  const methods={
    getArticle:['GET',p=>`/workspaces/${p.workspace_id}/articles/${p.article_id}`],
    saveArticle:['POST',p=>`/workspaces/${p.workspace_id}/articles/${p.article_id}/revisions`],
    createSnapshot:['POST',p=>`/workspaces/${p.workspace_id}/articles/${p.article_id}/snapshots`],
    registerMediaAsset:['POST',p=>`/workspaces/${p.workspace_id}/media-assets`],
    getMediaAsset:['GET',p=>`/workspaces/${p.workspace_id}/media-assets/${p.media_asset_id}`],
    getJob:['GET',p=>`/workspaces/${p.workspace_id}/jobs/${p.job_id}`],
    cancelJob:['POST',p=>`/workspaces/${p.workspace_id}/jobs/${p.job_id}/cancel`]
  };
  const client={};
  for(const [name,[method,path]] of Object.entries(methods))client[name]=async(payload)=>{
    for(const [key,value] of Object.entries(payload))if(key.endsWith('_id'))requireUuid(value);
    // IPC handlers receive the same envelope: scope IDs + `input` body.
    if(ipc){if(typeof ipc[name]!=='function')throw Error(`Core ${name} 연결이 필요합니다.`);const result=await ipc[name](payload);if(result?.error)throw coreError(result);return result;}
    const headers={...(token?{Authorization:`Bearer ${token}`}:{})};
    if(method==='POST')headers['Content-Type']='application/json';
    const response=await transportFetch(base+path(payload),{method,headers,signal,...(method==='POST'?{body:JSON.stringify(payload.input||{})}:{})});
    const result=await response.json();
    if(!response.ok||result?.error)throw coreError(result);
    return result;
  };
  return client;
}

export function toRevisionInput(draft,expectedRevisionNo) {
  const {articleId,title,bodyHtml,core_context,...editor}=structuredClone(draft);
  const plain=(html)=>{const t=document.createElement('template');t.innerHTML=html||'';t.content.querySelectorAll('s,del,figure,script,style').forEach(n=>n.remove());t.content.querySelectorAll('p,div,li').forEach(n=>{n.prepend('\n');n.append('\n');});t.content.querySelectorAll('br').forEach(n=>n.replaceWith('\n'));return t.content.textContent.replace(/\n{2,}/g,'\n').trim();};
  const input={title:plain(title),body_html:bodyHtml,body_text:plain(bodyHtml),editor_state:{...editor,title_html:title,legacy_article_id:articleId}};
  input.editor_state.media_asset_ids=(draft.photos||[]).filter(p=>p.core_context?.media_asset_id).map(p=>requireUuid(p.core_context.media_asset_id));
  if(expectedRevisionNo!==undefined)input.expected_revision_no=expectedRevisionNo;
  return input;
}
export function fromCoreRevision(article,revision) {
  if(requireUuid(article.id)!==requireUuid(revision.article_id))throw Error('다른 기사의 버전입니다.');
  return {...structuredClone(revision.editor_state||{}),articleId:requireUuid(article.id).replaceAll('-',''),
    title:revision.editor_state?.title_html||revision.title,subtitle:revision.editor_state?.subtitle||'',bodyHtml:revision.body_html,photos:structuredClone(revision.editor_state?.photos||[]),
    core_context:{workspace_id:requireUuid(article.workspace_id),article_id:requireUuid(article.id),revision_id:requireUuid(revision.id),revision_no:revision.revision_no}};
}

// Extensions are explicitly NOT operations declared by OpenAPI v0.8.
// Core owner supplies them; do not create new product endpoints independently.
export function createWorkspaceCoreAdapter({client,workspaceId,extensions={}}) {
  const workspace_id=requireUuid(workspaceId);
  return {async fetchPhoto(id){
    if(typeof extensions.fetchPhoto!=='function')throw Error('Core 사진 원본 가져오기 연결이 필요합니다.');
    return extensions.fetchPhoto({workspace_id,id});
  },async request(path,payload,state){
    const article_id=requireUuid(state.core_context?.article_id);
    if(state.core_context?.workspace_id && state.core_context.workspace_id!==workspace_id)throw Error('다른 작업공간의 원고입니다.');
    if(path==='/api/articles/save'){
      const draft=extensions.prepareDraft?await extensions.prepareDraft(payload.draft):payload.draft;
      if(JSON.stringify(draft).includes('data:image/'))throw Error('Core 사진 원본 저장 연결이 필요합니다. 원고는 유지됩니다.');
      if((draft.photos||[]).some(p=>!p.core_context?.media_asset_id))throw Error('사진을 Core MediaAsset에 등록한 뒤 저장해야 합니다. 원고는 유지됩니다.');
      const revision=await client.saveArticle({workspace_id,article_id,input:toRevisionInput(draft,state.core_context?.revision_no)});
      const storageDraft=fromCoreRevision({id:article_id,workspace_id},revision);
      const contentHash=extensions.savedContentHash?await extensions.savedContentHash({revision,draft:storageDraft}):revision.editor_state?.content_hash;
      return {saved:true,articleId:storageDraft.articleId,storageDraft,revision,contentHash};
    }
    const extension=path.includes('/versions')?'versionHistory':path==='/api/assist'?'assistArticle':'mediaTools';
    if(typeof extensions[extension]!=='function')throw Error(`Core ${extension} 연결이 필요합니다. 이 기능은 v0.8 공통 API에 아직 정의되지 않았습니다.`);
    return extensions[extension]({workspace_id,article_id,revision_id:state.core_context?.revision_id,path,payload});
  }};
}
