import React, { useState } from "react";
import Header from "./components/Header";
import ProcessBar from "./components/ProcessBar";
import Sidebar from "./components/Sidebar";
import ArticleWriter from "./components/ArticleWriter";
import SourceSearch from "./components/SourceSearch";
import InterviewStudio from "./components/interview/InterviewStudio";
import FormatConverter from "./components/FormatConverter";
import ArchiveView from "./components/ArchiveView";

import { initialArticles, mockFactCheckIssues } from "./data/mockData";

export default function App() {
  const [activeTab, setActiveTab] = useState("writer");
  const [article, setArticle] = useState(initialArticles[0]);

  // Sidebar collapse state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Fact check sequential state
  const [factCheckActive, setFactCheckActive] = useState(false);
  const [factCheckIssues] = useState(mockFactCheckIssues);
  const [activeFactIndex, setActiveFactIndex] = useState(0);

  // Quick Source Search Modal inside Article Writer
  const [showSearchModal, setShowSearchModal] = useState(false);

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
    <div className="min-h-screen flex flex-col font-sans selection:bg-slate-900 selection:text-white">
      {/* 1. Top Header */}
      <Header currentArticleTitle={article.title} status={article.status} />

      {/* 2. Main Workspace Layout: Outer Big Glass Box Removed, Sidebar & Main Curvature preserved */}
      <div className="flex flex-1 w-full relative overflow-x-hidden min-h-[calc(100vh-65px)] p-3 md:p-4 gap-3 md:gap-4">
        {/* Left Sidebar attached to edge */}
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />

        {/* Main Content Wrapper with Top Binder Navigation */}
        <div className="flex-1 flex flex-col min-w-0 transition-all z-20">
          {/* Top Process Binder Navigation - 녹음 파일(interview) 화면에서는 숨김 */}
          {activeTab !== "interview" && (
            <ProcessBar 
              activeTab={activeTab}
              setActiveTab={(tab) => {
                if (tab === "factcheck") {
                  handleRunFactCheck();
                } else {
                  setActiveTab(tab);
                }
              }}
            />
          )}

          {/* Main Content Solid Box */}
          <main className="main-curved-content flex-1 py-6 px-4 md:px-8 min-w-0 transition-all">
            {activeTab === "writer" && (
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
              />
            )}

            {activeTab === "search" && (
              <SourceSearch onConnectToArticle={handleConnectSource} />
            )}

            {activeTab === "interview" && (
              <InterviewStudio onReturnToArticle={handleReturnFromInterview} />
            )}

            {/* 작성·검토 메인 화면 (미리보기 및 편집 통합) */}
            {activeTab === "publish" && (
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
              />
            )}

            {activeTab === "convert" && (
              <FormatConverter />
            )}

            {activeTab === "archive" && (
              <ArchiveView />
            )}
          </main>
        </div>
      </div>

      {/* Quick Source Search Modal during Writing */}
      {showSearchModal && (
        <SourceSearch
          isModal={true}
          onClose={() => setShowSearchModal(false)}
          onConnectToArticle={handleConnectSource}
        />
      )}
    </div>
  );
}
