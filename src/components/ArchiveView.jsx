import { useEffect, useState } from "react";
import { core } from "../api/core";
import { formatArticleTime } from "../data/article";
import { textWithoutPhotos } from "../lib/photoMarks.js";
import { deskArchiveItems } from "../data/desk";

// 이 앱은 송고까지만 하고, 출고는 동아일보 CMS 에서 따로 한다 → 보관소 이름은 '원고 / 송고'
// - 원고: 아직 송고하지 않은 기사 + 송고한 뒤 고쳐 저장한 기사('수정 중')
// - 송고: 송고본이 있는 기사(기사마다 하나, 다시 송고하면 덮어쓴다)
const stateLabel = (item) => ({ published: "송고", editing: "수정 중" })[item.state] || "원고";
// 데스크 편성 예시(src/data/desk.js)는 코어 원고 뒤에 읽기 전용으로 붙인다 — 출고 완료는 송고, 나머지는 원고
const DESK_ITEMS = deskArchiveItems();
const FILTERS = { all: () => true, 원고: (item) => item.state !== "published", 송고: (item) => !!item.published || item.state === "published" };

export default function ArchiveView({ article, articles: stored, onOpen, onMap, onDelete, busy }) {
  const articles = [...stored, ...DESK_ITEMS];
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(article.articleId || article.id);
  const [detail, setDetail] = useState(null);
  const selected = articles.find((item) => item.id === selectedId) || articles[0];
  const selectedKey = selected?.id;
  const sample = Boolean(selected?.sample);
  const isCurrent = !sample && selected?.id.replaceAll("-", "") === (article.articleId || article.id).replaceAll("-", "");
  useEffect(() => {
    let alive = true;
    if (!selectedKey || isCurrent || sample) return;
    core.getArticle(selectedKey).then(({ draft }) => alive && setDetail({ id: selectedKey, draft }))
      .catch((e) => alive && setDetail({ id: selectedKey, error: e.message }));
    return () => { alive = false; };
  }, [selectedKey, isCurrent, sample]);
  const content = isCurrent ? article : detail?.id === selectedKey ? detail.draft : null;
  const error = !isCurrent && detail?.id === selectedKey ? detail.error || "" : "";
  const visible = articles.filter((item) => FILTERS[filter](item)
    && `${item.title} ${item.subtitle}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div data-testid="archive-view">
    <div className="workspace-command">
      <label className="workspace-search">기사 검색<input type="search" placeholder="기사 제목, 부제 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="workspace-actions" aria-label="기사 상태 필터">{Object.keys(FILTERS).map((status) =>
        <button type="button" key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status === "all" ? `전체 ${articles.length}` : status}</button>)}</div>
    </div>
    <div className="workspace-master-detail">
      <section className="workspace-panel"><h2>최근 기사 <small>최근 수정순</small></h2>
        <div className="workspace-article-list">{visible.map((item, index) => <div key={item.id} className="archive-item"><button type="button" aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(item.id)}>
          <span className="nav-number">{String(index + 1).padStart(2, "0")}</span><span><strong>{item.title || "제목 없는 기사"}</strong><small>{item.sample ? `데스크 편성 예시 · ${item.desk} · ${item.owner} · ${item.stage === "출고 완료" ? "출고" : "마감"} ${item.deadline}` : item.revision_no ? formatArticleTime(item.updated_at) : "현재 원고 · 저장 전"}</small></span><span className="workspace-status">{item.sample ? item.stage : stateLabel(item)}</span>
        </button>
          {/* 저장한 적 있는 기사만 지울 수 있다(아직 저장 전인 지금 원고는 지울 것이 없다) */}
          {item.revision_no && onDelete && <button type="button" className="archive-delete" data-testid="archive-delete" disabled={busy}
            aria-label={`${item.title || "제목 없는 기사"} 삭제`} title="보관소에서 삭제" onClick={() => onDelete(item.id)}>×</button>}
        </div>)}</div>
        {!visible.length && <p className="workspace-empty">조건에 맞는 기사가 없습니다.</p>}
      </section>
      <section className="workspace-panel" aria-label="선택한 기사">
        {sample && <><span className="workspace-kicker">데스크 편성 예시 · {selected.stage}</span><h2>{selected.title}</h2>{selected.subtitle && <p>{selected.subtitle}</p>}
          <dl className="workspace-facts"><div><dt>{selected.stage === "출고 완료" ? "출고" : "마감"}</dt><dd>오늘 {selected.deadline}</dd></div><div><dt>데스크</dt><dd>{selected.desk}</dd></div><div><dt>담당</dt><dd>{selected.owner}</dd></div>{selected.next && <div><dt>다음 작업</dt><dd>{selected.next.label}</dd></div>}</dl>
          <p className="workspace-muted">오늘의 데스크 편성표에 있는 예시 기사입니다. 코어에 저장된 원고가 아니어서 수정과 관계 탐색은 할 수 없습니다.</p>
        </>}
        {selected && !sample && <><span className="workspace-kicker">선택한 기사 · {stateLabel(selected)}</span><h2>{selected.title || "제목 없는 기사"}</h2><p>{selected.subtitle}</p>
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
    </div>
  </div>;
}
