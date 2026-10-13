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
  ShieldCheck,
  RefreshCw
} from "lucide-react";
import { registerSource, openSourceFile, sourcePreview, sourceChunks, isDevMode } from "../api/editorial";
import { supportedClaimRanges } from "../api/claim-details.js";
import { core } from "../api/core.js";

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

// 모든 자료는 코어(/api/materials/extract)가 텍스트를 뽑고 원본을 내 문서에 보관한다 → 기사 sources 에 등록
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
  onModels
}) {
  const { results: evidenceList, busy: isAnalyzing, error: checkError, run: runCheck } = factCheck;
  // 등록된 취재자료는 기사(article.sources)에 둔다 — 서랍을 닫아도, 보관함에서도 보인다. 실패한 파일만 여기
  const [failedFiles, setFailedFiles] = useState([]);
  const sources = article.sources || [];
  const indexes = useSourceIndex(sources.map((s) => s.id));
  const { setFocus } = factCheck;
  useEffect(() => () => setFocus(null), [setFocus]); // 카드에 마우스를 둔 채 서랍을 닫아도 본문 초록 표시가 남지 않게

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

  // 기사에서 자료 연결 해제(내 문서의 원본 파일은 지우지 않는다)
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
      className="order-first lg:order-none w-full min-w-0 lg:w-[450px] xl:w-[470px] flex-shrink-0 bg-white/95 rounded-3xl border border-slate-200/90 shadow-sm flex flex-col h-[calc(100vh-170px)] min-h-[640px] lg:sticky lg:top-4 overflow-hidden animate-float-in z-20"
    >
      {/* 상단 헤더 */}
      <div className="p-4 md:p-5 border-b border-slate-200/90 flex items-center justify-between bg-slate-50/70">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 shrink-0 rounded-full bg-[#23211F] text-white flex items-center justify-center shadow-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm md:text-base font-extrabold text-slate-900 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>팩트체크 & 근거자료 검증</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                실시간 연동
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              취재자료와 기사 본문의 수치와 주장을 대조·검증합니다
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="shrink-0 p-1.5 rounded-full text-slate-400 hover:text-[#23211F] hover:bg-[#EFECE6] transition cursor-pointer"
          title="검증창 닫기"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

        {/* 메인 스크롤 콘텐츠 영역 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {/* ─────────────────────────────────────────
              [A] 취재자료/증빙 파일 업로드 섹션
             ───────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4 text-blue-600" />
                취재·검증자료 파일 업로드
              </span>
            </div>

            {/* 드래그 앤 드롭 업로드 박스 */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                isDragging
                  ? "border-blue-500 bg-blue-50/80 scale-[0.99]"
                  : "border-slate-300 hover:border-slate-500 bg-slate-50/50 hover:bg-slate-50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.hwp,.hwpx,.docx,.txt,.md,.csv,.json,.html,.htm"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />

              <div className="w-11 h-11 rounded-2xl bg-white shadow-xs border border-slate-200 flex items-center justify-center text-blue-600">
                {isAnalyzing || isUploading ? (
                  <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                ) : (
                  <FileText className="w-5 h-5" />
                )}
              </div>

              <div>
                <p className="text-xs font-bold text-slate-800">
                  {isUploading ? "문서에서 글자를 읽는 중..." : isAnalyzing ? "문서를 읽고 기사와 팩트 대조 중..." : "검증할 문서나 보도자료를 이곳에 끌어다 놓으세요"}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  PDF · HWP · HWPX · DOCX · TXT 지원 (스캔 PDF 제외)
                </p>
              </div>
            </div>

            {/* 업로드된 파일 리스트 */}
            {fileRows.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-bold text-slate-500">
                  등록된 검증 원천자료 ({sources.length}건)
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {fileRows.map((file) => (
                    <div
                      key={file.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-100/70 hover:bg-slate-100 rounded-xl text-xs border border-slate-200/80 transition"
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

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(() => {
                          const [label, color, hint] = file.failed ? [file.error, "bg-red-100 text-red-800", file.error] : indexBadge(indexes[file.id]);
                          return (
                            <span title={hint || file.path} data-testid="source-index-badge" className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md max-w-[160px] truncate ${color}`}>
                              {label}
                            </span>
                          );
                        })()}
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                          title={file.failed ? "목록에서 지우기" : "기사에서 연결 해제(보관된 원본 유지)"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              {evidenceList.map((item) => (
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
                    {item.sourceDoc && (
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

                  {/* 2. 일치하는 근거 문장/표 항목은 초록, 불일치는 대응 값과 그 문장을 강조 */}
                  {item.quote && <div className="bg-blue-50/60 p-2.5 rounded-xl border border-blue-100 text-xs space-y-1">
                    <span className="text-[10px] font-black text-blue-600 block uppercase tracking-wide flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      원문 문서 발췌 근거
                    </span>
                    <p className="text-slate-800 italic leading-relaxed break-words" data-testid="evidence-quote">
                      "<Marked text={item.quote} spans={item.quoteSpans} sentence={item.verdict !== "SUPPORTED"} ok={item.verdict === "SUPPORTED"} />"
                    </p>
                    {item.verdict === "SUPPORTED" && !item.quoteSpans.length && (
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
                </div>
              ))}
            </div>
          </div>

        </div>

        {citationNotice && <p role="status" className="px-4 py-2 border-t border-slate-200 text-[11px] text-emerald-700">{citationNotice}</p>}
        {/* 하단 푸터 바 */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">
            {isAnalyzing ? "검증 중…" : `전체 ${evidenceList.length}개 문장 검증`}
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
