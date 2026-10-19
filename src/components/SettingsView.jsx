import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Cpu,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  KeyRound,
  HardDriveDownload,
  UploadCloud,
  FileCheck2,
  X,
  Download,
  Sparkles
} from "lucide-react";
import { modelStatus, installModels, cancelModelInstall, exportFiles, openExportFolder } from "../api/editorial";
import { core } from "../api/core.js";
import SettingsDialog from "./SettingsDialog";
import AiEngineSection from "./AiEngineSection";
import ExportNotice from "./ExportNotice";
import TransferWizard from "./TransferWizard";
import { restoreTransferFile } from "../lib/vaultTransfer";
import { beginRestore, endRestore } from "../restoreState";

const MIN_BACKUP_PASSWORD = 12; // Core 가 요구하는 최소 길이와 같다

// 화면의 단계 카드 id → Core(models_manifest.json) 모델 id
const CORE_MODEL_ID = {
  factcheck: "factcheck-judge-0.6b-v3",
  chunking: "boundary-roberta-base-v3",
  title: "headline-ket5-onnx",
  subtitle: "subtitle-kobart-onnx"
};

const formatSize = (bytes) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Core 모델 상태(/api/models)를 단계 카드에 덮어쓴다. 카드의 제목·설명 같은 고정 문구는 그대로 둔다.
 * 구형 Core 는 progress.model 이 비어 있어, 설치 요청한 모델(requestedId)이나 용량이 같은 단일 모델로 추정한다.
 */
function applyCoreStatus(cards, status, requestedId) {
  const progress = status.progress;
  const missing = status.models.filter((model) => !model.installed);
  const matching = missing.filter((model) => model.bytesTotal === progress?.bytesTotal);
  const activeId = status.busy
    ? progress?.model || requestedId || (matching.length === 1 ? matching[0].id : "")
    : "";
  return cards.map((card) => {
    const row = status.models.find((model) => model.id === CORE_MODEL_ID[card.id]);
    if (!row) return { ...card, status: "unavailable", progress: 0, downloadedSize: "—", files: "—" };
    const installing = !row.installed && row.id === activeId;
    const percent = progress?.bytesTotal > 0
      ? Math.min(100, Math.max(0, Math.round((progress.bytesDone * 100) / progress.bytesTotal)))
      : 0;
    return {
      ...card,
      size: formatSize(row.bytesTotal),
      status: row.installed ? "installed" : installing ? "downloading" : "not_installed",
      progress: row.installed ? 100 : installing ? percent : 0,
      downloadedSize: row.installed ? formatSize(row.bytesTotal) : installing ? formatSize(progress?.bytesDone || 0) : "0 MB",
      files: `${row.filesDone}/${row.files}`,
      sourceConfigured: row.sourceConfigured,
      bytesTotal: row.bytesTotal
    };
  });
}

// 초기 로컬 모델 데이터 상수 (STEP 01 ~ STEP 04 워크플로우 순서)
const INITIAL_MODELS = [
  {
    id: "factcheck",
    step: "STEP 01",
    title: "팩트체크 판정",
    spec: "Qwen3-0.6B v3, ONNX",
    size: "2.23 GB",
    status: "installed",
    progress: 100,
    downloadedSize: "2.23 GB",
    files: "5/5",
    desc: "기사 내 사실 관계 검증 및 출처 신뢰도 판정을 로컬에서 수행합니다."
  },
  {
    id: "chunking",
    step: "STEP 02",
    title: "의미 청킹 경계 판정",
    spec: "KLUE-RoBERTa ONNX",
    size: "422.9 MB",
    status: "installed",
    progress: 100,
    downloadedSize: "422.9 MB",
    files: "3/3",
    desc: "문맥의 자연스러운 흐름과 단락 분절 경계를 분석합니다."
  },
  {
    id: "title",
    step: "STEP 03",
    title: "제목 초안",
    spec: "KoT5 ONNX, 번서치 내장",
    size: "369.4 MB",
    status: "installed",
    progress: 100,
    downloadedSize: "369.4 MB",
    files: "2/2",
    desc: "본문 핵심 키워드를 도출하여 제목 후보를 생성합니다."
  },
  {
    id: "subtitle",
    step: "STEP 04",
    title: "부제 초안",
    spec: "KoBART ONNX",
    size: "649.3 MB",
    status: "installed",
    progress: 100,
    downloadedSize: "649.3 MB",
    files: "5/5",
    desc: "기사의 핵심 내용을 1~2줄의 부제로 요약합니다."
  }
];

/**
 * AI Newsroom 환경 설정 전체 화면 뷰 (SettingsView)
 * - 신문 편집 스타일 좌측 소개 영역 (단색 라인 일러스트 + 부드러운 돋보기 탐색 모션)
 * - 우측 세로형 AI 모델 워크플로우 타임라인 및 활성 단계 중앙 정렬 모션 UI
 * - 다운로드 완료 (재실행) 모노톤 배지 및 마우스 휠 스크롤 인터랙션
 * - 사용자 자료 암호화 백업·복구 섹션
 */
export default function SettingsView({ onReturnToArticle: _onReturnToArticle, session, onSession }) {
  // 4개 로컬 AI 모델 상태
  const [models, setModels] = useState(() =>
    INITIAL_MODELS.map((card) => ({ ...card, status: "checking", progress: 0, downloadedSize: "—", files: "—" }))
  );
  const [coreError, setCoreError] = useState("");
  // main 의 모델 설치 창과 같은 정보: 진행 상세(받은 용량·현재 파일), Core 가 기억하는 마지막 설치 오류, 설치 중 여부
  const [installInfo, setInstallInfo] = useState({ busy: false, progress: null, lastError: null, loaded: false });
  const [actionPending, setActionPending] = useState(false); // 설치·취소 요청을 보내는 동안
  const requestedModelId = useRef("");

  // 현재 활성화된 워크플로우 단계 인덱스 (기본 STEP 04 활성화 - 레퍼런스 이미지 일치)
  const [activeStep, setActiveStep] = useState(3);

  // 중앙 정렬 모션을 위한 참조 및 translateY 오프셋
  const workflowContainerRef = useRef(null);
  const stepRefs = useRef([]);
  const [translateY, setTranslateY] = useState(0);

  // 백업 암호 입력 필드 상태
  const [backupPassword, setBackupPassword] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupExport, setBackupExport] = useState(null); // 마지막 백업 저장 위치(내 문서\AI Newsroom\내보내기\백업)
  const [dialog, setDialog] = useState(null); // null | "settings" | "transfer"  (main 의 설정·이전 창)
  const restoreFileInput = useRef(null);

  const showFeedback = (msg) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(""), 3500);
  };

  // 암호화 백업: Core 가 사용자가 정한 암호로 다시 암호화한 파일을 만들어 준다.
  const handleBackupExport = async () => {
    if (backupBusy) return;
    if (backupPassword.length < MIN_BACKUP_PASSWORD) {
      showFeedback("안전을 위해 백업 암호는 12자 이상 입력해주세요.");
      return;
    }
    setBackupBusy(true);
    try {
      const { data } = await core.exportVault(backupPassword);
      setBackupExport(await exportFiles("backup", [{ data, ext: "db" }]));
      showFeedback("사용자 자료를 암호화한 백업 파일을 저장했습니다. 암호를 안전하게 보관하세요.");
    } catch (error) {
      showFeedback(error?.message || String(error));
    } finally {
      setBackupBusy(false);
    }
  };

  // 백업 복구: 파일을 고르면 암호를 확인하고 현재 계정의 자료를 그 백업으로 교체한다(교체 전 안전 복사본은 Core 가 남긴다).
  const handleRestoreFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || backupBusy) return;
    if (backupPassword.length < MIN_BACKUP_PASSWORD) {
      showFeedback("백업을 만들 때 쓴 암호(12자 이상)를 먼저 입력해주세요.");
      return;
    }
    if (!window.confirm("현재 계정의 기사·자료가 이 백업의 내용으로 바뀝니다.\n교체 전 상태는 안전 복사본으로 남습니다. 계속할까요?")) return;
    setBackupBusy(true);
    try {
      beginRestore();
      await restoreTransferFile(backupPassword, file);
      window.location.reload();
    } catch (error) {
      endRestore();
      showFeedback(error?.message || String(error));
      setBackupBusy(false);
    }
  };

  // 활성 단계가 뷰포트 세로 중앙에 오도록 오프셋 계산
  useEffect(() => {
    const updateCenterOffset = () => {
      const container = workflowContainerRef.current;
      const activeEl = stepRefs.current[activeStep];
      if (container && activeEl) {
        const containerH = container.clientHeight;
        const elTop = activeEl.offsetTop;
        const elH = activeEl.offsetHeight;
        // 컨테이너 중앙(containerH / 2) - 요소의 중심(elTop + elH / 2)
        const targetOffset = containerH / 2 - (elTop + elH / 2);
        setTranslateY(targetOffset);
      }
    };

    updateCenterOffset();
    window.addEventListener("resize", updateCenterOffset);
    return () => window.removeEventListener("resize", updateCenterOffset);
  }, [activeStep, models]);

  const applyStatus = useCallback((status) => {
    setModels((prev) => applyCoreStatus(prev, status, requestedModelId.current));
    setInstallInfo({ busy: Boolean(status.busy), progress: status.progress || null, lastError: status.lastError || null, loaded: true });
    return status;
  }, []);

  // 처음 열 때 Core 에서 실제 설치 상태를 읽는다.
  useEffect(() => {
    const request = new AbortController();
    modelStatus(request.signal)
      .then((status) => { if (!request.signal.aborted) { applyStatus(status); setCoreError(""); } })
      .catch((error) => { if (!request.signal.aborted) setCoreError(error?.message || String(error)); });
    return () => request.abort();
  }, [applyStatus]);

  // 설치가 진행되는 단계로 타임라인을 옮겨 지금 구동 중인 모델이 화면에 보이게 한다(설치 기능 자체는 그대로).
  const installingIndex = models.findIndex((m) => m.status === "downloading");
  useEffect(() => {
    if (installingIndex >= 0) setActiveStep(installingIndex);
  }, [installingIndex]);

  // 설치 중일 때만 1초 간격으로 진행률을 읽는다(요청이 끝난 뒤 다음 요청을 잡아 겹치지 않게).
  const isInstalling = models.some((m) => m.status === "downloading");
  useEffect(() => {
    if (!isInstalling || isBatchDownloadingRef.current) return undefined;
    const request = new AbortController();
    let timer;
    const poll = async () => {
      try {
        const status = applyStatus(await modelStatus(request.signal));
        if (request.signal.aborted) return;
        if (status.busy) timer = setTimeout(poll, 1000);
        else if (status.lastError?.message) setCoreError(status.lastError.message);
      } catch (error) {
        if (request.signal.aborted) return;
        setCoreError(error?.message || String(error));
        timer = setTimeout(poll, 1500);
      }
    };
    timer = setTimeout(poll, 1000);
    return () => { request.abort(); clearTimeout(timer); };
  }, [isInstalling, applyStatus]);

  // 상태 점검: 실제 설치 상태를 다시 읽고, 결과를 그대로 알린다. 점검 후 다음 단계로 이동한다.
  const handleModelAction = async (id, title, stepIdx) => {
    try {
      const status = applyStatus(await modelStatus());
      setCoreError("");
      const row = status.models.find((model) => model.id === CORE_MODEL_ID[id]);
      showFeedback(row?.installed
        ? `'${title}' 모델이 설치되어 있습니다. (파일 ${row.filesDone}/${row.files})`
        : `'${title}' 모델이 아직 설치되지 않았습니다.`);
    } catch (error) {
      setCoreError(error?.message || String(error));
      return;
    }
    if (stepIdx < models.length - 1) {
      setTimeout(() => setActiveStep(stepIdx + 1), 450);
    }
  };

  // 모델 설치 시작: Core 가 백그라운드로 내려받고, 진행률은 위 폴링이 읽는다.
  const handleStartInstall = async (id, title) => {
    if (actionPending || installInfo.busy) return; // Core 는 한 번에 한 모델만 설치한다
    requestedModelId.current = CORE_MODEL_ID[id];
    setCoreError("");
    setActionPending(true);
    try {
      applyStatus(await installModels(CORE_MODEL_ID[id]));
      showFeedback(`'${title}' 모델 다운로드를 시작했습니다.`);
    } catch (error) {
      setCoreError(error?.message || String(error));
    } finally {
      setActionPending(false);
    }
  };

  // 일괄 다운로드 진행 및 완료 상태
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const isBatchDownloadingRef = useRef(false);
  const isBatchDone = models.every((m) => m.status === "installed");

  // 구동 완료 후 휠 스크롤 가능 여부
  const isScrollable = isBatchDone || models.every((m) => m.status === "installed");

  // 타임라인 박스 마우스 휠 스크롤 핸들러 (구동 완료 후 커서 올렸을 때 스크롤 가능)
  const handleTimelineWheel = (e) => {
    if (!isScrollable) return;
    setTranslateY((prev) => {
      const container = workflowContainerRef.current;
      const containerH = container ? container.clientHeight : 500;
      const maxOffset = 60;
      const minOffset = Math.min(-100, containerH - 700);
      const next = prev - e.deltaY * 0.65;
      return Math.max(minOffset, Math.min(maxOffset, next));
    });
  };

  // 한 번에 다운로드하기: 미설치 모델을 단계 순서대로 하나씩 설치한다(Core 는 한 번에 한 모델만 설치한다).
  const handleBatchDownload = async () => {
    if (isBatchDownloadingRef.current) return;
    isBatchDownloadingRef.current = true;
    setIsBatchDownloading(true);
    setCoreError("");
    try {
      for (const [index, card] of INITIAL_MODELS.entries()) {
        const coreId = CORE_MODEL_ID[card.id];
        let status = applyStatus(await modelStatus());
        const row = status.models.find((model) => model.id === coreId);
        if (row?.installed) continue;
        if (row && row.sourceConfigured === false) {
          setCoreError(`'${card.title}' 모델은 다운로드 원본이 설정되지 않아 건너뛰었습니다.`);
          continue;
        }
        while (status.busy) { // 다른 설치가 끝난 뒤에 시작한다
          await sleep(1000);
          status = applyStatus(await modelStatus());
        }
        setActiveStep(index);
        requestedModelId.current = coreId;
        status = applyStatus(await installModels(coreId));
        while (status.busy) {
          await sleep(1000);
          status = applyStatus(await modelStatus());
        }
        if (status.lastError?.message) {
          setCoreError(status.lastError.message);
          break;
        }
      }
      showFeedback("모델 설치 상태를 갱신했습니다.");
    } catch (error) {
      setCoreError(error?.message || String(error));
    } finally {
      isBatchDownloadingRef.current = false;
      setIsBatchDownloading(false);
    }
  };

  // 모델 설치 취소
  const handleCancelInstall = async (id, title) => {
    if (actionPending) return;
    setActionPending(true);
    try {
      applyStatus(await cancelModelInstall());
      showFeedback(`'${title}' 모델 설치를 취소했습니다.`);
    } catch (error) {
      setCoreError(error?.message || String(error));
    } finally {
      setActionPending(false);
    }
  };

  // 화면 표시용 값(main 의 모델 설치 창과 같은 요약)
  const problem = coreError || installInfo.lastError?.message || "";
  const installable = models.filter((m) => m.status === "not_installed" || m.status === "downloading");
  const missingBytes = installable.reduce((sum, m) => sum + (m.bytesTotal || 0), 0);
  const allInstalled = models.length > 0 && models.every((m) => m.status === "installed");

  return (
    <div className="w-full max-w-[1400px] mx-auto animate-float-in pb-16 font-sans text-stone-900">
      {/* ──────────────────────────────────────────────────────────
          1. 상단 타이틀 헤더
         ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 mb-8 pt-0 pb-5 border-b border-stone-200/60">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-[#292929] tracking-tight">
            환경 설정
          </h1>
        </div>
      </div>

      {/* Core 연결·설치 오류 */}
      {problem && (
        <div role="alert" className="mb-6 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold text-center">
          {problem}
        </div>
      )}

      {installInfo.loaded && (
        <p data-testid="models-summary" className="mb-4 text-xs text-stone-500 font-medium text-right">
          {allInstalled ? "모든 모델이 설치되어 있습니다." : `미설치 모델 전체 용량: ${formatSize(missingBytes)}`}
          {" · 창을 닫아도 진행 중인 설치는 계속됩니다. 중단하려면 설치 취소를 누르세요."}
        </p>
      )}

      {/* 피드백 알림 배너 */}
      {feedbackMessage && (
        <div className="mb-6 p-3 rounded-2xl bg-stone-900 text-white text-xs font-bold text-center shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          {feedbackMessage}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────
          2. 메인 컨텐츠 그리드 (A. 로컬 모델 워크플로우 / B. 백업 및 복구)
         ────────────────────────────────────────────────────────── */}
      <div className="space-y-8">
        {/* ==========================================================
            [섹션 A] 로컬 AI 모델 세로형 워크플로우 및 중앙 정렬 모션 영역
           ========================================================== */}
        <section className="rounded-[28px] p-6 md:p-8 bg-white/80 backdrop-blur-xl border border-stone-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* ──────────────────────────────────────────────────────────
                [좌측 신문 편집 스타일 레이아웃]: 텍스트, 타이포그래피 및 단색 라인 일러스트
               ────────────────────────────────────────────────────────── */}
            <div className="lg:col-span-5 flex flex-col justify-between space-y-6 lg:pr-6 lg:border-r border-stone-200/60">
              <div className="space-y-3">
                {/* 상단 미니멀 태그 라벨 */}
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md bg-stone-100 text-stone-700 text-[11px] font-mono font-bold tracking-wider">
                    LOCAL AI MODELS
                  </span>
                </div>

                {/* 메인 헤드라인 타이틀 */}
                <h2 className="text-xl md:text-2xl font-black text-stone-950 tracking-tight leading-snug">
                  기사 작성과 검증을 돕는<br />로컬 AI 모델
                </h2>

                {/* 서브 설명 문구 */}
                <p className="text-xs md:text-sm text-stone-600 leading-relaxed font-normal">
                  팩트체크부터 제목·부제 초안까지, 로컬 AI 모델이 기사 작성 과정을 지원합니다.
                </p>
              </div>

              {/* 신문 지면, 기사 문서, 돋보기, AI 연산 단색 라인 일러스트 (부드러운 탐색 모션) */}
              <div className="py-2 flex items-center justify-center">
                <div className="w-full max-w-[280px] aspect-[4/3] rounded-2xl bg-stone-50/70 border border-stone-200/70 p-4 flex items-center justify-center relative overflow-hidden">
                  <svg
                    viewBox="0 0 240 180"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-full h-full text-stone-700 stroke-current"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {/* 신문 지면 외곽 프레임 */}
                    <rect x="25" y="20" width="130" height="140" rx="4" fill="white" strokeWidth="1.5" />
                    {/* 신문 헤드라인 바 */}
                    <line x1="38" y1="36" x2="142" y2="36" strokeWidth="3" />
                    {/* 신문 텍스트 단락 라인들 */}
                    <line x1="38" y1="48" x2="142" y2="48" strokeWidth="1" strokeDasharray="2 3" />
                    <line x1="38" y1="56" x2="110" y2="56" strokeWidth="1" />
                    <line x1="38" y1="64" x2="135" y2="64" strokeWidth="1" />
                    <line x1="38" y1="72" x2="120" y2="72" strokeWidth="1" />
                    <line x1="38" y1="80" x2="95" y2="80" strokeWidth="1" />

                    {/* 신문 사진/도표 격자 영역 */}
                    <rect x="38" y="94" width="46" height="38" rx="2" strokeWidth="1" strokeDasharray="3 2" />
                    <path d="M42 122 L52 110 L64 120 L72 114 L80 122" strokeWidth="1" />
                    <circle cx="50" cy="104" r="3" strokeWidth="1" />

                    {/* 신문 우측 컬럼 텍스트 */}
                    <line x1="92" y1="96" x2="142" y2="96" strokeWidth="1" />
                    <line x1="92" y1="104" x2="138" y2="104" strokeWidth="1" />
                    <line x1="92" y1="112" x2="142" y2="112" strokeWidth="1" />
                    <line x1="92" y1="120" x2="130" y2="120" strokeWidth="1" />
                    <line x1="92" y1="128" x2="140" y2="128" strokeWidth="1" />

                    {/* AI 연산 신경망 노드 및 연결선 (우측 상단 오버레이) */}
                    <g className="text-stone-800">
                      <circle cx="175" cy="40" r="5" fill="white" strokeWidth="1.5" />
                      <circle cx="205" cy="65" r="5" fill="white" strokeWidth="1.5" />
                      <circle cx="180" cy="95" r="5" fill="white" strokeWidth="1.5" />
                      <line x1="179" y1="43" x2="201" y2="62" strokeWidth="1.2" strokeDasharray="2 2" />
                      <line x1="202" y1="69" x2="183" y2="92" strokeWidth="1.2" strokeDasharray="2 2" />
                      <line x1="155" y1="36" x2="170" y2="40" strokeWidth="1.2" />
                    </g>

                    {/* 돋보기 신문 기사 탐색 애니메이션 스타일 정의 */}
                    <style>{`
                      @keyframes inspectMotion {
                        0% {
                          transform: translate(130px, 95px) scale(1);
                        }
                        20% {
                          transform: translate(45px, 52px) scale(1.03);
                        }
                        45% {
                          transform: translate(95px, 48px) scale(1.01);
                        }
                        68% {
                          transform: translate(42px, 92px) scale(1.04);
                        }
                        85% {
                          transform: translate(110px, 95px) scale(1.02);
                        }
                        100% {
                          transform: translate(130px, 95px) scale(1);
                        }
                      }
                      @media (prefers-reduced-motion: reduce) {
                        .magnifier-inspect-motion {
                          animation: none !important;
                          transform: translate(130px, 95px) !important;
                        }
                      }
                      .magnifier-inspect-motion {
                        animation: inspectMotion 8.5s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
                        transform-origin: 22px 22px;
                        will-change: transform;
                      }
                    `}</style>

                    {/* 돋보기 (기사 팩트체크 검증을 형상화 - 깔끔한 이전 모션 돋보기 복원) */}
                    <g className="magnifier-inspect-motion" transform="translate(130, 95)">
                      <circle cx="22" cy="22" r="18" fill="white" fillOpacity="0.85" strokeWidth="1.8" />
                      <line x1="35" y1="35" x2="52" y2="52" strokeWidth="3" />
                      {/* 돋보기 렌즈 내부 검증 체크 마크 */}
                      <path d="M15 22 L20 27 L29 17" strokeWidth="1.8" />
                    </g>
                  </svg>
                </div>
              </div>

              {/* 하단 단색 안내 문구 */}
              <div className="pt-3 border-t border-stone-200/60 text-[11px] text-stone-500 font-medium leading-relaxed">
                온디바이스 환경에서 기밀 데이터 유출 없이 모든 분석과 생성을 로컬 프로세스로 안전하게 처리합니다.
              </div>
            </div>

            {/* ──────────────────────────────────────────────────────────
                [우측 단계별 워크플로우 영역]: 세로형 타임라인 및 활성 단계 중앙 정렬 모션
               ────────────────────────────────────────────────────────── */}
            <div className="lg:col-span-7 flex flex-col justify-center space-y-3">
              {/* 다운로드 창 상단 컨트롤 바 */}
              <div className="relative flex items-center justify-between px-1 h-9">
                <div className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                  <span className="font-mono text-[11px] font-extrabold text-stone-400">PIPELINE</span>
                  <span className="text-stone-300">·</span>
                  <span>온디바이스 워크플로우</span>
                </div>

                {/* 중앙 상단: 화이트 타원형 캡슐 알약 + 블루실버 테두리 회전 모션 버튼 (이모지 제외) */}
                <div className="absolute left-1/2 -translate-x-1/2">
                  <style>{`
                    @keyframes spinBlueSilver {
                      from { transform: rotate(0deg); }
                      to { transform: rotate(360deg); }
                    }
                    .conic-bluesilver-spin {
                      background: conic-gradient(from 0deg, #38bdf8, #cbd5e1, #1d4ed8, #f8fafc, #0284c7, #94a3b8, #38bdf8);
                      animation: spinBlueSilver 2.2s linear infinite;
                    }
                    .static-bluesilver-border {
                      background: linear-gradient(135deg, #38bdf8, #cbd5e1, #1d4ed8, #e2e8f0);
                    }
                  `}</style>
                  <button
                    type="button"
                    onClick={handleBatchDownload}
                    disabled={isBatchDownloading || actionPending}
                    className="relative p-[1.5px] rounded-full overflow-hidden shadow-sm transition active:scale-95 cursor-pointer group disabled:cursor-not-allowed"
                    title="4개 로컬 AI 모델을 순차적으로 자동 다운로드 및 연동합니다"
                  >
                    {/* 블루실버 테두리 레이어: 구동 시 회전, 평상시 정적 고정 */}
                    <div
                      className={`absolute inset-[-150%] ${
                        isBatchDownloading
                          ? "conic-bluesilver-spin"
                          : "static-bluesilver-border"
                      }`}
                    />

                    {/* 화이트 캡슐 본체 (이모지 없이 심플하고 정갈한 텍스트 배치) */}
                    <div className="relative px-4 py-1.5 rounded-full bg-white text-stone-800 flex items-center justify-center select-none transition-colors">
                      <span className="font-sans text-[11px] font-bold tracking-tight">
                        {isBatchDownloading
                          ? "파이프라인 순차 연동 중..."
                          : isBatchDone
                          ? "한 번에 다운로드하기 (재실행)"
                          : "한 번에 다운로드하기"}
                      </span>
                    </div>
                  </button>
                </div>

                {/* 우측 안내: 구동 완료 후 휠 스크롤 가능 힌트 */}
                {isScrollable && !isBatchDownloading && (
                  <div className="text-[10px] text-stone-400 font-medium flex items-center gap-1 select-none">
                    <span>↕ 스크롤 가능</span>
                  </div>
                )}
              </div>

              {/* 타임라인 뷰포트 (고정 높이 및 상하 그라데이션 마스크, 구동 완료 후 마우스 호버 시 휠 스크롤 가능) */}
              <div
                ref={workflowContainerRef}
                onWheel={handleTimelineWheel}
                className={`relative h-[480px] md:h-[520px] overflow-hidden rounded-2xl bg-[#FAFAFA]/60 border border-stone-200/60 p-4 md:p-6 transition-colors ${
                  isScrollable ? "hover:border-stone-300" : ""
                }`}
                title={isScrollable ? "마우스 휠을 굴려 단계를 스크롤 탐색할 수 있습니다" : undefined}
              >
                {/* 상·하단 은은한 페이드아웃 그라데이션 (시각적 집중 효과) */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#FAFAFA] via-[#FAFAFA]/70 to-transparent z-20" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#FAFAFA] via-[#FAFAFA]/70 to-transparent z-20" />

                {/* 세로 타임라인 연결 레일 (배경 점선/실선) */}
                <div className="absolute left-7 md:left-9 top-10 bottom-10 w-[1.5px] bg-stone-200/90 z-0 pointer-events-none" />

                {/* 세로 이동 애니메이션 컨테이너 */}
                <div
                  style={{ transform: `translateY(${translateY}px)` }}
                  className="space-y-6 transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none relative z-10 py-6"
                >
                  {models.map((model, idx) => {
                    const isActive = activeStep === idx;
                    const isCompleted = model.status === "installed";

                    return (
                      <div
                        key={model.id}
                        ref={(el) => (stepRefs.current[idx] = el)}
                        onClick={() => setActiveStep(idx)}
                        className={`group relative pl-12 md:pl-16 pr-4 py-4 transition-all duration-300 cursor-pointer select-none rounded-2xl ${
                          isActive
                            ? "opacity-100 bg-white/95 border border-stone-200/90 shadow-sm"
                            : "opacity-45 hover:opacity-75 border border-transparent"
                        }`}
                      >
                        {/* 1. 타임라인 노드 마커 */}
                        <div className="absolute left-2 md:left-4 top-4 -translate-x-1/2">
                          {isCompleted ? (
                            <div className="w-6 h-6 rounded-full bg-stone-900 text-white flex items-center justify-center text-xs font-bold shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-stone-100" />
                            </div>
                          ) : model.status === "downloading" ? (
                            <div className="w-6 h-6 rounded-full border-2 border-stone-900 bg-white flex items-center justify-center shadow-2xs">
                              <RefreshCw className="w-3 h-3 text-stone-900 animate-spin" />
                            </div>
                          ) : isActive ? (
                            <div className="w-6 h-6 rounded-full border-2 border-stone-900 bg-white flex items-center justify-center shadow-2xs">
                              <span className="w-2 h-2 rounded-full bg-stone-900 animate-pulse" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-full border-2 border-stone-300 bg-stone-50 flex items-center justify-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-stone-300" />
                            </div>
                          )}
                        </div>

                        {/* 2. 단계 헤더 (스텝 번호 + 모델 타이틀 + 상태 뱃지) */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono text-xs font-bold text-stone-400 tracking-wider">
                                {model.step}
                              </span>
                              <span className="text-stone-300">|</span>
                              <h3 className="text-sm md:text-base font-black text-stone-900 tracking-tight">
                                {model.title}
                              </h3>
                            </div>

                            {/* 상태 배지 */}
                            {model.status === "installed" ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-600">
                                <CheckCircle2 className="w-3 h-3 text-stone-700" />
                                설치 완료
                              </span>
                            ) : model.status === "downloading" ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-stone-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-stone-800 animate-ping" />
                                {model.progress}%
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-stone-400">
                                {model.status === "checking" ? "확인 중…" : model.status === "unavailable" ? "Core에 없음" : "미설치"}
                              </span>
                            )}
                          </div>

                          {/* 활성 단계 설명 문구 */}
                          <p className={`text-xs leading-relaxed transition-all ${
                            isActive ? "text-stone-600 font-normal" : "text-stone-400 line-clamp-1"
                          }`}>
                            {model.desc}
                          </p>

                          {model.status === "not_installed" && model.sourceConfigured === false && (
                            <p className="text-[11px] font-medium text-amber-700">다운로드 원본이 아직 설정되지 않았어요.</p>
                          )}
                          {model.status === "downloading" && !installInfo.progress && (
                            <div className="space-y-1" data-testid="model-progress">
                              <progress aria-label="모델 설치 준비 중" className="w-full h-1.5 accent-stone-900" />
                              <p className="text-[11px] text-stone-500">설치를 준비하는 중입니다…</p>
                            </div>
                          )}
                          {model.status === "downloading" && installInfo.progress && (
                            <div className="space-y-1" data-testid="model-progress">
                              <progress max={100} value={model.progress} aria-label="모델 설치 진행률" className="w-full h-1.5 accent-stone-900" />
                              <p className="text-[11px] text-stone-500 font-mono break-all">
                                {formatSize(installInfo.progress.bytesDone || 0)} / {formatSize(installInfo.progress.bytesTotal || 0)}
                                {installInfo.progress.file ? ` · ${installInfo.progress.file}` : ""}
                              </p>
                            </div>
                          )}

                          {/* 하단 메타 정보 및 액션 버튼 */}
                          <div className="flex items-center justify-between gap-3 pt-1 text-xs text-stone-500 font-mono">
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="text-stone-700 font-semibold">{model.spec}</span>
                              <span className="text-stone-300">·</span>
                              <span className="font-bold text-stone-800">{model.size}</span>
                              <span className="text-stone-300">·</span>
                              <span className="flex items-center gap-1">
                                <FileCheck2 className="w-3 h-3 text-stone-400" />
                                파일 {model.files}
                              </span>
                            </div>

                            {/* 활성 단계 액션 버튼 */}
                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                              {model.status === "installed" && (
                                <button
                                  type="button"
                                  onClick={() => handleModelAction(model.id, model.title, idx)}
                                  className="px-3 py-1 rounded-xl bg-white hover:bg-stone-100 text-stone-800 text-xs font-bold border border-stone-200 shadow-2xs transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                                  title="모델 상태 점검 및 다음 단계 이동"
                                >
                                  <RefreshCw className="w-3 h-3 text-stone-500" />
                                  <span>점검 완료</span>
                                </button>
                              )}

                              {model.status === "downloading" && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelInstall(model.id, model.title)}
                                  disabled={actionPending}
                                  className="px-2.5 py-1 text-xs font-bold text-stone-500 hover:text-stone-900 transition flex items-center gap-1 cursor-pointer active:scale-95"
                                >
                                  <X className="w-3.5 h-3.5 text-stone-500" />
                                  <span>설치 취소</span>
                                </button>
                              )}

                              {model.status === "not_installed" && (
                                <button
                                  type="button"
                                  onClick={() => handleStartInstall(model.id, model.title, idx)}
                                  disabled={installInfo.busy || actionPending || model.sourceConfigured === false}
                                  style={installInfo.busy || actionPending || model.sourceConfigured === false ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                                  className="px-3 py-1 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                                >
                                  <Download className="w-3 h-3 text-stone-300" />
                                  <span>{actionPending && requestedModelId.current === CORE_MODEL_ID[model.id] ? "설치 요청 중…" : "모델 설치"}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================================
            [섹션 B] 사용자 자료 백업·복구
           ========================================================== */}
        <section
          className="rounded-[28px] p-6 md:p-8 bg-white/80 backdrop-blur-xl border border-stone-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-800 flex items-center justify-center border border-stone-200/60 shadow-2xs">
                  <ShieldCheck className="w-4 h-4 text-stone-700" />
                </div>
                <h2 className="text-lg font-black text-stone-950 tracking-tight">
                  사용자 자료 백업·복구
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-stone-100 text-stone-700 border border-stone-200">
                  AES-256 보호
                </span>
              </div>
              <p className="text-xs text-stone-500 font-medium pl-10">
                기사 데이터와 시스템 설정을 비밀번호로 안전하게 암호화하여 파일로 내려받거나 복구합니다.
              </p>
            </div>
          </div>

          <div className="max-w-2xl space-y-5">
            {/* 백업 암호 입력란 */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-stone-500" />
                <span>백업 암호 (12자 이상 권장)</span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                  placeholder="복구 시 사용할 암호를 12자 이상 입력해주세요"
                  className="w-full px-4 py-3 rounded-2xl bg-[#FAFAFA] border border-stone-200 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:bg-white focus:border-stone-400 transition shadow-inner font-mono"
                />
              </div>
              <p className="text-[11px] text-stone-400 leading-normal">
                * 암호를 분실하시면 백업된 암호화 파일의 복구가 불가능하므로 안전한 장소에 보관하십시오.
              </p>
            </div>

            {/* 작업 버튼 그룹 */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                data-testid="backup-export"
                disabled={backupBusy}
                onClick={handleBackupExport}
                className="px-5 py-2.5 rounded-2xl bg-stone-900 hover:bg-black disabled:opacity-60 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
              >
                <HardDriveDownload className="w-4 h-4 text-[#8ECAE6]" />
                <span>{backupBusy ? "처리 중…" : "암호화 백업 받기"}</span>
              </button>

              <input ref={restoreFileInput} type="file" accept=".db" className="hidden" data-testid="backup-restore-input" onChange={handleRestoreFile} />
              <button
                type="button"
                data-testid="backup-restore"
                disabled={backupBusy}
                onClick={() => restoreFileInput.current?.click()}
                className="px-5 py-2.5 rounded-2xl bg-white hover:bg-stone-100 disabled:opacity-60 text-stone-800 text-xs font-bold border border-stone-200/90 transition flex items-center gap-2 cursor-pointer shadow-2xs active:scale-95"
              >
                <UploadCloud className="w-4 h-4 text-stone-500" />
                <span>백업에서 복구</span>
              </button>
            </div>
            <ExportNotice result={backupExport} kind="backup" className="text-xs text-stone-600" />
          </div>
        </section>

        {/* ==========================================================
            [섹션 C] 계정·클라우드 백업·PC 이전 (main 기능)
           ========================================================== */}
        <section className="rounded-[28px] p-6 md:p-8 bg-white/80 backdrop-blur-xl border border-stone-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-black text-stone-950 tracking-tight">계정·클라우드·이전</h2>
            <p className="text-xs text-stone-500 font-medium">
              로그인 유지, 작성 중 기사의 클라우드 백업, 다른 PC로 이전, 진단 정보 복사를 한곳에서 설정합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="open-settings-dialog"
              onClick={() => setDialog("settings")}
              className="px-5 py-2.5 rounded-2xl bg-stone-900 hover:bg-black text-white text-xs font-bold transition cursor-pointer shadow-sm active:scale-95"
            >
              환경 설정 열기
            </button>
            <button
              type="button"
              data-testid="open-transfer-wizard"
              onClick={() => setDialog("transfer")}
              className="px-5 py-2.5 rounded-2xl bg-white hover:bg-stone-100 text-stone-800 text-xs font-bold border border-stone-200/90 transition cursor-pointer shadow-2xs active:scale-95"
            >
              다른 PC로 이전
            </button>
            <button
              type="button"
              data-testid="open-export-folder"
              onClick={() => openExportFolder().catch((error) => showFeedback(error?.message || String(error)))}
              className="px-5 py-2.5 rounded-2xl bg-white hover:bg-stone-100 text-stone-800 text-xs font-bold border border-stone-200/90 transition cursor-pointer shadow-2xs active:scale-95"
            >
              내보내기 폴더 열기
            </button>
          </div>
          <p className="text-xs text-stone-500">백업·카드뉴스·사진·녹취를 내보내면 내 문서\AI Newsroom\내보내기\종류별 폴더에 저장됩니다.</p>
        </section>
        <AiEngineSection />
      </div>

      {dialog === "settings" && (
        <SettingsDialog
          onClose={() => setDialog(null)}
          session={session}
          onSession={onSession}
          onTransfer={() => setDialog("transfer")}
        />
      )}
      {dialog === "transfer" && (
        <TransferWizard onClose={() => setDialog(null)} onBeforeRestore={() => Promise.resolve()} />
      )}
    </div>
  );
}
