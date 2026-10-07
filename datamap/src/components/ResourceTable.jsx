import { useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowUpRight,
  FileText,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { TYPES } from "../data/fixture.js";
export default function ResourceTable({
  nodes,
  articles,
  projects,
  selectedId,
  defaultArticleId,
  onSelect,
  onOpen,
  onUpload,
  onDelete,
}) {
  const [sort, setSort] = useState("updated"),
    [page, setPage] = useState(0),
    [articleId, setArticleId] = useState(defaultArticleId || articles[0]?.id),
    [deletingId, setDeletingId] = useState(null),
    [notice, setNotice] = useState("");
  const fileInput = useRef(null);
  const targetArticle = articles.some((article) => article.id === articleId)
    ? articleId
    : articles[0]?.id;
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
      <div className="file-toolbar">
        <label>
          연결할 기사
          <select
            aria-label="파일을 연결할 기사"
            value={targetArticle || ""}
            onChange={(event) => setArticleId(event.target.value)}
          >
            {articles.map((article) => (
              <option key={article.id} value={article.id}>
                {article.label}
              </option>
            ))}
          </select>
        </label>
        <input
          ref={fileInput}
          type="file"
          multiple
          disabled={!onUpload}
          className="sr-only"
          aria-label="추가할 파일 선택"
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            if (files.length) {
              const count = onUpload?.(files, targetArticle) || 0;
              setNotice(`${count}개 파일을 이 세션의 관계망에 추가했습니다.`);
            }
            event.target.value = "";
          }}
        />
        <button
          className="file-upload-button"
          disabled={!onUpload || !targetArticle}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={14} /> 파일 업로드
        </button>
        <small>시연용: 파일 내용 전송·저장 없음</small>
      </div>
      {notice && (
        <p className="file-notice" role="status">
          {notice}
        </p>
      )}
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
                <span className="sr-only">열기와 삭제</span>
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
                        {n.placeholder ? "형태 시연 노드" : n.tags.join(" · ")}
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
                  {n.sessionFile
                    ? `세션 파일 · ${Math.max(0.1, n.sessionFile.size / 1024).toFixed(1)} KB`
                    : n.pages?.length
                      ? `${n.pages.length}${n.kind === "audio" ? "개 구간" : "페이지"}`
                      : "—"}
                </td>
                <td>{n.updated}</td>
                <td>
                  <div className="file-row-actions">
                    {deletingId === n.id ? (
                      <>
                        <button
                          className="confirm-delete"
                          onClick={() => {
                            onDelete?.(n.id);
                            setDeletingId(null);
                            setNotice(
                              `‘${n.label}’을(를) 이 세션의 목록에서 제거했습니다.`,
                            );
                          }}
                        >
                          삭제 확인
                        </button>
                        <button
                          className="icon-button"
                          aria-label="삭제 취소"
                          onClick={() => setDeletingId(null)}
                        >
                          <X size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="icon-button"
                          aria-label={`${n.label} 페이지 기록 열기`}
                          onClick={() => onOpen(n)}
                          disabled={!n.pages?.length}
                        >
                          <ArrowUpRight size={16} />
                        </button>
                        <button
                          className="icon-button delete-button"
                          aria-label={`${n.label} 삭제`}
                          disabled={!onDelete}
                          onClick={() => setDeletingId(n.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
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
