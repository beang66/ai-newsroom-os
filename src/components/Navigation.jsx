import React from "react";
import { 
  PenTool, 
  CheckCircle2, 
  Send, 
  FolderArchive,
  BookOpen
} from "lucide-react";

export default function Navigation({ activeTab, setActiveTab, currentArticleTitle }) {
  const menuItems = [
    { id: "writer", label: "1. 기사 작성", icon: PenTool },
    { id: "factcheck", label: "2. 기사 검증", icon: CheckCircle2 },
    { id: "publish", label: "3. 발행 준비", icon: Send },
    { id: "archive", label: "4. 보관함", icon: FolderArchive }
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#e5e1dc]/80 backdrop-blur-xl border-b border-[#d8d0c7] px-5 py-3 transition-all shadow-xs">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left Top Brand Title: AI NEWSROOM (깔끔한 모던 폰트 적용) */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#4a2c20] flex items-center justify-center text-amber-50 shadow-md shadow-[#4a2c20]/30 border border-[#382017]">
            <BookOpen className="w-5 h-5 text-amber-100" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-[#382017] tracking-tight font-sans">AI NEWSROOM</h1>
              <span className="px-2 py-0.5 text-[11px] font-bold bg-[#f4eee9] text-[#5c382a] rounded-full border border-[#dfd5cb]">
                동아일보 AI
              </span>
            </div>
            <p className="text-xs text-[#736357] truncate max-w-[280px]">
              {currentArticleTitle ? `작성 원고: ${currentArticleTitle}` : "기자 전용 스마트 뉴스룸"}
            </p>
          </div>
        </div>

        {/* Top Header Navigation Tabs */}
        <nav className="flex items-center gap-1.5 bg-[#dad4cc]/60 backdrop-blur-md p-1.5 rounded-2xl border border-[#cdc4b8]">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-[#4a2c20] text-amber-50 shadow-md shadow-[#4a2c20]/25 font-bold"
                    : "text-[#5c4e46] hover:text-[#382017] hover:bg-white/60"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-amber-200" : "text-[#7c6c62]"}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
