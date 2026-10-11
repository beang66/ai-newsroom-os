import { useMemo, useState } from "react";
import { Alert } from "./components/Alert.tsx";
import { Badge } from "./components/Badge.tsx";
import { Button } from "./components/Button.tsx";
import { Checkbox } from "./components/Checkbox.tsx";
import { ProgressBar } from "./components/ProgressBar.tsx";
import { ProgressIndicator } from "./components/ProgressIndicator.tsx";
import { Tabs } from "./components/Tabs.tsx";
import { Textarea } from "./components/Textarea.tsx";
import { TextInput } from "./components/TextInput.tsx";
import { Toggle } from "./components/Toggle.tsx";

const story = {
  title: "서울 폭염 대응, 취약계층 거주지를 집중 분석합니다",
  deck: "기온·복지·현장 인터뷰를 교차 검증해 지역별 체감온도 격차와 대응 사각지대를 추적합니다.",
};

const destinations = [
  { id: "desk", number: "01", label: "오늘의 데스크", icon: "home" },
  { id: "write", number: "02", label: "기사 작성", icon: "edit" },
  { id: "interview", number: "03", label: "인터뷰·녹취", icon: "play_arrow" },
  { id: "publish", number: "04", label: "변환·배포", icon: "share" },
  { id: "map", number: "05", label: "데이터맵", icon: "link" },
  { id: "archive", number: "06", label: "보관함", icon: "folder" },
];

function Shell({ page, setPage, children }) {
  const active = destinations.find((item) => item.id === page);
  return (
    <div className="swiss-app" data-alpy-mode="light">
      <header className="global-header">
        <button className="wordmark" onClick={() => setPage("desk")} aria-label="Newsroom OS 홈">
          <span>N</span><strong>NEWSROOM OS</strong>
        </button>
        <div className="project-context"><span>현재 기획</span><strong>서울 폭염 대응</strong></div>
        <div className="global-status"><Badge iconId="check" iconMode="left" mode="light" variant="success">자동 저장</Badge><span>2026.10.11 · 10:42</span></div>
        <Button aria-label="전체 검색" iconId="search" iconMode="only" mode="light" size="md" variant="outline" />
        <Button aria-label="알림" iconId="notifications" iconMode="only" mode="light" size="md" variant="outline" />
      </header>
      <div className="shell-grid">
        <aside className="sidebar">
          <nav aria-label="주요 메뉴">
            {destinations.map((item) => (
              <button key={item.id} className={page === item.id ? "nav-item active" : "nav-item"} onClick={() => setPage(item.id)} aria-label={item.label} aria-current={page === item.id ? "page" : undefined}>
                <span>{item.number}</span><strong>{item.label}</strong>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <Button iconId="settings" iconMode="left" mode="light" size="sm" variant="link">환경 설정</Button>
            <div className="profile"><span>김</span><div><strong>김다은 기자</strong><small>사회부 · 서울팀</small></div></div>
          </div>
        </aside>
        <main className="main">
          <div className="mobile-location"><span>{active?.number}</span><strong>{active?.label}</strong></div>
          {children}
        </main>
      </div>
    </div>
  );
}

function PageHeader({ index, eyebrow, title, description, actions }) {
  return (
    <header className="page-header">
      <div className="page-index" aria-hidden="true">{index}</div>
      <div className="page-heading"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

function SectionHead({ code, title, meta, action }) {
  return (
    <div className="section-head">
      <div><span>{code}</span><h2>{title}</h2></div>
      <div className="section-meta">{meta}{action}</div>
    </div>
  );
}

function DeskPage({ setPage }) {
  const queue = [
    ["10:40", "사회", "폭염 대응 기획", "김다은", "검증 중", "warning"],
    ["11:20", "경제", "가계부채 연속 기획", "이재호", "편집 중", "brandOne"],
    ["13:00", "지역", "집중호우 복구 현장", "정소라", "취재 중", "info"],
    ["15:30", "문화", "가을 국제영화제 개막", "한지수", "배포 준비", "success"],
  ];
  return (
    <>
      <PageHeader index="01" eyebrow="SUNDAY · 11 OCTOBER" title="오늘의 데스크" description="우선순위가 높은 기사와 마감 위험을 한눈에 확인합니다." actions={<Button iconId="plus" iconMode="left" mode="light" size="md" variant="primary">새 기사</Button>} />
      <section className="metric-band" aria-label="오늘의 업무 현황">
        {[["마감 예정","04"],["검증 대기","03"],["편집 중","07"],["배포 준비","05"]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>
      <div className="desk-focus">
        <section className="focus-story" aria-labelledby="focus-title">
          <SectionHead code="A / PRIMARY STORY" title="지금 집중할 기사" meta={<Badge mode="light" variant="warning">마감 18:00</Badge>} />
          <div className="story-composition">
            <div className="story-copy"><span>사회부 · 김다은 기자</span><h3 id="focus-title">{story.title}</h3><p>{story.deck}</p><div><Button iconId="edit" iconMode="left" mode="light" size="lg" variant="primary" onClick={() => setPage("write")}>원고 이어쓰기</Button><Button iconId="link" iconMode="left" mode="light" size="lg" variant="outline" onClick={() => setPage("map")}>근거 확인</Button></div></div>
            <div className="readiness"><span>기사 준비도</span><strong>68%</strong><ProgressBar max={100} mode="light" showIcon={false} value={68} status="68%" variant="default" /><dl><div><dt>자료</dt><dd>12</dd></div><div><dt>검증</dt><dd>8/11</dd></div><div><dt>인터뷰</dt><dd>03</dd></div></dl></div>
          </div>
        </section>
        <aside className="priority-list" aria-labelledby="priority-title">
          <SectionHead code="B / ATTENTION" title="지금 확인할 것" />
          <ol>
            <li><span>01</span><div><Badge mode="light" variant="danger">수치 불일치</Badge><strong id="priority-title">4.2도 표기 재확인</strong><small>원자료 4.18도 · 12분 전</small></div></li>
            <li><span>02</span><div><Badge mode="light" variant="warning">출처 필요</Badge><strong>정책 효과 주장 2건</strong><small>본문 3·5문단 · 24분 전</small></div></li>
            <li><span>03</span><div><Badge mode="light" variant="info">새 자료</Badge><strong>서울시 관측 자료 연결</strong><small>주장 4건에 자동 연결</small></div></li>
          </ol>
        </aside>
      </div>
      <section className="queue-section">
        <SectionHead code="C / DEADLINE QUEUE" title="오늘의 마감 큐" meta={<span>마감순 · 4건</span>} />
        <div className="data-table">
          <div className="data-head"><span>마감</span><span>데스크</span><span>기사</span><span>담당</span><span>상태</span><span /></div>
          {queue.map(([time,desk,title,owner,status,tone])=><div className="data-row" key={title}><strong>{time}</strong><span>{desk}</span><span className="primary-cell">{title}</span><span>{owner}</span><Badge mode="light" variant={tone}>{status}</Badge><Button aria-label={`${title} 열기`} iconId="arrow_forward" iconMode="only" mode="light" size="sm" variant="link" /></div>)}
        </div>
      </section>
    </>
  );
}

function WritePage() {
  const evidenceTabs = [
    { id:"verify", label:"검증 3", panel:<EvidencePanel /> },
    { id:"sources", label:"자료 12", panel:<SourcePanel /> },
    { id:"preview", label:"미리보기", panel:<PreviewPanel /> },
  ];
  return (
    <>
      <PageHeader index="02" eyebrow="ARTICLE WORKSPACE" title="기사 작성" description="원고와 근거를 같은 문맥에서 편집하고 검증합니다." actions={<><Button iconId="bookmark" iconMode="left" mode="light" size="md" variant="outline">버전 저장</Button><Button iconId="share" iconMode="left" mode="light" size="md" variant="primary">CMS 발행</Button></>} />
      <div className="editor-progress">
        <ProgressIndicator mode="light" steps="4" variant="inline" stepItems={[{label:"취재",state:"completed"},{label:"검증",state:"active"},{label:"편집",state:"inactive"},{label:"발행",state:"inactive"}]} />
      </div>
      <div className="editor-grid">
        <aside className="editor-context">
          <SectionHead code="ARTICLE / 026" title="원고 정보" />
          <dl className="meta-list"><div><dt>기자</dt><dd>김다은</dd></div><div><dt>데스크</dt><dd>사회부</dd></div><div><dt>마감</dt><dd>오늘 18:00</dd></div><div><dt>분량</dt><dd>1,284자</dd></div></dl>
          <div className="context-actions"><Button iconId="text_fields" iconMode="left" mode="light" size="sm" variant="link">AI 초안</Button><Button iconId="search" iconMode="left" mode="light" size="sm" variant="link">자료 검색</Button><Button iconId="photo" iconMode="left" mode="light" size="sm" variant="link">사진 관리</Button></div>
        </aside>
        <article className="editor-sheet">
          <div className="editor-toolbar"><div><Button aria-label="굵게" iconId="text_fields" iconMode="only" mode="light" size="sm" variant="outline" /><Button aria-label="인용 삽입" iconId="comment_1" iconMode="only" mode="light" size="sm" variant="outline" /><Button aria-label="링크 삽입" iconId="link" iconMode="only" mode="light" size="sm" variant="outline" /></div><Badge iconId="check" iconMode="left" mode="light" variant="success">방금 저장됨</Badge></div>
          <label className="title-field"><span>제목</span><textarea defaultValue={story.title} aria-label="기사 제목" /></label>
          <Textarea mode="light" label="부제" showLabel fieldText={story.deck} variant="default" />
          <div className="article-copy" contentEditable suppressContentEditableWarning aria-label="기사 본문 편집기">
            <p>서울의 여름 기온이 해마다 오르는 가운데, 같은 자치구 안에서도 실제 체감온도는 거주 환경에 따라 크게 달라지는 것으로 나타났다.</p>
            <p>본지가 서울시 자동기상관측 자료와 복지시설 위치 데이터를 교차 분석한 결과, 취약계층 밀집 지역의 오후 평균 표면 온도는 인접 일반 주거지보다 <mark>4.2도 높았다.</mark></p>
            <div className="media-placeholder"><span>PHOTO / 01</span><strong>현장 사진 영역</strong><small>서울 영등포구 쪽방촌 · 김다은 기자</small></div>
            <p>전문가들은 폭염 대응이 행정구역의 평균기온이 아닌 생활권 단위로 설계되어야 한다고 지적했다. 관측값과 실제 주민 노출 위험을 함께 살펴야 한다는 설명이다.</p>
          </div>
        </article>
        <aside className="evidence-rail">
          <Tabs mode="light" tabs={evidenceTabs} tab3 tab4={false} tab5={false} tab6={false} variant="line" />
        </aside>
      </div>
    </>
  );
}

function EvidencePanel() {
  return <div className="tool-panel"><SectionHead code="FACT CHECK" title="근거 검증" meta={<span>8 / 11</span>} /><ProgressBar headline="확인된 주장" meta="남은 검증 3건" mode="light" showIcon={false} status="73%" value={73} variant="with-label" /><Alert title="수치 불일치" description="본문 4.2도와 원자료 4.18도가 다릅니다." iconId="warning" mode="light" showDescription showIcon variant="warning" /><div className="claim-item"><Badge mode="light" variant="success">일치 96%</Badge><strong>접근성에 따른 온도 격차</strong><small>서울시 기후 보고서 · 24쪽</small><Button iconId="link" iconMode="left" mode="light" size="sm" variant="link">인용 주석 삽입</Button></div></div>;
}
function SourcePanel() {
  return <div className="tool-panel"><TextInput leftIconId="search" mode="light" placeholder="자료 검색" showLabel={false} showLeftIcon variant="with-icon" />{["서울시 도시기후 보고서 2026.pdf","영등포구 현장 취재노트.md","폭염 취약계층 지원 예산.xlsx"].map((name)=><div className="source-item" key={name}><span>FILE</span><div><strong>{name}</strong><small>기사에 연결됨</small></div><Button aria-label={`${name} 열기`} iconId="arrow_forward" iconMode="only" mode="light" size="sm" variant="link" /></div>)}</div>;
}
function PreviewPanel() {
  return <div className="tool-panel"><SectionHead code="LIVE PREVIEW" title="지면 미리보기" /><div className="paper-preview"><span>동아일보</span><h3>{story.title}</h3><small>입력 2026.10.11. 15:18</small><div /><p>{story.deck}</p></div><Button iconId="arrow_forward" iconMode="right" mode="light" size="sm" variant="link">새 창에서 보기</Button></div>;
}

function InterviewPage() {
  const dialogue = [
    ["00:42","김다은 기자","같은 자치구 안에서도 체감온도가 다른 이유는 무엇인가요?"],
    ["01:08","이정민 연구위원","건물 배치와 녹지 접근, 환기 조건이 겹칩니다. 행정구역 평균만 보면 생활권 단위 위험이 가려집니다."],
    ["02:31","김다은 기자","정책은 무엇부터 바뀌어야 한다고 보십니까?"],
    ["02:48","이정민 연구위원","고령층과 옥탑·쪽방 거주자를 중심으로 쉼터 접근성과 이동 동선을 함께 설계해야 합니다."],
  ];
  return (
    <>
      <PageHeader index="03" eyebrow="INTERVIEW DESK" title="인터뷰·녹취" description="음성과 문장을 연결해 기사에 필요한 발언을 빠르게 선별합니다." actions={<><Button iconId="download" iconMode="left" mode="light" size="md" variant="outline">TXT 내보내기</Button><Button iconId="plus" iconMode="left" mode="light" size="md" variant="primary">음성 추가</Button></>} />
      <section className="audio-player">
        <div className="audio-file"><span>58:40</span><div><strong>이정민_도시환경연구소_인터뷰.m4a</strong><small>전사 완료 · 화자 2명</small></div></div>
        <Button aria-label="재생" iconId="play_arrow_filled" iconMode="only" mode="light" size="lg" variant="primary" />
        <div className="audio-progress"><ProgressBar max={100} mode="light" showIcon={false} value={28} status="12:18 / 58:40" variant="default" /></div>
        <Button mode="light" size="sm" variant="outline">1.0×</Button>
      </section>
      <div className="transcript-grid">
        <section className="transcript">
          <SectionHead code="TRANSCRIPT / 04" title="녹취록" meta={<TextInput leftIconId="search" mode="light" placeholder="발언 검색" showLabel={false} showLeftIcon variant="with-icon" />} />
          {dialogue.map(([time,speaker,text],index)=><article className="dialogue" key={time}><Button iconId="play_arrow" iconMode="left" mode="light" size="sm" variant="link">{time}</Button><div><strong>{speaker}</strong><p>{text}</p><div><Button iconId="copy" iconMode="left" mode="light" size="sm" variant="link">복사</Button><Button iconId="plus" iconMode="left" mode="light" size="sm" variant={index===1?"primary":"outline"}>기사로 보내기</Button></div></div></article>)}
        </section>
        <aside className="quote-bank">
          <SectionHead code="SELECTED / 02" title="선택한 발언" />
          <blockquote><span>01:08</span><p>“행정구역 평균만 보면 생활권 단위 위험이 가려집니다.”</p><cite>이정민 연구위원</cite></blockquote>
          <blockquote><span>02:48</span><p>“쉼터 접근성과 이동 동선을 함께 설계해야 합니다.”</p><cite>이정민 연구위원</cite></blockquote>
          <Button iconId="arrow_forward" iconMode="right" mode="light" size="md" variant="primary">원고 커서에 삽입</Button>
        </aside>
      </div>
    </>
  );
}

function PublishPage() {
  const [channel,setChannel]=useState("cards");
  const channels=[["cards","카드뉴스","6장"],["instagram","Instagram","피드"],["threads","Threads","6개 스레드"],["blog","블로그","긴 글"],["short","숏폼","60초"]];
  return (
    <>
      <PageHeader index="04" eyebrow="CHANNEL STUDIO" title="변환·배포" description="하나의 기사에서 채널별 자산을 만들고 발행 상태를 관리합니다." actions={<><Button iconId="bookmark" iconMode="left" mode="light" size="md" variant="outline">작업 저장</Button><Button iconId="share" iconMode="left" mode="light" size="md" variant="primary">선택 채널에 배포</Button></>} />
      <div className="publish-grid">
        <aside className="channel-rail"><SectionHead code="CHANNELS" title="배포 형식" />{channels.map(([id,name,meta])=><button className={channel===id?"channel active":"channel"} key={id} onClick={()=>setChannel(id)}><span>{name}</span><small>{meta}</small></button>)}<Button iconId="text_fields" iconMode="left" mode="light" size="md" variant="outline">AI로 전체 변환</Button></aside>
        <section className="canvas">
          <div className="canvas-tools"><div><Button aria-label="실행 취소" iconId="arrow_back" iconMode="only" mode="light" size="sm" variant="outline" /><Button aria-label="다시 실행" iconId="arrow_forward" iconMode="only" mode="light" size="sm" variant="outline" /></div><span>카드 01 / 06</span><div><Button iconId="photo" iconMode="left" mode="light" size="sm" variant="outline">사진 교체</Button><Button iconId="download" iconMode="left" mode="light" size="sm" variant="outline">내보내기</Button></div></div>
          <div className="canvas-stage"><div className="social-art"><div className="social-label">NEWSROOM / CITY</div><div className="social-media"><span>PHOTO / 01</span></div><div className="social-copy"><span>서울 폭염 리포트</span><h2>같은 도시,<br/>다른 여름</h2><p>취약계층 밀집 지역의 오후 평균 표면 온도는 인접 주거지보다 4.2도 높았습니다.</p></div><div className="social-page">01 / 06</div></div></div>
        </section>
        <aside className="card-sequence"><SectionHead code="SEQUENCE" title="카드 구성" action={<Button aria-label="카드 추가" iconId="plus" iconMode="only" mode="light" size="sm" variant="outline" />} />{["같은 도시, 다른 여름","4.2도의 격차","누가 더 위험한가","현장의 목소리","정책의 빈틈","데이터 전체 보기"].map((label,index)=><button className={index===0?"sequence-item active":"sequence-item"} key={label}><span>{String(index+1).padStart(2,"0")}</span><strong>{label}</strong></button>)}<div className="publish-options"><Toggle checked label="출처 표기" mode="light" showLabel size="md" variant="checked" /><Toggle checked label="기사 링크" mode="light" showLabel size="md" variant="checked" /></div></aside>
      </div>
    </>
  );
}

function MapPage() {
  const [view,setView]=useState("graph");
  return (
    <>
      <PageHeader index="05" eyebrow="EVIDENCE NETWORK" title="데이터맵" description="기사의 주장·출처·인물 관계를 탐색하고 빠진 근거를 찾습니다." actions={<Button iconId="arrow_back" iconMode="left" mode="light" size="md" variant="primary">기사 문장으로 이동</Button>} />
      <div className="map-command"><TextInput leftIconId="search" mode="light" placeholder="주장, 자료명, 인물·기관 검색" showLabel={false} showLeftIcon variant="with-icon" /><div><Button mode="light" size="sm" variant={view==="graph"?"primary":"outline"} onClick={()=>setView("graph")}>관계 보기</Button><Button mode="light" size="sm" variant={view==="list"?"primary":"outline"} onClick={()=>setView("list")}>목록 보기</Button></div></div>
      <div className="map-grid">
        <aside className="map-filter"><SectionHead code="FILTER" title="표시 항목" /><Checkbox groupHeading="" items={[{id:"article",label:"기사 · 1",checked:true},{id:"claim",label:"주장 · 11",checked:true},{id:"source",label:"출처 · 12",checked:true},{id:"person",label:"인물·기관 · 6",checked:true}]} mode="light" size="md" variant="group" /><Alert title="미연결 주장 3건" description="근거가 없는 주장을 우선 확인하세요." iconId="warning" mode="light" showDescription showIcon variant="warning" /></aside>
        <section className="network" aria-label="기사 근거 관계망">
          {view==="graph"?<div className="network-board"><button className="network-node article-node"><span>ARTICLE</span><strong>서울 폭염 대응</strong></button><button className="network-node claim-node n1"><span>CLAIM 01</span><strong>평균 4.2도 격차</strong></button><button className="network-node source-node n2"><span>SOURCE 03</span><strong>도시기후 보고서</strong></button><button className="network-node person-node n3"><span>PERSON 02</span><strong>이정민 연구위원</strong></button><button className="network-node claim-node n4"><span>CLAIM 07</span><strong>쉼터 접근성</strong></button><div className="network-axis horizontal"/><div className="network-axis vertical"/></div>:<div className="network-list">{["평균 4.2도 격차","도시기후 보고서 2026","이정민 연구위원","쉼터 접근성 개선"].map((item,index)=><div key={item}><span>{String(index+1).padStart(2,"0")}</span><strong>{item}</strong><Button aria-label={`${item} 열기`} iconId="arrow_forward" iconMode="only" mode="light" size="sm" variant="link" /></div>)}</div>}
        </section>
        <aside className="node-detail"><Badge mode="light" variant="warning">주장 · 확인 필요</Badge><h2>취약계층 밀집 지역의 오후 평균 표면 온도는 인접 주거지보다 4.2도 높다.</h2><p>본문 2문단 · 첫 번째 문장</p><Button iconId="arrow_back" iconMode="left" mode="light" size="md" variant="outline">기사에서 확인</Button><hr/><span className="detail-label">연결된 근거 · 02</span><blockquote>“생활권별 최고 표면온도는 주거 형태에 따라 평균 4.18도의 차이를 보였다.”</blockquote><small>서울시 도시기후 보고서 · 24쪽</small></aside>
      </div>
    </>
  );
}

function ArchivePage() {
  const [selected,setSelected]=useState(0);
  const items=[
    [story.title,"작성 중","방금 전","warning"],
    ["심야 노선버스 확대, 시민의 밤은 달라졌나","검증 완료","어제","success"],
    ["재개발 이주대책, 세입자는 어디로 가나","발행됨","10월 8일","neutral"],
    ["야간버스 노선 개편의 남은 과제","발행됨","10월 4일","neutral"],
  ];
  return (
    <>
      <PageHeader index="06" eyebrow="NEWSROOM ARCHIVE" title="기사 보관함" description="원고와 연결된 취재 자료, 인터뷰, 미디어, 발행 이력을 함께 찾습니다." actions={<Button iconId="plus" iconMode="left" mode="light" size="md" variant="primary">새 기사</Button>} />
      <div className="archive-command"><TextInput leftIconId="search" mode="light" placeholder="기사 제목, 기자, 키워드 검색" showLabel={false} showLeftIcon variant="with-icon" /><div><Button mode="light" size="sm" variant="primary">전체 24</Button><Button mode="light" size="sm" variant="link">작성 중 5</Button><Button mode="light" size="sm" variant="link">발행됨 15</Button></div></div>
      <div className="archive-grid">
        <section className="archive-list"><SectionHead code="ARTICLES / 24" title="최근 기사" meta={<span>최근 수정순</span>} />{items.map(([title,status,date,tone],index)=><button className={selected===index?"archive-row active":"archive-row"} key={title} onClick={()=>setSelected(index)}><span>{String(index+1).padStart(2,"0")}</span><div><strong>{title}</strong><small>김다은 기자 · 사회부 · {date}</small></div><Badge mode="light" variant={tone}>{status}</Badge></button>)}</section>
        <section className="archive-detail"><span className="detail-kicker">SELECTED ARTICLE · 01</span><Badge mode="light" variant="warning">작성 중</Badge><h2>{items[selected][0]}</h2><p>{story.deck}</p><div className="detail-actions"><Button iconId="edit" iconMode="left" mode="light" size="md" variant="primary">원고 열기</Button><Button iconId="copy" iconMode="left" mode="light" size="md" variant="outline">복제</Button></div><div className="asset-line">{[["자료","12"],["인터뷰","03"],["사진","08"],["변환본","06"]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><SectionHead code="HISTORY" title="최근 활동" /><div className="history-row"><span>10:41</span><div><strong>자동 저장</strong><small>본문 2문단 수정</small></div></div><div className="history-row"><span>10:18</span><div><strong>팩트체크 실행</strong><small>주장 11개 중 8개 확인</small></div></div></section>
      </div>
    </>
  );
}

export default function PilotApp() {
  const [page,setPage]=useState("desk");
  const pages=useMemo(()=>({desk:<DeskPage setPage={setPage}/>,write:<WritePage/>,interview:<InterviewPage/>,publish:<PublishPage/>,map:<MapPage/>,archive:<ArchivePage/>}),[]);
  return <Shell page={page} setPage={setPage}>{pages[page]}</Shell>;
}
