export type NodeType = 'FACT' | 'QUOTE' | 'CONTEXT' | 'CLAIM' | 'IMAGE';

export interface ArticleNode {
  id: string;
  type: NodeType;
  text: string;
  linkedSourceIds: string[];
  interviewSource?: string;
  timestamp?: string;
  isAiGenerated?: boolean;
  status?: 'verified' | 'unverified' | 'needs_review';
  imageUrl?: string;
  caption?: string;
  photoCredit?: string;
  altText?: string;
}

export type MaterialType = 'source' | 'audio' | 'transcript' | 'file' | 'image';

export interface TranscriptExcerpt {
  id: string;
  speaker: string;
  timestamp: string;
  text: string;
}

export interface MaterialItem {
  id: string;
  type: MaterialType;
  title: string;
  status: 'Processed' | 'Transcribing...' | 'Indexed' | 'Verified' | 'Analyzing';
  outletOrSpeaker: string;
  date: string;
  durationOrPages?: string;
  fileSize?: string;
  url?: string;
  summary?: string;
  content: string;
  excerpts?: TranscriptExcerpt[];
  imageUrl?: string;
  caption?: string;
  photoCredit?: string;
  dimensions?: string;
}

export type CritiqueCategory = 'fact' | 'logic' | 'balance' | 'source';

export interface CritiqueCard {
  id: string;
  category: CritiqueCategory;
  severity: 'warning' | 'suggestion' | 'note';
  title: string;
  description: string;
  nodeId?: string;
  suggestedFix?: string;
  dismissed?: boolean;
  resolved?: boolean;
}

export type ArticleStatus = 'DRAFT' | 'IN REVIEW' | 'LEGAL CHECK' | 'READY FOR PRINT';

export interface Article {
  id: string;
  title: string;
  status: ArticleStatus;
  lastSaved: string;
  author: string;
  desk: string;
  nodes: ArticleNode[];
  materialIds: string[];
}

export type NavSection = 'workspace' | 'articles' | 'sources';
