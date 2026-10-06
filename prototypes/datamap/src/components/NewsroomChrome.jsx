import {
  Bell,
  ChevronLeft,
  FileCheck2,
  FileEdit,
  List,
  Mic,
  Network,
  Newspaper,
  PenTool,
  Sparkles,
} from "lucide-react";

const navigation = [
  ["writer", "기사 작성", PenTool],
  ["interview", "녹음 파일", Mic],
  ["convert", "플랫폼 변환", Sparkles],
  ["datamap", "데이터맵", Network],
];
const binder = [
  ["writer", "작성·검토", PenTool],
  ["convert", "플랫폼 변환", Sparkles],
  ["datamap", "데이터맵", Network],
  ["archive", "보관함", FileCheck2],
];

export function NewsroomHeader({ articleTitle }) {
  return (
    <header className="newsroom-header">
      <div className="newsroom-pill newsroom-brand">
        <span className="newsroom-logo">
          <Newspaper size={15} />
        </span>
        <strong>AI Newsroom</strong>
        <span className="newsroom-divider" />
        <span className="newsroom-office">
          <i /> 디지털 편집국
        </span>
      </div>
      <div className="newsroom-pill newsroom-current">
        <FileEdit size={15} />
        <span>현재 작업:</span>
        <strong>{articleTitle}</strong>
        <span className="newsroom-divider" />
        <span className="newsroom-status">데이터맵</span>
      </div>
      <div className="newsroom-pill newsroom-profile">
        <button disabled title="알림 · 추후 연결" aria-label="알림">
          <Bell size={17} />
        </button>
        <span className="newsroom-divider" />
        <span className="newsroom-user">
          <b>김</b> 김동아 기자 <small>| 편집부</small>
        </span>
      </div>
    </header>
  );
}

export function NewsroomSidebar({ collapsed, onCollapse, onDataMap, onArchive, projects = [], project, onProject, projectsExpanded = true }) {
  return (
    <aside
      className={`newsroom-sidebar ${collapsed ? "collapsed" : ""}`}
      aria-label="뉴스룸 메뉴"
    >
      <div className="newsroom-menu-head">
        <button
          onClick={onCollapse}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        >
          <Sparkles size={21} fill="currentColor" />
        </button>
        {!collapsed && <strong>Menu</strong>}
      </div>
      <nav aria-label="뉴스룸 기능">
        {navigation.map(([id, label, Icon]) => (
          <div className="sidebar-nav-group" key={id}>
          <button
            disabled={id !== "datamap"}
            onClick={id === "datamap" ? onDataMap : undefined}
            aria-current={id === "datamap" ? "page" : undefined}
            title={id === "datamap" ? label : `${label} · 추후 연결`}
            className={id === "datamap" ? "active" : ""}
          >
            <Icon size={17} />
            {!collapsed && <span>{label}</span>}
          </button>
          {id === "datamap" && !collapsed && projectsExpanded && (
            <div className="sidebar-project-list" aria-label="데이터맵 프로젝트">
              <button className={project === "all" ? "selected" : ""} onClick={() => onProject?.("all")}>모든 프로젝트</button>
              {projects.map((item) => (
                <button key={item.id} className={project === item.id ? "selected" : ""} onClick={() => onProject?.(item.id)}>
                  <i style={{ background: item.color }} />{item.name}
                </button>
              ))}
            </div>
          )}
          </div>
        ))}
      </nav>
      <div className="newsroom-sidebar-separator">
        {!collapsed && <span>나의 메뉴</span>}
      </div>
      <button
        className="newsroom-archive"
        onClick={onArchive}
        title="나의 기사 모아보기"
      >
        <FileCheck2 size={17} />
        {!collapsed && <span>나의 기사 모아보기</span>}
      </button>
      <button
        className="newsroom-collapse"
        onClick={onCollapse}
        aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
      >
        <ChevronLeft size={17} />
      </button>
    </aside>
  );
}

export function NewsroomTabs({ onDataMap }) {
  return (
    <nav className="newsroom-tabs" aria-label="뉴스룸 탭">
      {binder.map(([id, label, Icon]) => (
        <button
          key={id}
          disabled={id !== "datamap"}
          onClick={id === "datamap" ? onDataMap : undefined}
          aria-current={id === "datamap" ? "page" : undefined}
          title={id === "datamap" ? label : `${label} · 추후 연결`}
          className={id === "datamap" ? "active" : ""}
        >
          <span className="newsroom-tab-icon">
            <Icon size={16} />
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}

export function MapViews({ view, onView, count }) {
  return (
    <div className="datamap-subnav">
      <nav className="map-views" aria-label="데이터맵 보기">
        <button
          className={view === "map" ? "active" : ""}
          onClick={() => onView("map")}
        >
          <Network size={15} /> 지식 관계망
        </button>
        <button
          className={view === "library" ? "active" : ""}
          onClick={() => onView("library")}
        >
          <List size={15} /> 파일 목록
        </button>
        <button
          className={view === "history" ? "active" : ""}
          onClick={() => onView("history")}
        >
          <FileEdit size={15} /> 나의 기사 모아보기
          {count > 0 && <small>{count}</small>}
        </button>
      </nav>
    </div>
  );
}
