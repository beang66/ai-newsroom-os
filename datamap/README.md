# Newsroom Data Map — standalone UX prototype

Original `../newsroom-main` and synced `../sources` are untouched. This separate
project contains **only the data-map feature**, no writer, publisher, converter,
transcription service, authentication, DB client, or live newsroom data.

## Run

Node 22.12+; `npm ci`, `npm run dev` → http://127.0.0.1:5181.
`npm run check` runs lint, domain/API tests and a production build.

## UX

- Deterministic circular mesh: 8 article hubs, 520 initial nodes, 67
  cross-project bridges. Bridges pair meaningful nodes of the same type with
  shared topic tags; layout-only points never imply a real relationship.
- Original Newsroom-style header, sidebar and binder tabs are retained in this
  standalone shell. Non-data-map feature buttons are visible but disabled.
- Article selection highlights derived sources, evidence, people, audio and notes.
  Direct relations use purple; indirect context dims; unrelated nodes fade.
- Straight, fine links; pan, wheel/button zoom, focus selected node, fit,
  labels and expanded map. The slightly irregular circular clusters are fixed
  so the graph remains predictable while navigating between views.
- Project and type filters; shared search; a **separate paginated file list**.
- File-list upload and delete controls affect only in-memory graph entries. The
  browser retains metadata (name, kind, size), not file bytes; no upload request,
  disk delete, DB write or original-source mutation occurs. Reload restores the
  fixture. Live Core file operations require a future API contract.
- A node summary card plus ranked projects/files with reasons, explicit example scores.
- Projects are sub-tabs under the Data Map section; “나의 기사 모아보기” opens the project-scoped Article collection.
- Each meaningful document has page records; audio has timestamp records, not playback. Page text can be edited into a new local revision; original fixture content remains intact.
- Modal reader: page navigation, page summary, review notes, bookmarks, reading history.
  Notes, bookmarks and visits live only in React session state; reload resets them.
- Some nodes intentionally have no content. All names, contents, relationships and
  scores are synthetic. No claim of real AI similarity, verification, or source retrieval.

Reference: the user's two Genspark memory-map screenshots guide the point-cloud,
article hubs, fine edges and context emphasis. Genspark's official
[SecondBrain guide](https://www.genspark.ai/helpcenter/secondbrain) informed cross-source
context discovery. Project ranking and newsroom page-record UX are custom additions,
not claims of feature parity. No Genspark code, assets, or private data are used.

## Integration boundary

```
Host app: workspace/session/navigation
  → App({api, workspaceId})
  → api.js: getKnowledgeMap({workspaceId, signal})
  → injected HTTP/IPC request + agreed routes
  → KnowledgeGraph / ContextPanel / ResourceTable / ResourceReader
```

- `src/api.js` is the only server-request boundary. Demo is the explicit default.
- For real integration use `createDataMapApi({mode:'api', request, routes})`.
  `createHttpRequest({baseUrl})` is supplied; IPC can inject the same function shape.
  `saveSourceRevision` persists demo edits in browser storage. Production saves require an injected `routes.saveSourceRevision`; Contract v0.8 currently defines source creation and knowledge-map read, but no source-edit/revision endpoint. Agree its Core contract before wiring a live route.
  No production URL or new Core contract is assumed. Adapt Core DTOs at this boundary.
- DTO: `{nodes, edges, projects, meta}`. Live entity, project, edge, page/SourceChunk, and workspace identifiers use UUID-compatible `id`; demo fixture uses deterministic UUID-shaped IDs and keeps legacy display IDs separately. Nodes carry stable `id`, `articleId`,
  `projectId`, `kind`, `label`, `tags`, `summary`, `pages`, `x`, `y`.
  Edges carry `source`, `target`, `relation`; pages have `id`, `number`, `locator`,
  `title`, `text`, optional `note`. See fixture for exact shape.
- `domain/graph.js` owns indexes, graph traversal, filters, deterministic demo ranking.
  Replace ranking with authorized service results once a real contract exists.
- `data/fixture.js` owns demo content and seeded radial layout; no force simulation,
  embeddings, external documents, or DB are involved in this prototype.
- Original-source access controls, asynchronous page APIs, server pagination,
  revisions, persistence, graph layout workers and large-data virtualization remain
  integration tasks. The current SVG mesh targets ~520 nodes, not arbitrary scale.
- For embedding, lift session state and replace the shell in `App.jsx`; the feature
  components do not depend on the original Newsroom components or CSS.

## Safety / preservation

No source-file edits or writes to a backend. The interface has no destructive actions.
Google Fonts is optional styling; OS font fallbacks work if offline.

## Verified locally (2026-10-05)

- Lint, all 8 domain/API/layout tests, and production build pass.
- Browser: article and material selection, project/file ranking, summary cards,
  table search/type filtering, audio time segments, page bookmarking, review-note
  saving, reading-history navigation and bookmark restoration confirmed.
- Desktop layout and 390px mobile menu/table checked; no document-level horizontal overflow.
- No browser console errors in the final verification session.
- Original newsroom `src/` file hashes, Vite config and ignore file match the
  pre-task snapshot. No original code or synced source was removed or modified.
