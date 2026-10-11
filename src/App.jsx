import React, { lazy, Suspense, useState } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ArticleWriter from "./components/ArticleWriter";

const SourceSearch = lazy(() => import("./components/SourceSearch"));
const InterviewStudio = lazy(() => import("./components/interview/InterviewStudio"));
const FormatConverter = lazy(() => import("./components/FormatConverter"));
const ArchiveView = lazy(() => import("./components/ArchiveView"));

import { initialArticles, mockFactCheckIssues } from "./data/mockData";

export default function App() {
  const [activeTab, setActiveTab] = useState("writer");
  const [article, setArticle] = useState(initialArticles[0]);

  // Sidebar collapse state (기본 상태: 세로로 긴 Slim Sidebar 접힘 상태)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  // Fact check sequential state
  const [factCheckActive, setFactCheckActive] = useState(false);
  const [factCheckIssues] = useState(mockFactCheckIssues);
  const [activeFactIndex, setActiveFactIndex] = useState(0);

  // Quick Source Search Modal inside Article Writer
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Right side tools tab collapse state
  const [isToolsCollapsed, setIsToolsCollapsed] = useState(false);

  const handleRunFactCheck = () => {
    setFactCheckActive(true);
    setActiveFactIndex(0);
    setActiveTab("writer");
  };

  const handleApplyFactFix = () => {
    const currentIssue = factCheckIssues[activeFactIndex];
    if (currentIssue) {
      const updatedContent = article.content.replace(currentIssue.targetText, currentIssue.suggestion);
      setArticle({ ...article, content: updatedContent });
    }

    if (activeFactIndex + 1 < factCheckIssues.length) {
      setActiveFactIndex(activeFactIndex + 1);
    } else {
      alert("모든 팩트체크 검증 항목이 수정 또는 처리 완료되었습니다.");
      setFactCheckActive(false);
      setArticle((prev) => ({ ...prev, status: "검증 완료" }));
    }
  };

  const handleSkipFactFix = () => {
    if (activeFactIndex + 1 < factCheckIssues.length) {
      setActiveFactIndex(activeFactIndex + 1);
    } else {
      alert("팩트체크 순서형 검사가 종료되었습니다.");
      setFactCheckActive(false);
    }
  };

  const handleConnectSource = (source) => {
    const citation = `\n\n[출처 참고: ${source.title} (${source.category})]`;
    setArticle((prev) => ({
      ...prev,
      content: prev.content + citation,
      linkedSources: Array.from(new Set([...prev.linkedSources, source.id]))
    }));
    setShowSearchModal(false);
    alert(`"${source.title}" 자료가 작성 기사의 출처로 연결되었습니다.`);
  };

  const handleReturnFromInterview = (editedTranscript) => {
    if (editedTranscript) {
      const interviewQuote = `\n\n[인터뷰 발췌 녹취: ${editedTranscript.slice(0, 80)}...]`;
      setArticle((prev) => ({ ...prev, content: prev.content + interviewQuote }));
    }
    setActiveTab("writer");
  };

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-[#F4A940] selection:text-white bg-transparent text-[#292929]">
      {/* 1. Top Header */}
      <Header currentArticleTitle={article.title} status={article.status} />

      {/* 2. Main Workspace Layout: Floating Slim Sidebar & Warm Minimal Workspace */}
      <div className="flex flex-1 w-full relative min-h-[calc(100vh-70px)] pl-3 md:pl-5 pr-3 md:pr-6 py-2 gap-4 md:gap-5 items-start">
        {/* Left Sidebar attached to edge */}
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />

        {/* Main Content Workspace (우측 여백 없이 전체 너비 자연스럽게 채움) */}
        <Suspense fallback={<div className="flex-1 py-24 text-center text-sm text-slate-500">화면을 불러오는 중…</div>}>
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 z-20 relative mr-0">
          {activeTab === "writer" || activeTab === "publish" ? (
            <ArticleWriter
              article={article}
              setArticle={setArticle}
              onOpenSearch={() => setShowSearchModal(true)}
              onRunFactCheck={handleRunFactCheck}
              factCheckActive={factCheckActive}
              factCheckIssues={factCheckIssues}
              activeFactIndex={activeFactIndex}
              onApplyFactFix={handleApplyFactFix}
              onSkipFactFix={handleSkipFactFix}
              isToolsCollapsed={isToolsCollapsed}
              setIsToolsCollapsed={setIsToolsCollapsed}
            />
          ) : activeTab === "interview" ? (
            <main className="flex-1 py-7 px-5 md:px-10 min-w-0 transition-all z-20">
              <InterviewStudio onReturnToArticle={handleReturnFromInterview} />
            </main>
          ) : activeTab === "archive" ? (
            <main className="flex-1 min-w-0 transition-all z-20 py-2">
              <ArchiveView />
            </main>
          ) : (
            <main className="main-warm-container flex-1 py-7 px-5 md:px-10 min-w-0 transition-all z-20">
              {activeTab === "search" && (
                <SourceSearch onConnectToArticle={handleConnectSource} />
              )}

              {activeTab === "convert" && (
                <FormatConverter currentArticle={article} />
              )}
            </main>
          )}
        </div>
        </Suspense>
      </div>

      {/* Quick Source Search Modal during Writing */}
      <Suspense fallback={null}>
      {showSearchModal && (
        <SourceSearch
          isModal={true}
          onClose={() => setShowSearchModal(false)}
          onConnectToArticle={handleConnectSource}
        />
      )}
      </Suspense>
    </div>
  );
}
