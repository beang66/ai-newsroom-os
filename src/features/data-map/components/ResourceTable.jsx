import { useMemo, useState } from "react";
import { ArrowDownUp, ArrowUpRight } from "lucide-react";
import { categoryLabel } from "../constants.js";
import CategoryMark from "./CategoryMark.jsx";
export default function ResourceTable({
  nodes,
  projects,
  selectedId,
  onSelect,
  onOpen,
  importNotice,
}) {
  // 코어가 아직 주지 않는 프로젝트·페이지 기록 열은 값이 있을 때만 그린다
  const showProject = projects.length > 0,
    showPages = nodes.some((n) => n.pages?.length);
  const [sort, setSort] = useState("updated"),
    [page, setPage] = useState(0);
  const sorted = useMemo(
    () =>
      [...nodes].sort((a, b) =>
        sort === "title"
          ? a.label.localeCompare(b.label, "ko")
          : b.updated.localeCompare(a.updated) || a.id.localeCompare(b.id),
      ),
    [nodes, sort],
  );
  const current = Math.min(
    page,
    Math.max(0, Math.ceil(sorted.length / 15) - 1),
  );
  return (
    <section className="library">
      <div className="section-heading">
        <div>
          <h2>문서 목록</h2>
          <p>가져온 Markdown과 기사에 첨부한 자료를 분류별로 확인합니다.</p>
        </div>
        <div className="library-heading-actions">
          <label className="sort-control">
            <ArrowDownUp size={14} />
            <select
              aria-label="자료 정렬"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
            >
              <option value="updated">최근 기록순</option>
              <option value="title">이름순</option>
            </select>
          </label>
        </div>
      </div>
      <p className="file-notice" role="status">
        {importNotice || "Markdown은 앱의 암호화 저장소에 복사되며 원본 파일은 변경하지 않습니다."}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>자료명</th>
              {showProject && <th>프로젝트</th>}
              <th>분류</th>
              {showPages && <th>기록</th>}
              <th>최근 수정</th>
              <th>
                <span className="sr-only">열기</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(current * 15, current * 15 + 15).map((n) => (
              <tr
                key={n.id}
                className={selectedId === n.id ? "selected-row" : ""}
              >
                <td>
                  <button
                    className="table-title"
                    onClick={() => onSelect(n.id)}
                  >
                    <CategoryMark category={n.category} size={14} />
                    <span>
                      {n.label}
                      <small>
                        {n.path || n.tags.join(" · ")}
                      </small>
                    </span>
                  </button>
                </td>
                {showProject && <td>{projects.find((p) => p.id === n.projectId)?.name}</td>}
                <td>
                  <span className="type-label">{categoryLabel(n)}</span>
                </td>
                {showPages && (
                  <td>
                    {n.pages?.length
                      ? `${n.pages.length}${n.kind === "audio" ? "개 구간" : "페이지"}`
                      : "—"}
                  </td>
                )}
                <td>{n.updated}</td>
                <td>
                  <div className="file-row-actions">
                    {n.pages?.length > 0 && (
                      <button
                        className="icon-button"
                        aria-label={`${n.label} 페이지 기록 열기`}
                        onClick={() => onOpen(n)}
                      >
                        <ArrowUpRight size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!nodes.length && (
        <div className="empty-state">
          검색 조건에 맞는 자료가 없습니다. 검색어 또는 필터를 변경해 주세요.
        </div>
      )}
      <footer className="table-footer">
        <span>총 {nodes.length}개</span>
        <div>
          <button disabled={current === 0} onClick={() => setPage(current - 1)}>
            이전
          </button>
          <span>
            {current + 1} / {Math.max(1, Math.ceil(sorted.length / 15))}
          </span>
          <button
            disabled={(current + 1) * 15 >= sorted.length}
            onClick={() => setPage(current + 1)}
          >
            다음
          </button>
        </div>
      </footer>
    </section>
  );
}
