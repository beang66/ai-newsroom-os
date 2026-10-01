import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Download,
  Maximize2,
  Minimize2,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Settings,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { useNewsroom } from '../context/NewsroomContext';
import { WorkMode } from '../types';

export const Header: React.FC = () => {
  const {
    workMode,
    setWorkMode,
    article,
    saveStatus,
    isFocusMode,
    setIsFocusMode,
    exportArticleFile,
    resetToInitialDemo,
    isLocalProcessingOnly,
    setIsLocalProcessingOnly,
    simulateAIError,
    setSimulateAIError,
    simulateSaveError,
    setSimulateSaveError,
  } = useNewsroom();

  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [nowTimestamp, setNowTimestamp] = useState<number>(() => Date.now());
  const exportRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Update relative time timer every 2 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTimestamp(Date.now());
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Compute human-friendly relative saved time
  const getRelativeSaveTime = (): string => {
    let savedTimeMs: number;
    if (article.lastSavedTimestamp) {
      savedTimeMs = article.lastSavedTimestamp;
    } else {
      // Parse ISO or "YYYY-MM-DD HH:mm:ss" format
      const parsed = Date.parse(article.lastSavedAt.replace(' ', 'T'));
      savedTimeMs = isNaN(parsed) ? Date.now() : parsed;
    }

    const diffSeconds = Math.max(0, Math.floor((nowTimestamp - savedTimeMs) / 1000));

    if (diffSeconds < 5) {
      return '방금 전';
    } else if (diffSeconds < 60) {
      return `${diffSeconds}초 전`;
    } else if (diffSeconds < 3600) {
      const minutes = Math.floor(diffSeconds / 60);
      return `${minutes}분 전`;
    } else {
      const hours = Math.floor(diffSeconds / 3600);
      return `${hours}시간 전`;
    }
  };

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopyClipboard = () => {
    navigator.clipboard.writeText(`${article.title}\n\n${article.subtitle}\n\n${article.content}`);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 2000);
    setIsExportMenuOpen(false);
  };

  const navModes: Array<{ id: WorkMode; label: string }> = [
    { id: 'draft_review', label: '작성·검토' },
    { id: 'publishing_prep', label: '발행 준비' },
    { id: 'platform_transform', label: '플랫폼 변환' },
    { id: 'archive', label: '보관' },
  ];

  return (
    <header className="h-[58px] bg-white border-b border-[#E3E6E9] px-4 flex items-center justify-between select-none shrink-0 z-30">
      {/* Zone 1: Service Brand & Article Indicator */}
      <div className="flex items-center gap-3 min-w-0 max-w-[420px]">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded bg-[#20252C] flex items-center justify-center text-white font-semibold text-xs tracking-wider">
            OS
          </div>
          <span className="font-semibold text-sm tracking-tight text-[#20252C]">
            AI-Newsroom OS
          </span>
        </div>

        <span className="text-slate-300">/</span>

        {/* Current Article Title */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs text-slate-400 font-mono shrink-0">기사</span>
          <span
            className="text-xs font-medium text-[#20252C] truncate max-w-[220px]"
            title={article.title}
          >
            {article.title || '새 기사 작성'}
          </span>
        </div>
      </div>

      {/* Zone 2: Work Modes Navigation Tabs */}
      <nav className="flex items-center p-1 bg-[#F6F7F8] rounded-lg border border-[#E3E6E9]" aria-label="작업 모드">
        {navModes.map(mode => {
          const isActive = workMode === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => setWorkMode(mode.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-white text-[#2457D6] shadow-xs font-semibold'
                  : 'text-[#626C78] hover:text-[#20252C]'
              }`}
            >
              {mode.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Save Status, Focus Mode, Export, Demo Settings */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Save State Indicator (Explicit local save notice & real-time monitor) */}
        <div
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded transition-colors border ${
            saveStatus === 'saving'
              ? 'bg-blue-50 border-blue-200 text-[#2457D6]'
              : saveStatus === 'error'
              ? 'bg-red-50 border-red-200 text-red-600'
              : 'bg-[#F6F7F8] border-[#E3E6E9] text-[#20252C]'
          }`}
          title={`로컬 저장소 상태: ${
            saveStatus === 'saving'
              ? '로컬 스토리지에 동기화 중'
              : saveStatus === 'error'
              ? '동기화 오류'
              : `이 기기에 저장됨 (${article.lastSavedAt})`
          }`}
        >
          {saveStatus === 'saved' && (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[#626C78]">
                마지막 저장: <strong className="text-[#20252C] font-semibold">{getRelativeSaveTime()}</strong>
              </span>
              <span className="text-[10px] text-slate-400 font-mono hidden md:inline ml-0.5">
                (로컬 동기화됨)
              </span>
            </>
          )}
          {saveStatus === 'saving' && (
            <>
              <Loader2 className="w-3.5 h-3.5 text-[#2457D6] animate-spin shrink-0" />
              <span className="font-semibold text-[#2457D6]">저장 중...</span>
            </>
          )}
          {saveStatus === 'error' && (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
              <span className="text-red-600 font-semibold">저장 실패 (로컬 스토리지 확인)</span>
            </>
          )}
        </div>

        {/* Focus Mode Toggle */}
        <button
          onClick={() => setIsFocusMode(prev => !prev)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border transition-colors ${
            isFocusMode
              ? 'bg-[#2457D6] text-white border-[#2457D6]'
              : 'bg-white text-[#626C78] border-[#E3E6E9] hover:text-[#20252C] hover:bg-slate-50'
          }`}
          title={isFocusMode ? '집중 모드 해제' : '집중 모드 (양쪽 패널 접기)'}
        >
          {isFocusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">집중 모드</span>
        </button>

        {/* Export Dropdown */}
        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setIsExportMenuOpen(prev => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#2457D6] text-white hover:bg-[#1D46AF] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>내보내기</span>
            <ChevronDown className="w-3 h-3 opacity-80" />
          </button>

          {isExportMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-[#E3E6E9] rounded-lg shadow-lg p-1.5 z-50 text-xs">
              <div className="px-2 py-1 text-[11px] text-slate-400 font-medium border-b border-[#E3E6E9] mb-1">
                실제 파일 다운로드
              </div>
              <button
                onClick={() => {
                  exportArticleFile('txt');
                  setIsExportMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-slate-50 rounded text-left text-[#20252C]"
              >
                <div>
                  <div className="font-medium">기사 원고 텍스트 (.txt)</div>
                  <div className="text-[11px] text-slate-500">출처 목록 및 본문 포함</div>
                </div>
                <Download className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <button
                onClick={() => {
                  exportArticleFile('json');
                  setIsExportMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-slate-50 rounded text-left text-[#20252C]"
              >
                <div>
                  <div className="font-medium">취재 데이터 세트 (.json)</div>
                  <div className="text-[11px] text-slate-500">검증 이슈 및 메타데이터 포함</div>
                </div>
                <Download className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <div className="border-t border-[#E3E6E9] my-1" />
              <button
                onClick={handleCopyClipboard}
                className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-slate-50 rounded text-left text-[#20252C]"
              >
                <div>
                  <div className="font-medium">클립보드 전체 복사</div>
                  <div className="text-[11px] text-slate-500">제목·부제·본문</div>
                </div>
                {copiedNotice ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                )}
              </button>
              <div className="mt-1 px-2 py-1 bg-amber-50 rounded text-[11px] text-amber-800">
                내보낸 결과물 · 발행 여부 미확인
              </div>
            </div>
          )}
        </div>

        {/* Demo Sandbox & Simulation Controls */}
        <div className="relative" ref={settingsRef}>
          <button
            onClick={() => setIsSettingsOpen(prev => !prev)}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded border border-[#E3E6E9] transition-colors"
            title="데모 환경 및 시뮬레이션 설정"
          >
            <Settings className="w-4 h-4" />
          </button>

          {isSettingsOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-72 bg-white border border-[#E3E6E9] rounded-lg shadow-lg p-3 z-50 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#E3E6E9] mb-2.5">
                <span className="font-semibold text-slate-800">데모 & 시뮬레이션 설정</span>
                <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  가상 데이터
                </span>
              </div>

              {/* Privacy Setting */}
              <div className="mb-3 p-2 bg-slate-50 rounded border border-[#E3E6E9]">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-slate-800 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    취재 자료 외부 AI 전송 방지
                  </span>
                  <input
                    type="checkbox"
                    checked={isLocalProcessingOnly}
                    onChange={e => setIsLocalProcessingOnly(e.target.checked)}
                    className="rounded border-slate-300 text-[#2457D6]"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  민감 취재원 및 비공개 문건을 외부 서버로 전송하지 않고 로컬 시뮬레이션으로 분석합니다.
                </p>
              </div>

              {/* Error Simulation Switches */}
              <div className="space-y-2 mb-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-slate-700">AI 검증 오류 시뮬레이션</span>
                  <input
                    type="checkbox"
                    checked={simulateAIError}
                    onChange={e => setSimulateAIError(e.target.checked)}
                    className="rounded border-slate-300 text-[#2457D6]"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-slate-700">저장 실패 시뮬레이션</span>
                  <input
                    type="checkbox"
                    checked={simulateSaveError}
                    onChange={e => setSimulateSaveError(e.target.checked)}
                    className="rounded border-slate-300 text-[#2457D6]"
                  />
                </label>
              </div>

              {/* Reset to demo */}
              <button
                onClick={() => {
                  resetToInitialDemo();
                  setIsSettingsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors text-xs font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                예시 취재 기사 데이터로 초기화
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
