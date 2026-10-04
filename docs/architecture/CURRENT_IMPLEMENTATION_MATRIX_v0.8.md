# Current Implementation Reality Audit v0.8

Date: 2026-10-04  
Scope: `main`, `feature/app-core`, `feature/su4228-article-workspace`, `feature/platform-generator`  
Purpose: Contract v0.8 input. Existing code is evidence, not the final source of truth.

## Executive findings

1. The repository currently contains **four different architectural maturity levels**: a Vite UI shell on `main`, a substantially structured Python Core/Desktop architecture in `feature/app-core`, an Article Workspace implementation with local/server + Supabase photo storage in `feature/su4228-article-workspace`, and an independent Node/n8n platform generation pipeline in `feature/platform-generator`.
2. `feature/app-core` is the strongest candidate for the **runtime/service boundary baseline** because it already enforces a frontend↔core API boundary, provider isolation, backend secret management and explicit stable endpoints.
3. Article persistence is still **local JSON draft-oriented**, while media persistence has a separate Supabase schema. These cannot become the product-wide ERD without normalization.
4. The verification prototype already exposes a useful evidence contract (`Candidate`: document/version/block/locator/excerpt/range/retrieval_score), but it is not yet connected to shared `Claim`, `EvidenceLink`, `SourceChunk` identities.
5. Platform generation is currently a separate rendering service/workflow with its own payload and local output files. It needs to become a consumer of an immutable `ArticleSnapshot`, not raw mutable article state.
6. Data Map should reuse Source/Chunk/Claim/Evidence/Entity IDs. No separate RAG corpus or graph persistence should be introduced for MVP.

## Current Implementation Matrix

| Capability | Branch / implementation | Current input | Current output/state | Persistence / async | Current boundary | Contract v0.8 target | Conflict / migration action |
|---|---|---|---|---|---|---|---|
| Main product UI | `main` React/Vite components (`ArticleWriter`, `FactCheckDrawer`, `FormatConverter`, `ArchiveView`, `SourceSearch`, Interview Studio) | component/local mock state | UI state | mostly frontend/mock | React component boundary | UI consumes versioned domain/API fixtures | Treat as UX reference; remove domain truth from component-local/mock structures |
| Article save | `feature/app-core` `core/storage.py` | `{draft:{bodyHtml, articleId? ...}}` | `{saved, articleId, fileName, folder}` | atomic local JSON file under `.article-workspace/articles`; process lock | `POST /api/articles/save` | `Article` + mutable `ArticleRevision`; stable UUID; optimistic revision/version | Current 32-char hex articleId and whole-draft JSON are local implementation details; introduce canonical IDs/revision contract and adapter |
| Frontend/Core transport | `feature/app-core` | named UI API methods | HTTP response/error; IPC planned | synchronous HTTP locally | stable HTTP surface via frontend API adapter | versioned OpenAPI; same domain contract across HTTP/IPC | Preserve boundary. Do not let feature UI bypass adapter |
| AI/provider routing | `feature/app-core` | assist/factcheck/transcribe requests | provider-compatible responses | remote backend or local dev provider | core AI router/provider + backend proxy | `ProcessingJob` for long-running operations; provider hidden behind service | Preserve provider isolation; normalize errors/job state |
| Secret/auth boundary | `feature/app-core` | JWT / backend URL; local dev keys | authenticated proxy calls | local token/session + backend secrets | app→backend for secret operations; app→Supabase for allowed user scope | Workspace/User authorization + common auth context | Strong baseline. Product contracts must not expose provider keys |
| Cloud collaboration/control | `feature/app-core` architecture | user/project metadata | teams/projects/devices/collab metadata | Supabase Postgres/Storage/Realtime planned/partial | RLS + user JWT | `Workspace` as top ownership boundary | Rename/map project/team concepts deliberately; avoid article-only ownership |
| Article Workspace editor | `feature/su4228-article-workspace` | editor fields/media/actions | article workspace state, previews, autosave UX | large browser JS + Python server | mixed frontend/server implementation | `Article` / `ArticleRevision` API fixture | Extract actual editor state shape and map fields; editor should not define DB schema |
| Photo/media storage | `feature/su4228-article-workspace` Supabase SQL | uploaded image + metadata | `photo_assets` row + private storage object | Supabase Storage/Postgres; RLS owner scope | direct Supabase user access | `MediaAsset` owned by Workspace/User and optionally linked to Article/Snapshot | `article_id text` has no FK and owner-only policy; migrate to canonical IDs + relation table where reuse is needed |
| STT / interview | `feature/app-core` transcribe + main Interview Studio | audio recording/file | speaker dialogue/transcription | external/backend provider; local UI state | `POST /api/interview/transcribe` | `Transcript` + immutable `TranscriptSegment` + source locator | Preserve service; add stable segment IDs so Evidence can point to exact audio segment |
| Factcheck assertion/chunking | `feature/app-core` factcheck modules | article/assertions/corpus | assertion/evaluation structures | Python service, semantic chunking/retrieval | `/api/factcheck/run`, `/api/semantic/parse` | `Claim`, `VerificationRun`, `VerificationIssue` | Separate claim extraction identity from one verification run; persist reusable Claim IDs |
| Evidence retrieval prototype | `feature/platform-generator` critique organizer | claim/query | `Candidate(document_id, document_version, block_id, locator, excerpt, start, end, retrieval_score)` + `Assessment` | prototype repository/provider | Python protocol contracts | `SourceChunk` + `EvidenceLink` + assessment metadata | Reuse locator/range/score semantics; map document/block to canonical Source/Chunk IDs; score is ranking signal, not truth probability |
| RAG/source retrieval | `feature/app-core` factcheck retrieval | query/assertion + indexed material | ranked retrieved chunks | local/semantic provider | retrieval service | Workspace `Source`/`SourceChunk` corpus; article relation through `article_sources` | Avoid Data Map duplicate index; one retrieval contract with reusable source identities |
| Platform generation | `feature/platform-generator` n8n workflows | article/content payload | Instagram/Threads generated content/cards | n8n workflows | workflow/webhook boundary | `PlatformOutput` generated from `ArticleSnapshot` | Require `snapshot_id`, platform, template/version, job id; no mutable article read during generation |
| Card rendering | `feature/platform-generator/server.js` | `card_id`, template, content, image | JPEG path + localhost URL | local filesystem, synchronous Playwright render | `POST /render` | rendering worker behind `ProcessingJob`; artifact URI/MediaAsset | Replace localhost path as contract; return artifact ID/storage URI; standard error envelope |
| Archive/Data Map | `main` Archive UI + critique knowledge prototype | article/review/source data | archive/search/knowledge views | fragmented/mock/prototype | no canonical shared boundary | Workspace Knowledge projection over Article/Source/Claim/Evidence/Entity | Do not create independent Data Map store for MVP; derive/read shared relations |

## Existing contracts worth preserving

### A. Runtime boundary
`feature/app-core` explicitly separates UI and Python Core. The UI calls a single API adapter and does not import core code. This is compatible with Contract v0.8 and should remain an architectural invariant.

### B. Security boundary
Remote production paths keep operational API keys on the backend and use user JWTs from the app. Supabase service-role secrets are prohibited in the client. Preserve this unchanged.

### C. Evidence locator semantics
The critique prototype's `Candidate` contains `document_id`, `document_version`, `block_id`, `locator`, `excerpt`, `start`, `end`, and `retrieval_score`. This is a useful precursor to `SourceChunk`/`EvidenceLink`. Keep the explicit locator/range and the rule that retrieval score is not probability of truth.

### D. Media metadata
Current `photo_assets` already captures filename, MIME, bytes, caption, source, shot date, verification context and generated flag. Preserve useful metadata while replacing loose `article_id text` ownership with canonical relations.

## Contract conflicts that must be resolved before v1.0

### P0 — identity and ownership
- Canonical ID format is inconsistent: local article save uses 32-char hex strings; Supabase media uses UUID; workflows use `card_id`; retrieval uses document/block IDs.
- Adopt UUID-compatible stable IDs at contract level. Local adapters may map legacy IDs during migration.
- Introduce `workspace_id` to reusable assets (`Source`, `MediaAsset`, `KnowledgeEntity`).

### P0 — mutable draft vs immutable execution input
- Current article save stores the latest whole draft.
- Verification and platform conversion need reproducibility.
- Add mutable `ArticleRevision` plus immutable `ArticleSnapshot`. Verify/Platform jobs must reference `snapshot_id`.

### P0 — shared evidence identity
- Factcheck and critique retrieval currently have useful but separate concepts.
- Define `Claim` independent of a verification run and `EvidenceLink` independent of one UI.
- Evidence must point to a canonical `SourceChunk` or `TranscriptSegment`.

### P0 — common async/job contract
- AI, STT, rendering and n8n workflows have different execution/error behavior.
- Introduce `ProcessingJob {id, workspace_id, type, status, progress?, input_ref, output_ref?, error?, created_at, started_at?, completed_at?}`.
- Initial status enum: `queued | running | succeeded | failed | cancelled`.

### P1 — storage/artifact contract
- Local renderer returns filesystem paths and localhost URLs.
- Replace public contract with `artifact_id`/`media_asset_id` and a resolvable URI/download endpoint.

### P1 — errors
- Current services use feature-specific messages/shapes.
- Define common envelope: `{ error: { code, message, retryable, details?, request_id? } }`.

## ERD v0.8 proposed ownership

```text
Workspace
 ├─ Articles
 │   ├─ ArticleRevisions (mutable working history)
 │   └─ ArticleSnapshots (immutable execution inputs)
 ├─ Sources ─ SourceChunks
 ├─ Transcripts ─ TranscriptSegments
 ├─ MediaAssets
 └─ KnowledgeEntities ─ KnowledgeEdges

Article ──< ArticleSource >── Source
ArticleSnapshot ──< Claim ──< EvidenceLink >── SourceChunk
                                   └──────────> TranscriptSegment
ArticleSnapshot ──< VerificationRun ──< VerificationIssue >── Claim
ArticleSnapshot ──< PlatformOutput
Workspace ──< ProcessingJob
```

## OpenAPI v0.8 minimum surface to draft next

```text
GET    /v1/workspaces/{workspace_id}/articles/{article_id}
PATCH  /v1/workspaces/{workspace_id}/articles/{article_id}
POST   /v1/workspaces/{workspace_id}/articles/{article_id}/snapshots
POST   /v1/workspaces/{workspace_id}/sources
GET    /v1/workspaces/{workspace_id}/sources/{source_id}
POST   /v1/workspaces/{workspace_id}/retrieval/search
POST   /v1/workspaces/{workspace_id}/snapshots/{snapshot_id}/verify
GET    /v1/workspaces/{workspace_id}/verification-runs/{run_id}
GET    /v1/workspaces/{workspace_id}/knowledge/map
POST   /v1/workspaces/{workspace_id}/snapshots/{snapshot_id}/platform-outputs
GET    /v1/workspaces/{workspace_id}/jobs/{job_id}
```

Legacy/local endpoints can remain behind adapters during migration; the v1 contract should not expose local file paths, provider-specific secrets, or n8n internals.

## Vertical Slice fixture

Create one fixture with:

- 1 workspace
- 1 article
- 2 sources (one uploaded document, one transcript)
- at least 3 source chunks / transcript segments
- 3 claims
- evidence links containing support/contradict/unresolved examples
- 1 verification run
- 1 media asset
- 1 Instagram platform output

Acceptance path:

`source ingest → retrieval → article revision → snapshot → claim/evidence → verification → knowledge map query → platform output → archive`

## Next action

Draft `OPENAPI_v0.8.yaml` and `ERD_v0.8.md` from this audit, then run the fixture through the vertical slice before Contract v1.0 freeze.