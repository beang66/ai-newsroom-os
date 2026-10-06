# Data Map integration — implementation proposal

Status: frontend Implemented; Core integration and real-article E2E pending.
Basis: main `0e7a66d`, feature/app-core `ed3d47b`, Notion Data Map MVP v0.1.

## Boundaries

```text
App: article + workspace session + navigation
  → DataMap / MapGraph / NodeDetail (view + local selection)
  → useDataMap (loading, retry, cancellation, stale response protection)
  → api.js.getDataMap({ workspaceId, articleId, signal })
  → HTTP today / injected Core transport later
  → normalizeDataMap (projection validation; no inferred relationships)
```

All new server requests and routes are in `src/api.js`. There is no DB access,
RAG processing, new verification, or graph persistence in the feature.
Existing component props stay independent of transport. App owns article navigation.
Final product remains Windows EXE + IPC; HTTP is the integration test transport.

## Core hookup

The existing v0.8 route is used unchanged:
`GET /v1/workspaces/{workspace_id}/knowledge/map?article_id={article_id}`.
This route is **not implemented in inspected feature/app-core**. Its current
`createCoreApi` also has no knowledge-map named method. Do not claim runtime
integration until Core provides it. `/v1` is forwarded to localhost:3001 in Vite;
adjust target to the actual test Core or set `VITE_CORE_BASE_URL`.

1. Supply the persisted Article and authorized workspace from App Core session.
   Current main uses `art-1` mock IDs; these are not real workspace UUIDs.
2. Set `VITE_DATA_MAP_MODE=api`. Development defaults to explicitly labelled demo;
   production defaults to API. Server failures never switch to demo.
3. Implement/agree the projection payload below within existing KnowledgeMap.
4. For IPC, inject `createDataMapApi({ transport: coreTransport }).getDataMap` as
   DataMap's `load` prop. Transport is `json(path, null, signal)`, matching Core's
   current method shape. Core must authorize workspace and article server-side.
   No token or provider key is stored in this feature.

## Data Map edits

The Data Map reader can save page edits as an additional local prototype revision.
`Source` and `SourceChunk` remain the canonical source records; the prototype does
not overwrite original source bytes or mutate a frozen chunk. Contract v0.8 has no
source-edit/revision operation, so live persistence must wait for an agreed Core
method and revision entity/ownership rules. The UI calls `api.js.saveSourceRevision`
with workspace, source, and source-chunk IDs; the host injects its route or IPC
method once that contract is approved. Do not infer or hard-code an endpoint.

Prototype fixture identifiers are stable UUID-shaped IDs; legacy fixture keys are
kept separately as `legacy_id`. Live API adapters pass through canonical shared
UUIDs for Workspace, Article, Source, SourceChunk, KnowledgeEntity, and
KnowledgeEdge. UI code must not create a parallel identifier for an existing
Core record. 5. Wire original-source navigation to Core's source viewer when storage-backed
resources become available. HTTP(S) URLs open directly; absent content or URL
explicitly shows unavailable, never a fake success.

## Projection fields to agree (not a frozen new contract)

v0.8 specifies `entities[]` and `edges[]` with open object fields. This UI consumes:

```json
{
  "snapshot_id": "snapshot-uuid",
  "revision_id": "revision-uuid",
  "entities": [
    {
      "id": "article-uuid",
      "kind": "article",
      "label": "기사명",
      "status": "draft"
    },
    {
      "id": "claim-uuid",
      "kind": "claim",
      "article_id": "article-uuid",
      "label": "주장 문장",
      "claim_text": "주장 문장",
      "verification_status": "needs_review",
      "article_location": { "paragraph": 2 }
    },
    {
      "id": "source-uuid",
      "kind": "source",
      "label": "자료명",
      "source_type": "pdf",
      "source_url": "https://example.com/report.pdf#page=3",
      "source_location": { "page": 3 }
    },
    {
      "id": "entity-uuid",
      "kind": "entity",
      "label": "인물명",
      "entity_type": "person"
    }
  ],
  "edges": [
    { "source_id": "article-uuid", "target_id": "claim-uuid" },
    { "source_id": "claim-uuid", "target_id": "source-uuid" },
    { "source_id": "claim-uuid", "target_id": "entity-uuid" }
  ],
  "evidence_links": [
    {
      "id": "evidence-uuid",
      "claim_id": "claim-uuid",
      "source_id": "source-uuid",
      "evidence_text": "원문 발췌",
      "source_location": { "page": 3 },
      "relation": "supports"
    }
  ]
}
```

`evidence_links`, snapshot/revision fields are proposed optional enrichment. They
must be agreed with the domain/Core owners; this change does not freeze v1.0.
Stable IDs are retained. KnowledgeEntity `type` can alias `kind`; actual Core
DTO changes belong in `model.js`, not components. Evidence is detail-only.
Statuses: verified / needs_review / unverified; unknown defaults to unverified.
Locations: page, start_ms, paragraph, or label. Retrieval score is never truth.
Null/missing source is tolerated, duplicate IDs/dangling edges produce warnings.
No invented Source node is created for an unlinked Claim.

Article jump locates one exact matching sentence in current textarea and selects
it. Missing/duplicate sentence gives a notice; snapshot-specific editor anchors
remain a Core/editor integration follow-up. It does not rewrite the claim or
change verification results. Demo fixtures retain the current article's “70%”.

## Interaction and reference

Sidebar Data Map is directly below Platform conversion; binder navigation includes
the same destination. Existing glass header, pill controls, rounded white workspace
and neutral active colors remain. Search keeps immediate relationship context.
Filters remove nodes and their incident edges together. Focus is one-hop only;
back restores prior selection, reset clears search/filter/focus. Graph has pan,
zoom and fit; list view is keyboard-friendly and defaults on narrow windows.

Genspark sources consulted 2026-10-05:

- https://www.genspark.ai/helpcenter/secondbrain
- https://www.genspark.ai/business/products/secondbrain
- https://www.gensparkcommunity.com/seoul/post/genspark-secondbrain-note-tea-meetup-recap-D1Ng1QnvQY1qR7a

Reference influence: connected information exploration and traceable original
context. Search, one-hop focus, history and list view are newsroom design decisions,
not assertions that those exact controls exist in Genspark. No AI auto-relations,
note editing, multi-article graph or extra graph DB added.

## Validation

`npm run check` checks lint and production build.
`node --test tests/data-map.test.js` covers partial/dangling data, scope filtering,
node/edge filters, search context, unsafe source links, HTTP error envelopes,
request scope, invalid responses, timeout and injected transport cancellation.
Browser verification (2026-10-05): menu position, claim→evidence→source-content
dialog, graph/list switching, empty-search/reset, missing-source filter,
focus/linked-node/back/reset and exact article sentence selection passed.
Narrow (390px) and desktop (1440px) layouts were visually inspected.
Automated validation: lint/build and all six Node tests passed.
Real Core round-trip requires the provider endpoint and persisted article context.
