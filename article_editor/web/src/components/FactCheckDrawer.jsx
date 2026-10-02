import React, { useState, useRef } from "react";
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
import { factcheckArticle } from "../api/editorial";

// ponytail: 브라우저에서 바로 읽히는 텍스트 자료만 — PDF·HWP·DOCX 추출은 코어 경로가 생기면 연결
const TEXT_FILE = /\.(txt|md|csv|json|html?)$/i;
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
  // 업로드된 근거/취재 파일 목록 상태
  const [uploadedFiles, setUploadedFiles] = useState([]);

  // 대조 및 추출된 근거자료 목록 상태
  const [evidenceList, setEvidenceList] = useState([]);

  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [checkError, setCheckError] = useState("");
  const fileInputRef = useRef(null);

  // 파일 업로드 처리 핸들러
  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;

    const newFiles = await Promise.all(Array.from(files).map(async (f, idx) => {
      const text = TEXT_FILE.test(f.name) ? await f.text() : null;
      return {
        id: `uploaded-${Date.now()}-${idx}`,
        name: f.name,
        size: `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
        uploadTime: "방금 전",
        status: text != null ? "등록됨" : "텍스트 추출 미지원",
        type: f.name.split(".").pop() || "doc",
        text
      };
    }));

    const all = [...newFiles, ...uploadedFiles];
    setUploadedFiles(all);
    runCheck(all);
  };

  // 코어 팩트체크(core.factcheckRun): 본문 문장 ↔ 등록된 텍스트 자료
  const runCheck = (files = uploadedFiles) => {
    const materials = files.filter((f) => f.text != null);
    if (!materials.length) return setCheckError("검증에 쓸 텍스트 자료(TXT·MD·CSV·HTML)를 올려 주세요.");
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

  // 파일 삭제
  const handleDeleteFile = (id) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

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
                accept=".txt,.md,.csv,.json,.html,.htm,.pdf,.hwp,.docx"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />

              <div className="w-11 h-11 rounded-2xl bg-white shadow-xs border border-slate-200 flex items-center justify-center text-blue-600">
                {isAnalyzing ? (
                  <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                ) : (
                  <FileText className="w-5 h-5" />
                )}
              </div>

              <div>
                <p className="text-xs font-bold text-slate-800">
                  {isAnalyzing ? "문서를 읽고 기사와 팩트 대조 중..." : "검증할 문서나 보도자료를 이곳에 끌어다 놓으세요"}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  TXT · MD · CSV · HTML 지원 (PDF · HWP · DOCX 추출은 준비 중)
                </p>
              </div>
            </div>

            {/* 업로드된 파일 리스트 */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-bold text-slate-500">
                  등록된 검증 원천자료 ({uploadedFiles.length}건)
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-2.5 bg-slate-100/70 hover:bg-slate-100 rounded-xl text-xs border border-slate-200/80 transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <div className="truncate">
                          <p className="font-bold text-slate-900 truncate">{file.name}</p>
                          <p className="text-[10px] text-slate-400">{file.size} · {file.uploadTime}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                          file.text != null
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-blue-100 text-blue-800 animate-pulse"
                        }`}>
                          {file.status}
                        </span>
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                          title="삭제"
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
      </aside>
  );
}
