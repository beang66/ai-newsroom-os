import React, { useState } from 'react';
import {
  Image,
  Crop,
  CheckCircle2,
  FileCheck,
  Plus,
  SlidersHorizontal,
  ChevronLeft,
  Sparkles,
} from 'lucide-react';
import { useNewsroom } from '../context/NewsroomContext';
import { AspectRatioType, MediaAsset } from '../types';
import { EditorialAssetGraphic } from './EditorialAssetGraphic';

export const MediaPanel: React.FC = () => {
  const {
    article,
    mediaAssets,
    updateFeaturedImageAspect,
    updateFeaturedImageMeta,
    setLeftNavView,
  } = useNewsroom();

  const [selectedAsset, setSelectedAsset] = useState<MediaAsset>(mediaAssets[0]);
  const [captionInput, setCaptionInput] = useState(article.featuredImage.caption);
  const [creditInput, setCreditInput] = useState(article.featuredImage.credit);

  const ratios: AspectRatioType[] = ['16:9', '4:3', '1:1'];

  const handleRatioChange = (r: AspectRatioType) => {
    updateFeaturedImageAspect(r);
  };

  const handleSaveMeta = () => {
    updateFeaturedImageMeta(captionInput, creditInput);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F6F7F8] overflow-hidden select-none">
      {/* Header */}
      <div className="bg-white border-b border-[#E3E6E9] p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLeftNavView('editor')}
            className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors"
            title="기사 편집기로 돌아가기"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-semibold text-sm text-[#20252C]">취재 미디어 자산 및 규격</h2>
            <p className="text-[11px] text-[#626C78]">
              원본 이미지 보존 및 플랫폼별 파생 규격(16:9, 4:3, 1:1) 관리
            </p>
          </div>
        </div>

        <span className="text-[11px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded border border-[#E3E6E9]">
          총 {mediaAssets.length}개 미디어
        </span>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col lg:flex-row gap-6">
        {/* Left: Active Featured Preview & Crop Tool */}
        <div className="flex-1 bg-white p-5 rounded-lg border border-[#E3E6E9] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#20252C] flex items-center gap-1.5">
              <Crop className="w-3.5 h-3.5 text-[#2457D6]" />
              발행 대표 이미지 규격 설정
            </span>

            {/* Ratio Selector Buttons */}
            <div className="flex items-center gap-1 bg-[#F6F7F8] p-1 rounded border border-[#E3E6E9]">
              {ratios.map(r => (
                <button
                  key={r}
                  onClick={() => handleRatioChange(r)}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors ${
                    article.featuredImage.aspectRatio === r
                      ? 'bg-white text-[#2457D6] shadow-xs font-bold'
                      : 'text-[#626C78] hover:text-[#20252C]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Graphic Container according to selected ratio */}
          <div className="w-full rounded-lg overflow-hidden border border-[#E3E6E9] bg-slate-900 flex items-center justify-center">
            <EditorialAssetGraphic
              variant="energy_substation"
              aspectRatio={article.featuredImage.aspectRatio}
              className="w-full max-h-[360px]"
            />
          </div>

          {/* Caption & Credit Inputs */}
          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-[11px] font-medium text-[#626C78] mb-1">
                보도 사진 캡션 (사진 설명)
              </label>
              <textarea
                value={captionInput}
                onChange={e => setCaptionInput(e.target.value)}
                onBlur={handleSaveMeta}
                rows={2}
                className="w-full text-xs p-2 bg-[#F6F7F8] border border-[#E3E6E9] rounded focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2457D6]"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-[#626C78] mb-1">
                  출처 및 제공 (크레딧)
                </label>
                <input
                  type="text"
                  value={creditInput}
                  onChange={e => setCreditInput(e.target.value)}
                  onBlur={handleSaveMeta}
                  className="w-full text-xs p-2 bg-[#F6F7F8] border border-[#E3E6E9] rounded focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2457D6]"
                />
              </div>

              <button
                onClick={handleSaveMeta}
                className="mt-5 px-3 py-2 bg-[#2457D6] hover:bg-[#1D46AF] text-white rounded text-xs font-medium transition-colors shrink-0"
              >
                메타 저장
              </button>
            </div>
          </div>
        </div>

        {/* Right: Media Library (Original vs Derivative) */}
        <div className="w-full lg:w-[320px] bg-white p-4 rounded-lg border border-[#E3E6E9] shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#E3E6E9] pb-2">
            <h3 className="text-xs font-semibold text-[#20252C]">취재 미디어 보관함</h3>
            <span className="text-[11px] text-slate-400">원본 / 파생본 분리</span>
          </div>

          <div className="space-y-2.5">
            {mediaAssets.map(asset => {
              const isFeatured = article.featuredImage.assetId === asset.id;

              return (
                <div
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset)}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all space-y-1.5 ${
                    selectedAsset.id === asset.id
                      ? 'border-[#2457D6] bg-blue-50/30'
                      : 'border-[#E3E6E9] hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                        asset.type === 'original'
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      }`}
                    >
                      {asset.type === 'original' ? '원본 (Master)' : '파생본 (규격 변환)'}
                    </span>

                    <span className="text-[10px] font-mono text-slate-400">
                      {asset.aspectRatio} · {asset.fileSize}
                    </span>
                  </div>

                  <div className="font-medium text-xs text-[#20252C] truncate">
                    {asset.title}
                  </div>

                  <div className="text-[11px] text-[#626C78] line-clamp-2">
                    {asset.caption}
                  </div>

                  <div className="text-[10px] text-slate-400 font-mono">
                    제공: {asset.credit}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
