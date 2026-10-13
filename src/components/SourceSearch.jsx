import React, { useState } from "react";
import { Search, Calendar, Link2, Check, Filter, X } from "lucide-react";
import { mockSources } from "../data/mockData";

export default function SourceSearch({ onConnectToArticle, isModal = false, isSidePanel = false, onClose }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [selectedSource, setSelectedSource] = useState(mockSources[0]);
  const [connectedIds, setConnectedIds] = useState([]);

  const categories = ["전체", "공식문서", "통계", "회의록", "취재자료"];

  const filteredSources = mockSources.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.snippet.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "전체" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleConnect = (source) => {
    if (!connectedIds.includes(source.id)) {
      setConnectedIds([...connectedIds, source.id]);
    }
    if (onConnectToArticle) {
      onConnectToArticle(source);
    }
  };

  if (isSidePanel) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* 상단 헤더 */}
        <div className="p-4 md:p-5 border-b border-slate-200/90 flex items-center justify-between bg-slate-50/70 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#23211F] text-white flex items-center justify-center shadow-xs">
              <Search className="w-4 h-4 text-[#D8C76A]" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span>자체 취재자료 검색</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  DB 연동
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                취재자료를 검색하고 기사 출처로 바로 연결합니다
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-[#23211F] hover:bg-[#EFECE6] transition cursor-pointer"
              title="패널 닫기"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 검색창 & 카테고리 필터 */}
        <div className="p-3.5 border-b border-slate-100 space-y-2.5 bg-slate-50/40 flex-shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="자료 제목, 키워드 검색 (예: NPU, 전력망)"
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-slate-800 transition"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${selectedCategory === cat
                    ? "bg-[#292B2F] text-[#FAF8F5] shadow-xs"
                    : "bg-slate-100 hover:bg-slate-200/80 text-slate-600"
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* 스크롤 가능한 자료 리스트 및 상세 연결 */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {filteredSources.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs font-medium">검색 결과가 없습니다.</div>
          ) : (
            filteredSources.map((item) => {
              const isSelected = selectedSource?.id === item.id;
              const isConnected = connectedIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedSource(item)}
                  className={`p-3 rounded-2xl border transition cursor-pointer ${isSelected
                      ? "bg-white border-[#292B2F] shadow-xs ring-1 ring-[#292B2F]/20"
                      : "bg-slate-50/70 border-slate-200 hover:bg-white"
                    }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-extrabold px-2 py-0.5 bg-slate-200/80 text-slate-800 rounded-md">
                      {item.category}
                    </span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 font-semibold">
                      <Calendar className="w-3 h-3" /> {item.date}
                    </span>
                  </div>

                  <h4 className="text-xs font-extrabold text-slate-900 line-clamp-1">{item.title}</h4>
                  <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 leading-relaxed">{item.snippet}</p>

                  {/* 선택된 자료 미리보기 & 연결 버튼 */}
                  {isSelected && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-2">
                      <p className="text-[11px] text-slate-700 bg-slate-50 p-2 rounded-lg leading-relaxed line-clamp-3">
                        {item.content}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-400">자체 DB 보관</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConnect(item);
                          }}
                          className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 ${isConnected
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : "bg-[#292B2F] hover:bg-[#1F2124] text-[#FAF8F5] shadow-xs active:scale-95"
                            }`}
                        >
                          <Link2 className="w-3.5 h-3.5 text-[#D8C76A]" />
                          {isConnected ? "연결 완료" : "기사에 출처 연결"}
                        </button>
                      </div>
                    </div>
                  )}

                  {!isSelected && isConnected && (
                    <div className="mt-1.5 text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                      <Check className="w-3 h-3" /> 기사에 연결됨
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  const containerClasses = isModal
    ? "bg-white/96 backdrop-blur-2xl rounded-3xl p-6 md:p-8 max-w-4xl w-full shadow-[0_24px_64px_-12px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,1)] border border-white ring-1 ring-stone-900/10 space-y-6 max-h-[90vh] overflow-y-auto animate-smooth-pop"
    : "w-full py-6 px-4 space-y-6 animate-float-in";

  return (
    <div className={isModal ? "fixed inset-0 z-50 bg-stone-950/45 backdrop-blur-md flex items-center justify-center p-4 animate-smooth-in" : ""}>
      <div className={containerClasses}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E7E2D9] pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-[#292B2F] flex items-center gap-2">
              <Search className="w-5 h-5 text-[#292B2F]" />
              자체 취재자료 검색
            </h2>
            <p className="text-xs text-[#8E8982] mt-1 font-semibold">
              내부 저장소에 저장된 공식문서, 통계, 회의록, 취재자료를 검색하고 기사 출처로 연결합니다.
            </p>
          </div>
          {isModal && (
            <button
              onClick={onClose}
              className="text-[#8E8982] hover:text-[#292B2F] text-2xl font-bold px-2 cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        {/* Search Bar & Category Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-5 h-5 text-[#8E8982] absolute left-4 top-3.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="자료 제목, 키워드, 내용 검색 (예: NPU, 전력망, 통계)"
              className="w-full pl-12 pr-4 py-3 bg-white border border-[#E7E2D9] rounded-2xl text-[#292B2F] text-sm font-semibold outline-none focus:border-[#292B2F] shadow-2xs transition"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Filter className="w-4 h-4 text-[#8E8982] flex-shrink-0" />
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer ${selectedCategory === cat
                    ? "bg-[#292B2F] text-[#FAF8F5] shadow-xs"
                    : "bg-[#E7E2D9] hover:bg-[#DFD9CE] text-[#57514A]"
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid Layout: Search List + Detail View */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[380px]">
          {/* Result List */}
          <div className="md:col-span-5 space-y-3 max-h-[440px] overflow-y-auto pr-1">
            {filteredSources.length === 0 ? (
              <div className="p-8 text-center text-[#8E8982] text-xs">검색 결과가 없습니다.</div>
            ) : (
              filteredSources.map((item) => {
                const isSelected = selectedSource?.id === item.id;
                const isConnected = connectedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedSource(item)}
                    className={`p-4 rounded-2xl border transition cursor-pointer ${isSelected
                        ? "bg-white border-[#292B2F] shadow-sm ring-1 ring-[#292B2F]/20"
                        : "bg-white/70 border-[#E7E2D9] hover:bg-white"
                      }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-extrabold px-2 py-0.5 bg-[#E7E2D9] text-[#292B2F] rounded-md">
                        {item.category}
                      </span>
                      <span className="text-[11px] text-[#8E8982] flex items-center gap-1 font-semibold">
                        <Calendar className="w-3 h-3" /> {item.date}
                      </span>
                    </div>

                    <h4 className="text-sm font-extrabold text-[#292B2F] line-clamp-1">{item.title}</h4>
                    <p className="text-xs text-[#57514A] mt-1 line-clamp-2 leading-relaxed">{item.snippet}</p>

                    {isConnected && (
                      <div className="mt-2 text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                        <Check className="w-3 h-3" /> 기사에 연결됨
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Detailed Document View */}
          <div className="md:col-span-7 bg-[#EFECE6] rounded-2xl border border-[#E7E2D9] p-6 flex flex-col justify-between space-y-4">
            {selectedSource ? (
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-[#E7E2D9] pb-3">
                    <span className="text-xs font-bold text-[#292B2F] bg-white px-2.5 py-1 rounded-lg border border-[#E7E2D9]">
                      {selectedSource.category}
                    </span>
                    <span className="text-xs text-[#8E8982] font-semibold">{selectedSource.date} 수집</span>
                  </div>

                  <h3 className="text-lg font-extrabold text-[#292B2F]">{selectedSource.title}</h3>

                  <div className="bg-white p-4 rounded-xl border border-[#E7E2D9] text-xs text-[#57514A] space-y-2 leading-relaxed">
                    <p className="font-extrabold text-[#292B2F]">핵심 스니펫 요약:</p>
                    <p>{selectedSource.snippet}</p>
                  </div>

                  <div className="text-xs text-[#57514A] space-y-2">
                    <p className="font-extrabold text-[#292B2F]">상세 보관 내용:</p>
                    <p className="leading-relaxed bg-white p-3 rounded-xl border border-[#E7E2D9]">
                      {selectedSource.content}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E7E2D9] flex items-center justify-between">
                  <span className="text-xs text-[#8E8982] font-semibold">자체 보안 DB 보관 문서</span>
                  <button
                    onClick={() => handleConnect(selectedSource)}
                    className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${connectedIds.includes(selectedSource.id)
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-[#292B2F] hover:bg-[#1F2124] text-[#FAF8F5] shadow-xs"
                      }`}
                  >
                    <Link2 className="w-4 h-4 text-[#D8C76A]" />
                    {connectedIds.includes(selectedSource.id) ? "연결 완료 (기사 적용됨)" : "기사에 출처 연결"}
                  </button>
                </div>
              </>
            ) : (
              <div className="m-auto text-center text-[#8E8982] text-sm">자료를 선택하면 상세 내용을 확인하고 연결할 수 있습니다.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
