import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  X, 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  AlertTriangle,
  ExternalLink,
  Sparkles, 
  Trash2, 
  FileCheck, 
  Plus, 
  Check,
  ShieldCheck,
  RefreshCw,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { registerSource, openSourceFile, sourcePreview, sourceChunks, isDevMode } from "../api/editorial";
import { supportedClaimRanges } from "../api/claim-details.js";
import { markTable } from "../lib/evidenceTable.js";
import { core } from "../api/core.js";
import { buildChecks, verifiedPercent, FACT_CATEGORY_EVENT } from "./ArticleCheckModal";

const STATE_STYLE = {
  ok: "bg-[#dcfce7] text-[#16a34a]",
  warn: "bg-[#fef9c3] text-[#ca8a04]",
  idle: "bg-stone-100 text-stone-400",
};

/** 자료별 색인 상태 — 색인 중인 자료가 있는 동안만 2초마다 코어에 물어본다. → { [sourceId]: { state, progress? } } */
function useSourceIndex(ids) {
  const [map, setMap] = useState({});
  const key = ids.join();
  useEffect(() => {
    if (!ids.length) return undefined;
    let stop = false;
    let timer;
    const tick = async () => {
      try {
        const { sources = [] } = await core.listSources();
        if (stop) return;
        setMap(Object.fromEntries(sources.map((s) => [s.id, s.index || {}])));
        if (sources.some((s) => ids.includes(s.id) && s.index?.state === "indexing")) timer = setTimeout(tick, 2000);
      } catch { /* 상태를 못 읽으면 '등록됨'으로 둔다 */ }
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return map;
}

// 색인 상태 → [표시 글, 색, 설명]
const indexBadge = (index) => {
  if (!index?.state) return ["등록됨", "bg-emerald-100 text-emerald-800", ""];
  if (index.state === "indexing") return [`색인 중 ${Math.round((index.progress ?? 0) * 100)}%`, "bg-blue-100 text-blue-800", "자료를 검색용으로 분석하는 중입니다. 끝나면 팩트체크에 쓰입니다."];
  if (index.state === "ready") return ["색인 완료", "bg-emerald-100 text-emerald-800", `검색용 조각 ${index.chunks}개로 준비됨`];
  if (index.state === "failed") return ["색인 실패", "bg-red-100 text-red-800", "색인에 실패했습니다. 팩트체크 때 다시 시도합니다."];
  return ["색인 안 됨", "bg-slate-200 text-slate-700", "아직 색인되지 않았습니다(모델 미설치 등). 팩트체크 때 한 번에 처리합니다."];
};

// 모든 자료는 코어(/api/materials/extract)가 텍스트를 뽑고 원본을 암호화 저장소에 보관한다 → 기사 sources 에 등록
const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const VERDICT_BADGE = {
  SUPPORTED: ["팩트 일치", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  CONFLICT: ["자료와 불일치", "bg-rose-50 text-rose-700 border-rose-200"],
  EVIDENCE_GAP: ["근거 부족", "bg-amber-50 text-amber-800 border-amber-200"],
};
const REVIEW_BADGE = ["검토 필요", "bg-slate-100 text-slate-700 border-slate-200"];

/**
 * 팩트체크 및 근거자료 검증 우측 슬라이더(Drawer) 컴포넌트
 */
export default function FactCheckDrawer({
  onClose,
  article,
  setArticle,
  // 팩트체크 실행·결과는 ArticleWriter(useFactCheck)가 맡는다 — 글쓰기가 멈추면 자동으로 돌고, 본문 하이라이트에도 쓴다
  factCheck,
  onModels,
  onStartCheck,
  className = "",
  style = {}
}) {
  const { results: evidenceList, busy: isAnalyzing, progress, error: checkError, run: runCheck } = factCheck;
  const progressText = progress ? ` ${progress.done}/${progress.total}문장` : "";
  // 등록된 취재자료는 기사(article.sources)에 둔다 — 서랍을 닫아도, 보관함에서도 보인다. 실패한 파일만 여기
  const [failedFiles, setFailedFiles] = useState([]);
  const sources = article.sources || [];
  const indexes = useSourceIndex(sources.map((s) => s.id));
  const { setFocus } = factCheck;
  // 근거 카드 접기: 접은 카드는 판정과 기사 문장만 보인다(서랍 안에서만 기억, 결과가 새로 와도 유지)
  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggleCard = (id) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  useEffect(() => () => setFocus(null), [setFocus]); // 카드에 마우스를 둔 채 서랍을 닫아도 본문 초록 표시가 남지 않게

  // 기사 검증률 계산 (ArticleCheckModal과 일치)
  const summary = evidenceList.length
    ? {
        total: evidenceList.length,
        counts: evidenceList.reduce((acc, item) => ({ ...acc, [item.verdict]: (acc[item.verdict] || 0) + 1 }), {})
      }
    : null;
  // 분류별 모아보기(UI): 검증률의 분류 버튼이 FACT_CATEGORY_EVENT 를 보내면 아래 카드 목록을 그 분류만 보여 준다(검증률·분류별 개수는 전체 기준 그대로)
  const GROUP_TITLE = { SUPPORTED: "팩트 일치", CONFLICT: "자료와 불일치", EVIDENCE_GAP: "근거 부족", REVIEW: "검토 필요" };
  const GROUP_TONE = {
    SUPPORTED: "border-emerald-200 bg-emerald-50/70 text-emerald-800",
    CONFLICT: "border-rose-200 bg-rose-50/70 text-rose-800",
    EVIDENCE_GAP: "border-amber-200 bg-amber-50/70 text-amber-900",
    REVIEW: "border-violet-200 bg-violet-50/70 text-violet-800",
  };
  const groupOf = (verdict) => (["SUPPORTED", "CONFLICT", "EVIDENCE_GAP"].includes(verdict) ? verdict : "REVIEW");
  const [categoryFilter, setCategoryFilter] = useState(null);
  useEffect(() => {
    const onCategory = (event) => setCategoryFilter((current) => (current === event.detail ? null : event.detail));
    window.addEventListener(FACT_CATEGORY_EVENT, onCategory);
    return () => window.removeEventListener(FACT_CATEGORY_EVENT, onCategory);
  }, []);
  const visibleList = categoryFilter ? evidenceList.filter((item) => groupOf(item.verdict) === categoryFilter) : evidenceList;

  const checks = buildChecks(article, summary);
  const percentage = verifiedPercent(summary);
  const warnCount = checks.filter((check) => check.state === "warn").length;

  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ((percentage ?? 0) / 100) * circumference;

  const headline = percentage === null ? "검증 전입니다" : warnCount > 0 ? "검토가 필요합니다" : "확인할 항목이 없습니다";
  const subline = percentage === null
    ? "전체 검증을 실행해 주세요."
    : warnCount > 0 ? `${warnCount}개의 항목을 확인해주세요.` : "모든 항목이 통과했습니다.";

  const handleFullCheck = () => {
    if (onStartCheck) onStartCheck();
    else void runCheck(true);
  };

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewing, setViewing] = useState(null); // 보고 있는 자료(SourceViewer)
  const [citationNotice, setCitationNotice] = useState("");
  const fileInputRef = useRef(null);

  // 파일 업로드 처리 핸들러
  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    const results = await Promise.all(Array.from(files).map((f) =>
      registerSource(f).catch((e) => ({ failed: true, id: `failed-${Date.now()}-${f.name}`, name: f.name, size: f.size, error: e?.message || "텍스트 추출 실패" }))
    ));
    setIsUploading(false);
    const added = results.filter((r) => !r.failed);
    setCitationNotice(added.map((source) => source.indexError).filter(Boolean).join(" "));
    setFailedFiles((prev) => [...results.filter((r) => r.failed), ...prev]);
    if (!added.length) return;
    const ids = new Set(added.map((r) => r.id));
    const all = [...added, ...sources.filter((s) => !ids.has(s.id))]; // 같은 파일은 한 번만
    setArticle((prev) => ({ ...prev, sources: all })); // 자료가 바뀌면 useFactCheck 가 자동으로 다시 검증한다
  };

  // 드래그 앤 드롭 이벤트
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  // 기사 본문에 근거자료 주석 추가
  const handleInsertCitation = (ev) => {
    const citation = `\n[근거 확인: ${ev.sourceDoc}${ev.matchRate != null ? ` - 신뢰도 ${ev.matchRate}%` : ""}]`;
    setArticle((prev) => ({
      ...prev,
      content: prev.content + citation
    }));
    setCitationNotice(`“${ev.sourceDoc}” 근거 주석을 본문 끝에 삽입했습니다.`);
  };

  // 기사에서 자료 연결 해제(암호화 저장소의 원본은 지우지 않는다)
  const handleDeleteFile = (id) => {
    setFailedFiles((prev) => prev.filter((f) => f.id !== id));
    setArticle((prev) => ({ ...prev, sources: (prev.sources || []).filter((f) => f.id !== id) }));
  };
  const fileRows = [...failedFiles, ...sources];

  return (
    /* ──────────────────────────────────────────
        우측 팩트체크 & 근거자료 검증 패널
        (메인 기사 에디터와 나란히 인라인 배치되어 절대 겹치지 않음)
       ────────────────────────────────────────── */
    <aside 
      aria-label="팩트체크 및 근거자료"
      style={style}
      className={`order-first lg:order-none w-full min-w-0 ${className ? className : "lg:w-[380px] xl:w-[420px]"} flex-shrink-0 bg-white/95 rounded-3xl border border-slate-200/90 shadow-sm flex flex-col h-[calc(100vh-120px)] min-h-[640px] overflow-hidden animate-float-in z-20`}
    >
      {/* 상단 헤더 */}
      <div className="p-4 md:p-5 border-b border-slate-200/90 flex items-center justify-between bg-slate-50/70">
        <h2 className="text-sm md:text-base font-extrabold text-slate-900">
          팩트체크 & 근거자료 검증
        </h2>

        <button
          onClick={onClose}
          className="shrink-0 p-1.5 rounded-full text-slate-400 hover:text-[#23211F] hover:bg-[#EFECE6] transition cursor-pointer"
          title="검증창 닫기"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 메인 스크롤 콘텐츠 영역 */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.hwp,.hwpx,.docx,.txt,.md,.csv,.json,.html,.htm"
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
        
        {/* ─────────────────────────────────────────
            [상단 2분할] 기사 검증률 | 파일 넣는 공간 (1:1 비율 시 나란히 배치)
           ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200/90 pb-5 border-b border-slate-200/80 gap-5 md:gap-0">
          
          {/* [좌측] 기사 검증률 (박스 구분 없이 | 수직선 좌측에 플랫하게 배치) */}
          <div className="pr-0 md:pr-5 pb-5 md:pb-0 space-y-4 select-none flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-extrabold tracking-wider text-stone-400 uppercase">
                  ARTICLE CHECK
                </span>
              </div>

              <h3 className="text-base font-black text-stone-900 tracking-tight mb-3">
                기사 검증률
              </h3>

              {/* 원형 도넛 게이지 & 안내 문구 */}
              <div className="flex items-center gap-3.5 mb-3.5 pb-1">
                <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
                    <circle
                      cx="48"
                      cy="48"
                      r={radius}
                      className="stroke-stone-200/80"
                      strokeWidth="7"
                      fill="transparent"
                    />
                    {percentage !== null && (
                      <circle
                        cx="48"
                        cy="48"
                        r={radius}
                        stroke="#84cc16"
                        strokeWidth="7"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        fill="transparent"
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-black text-stone-900 tracking-tight">
                    {percentage === null ? (
                      <span className="text-xl font-black leading-none text-stone-300">—</span>
                    ) : (
                      <>
                        <span className="text-xl font-black leading-none" data-testid="check-percent">{percentage}</span>
                        <span className="text-xs font-bold self-start mt-2.5 ml-0.5">%</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-0.5 min-w-0">
                  <h4 className="text-xs font-extrabold text-stone-900 tracking-tight truncate">
                    {headline}
                  </h4>
                  <p className="text-[11px] text-stone-500 font-medium">
                    {subline}
                  </p>
                  {percentage !== null && (
                    <p className="text-[10px] text-stone-400">일치율 ({summary.total}문장 기준)</p>
                  )}
                </div>
              </div>

              {/* 4대 체크리스트 항목 */}
              <div className="divide-y divide-stone-100 border-t border-stone-100 mb-3">
                {checks.map((check) => (
                  <div key={check.key} className="flex items-start gap-2 py-1.5" data-testid={`check-${check.key}`} data-state={check.state}>
                    <div className={`w-4.5 h-4.5 rounded-full ${STATE_STYLE[check.state]} flex items-center justify-center shrink-0 mt-0.5 shadow-2xs leading-none font-bold text-[10px]`}>
                      {check.state === "ok" ? <Check className="w-3 h-3 stroke-[3]" /> : check.state === "warn" ? "!" : "–"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="text-[11px] font-bold text-stone-900 tracking-tight">
                        {check.title}
                      </h5>
                      <p className="text-[10px] text-stone-400 font-normal truncate">
                        {check.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 하단 전체 검증 실행 버튼 */}
            <button
              type="button"
              onClick={handleFullCheck}
              disabled={isAnalyzing}
              className="w-full py-2.5 rounded-xl bg-stone-950 hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-98 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <span>{isAnalyzing ? `전체 검증 진행 중…${progressText}` : "전체 검증 실행"}</span>
              <span className="text-xs font-light">→</span>
            </button>
          </div>

          {/* [우측] 취재·검증자료 파일 넣는 공간 (| 수직선 우측에 배치) */}
          <div className="pl-0 md:pl-5 pt-5 md:pt-0 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4 text-blue-600" />
                취재·검증자료 파일
              </span>
              {/* 파일이 이미 들어간 상태일 때 + 버튼으로 파일 추가 */}
              {fileRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition cursor-pointer"
                  title="파일 추가하기"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>파일 추가</span>
                </button>
              )}
            </div>

            {/* 파일이 없을 때: 실선의 파일 넣는 박스 */}
            {fileRows.length === 0 ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`h-full min-h-[220px] border-2 border-solid rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2.5 ${
                  isDragging
                    ? "border-blue-500 bg-blue-50/80 scale-[0.99]"
                    : "border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50"
                }`}
              >
                <div className="w-11 h-11 rounded-2xl bg-white shadow-xs border border-slate-200 flex items-center justify-center text-blue-600">
                  {isAnalyzing || isUploading ? (
                    <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                  ) : (
                    <FileText className="w-5 h-5" />
                  )}
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-800">
                    {isUploading ? "문서에서 글자를 읽는 중..." : isAnalyzing ? "문서를 읽고 팩트 대조 중..." : "검증할 문서나 보도자료를 끌어다 놓으세요"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    클릭 또는 드래그하여 파일 넣기<br />
                    PDF · HWP · HWPX · DOCX · TXT
                  </p>
                </div>
              </div>
            ) : (
              /* 파일이 들어간 후: 실선 박스 대신 파일 목록이 자리잡고, 드래그나 + 버튼으로 추가 가능 */
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`h-full min-h-[220px] flex flex-col justify-between rounded-2xl p-2.5 transition-all ${
                  isDragging ? "bg-blue-50/80 ring-2 ring-blue-400 ring-dashed" : "bg-slate-50/60 border border-slate-200/80"
                }`}
              >
                <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[260px] pr-1">
                  {fileRows.map((file) => (
                    <div
                      key={file.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-2 bg-white rounded-xl text-xs border border-slate-200/80 shadow-2xs hover:border-slate-300 transition"
                    >
                      <div className="flex flex-1 items-center gap-2 min-w-0">
                        {file.failed ? <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" /> : <FileCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                        <div className="truncate">
                          {file.failed ? (
                            <p className="font-bold text-slate-900 truncate">{file.name}</p>
                          ) : (
                            <button
                              onClick={() => setViewing(file)}
                              title="눌러서 자료 보기"
                              className="block max-w-full font-bold text-slate-900 truncate text-left hover:text-blue-700 hover:underline cursor-pointer"
                            >
                              {file.name}
                            </button>
                          )}
                          <p className="text-[10px] text-slate-400 truncate" title={file.path || ""}>
                            {mb(file.size)}{file.addedAt ? ` · ${file.addedAt}` : ""}{file.text == null && !file.failed ? " · 본문 다시 불러오기 필요" : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {(() => {
                          const [label, color, hint] = file.failed ? [file.error, "bg-red-100 text-red-800", file.error] : indexBadge(indexes[file.id]);
                          return (
                            <span title={hint || file.path} data-testid="source-index-badge" className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md max-w-[130px] truncate ${color}`}>
                              {label}
                            </span>
                          );
                        })()}
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                          title={file.failed ? "목록에서 지우기" : "기사에서 연결 해제"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 드래그 추가 안내 바 */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 py-2 px-3 border border-dashed border-slate-300 hover:border-blue-400 rounded-xl text-center text-[11px] text-slate-500 hover:text-blue-600 cursor-pointer bg-white/70 transition"
                >
                  {isDragging ? "여기에 파일을 놓아 추가" : "+ 파일을 끌어다 놓거나 클릭하여 추가"}
                </div>
              </div>
            )}
          </div>
        </div>

          <div className="w-full h-px bg-slate-200" />

          {/* ─────────────────────────────────────────
              [B] 기사 문장 ↔ 원문 근거자료 대조 결과
             ───────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="min-w-0">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  실시간 팩트체크 및 근거자료 대조표 ({evidenceList.length}건)
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  기사 문장과 업로드된 원문 문서를 AI가 자동 대조한 결과입니다
                </p>
                {factCheck.indexing && <p className="text-[11px] text-slate-500 mt-1" data-testid="factcheck-indexing">자료를 색인하는 중이에요 ({Math.round(factCheck.indexing.percent * 100)}%). 끝나면 팩트체크가 자동으로 시작됩니다.</p>}
                {factCheck.basis && (
                  <p className="text-[11px] text-slate-500 mt-1" data-testid="factcheck-basis">
                    마지막 전체 검증: 저장 {factCheck.basis.revisionNo}번 버전의 글 기준{factCheck.basis.changed ? " (그 뒤 글이 바뀌었어요)" : ""}
                  </p>
                )}
                {checkError && <div role="alert" className="text-[11px] text-rose-600 mt-1" data-testid="factcheck-error">
                  <p>{checkError}</p>
                  {/모델|설치/.test(checkError) && <button onClick={onModels}
                    className="mt-1 px-3 py-1 text-[#23211F] bg-[#EFECE6] border border-[#DDD6CB] rounded-full font-bold cursor-pointer">모델 설치 열기</button>}
                </div>}
              </div>
              <div className="flex items-center justify-end gap-2">
              {/* 임시(시험용): 로컬 판정기가 확정 못 한 문장만 OpenAI 로 재판정 */}
              <button
                onClick={() => factCheck.recheck()}
                disabled={!factCheck.recheckCount || factCheck.recheckBusy || isAnalyzing}
                title="검토 필요·관련 근거가 있는 근거 부족 문장만 OpenAI 로 다시 판정(임시 시험 기능)"
                className="px-2.5 py-1 text-[11px] font-bold rounded-full border border-violet-300 text-violet-700 hover:bg-violet-50 cursor-pointer disabled:opacity-40 disabled:cursor-default"
              >
                {factCheck.recheckBusy ? "AI 재판정 중…" : `AI 재판정 ${factCheck.recheckCount}건 (임시)`}
              </button>
              <button
                onClick={() => runCheck(true)}
                disabled={isAnalyzing}
                title="전체 문장 다시 검증(평소에는 고친 문장만 자동으로 검증)"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-full cursor-pointer disabled:opacity-40"
              >
                <RefreshCw className={`w-4 h-4 ${isAnalyzing ? "animate-spin" : ""}`} />
              </button>
              </div>
            </div>

            {/* 근거 대조 카드 목록 */}
            <div className="space-y-3">
              {!evidenceList.length && !isAnalyzing && !checkError && (
                <p className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs leading-relaxed text-slate-500">
                  {sources.length ? "본문을 작성하면 등록한 자료와 자동으로 대조합니다." : "취재자료를 등록하고 본문을 작성하면 문장별 검증 결과가 표시됩니다."}
                </p>
              )}
              {visibleList.length > 1 && (
                <div className="flex justify-end">
                  <button type="button" data-testid="factcheck-collapse-all"
                    onClick={() => setCollapsed(visibleList.every((x) => collapsed.has(x.id)) ? new Set() : new Set(visibleList.map((x) => x.id)))}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-900 cursor-pointer">
                    {visibleList.every((x) => collapsed.has(x.id)) ? "근거 모두 펼치기" : "근거 모두 접기"}
                  </button>
                </div>
              )}
              {categoryFilter && (
                <div data-testid="factcheck-collect" className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${GROUP_TONE[categoryFilter]}`}>
                  <span className="text-xs font-black">{GROUP_TITLE[categoryFilter]} {visibleList.length}문장만 모아보기</span>
                  <button type="button" data-testid="factcheck-collect-clear" onClick={() => setCategoryFilter(null)}
                    className="rounded-lg bg-white/80 px-2.5 py-1 text-[11px] font-bold text-slate-700 border border-slate-200 cursor-pointer">전체 보기</button>
                </div>
              )}
              {categoryFilter && visibleList.length === 0 && (
                <p className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-500">해당하는 문장이 없습니다.</p>
              )}
              {visibleList.map((item) => (
                <div
                  key={item.id}
                  onMouseEnter={() => item.verdict === "SUPPORTED" && factCheck.setFocus(item.id)}
                  onMouseLeave={() => factCheck.setFocus(null)}
                  className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs space-y-3 transition"
                >
                  {/* 카드 헤더: 상태 및 일치율 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${(VERDICT_BADGE[item.verdict] || REVIEW_BADGE)[1]}`}>
                      {item.status === "verified" ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                      {(VERDICT_BADGE[item.verdict] || REVIEW_BADGE)[0]}
                      {item.verdict === "SUPPORTED" && item.details?.length > 0 && " · 세부 확인 필요"}
                      {item.matchRate != null && ` (${item.matchRate}%)`}
                    </span>
                    {item.judgedBy === "external" && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">AI 재판정</span>
                    )}
                    <button type="button" data-testid="factcheck-card-toggle" onClick={() => toggleCard(item.id)}
                      aria-expanded={!collapsed.has(item.id)} title={collapsed.has(item.id) ? "근거 펼치기" : "근거 접기"}
                      className="ml-auto p-1 rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer">
                      {collapsed.has(item.id) ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {item.sourceDoc && !collapsed.has(item.id) && (
                      <span className="w-full min-w-0 break-words text-[11px] font-bold text-slate-400">출처: {item.sourceDoc}</span>
                    )}
                  </div>

                  {/* 1. 기사 본문 문장 */}
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs">
                    <span className="text-[10px] font-black text-slate-400 block mb-0.5 uppercase tracking-wide">
                      기사 본문 대상 문장
                    </span>
                    <p className="font-bold text-slate-800 leading-snug break-words">
                      "<Marked text={item.claimText} spans={item.verdict === "SUPPORTED" ? supportedClaimRanges(item.claimText, item.details) : item.spans.map((s) => ({ start: s.start - item.start, end: s.end - item.start }))} ok={item.verdict === "SUPPORTED"} />"
                    </p>
                  </div>

                  {!collapsed.has(item.id) && <>
                  {/* 2. 일치하는 근거 문장/표 항목은 초록, 불일치는 대응 값과 그 문장을 강조 */}
                  {item.quote && <div className="bg-blue-50/60 p-2.5 rounded-xl border border-blue-100 text-xs space-y-1">
                    <span className="text-[10px] font-black text-blue-600 block uppercase tracking-wide flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      원문 문서 발췌 근거
                    </span>
                    <EvidenceQuote item={item} />
                    {item.verdict === "SUPPORTED" && !item.quoteSpans.length && !item.table && (
                      <p className="text-[10px] text-slate-500">청크는 일치로 판정됐지만, 대응하는 근거 구간을 특정하지 못했습니다.</p>
                    )}
                  </div>}

                  {item.details?.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 space-y-2" data-testid="claim-details">
                    <p className="text-[10px] font-black text-amber-900">날짜·기관·주체 근거 확인</p>
                    {item.details.map((d) => <div key={d.start} className="text-[11px]">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <strong className="text-slate-800">{d.text}</strong>
                        <span className="text-amber-800">{d.label}</span>
                      </div>
                      {d.reference && <p className="mt-0.5 break-all text-slate-500">{d.location === 'title' ? '자료명' : '원문 표기'}: {d.reference}</p>}
                    </div>)}
                    <p className="text-[10px] text-slate-500">표기 위치를 찾은 결과입니다. 날짜의 의미와 기관·주체의 관계가 각각 검증된 것은 아닙니다.</p>
                  </div>}

                  {/* 3. AI 검증 해설 */}
                  <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                    <strong>검증 의견:</strong> {item.comment}
                  </p>

                  {/* 4. 액션 버튼 */}
                  <div className="pt-1 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      onClick={() => handleInsertCitation(item)}
                      disabled={!item.sourceDoc || !item.quote}
                      className="px-3.5 py-1.5 text-xs font-bold text-[#23211F] bg-[#EFECE6] hover:bg-[#E4DFD7] border border-[#DDD6CB] rounded-full transition cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-40 disabled:cursor-default"
                    >
                      <Plus className="w-3 h-3" />
                      본문에 근거 주석 삽입
                    </button>
                  </div>
                  </>}
                </div>
              ))}
            </div>
          </div>

        </div>

        {citationNotice && <p role="status" className="px-4 py-2 border-t border-slate-200 text-[11px] text-emerald-700">{citationNotice}</p>}
        {/* 하단 푸터 바 */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">
            {isAnalyzing ? `검증 중…${progressText}` : `전체 ${evidenceList.length}개 문장 검증`}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#23211F] hover:bg-[#38332E] text-[#FAF8F5] font-black rounded-full transition cursor-pointer border border-[#23211F] active:scale-95"
          >
            확인 및 닫기
          </button>
        </div>
        {/* 서랍(aside)은 애니메이션 transform 때문에 fixed 가 서랍 안에 갇힌다 → body 로 portal */}
        {viewing && createPortal(<SourceViewer source={viewing} onClose={() => setViewing(null)} />, document.body)}
      </aside>
  );
}

/** 근거 발췌: 코어가 표 행으로 쪼갠 근거(item.table)는 표로, 나머지는 줄바꿈을 살린 글로. 기사 숫자와 같은 칸은 판정 색으로 강조.
 *  표 행은 코어가 기사 숫자가 맞는 행부터 보낸다 — 앞의 ROWS 개만 보이고 나머지는 '더 보기' */
const ROWS = 6;
function EvidenceQuote({ item }) {
  const [all, setAll] = useState(false);
  const ok = item.verdict === "SUPPORTED";
  if (!item.table?.rows?.length) {
    return (
      <p className="text-slate-800 italic leading-relaxed break-words whitespace-pre-line" data-testid="evidence-quote">
        "<Marked text={item.quote} spans={item.quoteSpans} sentence={!ok} ok={ok} />"
      </p>
    );
  }
  const { caption, header, headerRows, rows } = markTable(item.table, item.claimText);
  const shown = all ? rows : rows.slice(0, ROWS);
  const width = Math.max(...rows.map((r) => r.cells.length));
  const head = header && (header.length > width ? header : ["", ...header]); // 칸 하나 더면 첫 칸은 행 이름 열 제목
  // PDF 표는 코어가 보낸 머리글 줄을 그대로(여러 칸에 걸친 머리글은 colSpan), 그 밖은 한 줄 열 제목
  const headLines = headerRows?.length ? headerRows : head ? [head.map((text) => ({ text, span: 1 }))] : [];
  const hitTone = ok ? "bg-emerald-200 text-emerald-900" : "bg-rose-200 text-rose-900";
  return (
    <div className="space-y-1 text-slate-800" data-testid="evidence-table">
      {caption.map((c, k) => <p key={k} className="text-[10px] font-bold text-slate-500 break-words">{c}</p>)}
      <div className="overflow-x-auto rounded-lg border border-blue-100 bg-white">
        <table className="w-full text-[11px] tabular-nums">
          {headLines.length > 0 && (
            <thead>
              {headLines.map((line, i) => (
                <tr key={i} className={`text-slate-500 ${i ? "border-t border-slate-100" : ""}`}>
                  {line.map((h, k) => (
                    <th key={k} colSpan={h.span || 1} className={`px-1.5 py-1 font-bold whitespace-nowrap ${!k ? "text-left" : (h.span || 1) > 1 ? "text-center" : "text-right"}`}>{h.text}</th>
                  ))}
                </tr>
              ))}
            </thead>
          )}
          <tbody>
            {shown.map((row, r) => (
              <tr key={r} className={`border-t border-slate-100 ${row.hit ? (ok ? "bg-emerald-50" : "bg-rose-50") : ""}`}>
                <th scope="row" className="px-1.5 py-1 text-left font-bold whitespace-nowrap">
                  {row.path.length > 0 && (
                    <span className="font-normal text-slate-400" title={row.path.join(" › ")}>
                      {(row.path.length > 2 ? ["…", ...row.path.slice(-2)] : row.path).join(" › ")} ›{" "}
                    </span>
                  )}
                  {row.label}
                </th>
                {row.cells.map((c, k) => <td key={k} className="px-1.5 py-1 text-right whitespace-nowrap"><span className={c.hit ? `${hitTone} rounded-sm px-0.5 font-bold` : ""}>{c.text}</span></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > ROWS && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-[10px] font-bold text-blue-700 hover:underline cursor-pointer">
          {all ? "행 접기" : `행 ${rows.length - ROWS}개 더 보기`}
        </button>
      )}
    </div>
  );
}

/** 글에서 spans 구간을 빨갛게(ok = 맞는 내용이면 초록). sentence 면 그 구간이 든 문장(마침표 기준)도 옅게 칠해 어디서 왔는지 보이게 한다 */
function Marked({ text, spans = [], sentence = false, ok = false }) {
  const marks = spans.filter((s) => s.start >= 0 && s.end <= text.length && s.end > s.start).sort((a, b) => a.start - b.start);
  if (!marks.length) return text;
  let from = 0;
  let to = text.length;
  if (sentence) {
    const head = text.slice(0, marks[0].start).search(/[^.?!]*$/);
    const tail = text.slice(marks[marks.length - 1].end).search(/[.?!](\s|$)/);
    from = head;
    to = tail < 0 ? text.length : marks[marks.length - 1].end + tail + 1;
  }
  const inner = [];
  let cursor = from;
  marks.forEach((s, i) => {
    if (s.start < cursor) return;
    inner.push(text.slice(cursor, s.start));
    inner.push(<mark key={i} title={s.title} className={`${s.detail ? "bg-amber-200 text-amber-950" : ok ? "bg-emerald-200 text-emerald-900" : "bg-rose-200 text-rose-900"} not-italic font-bold rounded-sm px-0.5`}>{text.slice(s.start, s.end)}</mark>);
    cursor = s.end;
  });
  inner.push(text.slice(cursor, to));
  return (
    <>
      {text.slice(0, from)}
      {sentence ? <span className={`${ok ? "bg-emerald-50" : "bg-amber-100"} rounded-sm`}>{inner}</span> : inner}
      {text.slice(to)}
    </>
  );
}

// 청크마다 다른 색 밑줄(개발 모드) — 이웃 청크끼리 색이 겹치지 않게 돌려 쓴다
const CHUNK_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];
const PREVIEWABLE = new Set(["pdf", "hwp", "hwpx"]);

/** 취재자료 보기: 추출 본문(팩트체크가 읽는 글자) / 원본(PDF·HWP·HWPX) / 청크(개발 모드) */
function SourceViewer({ source, onClose }) {
  const [tab, setTab] = useState("text");
  const [preview, setPreview] = useState(null); // { kind, url|html } | { error }
  const [chunks, setChunks] = useState(null); // [{text, kind, field}] | { error }
  const [dev, setDev] = useState(false);
  const [openError, setOpenError] = useState("");

  useEffect(() => {
    isDevMode().then(setDev).catch(() => setDev(false));
  }, []);
  useEffect(() => {
    if (tab === "original" && !preview) {
      sourcePreview(source).then(setPreview).catch((e) => setPreview({ error: e?.message || String(e) }));
    }
    if (tab === "chunks" && !chunks) {
      sourceChunks(source.text).then(setChunks).catch((e) => setChunks({ error: e?.message || String(e) }));
    }
  }, [tab, source, preview, chunks]);
  useEffect(() => () => preview?.url && URL.revokeObjectURL(preview.url), [preview]);

  const tabs = [["text", "추출 본문"], ...(PREVIEWABLE.has(source.format) ? [["original", "원본 보기"]] : []), ...(dev ? [["chunks", "청크 보기 (개발)"]] : [])];
  const tabClass = (key) => `px-3 py-1 rounded-full font-bold cursor-pointer ${tab === key ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="취재자료 보기"
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-extrabold text-slate-900 text-sm break-all">{source.name}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 break-all">
              {(source.format || "").toUpperCase()} · 추출 {source.chars?.toLocaleString()}자 · {source.path}
            </p>
            <div className="flex gap-1 mt-2 text-[11px]">
              {tabs.map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)} className={tabClass(key)}>{label}</button>
              ))}
            </div>
          </div>
          <button onClick={onClose} title="닫기" className="p-1.5 rounded-full text-slate-400 hover:text-slate-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {tab === "text" && (
          <pre className="flex-1 overflow-auto p-4 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
            {source.text ?? "추출된 본문을 불러오지 못했어요. 원본을 열어 확인해 주세요."}
          </pre>
        )}

        {tab === "original" && (
          <div className="flex-1 min-h-0 bg-slate-100">
            {!preview && <p className="p-4 text-xs text-slate-500">원본을 불러오는 중…</p>}
            {preview?.error && <p className="p-4 text-xs text-rose-600">원본을 표시하지 못했어요: {preview.error} — '원본 열기'로 확인해 주세요.</p>}
            {preview?.kind === "pdf" && <iframe title="원본 PDF" src={preview.url} className="w-full h-full border-0" />}
            {/* HWP·HWPX 변환 HTML 은 스크립트 없는 격리 iframe 에 — 문서 안 내용이 앱을 건드리지 못한다 */}
            {preview?.kind === "html" && <iframe title="원본 문서" sandbox="" srcDoc={preview.html} className="w-full h-full border-0 bg-white" />}
          </div>
        )}

        {tab === "chunks" && (
          <div className="flex-1 overflow-auto p-4 text-xs leading-loose text-slate-800" data-testid="chunk-view">
            {!chunks && <p className="text-slate-500">청크로 나누는 중…</p>}
            {chunks?.error && <p className="text-rose-600">{chunks.error}</p>}
            {Array.isArray(chunks) && (
              <>
                <p className="text-[11px] text-slate-400 mb-2">
                  청크 {chunks.length}개 · 평균 {Math.round(chunks.reduce((n, c) => n + c.text.length, 0) / Math.max(1, chunks.length))}자 — 밑줄 색이 바뀌는 곳이 경계. 마우스를 올리면 종류가 보입니다
                </p>
                {chunks.map((c, i) => (
                  <span
                    key={i}
                    title={`#${i + 1} · ${c.kind}${c.field ? " · " + c.field : ""} · ${c.text.length}자`}
                    style={{ textDecoration: `underline 2px ${CHUNK_COLORS[i % CHUNK_COLORS.length]}`, textUnderlineOffset: "4px" }}
                  >
                    {c.text}{" "}
                  </span>
                ))}
              </>
            )}
          </div>
        )}

        <div className="p-3 border-t border-slate-200 flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-400">팩트체크는 '추출 본문'으로 대조합니다{openError && <span className="text-rose-600"> · {openError}</span>}</span>
          <button
            onClick={() => openSourceFile(source.id).catch((e) => setOpenError(e?.message || String(e)))}
            className="px-4 py-1.5 bg-[#23211F] text-white font-bold rounded-full cursor-pointer flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            원본 열기
          </button>
        </div>
      </div>
    </div>
  );
}
