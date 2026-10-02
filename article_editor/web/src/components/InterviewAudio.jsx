import React, { useState } from "react";
import { Mic, Upload, Play, Pause, Clock, CheckCircle, ArrowLeft, Edit3, Volume2 } from "lucide-react";
import { mockInterviews } from "../data/mockData";

export default function InterviewAudio({ onReturnToArticle }) {
  const [interviews, setInterviews] = useState(mockInterviews);
  const [selectedInterview, setSelectedInterview] = useState(mockInterviews[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayingTime, setIsPlayingTime] = useState("02:45");
  const [isUploading, setIsUploading] = useState(false);

  const [editedText, setEditedText] = useState(selectedInterview.editedTranscript);

  const handleFileUpload = (e) => {
    setIsUploading(true);
    setTimeout(() => {
      const newInt = {
        id: `int-${Date.now()}`,
        title: "새 녹음 파일 (현장 취재 녹취)",
        date: "2026-10-01",
        audioDuration: "08:15",
        autoTranscript: "[00:05] 안녕하세요, 관련 기술 개발 성과에 대해 여쭤보고자 합니다.\n[01:20] 개발진은 이번 실증 결과에 대해 큰 만족감을 나타냈습니다.",
        editedTranscript: "[00:05] 안녕하세요, 관련 기술 개발 성과에 대해 여쭤보고자 합니다.\n[01:20] 개발진은 이번 실증 결과에 대해 큰 만족감을 나타냈습니다.",
        status: "받아쓰기 완료"
      };
      setInterviews([newInt, ...interviews]);
      setSelectedInterview(newInt);
      setEditedText(newInt.editedTranscript);
      setIsUploading(false);
    }, 1200);
  };

  const handleSaveAndReturn = () => {
    alert("수정된 확인·수정본 내용이 기사 작성 화면에 적용되었습니다.");
    if (onReturnToArticle) {
      onReturnToArticle(editedText);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6 animate-float-in">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 glass-card p-5 shadow-xs">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Mic className="w-5 h-5 text-slate-800" />
            인터뷰·녹취 (STT 음성 인식)
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            녹음 파일을 업로드하면 AI가 자동 받아쓰기를 수행합니다. 기자가 직접 확인·수정본을 작성하여 기사에 활용합니다.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl cursor-pointer transition shadow-md shadow-slate-900/20">
            <Upload className="w-4 h-4 text-slate-200" />
            <span>{isUploading ? "음성 인식 처리 중..." : "녹음 파일 업로드"}</span>
            <input type="file" accept="audio/*,video/*" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            onClick={handleSaveAndReturn}
            className="flex items-center gap-2 px-4 py-2 bg-white/80 hover:bg-white text-slate-700 font-bold text-sm rounded-xl transition border border-slate-200 shadow-xs cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            기사로 돌아가기
          </button>
        </div>
      </div>

      {/* Audio File Selector */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {interviews.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setSelectedInterview(item);
              setEditedText(item.editedTranscript);
            }}
            className={`p-3.5 rounded-2xl border text-left transition cursor-pointer whitespace-nowrap min-w-[220px] ${
              selectedInterview.id === item.id
                ? "bg-white border-slate-900 shadow-sm ring-2 ring-slate-900/10"
                : "bg-white/60 border-white/80 hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">{item.status}</span>
              <span className="flex items-center gap-1 font-semibold"><Clock className="w-3 h-3" /> {item.audioDuration}</span>
            </div>
            <p className="text-xs font-extrabold text-slate-800 truncate">{item.title}</p>
          </button>
        ))}
      </div>

      {/* Main Grid: Auto Transcript vs Journalist Edit */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left: Audio Player & Auto Transcript */}
        <div className="md:col-span-6 glass-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">자동 받아쓰기</span>
            <span className="text-xs text-slate-400 font-semibold">AI 원음 음성변환 결과</span>
          </div>

          {/* Audio Player Bar */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/60 flex items-center justify-between gap-3">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-10 h-10 rounded-full bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center transition shadow-xs cursor-pointer"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5 text-slate-200" />}
            </button>

            <div className="flex-1 space-y-1">
              <div className="flex justify-between text-xs text-slate-600 font-bold">
                <span>{isPlayingTime}</span>
                <span>{selectedInterview.audioDuration}</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-slate-900 h-full w-[35%]" />
              </div>
            </div>

            <Volume2 className="w-4 h-4 text-slate-400" />
          </div>

          {/* Auto Transcript Text View */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 block">원음 자동 받아쓰기 (타임스탬프 연결)</label>
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 min-h-[300px] text-xs text-slate-800 leading-relaxed space-y-3 font-mono whitespace-pre-wrap">
              {selectedInterview.autoTranscript}
            </div>
          </div>
        </div>

        {/* Right: Journalist Edit Panel */}
        <div className="md:col-span-6 glass-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-slate-900" />
              <span className="text-xs font-extrabold text-slate-900">확인·수정본 (편집 가능)</span>
            </div>
            <span className="text-xs text-slate-900 font-bold bg-slate-100 px-2.5 py-0.5 rounded-md">
              기자 최종 확인
            </span>
          </div>

          <p className="text-xs text-slate-500 font-semibold">
            자동 받아쓰기 내용 중 오탈자나 명사, 인용구를 기자가 직접 교정합니다.
          </p>

          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full min-h-[350px] p-4 text-xs font-sans leading-relaxed text-slate-900 bg-white/60 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-slate-800 transition shadow-inner"
          />

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-400 font-semibold">수정 완료 후 '기사로 돌아가기' 클릭</span>
            <button
              onClick={handleSaveAndReturn}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle className="w-4 h-4 text-slate-200" />
              확인·수정본 확정 및 기사 반영
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
