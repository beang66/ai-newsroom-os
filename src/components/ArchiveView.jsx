import { useEffect, useState } from "react";
import { core } from "../api/core";
import { formatArticleTime } from "../data/article";

export default function ArchiveView({ article, articles, onOpen, onMap, busy }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(article.articleId || article.id);
  const [detail, setDetail] = useState(null);
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
  const visible = articles.filter((item) => (filter === "all" || item.status === filter)
    && `${item.title} ${item.subtitle}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div data-testid="archive-view">
    <div className="workspace-command">
      <label className="workspace-search">기사 검색<input type="search" placeholder="기사 제목, 부제 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="workspace-actions" aria-label="기사 상태 필터">{["all", "작성 중", "검증 완료", "발행 완료"].map((status) =>
        <button type="button" key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status === "all" ? `전체 ${articles.length}` : status}</button>)}</div>
    </div>
    <div className="workspace-master-detail">
      <section className="workspace-panel"><h2>최근 기사 <small>최근 수정순</small></h2>
        <div className="workspace-article-list">{visible.map((item, index) => <button type="button" key={item.id} aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(item.id)}>
          <span className="nav-number">{String(index + 1).padStart(2, "0")}</span><span><strong>{item.title || "제목 없는 기사"}</strong><small>{item.revision_no ? formatArticleTime(item.updated_at) : "현재 원고 · 저장 전"}</small></span><span className="workspace-status">{item.status || "작성 중"}</span>
        </button>)}</div>
        {!visible.length && <p className="workspace-empty">조건에 맞는 기사가 없습니다.</p>}
      </section>
      <section className="workspace-panel" aria-label="선택한 기사">
        {selected && <><span className="workspace-kicker">선택한 기사 · {selected.status || "작성 중"}</span><h2>{selected.title || "제목 없는 기사"}</h2><p>{selected.subtitle}</p>
          <div className="workspace-actions"><button type="button" className="workspace-primary" disabled={busy || !content} onClick={() => onOpen(selected.id)}>원고 열기</button><button type="button" onClick={() => onMap(selected.id)}>관계 탐색</button></div>
          {error && <p role="alert">{error}</p>}
          {!content && !error && <p role="status">원고를 불러오는 중…</p>}
          {content && <><div className="workspace-metrics">{[["취재자료", (content.sources || []).length], ["녹취", (content.linkedInterviews || []).length], ["사진", (content.photos || []).length], ["변환본", Object.keys(content.platformDrafts || {}).length + (content.cardNews ? 1 : 0)]].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
            <h3>취재자료 ({(content.sources || []).length}건)</h3>{(content.sources || []).map((source) => <p key={source.id}>• {source.name}</p>)}
            <h3>미디어 & 변환 자산</h3><p>{(content.photos || []).length}개 사진 · {Object.keys(content.platformDrafts || {}).length}개 채널 원고</p>
            <h3>원고 미리보기</h3><p className="workspace-excerpt">{content.content || "아직 작성한 본문이 없습니다."}</p>
          </>}
        </>}
      </section>
    </div>
  </div>;
}
