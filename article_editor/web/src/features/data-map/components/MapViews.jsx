import { FileEdit, List, Network } from "lucide-react";

// Data Map 안의 보기 전환(관계망 / 파일 목록 / 기사 모아보기). 프로토타입 NewsroomChrome.jsx 에서
// 이 부분만 옮겼다 — 가짜 헤더·사이드바·탭은 앱에 이미 있으므로 가져오지 않는다.
export default function MapViews({ view, onView, count }) {
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
