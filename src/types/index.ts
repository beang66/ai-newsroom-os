export type WorkMode = 'draft_review' | 'publishing_prep' | 'platform_transform' | 'archive';

export type LeftNavView = 'editor' | 'source_search' | 'interview' | 'media' | 'files';

export type RightPanelTab = 'structure' | 'verification';

export type ArticleCategory = '탐사보도' | '심층기획' | '스트레이트' | '해설·분석' | '인터뷰';

export type AspectRatioType = '16:9' | '4:3' | '1:1';

export type IssueSeverity = 'critical' | 'review' | 'suggestion'; // critical=우선 확인, review=확인 필요, suggestion=수정 제안
export type IssueStatus = 'unconfirmed' | 'confirmed' | 'ignored'; // 확인 전, 사용자 확인 완료, 무시
export type IssueCategory = '사실 주장' | '수치·날짜·고유명사' | '인용·출처 부족' | '논리 비약·반론 누락' | '맞춤법';
export type EvidenceState = 'unverified' | 'linked' | 'contradiction' | 'no_evidence_in_sources' | 'search_failed';

export interface VerificationIssue {
  id: string;
  paragraphIndex: number;
  sentenceIndex: number;
  sentenceText: string;
  category: IssueCategory;
  severity: IssueSeverity;
  status: IssueStatus;
  reason: string;
  evidenceState: EvidenceState;
  evidenceNote?: string;
  linkedSourceId?: string;
  spellingCorrection?: {
    before: string;
    after: string;
    explanation: string;
  };
  interviewQuoteRef?: {
    interviewId: string;
    interviewee: string;
    timestampSec: number;
    originalTranscript: string;
  };
}

export type OutlineRole = 'Lead' | 'Fact' | 'Quote' | 'Background' | 'Analysis' | 'Conclusion';

export interface OutlineNode {
  id: string;
  paragraphIndex: number;
  role: OutlineRole;
  roleLabel: string;
  summary: string;
  snippet: string;
  suggestion?: string;
}

export interface SourceDocument {
  id: string;
  title: string;
  publisher: string;
  publishDate: string;
  snippet: string;
  fullText: string;
  originalUrl: string;
  isLinkedToArticle: boolean;
  isAiSummary: boolean; // 구분: 원문 인용 vs AI 요약
  tags: string[];
}

export interface TranscriptSegment {
  id: string;
  timeSec: number;
  speaker: string;
  text: string;
  hasDiscrepancy?: boolean;
}

export interface InterviewRecording {
  id: string;
  title: string;
  interviewee: string;
  intervieweeRole: string;
  date: string;
  durationSec: number;
  status: 'ready' | 'processing' | 'failed';
  originalTranscript: TranscriptSegment[];
  editedTranscript: TranscriptSegment[];
  linkedIssueId?: string;
}

export interface MediaAsset {
  id: string;
  title: string;
  type: 'original' | 'derivative';
  originalMediaId?: string;
  url: string;
  caption: string;
  credit: string;
  aspectRatio: AspectRatioType;
  dimensions: string;
  fileSize: string;
  tags: string[];
}

export interface ArchiveFile {
  id: string;
  filename: string;
  category: 'Source' | 'Interview' | 'Media' | 'Draft' | 'Published';
  fileType: string;
  size: string;
  createdAt: string;
  isDerivative: boolean;
  statusText: string;
  canExport?: boolean;
}

export interface SuggestedTitle {
  id: string;
  title: string;
  style: string;
  applied: boolean;
}

export interface SuggestedExcerpt {
  id: string;
  text: string;
  style: string;
  applied: boolean;
}

export interface Article {
  id: string;
  title: string;
  subtitle: string;
  category: ArticleCategory;
  byline: string;
  content: string; // paragraphs separated by double newline
  version: number;
  lastSavedAt: string;
  lastSavedTimestamp?: number;
  lastReviewedAt: string;
  lastReviewedVersion: number;
  isEditedSinceReview: boolean;
  
  // Featured media & suggestions
  featuredImage: {
    assetId: string;
    url: string;
    caption: string;
    credit: string;
    aspectRatio: AspectRatioType;
  };
  suggestedTitles: SuggestedTitle[];
  suggestedExcerpts: SuggestedExcerpt[];
  
  // Derivative copies for platforms
  newsletterCopy: string;
  newsletterLastSyncedVersion: number;
  snsCopy: string;
  snsLastSyncedVersion: number;
}
