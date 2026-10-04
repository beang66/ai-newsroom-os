# AI-Newsroom OS — ERD v0.8

Status: pre-freeze / Vertical Slice candidate  
Derived from: Current Implementation Reality Audit v0.8

## Design invariants

1. `Workspace` is the reusable knowledge ownership boundary.
2. `Article` is a logical document; `ArticleRevision` is mutable history; `ArticleSnapshot` is immutable execution input.
3. `Source` and `MediaAsset` are reusable workspace assets and are not owned exclusively by an article.
4. `Claim` belongs to an immutable snapshot so verification is reproducible.
5. `EvidenceLink` connects a Claim to an exact `SourceChunk` or `TranscriptSegment`.
6. Data Map reads `KnowledgeEntity` / `KnowledgeEdge` plus Claim/Evidence relations; it does not own a second corpus.
7. Async AI/STT/render/workflow execution uses `ProcessingJob`.

## Logical ERD

```mermaid
erDiagram
  WORKSPACE ||--o{ ARTICLE : owns
  WORKSPACE ||--o{ SOURCE : owns
  WORKSPACE ||--o{ TRANSCRIPT : owns
  WORKSPACE ||--o{ MEDIA_ASSET : owns
  WORKSPACE ||--o{ KNOWLEDGE_ENTITY : owns
  WORKSPACE ||--o{ PROCESSING_JOB : runs

  ARTICLE ||--o{ ARTICLE_REVISION : has
  ARTICLE ||--o{ ARTICLE_SNAPSHOT : freezes
  ARTICLE ||--o{ ARTICLE_SOURCE : references
  SOURCE ||--o{ ARTICLE_SOURCE : linked_to
  SOURCE ||--o{ SOURCE_CHUNK : contains
  TRANSCRIPT ||--o{ TRANSCRIPT_SEGMENT : contains

  ARTICLE_SNAPSHOT ||--o{ CLAIM : contains
  CLAIM ||--o{ EVIDENCE_LINK : supported_by
  SOURCE_CHUNK ||--o{ EVIDENCE_LINK : evidence
  TRANSCRIPT_SEGMENT ||--o{ EVIDENCE_LINK : evidence

  ARTICLE_SNAPSHOT ||--o{ VERIFICATION_RUN : verifies
  VERIFICATION_RUN ||--o{ VERIFICATION_ISSUE : emits
  CLAIM ||--o{ VERIFICATION_ISSUE : concerns

  ARTICLE_SNAPSHOT ||--o{ PLATFORM_OUTPUT : transforms
  PLATFORM_OUTPUT }o--o| MEDIA_ASSET : artifact

  KNOWLEDGE_ENTITY ||--o{ KNOWLEDGE_EDGE : from
  KNOWLEDGE_ENTITY ||--o{ KNOWLEDGE_EDGE : to
  CLAIM }o--o{ KNOWLEDGE_ENTITY : mentions
```

## Canonical ID policy

Public/domain IDs use UUID-compatible strings. Existing 32-character article IDs, `card_id`, and prototype document/block IDs may be retained as `legacy_id`/`external_ref` during migration but must not become cross-domain foreign keys.

## Entity definitions

### Workspace
- `id uuid PK`
- `name text`
- `created_at timestamptz`
- `updated_at timestamptz`

### Article
- `id uuid PK`
- `workspace_id uuid FK -> Workspace`
- `title text`
- `status text`
- `current_revision_id uuid nullable`
- `legacy_id text nullable`
- `created_at`, `updated_at`

### ArticleRevision
Mutable editing history / autosave unit.
- `id uuid PK`
- `article_id uuid FK`
- `revision_no bigint`
- `title text`
- `body_html text`
- `body_text text nullable`
- `editor_state jsonb nullable`
- `created_by uuid nullable`
- `created_at timestamptz`
- unique `(article_id, revision_no)`

### ArticleSnapshot
Immutable input for Verify/Platform/Archive operations.
- `id uuid PK`
- `article_id uuid FK`
- `revision_id uuid FK`
- `content_hash text`
- `title text`
- `body_html text`
- `body_text text`
- `created_at timestamptz`

No UPDATE of content fields after creation.

### Source
Reusable source/document asset.
- `id uuid PK`
- `workspace_id uuid FK`
- `kind text` — upload/url/note/external
- `title text`
- `mime_type text nullable`
- `origin_uri text nullable`
- `storage_ref text nullable`
- `content_hash text nullable`
- `version text nullable`
- `metadata jsonb`
- timestamps

### ArticleSource
- `article_id uuid FK`
- `source_id uuid FK`
- `role text nullable`
- `created_at`
- PK `(article_id, source_id)`

### SourceChunk
- `id uuid PK`
- `source_id uuid FK`
- `ordinal int`
- `text text`
- `start_offset int nullable`
- `end_offset int nullable`
- `locator jsonb`
- `embedding_ref text nullable`
- unique `(source_id, ordinal)`

### Transcript
- `id uuid PK`
- `workspace_id uuid FK`
- `media_asset_id uuid nullable FK`
- `language text nullable`
- `created_at`

### TranscriptSegment
- `id uuid PK`
- `transcript_id uuid FK`
- `ordinal int`
- `speaker text nullable`
- `text text`
- `start_ms bigint nullable`
- `end_ms bigint nullable`
- `locator jsonb`

### Claim
A stable assertion extracted from one immutable article snapshot.
- `id uuid PK`
- `snapshot_id uuid FK`
- `ordinal int`
- `text text`
- `claim_type text nullable`
- `start_offset int nullable`
- `end_offset int nullable`
- `created_at`

### EvidenceLink
- `id uuid PK`
- `claim_id uuid FK`
- `source_chunk_id uuid nullable FK`
- `transcript_segment_id uuid nullable FK`
- `relation text` — support/contradict/context/unresolved
- `retrieval_score numeric nullable`
- `assessment_state text nullable`
- `reason text nullable`
- `locator jsonb nullable`
- CHECK exactly one evidence target is present

`retrieval_score` is ranking relevance, never probability of truth.

### VerificationRun
- `id uuid PK`
- `snapshot_id uuid FK`
- `job_id uuid nullable FK`
- `status text`
- `model_info jsonb nullable`
- `created_at`, `completed_at nullable`

### VerificationIssue
- `id uuid PK`
- `verification_run_id uuid FK`
- `claim_id uuid nullable FK`
- `category text`
- `severity text`
- `message text`
- `resolution_state text`
- `metadata jsonb`

### MediaAsset
Migration target for current `photo_assets`.
- `id uuid PK`
- `workspace_id uuid FK`
- `owner_id uuid nullable`
- `kind text`
- `object_ref text`
- `original_filename text nullable`
- `mime_type text`
- `byte_size bigint nullable`
- `caption text`
- `source text`
- `shot_date date nullable`
- `generated boolean`
- `metadata jsonb`
- timestamps

Article-specific media attachment should use a relation rather than loose `article_id text` when reuse/order/context matters.

### PlatformOutput
- `id uuid PK`
- `snapshot_id uuid FK`
- `job_id uuid nullable FK`
- `platform text`
- `format text`
- `template_version text nullable`
- `payload jsonb`
- `artifact_media_asset_id uuid nullable FK`
- `status text`
- timestamps

### ProcessingJob
- `id uuid PK`
- `workspace_id uuid FK`
- `type text`
- `status text` — queued/running/succeeded/failed/cancelled
- `progress numeric nullable`
- `input_ref jsonb`
- `output_ref jsonb nullable`
- `error jsonb nullable`
- `created_at`, `started_at nullable`, `completed_at nullable`

### KnowledgeEntity
- `id uuid PK`
- `workspace_id uuid FK`
- `entity_type text`
- `canonical_name text`
- `aliases jsonb`
- `metadata jsonb`

### KnowledgeEdge
- `id uuid PK`
- `workspace_id uuid FK`
- `from_entity_id uuid FK`
- `to_entity_id uuid FK`
- `relation_type text`
- `source_claim_id uuid nullable FK`
- `confidence numeric nullable`
- `metadata jsonb`

`confidence` is extraction/linking confidence only; it must not be presented as factual truth probability.

## Migration mapping

| Existing | v0.8 target |
|---|---|
| local `draft.articleId` | `Article.id` / `legacy_id` |
| whole JSON autosave | `ArticleRevision` adapter |
| `photo_assets` | `MediaAsset` + article/media relation |
| retrieval `document_id/version/block_id` | `Source.id/version` + `SourceChunk.id/external_ref` |
| retrieval locator/range | `SourceChunk.locator` + offsets / `EvidenceLink.locator` |
| renderer `card_id` | `PlatformOutput.id` or child card external ref |
| renderer local file path | `MediaAsset.object_ref` |
| factcheck assertion | `Claim` |
| per-feature async state | `ProcessingJob` |

## Freeze gate

This ERD remains v0.8 until a real Vertical Slice validates identity propagation and cardinality. Schema migrations should not be applied to production/shared Supabase until that validation is complete.