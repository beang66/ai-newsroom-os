import React, { useState } from "react";
import { Search, Calendar, Link2, Check, Filter } from "lucide-react";
import { mockSources } from "../data/mockData";

export default function SourceSearch({ onConnectToArticle, isModal = false, onClose }) {
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

  const containerClasses = isModal
    ? "bg-white/95 backdrop-blur-xl rounded-3xl p-6 md:p-8 max-w-4xl w-full shadow-2xl border border-white space-y-6 max-h-[90vh] overflow-y-auto"
    : "max-w-5xl mx-auto py-6 px-4 space-y-6 animate-float-in";

  return (
    <div className={isModal ? "fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4" : ""}>
      <div className={containerClasses}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <Search className="w-5 h-5 text-slate-800" />
              자체 취재자료 검색
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-semibold">
              내부 저장소에 저장된 공식문서, 통계, 회의록, 취재자료를 검색하고 기사 출처로 연결합니다.
            </p>
          </div>
          {isModal && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-2xl font-bold px-2 cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        {/* Search Bar & Category Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="자료 제목, 키워드, 내용 검색 (예: NPU, 전력망, 통계)"
              className="w-full pl-12 pr-4 py-3 bg-white/70 backdrop-blur-xs border border-white/80 rounded-2xl text-slate-900 text-sm font-semibold outline-none focus:border-slate-800 shadow-inner transition"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white/60 hover:bg-white text-slate-600 border border-white/80"
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
              <div className="p-8 text-center text-slate-400 text-xs">검색 결과가 없습니다.</div>
            ) : (
              filteredSources.map((item) => {
                const isSelected = selectedSource?.id === item.id;
                const isConnected = connectedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedSource(item)}
                    className={`p-4 rounded-2xl border transition cursor-pointer ${
                      isSelected
                        ? "bg-white border-slate-900 shadow-sm ring-2 ring-slate-900/10"
                        : "bg-white/60 border-white/80 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-extrabold px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md">
                        {item.category}
                      </span>
                      <span className="text-[11px] text-slate-400 flex items-center gap-1 font-semibold">
                        <Calendar className="w-3 h-3" /> {item.date}
                      </span>
                    </div>

                    <h4 className="text-sm font-extrabold text-slate-900 line-clamp-1">{item.title}</h4>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">{item.snippet}</p>

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
          <div className="md:col-span-7 glass-card p-6 flex flex-col justify-between space-y-4">
            {selectedSource ? (
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                      {selectedSource.category}
                    </span>
                    <span className="text-xs text-slate-400 font-semibold">{selectedSource.date} 수집</span>
                  </div>

                  <h3 className="text-lg font-extrabold text-slate-900">{selectedSource.title}</h3>

                  <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/60 text-xs text-slate-700 space-y-2 leading-relaxed">
                    <p className="font-extrabold text-slate-900">핵심 스니펫 요약:</p>
                    <p>{selectedSource.snippet}</p>
                  </div>

                  <div className="text-xs text-slate-600 space-y-2">
                    <p className="font-extrabold text-slate-900">상세 보관 내용:</p>
                    <p className="leading-relaxed bg-white p-3 rounded-xl border border-slate-200">
                      {selectedSource.content}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-semibold">자체 보안 DB 보관 문서</span>
                  <button
                    onClick={() => handleConnect(selectedSource)}
                    className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
                      connectedIds.includes(selectedSource.id)
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-900/20"
                    }`}
                  >
                    <Link2 className="w-4 h-4 text-slate-200" />
                    {connectedIds.includes(selectedSource.id) ? "연결 완료 (기사 적용됨)" : "기사에 출처 연결"}
                  </button>
                </div>
              </>
            ) : (
              <div className="m-auto text-center text-slate-400 text-sm">자료를 선택하면 상세 내용을 확인하고 연결할 수 있습니다.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
