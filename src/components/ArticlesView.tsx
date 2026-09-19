import React from 'react';
import { 
  FileText, 
  Clock, 
  ArrowRight, 
  Plus, 
  User, 
  CheckCircle2, 
  AlertCircle,
  Image as ImageIcon,
  Camera
} from 'lucide-react';
import { Article } from '../types';

interface ArticlesViewProps {
  currentArticleId: string;
  currentArticle?: Article;
  onSelectArticle: (articleId: string) => void;
  onNewArticle: () => void;
}

export const ArticlesView: React.FC<ArticlesViewProps> = ({
  currentArticleId,
  currentArticle,
  onSelectArticle,
  onNewArticle,
}) => {
  // Extract images from current article if available
  const currentImages = currentArticle?.nodes.filter(n => n.type === 'IMAGE' && n.imageUrl) || [];
  const currentFirstImage = currentImages[0]?.imageUrl;

  const articlesList = [
    {
      id: 'art-001',
      title: currentArticle?.id === 'art-001' ? currentArticle.title : '내부 문건 폭로: 지역 수자원국, 2024년 정기 수질 감사서 유해 물질 급등 수치 고의 은폐',
      desk: '전국 특별취재본부',
      author: '사라 린',
      status: currentArticle?.id === 'art-001' ? currentArticle.status : '기사 검토 중',
      lastSaved: currentArticle?.id === 'art-001' ? currentArticle.lastSaved : '2분 전',
      nodesCount: currentArticle?.id === 'art-001' ? currentArticle.nodes.length : 6,
      sourcesCount: 4,
      critiquesCount: 4,
      imageUrl: currentArticle?.id === 'art-001' && currentFirstImage 
        ? currentFirstImage 
        : 'https://images.unsplash.com/photo-1574482620811-1aa16ffe3c82?auto=format&fit=crop&w=600&q=80',
      imageCaption: currentArticle?.id === 'art-001' && currentImages[0]?.caption
        ? currentImages[0].caption
        : '정수장 유입수 관로 현장 시료 채수 조사',
      imageCount: currentArticle?.id === 'art-001' ? currentImages.length : 1,
    },
    {
      id: 'art-002',
      title: '상수원 인근 농업용 방류수 내 과불화화합물(PFAS) 생체 축적량, 권고 상한 기준치 대폭 초과',
      desk: '환경보건 데스크',
      author: '데이비드 첸',
      status: '초고 작성 중',
      lastSaved: '3시간 전',
      nodesCount: 9,
      sourcesCount: 3,
      critiquesCount: 2,
      imageUrl: 'https://images.unsplash.com/photo-1581093588401-fbb62a02f120?auto=format&fit=crop&w=600&q=80',
      imageCaption: '수질연구원 화학 분석팀 연구원들이 PFAS 분광 분석을 진행하고 있다.',
      imageCount: 1,
    },
    {
      id: 'art-003',
      title: '하청 협력업체 사내 메신저 유출 파장… 카운티 의회 윤리 청문회 공식 소집',
      desk: '수도권 심층취재팀',
      author: '마커스 밴스',
      status: '법률 검토 중',
      lastSaved: '어제',
      nodesCount: 14,
      sourcesCount: 7,
      critiquesCount: 1,
      imageUrl: 'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=600&q=80',
      imageCaption: '의회 본관 로비에서 취재진이 청문회 출석 위원들의 입장을 기다리고 있다.',
      imageCount: 1,
    },
  ];

  return (
    <div className="flex-1 bg-white h-[calc(100vh-3.25rem)] overflow-y-auto p-8 text-[10.5pt]">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-200 mb-6">
          <div>
            <div className="text-[10pt] font-mono-code uppercase text-neutral-500 tracking-wider">
              뉴스룸 기사 데스크
            </div>
            <h1 className="text-2xl font-bold font-editorial text-black">
              진행 중인 심층 취재 및 기사 초고 목록
            </h1>
          </div>
          <button
            onClick={onNewArticle}
            className="px-3.5 py-2 bg-[#008285] hover:bg-[#006b6e] text-white rounded-xs text-[10.5pt] font-mono-code font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>새 기사 파일 작성</span>
          </button>
        </div>

        {/* Story Cards List */}
        <div className="space-y-4">
          {articlesList.map((story) => {
            const isCurrent = story.id === currentArticleId;

            return (
              <div
                key={story.id}
                className={`p-4.5 bg-white border rounded-xs transition-all hover:border-black ${
                  isCurrent ? 'border-[#008285] ring-1 ring-[#bce3e4]' : 'border-neutral-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[10pt] font-mono-code text-neutral-500 mb-1.5">
                      <span className="uppercase text-[#008285] font-semibold">{story.desk}</span>
                      <span>•</span>
                      <span>취재: {story.author} 기자</span>
                      <span>•</span>
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-neutral-400" />
                        <span>{story.lastSaved}</span>
                      </span>
                      {story.imageCount > 0 && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-xs bg-[#edf7f7] text-[#006b6e] border border-[#bce3e4] font-semibold text-[9.5pt]">
                          <Camera className="w-3 h-3" />
                          <span>보도 사진 {story.imageCount}건</span>
                        </span>
                      )}
                    </div>

                    <h2 
                      className="text-lg font-bold font-editorial text-black hover:text-[#008285] transition-colors cursor-pointer leading-snug mb-2" 
                      onClick={() => onSelectArticle(story.id)}
                    >
                      {story.title}
                    </h2>

                    {story.imageCaption && (
                      <p className="text-[10pt] text-neutral-500 font-editorial line-clamp-1 italic">
                        [사진 캡션] {story.imageCaption}
                      </p>
                    )}
                  </div>

                  {/* Thumbnail of featured image */}
                  {story.imageUrl && (
                    <div 
                      onClick={() => onSelectArticle(story.id)}
                      className="relative w-full sm:w-36 h-24 rounded-xs overflow-hidden bg-black border border-neutral-200 shrink-0 cursor-pointer group/thumb shadow-2xs"
                    >
                      <img
                        src={story.imageUrl}
                        alt={story.title}
                        className="w-full h-full object-cover transition-transform group-hover/thumb:scale-105"
                        referrerPolicy="no-referrer"
                      />
                      <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[8.5pt] font-mono-code px-1.5 py-0.5 rounded-xs backdrop-blur-2xs">
                        보도 사진
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-neutral-100 text-[10pt] text-neutral-500 font-mono-code">
                  <div className="flex items-center space-x-4">
                    <span>노드 {story.nodesCount}개</span>
                    <span>연계 사료 {story.sourcesCount}건</span>
                    {story.critiquesCount > 0 && (
                      <span className="text-neutral-700 flex items-center space-x-1">
                        <AlertCircle className="w-3.5 h-3.5 text-[#008285]" />
                        <span>AI 검토 지적 {story.critiquesCount}건</span>
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => onSelectArticle(story.id)}
                    className="px-3 py-1.5 bg-neutral-100 hover:bg-[#008285] hover:text-white text-black rounded-xs font-semibold flex items-center space-x-1 transition-colors text-[10pt] cursor-pointer"
                  >
                    <span>기사 작업실 열기</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
