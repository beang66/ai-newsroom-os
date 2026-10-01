import React, { useState } from 'react';
import {
  Mic,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Clock,
  ArrowLeft,
  Upload,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Edit3,
  FileText,
  Sparkles,
} from 'lucide-react';
import { useNewsroom } from '../context/NewsroomContext';
import { EditorialAssetGraphic } from './EditorialAssetGraphic';

export const InterviewPanel: React.FC = () => {
  const {
    interview,
    audioCurrentTime,
    isAudioPlaying,
    audioPlaybackRate,
    setAudioPlaybackRate,
    seekAudio,
    toggleAudioPlay,
    returnToSentenceId,
    returnToDraftFromInterview,
    updateEditedTranscript,
    interviewUploadStatus,
    triggerSimulatedUpload,
  } = useNewsroom();

  const [activeTab, setActiveTab] = useState<'original' | 'edited'>('original');

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const activeTranscript =
    activeTab === 'original'
      ? interview.originalTranscript
      : interview.editedTranscript;

  return (
    <div className="flex-1 flex flex-col bg-[#F6F7F8] overflow-hidden select-none">
      {/* Return to Draft banner if navigated from a verification issue */}
      {returnToSentenceId && (
        <div className="bg-amber-600 text-white px-4 py-2 flex items-center justify-between text-xs z-30 shrink-0 shadow-xs">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-amber-200 shrink-0" />
            <span>
              <strong>검증 문장 대조 중</strong>: 취재팀이 입수한 녹취록(조진우 처장 발언)과 원음 대조
            </span>
          </div>
          <button
            onClick={returnToDraftFromInterview}
            className="px-3 py-1 bg-white text-amber-900 rounded font-bold hover:bg-amber-50 transition-colors flex items-center gap-1.5 shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>원래 기사 문장으로 복귀</span>
          </button>
        </div>
      )}

      {/* Interview Header & Audio Player */}
      <div className="bg-white border-b border-[#E3E6E9] p-4 shrink-0 space-y-4">
        {/* Top Info */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg overflow-hidden border border-[#E3E6E9] shrink-0">
              <EditorialAssetGraphic variant="interview_portrait" aspectRatio="1:1" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm text-[#20252C]">{interview.title}</h2>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded font-mono">
                  전사 완료 (음성 동기화)
                </span>
              </div>
              <div className="text-xs text-[#626C78] mt-0.5">
                취재원: <strong>{interview.interviewee}</strong> ({interview.intervieweeRole}) · {interview.date}
              </div>
            </div>
          </div>

          {/* Upload & Transcription Simulator Control */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => triggerSimulatedUpload('processing')}
              disabled={interviewUploadStatus === 'processing'}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors flex items-center gap-1.5"
              title="새로운 녹취 파일 업로드 시뮬레이션"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>
                {interviewUploadStatus === 'processing' ? '음성 분석 중...' : '새 녹취 업로드'}
              </span>
            </button>
            <button
              onClick={() => triggerSimulatedUpload('failed')}
              className="px-2 py-1 text-[10px] text-red-600 hover:bg-red-50 rounded"
              title="업로드 실패 에러 상태 시뮬레이션"
            >
              실패 테스트
            </button>
          </div>
        </div>

        {/* Upload failure banner if simulated */}
        {interviewUploadStatus === 'failed' && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                오디오 파일 전사 처리 중 인코딩 에러가 발생했습니다. (시뮬레이션 모드)
              </span>
            </div>
            <button
              onClick={() => triggerSimulatedUpload('processing')}
              className="px-2.5 py-1 bg-red-600 text-white rounded font-medium hover:bg-red-700"
            >
              재시도
            </button>
          </div>
        )}

        {/* Audio Player Controller Bar */}
        <div className="p-3 bg-[#F6F7F8] rounded-lg border border-[#E3E6E9] space-y-2">
          <div className="flex items-center gap-3">
            {/* Play/Pause Button */}
            <button
              onClick={toggleAudioPlay}
              className="w-8 h-8 rounded-full bg-[#2457D6] hover:bg-[#1D46AF] text-white flex items-center justify-center transition-colors shadow-xs"
              title={isAudioPlaying ? '일시 정지' : '재생'}
            >
              {isAudioPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            {/* Seek Bar */}
            <div className="flex-1 flex flex-col gap-1">
              <input
                type="range"
                min={0}
                max={interview.durationSec}
                value={audioCurrentTime}
                onChange={e => seekAudio(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-[#2457D6]"
              />
              <div className="flex items-center justify-between text-[11px] font-mono text-[#626C78] tabular-nums">
                <span>{formatTime(audioCurrentTime)}</span>
                <span>{formatTime(interview.durationSec)}</span>
              </div>
            </div>

            {/* Playback speed selector */}
            <div className="flex items-center gap-1 font-mono text-[11px] text-[#626C78]">
              {[1.0, 1.2, 1.5].map(rate => (
                <button
                  key={rate}
                  onClick={() => setAudioPlaybackRate(rate)}
                  className={`px-1.5 py-0.5 rounded ${
                    audioPlaybackRate === rate
                      ? 'bg-slate-300 text-[#20252C] font-bold'
                      : 'hover:bg-slate-200'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* View Switch: Original Transcript vs Edited Transcript */}
        <div className="flex items-center justify-between text-xs pt-1">
          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 bg-[#F6F7F8] rounded border border-[#E3E6E9]">
              <button
                onClick={() => setActiveTab('original')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  activeTab === 'original'
                    ? 'bg-white text-[#2457D6] font-bold shadow-xs'
                    : 'text-[#626C78] hover:text-[#20252C]'
                }`}
              >
                원음 전사 원본 (읽기 전용)
              </button>
              <button
                onClick={() => setActiveTab('edited')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  activeTab === 'edited'
                    ? 'bg-white text-[#2457D6] font-bold shadow-xs'
                    : 'text-[#626C78] hover:text-[#20252C]'
                }`}
              >
                기자 수정본 (편집 가능)
              </button>
            </div>
          </div>

          <span className="text-[11px] text-slate-400">
            타임스탬프를 클릭하면 해당 녹취 음성 위치로 이동합니다.
          </span>
        </div>
      </div>

      {/* Transcript Segments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activeTranscript.map(seg => {
          const isCurrentlyPlaying =
            audioCurrentTime >= seg.timeSec &&
            audioCurrentTime < seg.timeSec + 30;

          return (
            <div
              key={seg.id}
              className={`p-3.5 rounded-lg border transition-all ${
                seg.hasDiscrepancy
                  ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-400/40'
                  : isCurrentlyPlaying
                  ? 'bg-blue-50/50 border-[#2457D6]/50'
                  : 'bg-white border-[#E3E6E9]'
              }`}
            >
              {/* Speaker & Timestamp */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-[#20252C]">
                    {seg.speaker}
                  </span>
                  <button
                    onClick={() => {
                      seekAudio(seg.timeSec);
                      if (!isAudioPlaying) toggleAudioPlay();
                    }}
                    className="font-mono text-[11px] text-[#2457D6] hover:underline bg-blue-50 px-1.5 py-0.2 rounded flex items-center gap-1"
                    title="이 구간부터 오디오 재생"
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />
                    <span>[{formatTime(seg.timeSec)}]</span>
                  </button>
                </div>

                {seg.hasDiscrepancy && (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    기사 인용문과 뉘앙스 상충 구간 (02:45)
                  </span>
                )}
              </div>

              {/* Text: Read-only in original tab, Editable in edited tab */}
              {activeTab === 'original' ? (
                <p className="text-xs text-[#20252C] leading-relaxed font-serif select-text">
                  {seg.text}
                </p>
              ) : (
                <textarea
                  value={seg.text}
                  onChange={e => updateEditedTranscript(seg.id, e.target.value)}
                  rows={2}
                  className="w-full text-xs text-[#20252C] leading-relaxed font-serif bg-transparent border border-transparent hover:border-slate-300 focus:border-[#2457D6] focus:bg-white rounded p-1"
                />
              )}

              {/* Notice for Discrepancy */}
              {seg.hasDiscrepancy && (
                <div className="mt-2.5 pt-2 border-t border-amber-200 text-[11px] text-amber-900 bg-amber-100/60 p-2 rounded space-y-1">
                  <div className="font-bold">⚠️ 취재 팩트체크 알림:</div>
                  <div>
                    기사 원고에는 <strong>"올해 3분기 내 상용화가 100% 확실하다"</strong>로 인용되었으나,
                    실제 발언은 <strong>"목표일 뿐 시점은 여전히 가변적"</strong>입니다. 왜곡된 단정적 인용을 방지하기 위해 본문 수정이 권장됩니다.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
