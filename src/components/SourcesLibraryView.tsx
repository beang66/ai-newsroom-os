import React, { useState } from 'react';
import { 
  BookOpen, 
  Search, 
  Filter, 
  ExternalLink, 
  Plus, 
  FileText, 
  Mic, 
  FileCode, 
  FileSpreadsheet,
  CheckCircle2,
  Image as ImageIcon,
  Camera
} from 'lucide-react';
import { MaterialItem, MaterialType } from '../types';

interface SourcesLibraryViewProps {
  materials: MaterialItem[];
  onOpenPreview: (material: MaterialItem) => void;
  onAddMaterial: () => void;
}

export const SourcesLibraryView: React.FC<SourcesLibraryViewProps> = ({
  materials,
  onOpenPreview,
  onAddMaterial,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filtered = materials.filter(m => {
    const matchesType = typeFilter === 'all' || m.type === typeFilter;
    const matchesSearch = search === '' || 
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.outletOrSpeaker.toLowerCase().includes(search.toLowerCase()) ||
      m.content.toLowerCase().includes(search.toLowerCase()) ||
      (m.caption && m.caption.toLowerCase().includes(search.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const getTypeIcon = (type: MaterialType) => {
    switch (type) {
      case 'source':
        return <FileText className="w-4 h-4 text-black" />;
      case 'audio':
        return <Mic className="w-4 h-4 text-black" />;
      case 'transcript':
        return <FileCode className="w-4 h-4 text-black" />;
      case 'file':
        return <FileSpreadsheet className="w-4 h-4 text-black" />;
      case 'image':
        return <Camera className="w-4 h-4 text-[#008285]" />;
    }
  };

  return (
    <div className="flex-1 bg-white h-[calc(100vh-3.25rem)] overflow-y-auto p-8 text-[10.5pt]">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-200 mb-6">
          <div>
            <div className="text-[10pt] font-mono-code uppercase text-neutral-500 tracking-wider">
              뉴스룸 사료 아카이브
            </div>
            <h1 className="text-2xl font-bold font-editorial text-black">
              취재 증거 및 사료 라이브러리
            </h1>
          </div>
          <button
            onClick={onAddMaterial}
            className="px-3.5 py-2 bg-[#008285] hover:bg-[#006b6e] text-white rounded-xs text-[10.5pt] font-mono-code font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>사료 추가</span>
          </button>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 mb-6 bg-white p-3.5 border border-neutral-200 rounded-xs text-[10.5pt]">
          <div className="flex flex-wrap items-center gap-1.5 font-mono-code text-[10pt]">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1 rounded-xs border transition-colors cursor-pointer ${
                typeFilter === 'all'
                  ? 'bg-black text-white border-black font-semibold'
                  : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              전체 ({materials.length})
            </button>
            <button
              onClick={() => setTypeFilter('image')}
              className={`px-3 py-1 rounded-xs border transition-colors cursor-pointer ${
                typeFilter === 'image'
                  ? 'bg-[#008285] text-white border-[#008285] font-semibold'
                  : 'bg-white text-[#006b6e] border-[#bce3e4] hover:bg-[#edf7f7]'
              }`}
            >
              보도 사진 ({materials.filter(m => m.type === 'image').length})
            </button>
            <button
              onClick={() => setTypeFilter('source')}
              className={`px-3 py-1 rounded-xs border transition-colors cursor-pointer ${
                typeFilter === 'source'
                  ? 'bg-black text-white border-black font-semibold'
                  : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              공식 출처 ({materials.filter(m => m.type === 'source').length})
            </button>
            <button
              onClick={() => setTypeFilter('audio')}
              className={`px-3 py-1 rounded-xs border transition-colors cursor-pointer ${
                typeFilter === 'audio'
                  ? 'bg-black text-white border-black font-semibold'
                  : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              녹취 오디오 ({materials.filter(m => m.type === 'audio').length})
            </button>
            <button
              onClick={() => setTypeFilter('transcript')}
              className={`px-3 py-1 rounded-xs border transition-colors cursor-pointer ${
                typeFilter === 'transcript'
                  ? 'bg-black text-white border-black font-semibold'
                  : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              속기록 ({materials.filter(m => m.type === 'transcript').length})
            </button>
            <button
              onClick={() => setTypeFilter('file')}
              className={`px-3 py-1 rounded-xs border transition-colors cursor-pointer ${
                typeFilter === 'file'
                  ? 'bg-black text-white border-black font-semibold'
                  : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              문서 파일 ({materials.filter(m => m.type === 'file').length})
            </button>
          </div>

          <div className="relative w-full lg:w-64">
            <Search className="w-4 h-4 text-neutral-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="전체 사진 및 사료 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xs text-[10pt] text-black focus:outline-none focus:bg-white focus:border-[#008285]"
            />
          </div>
        </div>

        {/* Sources Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((mat) => (
            <div
              key={mat.id}
              className="p-4 bg-white border border-neutral-200 rounded-xs hover:border-black transition-all flex flex-col justify-between shadow-2xs"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center space-x-2">
                    {getTypeIcon(mat.type)}
                    <span className="font-mono-code text-[10pt] uppercase font-bold text-neutral-600">
                      {mat.type === 'source' ? '공식 출처' :
                       mat.type === 'audio' ? '녹취 오디오' :
                       mat.type === 'transcript' ? '속기록' :
                       mat.type === 'image' ? '보도 사진' : '문서 파일'}
                    </span>
                  </div>
                  <span className={`font-mono-code text-[10pt] px-2 py-0.5 rounded-xs font-semibold ${
                    mat.type === 'image' 
                      ? 'bg-[#edf7f7] text-[#006b6e] border border-[#bce3e4]' 
                      : 'bg-neutral-100 text-black border border-neutral-200'
                  }`}>
                    {mat.status === 'Processed' ? '처리 완료' :
                     mat.status === 'Indexed' ? '색인 완료' :
                     mat.status === 'Verified' ? '검증 완료' :
                     mat.status === 'Analyzing' ? '분석 중' :
                     mat.status === 'Transcribing...' ? '전사 중...' : mat.status}
                  </span>
                </div>

                {/* If image material, display prominent photo preview */}
                {mat.type === 'image' && mat.imageUrl && (
                  <div 
                    onClick={() => onOpenPreview(mat)}
                    className="relative mb-3 h-48 w-full rounded-xs overflow-hidden bg-black border border-neutral-200 cursor-pointer group shadow-2xs"
                  >
                    <img 
                      src={mat.imageUrl} 
                      alt={mat.title} 
                      className="w-full h-full object-cover transition-transform group-hover:scale-102 duration-200" 
                      referrerPolicy="no-referrer" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-90" />
                    {mat.photoCredit && (
                      <span className="absolute bottom-2 left-2 bg-black/80 text-white text-[8.5pt] font-mono-code px-2 py-0.5 rounded-xs backdrop-blur-2xs border border-white/10">
                        {mat.photoCredit}
                      </span>
                    )}
                    <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[8.5pt] font-mono-code px-2 py-0.5 rounded-xs backdrop-blur-2xs border border-white/10">
                      {mat.dimensions || mat.fileSize || '사진'}
                    </span>
                  </div>
                )}

                <h3 
                  onClick={() => onOpenPreview(mat)}
                  className="font-bold font-editorial text-[13pt] text-black hover:text-[#008285] cursor-pointer transition-colors mb-1.5 leading-snug"
                >
                  {mat.title}
                </h3>

                <p className="text-[10pt] text-neutral-500 font-mono-code mb-2">
                  {mat.outletOrSpeaker} • {mat.date} • {mat.durationOrPages || mat.fileSize || mat.dimensions}
                </p>

                {mat.caption && (
                  <p className="text-[10pt] text-black font-editorial italic bg-[#edf7f7]/50 p-2 rounded-xs border border-[#bce3e4] mb-2 leading-relaxed">
                    [캡션] {mat.caption}
                  </p>
                )}

                {mat.summary && (
                  <p className="text-[10.5pt] text-neutral-700 line-clamp-2 leading-relaxed mb-3">
                    {mat.summary}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-[10pt] font-mono-code">
                <span className="text-neutral-400">
                  {mat.type === 'image' ? (mat.dimensions ? `해상도: ${mat.dimensions}` : '보도 사진 사료') : `핵심 발췌 ${mat.excerpts?.length || 0}건 색인됨`}
                </span>
                <button
                  onClick={() => onOpenPreview(mat)}
                  className="px-3 py-1.5 bg-neutral-100 hover:bg-[#008285] hover:text-white text-black rounded-xs font-semibold transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <span>{mat.type === 'image' ? '사진 상세 및 검토' : '사료 열람 및 발췌'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
