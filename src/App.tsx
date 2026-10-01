import React from 'react';
import { NewsroomProvider, useNewsroom } from './context/NewsroomContext';
import { Header } from './components/Header';
import { NavigationRail } from './components/NavigationRail';
import { EditorView } from './components/EditorView';
import { RightReviewPanel } from './components/RightReviewPanel';
import { SourceSearchPanel } from './components/SourceSearchPanel';
import { InterviewPanel } from './components/InterviewPanel';
import { MediaPanel } from './components/MediaPanel';
import { PublishingPrepView } from './components/PublishingPrepView';
import { PlatformConversionView } from './components/PlatformConversionView';
import { ArchiveView } from './components/ArchiveView';

const WorkspaceShell: React.FC = () => {
  const { workMode, leftNavView, isFocusMode } = useNewsroom();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#F6F7F8] text-[#20252C]">
      {/* Top Header (58px) */}
      <Header />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Navigation (Hidden in Focus Mode) */}
        {!isFocusMode && <NavigationRail />}

        {/* Center Viewport Switcher */}
        {workMode === 'draft_review' && (
          <>
            {leftNavView === 'editor' && <EditorView />}
            {leftNavView === 'source_search' && <SourceSearchPanel />}
            {leftNavView === 'interview' && <InterviewPanel />}
            {leftNavView === 'media' && <MediaPanel />}

            {/* Right Review Panel (Hidden in Focus Mode) */}
            {!isFocusMode && <RightReviewPanel />}
          </>
        )}

        {workMode === 'publishing_prep' && <PublishingPrepView />}

        {workMode === 'platform_transform' && <PlatformConversionView />}

        {workMode === 'archive' && <ArchiveView />}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <NewsroomProvider>
      <WorkspaceShell />
    </NewsroomProvider>
  );
}
