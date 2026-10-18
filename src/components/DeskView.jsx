import { useState } from "react";
import { AlertTriangle, ArrowRight, Plus } from "lucide-react";
import { formatArticleTime } from "../data/article";
import DeskCalendar from "./DeskCalendar.jsx";
import { WRITING_STEPS, articlesInRange, countByStage, focusStory, issuesOf, nextAction, stageLabel, stepsDone, writingStep } from "../data/desk";

const ISSUE_ICONS = { verify: AlertTriangle, evidence: AlertTriangle, save: Plus };
// 오늘 저장한 원고는 시각만, 그 전 원고는 날짜까지 보인다
const savedAt = (value, today) => { const time = formatArticleTime(value); return time.startsWith(today) ? time.slice(11) : time; };

// 오늘의 데스크: 코어에 저장된 기사만 보인다(데모 편성표 없음). articles = listStoredArticles() 결과
export default function DeskView({ articles, onNavigate, onOpen, onNewArticle, busy }) {
  const [today] = useState(() => new Date());
  const story = focusStory(articles);
  const recent = articles.filter((item) => item.revision_no).slice(0, 2);
  const todayStamp = today.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const todayFormatted = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full", timeZone: "Asia/Seoul" }).format(today);
  // 달력에서 고른 날짜(기간)에 고친 기사를 보인다. 기본은 오늘.
  const [range, setRange] = useState(() => ({ start: todayStamp, end: null, picking: false }));
  const isTodayOnly = range.start === todayStamp && !range.end;
  const shown = articlesInRange(articles, range.start, range.end || range.start);
  const md = (stamp) => { const [, m, d] = stamp.split("-").map(Number); return `${m}월 ${d}일`; };
  const queueTitle = isTodayOnly ? "오늘 고친 기사" : `${md(range.start)}${range.end ? ` ~ ${md(range.end)}` : ""} 고친 기사`;
  const go = (article, to) => (to === "writer" || to === "evidence" ? onOpen(article.id, to) : onNavigate(to));
  const step = story ? writingStep(story) : 0;
  const done = story ? stepsDone(story) : [];
  const issues = story ? issuesOf(story) : [];

  return <div data-testid="desk-view">
    <header className="mb-7 flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[#8E8982]">{todayFormatted}</p>
        <h1 data-testid="page-heading" className="mt-2 text-[40px] md:text-[56px] font-black leading-[1.04] tracking-[-0.045em] text-[#111]">
          좋은 기사를 위한<br />오늘의 업무
        </h1>
        {onNewArticle && <button type="button" onClick={onNewArticle} disabled={busy}
          className="mt-4 rounded-full bg-[#111] px-4 py-2 text-[12px] font-bold text-white hover:bg-black disabled:opacity-50 cursor-pointer">+ 새 기사</button>}
      </div>
      <section data-testid="desk-metrics" className="workspace-metrics workspace-metrics--inline !my-0 w-full max-w-[620px] lg:w-auto lg:min-w-[420px]" aria-label="상태별 기사">{countByStage(articles.filter((item) => item.revision_no)).map(([label, value]) => <div key={label}><span>{label}</span><strong>{String(value).padStart(2, "0")}</strong></div>)}</section>
    </header>

    {story ? <div className="workspace-master-detail">
      <section className="workspace-panel desk-focus" aria-labelledby="desk-focus-heading">
        <header className="desk-section-head"><h2 id="desk-focus-heading">지금 집중할 기사</h2><span className="desk-deadline">{savedAt(story.updated_at, todayStamp)} 저장 · {stageLabel(story)}</span></header>
        <div className="desk-focus-body">
          <div className="desk-story">
            <h3 data-testid="desk-focus-title">{story.title || "제목 없는 기사"}</h3>
            {story.subtitle && <p>{story.subtitle}</p>}
            <div className="workspace-actions"><button type="button" className="workspace-primary" onClick={() => onOpen(story.id, "writer")}>원고 이어쓰기</button><button type="button" onClick={() => onOpen(story.id, "evidence")}>근거 확인</button></div>
          </div>
          <dl className="desk-facts">{[
            ["근거 자료", `${story.linkedSources?.length || 0}건`],
            ["인터뷰", `${story.linkedInterviews?.length || 0}건`],
            ["사진", `${story.photo_count || 0}장`],
            ["저장", `${story.revision_count || 0}회`],
          ].map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
        </div>
        <div className="desk-track">
          <span className="desk-track-label" id="desk-steps-label">기사 작성 단계</span>
          <ol className="desk-steps" aria-labelledby="desk-steps-label">{WRITING_STEPS.map((label, index) => {
            const state = done[index] ? "done" : index === step ? "active" : "todo";
            return <li key={label} data-state={state} aria-current={state === "active" ? "step" : undefined}><span className="desk-step-node" aria-hidden="true">{state === "done" ? "✓" : index + 1}</span><strong>{label}</strong><small>{state === "done" ? "완료" : state === "active" ? "진행 중" : "대기"}</small></li>;
          })}</ol>
        </div>
      </section>

      <aside className="workspace-panel desk-attention" aria-labelledby="desk-inbox-title">
        <header className="desk-section-head"><h2 id="desk-inbox-title">지금 확인할 것</h2></header>
        {issues.length
          ? <ol className="desk-inbox">{issues.map((issue, index) => {
            const Icon = ISSUE_ICONS[issue.kind] || AlertTriangle;
            return <li key={issue.title} data-kind={issue.kind}>
              <span className="desk-inbox-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div><span className="desk-inbox-label"><Icon aria-hidden="true" />{issue.label}</span><strong>{issue.title}</strong><small>{issue.detail}</small></div>
              <button type="button" onClick={() => go(story, issue.to)}>{issue.action}</button>
            </li>;
          })}</ol>
          : <p className="workspace-muted">지금 처리할 저장·근거·송고 작업이 없습니다.</p>}
      </aside>
    </div> : <p className="workspace-muted mb-6" data-testid="desk-empty">아직 송고 전인 저장 기사가 없습니다. 새 기사를 쓰고 저장하면 여기에 보입니다.</p>}

    <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="workspace-panel" aria-labelledby="desk-queue-title">
        <h2 id="desk-queue-title">{queueTitle} <small>최근 수정순 · {shown.length}건</small></h2>
        <div className="desk-queue" role="table" aria-label={queueTitle}>
          <div role="row" className="desk-queue-head"><span role="columnheader">저장</span><span role="columnheader">기사</span><span role="columnheader">자료</span><span role="columnheader">현재 상태</span><span role="columnheader">다음 작업</span></div>
          {shown.map((item) => { const next = nextAction(item); return <div role="row" key={item.id} aria-current={item.id === story?.id || undefined}>
            <strong role="cell" className="desk-queue-time">{savedAt(item.updated_at, todayStamp)}</strong>
            <span role="cell" className="desk-queue-title">{item.title || "제목 없는 기사"}</span>
            <span role="cell">{item.linkedSources?.length || 0}건</span>
            <span role="cell"><span className="workspace-status">{stageLabel(item)}</span></span>
            <span role="cell">{next && <button type="button" onClick={() => go(item, next.to)} aria-label={`${item.title || "제목 없는 기사"}: ${next.label}`}>{next.label}<ArrowRight aria-hidden="true" /></button>}</span>
          </div>; })}
        </div>
        {!shown.length && <p className="workspace-muted" data-testid="desk-queue-empty">선택한 날짜에 고친 기사가 없습니다.</p>}
      </section>
      <DeskCalendar value={range} today={todayStamp} onChange={setRange} />
    </div>

    <footer className="desk-recent">
      <span className="desk-recent-label">최근 활동</span>
      <ul>{recent.length ? recent.map((item) => <li key={item.id}>{item.title || "제목 없는 기사"} · {savedAt(item.updated_at, todayStamp)} 저장</li>) : <li>아직 저장한 기사가 없습니다</li>}</ul>
      <button type="button" disabled={busy} onClick={() => onNavigate("archive")}>최근 활동 보기 <ArrowRight aria-hidden="true" /></button>
    </footer>
  </div>;
}
