// 편집실 전용 메모리 상태. 팀 공통 상태·DB·고정본 계약을 변경하지 않는다.
import { articleId, sourceText } from './platformState.js';
const applied = new Map();
let transition = null;
export const sourceRecord = article => ({id:articleId(article), title:article.title, key:sourceText(article)});
export const appliedSource = article => applied.get(articleId(article)) || null;
export const sourceReady = (record, article) => Boolean(record && record.id === articleId(article) && record.key === sourceText(article));
export function applyCurrentSource(article) {
  const record=sourceRecord(article);applied.set(record.id,record);return record;
}
// 기존 Workspace 전환이 편집실을 다시 마운트한다. 조회로 확인한 원문과 실제 전환 결과가 같을 때만 적용을 확정한다.
export function beginSourceTransition(article, display = {subtitle:article.subtitle}) {
  const ticket={record:sourceRecord(article), display, previous:applied.get(articleId(article)), claimed:false, error:''};
  ticket.completed=new Promise(resolve=>{ticket.complete=resolve;});
  transition=ticket;return ticket;
}
export function claimSourceTransition(article) {
  if(!transition || transition.record.id!==articleId(article))return null;
  const ticket=transition;transition=null;ticket.claimed=true;
  if(!sourceReady(ticket.record,article)){
    ticket.error='기사 전환 중 원문이 변경됐습니다. 확인 후 다시 적용해 주세요.';
    applied.delete(ticket.record.id);ticket.complete({ok:false,error:ticket.error});return {error:ticket.error};
  }
  applied.set(ticket.record.id,ticket.record);ticket.complete({ok:true});return {record:ticket.record,display:ticket.display};
}
export function cancelSourceTransition(ticket) {
  if(transition!==ticket)return;
  transition=null;
  if(ticket.previous)applied.set(ticket.record.id,ticket.previous);
  ticket.complete({ok:false,error:'기사 적용이 취소되었거나 전환에 실패했습니다. 기존 원문과 편집은 유지됩니다.'});
}
