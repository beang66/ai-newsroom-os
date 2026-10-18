import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { core } from "../api/core";
import { formatArticleTime } from "../data/article";
import { textWithoutPhotos } from "../lib/photoMarks.js";

// 이 앱은 송고까지만 하고, 출고는 동아일보 CMS 에서 따로 한다 → 보관소 이름은 '원고 / 송고'
// - 원고: 아직 송고하지 않은 기사 + 송고한 뒤 고쳐 저장한 기사('수정 중')
// - 송고: 송고본이 있는 기사(기사마다 하나, 다시 송고하면 덮어쓴다)
// 상태(state)는 코어가 계산한 값 하나만 쓴다. 지운 기사는 휴지통에 30일 있다가 코어가 영구 삭제한다.
const stateLabel = (item) => ({ published: "송고", editing: "수정 중" })[item.state] || "원고";
const FILTERS = { all: () => true, 원고: (item) => item.state !== "published", 송고: (item) => !!item.published || item.state === "published" };
const day = (value) => formatArticleTime(value).slice(0, 10);

export default function ArchiveView({ article, articles, onOpen, onMap, onDelete, onRestored, busy }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(article.articleId || article.id);
  const [detail, setDetail] = useState(null);
  const [trash, setTrash] = useState(null); // null = 닫힘 | { items } | { error }
  const selected = articles.find((item) => item.id === selectedId) || articles[0];
  const selectedKey = selected?.id;
  const isCurrent = selected?.id.replaceAll("-", "") === (article.articleId || article.id).replaceAll("-", "");
  useEffect(() => {
    let alive = true;
    if (!selectedKey || isCurrent) return;
    core.getArticle(selectedKey).then(({ draft }) => alive && setDetail({ id: selectedKey, draft }))
      .catch((e) => alive && setDetail({ id: selectedKey, error: e.message }));
    return () => { alive = false; };
  }, [selectedKey, isCurrent]);
  const content = isCurrent ? article : detail?.id === selectedKey ? detail.draft : null;
  const error = !isCurrent && detail?.id === selectedKey ? detail.error || "" : "";
  const visible = articles.filter((item) => FILTERS[filter](item)
    && `${item.title} ${item.subtitle}`.toLowerCase().includes(query.trim().toLowerCase()));
  // 저장한 적 있는 기사만 지울 수 있다(아직 저장 전인 지금 원고는 지울 것이 없다)
  const deletable = visible.filter((item) => item.revision_no).map((item) => item.id);
  const [checked, setChecked] = useState([]);
  const picked = checked.filter((id) => deletable.includes(id)); // 검색·필터로 안 보이게 된 기사는 지우지 않는다
  const allPicked = deletable.length > 0 && picked.length === deletable.length;
  const toggle = (id) => setChecked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const remove = async (ids) => {
    const deleted = await onDelete(ids);
    setChecked((list) => list.filter((id) => !deleted.includes(id)));
  };
  const loadTrash = () => core.listTrash().then(({ articles: items }) => setTrash({ items })).catch((e) => setTrash({ error: e.message }));
  const restore = async (id) => {
    try { await core.restoreDeleted(id); } catch (e) { setTrash({ error: e.message }); return; }
    await loadTrash();
    onRestored?.();
  };
  return <div data-testid="archive-view">
    <div className="workspace-command">
      <label className="workspace-search">기사 검색<input type="search" placeholder="기사 제목, 부제 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="workspace-actions" aria-label="기사 상태 필터">{Object.keys(FILTERS).map((status) =>
        <button type="button" key={status} aria-pressed={!trash && filter === status} onClick={() => { setTrash(null); setFilter(status); }}>{status === "all" ? `전체 ${articles.length}` : status}</button>)}
        <button type="button" data-testid="archive-trash" aria-pressed={Boolean(trash)} onClick={() => (trash ? setTrash(null) : loadTrash())}>휴지통</button></div>
    </div>
    {trash ? <section className="workspace-panel" data-testid="trash-list" aria-label="휴지통">
      <h2>휴지통 <small>지운 날부터 30일 뒤 이력·송고본·고정본까지 영구 삭제</small></h2>
      {trash.error && <p role="alert">{trash.error}</p>}
      {trash.items?.length === 0 && <p className="workspace-empty">휴지통이 비어 있습니다.</p>}
      <div className="workspace-article-list">{(trash.items || []).map((item) => <div key={item.articleId} className="archive-item"><button type="button" disabled>
        <span><strong>{item.title || "제목 없는 기사"}</strong><small>{day(item.deletedAt)} 삭제 · {day(item.purgeAt)} 영구 삭제</small></span></button>
        <button type="button" data-testid="trash-restore" disabled={busy} onClick={() => restore(item.articleId)}>되살리기</button>
      </div>)}</div>
    </section> : <div className="workspace-master-detail">
      <section className="workspace-panel"><h2>최근 기사 <small>최근 수정순</small></h2>
        {onDelete && deletable.length > 0 && <div className="archive-bulk">
          <label><input type="checkbox" data-testid="archive-select-all" checked={allPicked} disabled={busy}
            onChange={() => setChecked(allPicked ? [] : deletable)} /> 전체 선택</label>
          <button type="button" data-testid="archive-delete-selected" disabled={busy || !picked.length} onClick={() => remove(picked)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" /> 선택 삭제{picked.length ? ` (${picked.length})` : ""}</button>
        </div>}
        <div className="workspace-article-list">{visible.map((item, index) => <div key={item.id} className="archive-item">
          {item.revision_no && onDelete && <input type="checkbox" className="archive-check" data-testid="archive-check" checked={picked.includes(item.id)}
            disabled={busy} aria-label={`${item.title || "제목 없는 기사"} 선택`} onChange={() => toggle(item.id)} />}
          <button type="button" aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(item.id)}>
          <span className="nav-number">{String(index + 1).padStart(2, "0")}</span><span><strong>{item.title || "제목 없는 기사"}</strong><small>{item.revision_no ? formatArticleTime(item.updated_at) : "현재 원고 · 저장 전"}</small></span><span className="workspace-status">{stateLabel(item)}</span>
        </button>
          {item.revision_no && onDelete && <button type="button" className="archive-delete" data-testid="archive-delete" disabled={busy}
            aria-label={`${item.title || "제목 없는 기사"} 삭제`} title="휴지통으로 옮기기(30일 뒤 영구 삭제)" onClick={() => remove([item.id])}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
        </div>)}</div>
        {!visible.length && <p className="workspace-empty">조건에 맞는 기사가 없습니다.</p>}
      </section>
      <section className="workspace-panel" aria-label="선택한 기사">
        {selected && <><span className="workspace-kicker">선택한 기사 · {stateLabel(selected)}</span><h2>{selected.title || "제목 없는 기사"}</h2><p>{selected.subtitle}</p>
          <div className="workspace-actions"><button type="button" className="workspace-primary" disabled={busy || !content} onClick={() => onOpen(selected.id)} title="Article Writer 에서 이 기사를 고친다">수정</button><button type="button" onClick={() => onMap(selected.id)}>관계 탐색</button></div>
          {error && <p role="alert">{error}</p>}
          {!content && !error && <p role="status">원고를 불러오는 중…</p>}
          {content && <><div className="workspace-metrics">{[["취재자료", (content.sources || []).length], ["녹취", (content.linkedInterviews || []).length], ["사진", (content.photos || []).length], ["변환본", Object.keys(content.platformDrafts || {}).length + (content.cardNews ? 1 : 0)]].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
            <h3>취재자료 ({(content.sources || []).length}건)</h3>{(content.sources || []).map((source) => <p key={source.id}>• {source.name}</p>)}
            <h3>미디어 & 변환 자산</h3><p>{(content.photos || []).length}개 사진 · {Object.keys(content.platformDrafts || {}).length}개 채널 원고</p>
            <h3>원고 미리보기</h3><p className="workspace-excerpt">{textWithoutPhotos(content.content).trim() || "아직 작성한 본문이 없습니다."}</p>
          </>}
        </>}
      </section>
    </div>}
  </div>;
}
