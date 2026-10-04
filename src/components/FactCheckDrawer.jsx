import React, { useState, useRef } from "react";
import { 
  X, 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  Sparkles, 
  Trash2, 
  FileCheck, 
  Plus, 
  ShieldCheck,
  RefreshCw
} from "lucide-react";

/**
 * 팩트체크 및 근거자료 검증 우측 슬라이더(Drawer) 컴포넌트
 */
export default function FactCheckDrawer({
  onClose,
  setArticle
}) {
  // 업로드된 근거/취재 파일 목록 상태
  const [uploadedFiles, setUploadedFiles] = useState([
    {
      id: "sample-doc-1",
      name: "과기정통부_초거대AI_반도체육성_보도자료.pdf",
      size: "2.4 MB",
      uploadTime: "방금 전",
      status: "분석 완료",
      type: "pdf"
    }
  ]);

  // 대조 및 추출된 근거자료 목록 상태
  const [evidenceList, setEvidenceList] = useState([
    {
      id: "ev-1",
      claimText: "국내 개발진은 데이터 병목 현상을 해결하고 전력 소비를 최대 70% 감소시키는 성과를 얻어냈다.",
      sourceDoc: "과기정통부_초거대AI_반도체육성_보도자료.pdf",
      page: "3페이지",
      quote: "차세대 PIM 아키텍처 적용 실증 결과, 기존 외산 GPU 가속 시스템 대비 유효 전력 소모량이 최대 71.4% 절감되는 기술적 우수성을 검증함.",
      status: "verified", // verified | conflict | unverified
      matchRate: 96,
      comment: "전력 소비 70% 절감 수치가 공식 정부 보도자료의 71.4% 결과치와 부합합니다.",
      suggestedFix: null
    },
    {
      id: "ev-2",
      claimText: "NPU(신경망 처리장치)와 PIM(지능형 반도체)이 차세대 대안으로 주목받고 있다.",
      sourceDoc: "한국반도체산업협회_기술동향보고서.pdf",
      page: "12페이지",
      quote: "글로벌 AI 가속기 시장은 NPU 기반 저지연 추론 칩과 HBM-PIM 융합 메모리로 급속히 재편되는 추세이다.",
      status: "verified",
      matchRate: 94,
      comment: "기술 트렌드 서술이 최신 산업 협회 동향과 정확히 일치합니다.",
      suggestedFix: null
    },
    {
      id: "ev-3",
      claimText: "전통적인 GPU 중심 연산의 발열 한계",
      sourceDoc: "과기정통부_초거대AI_반도체육성_보도자료.pdf",
      page: "1페이지",
      quote: "데이터센터 내 고발열·고전력 GPU 운영비 급증으로 전력 효율(TCO) 중심의 대체 칩 전환 시급.",
      status: "verified",
      matchRate: 89,
      comment: "기존 GPU 인프라의 발열 및 전력 문제 제기가 공인 자료와 일치합니다.",
      suggestedFix: null
    }
  ]);

  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef(null);

  // 파일 업로드 처리 핸들러
  const handleFileUpload = (files) => {
    if (!files || files.length === 0) return;
    setIsAnalyzing(true);

    const newFiles = Array.from(files).map((f, idx) => ({
      id: `uploaded-${Date.now()}-${idx}`,
      name: f.name,
      size: `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
      uploadTime: "방금 전",
      status: "분석 중...",
      type: f.name.split(".").pop() || "doc"
    }));

    setUploadedFiles((prev) => [...newFiles, ...prev]);

    // 1초 뒤 분석 완료 및 가상 근거자료 자동 추출 시뮬레이션
    setTimeout(() => {
      setUploadedFiles((prev) => 
        prev.map((f) => ({ ...f, status: "분석 완료" }))
      );

      // 새 파일에서 도출된 추가 근거자료 매칭
      const newEvidence = {
        id: `ev-${Date.now()}`,
        claimText: "전문가들은 '단순한 칩 제조를 넘어 최적화 소프트웨어가 향후 반도체 패권의 승패를 결정' 조언",
        sourceDoc: files[0]?.name || "새로 업로드된 취재문서.pdf",
        page: "참고 부록 2면",
        quote: "국내외 산학연 전문가 인터뷰 요약: 하드웨어 수율 이상으로 컴파일러 및 프레임워크 최적화 SW 생태계 주도권이 결정적 요인임.",
        status: "verified",
        matchRate: 98,
        comment: "업로드된 신규 파일에서 기사 본문의 전문가 인용과 직접 일치하는 팩트가 검증되었습니다.",
        suggestedFix: null
      };

      setEvidenceList((prev) => [newEvidence, ...prev]);
      setIsAnalyzing(false);
    }, 1200);
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

  // 테스트용 보도자료 샘플 원클릭 로드
  const handleLoadSample = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      const sampleFile = {
        id: `sample-${Date.now()}`,
        name: "산업통상자원부_반도체_수출통계_공식발표.xlsx",
        size: "1.8 MB",
        uploadTime: "방금 전",
        status: "분석 완료",
        type: "xlsx"
      };
      setUploadedFiles((prev) => [sampleFile, ...prev]);
      setIsAnalyzing(false);
    }, 800);
  };

  // 기사 본문에 근거자료 주석 추가
  const handleInsertCitation = (ev) => {
    const citation = `\n[근거 확인: ${ev.sourceDoc} (${ev.page}) - 일치율 ${ev.matchRate}%]`;
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
              <button
                onClick={handleLoadSample}
                disabled={isAnalyzing}
                className="text-[11px] font-bold text-[#23211F] bg-[#EFECE6] hover:bg-[#E4DFD7] border border-[#DDD6CB] px-3 py-1 rounded-full transition cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                테스트 샘플 추가
              </button>
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
                accept=".pdf,.hwp,.docx,.txt,.csv,.xlsx,image/*"
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
                  PDF, HWP, DOCX, TXT, Excel, 보도자료 캡처 이미지 지원
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
                          file.status === "분석 완료"
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
              </div>
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
                    <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      팩트 일치 ({item.matchRate}%)
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">
                      출처: {item.sourceDoc} ({item.page})
                    </span>
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
                  <div className="bg-blue-50/60 p-2.5 rounded-xl border border-blue-100 text-xs space-y-1">
                    <span className="text-[10px] font-black text-blue-600 block uppercase tracking-wide flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      원문 문서 발췌 근거
                    </span>
                    <p className="text-slate-800 italic leading-relaxed">
                      "{item.quote}"
                    </p>
                  </div>

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
            전체 {evidenceList.length}개 핵심 문장 검증 완료
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
