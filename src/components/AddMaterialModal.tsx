import React, { useState, useRef } from 'react';
import { 
  X, 
  Plus, 
  Upload, 
  Mic, 
  FileText, 
  Link as LinkIcon, 
  Check, 
  AlertCircle,
  Image as ImageIcon,
  Camera
} from 'lucide-react';
import { MaterialItem, MaterialType } from '../types';

interface AddMaterialModalProps {
  initialType: MaterialType;
  isOpen: boolean;
  onClose: () => void;
  onAddMaterial: (material: MaterialItem) => void;
}

export const AddMaterialModal: React.FC<AddMaterialModalProps> = ({
  initialType,
  isOpen,
  onClose,
  onAddMaterial,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<MaterialType>(initialType);
  const [title, setTitle] = useState('');
  const [outletOrSpeaker, setOutletOrSpeaker] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [durationOrPages, setDurationOrPages] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [photoCredit, setPhotoCredit] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sampleImages = [
    {
      name: '현장 수질 검사',
      url: 'https://images.unsplash.com/photo-1581093458791-9f3c3900df4b?auto=format&fit=crop&w=1200&q=80',
      caption: '현장 4관정 배출구 수질 시료 긴급 채취 현장',
      credit: '뉴스룸 박민우 기자',
    },
    {
      name: '감사 보고서 문서',
      url: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=1200&q=80',
      caption: '2024년 정기 수질감사 적합 확인서 결재 사본',
      credit: '제보 문건 / 심층취재팀 제공',
    },
    {
      name: '청문회 증언 현장',
      url: 'https://images.unsplash.com/photo-1575517111478-7f6afd0973db?auto=format&fit=crop&w=1200&q=80',
      caption: '시의회 행정감사특위 수자원청 긴급 청문회 출석',
      credit: '공동취재단 사진팀',
    },
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      setActiveTab('image');
      if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ''));
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setImageUrl(result);
        if (!caption) setCaption(`${file.name} 보도 현장 사진`);
        if (!photoCredit) setPhotoCredit('취재팀 현장 촬영');
      };
      reader.readAsDataURL(file);
    } else {
      if (!title) setTitle(file.name);
      setDurationOrPages(`${Math.round(file.size / 1024)} KB / ${file.type || '문서'}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    const newMaterial: MaterialItem = {
      id: `mat-${Date.now()}`,
      type: activeTab,
      title: title.trim(),
      status: 'Processed',
      outletOrSpeaker: outletOrSpeaker.trim() || (activeTab === 'image' ? (photoCredit.trim() || '사진취재팀') : '뉴스룸 아카이브'),
      date: new Date().toISOString().split('T')[0],
      durationOrPages: durationOrPages.trim() || (activeTab === 'audio' ? '12:40' : activeTab === 'image' ? '고해상도 이미지' : '4 페이지'),
      fileSize: activeTab === 'image' ? '3.2 MB' : '1.4 MB',
      dimensions: activeTab === 'image' ? '3840 x 2160' : undefined,
      url: url.trim() || undefined,
      imageUrl: activeTab === 'image' ? (imageUrl.trim() || sampleImages[0].url) : undefined,
      caption: activeTab === 'image' ? (caption.trim() || title.trim()) : undefined,
      photoCredit: activeTab === 'image' ? (photoCredit.trim() || outletOrSpeaker.trim() || '뉴스룸 취재팀') : undefined,
      summary: summary.trim() || (activeTab === 'image' ? (caption.trim() || '기사에 보도 사진으로 연계 가능한 고해상도 취재 이미지입니다.') : '취재 워크스페이스 아카이브에 검증된 사료가 등록되었습니다.'),
      content: content.trim() || (activeTab === 'image' ? `보도사진 메타데이터\n사진설명: ${caption || title}\n촬영/출처: ${photoCredit || outletOrSpeaker}\n등록일자: ${new Date().toLocaleDateString('ko-KR')}` : `원문 취재 사료 기록 - ${title}\n출처: ${outletOrSpeaker || '뉴스룸 보관함'}\n뉴스룸 기사 보도를 위해 검증된 원본 내용입니다.`),
      excerpts: [
        {
          id: `ex-${Date.now()}`,
          speaker: outletOrSpeaker.trim() || (activeTab === 'image' ? '보도사진 캡션' : '1차 출처'),
          timestamp: activeTab === 'audio' ? '02:15' : activeTab === 'image' ? '사진 1' : '문서 1면',
          text: activeTab === 'image' ? (caption.trim() || `${title} 현장 취재 사진.`) : (content.trim().slice(0, 180) || `${title}에서 확인된 핵심 검증 발언.`),
        },
      ],
    };

    setTimeout(() => {
      onAddMaterial(newMaterial);
      setIsSubmitting(false);
      onClose();
    }, 200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xs shadow-xl border border-neutral-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-3.5 border-b border-neutral-200 bg-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 bg-[#008285] text-white flex items-center justify-center font-mono-code font-bold text-[10pt] rounded-xs">
              +
            </span>
            <h3 className="font-semibold text-[11pt] text-black uppercase tracking-wider font-mono-code">
              취재 사료 및 보도 사진 등록
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-black p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Type Switcher Tabs */}
        <div className="p-3 border-b border-neutral-200 bg-white flex items-center space-x-1.5 text-[10pt] font-mono-code overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('source')}
            className={`px-3 py-1.5 rounded-xs border transition-colors flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'source'
                ? 'bg-black text-white border-black font-semibold'
                : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>공식 출처</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('image')}
            className={`px-3 py-1.5 rounded-xs border transition-colors flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'image'
                ? 'bg-[#008285] text-white border-[#008285] font-semibold'
                : 'bg-white text-[#006b6e] border-[#bce3e4] hover:bg-[#edf7f7]'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>보도 사진 / 이미지</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`px-3 py-1.5 rounded-xs border transition-colors flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'file'
                ? 'bg-black text-white border-black font-semibold'
                : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>문서 파일</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audio')}
            className={`px-3 py-1.5 rounded-xs border transition-colors flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'audio'
                ? 'bg-black text-white border-black font-semibold'
                : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>녹취 오디오</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-[10.5pt] overflow-y-auto flex-1 bg-white">
          {/* File drag-and-drop & browse area */}
          {(activeTab === 'image' || activeTab === 'file') && (
            <div className="p-3.5 border-2 border-dashed border-neutral-200 hover:border-[#008285] bg-neutral-50/50 rounded-xs text-center transition-colors">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept={activeTab === 'image' ? 'image/*' : '*/*'}
                className="hidden" 
              />
              <div className="flex flex-col items-center justify-center space-y-1.5">
                {activeTab === 'image' ? (
                  <Camera className="w-6 h-6 text-[#008285]" />
                ) : (
                  <Upload className="w-6 h-6 text-neutral-500" />
                )}
                <div className="text-[10pt] font-mono-code text-black">
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()} 
                    className="font-bold text-[#008285] hover:underline cursor-pointer"
                  >
                    컴퓨터에서 파일 찾아보기
                  </button>
                  <span> 또는 여기에 드래그 앤 드롭</span>
                </div>
                <p className="text-[9.5pt] text-neutral-400 font-mono-code">
                  {activeTab === 'image' ? 'JPG, PNG, WEBP, GIF 등 이미지 파일 지원 (고해상도 메타데이터 자동 보존)' : 'PDF, DOCX, CSV, XLSX 등 문서 파일 지원'}
                </p>
              </div>
            </div>
          )}

          {/* Image-specific preset & preview section */}
          {activeTab === 'image' && (
            <div className="p-3 bg-[#edf7f7]/50 border border-[#bce3e4] rounded-xs space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-black font-semibold font-mono-code text-[10pt] uppercase">
                  보도 사진 이미지 URL 또는 추천 샘플 선택
                </label>
                <div className="flex items-center space-x-1.5">
                  {sampleImages.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setImageUrl(sample.url);
                        if (!title) setTitle(sample.name);
                        if (!caption) setCaption(sample.caption);
                        if (!photoCredit) setPhotoCredit(sample.credit);
                      }}
                      className="px-2 py-0.5 bg-white hover:bg-[#edf7f7] text-[#006b6e] border border-[#bce3e4] rounded-xs text-[9.5pt] font-mono-code transition-colors cursor-pointer"
                    >
                      샘플 {idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://images.unsplash.com/... 또는 업로드된 이미지 데이터"
                className="w-full px-3 py-1.5 border border-neutral-200 rounded-xs text-black focus:outline-none focus:border-[#008285] text-[10pt] bg-white font-mono-code"
              />

              {/* Live Image Preview */}
              {imageUrl && (
                <div className="relative rounded-xs overflow-hidden border border-neutral-200 bg-black flex items-center justify-center max-h-48">
                  <img 
                    src={imageUrl} 
                    alt="등록 사진 미리보기" 
                    className="max-h-48 w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-black/80 backdrop-blur-2xs px-2.5 py-1 text-white text-[10pt] font-mono-code flex items-center justify-between">
                    <span className="truncate">{caption || '보도 사진 미리보기'}</span>
                    <span className="text-neutral-300 shrink-0 pl-2">{photoCredit || '촬영 기자 미정'}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-black font-medium mb-1 font-mono-code text-[10pt] uppercase">
                    보도 사진 캡션 (설명 문구) *
                  </label>
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="예: 델타 가압펌프장 오염수 배출구 긴급 시료 채취 현장"
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-xs text-black focus:outline-none focus:border-[#008285] text-[10pt] bg-white"
                  />
                </div>

                <div>
                  <label className="block text-black font-medium mb-1 font-mono-code text-[10pt] uppercase">
                    촬영자 / 출처 크레딧 (사진=)
                  </label>
                  <input
                    type="text"
                    value={photoCredit}
                    onChange={(e) => setPhotoCredit(e.target.value)}
                    placeholder="예: 특별취재팀 박민우 기자 / 제보 사진"
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-xs text-black focus:outline-none focus:border-[#008285] text-[10pt] bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-black font-medium mb-1 font-mono-code text-[10pt] uppercase">
              사료 제목 *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                activeTab === 'image' 
                  ? '예: 델타 가압펌프장 오염수 배출구 현장 취재 보도사진' 
                  : activeTab === 'audio' 
                  ? '예: 시의회 수석 엔지니어 인터뷰' 
                  : '예: 주 환경보호국 2024 지질조사 보고서'
              }
              className="w-full px-3 py-2 border border-neutral-200 rounded-xs text-black focus:outline-none focus:border-[#008285] text-[10.5pt]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-black font-medium mb-1 font-mono-code text-[10pt] uppercase">
                {activeTab === 'audio' ? '발화자 / 인터뷰 대상자' : activeTab === 'image' ? '촬영 기자 / 소속사' : '출처 기관 / 언론사'}
              </label>
              <input
                type="text"
                value={outletOrSpeaker}
                onChange={(e) => setOutletOrSpeaker(e.target.value)}
                placeholder={activeTab === 'audio' ? '예: 엘레나 바스 박사' : activeTab === 'image' ? '예: 뉴스룸 사진취재팀' : '예: 환경보건감시청'}
                className="w-full px-3 py-2 border border-neutral-200 rounded-xs text-black focus:outline-none focus:border-[#008285] text-[10.5pt]"
              />
            </div>

            <div>
              <label className="block text-black font-medium mb-1 font-mono-code text-[10pt] uppercase">
                {activeTab === 'audio' ? '재생 시간 (예: 18:30)' : activeTab === 'image' ? '해상도 / 규격' : '분량 / 형식'}
              </label>
              <input
                type="text"
                value={durationOrPages}
                onChange={(e) => setDurationOrPages(e.target.value)}
                placeholder={activeTab === 'audio' ? '18:45 분' : activeTab === 'image' ? '3840 x 2160 (4K)' : '12 페이지 / PDF'}
                className="w-full px-3 py-2 border border-neutral-200 rounded-xs text-black focus:outline-none focus:border-[#008285] text-[10.5pt]"
              />
            </div>
          </div>

          {activeTab === 'source' && (
            <div>
              <label className="block text-black font-medium mb-1 font-mono-code text-[10pt] uppercase">
                웹 링크 URL / 공문서 접수 번호
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.gov/records/2024-report"
                className="w-full px-3 py-2 border border-neutral-200 rounded-xs text-black focus:outline-none focus:border-[#008285] text-[10.5pt]"
              />
            </div>
          )}

          <div>
            <label className="block text-black font-medium mb-1 font-mono-code text-[10pt] uppercase">
              취재 개요 / 기사 활용 맥락
            </label>
            <textarea
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="기사 작성 시 이 사료가 중요한 이유와 핵심 요점을 간략히 입력하세요..."
              className="w-full px-3 py-2 border border-neutral-200 rounded-xs text-black focus:outline-none focus:border-[#008285] text-[10.5pt]"
            />
          </div>

          <div>
            <label className="block text-black font-medium mb-1 font-mono-code text-[10pt] uppercase">
              {activeTab === 'image' ? '사진 메타데이터 / 촬영 세부 메모' : '원문 텍스트 / 녹취록 / 주요 발췌 내용'}
            </label>
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={activeTab === 'image' ? '촬영 장소, 기종, 조리개/셔터속도, 피사체 설명 등을 입력하세요...' : '직접 인용문, 인터뷰 메모, 보고서 원문 등을 붙여넣으세요...'}
              className="w-full px-3 py-2 border border-neutral-200 rounded-xs text-black font-mono-code text-[10pt] focus:outline-none focus:border-[#008285]"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-neutral-200 flex items-center justify-end space-x-2 text-[10.5pt]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-neutral-200 rounded-xs text-black hover:bg-neutral-50 font-medium cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-[#008285] hover:bg-[#006b6e] text-white rounded-xs font-medium font-mono-code flex items-center space-x-1.5 cursor-pointer transition-colors"
            >
              {isSubmitting ? (
                <span>색인 처리 중...</span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>사료 등록 및 색인</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

