# AI-Newsroom OS — Technical Contract Alignment v0.8

Status: Architecture Alignment / pre-freeze  
Date: 2026-10-04  
Product/Contract owner: 안정빈

## 1. Decision

Adopt **Code-informed, Document-driven Development**.

Existing branches are evidence of current implementation decisions, not the target architecture's source of truth. We will complete a Reality Audit, align the domain model and contracts, validate one vertical slice, and only then freeze Contract v1.0.

Sequence:

`Phase -1 Reality Audit → Contract v0.8 → Vertical Slice → Contract v1.0 Freeze → parallel implementation/improvement`

## 2. Ownership boundaries

| Domain | DRI | Responsibility |
|---|---|---|
| Article / Autosave | 강창희 | persistence, revision, conflict handling |
| Source ingest / RAG / Search | 강창희 | chunking, indexing, retrieval, source trace |
| Verification Engine | 강창희 | verification runs, issues, evidence retrieval |
| STT / Transcript | 박소현 | audio, transcription, segment trace |
| Structure / Preview / Media | 고서연 | structure analysis, preview, media |
| Platform Formatter | 이정민 | platform conversion/rendering |
| Knowledge Archive / Data Map | 안정빈 | domain relations, archive UX, Data Map |
| System Contract / ERD / Integration | 안정빈 | shared contracts, integration, E2E acceptance |
| E2E Integration | All | vertical slice and regression |

Data Map is **not** a second RAG implementation. Retrieval remains owned by the Retrieval/Verification domain. Data Map consumes shared Knowledge/Evidence contracts.

## 3. Phase -1: Current Implementation Reality Audit

Audit at minimum:

- `main`
- `feature/app-core`
- `feature/su4228-article-workspace`
- `feature/platform-generator`

Create a Current Implementation Matrix with:

`feature | branch | input | output | state | persistence | async model | current API | target contract | conflict | migration action`

Rules:

1. Preserve useful implemented behavior where compatible.
2. Do not promote accidental branch-local schemas into the global contract without review.
3. Identify duplicate ownership and duplicate persistence before integration.
4. Any contract mismatch must be resolved in docs/contract first, then code.

## 4. Knowledge/Evidence Layer

The current article-centric model is extended to a Workspace Knowledge Model.

Core entities for v0.8:

- Workspace
- Article
- ArticleRevision
- ArticleSnapshot
- Source
- SourceChunk
- Transcript
- TranscriptSegment
- Claim
- EvidenceLink
- KnowledgeEntity
- KnowledgeEdge
- VerificationRun
- VerificationIssue
- MediaAsset
- PlatformOutput
- ProcessingJob

Key rules:

- Sources may be reusable workspace assets rather than belonging exclusively to one article.
- Article ↔ Source is represented through a relation such as `article_sources`.
- Evidence should resolve to `source_chunk_id` and/or `transcript_segment_id` where possible.
- Claim/Evidence is a shared domain used by RAG, Verify, Data Map and Archive.
- Data Map is a projection/consumer of shared relation data, not an independent data silo.
- PostgreSQL relations are sufficient for MVP; a graph database is explicitly deferred.

Conceptual relationship:

```text
Workspace
 ├─ Article ─ ArticleSnapshot ─ Verification / PlatformOutput
 ├─ Source ─ SourceChunk ─┐
 ├─ Transcript ─ Segment ├─ EvidenceLink ─ Claim
 └─ KnowledgeEntity ─ KnowledgeEdge ───────┘
```

## 5. Contract v0.8 scope

Freeze now:

- entity names and ownership
- ID/FK/nullability/cardinality
- revision vs immutable snapshot semantics
- Claim/Evidence/Entity relationships
- upload → complete → processing job lifecycle
- common Job states
- common error envelope
- minimum request/response shapes for each feature

Do **not** freeze advanced implementation details before the vertical slice.

## 6. Required Vertical Slice before v1.0

Use one real article and execute end-to-end:

`Source upload → ingest/chunk → RAG → Article edit/autosave → immutable snapshot → Claim/Evidence → Verify → Data Map query → Platform conversion → Archive/Export`

Record every contract mismatch discovered by the slice.

## 7. Contract v1.0 Freeze gate

Freeze only after the vertical slice succeeds:

- ERD v1.0
- OpenAPI v1.0
- Job/Event Contract v1.0
- Storage Contract v1.0
- Error Contract v1.0
- representative fixtures
- contract tests

After freeze, breaking changes require an explicit Contract Change plus migration/fixture/test updates.

## 8. Deferred improvements after v1.0

- advanced Data Map visualization
- automatic entity/relation extraction improvements
- cross-article discovery/recommendation
- source credibility scoring
- graph database adoption
- advanced RAG reranking
- bidirectional CMS integration

Principle: **freeze the data foundation before v1.0; evolve advanced experiences after v1.0.**

## 9. Team implementation rules

1. Check contract fixtures before FE/BE implementation.
2. Do not independently change API/DB shapes inside a feature branch.
3. Existing code is Reality Audit evidence, not the final contract by itself.
4. Do not duplicate Source/Claim/Evidence persistence across features.
5. Every feature must propagate stable shared IDs required by the vertical slice.
6. Integration is complete only when contract tests and Critical E2E pass.

## 10. Immediate next actions

- [ ] Build Current Implementation Matrix from the four active code lines.
- [ ] Update ERD v0.8 with Workspace Knowledge + Claim/Evidence/Entity relationships.
- [ ] Draft OpenAPI v0.8.
- [ ] Define representative fixtures and common error codes.
- [ ] Execute one real-article vertical slice.
- [ ] Resolve mismatches and freeze Contract v1.0.
- [ ] Resume parallel feature development and post-v1 improvements.

Related working note: Notion `Technical Contract Alignment v0.8 — Knowledge/Evidence Layer & Phase -1`.