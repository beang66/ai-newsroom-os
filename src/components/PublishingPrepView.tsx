import React, { useState } from 'react';
import {
  Monitor,
  Smartphone,
  ExternalLink,
  Sparkles,
  Check,
  RotateCcw,
  ArrowRight,
  Info,
  Clock,
  User,
  Share2,
  FileCheck,
  AlertCircle,
} from 'lucide-react';
import { useNewsroom } from '../context/NewsroomContext';
import { EditorialAssetGraphic } from './EditorialAssetGraphic';

export const PublishingPrepView: React.FC = () => {
  const {
    article,
    applySuggestedTitle,
    applySuggestedExcerpt,
    exportArticleFile,
  } = useNewsroom();

  const [deviceMode, setDeviceMode] = useState<'pc' | 'mobile'>('pc');

  const paragraphs = article.content.split('\n\n');

  return (
    <div className="flex-1 flex flex-col bg-[#F6F7F8] overflow-hidden select-none">
      {/* Top Bar: Viewport Switcher & Meta Proposal Bar */}
      <div className="bg-white border-b border-[#E3E6E9] px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-[#20252C]">
            발행 준비 및 최종 기사 미리보기
          </h2>
          <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-mono">
            내보낸 결과물 · 발행 여부 미확인 (CMS 미연동)
          </span>
        </div>

        {/* Device Viewport Toggle (PC vs Mobile) */}
        <div className="flex items-center gap-1 bg-[#F6F7F8] p-1 rounded-lg border border-[#E3E6E9]">
          <button
            onClick={() => setDeviceMode('pc')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
              deviceMode === 'pc'
                ? 'bg-white text-[#2457D6] shadow-xs font-bold'
                : 'text-[#626C78] hover:text-[#20252C]'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>데스크톱 PC (720px)</span>
          </button>
          <button
            onClick={() => setDeviceMode('mobile')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
              deviceMode === 'mobile'
                ? 'bg-white text-[#2457D6] shadow-xs font-bold'
                : 'text-[#626C78] hover:text-[#20252C]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>모바일 뷰 (375px)</span>
          </button>
        </div>
      </div>

      {/* Main Container: Split layout with Left Preview & Right Auxiliary Suggestions */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col xl:flex-row gap-6 items-start justify-center">
        {/* Editorial Preview Frame */}
        <div
          className={`bg-white border border-[#E3E6E9] rounded-lg shadow-sm transition-all duration-200 overflow-hidden flex flex-col ${
            deviceMode === 'pc'
              ? 'w-full max-w-[760px]'
              : 'w-[375px] max-w-full mx-auto ring-8 ring-slate-800 rounded-3xl my-2'
          }`}
        >
          {/* Mobile phone mock notch bar */}
          {deviceMode === 'mobile' && (
            <div className="h-6 bg-slate-800 w-full flex items-center justify-between px-6 text-[10px] text-white/70 font-mono">
              <span>09:41</span>
              <div className="w-16 h-3 bg-black rounded-full" />
              <span>5G</span>
            </div>
          )}

          {/* Reader Article View */}
          <div className="p-6 md:p-10 space-y-6 select-text">
            {/* Header category & time */}
            <div className="flex items-center justify-between text-xs text-[#626C78] pb-3 border-b border-slate-100">
              <span className="font-semibold text-[#2457D6]">{article.category}</span>
              <span className="font-mono tabular-nums">{article.lastSavedAt.slice(0, 10)}</span>
            </div>

            {/* Headline */}
            <h1
              className={`font-bold text-[#20252C] leading-tight tracking-tight ${
                deviceMode === 'pc' ? 'text-[28px] md:text-[32px]' : 'text-[22px]'
              }`}
            >
              {article.title}
            </h1>

            {/* Subtitle */}
            <p className="text-[16px] text-[#626C78] leading-relaxed">
              {article.subtitle}
            </p>

            {/* Byline */}
            <div className="flex items-center gap-2 text-xs text-slate-500 py-2 border-y border-slate-100">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>{article.byline}</span>
            </div>

            {/* Featured Image */}
            <div className="space-y-2">
              <div className="rounded-lg overflow-hidden border border-[#E3E6E9] bg-slate-900">
                <EditorialAssetGraphic
                  variant="energy_substation"
                  aspectRatio={article.featuredImage.aspectRatio}
                />
              </div>
              <div className="text-[11px] text-[#626C78] leading-snug">
                {article.featuredImage.caption}{' '}
                <span className="text-slate-400 font-mono">
                  [{article.featuredImage.credit}]
                </span>
              </div>
            </div>

            {/* Body Paragraphs */}
            <div className="space-y-5 pt-2 text-[#20252C] editorial-body">
              {paragraphs.map((para, idx) => (
                <p key={idx} className="leading-[1.8]">
                  {para}
                </p>
              ))}
            </div>

            {/* End of article notice */}
            <div className="pt-6 border-t border-slate-200 text-center text-xs text-slate-400">
              기사 끝 · AI-Newsroom OS 데스크 최종본
            </div>
          </div>
        </div>

        {/* Right Sidebar: Auxiliary proposals (가제 / 소개문) */}
        <div className="w-full xl:w-[380px] space-y-4 shrink-0">
          {/* Headline Suggestions (가제 제안) */}
          <div className="bg-white p-4 rounded-lg border border-[#E3E6E9] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-[#20252C]">
                <Sparkles className="w-3.5 h-3.5 text-[#2457D6]" />
                <span>가제(제목) 대안 제안</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">선택형 보조 제안</span>
            </div>
            <p className="text-[11px] text-[#626C78]">
              원문을 덮어쓰지 않는 보조 제안입니다. 적용 시에만 현재 원고 제목이 변경됩니다.
            </p>

            <div className="space-y-2.5">
              {article.suggestedTitles.map(st => (
                <div
                  key={st.id}
                  className="p-3 rounded-lg border border-slate-200 bg-[#F6F7F8] space-y-2"
                >
                  <div className="font-semibold text-xs text-[#20252C] leading-snug">
                    "{st.title}"
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    스타일: {st.style}
                  </div>
                  <button
                    onClick={() => applySuggestedTitle(st.id)}
                    className="w-full py-1.5 bg-white hover:bg-blue-50 text-[#2457D6] border border-[#2457D6]/40 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    <span>이 가제로 원문 제목 변경</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Excerpt Suggestions (소개문 제안) */}
          <div className="bg-white p-4 rounded-lg border border-[#E3E6E9] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-[#20252C]">
                <Sparkles className="w-3.5 h-3.5 text-[#2457D6]" />
                <span>포털·알림용 소개문 제안</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">선택형 보조 제안</span>
            </div>

            <div className="space-y-2.5">
              {article.suggestedExcerpts.map(se => (
                <div
                  key={se.id}
                  className="p-3 rounded-lg border border-slate-200 bg-[#F6F7F8] space-y-2"
                >
                  <p className="text-xs text-[#20252C] leading-relaxed font-serif">
                    {se.text}
                  </p>
                  <div className="text-[10px] text-slate-500 font-mono">
                    용도: {se.style}
                  </div>
                  <button
                    onClick={() => applySuggestedExcerpt(se.id)}
                    className="w-full py-1.5 bg-white hover:bg-blue-50 text-[#2457D6] border border-[#2457D6]/40 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    <span>원문 부제로 반영</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Export Action Card */}
          <div className="bg-white p-4 rounded-lg border border-[#E3E6E9] shadow-xs space-y-3">
            <h3 className="text-xs font-semibold text-[#20252C]">발행 원고 패키지 내보내기</h3>
            <p className="text-[11px] text-[#626C78]">
              실제 CMS 연동 전, 완성된 기사와 취재 메타데이터를 표준 파일 형식으로 다운로드합니다.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportArticleFile('txt')}
                className="flex-1 py-2 bg-[#2457D6] hover:bg-[#1D46AF] text-white rounded text-xs font-medium transition-colors text-center"
              >
                원고 텍스트 (.txt) 저장
              </button>
              <button
                onClick={() => exportArticleFile('json')}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors text-center"
              >
                취재 데이터 (.json) 저장
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
