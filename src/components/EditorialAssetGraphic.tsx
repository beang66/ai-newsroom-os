import React from 'react';
import { AspectRatioType } from '../types';

interface EditorialAssetGraphicProps {
  variant: 'energy_substation' | 'interview_portrait' | 'investigation_desk';
  aspectRatio?: AspectRatioType;
  className?: string;
}

export const EditorialAssetGraphic: React.FC<EditorialAssetGraphicProps> = ({
  variant,
  aspectRatio = '16:9',
  className = '',
}) => {
  const aspectClass =
    aspectRatio === '16:9'
      ? 'aspect-video'
      : aspectRatio === '4:3'
      ? 'aspect-[4/3]'
      : 'aspect-square';

  if (variant === 'interview_portrait') {
    return (
      <div
        className={`relative overflow-hidden bg-slate-900 border border-[#E3E6E9] flex items-center justify-center ${aspectClass} ${className}`}
        role="img"
        aria-label="한국전력 조진우 송변전계획처장 인터뷰 사진"
      >
        <svg
          viewBox="0 0 400 400"
          className="w-full h-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="grad-portrait" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1E293B" />
              <stop offset="50%" stopColor="#0F172A" />
              <stop offset="100%" stopColor="#090D16" />
            </linearGradient>
            <radialGradient id="rim-light" cx="70%" cy="30%" r="60%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#0F172A" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="400" height="400" fill="url(#grad-portrait)" />
          <rect width="400" height="400" fill="url(#rim-light)" />

          {/* Minimalist journalistic silhouette & office ambient */}
          <circle cx="200" cy="150" r="64" fill="#334155" opacity="0.9" />
          <path
            d="M 110 340 C 110 240, 290 240, 290 340 Z"
            fill="#1E293B"
            stroke="#475569"
            strokeWidth="1.5"
          />
          <path
            d="M 170 145 Q 200 170 230 145"
            stroke="#64748B"
            strokeWidth="2"
            fill="none"
          />
          <circle cx="185" cy="140" r="4" fill="#94A3B8" />
          <circle cx="215" cy="140" r="4" fill="#94A3B8" />

          {/* Microphone representation */}
          <rect x="192" y="270" width="16" height="36" rx="8" fill="#64748B" />
          <path d="M 184 285 Q 200 310 216 285" stroke="#94A3B8" strokeWidth="2" fill="none" />
          <line x1="200" y1="306" x2="200" y2="330" stroke="#94A3B8" strokeWidth="2" />
        </svg>

        <div className="absolute bottom-2 left-2 text-[11px] text-slate-400 font-mono tracking-tight bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
          취재 녹취 · 조진우 송변전계획처장
        </div>
      </div>
    );
  }

  if (variant === 'investigation_desk') {
    return (
      <div
        className={`relative overflow-hidden bg-slate-100 border border-[#E3E6E9] flex items-center justify-center ${aspectClass} ${className}`}
        role="img"
        aria-label="취재 조사 보고서 및 녹취 기록"
      >
        <svg
          viewBox="0 0 400 300"
          className="w-full h-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="400" height="300" fill="#F1F5F9" />
          {/* Desk surface line */}
          <rect x="30" y="40" width="220" height="230" rx="4" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
          {/* Document lines */}
          <line x1="50" y1="70" x2="160" y2="70" stroke="#0F172A" strokeWidth="4" />
          <line x1="50" y1="95" x2="220" y2="95" stroke="#94A3B8" strokeWidth="2" />
          <line x1="50" y1="115" x2="210" y2="115" stroke="#94A3B8" strokeWidth="2" />
          <line x1="50" y1="135" x2="190" y2="135" stroke="#94A3B8" strokeWidth="2" />
          
          {/* Highlighter accent in amber */}
          <rect x="48" y="150" width="150" height="12" fill="#FDE68A" opacity="0.75" />
          <line x1="50" y1="156" x2="195" y2="156" stroke="#475569" strokeWidth="2" />
          
          <line x1="50" y1="180" x2="220" y2="180" stroke="#CBD5E1" strokeWidth="1.5" />
          <line x1="50" y1="200" x2="180" y2="200" stroke="#CBD5E1" strokeWidth="1.5" />

          {/* Sticky note */}
          <rect x="220" y="70" width="130" height="120" rx="2" fill="#FEF08A" stroke="#FACC15" strokeWidth="1" />
          <line x1="235" y1="95" x2="330" y2="95" stroke="#854D0E" strokeWidth="2" />
          <line x1="235" y1="115" x2="315" y2="115" stroke="#854D0E" strokeWidth="2" />
          <line x1="235" y1="135" x2="300" y2="135" stroke="#854D0E" strokeWidth="1.5" />
        </svg>

        <div className="absolute bottom-2 left-2 text-[11px] text-slate-600 font-mono tracking-tight bg-white/90 px-2 py-0.5 rounded border border-slate-200">
          산업부 장기계획 보고서 대조 자료
        </div>
      </div>
    );
  }

  // Energy substation variant (Default)
  return (
    <div
      className={`relative overflow-hidden bg-slate-900 border border-[#E3E6E9] flex items-center justify-center ${aspectClass} ${className}`}
      role="img"
      aria-label="동해안 500kV HVDC 송전선로 및 변환소 현장"
    >
      <svg
        viewBox="0 0 640 360"
        className="w-full h-full object-cover"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="sky-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0B132B" />
            <stop offset="60%" stopColor="#1C2541" />
            <stop offset="100%" stopColor="#3A506B" />
          </linearGradient>
        </defs>
        <rect width="640" height="360" fill="url(#sky-grad)" />

        {/* Transmission Tower & Grid Lines */}
        <g stroke="#94A3B8" strokeWidth="1.5" opacity="0.85">
          {/* Main Tower Center-Left */}
          <line x1="240" y1="40" x2="190" y2="320" strokeWidth="2.5" />
          <line x1="240" y1="40" x2="290" y2="320" strokeWidth="2.5" />
          <line x1="160" y1="90" x2="320" y2="90" strokeWidth="2" />
          <line x1="140" y1="140" x2="340" y2="140" strokeWidth="2" />
          <line x1="170" y1="210" x2="310" y2="210" strokeWidth="2" />

          {/* Cross braces */}
          <line x1="215" y1="90" x2="265" y2="140" />
          <line x1="265" y1="90" x2="215" y2="140" />
          <line x1="205" y1="140" x2="275" y2="210" />
          <line x1="275" y1="140" x2="205" y2="210" />
          <line x1="195" y1="210" x2="285" y2="320" />
          <line x1="285" y1="210" x2="195" y2="320" />

          {/* High Voltage Lines across landscape */}
          <path d="M 0 110 Q 150 170 240 90 T 480 130 T 640 100" fill="none" strokeWidth="1.5" stroke="#CBD5E1" opacity="0.6" />
          <path d="M 0 160 Q 150 210 240 140 T 480 180 T 640 150" fill="none" strokeWidth="1.5" stroke="#94A3B8" opacity="0.5" />
          <path d="M 0 230 Q 170 270 240 210 T 500 240 T 640 220" fill="none" strokeWidth="1.2" stroke="#64748B" opacity="0.4" />
        </g>

        {/* Substation ground facility silhouettes */}
        <rect x="0" y="300" width="640" height="60" fill="#0A0E17" />
        <rect x="360" y="240" width="70" height="60" fill="#1E293B" stroke="#334155" strokeWidth="1" />
        <rect x="445" y="220" width="90" height="80" fill="#15202B" stroke="#334155" strokeWidth="1" />
        <line x1="395" y1="200" x2="395" y2="240" stroke="#64748B" strokeWidth="2" />
        <circle cx="395" cy="195" r="5" fill="#EF4444" opacity="0.9" />
      </svg>

      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-xs text-[11px] text-slate-300 font-mono px-2 py-0.5 rounded border border-white/10">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        현장 실사 · 500kV HVDC 동해안 변환소
      </div>
    </div>
  );
};
