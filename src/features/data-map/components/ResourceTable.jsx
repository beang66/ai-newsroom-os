import { useMemo, useState } from "react";
import { ArrowDownUp, ArrowUpRight, FileText, FolderUp, Upload } from "lucide-react";
import { TYPES } from "../constants.js";
export default function ResourceTable({
  nodes,
  projects,
  selectedId,
  onSelect,
  onOpen,
  onImport,
  importing,
  importNotice,
}) {
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
          <span className="eyebrow">MATERIAL LIBRARY</span>
          <h2>파일 목록</h2>
          <p>기사에 연결된 출처·녹취·취재 노트를 한곳에서 관리합니다.</p>
        </div>
        <div className="library-heading-actions">
          <label className="file-upload-button">
            <Upload size={14} />
            {importing ? "가져오는 중" : "Markdown 추가"}
            <input
              className="sr-only"
              type="file"
              accept=".md,text/markdown"
              multiple
              disabled={importing}
              onChange={(event) => {
                onImport(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          <label className="file-upload-button secondary">
            <FolderUp size={14} />
            폴더 추가
            <input
              className="sr-only"
              type="file"
              accept=".md,text/markdown"
              multiple
              webkitdirectory=""
              directory=""
              disabled={importing}
              onChange={(event) => {
                onImport(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
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
              <th>프로젝트</th>
              <th>유형</th>
              <th>기록</th>
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
                    <span className={`file-icon ${n.kind}`}>
                      <FileText size={15} />
                    </span>
                    <span>
                      {n.label}
                      <small>
                        {n.path || n.tags.join(" · ")}
                      </small>
                    </span>
                  </button>
                </td>
                <td>{projects.find((p) => p.id === n.projectId)?.name}</td>
                <td>
                  <span className={`type-label ${n.kind}`}>
                    {TYPES[n.kind]}
                  </span>
                </td>
                <td>
                  {n.pages?.length
                      ? `${n.pages.length}${n.kind === "audio" ? "개 구간" : "페이지"}`
                      : "—"}
                </td>
                <td>{n.updated}</td>
                <td>
                  <div className="file-row-actions">
                    <button
                      className="icon-button"
                      aria-label={`${n.label} 페이지 기록 열기`}
                      onClick={() => onOpen(n)}
                      disabled={!n.pages?.length}
                    >
                      <ArrowUpRight size={16} />
                    </button>
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
        <span>총 {nodes.length}개 파일 · 원본 파일은 변경되지 않습니다</span>
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
