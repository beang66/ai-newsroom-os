import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Download, 
  FileText, 
  Share2, 
  Code,
  Eye,
  Camera,
  Image as ImageIcon,
  Quote,
  AlertTriangle
} from 'lucide-react';
import { Article, MaterialItem } from '../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  article: Article;
  materials: MaterialItem[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  article,
  materials,
}) => {
  if (!isOpen) return null;

  const [format, setFormat] = useState<'preview' | 'wire' | 'markdown' | 'clean' | 'json'>('preview');
  const [copied, setCopied] = useState(false);

  // Generate AP Wire Copy
  const generateWireCopy = () => {
    const dateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const slug = article.title.slice(0, 30).replace(/[^가-힣a-zA-Z0-9]/g, '-');
    
    let wire = `[송고 식별: ${slug}]\n`;
    wire += `[긴급 송고]\n`;
    wire += `제목: ${article.title}\n`;
    wire += `취재: ${article.author} 기자\n`;
    wire += `데스크: ${article.desk}\n\n`;
    wire += `(서울/현장 송고=${dateStr}) — `;

    const bodyParagraphs = article.nodes.map((node) => {
      let text = node.text;
      if (node.type === 'QUOTE' && node.interviewSource) {
        text = `"${text}" (${node.interviewSource} 발언 속기록 인용)`;
      } else if (node.type === 'IMAGE') {
        text = `\n[보도 사진 송고: ${node.caption || node.text || '현장 사진'}]\n[사진 크레딧: ${node.photoCredit || '특별취재팀'} | 이미지 송고 링크: ${node.imageUrl || 'N/A'}]\n`;
      }
      return text;
    });

    wire += bodyParagraphs.join('\n\n');
    wire += `\n\n- 기사 끝 -\n\n[참고 취재 사료 및 출처 출전]\n`;
    materials.forEach((mat, idx) => {
      wire += `[${idx + 1}] ${mat.title} (${mat.outletOrSpeaker}, ${mat.date})\n`;
    });
    return wire;
  };

  // Generate Markdown with Footnotes
  const generateMarkdown = () => {
    let md = `# ${article.title}\n\n`;
    md += `**작성자:** ${article.author} 기자 | **소속 데스크:** ${article.desk} | **기사 상태:** \`${article.status}\`\n\n`;

    article.nodes.forEach((node) => {
      let footnoteMarkers = '';
      if (node.linkedSourceIds && node.linkedSourceIds.length > 0) {
        footnoteMarkers = node.linkedSourceIds
          .map(id => {
            const matIndex = materials.findIndex(m => m.id === id);
            return `[^${matIndex >= 0 ? matIndex + 1 : id}]`;
          })
          .join('');
      }

      if (node.type === 'IMAGE') {
        md += `![${node.altText || node.caption || '보도 사진'}](${node.imageUrl || ''})\n\n`;
        md += `*${node.caption || node.text}* — **${node.photoCredit || '특별취재팀'}** ${footnoteMarkers}\n\n`;
      } else if (node.type === 'QUOTE') {
        md += `> "${node.text}"\n>\n> — **${node.interviewSource || '출처'}** ${node.timestamp ? `(${node.timestamp})` : ''} ${footnoteMarkers}\n\n`;
      } else {
        md += `${node.text} ${footnoteMarkers}\n\n`;
      }
    });

    md += `\n---\n\n### 기사 인용 및 참고 사료 목록\n\n`;
    materials.forEach((mat, idx) => {
      md += `[^${idx + 1}]: **${mat.title}** - *${mat.outletOrSpeaker}* (${mat.date}). [사료 원문 링크](${mat.url || '#'})\n`;
    });

    return md;
  };

  // Generate Clean Text
  const generateCleanText = () => {
    return `${article.title}\n\n취재: ${article.author} 기자 (${article.desk})\n\n` + 
      article.nodes.map(n => {
        if (n.type === 'QUOTE') return `"${n.text}" — ${n.interviewSource || ''}`;
        if (n.type === 'IMAGE') return `[보도 사진] ${n.caption || n.text} (${n.photoCredit || '특별취재팀'})`;
        return n.text;
      }).join('\n\n');
  };

  // Generate Structured JSON
  const generateJSON = () => {
    return JSON.stringify(
      {
        article: {
          id: article.id,
          title: article.title,
          status: article.status,
          author: article.author,
          desk: article.desk,
          lastSaved: article.lastSaved,
        },
        nodes: article.nodes,
        materials: materials,
        exportTimestamp: new Date().toISOString(),
      },
      null,
      2
    );
  };

  const getExportContent = () => {
    switch (format) {
      case 'wire':
        return generateWireCopy();
      case 'markdown':
        return generateMarkdown();
      case 'clean':
        return generateCleanText();
      case 'json':
        return generateJSON();
      default:
        return generateWireCopy();
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getExportContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = getExportContent();
    const ext = format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `newsroom-export-${Date.now()}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xs shadow-2xl border border-neutral-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-3.5 border-b border-neutral-200 bg-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-5 h-5 bg-[#008285] text-white flex items-center justify-center font-mono-code font-bold text-[10pt] rounded-xs">
              <Share2 className="w-3.5 h-3.5" />
            </span>
            <h3 className="font-semibold text-[11pt] text-black uppercase tracking-wider font-mono-code">
              뉴스룸 최종 기사 송고 / 내보내기 데스크
            </h3>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-black p-1 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Selector */}
        <div className="p-3 border-b border-neutral-200 bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-[10pt] font-mono-code">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setFormat('preview')}
              className={`px-3 py-1.5 rounded-xs border transition-colors flex items-center space-x-1 cursor-pointer ${
                format === 'preview'
                  ? 'bg-[#008285] text-white border-[#008285] font-semibold'
                  : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>최종 기사 조판 미리보기</span>
            </button>

            <button
              onClick={() => setFormat('wire')}
              className={`px-3 py-1.5 rounded-xs border transition-colors cursor-pointer ${
                format === 'wire'
                  ? 'bg-black text-white border-black font-semibold'
                  : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              통신사(Wire) 송고문
            </button>

            <button
              onClick={() => setFormat('markdown')}
              className={`px-3 py-1.5 rounded-xs border transition-colors cursor-pointer ${
                format === 'markdown'
                  ? 'bg-black text-white border-black font-semibold'
                  : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              마크다운 (사진/각주 연계)
            </button>

            <button
              onClick={() => setFormat('clean')}
              className={`px-3 py-1.5 rounded-xs border transition-colors cursor-pointer ${
                format === 'clean'
                  ? 'bg-black text-white border-black font-semibold'
                  : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              순수 텍스트
            </button>

            <button
              onClick={() => setFormat('json')}
              className={`px-3 py-1.5 rounded-xs border transition-colors cursor-pointer ${
                format === 'json'
                  ? 'bg-black text-white border-black font-semibold'
                  : 'bg-white text-black border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              JSON
            </button>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-white hover:bg-neutral-50 border border-neutral-200 text-black rounded-xs flex items-center space-x-1 font-medium cursor-pointer transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#008285]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '복사됨' : '복사'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-[#008285] hover:bg-[#006b6e] text-white rounded-xs flex items-center space-x-1 font-medium cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>파일 다운로드</span>
            </button>
          </div>
        </div>

        {/* Content Area: Visual Article Preview vs Raw Text/Code */}
        <div className="p-5 flex-1 overflow-y-auto bg-neutral-50">
          {format === 'preview' ? (
            /* Visual Newspaper Layout Preview with Real Photos and Styling */
            <div className="max-w-2xl mx-auto bg-white p-6 sm:p-8 border border-neutral-200 rounded-xs shadow-xs text-[10.5pt]">
              {/* Article Top Byline */}
              <div className="border-b-2 border-black pb-4 mb-6">
                <div className="flex items-center justify-between font-mono-code text-[10pt] text-neutral-500 mb-2">
                  <span className="font-bold text-[#008285] uppercase tracking-wider">{article.desk}</span>
                  <span>{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} 송고</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold font-editorial text-black leading-tight mb-3">
                  {article.title}
                </h1>
                <div className="flex items-center space-x-2 font-mono-code text-[10pt] text-neutral-600">
                  <span>{article.author} 기자</span>
                  <span>•</span>
                  <span>상태: {article.status}</span>
                </div>
              </div>

              {/* Render Nodes with Images and Typography */}
              <div className="space-y-5 text-black leading-relaxed font-editorial">
                {article.nodes.map((node, index) => {
                  if (node.type === 'IMAGE') {
                    return (
                      <figure key={node.id} className="my-6 bg-white border border-neutral-200 rounded-xs overflow-hidden">
                        {node.imageUrl ? (
                          <div className="relative w-full bg-black">
                            <img
                              src={node.imageUrl}
                              alt={node.altText || node.caption || '보도 사진'}
                              className="w-full max-h-96 object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ) : (
                          <div className="h-44 bg-neutral-100 flex items-center justify-center text-neutral-400 font-mono-code text-[10pt]">
                            <ImageIcon className="w-6 h-6 mr-2 text-neutral-400" />
                            <span>등록된 사진 없음</span>
                          </div>
                        )}
                        <figcaption className="p-3 bg-white border-t border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[10pt] font-sans">
                          <span className="text-black font-medium">
                            {node.caption || node.text}
                          </span>
                          <span className="font-mono-code text-neutral-500 text-[9pt] shrink-0">
                            {node.photoCredit || '특별취재팀'}
                          </span>
                        </figcaption>
                      </figure>
                    );
                  }

                  if (node.type === 'QUOTE') {
                    return (
                      <blockquote key={node.id} className="my-4 p-4 border-l-4 border-[#008285] bg-[#edf7f7]/50 rounded-r-xs text-[11pt] italic text-black">
                        <p className="mb-1.5 leading-relaxed">"{node.text}"</p>
                        {node.interviewSource && (
                          <cite className="block text-[10pt] not-italic font-mono-code text-[#006b6e] font-semibold">
                            — {node.interviewSource} {node.timestamp && `(${node.timestamp})`}
                          </cite>
                        )}
                      </blockquote>
                    );
                  }

                  if (node.type === 'CLAIM') {
                    return (
                      <div key={node.id} className="my-3 p-3 bg-neutral-50 border border-neutral-200 rounded-xs text-black text-[10.5pt]">
                        <span className="inline-block text-[9.5pt] font-mono-code font-bold text-black bg-neutral-200 px-1.5 py-0.5 rounded-xs mr-2 uppercase">
                          기관 주장 / 해명
                        </span>
                        <span>{node.text}</span>
                      </div>
                    );
                  }

                  return (
                    <p key={node.id} className="text-[11pt] text-black font-editorial leading-relaxed">
                      {node.text}
                    </p>
                  );
                })}
              </div>

              {/* Sources & Citations Footer */}
              <div className="mt-8 pt-5 border-t border-neutral-200 font-mono-code text-[10pt]">
                <h4 className="font-bold text-black uppercase tracking-wider mb-2">
                  취재 연계 사료 및 입증 출처 ({materials.length}건)
                </h4>
                <div className="space-y-1 text-neutral-600 text-[9.5pt]">
                  {materials.map((mat, idx) => (
                    <div key={mat.id} className="flex items-start space-x-1.5">
                      <span className="text-neutral-400">[{idx + 1}]</span>
                      <span>
                        {mat.title} — <strong className="text-black">{mat.outletOrSpeaker}</strong> ({mat.date})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <pre className="p-4 bg-white border border-neutral-200 rounded-xs text-[10pt] font-mono-code text-black whitespace-pre-wrap leading-relaxed select-text shadow-2xs">
              {getExportContent()}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-neutral-200 bg-white flex items-center justify-between text-[10pt] text-neutral-500 font-mono-code">
          <span>송고 기준: AP 통신 및 한국기자협회 보도준칙 준수</span>
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
