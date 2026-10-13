import React, { useEffect, useState } from "react";
import { History, X, RotateCcw, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { listRevisionsWithLegacy, previewRevision } from "../api/editorial";
import { core } from "../api/core.js";

const formatTime = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
};

const formatShortTime = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
};

/**
 * 저장 이력 및 이전 저장본 복원 모달
 * - 데스크톱 72~78% 너비, 78~84% 높이의 정사각형에 가까운 안정적인 대형 뷰포트
 * - 좌측 40% 이력 목록 (왼쪽 강조선 및 은은한 배경) + 우측 60% 원고 미리보기 2열 구조
 * - 각각 독립 스크롤 지원 및 복원 전 안전 확인 대화상자 제공
 */
export default function VersionHistoryModal({ isOpen, onClose, onRestore, articleId }) {
  // 저장 이력은 Core 에서 읽는다(최신이 위). 목록에는 앞부분 발췌만 있어, 고른 저장본의 전체 본문은 따로 읽는다.
  const [revisions, setRevisions] = useState([]);
  const [loadState, setLoadState] = useState({ status: "idle", error: "" });
  const [fullText, setFullText] = useState({}); // revisionNo → 전체 본문
  const [selectedNo, setSelectedNo] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState("");

  useEffect(() => {
    if (!isOpen) return undefined;
    setFullText({});
    if (!articleId) {
      setRevisions([]);
      setSelectedNo(null);
      setLoadState({ status: "idle", error: "" });
      return undefined;
    }
    let active = true;
    setLoadState({ status: "loading", error: "" });
    listRevisionsWithLegacy(articleId)
      .then(({ revisions: list }) => {
        if (!active) return;
        setRevisions(list.map((rev, index) => ({ ...rev, isLatest: index === 0 })));
        setSelectedNo(list[0]?.revisionNo ?? null);
        setLoadState({ status: "done", error: "" });
      })
      .catch((error) => active && setLoadState({ status: "error", error: error?.message || String(error) }));
    return () => { active = false; };
  }, [isOpen, articleId]);

  useEffect(() => {
    if (!isOpen || !articleId || selectedNo == null || fullText[selectedNo] !== undefined) return undefined;
    let active = true;
    previewRevision(articleId, selectedNo)
      .then((revision) => active && setFullText((prev) => ({ ...prev, [selectedNo]: revision.content || "" })))
      .catch(() => {});
    return () => { active = false; };
  }, [isOpen, articleId, selectedNo, fullText]);

  if (!isOpen) return null;

  const hasRevisions = revisions.length > 0;
  const currentRevision = revisions.find((r) => r.revisionNo === selectedNo) || revisions[0]
    || { revisionNo: 0, createdAt: "", title: "", excerpt: "", chars: 0, photoCount: 0, sourceCount: 0, isLatest: false };

  // 실제 복원 실행 핸들러
  // Core 가 옛 저장본을 새 최신 저장본으로 올린다(이력은 지우지 않아, 복원 직전 상태도 이력에 남는다).
  const handleExecuteRestore = async () => {
    setIsRestoring(true);
    setShowConfirmDialog(false);
    try {
      const result = await core.restoreRevision(articleId, selectedNo);
      setRestoreNotice(`#${selectedNo} 저장본을 복원했습니다. (새 저장본 #${result.revisionNo})`);
      onRestore?.(result.draft, result);
      setTimeout(() => {
        setRestoreNotice("");
        onClose();
      }, 1100);
    } catch (error) {
      setRestoreNotice(error?.message || String(error));
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 md:p-8 bg-stone-950/45 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* ──────────────────────────────────────────────────────────
          대형 모달 본체 (너비: 76vw, 높이: 82vh의 정사각형에 가까운 대형 비율)
         ────────────────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-label="저장 이력 및 복원"
        data-testid="version-history"
        className="w-[94vw] md:w-[76vw] max-w-5xl h-[90vh] md:h-[82vh] max-h-[860px] min-h-[580px] bg-white rounded-3xl shadow-2xl border border-stone-200/90 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 select-none relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. 상단 고정 헤더 */}
        <div className="flex items-center justify-between px-6 md:px-8 py-4 md:py-5 border-b border-stone-200/70 shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-800 flex items-center justify-center border border-stone-200/70 shadow-2xs">
              <History className="w-4 h-4 text-stone-800" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-stone-950 tracking-tight">저장 이력</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-stone-100 text-stone-700 border border-stone-200">
                  총 {revisions.length}개 저장본
                </span>
              </div>
              <p className="text-[11px] text-stone-400 font-normal mt-0.5">
                원하는 시점을 선택하여 이전 원고를 확인하고 안전하게 복원할 수 있습니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-800 transition cursor-pointer"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 상단 복원 완료 안내 토스트 배너 */}
        {restoreNotice && (
          <div className="mx-6 md:mx-8 mt-3 px-4 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-bold text-center animate-in fade-in slide-in-from-top-2 duration-150 flex items-center justify-center gap-2 shadow-md">
            <CheckCircle2 className="w-4 h-4 text-[#8ECAE6]" />
            <span>{restoreNotice}</span>
          </div>
        )}

        {(loadState.status === "loading" || loadState.status === "error" || !articleId || (loadState.status === "done" && !hasRevisions)) && (
          <p role={loadState.status === "error" ? "alert" : "status"} className={`mx-6 md:mx-8 mt-3 text-xs font-medium ${loadState.status === "error" ? "text-rose-600" : "text-stone-500"}`}>
            {loadState.status === "loading" && "저장 이력을 불러오는 중…"}
            {loadState.status === "error" && loadState.error}
            {!articleId && "아직 저장하지 않은 기사입니다. 저장하면 이력이 쌓이고 여기서 복원할 수 있습니다."}
            {articleId && loadState.status === "done" && !hasRevisions && "저장된 이력이 없습니다."}
          </p>
        )}

        {/* 2. 본문 2열 레이아웃: 좌측 목록 40% + 우측 미리보기 60% */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
          {/* ──────────────────────────────────────────────────────────
              [좌측 패널: 전체 너비의 약 40%] 저장 이력 목록 (독립 스크롤)
             ────────────────────────────────────────────────────────── */}
          <div className="w-full md:w-[40%] border-b md:border-b-0 md:border-r border-stone-200/70 flex flex-col min-h-0 bg-stone-50/20">
            {/* 좌측 서브 타이틀 바 */}
            <div className="px-5 py-3 border-b border-stone-200/60 flex items-center justify-between text-xs text-stone-500 font-medium shrink-0 bg-stone-50/50">
              <span className="font-bold text-stone-700">저장 시점 목록</span>
              <span className="text-[11px] font-mono text-stone-400">최신순 정렬</span>
            </div>

            {/* 독립 스크롤 저장본 목록 (얇은 구분선 및 왼쪽 강조선 적용) */}
            <ul
              data-testid="revision-list"
              className="flex-1 overflow-y-auto divide-y divide-stone-100 p-2 md:p-3"
            >
              {revisions.map((rev) => {
                const isSelected = selectedNo === rev.revisionNo;
                return (
                  <li key={rev.revisionNo}>
                    <button
                      type="button"
                      onClick={() => setSelectedNo(rev.revisionNo)}
                      aria-pressed={isSelected}
                      className={`w-full text-left p-4 transition-all duration-150 cursor-pointer rounded-xl ${
                        isSelected
                          ? "bg-stone-100/75 border-l-3 border-stone-900 shadow-2xs"
                          : "hover:bg-stone-50/80 border-l-3 border-transparent"
                      }`}
                    >
                      {/* 상단 메타: 시점 + 최신 배지 */}
                      <div className="flex items-center justify-between gap-2 text-xs font-mono">
                        <span className={`font-semibold flex items-center gap-1.5 ${isSelected ? "text-stone-900" : "text-stone-600"}`}>
                          <Clock className="w-3.5 h-3.5 text-stone-400" />
                          <span>{formatShortTime(rev.createdAt)}</span>
                        </span>

                        <div className="flex items-center gap-1.5">
                          {rev.isLatest && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-stone-900 text-white">
                              최신
                            </span>
                          )}
                          <span className={`text-[11px] font-bold ${isSelected ? "text-stone-800" : "text-stone-400"}`}>
                            #{rev.revisionNo}
                          </span>
                        </div>
                      </div>

                      {/* 원고 제목 */}
                      <h3 className={`text-xs mt-1.5 line-clamp-2 leading-snug tracking-tight ${isSelected ? "font-black text-stone-950" : "font-bold text-stone-700"}`}>
                        {rev.title}
                      </h3>

                      {/* 요약 발췌문 */}
                      <p className="text-[11px] text-stone-500 line-clamp-2 mt-1 leading-relaxed font-normal">
                        {rev.excerpt}
                      </p>

                      {/* 하단 메타: 본문 글자 수, 사진 수, 취재자료 수 */}
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-stone-200/40 text-[10px] font-mono text-stone-400">
                        <span>{rev.chars}자</span>
                        <span>·</span>
                        <span>사진 {rev.photoCount}장</span>
                        <span>·</span>
                        <span>취재자료 {rev.sourceCount}건</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ──────────────────────────────────────────────────────────
              [우측 패널: 전체 너비의 약 60%] 원고 미리보기 & 복원 액션 (독립 스크롤)
             ────────────────────────────────────────────────────────── */}
          <div
            data-testid="revision-preview"
            className="w-full md:w-[60%] flex flex-col min-h-0 bg-white"
          >
            {/* 우측 상단: 선택된 저장본 시점 & 번호 헤더 */}
            <div className="px-6 md:px-8 py-3.5 border-b border-stone-100 flex items-center justify-between text-xs text-stone-500 shrink-0 bg-white">
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-800">선택된 저장본</span>
                <span className="text-stone-300">|</span>
                <span className="font-mono text-stone-500">#{currentRevision.revisionNo}</span>
                {currentRevision.isLatest && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-stone-100 text-stone-800 border border-stone-200">
                    현재 최신본
                  </span>
                )}
              </div>
              <span className="text-stone-400 font-mono text-[11px]">
                {formatTime(currentRevision.createdAt)}
              </span>
            </div>

            {/* 본문 미리보기 영역 (넓은 공간 확보 및 내부 독립 스크롤) */}
            <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6 space-y-5">
              {/* 기사 헤드라인 제목 */}
              <div className="space-y-2 pb-4 border-b border-stone-100">
                <div className="text-[11px] font-mono font-bold text-stone-400 uppercase tracking-wider">
                  ARTICLE HEADLINE
                </div>
                <h1 className="text-lg md:text-xl font-black text-stone-950 leading-snug tracking-tight">
                  {currentRevision.title}
                </h1>
              </div>

              {/* 기사 본문 내용 */}
              <div className="space-y-3">
                <div className="text-[11px] font-mono font-bold text-stone-400 uppercase tracking-wider">
                  CONTENT PREVIEW
                </div>
                <div className="text-xs md:text-sm text-stone-700 leading-relaxed font-sans whitespace-pre-wrap selection:bg-stone-200">
                  {fullText[currentRevision.revisionNo] ?? currentRevision.excerpt}
                </div>
              </div>

              {/* 하단 저장본 주요 메타 정보 칩 바 */}
              <div className="pt-6 border-t border-stone-100 flex flex-wrap items-center gap-3 text-xs text-stone-500 font-mono">
                <div className="px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200/70 flex items-center gap-2">
                  <span className="text-stone-400 text-[11px]">본문 분량:</span>
                  <span className="font-bold text-stone-800">{currentRevision.chars}자</span>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200/70 flex items-center gap-2">
                  <span className="text-stone-400 text-[11px]">첨부 사진:</span>
                  <span className="font-bold text-stone-800">{currentRevision.photoCount}장</span>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200/70 flex items-center gap-2">
                  <span className="text-stone-400 text-[11px]">취재자료:</span>
                  <span className="font-bold text-stone-800">{currentRevision.sourceCount}건</span>
                </div>
              </div>
            </div>

            {/* 우측 하단 고정 액션 바: [이 버전으로 복원] */}
            <div className="px-6 md:px-8 py-4 border-t border-stone-200/70 bg-stone-50/50 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-stone-400 leading-tight">
                * 복원 시 현재 에디터에 작성 중인 내용이 선택 시점으로 교체됩니다.
              </span>

              <button
                type="button"
                onClick={() => setShowConfirmDialog(true)}
                disabled={isRestoring || !hasRevisions}
                className="px-5 py-2.5 rounded-2xl bg-stone-900 hover:bg-black text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95 shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5 text-stone-200" />
                <span>이 버전으로 복원</span>
              </button>
            </div>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────
            [복원 확인 대화상자 (Confirm Modal)]: 취소와 복원 명확 구분
           ────────────────────────────────────────────────────────── */}
        {showConfirmDialog && (
          <div
            className="absolute inset-0 z-30 bg-stone-950/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => setShowConfirmDialog(false)}
          >
            <div
              className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-stone-200 space-y-4 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-800 flex items-center justify-center border border-stone-200 shrink-0">
                  <AlertTriangle className="w-4 h-4 text-stone-700" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-stone-950 tracking-tight">
                    이전 저장본으로 복원하시겠습니까?
                  </h3>
                  <p className="text-xs text-stone-500 leading-relaxed font-normal">
                    <strong className="text-stone-800 font-semibold font-mono">
                      #{currentRevision.revisionNo} ({formatShortTime(currentRevision.createdAt)})
                    </strong>{" "}
                    저장본으로 복원하면 현재 작성 중인 기사 내용이 해당 시점으로 교체됩니다.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowConfirmDialog(false)}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-stone-100 border border-stone-200/90 text-stone-700 text-xs font-bold transition cursor-pointer active:scale-95"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleExecuteRestore}
                  disabled={isRestoring}
                  className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-bold transition cursor-pointer active:scale-95 shadow-xs"
                >
                  {isRestoring ? "복원 적용 중..." : "복원 확인"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
