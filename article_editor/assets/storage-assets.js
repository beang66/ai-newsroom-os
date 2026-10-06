import {transportFetch} from "./api.js";
const IMAGE_DATA = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/g;
export function collectImageData(value, found = new Set()) {
  if (typeof value === 'string') for (const match of value.matchAll(IMAGE_DATA)) found.add(match[0]);
  else if (Array.isArray(value)) value.forEach(v=>collectImageData(v,found));
  else if (value && typeof value === 'object') Object.values(value).forEach(v=>collectImageData(v,found));
  return found;
}
export function replaceImageData(value, urls) {
  if (typeof value === 'string') return value.replace(IMAGE_DATA, v=>urls.get(v)||v);
  if (Array.isArray(value)) return value.map(v=>replaceImageData(v,urls));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replaceImageData(v,urls)]));
  return value;
}
export async function prepareStorageDraft(draft, upload, cache = new Map()) {
  const urls = new Map();
  for (const data of collectImageData(draft)) {
    let pending=cache.get(data);
    if (!pending) {
      pending=upload(data);cache.set(data,pending);
      pending.catch(()=>{if(cache.get(data)===pending)cache.delete(data)});
    }
    urls.set(data,await pending);
  }
  return {draft:replaceImageData(draft,urls), urls};
}
export async function uploadImage(data, base='', signal) {
  const raw=atob(data.slice(data.indexOf(',')+1));
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  if (bytes.byteLength>256*1048576) throw Error('사진 한 장은 최대 256MB까지 저장할 수 있습니다. 원본은 유지됩니다.');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const id=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const path=base+'/api/article-assets/'+id;
  const get=await transportFetch(path+'/status',{signal});
  if (!get.ok) throw Error('사진 파일 저장 기능이 없는 서버입니다. 최신 실행 창에서 앱을 실행해 주세요.');
  if ((await get.json()).ready) return base+'/api/article-assets/'+id;
  const total=Math.ceil(bytes.byteLength/1048576);
  for(let index=0;index<total;index++) {
    const response=await transportFetch(path+'/chunks/'+index+'?total='+total,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes.subarray(index*1048576,(index+1)*1048576),signal});
    let result;
    try {result=await response.json()} catch {throw Error('사진 파일 저장 응답을 읽지 못했어요. 원고는 유지됩니다.')}
    if(!response.ok) throw Error(result.error||'사진 파일을 저장하지 못했어요.');
    if(index===total-1 && !result.ready) throw Error('사진 파일 저장이 완료되지 않았어요. 다시 시도해 주세요.');
  }
  return base+'/api/article-assets/'+id;
}
