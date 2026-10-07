import { ArrowUpRight, FileText, LocateFixed, Network, X } from "lucide-react";
import { KINDS, STATUSES, locationLabel, safeSourceUrl } from "./model.js";

export default function NodeDetail({ node, model, onSelect, onFocus, onArticleLocation, onSource, onClose }) {
  if (!node) return <aside className="map-detail map-idle"><Network size={26} /><h3>연결을 따라가 보세요</h3><p>노드를 선택하면 주장, 근거, 출처의 상세정보를 확인할 수 있습니다.</p></aside>;
  const related = model.edges.flatMap(e => e.source_id === node.id ? [e.target_id] : e.target_id === node.id ? [e.source_id] : []).map(id => model.nodes.find(n => n.id === id));
  const evidence = model.evidence.filter(e => e.claim_id === node.id);
  return <aside className="map-detail" aria-label="선택 노드 상세" aria-live="polite">
    <div className="map-detail-top"><span className={`map-type ${node.kind}`}>{KINDS[node.kind]}</span><button aria-label="선택 해제" onClick={onClose}><X size={16} /></button></div>
    <h2>{node.label}</h2>
    {node.kind === "article" && <span className="map-badge">{node.status || "상태 없음"}</span>}
    {node.kind === "claim" && <><span className={`map-badge ${node.verification_status}`}>{STATUSES[node.verification_status]}</span><p className="map-muted">{locationLabel(node.article_location)}</p><button className="map-action" onClick={() => onArticleLocation(node)}><LocateFixed size={15} />기사에서 문장 확인</button></>}
    {node.kind === "entity" && <p className="map-muted">{node.entity_type || "유형 미지정"}</p>}
    {node.kind === "source" && <><p className="map-muted">{node.source_type || "자료"} · {locationLabel(node.source_location)}</p>{safeSourceUrl(node.source_url) ? <a className="map-action primary" href={safeSourceUrl(node.source_url)} target="_blank" rel="noopener noreferrer">원문 열기<ArrowUpRight size={15} /></a> : <button className="map-action" onClick={() => onSource(node)}><FileText size={15} />자료 내용·위치 보기</button>}</>}
    {node.kind === "claim" && <section><h3>Evidence <span>{evidence.length}</span></h3>{evidence.length ? evidence.map((e, index) => {
      const source = model.nodes.find(n => n.id === e.source_id && n.kind === "source");
      return <div className="map-evidence" key={e.id || index}><blockquote>{e.evidence_text || e.excerpt || "근거 문장 미제공"}</blockquote><small>{e.relation || "관계 미제공"} · {locationLabel(e.source_location || e.locator)}</small>{source ? <button onClick={() => onSelect(source.id)}>{source.label}<ArrowUpRight size={14} /></button> : <p>출처 정보가 연결되지 않았습니다.</p>}</div>;
    }) : <p className="map-muted">연결된 근거가 없습니다. 검증 결과에 근거가 추가되면 여기에서 확인할 수 있습니다.</p>}</section>}
    <section><h3>연결된 항목 <span>{related.length}</span></h3>{related.map(item => <button key={item.id} className="map-related" onClick={() => onSelect(item.id)}><span className={`map-dot ${item.kind}`} /><span><small>{KINDS[item.kind]}</small>{item.label}</span><ArrowUpRight size={14} /></button>)}{!related.length && <p className="map-muted">연결된 항목 없음</p>}</section>
    <button className="map-action" onClick={() => onFocus(node.id)}><Network size={15} />이 노드의 연결만 보기</button>
    <details className="map-metadata"><summary>참조 정보</summary><code>{node.id}</code>{model.snapshotId && <p>Snapshot: {model.snapshotId}</p>}{model.revisionId && <p>Revision: {model.revisionId}</p>}</details>
  </aside>;
}
