import React, { useState, useRef } from "react";
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
  Search, 
  Plus, 
  ArrowRight,
  ShieldCheck,
  RefreshCw
} from "lucide-react";
import { registerSource, factcheckArticle, openSourceFile } from "../api/editorial";

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
  isOpen,
  onClose,
  article,
  setArticle
}) {
  // 등록된 취재자료는 기사(article.sources)에 둔다 — 서랍을 닫아도, 보관함에서도 보인다. 실패한 파일만 여기
  const [failedFiles, setFailedFiles] = useState([]);
  const sources = article.sources || [];

  // 대조 및 추출된 근거자료 목록 상태
  const [evidenceList, setEvidenceList] = useState([]);

  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [viewing, setViewing] = useState(null); // 본문을 보고 있는 자료
  const [openError, setOpenError] = useState("");
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
    setArticle((prev) => ({ ...prev, sources: all }));
    runCheck(all);
  };

  // 코어 팩트체크(core.factcheckRun): 본문 문장 ↔ 등록된 자료(텍스트)
  const runCheck = (files = sources) => {
    const materials = files.filter((f) => f.text != null);
    if (!materials.length) return setCheckError("검증에 쓸 자료(PDF·HWP·HWPX·DOCX·TXT)를 올려 주세요.");
    setCheckError("");
    setIsAnalyzing(true);
    factcheckArticle(article.content, materials)
      .then(setEvidenceList)
      .catch((e) => setCheckError(e?.message || String(e)))
      .finally(() => setIsAnalyzing(false));
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
    alert(`"${ev.sourceDoc}" 근거자료 인용 주석이 본문 끝에 삽입되었습니다.`);
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
      className="w-full md:w-[410px] lg:w-[450px] xl:w-[470px] flex-shrink-0 bg-white/95 rounded-3xl border border-slate-200/90 shadow-sm flex flex-col h-[calc(100vh-170px)] min-h-[640px] sticky top-4 overflow-hidden animate-float-in z-20"
    >
      {/* 상단 헤더 */}
      <div className="p-4 md:p-5 border-b border-slate-200/90 flex items-center justify-between bg-slate-50/70">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#23211F] text-white flex items-center justify-center shadow-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm md:text-base font-extrabold text-slate-900 flex items-center gap-2">
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
          className="p-1.5 rounded-full text-slate-400 hover:text-[#23211F] hover:bg-[#EFECE6] transition cursor-pointer"
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
                      className="flex items-center justify-between p-2.5 bg-slate-100/70 hover:bg-slate-100 rounded-xl text-xs border border-slate-200/80 transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <div className="truncate">
                          {file.failed ? (
                            <p className="font-bold text-slate-900 truncate">{file.name}</p>
                          ) : (
                            <button
                              onClick={() => { setOpenError(""); setViewing(file); }}
                              title="눌러서 자료 보기"
                              className="block max-w-full font-bold text-slate-900 truncate text-left hover:text-blue-700 hover:underline cursor-pointer"
                            >
                              {file.name}
                            </button>
                          )}
                          <p className="text-[10px] text-slate-400" title={file.path || ""}>
                            {mb(file.size)}{file.addedAt ? ` · ${file.addedAt}` : ""}{file.text == null && !file.failed ? " · 본문 다시 불러오기 필요" : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span title={file.error || file.path} className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md max-w-[160px] truncate ${
                          file.failed
                            ? "bg-red-100 text-red-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}>
                          {file.failed ? file.error : "등록됨"}
                        </span>
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                          title={file.failed ? "목록에서 지우기" : "기사에서 연결 해제(원본 파일은 내 문서에 남음)"}
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
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  실시간 팩트체크 및 근거자료 대조표 ({evidenceList.length}건)
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  기사 문장과 업로드된 원문 문서를 AI가 자동 대조한 결과입니다
                </p>
                {checkError && <p className="text-[11px] text-rose-600 mt-1" data-testid="factcheck-error">{checkError}</p>}
              </div>
              <button
                onClick={() => runCheck()}
                disabled={isAnalyzing}
                title="본문을 고친 뒤 다시 검증"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-full cursor-pointer disabled:opacity-40"
              >
                <RefreshCw className={`w-4 h-4 ${isAnalyzing ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* 근거 대조 카드 목록 */}
            <div className="space-y-3">
              {evidenceList.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs space-y-3 transition"
                >
                  {/* 카드 헤더: 상태 및 일치율 */}
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${(VERDICT_BADGE[item.verdict] || REVIEW_BADGE)[1]}`}>
                      {item.status === "verified" ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                      {(VERDICT_BADGE[item.verdict] || REVIEW_BADGE)[0]}
                      {item.matchRate != null && ` (${item.matchRate}%)`}
                    </span>
                    {item.sourceDoc && (
                      <span className="text-[11px] font-bold text-slate-400">출처: {item.sourceDoc}</span>
                    )}
                  </div>

                  {/* 1. 기사 본문 문장 */}
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs">
                    <span className="text-[10px] font-black text-slate-400 block mb-0.5 uppercase tracking-wide">
                      기사 본문 대상 문장
                    </span>
                    <p className="font-bold text-slate-800 leading-snug">
                      "{item.claimText}"
                    </p>
                  </div>

                  {/* 2. 업로드 파일 원문 근거 발췌 */}
                  {item.quote && <div className="bg-blue-50/60 p-2.5 rounded-xl border border-blue-100 text-xs space-y-1">
                    <span className="text-[10px] font-black text-blue-600 block uppercase tracking-wide flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      원문 문서 발췌 근거
                    </span>
                    <p className="text-slate-800 italic leading-relaxed">
                      "{item.quote}"
                    </p>
                  </div>}

                  {/* 3. AI 검증 해설 */}
                  <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                    💡 <strong>검증 의견:</strong> {item.comment}
                  </p>

                  {/* 4. 액션 버튼 */}
                  <div className="pt-1 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      onClick={() => handleInsertCitation(item)}
                      className="px-3.5 py-1.5 text-xs font-bold text-[#23211F] bg-[#EFECE6] hover:bg-[#E4DFD7] border border-[#DDD6CB] rounded-full transition cursor-pointer flex items-center gap-1 active:scale-95"
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
        {viewing && createPortal(
          <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setViewing(null)}>
            <div
              role="dialog"
              aria-label="취재자료 보기"
              className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-200 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-extrabold text-slate-900 text-sm break-all">{viewing.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 break-all">
                    {(viewing.format || "").toUpperCase()} · 추출 {viewing.chars?.toLocaleString()}자 · {viewing.path}
                  </p>
                </div>
                <button onClick={() => setViewing(null)} title="닫기" className="p-1.5 rounded-full text-slate-400 hover:text-slate-900 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <pre className="flex-1 overflow-auto p-4 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
                {viewing.text ?? "추출된 본문을 불러오지 못했어요. 원본을 열어 확인해 주세요."}
              </pre>
              <div className="p-3 border-t border-slate-200 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400">팩트체크는 위 추출 본문으로 대조합니다{openError && <span className="text-rose-600"> · {openError}</span>}</span>
                <button
                  onClick={() => openSourceFile(viewing.id).catch((e) => setOpenError(e?.message || String(e)))}
                  className="px-4 py-1.5 bg-[#23211F] text-white font-bold rounded-full cursor-pointer flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  원본 열기
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </aside>
  );
}
