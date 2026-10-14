import { useState } from "react";
import { AlertTriangle, ArrowRight, Plus } from "lucide-react";
import { formatArticleTime } from "../data/article";
import DeskCalendar from "./DeskCalendar.jsx";
import { deskSchedule, countByStage, deadlineQueue, focusStory, WRITING_STEPS } from "../data/desk";

const ISSUE_ICONS = { verify: AlertTriangle, evidence: AlertTriangle, link: Plus };
// 오늘 저장한 원고는 시각만, 그 전 원고는 날짜까지 보인다
const savedAt = (value, today) => { const time = formatArticleTime(value); return time.startsWith(today) ? time.slice(11) : time; };

export default function DeskView({ articles, onNavigate, busy }) {
  const [today] = useState(() => new Date());
  const queue = deadlineQueue(deskSchedule);
  const story = focusStory(deskSchedule);
  const recent = articles.filter((item) => item.revision_no).slice(0, 2);
  const todayStamp = today.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const todayFormatted = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full", timeZone: "Asia/Seoul" }).format(today);
  // 달력에서 고른 날짜(기간). 데스크 편성표는 오늘 일정이라, 고른 날짜에 오늘이 들어 있으면 오늘의 마감 큐를, 아니면 빈 일정을 보인다.
  const [range, setRange] = useState(() => ({ start: todayStamp, end: null, picking: false }));
  const rangeEnd = range.end || range.start;
  const isTodayOnly = range.start === todayStamp && !range.end;
  const shown = range.start <= todayStamp && todayStamp <= rangeEnd ? queue : [];
  const md = (stamp) => { const [, m, d] = stamp.split("-").map(Number); return `${m}월 ${d}일`; };
  const queueTitle = isTodayOnly ? "오늘의 마감 큐" : `${md(range.start)}${range.end ? ` ~ ${md(range.end)}` : ""} 일정`;

  return <div data-testid="desk-view">
    {/* 상단: 왼쪽은 날짜(작은 영문 표제 크기) + "좋은 기사를 위한 오늘의 업무", 오른쪽 빈 자리에는 상태별 기사 칸(편집 중·검증 대기·송고 준비·출고 완료) */}
    <header className="mb-7 flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[#8E8982]">{todayFormatted}</p>
        <h1 data-testid="page-heading" className="mt-2 text-[40px] md:text-[56px] font-black leading-[1.04] tracking-[-0.045em] text-[#111]">
          좋은 기사를 위한<br />오늘의 업무
        </h1>
      </div>
      <section className="workspace-metrics workspace-metrics--inline !my-0 w-full max-w-[620px] lg:w-auto lg:min-w-[520px]" aria-label="상태별 기사">{countByStage(deskSchedule).map(([label, count]) => <div key={label}><span>{label}</span><strong>{String(count).padStart(2, "0")}</strong></div>)}</section>
    </header>

    {story && <div className="workspace-master-detail">
      <section className="workspace-panel desk-focus" aria-labelledby="desk-focus-heading">
        <header className="desk-section-head"><h2 id="desk-focus-heading">지금 집중할 기사</h2><span className="desk-deadline">오늘 {story.deadline} 마감</span></header>
        <div className="desk-focus-body">
          <div className="desk-story">
            <p className="desk-byline">{story.desk} · {story.owner}</p>
            <h3>{story.title || story.slug}</h3>
            {story.deck && <p>{story.deck}</p>}
            <div className="workspace-actions"><button type="button" className="workspace-primary" onClick={() => onNavigate("writer")}>원고 이어쓰기</button><button type="button" onClick={() => onNavigate("evidence")}>근거 확인</button></div>
          </div>
          <dl className="desk-facts">{[
            story.step > 1 && ["작성", "완료"],
            story.evidence && ["근거", `${story.evidence.linked}/${story.evidence.total}`],
            story.interviews != null && ["인터뷰", `${story.interviews}건`],
            story.checksLeft != null && ["검증", `${story.checksLeft}건 남음`],
          ].filter(Boolean).map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
        </div>
        <div className="desk-track">
          <span className="desk-track-label" id="desk-steps-label">기사 작성 단계</span>
          <ol className="desk-steps" aria-labelledby="desk-steps-label">{WRITING_STEPS.map((label, index) => {
            const state = index < story.step ? "done" : index === story.step ? "active" : "todo";
            return <li key={label} data-state={state} aria-current={state === "active" ? "step" : undefined}><span className="desk-step-node" aria-hidden="true">{state === "done" ? "✓" : index + 1}</span><strong>{label}</strong><small>{state === "done" ? "완료" : state === "active" ? "진행 중" : "대기"}</small></li>;
          })}</ol>
        </div>
      </section>

      <aside className="workspace-panel desk-attention" aria-labelledby="desk-inbox-title">
        <header className="desk-section-head"><h2 id="desk-inbox-title">지금 확인할 것</h2></header>
        {story.issues?.length
          ? <ol className="desk-inbox">{story.issues.map((issue, index) => {
            const Icon = ISSUE_ICONS[issue.kind] || AlertTriangle;
            return <li key={issue.title} data-kind={issue.kind}>
              <span className="desk-inbox-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div><span className="desk-inbox-label"><Icon aria-hidden="true" />{issue.label}</span><strong>{issue.title}</strong><small>{issue.detail}</small></div>
              <button type="button" onClick={() => onNavigate(issue.to)}>{issue.action}</button>
            </li>;
          })}</ol>
          : <p className="workspace-muted">지금 처리할 검증·근거 작업이 없습니다.</p>}
      </aside>
    </div>}

    {/* 마감 큐는 폭을 줄이고 오른쪽에 달력을 둔다. 날짜를 고르면 그 날짜의 일정이 나온다 */}
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="workspace-panel" aria-labelledby="desk-queue-title">
        <h2 id="desk-queue-title">{queueTitle} <small>마감 임박순 · {shown.length}건</small></h2>
        <div className="desk-queue" role="table" aria-label={queueTitle}>
          <div role="row" className="desk-queue-head"><span role="columnheader">마감</span><span role="columnheader">기사</span><span role="columnheader">담당</span><span role="columnheader">현재 상태</span><span role="columnheader">다음 작업</span></div>
          {shown.map((item) => <div role="row" key={item.id} aria-current={item.id === story?.id || undefined}>
            <strong role="cell" className="desk-queue-time">{item.deadline}</strong>
            <span role="cell" className="desk-queue-title"><small>{item.desk}</small>{item.slug}</span>
            <span role="cell">{item.owner}</span>
            <span role="cell"><span className="workspace-status">{item.status}</span></span>
            <span role="cell">{item.next && <button type="button" onClick={() => onNavigate(item.next.to)} aria-label={`${item.slug}: ${item.next.label}`}>{item.next.label}<ArrowRight aria-hidden="true" /></button>}</span>
          </div>)}
        </div>
        {!shown.length && <p className="workspace-muted" data-testid="desk-queue-empty">선택한 날짜에 잡힌 일정이 없습니다.</p>}
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
