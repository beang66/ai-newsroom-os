/** API v2.4. All offsets are Unicode code points, not JS UTF-16 indexes.
 * Use Array.from(text).slice(start, end).join('') when highlighting.
 * Findings are review aids; neither completion nor acknowledgement is a truth verdict.
 */
export type Category = 'facts' | 'numbers' | 'quotes' | 'logic' | 'spelling' | 'legal_ethics' | 'names';
export type FindingGroup = 'priority' | 'spelling' | 'additional';
export type FindingStatus = 'open' | 'acknowledged' | 'later';
export interface GlossaryEntry { canonical: string; variants?: string[] }
export interface Anchor { field: 'title' | 'body'; start: number; end: number; text: string }
export type Locator =
  | {kind: 'timestamp'; start_seconds: number; end_seconds: number; segment: number}
  | {kind: 'page'; page: number}
  | {kind: 'paragraph'; paragraph: number}
  | {kind: 'table_cell'; table: number; row: number; column: number}
  | {kind: 'cell'; sheet: string; cell: string}
  | {kind: 'line'; line: number};
export interface ReviewRequest {
  article: string; article_id: string; article_version: number;
  title?: string; use_openai?: boolean; glossary?: GlossaryEntry[];
  source_document_ids?: string[]; // Omitted/empty: internal checks only. Never selects all documents.
}
export interface Candidate {
  document_id: string; document_version: string; block_id: string;
  title: string; locator: Locator; excerpt: string; start: number; end: number;
  retrieval_score: number; // Ranking only, never truth probability.
}
export interface Assessment {
  state: 'evaluated' | 'unavailable' | 'skipped' | 'blocked';
  relation: 'unassessed' | 'supports' | 'contradicts' | 'partial' | 'unrelated';
  reason: string; provider: string; model: string;
}
export interface AssessedCandidate extends Candidate {
  role: 'retrieval_candidate'; assessment: Assessment; warnings: string[];
}
export interface Claim {
  id: string; start: number; end: number; text: string;
  labels: Array<'numerical' | 'causal' | 'prediction' | 'attribution' | 'opinion' | 'unclassified'>;
  /** Legacy metadata. Do not turn every claim into a required action or publication gate. */
  status: 'review_required'; flags: string[]; candidates: AssessedCandidate[];
}
export interface Finding {
  id: string; rule_id: string; categories: Category[]; group: FindingGroup;
  status: FindingStatus; updated_at?: string; anchor: Anchor;
  message: string; action: string; evidence: Candidate[]; related_anchors: Anchor[];
  replacement: string | null; // Null: no one-click correction. Never infer one yourself.
  basis: 'rule_pattern' | 'model_assessment'; blocking: false;
}
export interface CheckCoverage {
  category: Category; label: string; status: 'limited_rules';
  source_comparison: 'candidates_compared' | 'no_matching_candidates' | 'not_requested' | 'not_applicable';
  limitation: string; finding_count: number;
}
export interface ReviewResult {
  api_version: '2.4'; engine_version: string; id: string;
  article_id: string; article_version: number; title: string;
  article_hash: string; input_hash: string; corpus_revision: number;
  offset_encoding: 'unicode_code_points'; source_document_ids: string[];
  mode: 'model_assisted' | 'local_review'; claims: Claim[];
  findings: Finding[]; checks: CheckCoverage[];
  completion: 'check_finished'; publication_blocked: false;
  summary: Record<FindingGroup, number>; // Original detection counts, includes acknowledged items.
  coverage: {total_sentences: number; processed_sentences: number; omitted_sentences: 0;
    evaluated_pairs: number; unevaluated_pairs: number};
  limitations: string[];
  model_proofreading: {state: 'not_requested' | 'evaluated' | 'unavailable'; reason: string; rejected: number};
}
export interface ProofreadRequest { article: string; title?: string; glossary?: GlossaryEntry[] }
export interface ProofreadResult { findings: Finding[]; scope: 'eight_rules_only' }
export interface FindingStatusRequest {
  review_id: string; finding_id: string; status: FindingStatus; input_hash: string;
}
export type FindingStatusResult = Pick<FindingStatusRequest, 'review_id' | 'finding_id' | 'status'>;

// Organization & Explore: metadata edits never alter raw source bytes.
export type DocumentType = 'unclassified' | 'press_release' | 'interview' | 'statistics' | 'report' | 'note';
export type MetadataOrigin = 'rule_suggestion' | 'user';
export interface SourceSpan { block_id: string; start: number; end: number; excerpt: string; locator: Locator }
export interface TopicTag { label: string; origin: MetadataOrigin; evidence: SourceSpan[] }
export interface MentionCandidate {
  id: string; label: string; kind: 'person_candidate' | 'organization_candidate'; evidence: SourceSpan;
}
export interface Organization {
  type: DocumentType; type_origin: MetadataOrigin; type_evidence: SourceSpan[]; type_reason: string;
  tags: TopicTag[]; summary: SourceSpan[]; summary_kind: 'extractive_preview' | 'model_selected_excerpt';
  mentions: MentionCandidate[]; document_date: string | null; project_ids: string[]; revision: number;
}
export interface Project { id: string; title: string; created_at: string }
export interface OrganizationEdit {
  document_id: string; revision: number;
  changes: {type?: DocumentType; tags?: string[]; project_ids?: string[]; document_date?: string | null; summary?: SourceSpan[]};
}
/** POST /api/organization/suggest {document_id}; proposal is not persisted until edit. */
export interface OrganizationSuggestion {
  document_id: string; base_revision: number; document_type: DocumentType;
  tags: Array<{label: string; evidence: SourceSpan[]}>; summary: SourceSpan[];
  scope: {reviewed_blocks: number; total_blocks: number; summary_kind: 'model_selected_excerpt'};
  provider: 'openai'; model: string;
}
export interface CatalogFilters {
  q?: string; type?: DocumentType; project?: string; status?: 'ready' | 'partial' | 'failed';
  date_field?: 'registered' | 'document'; from?: string; to?: string;
}
export interface ExploreNode {
  id: string; label: string; kind: 'document' | 'project' | 'topic' | 'person_candidate' | 'organization_candidate';
  document_id?: string;
}
export interface ExploreEdge {
  source: string; target: string; document_id: string;
  relation: 'filed_in' | 'tagged' | 'mentions'; origin: MetadataOrigin; evidence: SourceSpan[];
}
export interface ExploreResult {
  nodes: ExploreNode[]; edges: ExploreEdge[]; total_nodes: number; matched_nodes: number;
  displayed_nodes: number; hidden_nodes: number; limit: number; depth: number; focus: string | null;
  layout: 'decorative_3d_not_similarity'; corpus_revision: number;
}
export interface TranscriptRequest {
  title: string; segments: Array<{start: number; end: number; text: string}>;
}
