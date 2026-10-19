import { List, Network } from "lucide-react";

// 파일럿처럼 검색 옆에서 관계망과 자료 목록만 전환한다.
export default function MapViews({ view, onView }) {
  return (
    <nav className="map-views" aria-label="데이터맵 보기">
      <button
        className={view === "map" ? "active" : ""}
        onClick={() => onView("map")}
      >
        <Network size={15} /> 관계망
      </button>
      <button
        className={view === "library" ? "active" : ""}
        onClick={() => onView("library")}
      >
        <List size={15} /> 자료 목록
      </button>
    </nav>
  );
}
