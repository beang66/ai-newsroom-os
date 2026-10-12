import { useState } from "react";
import { formatArticleTime } from "../data/article";

export default function DeskView({ article, articles, onNavigate, onOpen, busy }) {
  const [today] = useState(() => new Date());
  const title = article.title || "제목 없는 기사";
  const metrics = [["저장된 기사", articles.filter((item) => item.revision_no).length], ["작성 중", articles.filter((item) => item.status === "작성 중").length], ["검증 완료", articles.filter((item) => item.status === "검증 완료").length], ["발행 준비", articles.filter((item) => item.status === "발행 준비").length]];
  return <div data-testid="desk-view">
    <p className="workspace-date">{new Intl.DateTimeFormat("ko-KR", { dateStyle: "full", timeZone: "Asia/Seoul" }).format(today)}</p>
    <section className="workspace-metrics" aria-label="업무 현황">{metrics.map(([label, count]) => <div key={label}><span>{label}</span><strong>{String(count).padStart(2, "0")}</strong></div>)}</section>
    <div className="workspace-master-detail">
      <section className="workspace-panel"><span className="workspace-kicker">지금 집중할 기사</span><h2>{title}</h2><p>{article.subtitle || "취재자료를 연결하고 원고를 이어서 작성하세요."}</p>
        <div className="workspace-actions"><button type="button" className="workspace-primary" onClick={() => onNavigate("writer")}>원고 이어쓰기</button><button type="button" onClick={() => onNavigate("map")}>근거 확인</button></div>
        <dl className="workspace-facts"><div><dt>현재 상태</dt><dd>{article.status}</dd></div><div><dt>본문</dt><dd>{(article.content || "").length}자</dd></div><div><dt>취재자료</dt><dd>{(article.sources || []).length}건</dd></div></dl>
      </section>
      <aside className="workspace-panel"><span className="workspace-kicker">다음 작업</span><h2>지금 확인할 것</h2>
        <div className="workspace-next-actions"><button type="button" onClick={() => onNavigate("writer")}>{article.content ? "원고와 근거 검증" : "첫 원고 작성"}<small>본문을 작성하고 근거자료와 비교합니다.</small></button><button type="button" onClick={() => onNavigate("interview")}>인터뷰·녹취 확인<small>필요한 발언을 골라 원고에 연결합니다.</small></button><button type="button" onClick={() => onNavigate("convert")}>채널별 원고 만들기<small>원문에서 변환본을 생성하고 검토합니다.</small></button></div>
      </aside>
    </div>
    <section className="workspace-panel"><h2>최근 작업 <small>최근 수정순</small></h2><p className="workspace-muted">마감 정보가 없는 원고는 최근 수정순으로 표시합니다.</p>
      <div className="workspace-article-list">{articles.slice(0, 6).map((item) => <button type="button" key={item.id} disabled={busy} onClick={() => onOpen(item.id)}><span><strong>{item.title || "제목 없는 기사"}</strong><small>{item.revision_no ? formatArticleTime(item.updated_at) : "현재 원고 · 저장 전"}</small></span><span className="workspace-status">{item.status || "작성 중"}</span></button>)}</div>
    </section>
  </div>;
}
