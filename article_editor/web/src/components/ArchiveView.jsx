import React, { useState } from "react";
import { 
  FolderArchive, 
  FileText, 
  Search, 
  Mic, 
  Image as ImageIcon, 
  Sparkles, 
  History, 
  FolderOpen
} from "lucide-react";
import { initialArticles, mockSources, mockInterviews } from "../data/mockData";

export default function ArchiveView() {
  const [selectedArticle, setSelectedArticle] = useState(initialArticles[0]);
  const [selectedTab, setSelectedTab] = useState("all"); // all | draft | published

  const filteredArticles = initialArticles.filter((art) => {
    if (selectedTab === "draft") return art.status === "작성 중";
    if (selectedTab === "published") return art.status === "발행본";
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6 animate-float-in">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 glass-card p-5 shadow-xs">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <FolderArchive className="w-5 h-5 text-slate-800" />
            기사 중심 통합 보관함
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            파편화된 파일 중심이 아닌, 하나의 '기사'를 중심으로 취재자료, 녹취, 사진, 변환 콘텐츠, 발행 이력을 통합 관리합니다.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white/50 backdrop-blur-md p-1 rounded-xl text-xs font-semibold border border-white/80">
          <button
            onClick={() => setSelectedTab("all")}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              selectedTab === "all" ? "bg-slate-900 text-white shadow-xs font-extrabold" : "text-slate-600"
            }`}
          >
            전체 기사
          </button>
          <button
            onClick={() => setSelectedTab("draft")}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              selectedTab === "draft" ? "bg-slate-900 text-white shadow-xs font-extrabold" : "text-slate-600"
            }`}
          >
            작성 중
          </button>
          <button
            onClick={() => setSelectedTab("published")}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              selectedTab === "published" ? "bg-slate-900 text-white shadow-xs font-extrabold" : "text-slate-600"
            }`}
          >
            발행본
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Article List */}
        <div className="lg:col-span-4 space-y-3">
          <label className="text-xs font-extrabold text-slate-800 block">기사 선택 (기사 중심 보기)</label>

          <div className="space-y-3">
            {filteredArticles.map((art) => (
              <div
                key={art.id}
                onClick={() => setSelectedArticle(art)}
                className={`p-4 rounded-2xl border transition cursor-pointer ${
                  selectedArticle.id === art.id
                    ? "bg-white border-slate-900 ring-2 ring-slate-900/10 shadow-sm"
                    : "bg-white/60 border-white/80 hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between text-[11px] mb-1.5 font-semibold">
                  <span className={`px-2 py-0.5 rounded-md font-bold ${
                    art.status === "작성 중" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
                  }`}>
                    {art.status}
                  </span>
                  <span className="text-slate-400">{art.updatedAt}</span>
                </div>

                <h4 className="text-sm font-extrabold text-slate-900 line-clamp-1">{art.title}</h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{art.subtitle}</p>

                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-400 font-semibold">
                  <span>취재자료: {art.linkedSources.length}건</span>
                  <span>|</span>
                  <span>녹취: {art.linkedInterviews.length}건</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Article Tree View */}
        <div className="lg:col-span-8 glass-card p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold bg-slate-100 text-slate-900 px-2.5 py-1 rounded-lg">
                선택된 기사 패키지
              </span>
              <span className="text-xs text-slate-400 font-semibold">ID: {selectedArticle.id}</span>
            </div>
            <h3 className="text-xl font-extrabold text-slate-900">{selectedArticle.title}</h3>
            <p className="text-xs text-slate-600 font-bold">{selectedArticle.subtitle}</p>
          </div>

          {/* Integrated Asset Tree */}
          <div className="space-y-4">
            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4 text-slate-900" />
              연결된 통합 작업물 구조 (원고 / 취재자료 / 인터뷰 / 사진 / 변환본 / 이력)
            </h4>

            <div className="space-y-3 pl-2 border-l-2 border-slate-200">
              {/* 1. 원고 (Master) */}
              <div className="p-3 bg-white/80 rounded-xl border border-slate-200/60 flex items-start gap-3">
                <FileText className="w-4 h-4 text-slate-800 mt-0.5 flex-shrink-0" />
                <div className="text-xs space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">원고 (원본 Master)</span>
                    <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-bold">최신 버전</span>
                  </div>
                  <p className="text-slate-600 line-clamp-2">{selectedArticle.content}</p>
                </div>
              </div>

              {/* 2. 취재자료 (Source) */}
              <div className="p-3 bg-white/80 rounded-xl border border-slate-200/60 flex items-start gap-3">
                <Search className="w-4 h-4 text-slate-800 mt-0.5 flex-shrink-0" />
                <div className="text-xs space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">취재자료 ({selectedArticle.linkedSources.length}건)</span>
                    <span className="text-[10px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-bold">공식 출처</span>
                  </div>
                  {selectedArticle.linkedSources.map((srcId) => {
                    const src = mockSources.find((s) => s.id === srcId);
                    return src ? (
                      <div key={src.id} className="text-slate-700 font-semibold">
                        • [{src.category}] {src.title}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>

              {/* 3. 인터뷰·녹취 (Interview) */}
              <div className="p-3 bg-white/80 rounded-xl border border-slate-200/60 flex items-start gap-3">
                <Mic className="w-4 h-4 text-slate-800 mt-0.5 flex-shrink-0" />
                <div className="text-xs space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">인터뷰·녹취 전사본</span>
                    <span className="text-[10px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-bold">확인·수정본</span>
                  </div>
                  {mockInterviews[0] && (
                    <p className="text-slate-700 font-semibold">• {mockInterviews[0].title} ({mockInterviews[0].audioDuration})</p>
                  )}
                </div>
              </div>

              {/* 4. 사진·영상 (Media) */}
              <div className="p-3 bg-white/80 rounded-xl border border-slate-200/60 flex items-start gap-3">
                <ImageIcon className="w-4 h-4 text-slate-800 mt-0.5 flex-shrink-0" />
                <div className="text-xs space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">사진·미디어 ({selectedArticle.photos.length}건)</span>
                    <span className="text-[10px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-bold">동아일보 규격</span>
                  </div>
                  {selectedArticle.photos.map((p) => (
                    <div key={p.id} className="text-slate-700">
                      • 캡션: {p.caption} (출처: {p.source})
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. 카드뉴스/영상 */}
              <div className="p-3 bg-white/80 rounded-xl border border-slate-200/60 flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-slate-800 mt-0.5 flex-shrink-0" />
                <div className="text-xs space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">편집·변환본 (카드뉴스 / 숏폼)</span>
                    <span className="text-[10px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-bold">자동 변환</span>
                  </div>
                  <p className="text-slate-700">• 카드뉴스 3장 생성 완료 및 숏폼 스크립트 작성됨</p>
                </div>
              </div>

              {/* 6. 발행 이력 */}
              <div className="p-3 bg-white/80 rounded-xl border border-slate-200/60 flex items-start gap-3">
                <History className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">발행 이력 및 타임라인</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">히스토리</span>
                  </div>
                  <p className="text-slate-600">• 2026-10-01 14:30 AI 초안 생성 -&gt; 16:20 팩트체크 검증 완료</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
