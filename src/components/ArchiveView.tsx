import React, { useState } from 'react';
import {
  FolderArchive,
  Download,
  FileText,
  Mic,
  Image,
  Filter,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  Tag,
  ExternalLink,
} from 'lucide-react';
import { useNewsroom } from '../context/NewsroomContext';
import { ArchiveFile } from '../types';

export const ArchiveView: React.FC = () => {
  const {
    archiveFiles,
    reclassifyFile,
    exportArticleFile,
    article,
  } = useNewsroom();

  const [selectedCategory, setSelectedCategory] = useState<string>('전체');

  const categories: Array<ArchiveFile['category'] | '전체'> = [
    '전체',
    'Draft',
    'Source',
    'Interview',
    'Media',
    'Published',
  ];

  const filteredFiles = archiveFiles.filter(f =>
    selectedCategory === '전체' ? true : f.category === selectedCategory
  );

  const getCategoryColor = (cat: ArchiveFile['category']) => {
    switch (cat) {
      case 'Draft':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Source':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Interview':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Media':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Published':
        return 'bg-slate-100 text-slate-800 border-slate-300';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const handleDownloadDirect = (file: ArchiveFile) => {
    if (file.fileType === 'TXT') {
      exportArticleFile('txt');
    } else {
      exportArticleFile('json');
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F6F7F8] overflow-hidden select-none">
      {/* Archive Header */}
      <div className="bg-white border-b border-[#E3E6E9] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-[#20252C] flex items-center gap-2">
            <FolderArchive className="w-4 h-4 text-[#2457D6]" />
            <span>취재 및 원고 보관함 (Unified File Repository)</span>
          </h2>
          <p className="text-[11px] text-[#626C78] mt-0.5">
            기사 작성부터 자료, 인터뷰 녹취, 미디어, 파생본까지 통합 관리 (동일 ID: {article.id})
          </p>
        </div>

        {/* Global Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportArticleFile('txt')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2457D6] hover:bg-[#1D46AF] text-white rounded text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>기사 전문 TXT 다운로드</span>
          </button>
          <button
            onClick={() => exportArticleFile('json')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>전체 JSON 데이터</span>
          </button>
        </div>
      </div>

      {/* Category Filter Pills & Notice */}
      <div className="bg-white px-6 py-2.5 border-b border-[#E3E6E9] flex items-center justify-between gap-2 overflow-x-auto text-xs">
        <div className="flex items-center gap-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-[#20252C] text-white font-semibold'
                  : 'bg-slate-100 text-[#626C78] hover:text-[#20252C]'
              }`}
            >
              {cat} ({cat === '전체' ? archiveFiles.length : archiveFiles.filter(f => f.category === cat).length})
            </button>
          ))}
        </div>

        <span className="text-[11px] text-slate-400 font-mono">
          총 {filteredFiles.length}개 파일 보존 중
        </span>
      </div>

      {/* Files Table List */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-lg border border-[#E3E6E9] shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F6F7F8] border-b border-[#E3E6E9] text-[11px] font-semibold text-[#626C78] font-mono">
              <tr>
                <th className="py-2.5 px-4">파일명 및 속성</th>
                <th className="py-2.5 px-3">분류 (재분류 가능)</th>
                <th className="py-2.5 px-3">종류</th>
                <th className="py-2.5 px-3">용량</th>
                <th className="py-2.5 px-3">상태 설명</th>
                <th className="py-2.5 px-3 text-right">내보내기</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E6E9]">
              {filteredFiles.map(file => {
                return (
                  <tr key={file.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Filename */}
                    <td className="py-3 px-4 font-mono font-medium text-[#20252C]">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[260px]" title={file.filename}>
                          {file.filename}
                        </span>
                      </div>
                    </td>

                    {/* Category Selector (Re-classification) */}
                    <td className="py-3 px-3">
                      <select
                        value={file.category}
                        onChange={e =>
                          reclassifyFile(
                            file.id,
                            e.target.value as ArchiveFile['category']
                          )
                        }
                        className={`text-[11px] font-bold px-2 py-0.5 rounded border cursor-pointer focus:outline-hidden ${getCategoryColor(
                          file.category
                        )}`}
                      >
                        <option value="Draft">Draft</option>
                        <option value="Source">Source</option>
                        <option value="Interview">Interview</option>
                        <option value="Media">Media</option>
                        <option value="Published">Published</option>
                      </select>
                    </td>

                    {/* Original vs Derivative */}
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                          file.isDerivative
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {file.isDerivative ? '파생본' : '원본 (Master)'}
                      </span>
                    </td>

                    {/* Size */}
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-500 tabular-nums">
                      {file.size}
                    </td>

                    {/* Status Text */}
                    <td className="py-3 px-3 text-xs text-[#626C78]">
                      {file.statusText}
                    </td>

                    {/* Download Action */}
                    <td className="py-3 px-3 text-right">
                      {file.canExport ? (
                        <button
                          onClick={() => handleDownloadDirect(file)}
                          className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium transition-colors inline-flex items-center gap-1"
                        >
                          <Download className="w-3 h-3 text-slate-500" />
                          <span>다운로드</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-300 font-mono">
                          내부 보존
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Audit & Legal Archive Notice */}
        <div className="mt-4 p-3 bg-white rounded-lg border border-[#E3E6E9] text-[11px] text-[#626C78] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>모든 취재 파일은 로컬 암호화 저장소에 보존되며 세션 종료 후에도 복원됩니다.</span>
          </div>
          <span className="text-slate-400 font-mono">Status: Local Persisted</span>
        </div>
      </div>
    </div>
  );
};
