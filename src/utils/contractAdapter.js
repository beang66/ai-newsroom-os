/**
 * AI-Newsroom OS — Contract Alignment Adapter (v0.8)
 * 
 * Reference:
 * - docs/architecture/ERD_v0.8.md
 * - docs/architecture/CONTRACT_ALIGNMENT_v0.8.md
 * - docs/architecture/OPENAPI_v0.8.yaml
 * - docs/architecture/fixtures/vertical-slice-v0.8.json
 * 
 * Purpose:
 * Connects UI component states to canonical v0.8 schemas (UUIDs, Workspaces,
 * Revisions, Snapshots, Claims, EvidenceLinks, MediaAssets, and ProcessingJobs)
 * without altering existing UI or breaking backward compatibility.
 */

export const DEFAULT_WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";

/**
 * Standard ProcessingJob states (CONTRACT_ALIGNMENT_v0.8.md §6)
 */
export const JOB_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELLED: "cancelled"
};

/**
 * Canonical Evidence Relations (ERD_v0.8.md §5)
 */
export const EVIDENCE_RELATION = {
  SUPPORT: "support",
  CONTRADICT: "contradict",
  CONTEXT: "context",
  UNRESOLVED: "unresolved"
};

/**
 * Generate standard UUID v4 compatible string
 */
export function generateCanonicalId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a simple hash representation for an article snapshot
 */
function createContentHash(text = "") {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return `sha256-${Math.abs(hash).toString(16).padStart(8, "0")}`;
}

/**
 * Convert an Article state to canonical Article schema (OPENAPI_v0.8.yaml: Article)
 */
export function toCanonicalArticle(article, workspaceId = DEFAULT_WORKSPACE_ID) {
  if (!article) return null;
  return {
    id: article.canonical_id || article.id || generateCanonicalId(),
    legacy_id: article.id || "art-legacy",
    workspace_id: article.workspace_id || workspaceId,
    title: article.title || "제목 없음",
    status: article.status === "발행본" ? "published" : article.status === "검증 완료" ? "verified" : "draft",
    current_revision_id: article.current_revision_id || null,
    created_at: article.createdAt || new Date().toISOString()
  };
}

/**
 * Create an ArticleRevision from editor draft state (CONTRACT_ALIGNMENT_v0.8.md §4)
 */
export function toArticleRevision(article, revisionNo = 1) {
  if (!article) return null;
  const canonicalArticleId = article.canonical_id || article.id || generateCanonicalId();
  return {
    id: generateCanonicalId(),
    article_id: canonicalArticleId,
    revision_no: revisionNo,
    title: article.title || "",
    body_html: `<p>${(article.content || "").replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`,
    body_text: article.content || "",
    created_at: new Date().toISOString()
  };
}

/**
 * Create an immutable ArticleSnapshot for fact-checking or platform conversion (CONTRACT_ALIGNMENT_v0.8.md §4)
 */
export function toArticleSnapshot(article, revision) {
  if (!article) return null;
  const rev = revision || toArticleRevision(article, 1);
  return {
    id: generateCanonicalId(),
    article_id: rev.article_id,
    revision_id: rev.id,
    content_hash: createContentHash(rev.body_text),
    title: rev.title,
    body_html: rev.body_html,
    body_text: rev.body_text,
    created_at: new Date().toISOString()
  };
}

/**
 * Convert local photo asset to canonical MediaAsset schema (ERD_v0.8.md: MediaAsset)
 */
export function toMediaAsset(photo, workspaceId = DEFAULT_WORKSPACE_ID) {
  if (!photo) return null;
  return {
    id: photo.canonical_id || generateCanonicalId(),
    legacy_id: photo.id,
    workspace_id: workspaceId,
    kind: "image",
    object_ref: photo.url || "",
    mime_type: "image/jpeg",
    caption: photo.caption || "",
    source: photo.source || "",
    provider: photo.provider || "",
    generated: Boolean(photo.isAiGenerated || false),
    created_at: new Date().toISOString()
  };
}

/**
 * Convert local search source to canonical Source & SourceChunk schemas (ERD_v0.8.md: Source/SourceChunk)
 */
export function toCanonicalSource(source, workspaceId = DEFAULT_WORKSPACE_ID) {
  if (!source) return null;
  const sourceId = source.canonical_id || generateCanonicalId();
  return {
    id: sourceId,
    legacy_id: source.id,
    workspace_id: workspaceId,
    kind: source.kind || (source.category === "공식문서" ? "upload" : "note"),
    title: source.title || "",
    version: source.date || "2026-10",
    origin_uri: source.origin_uri || "",
    chunks: [
      {
        id: generateCanonicalId(),
        source_id: sourceId,
        ordinal: 1,
        text: source.snippet || source.content || "",
        locator: { section: source.category || "general" }
      }
    ]
  };
}

/**
 * Wrap a background/long-running task in canonical ProcessingJob (CONTRACT_ALIGNMENT_v0.8.md §6)
 */
export function toProcessingJob(type, status = JOB_STATUS.QUEUED, progress = 0, inputRef = null) {
  return {
    id: generateCanonicalId(),
    workspace_id: DEFAULT_WORKSPACE_ID,
    type,
    status,
    progress,
    input_ref: inputRef,
    created_at: new Date().toISOString()
  };
}
