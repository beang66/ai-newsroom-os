import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  LockKeyhole,
  X,
} from "lucide-react";
import { TYPES } from "../constants.js";
export default function ResourceReader({
  node,
  initialPage = 0,
  project,
  notes,
  saved,
  onNote,
  onSavePage,
  canEditSource = true,
  onSave,
  onVisit,
  onClose,
}) {
  const [page, setPage] = useState(initialPage),
    [draft, setDraft] = useState(""),
    [editTitle, setEditTitle] = useState(""),
    [editText, setEditText] = useState(""),
    [editNote, setEditNote] = useState(""),
    [editing, setEditing] = useState(false),
    [sourceEditing, setSourceEditing] = useState(false);
  const dialog = useRef(null);
  const record = node.pages?.[page],
    pageKey = record?.id || node.id;
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    onVisit(node, page);
  }, [node, page, onVisit]);
  const move = (next) => {
    setPage(next);
    setEditing(false);
    setSourceEditing(false);
  };
  return (
    <dialog
      aria-label={`${node.label} 페이지 기록`}
      ref={dialog}
      className="resource-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="reader-shell">
        <header className="reader-header">
          <div>
            <FileText size={19} />
            <span>
              {project?.name}
              <strong>{node.label}</strong>
            </span>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="자료 창 닫기"
          >
            <X size={20} />
          </button>
        </header>
        <div className="reader-notice">
          <LockKeyhole size={13} />
          원본은 변경되지 않습니다 · 메모와 보관은 이 화면에서만 유지되며
          저장되지 않습니다
        </div>
        <div className="reader-layout">
          <aside className="reader-index">
            <span className="eyebrow">PAGE RECORDS</span>
            <h3>
              {node.kind === "audio" ? "시간 구간 기록" : "자료별 페이지"}
            </h3>
            {node.pages?.map((p, i) => (
              <button
                key={p.id}
                className={page === i ? "active" : ""}
                onClick={() => move(i)}
              >
                <span>{p.locator}</span>
                <strong>{p.title}</strong>
                {saved.includes(p.id) && <Bookmark size={12} />}
              </button>
            ))}
            {!node.pages?.length && <p className="muted">연결된 페이지 없음</p>}
            <div className="reader-metadata">
              <p>
                자료 유형 <strong>{TYPES[node.kind]}</strong>
              </p>
              <p>
                기록자 <strong>{node.author}</strong>
              </p>
              <p>
                수정일 <strong>{node.updated}</strong>
              </p>
            </div>
          </aside>
          <main className="reader-content">
            <div className="reader-page-top">
              <span className="type-label">
                {record?.locator || "노드 개요"}
              </span>
              <button
                className={`small-button ${saved.includes(pageKey) ? "saved" : ""}`}
                aria-pressed={saved.includes(pageKey)}
                onClick={() => onSave(pageKey)}
              >
                <Bookmark size={14} />
                {saved.includes(pageKey) ? "보관됨" : "기록 보관"}
              </button>
            </div>
            <span className="eyebrow">
              {node.kind === "audio"
                ? "TRANSCRIPT PREVIEW"
                : "DOCUMENT PREVIEW"}
            </span>
            <h2>{record?.title || node.label}</h2>
            <p className="reader-lead">{record?.text || node.summary}</p>
            <div className="page-summary">
              <span className="eyebrow">CONTEXT SUMMARY</span>
              <h3>이 페이지가 연결하는 맥락</h3>
              <p>{node.summary}</p>
              <div className="tag-row">
                {node.tags.map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
            </div>
            {record?.note && (
              <blockquote className="editor-note">
                <span>기존 검토 기록</span>
                {record.note}
              </blockquote>
            )}
            {canEditSource && sourceEditing ? (
              <section className="source-edit-form" aria-label="자료 수정">
                <label>
                  페이지 제목
                  <input
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                  />
                </label>
                <label>
                  페이지 내용
                  <textarea
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                  />
                </label>
                <label>
                  검토 기록
                  <textarea
                    value={editNote}
                    onChange={(event) => setEditNote(event.target.value)}
                  />
                </label>
                <div className="note-actions">
                  <button onClick={() => setSourceEditing(false)}>취소</button>
                  <button
                    className="small-button"
                    onClick={async () => {
                      const changes = {
                        title: editTitle.trim(),
                        text: editText.trim(),
                        note: editNote.trim() || null,
                      };
                      await onSavePage(pageKey, changes);
                      setSourceEditing(false);
                    }}
                  >
                    <Check size={14} /> 수정본 저장
                  </button>
                </div>
              </section>
            ) : canEditSource ? (
              <button
                className="edit-source-button"
                onClick={() => {
                  setEditTitle(record?.title || node.label);
                  setEditText(record?.text || node.summary);
                  setEditNote(record?.note || "");
                  setSourceEditing(true);
                }}
              >
                자료 기록 수정
              </button>
            ) : (
              <p className="muted">
                자료 기록 수정은 아직 지원하지 않습니다 — 코어에 자료 수정본
                저장 기능이 생기면 열립니다.
              </p>
            )}
            <section className="personal-note">
              <div>
                <h3>내 페이지 메모</h3>
                <span>원본과 별도 · 저장되지 않음</span>
              </div>
              {editing ? (
                <>
                  <textarea
                    aria-label="페이지 검토 메모"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="이 페이지에서 발견한 맥락을 남겨보세요."
                  />
                  <div className="note-actions">
                    <button onClick={() => setEditing(false)}>취소</button>
                    <button
                      className="small-button"
                      onClick={() => {
                        onNote(pageKey, draft.trim());
                        setEditing(false);
                      }}
                    >
                      <Check size={14} />
                      메모 저장
                    </button>
                  </div>
                </>
              ) : (
                <button
                  className="note-placeholder"
                  onClick={() => {
                    setDraft(notes[pageKey] || "");
                    setEditing(true);
                  }}
                >
                  {notes[pageKey] || "+ 이 페이지에 검토 메모 남기기"}
                </button>
              )}
            </section>
            <footer className="reader-pagination">
              <button onClick={() => move(page - 1)} disabled={page === 0}>
                <ChevronLeft size={16} />
                이전 기록
              </button>
              <span>
                {record ? page + 1 : 0} / {node.pages?.length || 0}
              </span>
              <button
                onClick={() => move(page + 1)}
                disabled={!record || page >= node.pages.length - 1}
              >
                다음 기록
                <ChevronRight size={16} />
              </button>
            </footer>
            <button className="text-button" onClick={onClose}>
              <ArrowLeft size={14} />
              관계망으로 돌아가기
            </button>
          </main>
        </div>
      </div>
    </dialog>
  );
}
