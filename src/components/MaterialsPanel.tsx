import React, { useState } from 'react';
import { 
  FileText, 
  Mic, 
  FileCode, 
  Upload, 
  Plus, 
  ExternalLink, 
  Search, 
  CheckCircle2, 
  Clock, 
  FileSpreadsheet, 
  Filter,
  ChevronRight,
  ChevronDown,
  Image as ImageIcon,
  Camera,
  PlusCircle
} from 'lucide-react';
import { MaterialItem, MaterialType } from '../types';

interface MaterialsPanelProps {
  materials: MaterialItem[];
  selectedMaterialId: string | null;
  onSelectMaterial: (material: MaterialItem) => void;
  onAddSource: () => void;
  onUploadFile: () => void;
  onUploadAudio: () => void;
  onUploadImage?: () => void;
  onInsertImageNode?: (material: MaterialItem) => void;
}

export const MaterialsPanel: React.FC<MaterialsPanelProps> = ({
  materials,
  selectedMaterialId,
  onSelectMaterial,
  onAddSource,
  onUploadFile,
  onUploadAudio,
  onUploadImage,
  onInsertImageNode,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (sec: string) => {
    setCollapsedSections(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  const filteredMaterials = materials.filter(m => {
    const matchesType = filterType === 'all' || m.type === filterType;
    const matchesSearch = searchQuery === '' || 
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.outletOrSpeaker.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const sourcesList = filteredMaterials.filter(m => m.type === 'source');
  const imageList = filteredMaterials.filter(m => m.type === 'image');
  const audioList = filteredMaterials.filter(m => m.type === 'audio');
  const transcriptList = filteredMaterials.filter(m => m.type === 'transcript');
  const filesList = filteredMaterials.filter(m => m.type === 'file');

  const getStatusBadge = (status: MaterialItem['status']) => {
    switch (status) {
      case 'Verified':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-xs text-[10pt] font-mono-code font-semibold bg-[#edf7f7] text-[#006b6e] border border-[#bce3e4]">
            검증 완료
          </span>
        );
      case 'Processed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-xs text-[10pt] font-mono-code font-medium bg-neutral-100 text-black border border-neutral-200">
            처리 완료
          </span>
        );
      case 'Indexed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-xs text-[10pt] font-mono-code font-medium bg-neutral-100 text-black border border-neutral-200">
            색인 완료
          </span>
        );
      case 'Transcribing...':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-xs text-[10pt] font-mono-code font-medium bg-[#edf7f7] text-[#008285] border border-[#bce3e4]">
            전사 중...
          </span>
        );
      case 'Analyzing':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-xs text-[10pt] font-mono-code font-medium bg-[#edf7f7] text-[#008285] border border-[#bce3e4]">
            분석 중
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-xs text-[10pt] font-mono-code font-medium bg-neutral-100 text-black border border-neutral-200">
            {status}
          </span>
        );
    }
  };

  const getTypeIcon = (type: MaterialType) => {
    switch (type) {
      case 'source':
        return <FileText className="w-4 h-4 text-black shrink-0" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-[#008285] shrink-0" />;
      case 'audio':
        return <Mic className="w-4 h-4 text-black shrink-0" />;
      case 'transcript':
        return <FileCode className="w-4 h-4 text-black shrink-0" />;
      case 'file':
        return <FileSpreadsheet className="w-4 h-4 text-black shrink-0" />;
    }
  };

  const renderMaterialCard = (item: MaterialItem) => {
    const isSelected = selectedMaterialId === item.id;
    return (
      <div
        key={item.id}
        id={`material-item-${item.id}`}
        className={`w-full text-left p-3 rounded-xs border transition-all mb-2 group ${
          isSelected
            ? 'bg-[#edf7f7] border-[#008285] ring-1 ring-[#008285]'
            : 'bg-white border-neutral-200 hover:border-[#008285] hover:bg-neutral-50/50'
        }`}
      >
        <button
          onClick={() => onSelectMaterial(item)}
          className="w-full text-left cursor-pointer"
        >
          <div className="flex items-start justify-between gap-1.5 mb-1">
            <div className="flex items-center space-x-1.5 min-w-0">
              {getTypeIcon(item.type)}
              <span className="font-semibold text-[10.5pt] text-black truncate group-hover:text-[#008285] transition-colors">
                {item.title}
              </span>
            </div>
          </div>

          {/* Image Thumbnail Preview for image materials */}
          {item.type === 'image' && item.imageUrl && (
            <div className="relative my-2 h-24 w-full rounded-xs overflow-hidden bg-neutral-900 border border-neutral-200 shadow-2xs">
              <img 
                src={item.imageUrl} 
                alt={item.title} 
                className="w-full h-full object-cover transition-transform group-hover:scale-105" 
                referrerPolicy="no-referrer" 
              />
              <span className="absolute bottom-1 right-1 bg-black/80 backdrop-blur-2xs text-white text-[9pt] px-1.5 py-0.5 rounded-xs font-mono-code">
                {item.dimensions || '사진'}
              </span>
              {item.photoCredit && (
                <span className="absolute top-1 left-1 bg-black/75 text-white text-[8.5pt] px-1.5 py-0.5 rounded-xs font-mono-code truncate max-w-[80%]">
                  {item.photoCredit}
                </span>
              )}
            </div>
          )}

          <p className="text-[10pt] text-neutral-600 truncate mb-1.5 font-medium">
            {item.outletOrSpeaker}
          </p>

          <div className="flex items-center justify-between text-[10pt] text-neutral-500 font-mono-code">
            <span>{item.durationOrPages || item.fileSize || item.date}</span>
            <div>{getStatusBadge(item.status)}</div>
          </div>
        </button>

        {/* Action to quickly insert image into story */}
        {item.type === 'image' && onInsertImageNode && (
          <div className="mt-2 pt-1.5 border-t border-neutral-100 flex items-center justify-end">
            <button
              onClick={() => onInsertImageNode(item)}
              className="text-[9.5pt] font-mono-code text-[#006b6e] hover:text-white font-semibold flex items-center space-x-1 px-2.5 py-1 rounded-xs bg-[#edf7f7] hover:bg-[#008285] border border-[#bce3e4] transition-colors cursor-pointer"
              title="현재 기사 본문에 이 보도 사진 노드 삽입"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>기사에 사진 삽입</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside 
      className="w-[290px] shrink-0 border-r border-neutral-200 bg-white flex flex-col h-[calc(100vh-3.25rem)] select-none text-[10.5pt]"
      aria-label="취재 자료 및 근거 패널"
    >
      {/* Top Header & Actions */}
      <div className="p-3 border-b border-neutral-200 bg-white">
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <h2 className="font-semibold text-[11pt] text-black uppercase tracking-wider font-mono-code flex items-center space-x-1.5">
              <span>취재 자료</span>
              <span className="text-[#008285] font-bold">({materials.length})</span>
            </h2>
            <p className="text-[10pt] text-neutral-500">증거 문서, 보도 사진 및 음성</p>
          </div>
        </div>

        {/* Action Buttons: Add Source, Upload File, Upload Image, Upload Audio */}
        <div className="grid grid-cols-4 gap-1 mb-2.5">
          <button
            id="btn-add-source"
            onClick={onAddSource}
            className="flex flex-col items-center justify-center p-1.5 rounded-xs border border-neutral-200 bg-white hover:border-[#008285] hover:text-[#008285] text-black text-[9.5pt] font-medium transition-colors cursor-pointer"
            title="웹 출처 또는 공문서 추가"
          >
            <Plus className="w-3.5 h-3.5 mb-0.5 text-black" />
            <span>출처</span>
          </button>

          <button
            id="btn-upload-image"
            onClick={onUploadImage || onUploadFile}
            className="flex flex-col items-center justify-center p-1.5 rounded-xs border border-[#bce3e4] bg-[#edf7f7] hover:bg-[#008285] hover:text-white text-[#006b6e] text-[9.5pt] font-semibold transition-colors cursor-pointer group"
            title="보도 사진 및 취재 이미지 등록"
          >
            <Camera className="w-3.5 h-3.5 mb-0.5 text-[#008285] group-hover:text-white" />
            <span>사진</span>
          </button>

          <button
            id="btn-upload-file"
            onClick={onUploadFile}
            className="flex flex-col items-center justify-center p-1.5 rounded-xs border border-neutral-200 bg-white hover:border-[#008285] hover:text-[#008285] text-black text-[9.5pt] font-medium transition-colors cursor-pointer"
            title="PDF 공문서, 보고서 또는 데이터셋 업로드"
          >
            <Upload className="w-3.5 h-3.5 mb-0.5 text-black" />
            <span>파일</span>
          </button>

          <button
            id="btn-upload-audio"
            onClick={onUploadAudio}
            className="flex flex-col items-center justify-center p-1.5 rounded-xs border border-neutral-200 bg-white hover:border-[#008285] hover:text-[#008285] text-black text-[9.5pt] font-medium transition-colors cursor-pointer"
            title="인터뷰 녹음 또는 음성 파일 업로드"
          >
            <Mic className="w-3.5 h-3.5 mb-0.5 text-black" />
            <span>음성</span>
          </button>
        </div>

        {/* Search within materials */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="자료 및 보도 사진 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-neutral-200 rounded-xs text-[10.5pt] text-black placeholder-neutral-400 focus:outline-none focus:border-[#008285]"
          />
        </div>
      </div>

      {/* Materials List Sections */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3 bg-white">
        {/* Section: Photos / Images */}
        <div>
          <button
            onClick={() => toggleSection('images')}
            className="w-full flex items-center justify-between text-[10pt] font-mono-code font-semibold text-black uppercase tracking-wider py-1.5 px-1 hover:text-[#008285] cursor-pointer"
          >
            <span className="flex items-center space-x-1">
              {collapsedSections['images'] ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>보도 사진 / 취재 이미지</span>
              <span className="text-[#008285] ml-1">({imageList.length})</span>
            </span>
          </button>
          {!collapsedSections['images'] && (
            <div className="mt-1">
              {imageList.length > 0 ? (
                imageList.map(renderMaterialCard)
              ) : (
                <div className="p-2.5 text-center text-neutral-400 text-[10pt] border border-dashed border-neutral-200 rounded-xs">
                  등록된 보도 사진이 없습니다
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section: Sources */}
        <div>
          <button
            onClick={() => toggleSection('sources')}
            className="w-full flex items-center justify-between text-[10pt] font-mono-code font-semibold text-black uppercase tracking-wider py-1.5 px-1 hover:text-[#008285] cursor-pointer"
          >
            <span className="flex items-center space-x-1">
              {collapsedSections['sources'] ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>공식 출처 / 문서 ({sourcesList.length})</span>
            </span>
          </button>
          {!collapsedSections['sources'] && (
            <div className="mt-1">
              {sourcesList.length > 0 ? (
                sourcesList.map(renderMaterialCard)
              ) : (
                <div className="p-2.5 text-center text-neutral-400 text-[10pt] border border-dashed border-neutral-200 rounded-xs">
                  등록된 출처 문서가 없습니다
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section: Audio */}
        <div>
          <button
            onClick={() => toggleSection('audio')}
            className="w-full flex items-center justify-between text-[10pt] font-mono-code font-semibold text-black uppercase tracking-wider py-1.5 px-1 hover:text-[#008285] cursor-pointer"
          >
            <span className="flex items-center space-x-1">
              {collapsedSections['audio'] ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>취재 녹음 파일 ({audioList.length})</span>
            </span>
          </button>
          {!collapsedSections['audio'] && (
            <div className="mt-1">
              {audioList.length > 0 ? (
                audioList.map(renderMaterialCard)
              ) : (
                <div className="p-2.5 text-center text-neutral-400 text-[10pt] border border-dashed border-neutral-200 rounded-xs">
                  등록된 녹음 파일이 없습니다
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section: Transcripts */}
        <div>
          <button
            onClick={() => toggleSection('transcripts')}
            className="w-full flex items-center justify-between text-[10pt] font-mono-code font-semibold text-black uppercase tracking-wider py-1.5 px-1 hover:text-[#008285] cursor-pointer"
          >
            <span className="flex items-center space-x-1">
              {collapsedSections['transcripts'] ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>인터뷰 / 속기록 ({transcriptList.length})</span>
            </span>
          </button>
          {!collapsedSections['transcripts'] && (
            <div className="mt-1">
              {transcriptList.length > 0 ? (
                transcriptList.map(renderMaterialCard)
              ) : (
                <div className="p-2.5 text-center text-neutral-400 text-[10pt] border border-dashed border-neutral-200 rounded-xs">
                  색인된 속기록이 없습니다
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section: Uploaded Files */}
        <div>
          <button
            onClick={() => toggleSection('files')}
            className="w-full flex items-center justify-between text-[10pt] font-mono-code font-semibold text-black uppercase tracking-wider py-1.5 px-1 hover:text-[#008285] cursor-pointer"
          >
            <span className="flex items-center space-x-1">
              {collapsedSections['files'] ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>업로드된 파일 ({filesList.length})</span>
            </span>
          </button>
          {!collapsedSections['files'] && (
            <div className="mt-1">
              {filesList.length > 0 ? (
                filesList.map(renderMaterialCard)
              ) : (
                <div className="p-2.5 text-center text-neutral-400 text-[10pt] border border-dashed border-neutral-200 rounded-xs">
                  등록된 파일이 없습니다
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer info */}
      <div className="p-3 border-t border-neutral-200 bg-white text-[10pt] text-neutral-500 font-mono-code flex items-center justify-between">
        <span>근거 자료 검증 상태</span>
        <span className="text-[#008285] font-semibold">100% 공식 사료 연계</span>
      </div>
    </aside>
  );
};

