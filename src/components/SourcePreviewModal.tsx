import React, { useState, useEffect } from 'react';
import { 
  X, 
  ExternalLink, 
  Mic, 
  FileText, 
  FileCode, 
  Play, 
  Pause, 
  Volume2, 
  Plus, 
  Quote, 
  Check, 
  FileSpreadsheet,
  Clock,
  User,
  Sparkles,
  Camera,
  Image as ImageIcon,
  Save,
  Edit3
} from 'lucide-react';
import { MaterialItem, NodeType, TranscriptExcerpt } from '../types';

interface SourcePreviewModalProps {
  material: MaterialItem | null;
  onClose: () => void;
  onAddExcerptToArticle: (type: NodeType, text: string, speaker?: string, timestamp?: string, materialId?: string) => void;
  onInsertImageToArticle?: (material: MaterialItem) => void;
  onUpdateMaterial?: (id: string, updates: Partial<MaterialItem>) => void;
}

export const SourcePreviewModal: React.FC<SourcePreviewModalProps> = ({
  material,
  onClose,
  onAddExcerptToArticle,
  onInsertImageToArticle,
  onUpdateMaterial,
}) => {
  if (!material) return null;

  // Audio player state simulation
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState('14:32');
  const [selectedCustomText, setSelectedCustomText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [imageInserted, setImageInserted] = useState(false);

  // Image editing state
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [imageTitle, setImageTitle] = useState(material.title || '');
  const [imageUrl, setImageUrl] = useState(material.imageUrl || '');
  const [imageCaption, setImageCaption] = useState(material.caption || '');
  const [imageCredit, setImageCredit] = useState(material.photoCredit || material.outletOrSpeaker || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (material) {
      setImageTitle(material.title || '');
      setImageUrl(material.imageUrl || '');
      setImageCaption(material.caption || '');
      setImageCredit(material.photoCredit || material.outletOrSpeaker || '');
      setIsEditingImage(false);
      setSavedSuccess(false);
    }
  }, [material]);

  const handleSelection = () => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      setSelectedCustomText(sel.toString().trim());
    }
  };

  const handleAdd = (type: NodeType, text: string, speaker?: string, timestamp?: string, excerptId?: string) => {
    onAddExcerptToArticle(type, text, speaker, timestamp, material.id);
    if (excerptId) {
      setCopiedId(excerptId);
      setTimeout(() => setCopiedId(null), 1800);
    }
  };

  const handleSaveImageEdits = () => {
    if (onUpdateMaterial && material) {
      onUpdateMaterial(material.id, {
        title: imageTitle,
        imageUrl: imageUrl,
        caption: imageCaption,
        photoCredit: imageCredit,
        outletOrSpeaker: imageCredit,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
      setIsEditingImage(false);
    }
  };

  const handleInsertImage = () => {
    if (onInsertImageToArticle && material) {
      onInsertImageToArticle({
        ...material,
        title: imageTitle,
        imageUrl: imageUrl,
        caption: imageCaption,
        photoCredit: imageCredit,
      });
      setImageInserted(true);
      setTimeout(() => setImageInserted(false), 2200);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex justify-end">
      <div 
        className="w-full max-w-2xl bg-white h-full shadow-2xl border-l border-neutral-200 flex flex-col animate-in slide-in-from-right duration-200"
        onMouseUp={handleSelection}
      >
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 flex items-start justify-between bg-white">
          <div>
            <div className="flex items-center space-x-2 text-[10pt] font-mono-code text-neutral-500 mb-1">
              <span className={`uppercase px-2 py-0.5 rounded-xs font-semibold ${
                material.type === 'image' 
                  ? 'bg-[#edf7f7] text-[#006b6e] border border-[#bce3e4]' 
                  : 'bg-neutral-100 text-black'
              }`}>
                {material.type === 'source' ? '공식 출처' :
                 material.type === 'audio' ? '음성 녹음' :
                 material.type === 'transcript' ? '속기록' :
                 material.type === 'image' ? '보도 사진' : '문서 파일'}
              </span>
              <span>•</span>
              <span>{material.type === 'image' ? (material.photoCredit || material.outletOrSpeaker) : material.outletOrSpeaker}</span>
              <span>•</span>
              <span>{material.date}</span>
            </div>
            <h2 className="text-[14pt] font-bold font-editorial text-black leading-tight">
              {material.title}
            </h2>
          </div>

          <div className="flex items-center space-x-2">
            {material.url && (
              <a
                href={material.url}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 text-neutral-400 hover:text-black rounded-xs hover:bg-neutral-100 cursor-pointer"
                title="원본 사료 웹 문서 열기"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-black rounded-xs hover:bg-neutral-100 cursor-pointer"
              title="미리보기 닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dedicated Image Material View & Editing Controls */}
        {material.type === 'image' && (
          <div className="border-b border-neutral-200 bg-white p-4">
            <div className="relative rounded-xs overflow-hidden max-h-72 w-full flex items-center justify-center bg-black border border-neutral-200">
              <img
                src={imageUrl || material.imageUrl}
                alt={material.title}
                className="max-h-72 w-full object-contain"
                referrerPolicy="no-referrer"
              />
              {imageCredit && (
                <span className="absolute bottom-2 left-2 bg-black/80 text-white text-[8.5pt] font-mono-code px-2 py-1 rounded-xs backdrop-blur-2xs border border-white/10">
                  {imageCredit}
                </span>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-[10pt] font-mono-code">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsEditingImage(!isEditingImage)}
                  className="px-2.5 py-1 bg-white hover:bg-neutral-50 text-black border border-neutral-200 rounded-xs flex items-center space-x-1 cursor-pointer transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#008285]" />
                  <span>{isEditingImage ? '편집 닫기' : '사진 정보 수정'}</span>
                </button>
                {savedSuccess && (
                  <span className="text-[#008285] flex items-center space-x-1 text-[9.5pt]">
                    <Check className="w-3.5 h-3.5" />
                    <span>수정 완료</span>
                  </span>
                )}
              </div>

              {onInsertImageToArticle && (
                <button
                  onClick={handleInsertImage}
                  className="px-3 py-1 bg-[#008285] hover:bg-[#006b6e] text-white rounded-xs flex items-center space-x-1 font-semibold cursor-pointer transition-colors shadow-2xs"
                >
                  {imageInserted ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{imageInserted ? '기사에 삽입됨!' : '기사에 이 사진 삽입'}</span>
                </button>
              )}
            </div>

            {/* In-place edit form for image material */}
            {isEditingImage && (
              <div className="mt-3 p-3 bg-neutral-50 border border-neutral-200 rounded-xs space-y-2.5 text-[10pt]">
                <div>
                  <label className="block text-black text-[9pt] font-mono-code mb-1 font-medium">
                    사진 자료 제목
                  </label>
                  <input
                    type="text"
                    value={imageTitle}
                    onChange={(e) => setImageTitle(e.target.value)}
                    className="w-full bg-white border border-neutral-200 rounded-xs px-2.5 py-1 text-black text-[10pt] focus:outline-none focus:border-[#008285]"
                  />
                </div>
                <div>
                  <label className="block text-black text-[9pt] font-mono-code mb-1 font-medium">
                    이미지 URL / 경로
                  </label>
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full bg-white border border-neutral-200 rounded-xs px-2.5 py-1 text-black text-[10pt] focus:outline-none focus:border-[#008285] font-mono-code"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-black text-[9pt] font-mono-code mb-1 font-medium">
                      보도 사진 캡션 (설명)
                    </label>
                    <input
                      type="text"
                      value={imageCaption}
                      onChange={(e) => setImageCaption(e.target.value)}
                      placeholder="사진 설명 문구..."
                      className="w-full bg-white border border-neutral-200 rounded-xs px-2.5 py-1 text-black text-[10pt] focus:outline-none focus:border-[#008285]"
                    />
                  </div>
                  <div>
                    <label className="block text-black text-[9pt] font-mono-code mb-1 font-medium">
                      사진 기자 / 출처 크레딧
                    </label>
                    <input
                      type="text"
                      value={imageCredit}
                      onChange={(e) => setImageCredit(e.target.value)}
                      placeholder="사진=특별취재팀..."
                      className="w-full bg-white border border-neutral-200 rounded-xs px-2.5 py-1 text-black text-[10pt] focus:outline-none focus:border-[#008285]"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleSaveImageEdits}
                    className="px-3 py-1 bg-[#008285] hover:bg-[#006b6e] text-white rounded-xs text-[10pt] font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>변경사항 저장</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audio Player Bar if Audio material */}
        {material.type === 'audio' && (
          <div className="p-3 bg-neutral-900 text-white flex items-center justify-between space-x-3 text-[10pt] font-mono-code select-none">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-8 h-8 rounded-full bg-[#008285] hover:bg-[#006b6e] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
            </button>

            <div className="flex-1">
              <div className="flex items-center justify-between text-[10pt] text-neutral-400 mb-1">
                <span className="text-white font-medium">{isPlaying ? '14:48' : currentPlayTime}</span>
                <span>{material.durationOrPages || '34:18'}</span>
              </div>
              <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                <div className="bg-[#008285] h-full w-[42%] rounded-full"></div>
              </div>
            </div>

            <div className="flex items-center space-x-1.5 text-neutral-400">
              <Volume2 className="w-4 h-4" />
              <span className="text-[10pt]">100%</span>
            </div>
          </div>
        )}

        {/* Custom Text Selection Action Floating Prompt */}
        {selectedCustomText && (
          <div className="bg-[#edf7f7] border-b border-[#bce3e4] p-2.5 flex items-center justify-between text-[10.5pt]">
            <div className="flex items-center space-x-2 truncate max-w-sm">
              <Sparkles className="w-4 h-4 text-[#008285] shrink-0" />
              <span className="text-black font-medium truncate">
                선택 영역: "{selectedCustomText}"
              </span>
            </div>
            <div className="flex items-center space-x-1.5 font-mono-code text-[10pt]">
              <button
                onClick={() => {
                  handleAdd('QUOTE', selectedCustomText, material.outletOrSpeaker, currentPlayTime);
                  setSelectedCustomText('');
                }}
                className="px-2.5 py-1 bg-white hover:bg-neutral-50 text-black border border-neutral-200 rounded-xs font-medium cursor-pointer"
              >
                + 인용(QUOTE) 삽입
              </button>
              <button
                onClick={() => {
                  handleAdd('FACT', selectedCustomText);
                  setSelectedCustomText('');
                }}
                className="px-2.5 py-1 bg-[#008285] hover:bg-[#006b6e] text-white rounded-xs font-medium cursor-pointer"
              >
                + 팩트(FACT) 삽입
              </button>
              <button
                onClick={() => {
                  handleAdd('CONTEXT', selectedCustomText);
                  setSelectedCustomText('');
                }}
                className="px-2.5 py-1 bg-black hover:bg-neutral-800 text-white rounded-xs font-medium cursor-pointer"
              >
                + 배경(CONTEXT) 삽입
              </button>
            </div>
          </div>
        )}

        {/* Main Content & Excerpts */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-[10.5pt] bg-white">
          {/* Caption for image */}
          {material.type === 'image' && material.caption && (
            <div className="p-3 bg-[#edf7f7]/60 border border-[#bce3e4] rounded-xs text-[10.5pt] text-black">
              <span className="font-semibold block text-[10pt] font-mono-code uppercase tracking-wider mb-0.5 text-[#006b6e]">
                보도 사진 캡션
              </span>
              <p className="font-editorial italic">{material.caption}</p>
            </div>
          )}

          {/* Summary */}
          {material.summary && (
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xs text-[10.5pt] text-black">
              <span className="font-semibold block text-[10pt] font-mono-code uppercase tracking-wider mb-0.5 text-black">
                취재 요약 및 핵심 내용
              </span>
              {material.summary}
            </div>
          )}

          {/* Key Excerpts with Direct One-Click Actions: Quote, Fact, Context */}
          {material.excerpts && material.excerpts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono-code text-[11pt] font-semibold uppercase tracking-wider text-black">
                  핵심 발언 및 주요 발췌 ({material.excerpts.length})
                </h3>
                <span className="text-[10pt] text-neutral-400 font-mono-code">
                  클릭 시 기사 편집기에 즉시 추가됩니다
                </span>
              </div>

              <div className="space-y-2.5">
                {material.excerpts.map((excerpt) => (
                  <div
                    key={excerpt.id}
                    id={`excerpt-card-${excerpt.id}`}
                    className="p-3.5 bg-white border border-neutral-200 hover:border-black rounded-xs shadow-2xs transition-all"
                  >
                    <div className="flex items-center justify-between text-[10pt] font-mono-code text-neutral-500 mb-1.5">
                      <span className="font-semibold text-black flex items-center space-x-1">
                        <User className="w-3.5 h-3.5 text-neutral-400" />
                        <span>{excerpt.speaker}</span>
                      </span>
                      <span className="flex items-center space-x-1 text-neutral-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{excerpt.timestamp}</span>
                      </span>
                    </div>

                    <p className="text-[11pt] font-editorial italic text-black mb-2.5 pl-2.5 border-l-2 border-[#008285] leading-relaxed">
                      "{excerpt.text}"
                    </p>

                    {/* Action buttons: Add as Quote, Add as Fact, Add as Context */}
                    <div className="flex items-center space-x-1.5 pt-2 border-t border-neutral-100 text-[10pt] font-mono-code">
                      <button
                        onClick={() => handleAdd('QUOTE', excerpt.text, excerpt.speaker, excerpt.timestamp, excerpt.id)}
                        className="px-2.5 py-1 bg-white hover:bg-[#edf7f7] text-[#006b6e] border border-[#bce3e4] rounded-xs flex items-center space-x-1 transition-colors cursor-pointer"
                      >
                        {copiedId === excerpt.id ? <Check className="w-3.5 h-3.5 text-[#008285]" /> : <Quote className="w-3.5 h-3.5 text-[#008285]" />}
                        <span>인용으로 기사 삽입</span>
                      </button>

                      <button
                        onClick={() => handleAdd('FACT', excerpt.text, excerpt.speaker, excerpt.timestamp, excerpt.id)}
                        className="px-2.5 py-1 bg-white hover:bg-neutral-50 text-black border border-neutral-200 rounded-xs flex items-center space-x-1 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-black" />
                        <span>팩트로 기사 삽입</span>
                      </button>

                      <button
                        onClick={() => handleAdd('CONTEXT', excerpt.text, excerpt.speaker, excerpt.timestamp, excerpt.id)}
                        className="px-2.5 py-1 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 rounded-xs flex items-center space-x-1 transition-colors cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-neutral-500" />
                        <span>배경으로 기사 삽입</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full Raw Content Display */}
          <div>
            <div className="text-[10pt] font-mono-code font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              {material.type === 'image' ? '취재 사진 메모 및 기록' : '문서 전문 및 원문 속기록'}
            </div>
            <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xs text-[10pt] font-mono-code text-black whitespace-pre-wrap leading-relaxed select-text">
              {material.content}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-neutral-200 bg-white flex items-center justify-between text-[10pt] text-neutral-500 font-mono-code">
          <span>
            {material.type === 'image' 
              ? '보도 사진 정보를 편집하거나 기사 노드로 직접 추가할 수 있습니다' 
              : '텍스트를 드래그하여 인용, 팩트, 배경 노드로 직접 추가할 수 있습니다'}
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-black rounded-xs font-medium cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
