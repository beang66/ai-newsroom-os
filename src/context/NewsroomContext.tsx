import React, { createContext, useContext, useState, useEffect, useRef, useTransition } from 'react';
import {
  Article,
  WorkMode,
  LeftNavView,
  RightPanelTab,
  VerificationIssue,
  OutlineNode,
  SourceDocument,
  InterviewRecording,
  MediaAsset,
  ArchiveFile,
  IssueStatus,
  AspectRatioType,
  ArticleCategory,
} from '../types';
import {
  INITIAL_ARTICLE,
  INITIAL_OUTLINE_NODES,
  INITIAL_VERIFICATION_ISSUES,
  INITIAL_SOURCES,
  INITIAL_INTERVIEW,
  INITIAL_MEDIA_ASSETS,
  INITIAL_ARCHIVE_FILES,
} from '../data/initialData';

interface NewsroomContextType {
  // Navigation & View Mode
  workMode: WorkMode;
  setWorkMode: (mode: WorkMode) => void;
  leftNavView: LeftNavView;
  setLeftNavView: (view: LeftNavView) => void;
  rightPanelTab: RightPanelTab;
  setRightPanelTab: (tab: RightPanelTab) => void;
  isFocusMode: boolean;
  setIsFocusMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  isLeftRailCollapsed: boolean;
  setIsLeftRailCollapsed: (val: boolean | ((prev: boolean) => boolean)) => void;
  isRightPanelOpen: boolean;
  setIsRightPanelOpen: (val: boolean | ((prev: boolean) => boolean)) => void;

  // Article State & Save
  article: Article;
  saveStatus: 'saved' | 'saving' | 'error';
  updateArticleContent: (newContent: string) => void;
  updateArticleTitle: (newTitle: string) => void;
  updateArticleSubtitle: (newSubtitle: string) => void;
  updateArticleCategory: (newCategory: ArticleCategory) => void;
  applySuggestedTitle: (titleId: string) => void;
  applySuggestedExcerpt: (excerptId: string) => void;
  saveArticleManually: () => void;
  resetToInitialDemo: () => void;

  // Outline / Structure
  outlineNodes: OutlineNode[];
  selectedParagraphIndex: number | null;
  setSelectedParagraphIndex: (idx: number | null) => void;

  // Verification
  verificationIssues: VerificationIssue[];
  selectedIssueId: string | null;
  setSelectedIssueId: (id: string | null) => void;
  isVerifying: boolean;
  runFullVerification: () => void;
  updateIssueStatus: (issueId: string, status: IssueStatus) => void;
  applySpellingCorrection: (issueId: string) => void;
  linkSourceToIssue: (issueId: string, sourceId: string) => void;
  jumpToIssueSentence: (issueId: string) => void;
  highlightedSentence: string | null;
  setHighlightedSentence: (sentence: string | null) => void;

  // Sources & Search
  sources: SourceDocument[];
  sourceSearchQuery: string;
  setSourceSearchQuery: (q: string) => void;
  linkSourceToArticle: (sourceId: string) => void;
  unlinkSourceFromArticle: (sourceId: string) => void;
  openSourceSearchWithQuery: (query: string, issueId?: string) => void;
  activeIssueForSourceLink: string | null;
  setActiveIssueForSourceLink: (id: string | null) => void;
  sourceSearchState: 'idle' | 'searching' | 'empty' | 'failed';
  setSourceSearchState: (state: 'idle' | 'searching' | 'empty' | 'failed') => void;

  // Interview & Audio
  interview: InterviewRecording;
  audioCurrentTime: number;
  isAudioPlaying: boolean;
  audioPlaybackRate: number;
  setAudioPlaybackRate: (rate: number) => void;
  seekAudio: (timeSec: number) => void;
  toggleAudioPlay: () => void;
  returnToSentenceId: string | null;
  jumpToInterviewFromIssue: (issue: VerificationIssue) => void;
  returnToDraftFromInterview: () => void;
  updateEditedTranscript: (segmentId: string, newText: string) => void;
  interviewUploadStatus: 'ready' | 'processing' | 'failed';
  triggerSimulatedUpload: (status: 'ready' | 'processing' | 'failed') => void;

  // Media
  mediaAssets: MediaAsset[];
  updateFeaturedImageAspect: (ratio: AspectRatioType) => void;
  updateFeaturedImageMeta: (caption: string, credit: string) => void;

  // Platform Transformation
  newsletterDraft: string;
  setNewsletterDraft: (text: string) => void;
  snsDraft: string;
  setSnsDraft: (text: string) => void;
  regeneratePlatformCopy: (platform: 'newsletter' | 'sns') => void;
  syncPlatformWithMaster: (platform: 'newsletter' | 'sns') => void;

  // Archive & Export
  archiveFiles: ArchiveFile[];
  reclassifyFile: (fileId: string, newCategory: ArchiveFile['category']) => void;
  exportArticleFile: (format: 'txt' | 'json') => void;

  // Error simulation & AI privacy toggles
  isLocalProcessingOnly: boolean;
  setIsLocalProcessingOnly: (val: boolean) => void;
  simulateAIError: boolean;
  setSimulateAIError: (val: boolean) => void;
  simulateSaveError: boolean;
  setSimulateSaveError: (val: boolean) => void;
  aiErrorMessage: string | null;
}

const NewsroomContext = createContext<NewsroomContextType | null>(null);

const STORAGE_KEY = 'ai_newsroom_article_v1';
const STORAGE_ISSUES_KEY = 'ai_newsroom_issues_v1';
const STORAGE_SOURCES_KEY = 'ai_newsroom_sources_v1';

export const NewsroomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [, startTransition] = useTransition();

  // Navigation & panels
  const [workMode, setWorkMode] = useState<WorkMode>('draft_review');
  const [leftNavView, setLeftNavView] = useState<LeftNavView>('editor');
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('verification');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isLeftRailCollapsed, setIsLeftRailCollapsed] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  // Article state
  const [article, setArticle] = useState<Article>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.lastSavedTimestamp && parsed.lastSavedAt) {
          const parsedMs = Date.parse(parsed.lastSavedAt.replace(' ', 'T'));
          parsed.lastSavedTimestamp = isNaN(parsedMs) ? Date.now() : parsedMs;
        }
        return parsed;
      }
    } catch {
      // Fallback
    }
    return INITIAL_ARTICLE;
  });

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Outline
  const [outlineNodes, setOutlineNodes] = useState<OutlineNode[]>(INITIAL_OUTLINE_NODES);
  const [selectedParagraphIndex, setSelectedParagraphIndex] = useState<number | null>(null);

  // Verification Issues
  const [verificationIssues, setVerificationIssues] = useState<VerificationIssue[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ISSUES_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Fallback
    }
    return INITIAL_VERIFICATION_ISSUES;
  });
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [highlightedSentence, setHighlightedSentence] = useState<string | null>(null);

  // Sources
  const [sources, setSources] = useState<SourceDocument[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SOURCES_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Fallback
    }
    return INITIAL_SOURCES;
  });
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');
  const [sourceSearchState, setSourceSearchState] = useState<'idle' | 'searching' | 'empty' | 'failed'>('idle');
  const [activeIssueForSourceLink, setActiveIssueForSourceLink] = useState<string | null>(null);

  // Interview & Audio
  const [interview, setInterview] = useState<InterviewRecording>(INITIAL_INTERVIEW);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioPlaybackRate, setAudioPlaybackRate] = useState(1.0);
  const [returnToSentenceId, setReturnToSentenceId] = useState<string | null>(null);
  const [interviewUploadStatus, setInterviewUploadStatus] = useState<'ready' | 'processing' | 'failed'>('ready');
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Media
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(INITIAL_MEDIA_ASSETS);

  // Platform transform
  const [newsletterDraft, setNewsletterDraft] = useState(article.newsletterCopy);
  const [snsDraft, setSnsDraft] = useState(article.snsCopy);

  // Archive
  const [archiveFiles, setArchiveFiles] = useState<ArchiveFile[]>(INITIAL_ARCHIVE_FILES);

  // Privacy & Error simulation
  const [isLocalProcessingOnly, setIsLocalProcessingOnly] = useState(true);
  const [simulateAIError, setSimulateAIError] = useState(false);
  const [simulateSaveError, setSimulateSaveError] = useState(false);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);

  // Auto-save debounced within 3s
  const scheduleSave = (updatedArticle: Article) => {
    setSaveStatus('saving');
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (simulateSaveError) {
        setSaveStatus('error');
        return;
      }
      try {
        const now = new Date();
        const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        const finalArticle = {
          ...updatedArticle,
          lastSavedAt: timeStr,
          lastSavedTimestamp: now.getTime(),
          version: updatedArticle.version + 1,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(finalArticle));
        localStorage.setItem(STORAGE_ISSUES_KEY, JSON.stringify(verificationIssues));
        localStorage.setItem(STORAGE_SOURCES_KEY, JSON.stringify(sources));
        setArticle(finalArticle);
        setSaveStatus('saved');
      } catch (err) {
        console.error('Save failed:', err);
        setSaveStatus('error');
      }
    }, 1200); // 1.2s satisfies < 3s auto-save requirement
  };

  const updateArticleContent = (newContent: string) => {
    const isEdited = newContent !== article.content;
    const updated = {
      ...article,
      content: newContent,
      isEditedSinceReview: isEdited ? true : article.isEditedSinceReview,
    };
    setArticle(updated);
    scheduleSave(updated);

    // Update outline snippets dynamically
    const paragraphs = newContent.split('\n\n').filter(p => p.trim().length > 0);
    setOutlineNodes(prev =>
      prev.map((node, i) => {
        if (paragraphs[i]) {
          return {
            ...node,
            snippet: paragraphs[i].slice(0, 50) + (paragraphs[i].length > 50 ? '...' : ''),
          };
        }
        return node;
      })
    );
  };

  const updateArticleTitle = (newTitle: string) => {
    const updated = { ...article, title: newTitle, isEditedSinceReview: true };
    setArticle(updated);
    scheduleSave(updated);
  };

  const updateArticleSubtitle = (newSubtitle: string) => {
    const updated = { ...article, subtitle: newSubtitle, isEditedSinceReview: true };
    setArticle(updated);
    scheduleSave(updated);
  };

  const updateArticleCategory = (newCategory: ArticleCategory) => {
    const updated = { ...article, category: newCategory };
    setArticle(updated);
    scheduleSave(updated);
  };

  const applySuggestedTitle = (titleId: string) => {
    const target = article.suggestedTitles.find(t => t.id === titleId);
    if (!target) return;
    const updated = {
      ...article,
      title: target.title,
      isEditedSinceReview: true,
      suggestedTitles: article.suggestedTitles.map(t => ({
        ...t,
        applied: t.id === titleId,
      })),
    };
    setArticle(updated);
    scheduleSave(updated);
  };

  const applySuggestedExcerpt = (excerptId: string) => {
    const target = article.suggestedExcerpts.find(e => e.id === excerptId);
    if (!target) return;
    const updated = {
      ...article,
      subtitle: target.text,
      isEditedSinceReview: true,
      suggestedExcerpts: article.suggestedExcerpts.map(e => ({
        ...e,
        applied: e.id === excerptId,
      })),
    };
    setArticle(updated);
    scheduleSave(updated);
  };

  const saveArticleManually = () => {
    scheduleSave(article);
  };

  const resetToInitialDemo = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_ISSUES_KEY);
    localStorage.removeItem(STORAGE_SOURCES_KEY);
    const resetArticle = {
      ...INITIAL_ARTICLE,
      lastSavedTimestamp: Date.now(),
    };
    setArticle(resetArticle);
    setOutlineNodes(INITIAL_OUTLINE_NODES);
    setVerificationIssues(INITIAL_VERIFICATION_ISSUES);
    setSources(INITIAL_SOURCES);
    setInterview(INITIAL_INTERVIEW);
    setNewsletterDraft(INITIAL_ARTICLE.newsletterCopy);
    setSnsDraft(INITIAL_ARTICLE.snsCopy);
    setSaveStatus('saved');
    setAiErrorMessage(null);
  };

  // Verification handling
  const runFullVerification = () => {
    setIsVerifying(true);
    setAiErrorMessage(null);

    setTimeout(() => {
      if (simulateAIError) {
        setIsVerifying(false);
        setAiErrorMessage('원고 검증 엔진 연결 타임아웃 오류가 발생했습니다. (시뮬레이션 모드: 재시도 가능)');
        return;
      }

      const now = new Date();
      const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      setArticle(prev => ({
        ...prev,
        lastReviewedAt: timeStr,
        lastReviewedVersion: prev.version,
        isEditedSinceReview: false,
      }));

      // Re-evaluate spelling and claims against current content
      setVerificationIssues(prev =>
        prev.map(iss => {
          if (iss.category === '맞춤법' && iss.spellingCorrection) {
            const hasError = article.content.includes(iss.spellingCorrection.before);
            if (!hasError) {
              return { ...iss, status: 'confirmed', evidenceState: 'linked' };
            }
          }
          return iss;
        })
      );

      setIsVerifying(false);
    }, 900);
  };

  const updateIssueStatus = (issueId: string, status: IssueStatus) => {
    setVerificationIssues(prev =>
      prev.map(iss => (iss.id === issueId ? { ...iss, status } : iss))
    );
  };

  const applySpellingCorrection = (issueId: string) => {
    const issue = verificationIssues.find(i => i.id === issueId);
    if (!issue || !issue.spellingCorrection) return;

    const { before, after } = issue.spellingCorrection;
    if (article.content.includes(before)) {
      const newContent = article.content.replace(before, after);
      updateArticleContent(newContent);
    }

    updateIssueStatus(issueId, 'confirmed');
  };

  const linkSourceToIssue = (issueId: string, sourceId: string) => {
    const source = sources.find(s => s.id === sourceId);
    setVerificationIssues(prev =>
      prev.map(iss => {
        if (iss.id === issueId) {
          return {
            ...iss,
            linkedSourceId: sourceId,
            evidenceState: 'linked',
            evidenceNote: source ? `출처 연결됨: ${source.title} (${source.publisher})` : iss.evidenceNote,
          };
        }
        return iss;
      })
    );
    linkSourceToArticle(sourceId);
  };

  const jumpToIssueSentence = (issueId: string) => {
    const issue = verificationIssues.find(i => i.id === issueId);
    if (!issue) return;
    setSelectedIssueId(issueId);
    setHighlightedSentence(issue.sentenceText);
    setSelectedParagraphIndex(issue.paragraphIndex);

    // If not in draft mode, return to draft mode
    if (workMode !== 'draft_review') {
      setWorkMode('draft_review');
    }
    setLeftNavView('editor');
    setIsRightPanelOpen(true);
    setRightPanelTab('verification');
  };

  // Source Search
  const linkSourceToArticle = (sourceId: string) => {
    setSources(prev =>
      prev.map(s => (s.id === sourceId ? { ...s, isLinkedToArticle: true } : s))
    );
  };

  const unlinkSourceFromArticle = (sourceId: string) => {
    setSources(prev =>
      prev.map(s => (s.id === sourceId ? { ...s, isLinkedToArticle: false } : s))
    );
  };

  const openSourceSearchWithQuery = (query: string, issueId?: string) => {
    setSourceSearchQuery(query);
    if (issueId) {
      setActiveIssueForSourceLink(issueId);
    }
    setLeftNavView('source_search');
    setIsLeftRailCollapsed(true);
    setSourceSearchState('idle');
  };

  // Interview audio handling
  const seekAudio = (timeSec: number) => {
    setAudioCurrentTime(timeSec);
  };

  const toggleAudioPlay = () => {
    setIsAudioPlaying(prev => !prev);
  };

  // Simulated audio timer
  useEffect(() => {
    if (isAudioPlaying) {
      audioIntervalRef.current = setInterval(() => {
        setAudioCurrentTime(t => {
          if (t >= interview.durationSec) {
            setIsAudioPlaying(false);
            return 0;
          }
          return t + 1;
        });
      }, 1000 / audioPlaybackRate);
    } else if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
    }
    return () => {
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    };
  }, [isAudioPlaying, audioPlaybackRate, interview.durationSec]);

  const jumpToInterviewFromIssue = (issue: VerificationIssue) => {
    if (!issue.interviewQuoteRef) return;
    setReturnToSentenceId(issue.id);
    setSelectedIssueId(issue.id);
    setLeftNavView('interview');
    seekAudio(issue.interviewQuoteRef.timestampSec);
    setIsAudioPlaying(true);
  };

  const returnToDraftFromInterview = () => {
    setLeftNavView('editor');
    if (returnToSentenceId) {
      jumpToIssueSentence(returnToSentenceId);
    }
  };

  const updateEditedTranscript = (segmentId: string, newText: string) => {
    setInterview(prev => ({
      ...prev,
      editedTranscript: prev.editedTranscript.map(seg =>
        seg.id === segmentId ? { ...seg, text: newText } : seg
      ),
    }));
  };

  const triggerSimulatedUpload = (status: 'ready' | 'processing' | 'failed') => {
    setInterviewUploadStatus(status);
    if (status === 'processing') {
      setTimeout(() => {
        setInterviewUploadStatus('ready');
      }, 2000);
    }
  };

  // Media
  const updateFeaturedImageAspect = (ratio: AspectRatioType) => {
    setArticle(prev => ({
      ...prev,
      featuredImage: {
        ...prev.featuredImage,
        aspectRatio: ratio,
      },
    }));
  };

  const updateFeaturedImageMeta = (caption: string, credit: string) => {
    setArticle(prev => ({
      ...prev,
      featuredImage: {
        ...prev.featuredImage,
        caption,
        credit,
      },
    }));
  };

  // Platform transform
  const regeneratePlatformCopy = (platform: 'newsletter' | 'sns') => {
    if (platform === 'newsletter') {
      const generated = `[데스크 뉴스레터 브리핑 #142 - ${article.title.slice(0, 30)}...]
구독자 여러분, 오늘 아침 전해드리는 단독 취재는 전력망 송전 병목 현상에 관한 심층 분석입니다.

${article.content.slice(0, 320)}...

[핵심 쟁점 3줄 정리]
1. ${article.subtitle}
2. 비공개 보고서 및 산업부 계획 대비 공기 지연 누적
3. 용인 반도체 클러스터 가동 전 특별법 입법 통과 시급`;
      setNewsletterDraft(generated);
      setArticle(prev => ({ ...prev, newsletterLastSyncedVersion: prev.version }));
    } else {
      const generated = `[단독 속보] ${article.title}
⚡️ ${article.subtitle}

📍 주요 취재 요약:
• 발전소는 전기를 만들어도 송전선로 부족으로 멈춰 서고 있습니다.
• 취재팀 단독 녹취: 실무진과 수뇌부 간 상용화 일정 이견 확인
• 국회 상임위 특별법 계류 1년째...

자세한 분석 기사는 프로필 링크에서 확인하세요. (1/3) #에너지 #전력망 #반도체`;
      setSnsDraft(generated);
      setArticle(prev => ({ ...prev, snsLastSyncedVersion: prev.version }));
    }
  };

  const syncPlatformWithMaster = (platform: 'newsletter' | 'sns') => {
    regeneratePlatformCopy(platform);
  };

  // Archive
  const reclassifyFile = (fileId: string, newCategory: ArchiveFile['category']) => {
    setArchiveFiles(prev =>
      prev.map(f => (f.id === fileId ? { ...f, category: newCategory } : f))
    );
  };

  const exportArticleFile = (format: 'txt' | 'json') => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let blob: Blob;
    let filename: string;

    if (format === 'txt') {
      const textData = `[기사 원고 - AI-Newsroom OS 내보내기]
제목: ${article.title}
부제: ${article.subtitle}
분류: ${article.category}
작성자: ${article.byline}
최종 저장 일시: ${article.lastSavedAt}
원고 버전: v${article.version}
발행 여부: 내보낸 결과물 · 발행 여부 미확인

----------------------------------------
[본문]
${article.content}

----------------------------------------
[연결된 취재 출처]
${sources
  .filter(s => s.isLinkedToArticle)
  .map(s => `- ${s.title} (${s.publisher}, ${s.publishDate})\n  ${s.originalUrl}`)
  .join('\n')}

----------------------------------------
[검증 상태 요약]
- 총 검증 항목: ${verificationIssues.length}건
- 사용자 확인 완료: ${verificationIssues.filter(i => i.status === 'confirmed').length}건
- 확인 전: ${verificationIssues.filter(i => i.status === 'unconfirmed').length}건
- 무시: ${verificationIssues.filter(i => i.status === 'ignored').length}건
`;
      blob = new Blob([textData], { type: 'text/plain;charset=utf-8' });
      filename = `기사원고_${article.id}_${timestamp}.txt`;
    } else {
      const jsonData = {
        meta: {
          app: 'AI-Newsroom OS',
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          status: '내보낸 결과물 · 발행 여부 미확인',
          isSimulation: true,
        },
        article,
        verificationIssues,
        linkedSources: sources.filter(s => s.isLinkedToArticle),
        outlineNodes,
        interview: {
          title: interview.title,
          interviewee: interview.interviewee,
          date: interview.date,
        },
      };
      blob = new Blob([JSON.stringify(jsonData, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      filename = `기사데이터_${article.id}_${timestamp}.json`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <NewsroomContext.Provider
      value={{
        workMode,
        setWorkMode,
        leftNavView,
        setLeftNavView,
        rightPanelTab,
        setRightPanelTab,
        isFocusMode,
        setIsFocusMode,
        isLeftRailCollapsed,
        setIsLeftRailCollapsed,
        isRightPanelOpen,
        setIsRightPanelOpen,
        article,
        saveStatus,
        updateArticleContent,
        updateArticleTitle,
        updateArticleSubtitle,
        updateArticleCategory,
        applySuggestedTitle,
        applySuggestedExcerpt,
        saveArticleManually,
        resetToInitialDemo,
        outlineNodes,
        selectedParagraphIndex,
        setSelectedParagraphIndex,
        verificationIssues,
        selectedIssueId,
        setSelectedIssueId,
        isVerifying,
        runFullVerification,
        updateIssueStatus,
        applySpellingCorrection,
        linkSourceToIssue,
        jumpToIssueSentence,
        highlightedSentence,
        setHighlightedSentence,
        sources,
        sourceSearchQuery,
        setSourceSearchQuery,
        linkSourceToArticle,
        unlinkSourceFromArticle,
        openSourceSearchWithQuery,
        activeIssueForSourceLink,
        setActiveIssueForSourceLink,
        sourceSearchState,
        setSourceSearchState,
        interview,
        audioCurrentTime,
        isAudioPlaying,
        audioPlaybackRate,
        setAudioPlaybackRate,
        seekAudio,
        toggleAudioPlay,
        returnToSentenceId,
        jumpToInterviewFromIssue,
        returnToDraftFromInterview,
        updateEditedTranscript,
        interviewUploadStatus,
        triggerSimulatedUpload,
        mediaAssets,
        updateFeaturedImageAspect,
        updateFeaturedImageMeta,
        newsletterDraft,
        setNewsletterDraft,
        snsDraft,
        setSnsDraft,
        regeneratePlatformCopy,
        syncPlatformWithMaster,
        archiveFiles,
        reclassifyFile,
        exportArticleFile,
        isLocalProcessingOnly,
        setIsLocalProcessingOnly,
        simulateAIError,
        setSimulateAIError,
        simulateSaveError,
        setSimulateSaveError,
        aiErrorMessage,
      }}
    >
      {children}
    </NewsroomContext.Provider>
  );
};

export const useNewsroom = () => {
  const context = useContext(NewsroomContext);
  if (!context) {
    throw new Error('useNewsroom must be used within a NewsroomProvider');
  }
  return context;
};
