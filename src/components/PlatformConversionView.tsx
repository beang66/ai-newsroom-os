import React, { useState } from 'react';
import {
  Columns2,
  Mail,
  Share2,
  RotateCcw,
  Copy,
  Check,
  AlertTriangle,
  Info,
  Sparkles,
  Download,
} from 'lucide-react';
import { useNewsroom } from '../context/NewsroomContext';

export const PlatformConversionView: React.FC = () => {
  const {
    article,
    newsletterDraft,
    setNewsletterDraft,
    snsDraft,
    setSnsDraft,
    regeneratePlatformCopy,
    syncPlatformWithMaster,
  } = useNewsroom();

  const [platformTab, setPlatformTab] = useState<'newsletter' | 'sns'>('newsletter');
  const [copied, setCopied] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  const isNewsletterOutdated = article.version > article.newsletterLastSyncedVersion;
  const isSnsOutdated = article.version > article.snsLastSyncedVersion;
  const isCurrentOutdated = platformTab === 'newsletter' ? isNewsletterOutdated : isSnsOutdated;

  const currentCopy = platformTab === 'newsletter' ? newsletterDraft : snsDraft;
  const setCurrentCopy = platformTab === 'newsletter' ? setNewsletterDraft : setSnsDraft;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = () => {
    regeneratePlatformCopy(platformTab);
    setShowRegenConfirm(false);
  };

  const handleDownloadCopy = () => {
    const filename = `${platformTab === 'newsletter' ? '뉴스레터변환본' : 'SNS스레드변환본'}_${article.id}.txt`;
    const blob = new Blob([currentCopy], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F6F7F8] overflow-hidden select-none">
      {/* Top Header Bar */}
      <div className="bg-white border-b border-[#E3E6E9] px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-[#20252C] flex items-center gap-2">
            <Columns2 className="w-4 h-4 text-[#2457D6]" />
            <span>플랫폼별 기사 변환 워크스페이스</span>
          </h2>
          <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-mono">
            예시 규칙 기반 변환 (2종 지원)
          </span>
        </div>

        {/* Platform Selector Tabs */}
        <div className="flex items-center gap-1 bg-[#F6F7F8] p-1 rounded-lg border border-[#E3E6E9]">
          <button
            onClick={() => setPlatformTab('newsletter')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
              platformTab === 'newsletter'
                ? 'bg-white text-[#2457D6] shadow-xs font-bold'
                : 'text-[#626C78] hover:text-[#20252C]'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>뉴스레터 소개문</span>
            {isNewsletterOutdated && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            )}
          </button>
          <button
            onClick={() => setPlatformTab('sns')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
              platformTab === 'sns'
                ? 'bg-white text-[#2457D6] shadow-xs font-bold'
                : 'text-[#626C78] hover:text-[#20252C]'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>SNS 소개글 (스레드)</span>
            {isSnsOutdated && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            )}
          </button>
        </div>
      </div>

      {/* Main Split Body: Left Master (Read-only) vs Right Transformed (Editable) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left: Master Article (Read-only reference) */}
        <div className="flex-1 border-r border-[#E3E6E9] bg-white flex flex-col overflow-hidden">
          <div className="p-3 border-b border-[#E3E6E9] bg-slate-50 flex items-center justify-between text-xs text-[#626C78]">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-800">Master Article (원본 기사)</span>
              <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-mono">
                읽기 전용
              </span>
            </div>
            <span className="font-mono text-[11px]">버전 v{article.version}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 select-text">
            <h2 className="text-xl font-bold text-[#20252C] leading-snug">
              {article.title}
            </h2>
            <p className="text-xs text-[#626C78] font-normal leading-relaxed">
              {article.subtitle}
            </p>
            <div className="border-t border-slate-100 pt-4 space-y-4 text-xs text-[#20252C] leading-relaxed font-serif whitespace-pre-wrap">
              {article.content}
            </div>
          </div>
        </div>

        {/* Right: Editable Transformed Copy */}
        <div className="flex-1 bg-[#F6F7F8] flex flex-col overflow-hidden">
          {/* Header with update alert & actions */}
          <div className="p-3 border-b border-[#E3E6E9] bg-white flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#20252C]">
                {platformTab === 'newsletter' ? '뉴스레터 전용 변환본' : 'SNS 스레드 변환본'}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">편집 가능</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Regenerate button */}
              <button
                onClick={() => setShowRegenConfirm(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
                title="원본 기사 최신 내용으로 다시 변환"
              >
                <RotateCcw className="w-3 h-3" />
                <span>규칙 재변환</span>
              </button>

              {/* Copy button */}
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-[#2457D6] hover:bg-[#1D46AF] text-white rounded font-medium transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? '복사됨' : '복사'}</span>
              </button>

              {/* Download */}
              <button
                onClick={handleDownloadCopy}
                className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800"
                title="텍스트 파일로 저장"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Master article update warning if modified */}
          {isCurrentOutdated && (
            <div className="p-3 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>원문 변경됨</strong>: 원고 본문이 수정되었습니다. 변환본 갱신을 권장합니다.
                </span>
              </div>
              <button
                onClick={() => setShowRegenConfirm(true)}
                className="px-2 py-0.5 bg-amber-600 text-white rounded text-[11px] font-medium hover:bg-amber-700 shrink-0"
              >
                갱신하기
              </button>
            </div>
          )}

          {/* Editor Area */}
          <div className="flex-1 p-6 flex flex-col">
            <textarea
              value={currentCopy}
              onChange={e => setCurrentCopy(e.target.value)}
              className="w-full flex-1 p-4 bg-white border border-[#E3E6E9] rounded-lg text-xs leading-relaxed text-[#20252C] font-mono resize-none focus:outline-hidden focus:ring-1 focus:ring-[#2457D6]"
              placeholder="변환된 내용을 확인하고 필요한 문장을 수정하세요..."
            />
          </div>

          {/* Footer note */}
          <div className="px-6 py-2.5 border-t border-[#E3E6E9] bg-white text-[11px] text-slate-400 flex items-center justify-between">
            <span>사용자 수동 수정본은 자동 삭제되지 않고 독립 저장됩니다.</span>
            <span className="font-mono tabular-nums">{currentCopy.length}자</span>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Regeneration */}
      {showRegenConfirm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4 space-y-3">
            <h3 className="font-bold text-sm text-slate-900">플랫폼 변환본 재생성</h3>
            <p className="text-xs text-slate-600 leading-normal">
              현재 작성 중인 변환본 내용이 원본 기사를 바탕으로 다시 생성됩니다. 진행하시겠습니까?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowRegenConfirm(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
              >
                취소
              </button>
              <button
                onClick={handleRegenerate}
                className="px-3 py-1.5 text-xs bg-[#2457D6] text-white rounded font-medium hover:bg-[#1D46AF]"
              >
                재생성 실행
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
