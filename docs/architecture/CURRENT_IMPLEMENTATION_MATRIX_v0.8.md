# Current Implementation Reality Audit v0.8

Date: 2026-10-04  
Scope: `main`, `feature/app-core`, `feature/su4228-article-workspace`, `feature/platform-generator`  
Purpose: Contract v0.8 input. Existing code is evidence, not the final source of truth.

## Executive findings

1. Four architectural maturity levels coexist: Vite UI on `main`, structured Python Core/Desktop on `feature/app-core`, Article Workspace + Supabase media on `feature/su4228-article-workspace`, and Node/n8n platform generation on `feature/platform-generator`.
2. `feature/app-core` is the runtime/service boundary baseline because it already enforces frontend↔core API separation, provider isolation and backend secret management.
3. Article persistence is local JSON draft-oriented while media has a separate Supabase schema; neither should become the product-wide ERD without normalization.
4. Verification retrieval already has useful locator/range semantics but needs canonical `Claim`, `EvidenceLink`, `SourceChunk` IDs.
5. Platform generation must consume immutable `ArticleSnapshot`, not mutable editor state.
6. Data Map reuses Source/Chunk/Claim/Evidence/Entity IDs; no second RAG corpus for MVP.

## Current Implementation Matrix

| Capability | Current implementation | v0.8 target | Migration action |
|---|---|---|---|
| Product UI | `main` React/Vite/local/mock | contract-driven UI | keep as UX reference |
| Article save | app-core local JSON draft | Article + ArticleRevision | legacy adapter + canonical ID |
| Frontend/Core | app-core single API adapter | versioned OpenAPI | preserve boundary |
| AI/provider | app-core router/proxy | service + ProcessingJob | normalize async/error |
| Auth/security | JWT/backend secret boundary | workspace auth context | preserve |
| Media | Supabase `photo_assets` | MediaAsset | canonical relations |
| STT | transcribe API | Transcript/Segment | stable segment IDs |
| Verification | factcheck modules | Claim/Run/Issue | reusable Claim IDs |
| Evidence retrieval | Candidate/Assessment prototype | SourceChunk/EvidenceLink | canonical source IDs |
| Platform generation | n8n | PlatformOutput from Snapshot | require snapshot ID |
| Rendering | Node/Playwright local JPEG | MediaAsset artifact | remove localhost path |
| Data Map | fragmented | shared knowledge projection | no duplicate corpus |

## P0 contract conflicts

1. Canonical UUID-compatible identity + Workspace ownership.
2. Mutable `ArticleRevision` vs immutable `ArticleSnapshot`.
3. Shared `Claim` / `EvidenceLink` identity.
4. Common `ProcessingJob`: `queued | running | succeeded | failed | cancelled`.

## Completed v0.8 artifacts

- [x] Reality Audit / Current Implementation Matrix
- [x] `ERD_v0.8.md`
- [x] `OPENAPI_v0.8.yaml`
- [x] `fixtures/vertical-slice-v0.8.json`
- [ ] Adapt current implementations to v0.8
- [ ] Execute real-article Vertical Slice
- [ ] Resolve contract mismatches
- [ ] Freeze v1.0

## Next integration target

Prefer adapters over rewriting feature branches at once:

1. legacy article draft → `ArticleRevision`;
2. immutable `ArticleSnapshot` before Verify/Platform;
3. retrieval Candidate → canonical `SourceChunk` candidate;
4. current photo assets → `MediaAsset`;
5. n8n/Playwright → `ProcessingJob` + `PlatformOutput`;
6. Data Map → read projection over Claim/Evidence/Entity.

Do not run a production/shared Supabase migration until the fixture and one real article pass the Vertical Slice.

> Audit scope note: this is a contract-level Reality Audit of the four active code lines and their representative persistence/API boundaries. It is not a line-by-line review of every source file.