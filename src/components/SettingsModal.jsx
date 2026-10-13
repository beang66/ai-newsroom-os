import React, { useState } from "react";
import { X, Cpu, CheckCircle2, ShieldCheck, RefreshCw } from "lucide-react";

// 초기 로컬 모델 데이터 상수
const INITIAL_MODELS = [
  {
    id: "factcheck",
    title: "팩트체크 판정",
    spec: "Qwen3-0.6B v3, ONNX",
    size: "2.23 GB",
    status: "installed",
    files: "5/5"
  },
  {
    id: "chunking",
    title: "의미 청킹 경계 판정",
    spec: "KLUE-RoBERTa ONNX",
    size: "422.9 MB",
    status: "installed",
    files: "3/3"
  },
  {
    id: "title",
    title: "제목 초안",
    spec: "KoT5 ONNX, 번서치 내장",
    size: "369.4 MB",
    status: "installed",
    files: "2/2"
  },
  {
    id: "subtitle",
    title: "부제 초안",
    spec: "KoBART ONNX",
    size: "649.3 MB",
    status: "installed",
    files: "5/5"
  }
];

/**
 * AI Newsroom 환경 설정 화면 (SettingsModal)
 * - 로컬 AI 모델 관리 섹션
 * - 사용자 자료 백업·복구 섹션
 * - 순수 프론트엔드 UI 구현
 */
export default function SettingsModal({ isOpen, onClose }) {
  // 4개 로컬 AI 모델 상태 (UI 표시용)
  const [models] = useState(INITIAL_MODELS);

  // 백업 암호 입력 필드 상태
  const [backupPassword, setBackupPassword] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  if (!isOpen) return null;

  const showFeedback = (msg) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(""), 3000);
  };

  const handleModelAction = (_id, title) => {
    showFeedback(`'${title}' 모델 상태가 정상입니다.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/45 backdrop-blur-md animate-smooth-in">
      <div className="bg-white/98 backdrop-blur-2xl rounded-3xl border border-stone-200/90 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.18)] w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden animate-smooth-pop">
        {/* ──────────────────────────────────────────
            모달 헤더
           ────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-stone-100 bg-stone-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-stone-900 text-white flex items-center justify-center shadow-2xs">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-stone-900 tracking-tight">환경 설정</h2>
              <p className="text-[11px] text-stone-500 font-medium">AI Newsroom 시스템 및 로컬 리소스 설정</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition cursor-pointer"
            title="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ──────────────────────────────────────────
            모달 본문 (세로 스크롤 가능 영역)
           ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-7 no-scrollbar">
          {/* 피드백 알림 배너 (버튼 클릭 시 일시 표시) */}
          {feedbackMessage && (
            <div className="p-2.5 rounded-xl bg-stone-900 text-white text-xs font-bold text-center animate-in fade-in duration-200">
              {feedbackMessage}
            </div>
          )}

          {/* ──────────────────────────────────────────
              A. 로컬 AI 모델 섹션
             ────────────────────────────────────────── */}
          <section className="space-y-3.5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-stone-900">로컬 AI 모델</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200/60">
                  4개 모델
                </span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed font-normal">
                로컬 기능에 필요한 모델을 관리합니다. 모델을 선택하면 설치 상태와 관련 정보를 확인할 수 있습니다.
              </p>
            </div>

            {/* 4개 모델 독립 리스트 카드 (동일한 높이와 간격) */}
            <div className="space-y-2.5">
              {models.map((model) => (
                <div
                  key={model.id}
                  className="p-3.5 rounded-2xl bg-white border border-stone-200/90 hover:border-stone-400 transition-all shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  {/* 좌측: 모델명, 스펙, 용량 및 파일 수 */}
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-extrabold text-stone-900 tracking-tight">
                        {model.title}
                      </h4>
                      <span className="text-[11px] font-medium text-stone-400">
                        ({model.spec})
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-stone-500 font-medium">
                      <span>{model.size}</span>
                      <span className="text-stone-300">·</span>
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.2 rounded-md text-[10px]">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        설치됨
                      </span>
                      <span className="text-stone-300">·</span>
                      <span>파일 {model.files}</span>
                    </div>
                  </div>

                  {/* 우측: 설치 상태 확인 버튼 */}
                  <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleModelAction(model.id, model.title)}
                      className="px-3 py-1.5 rounded-xl border border-stone-200/90 hover:bg-stone-50 text-stone-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-stone-500" />
                      <span>설치됨</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ──────────────────────────────────────────
              구분선
             ────────────────────────────────────────── */}
          <div className="h-[1px] bg-stone-200/70" />

          {/* ──────────────────────────────────────────
              B. 사용자 자료 백업·복구 섹션
             ────────────────────────────────────────── */}
          <section className="space-y-3.5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-stone-900">사용자 자료 백업·복구</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
                  데이터 보호
                </span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed font-normal">
                기사·취재자료·녹음·녹취 등 사용자 자료의 백업 및 복구를 위한 설정입니다.
              </p>
            </div>

            {/* 백업 설정 폼 카드 */}
            <div className="p-4.5 rounded-2xl bg-stone-50/70 border border-stone-200/90 space-y-4 shadow-2xs">
              {/* 백업 암호 라벨 & 암호 입력 필드 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-800 block">
                  백업 암호
                </label>
                <input
                  type="password"
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                  placeholder="12자 이상"
                  className="w-full px-3.5 py-2.5 text-xs text-stone-900 bg-white border border-stone-200/90 rounded-xl outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10 transition shadow-2xs"
                />
                <p className="text-[11px] text-stone-400">
                  백업 데이터 암호화에 사용되며 복구 시 동일한 암호가 필요합니다.
                </p>
              </div>

              {/* 버튼 그룹 (주요 버튼 vs 기본 버튼 시각적 위계 구분) */}
              <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
                {/* 주요 버튼: 암호화 백업 받기 */}
                <button
                  type="button"
                  onClick={() => {
                    if (!backupPassword || backupPassword.length < 12) {
                      showFeedback("암호는 12자 이상 입력해주세요 (UI 검증).");
                      return;
                    }
                    showFeedback("암호화 백업 준비가 완료되었습니다 (UI 시연).");
                  }}
                  className="w-full sm:w-auto px-4.5 py-2 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-95"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#8ECAE6]" />
                  <span>암호화 백업 받기</span>
                </button>

                {/* 기본 버튼: 백업에서 복구 */}
                <button
                  type="button"
                  onClick={() => showFeedback("백업 파일 선택 창이 호출되었습니다 (UI 시연).")}
                  className="w-full sm:w-auto px-4.5 py-2 rounded-xl bg-white hover:bg-stone-100/80 border border-stone-200/90 text-stone-800 text-xs font-bold transition flex items-center justify-center gap-2 shadow-2xs cursor-pointer active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-stone-600" />
                  <span>백업에서 복구</span>
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* ──────────────────────────────────────────
            모달 하단 닫기 바
           ────────────────────────────────────────── */}
        <div className="px-6 py-3.5 border-t border-stone-100 bg-stone-50/50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold transition cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
