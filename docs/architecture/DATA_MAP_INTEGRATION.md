# Data Map ↔ App Core integration

Status (2026-10-06): prototype projection implemented; current Core latest-article partial read available by injection; full KnowledgeMap endpoint and end-to-end integration pending. See [Core reality audit](./CORE_REALITY_AUDIT_2026-10-06.md).

## Three explicit modes

| Mode | Input | Behavior |
|---|---|---|
| `demo` (default) | deterministic fixture | 520 synthetic nodes; session-only file metadata; local browser page revisions |
| `core-latest` | `coreApi.latestArticle(signal)` from App Core's `createAppApi()` | one latest draft and its explicit `draft.sources[]` references. No Claim, EvidenceLink, SourceChunk or project is inferred |
| `api` | future `coreApi.getKnowledgeMap({workspaceId,articleId,signal})` or injected `request/routes.knowledgeMap` | v0.8 `{entities,edges}` plus optional agreed article/source/claim/project collections, projected into UI graph |

Usage inside the Core host:

```js
import { createAppApi } from "./api/index.js";
import { createDataMapApi } from "./datamap/api.js";

const coreApi = createAppApi({ mode: "auto" });
const dataMapApi = createDataMapApi({ mode: "core-latest", coreApi });
// <App api={dataMapApi} workspaceId={authorizedWorkspaceId} />
```

This is a partial read, not a live KnowledgeMap feature. The host must provide the authorized workspace context. `feature/app-core@ef03e337` has no `getKnowledgeMap` named method, map route, list of articles, SourceChunk API or project listing. Its actual paths are `/api/articles/latest`, `/api/articles/save`, `/api/sources/open` and `/api/sources/{16hex}/file`; v0.8's `/v1/workspaces/{workspace_id}/knowledge/map` is a proposed contract. The host and Core must agree on an HTTP route and an equivalent IPC method before using `api` mode.

## Projection rules

- `coreProjection.js` preserves Core IDs exactly. The current Core's article is 32hex and source is 16hex; these are legacy IDs until Core owns an explicit UUID mapping. The demo's UUID-shaped IDs do not substitute for persisted IDs.
- Only explicit `draft.sources[]`, `article_sources[]`, `claims[].article_id`, `evidence_links[]` and `KnowledgeEdge.from_entity_id/to_entity_id` produce links. Unknown or dangling references are omitted. There is no AI similarity or invented verification.
- The strict v0.8 KnowledgeMap has only KnowledgeEntity/KnowledgeEdge. Article, file library, page reader and project navigation require additional agreed data or separate named Core methods. Optional enriched collections are accepted, not yet frozen as v1.0.
- SourceChunk `id` is the page record ID when supplied; no source bytes or frozen chunks are edited. A live `saveSourceRevision` route has no v0.8 contract. Demo saves remain local; agree ownership, revision ID and validation before enabling live saves.
- Current Core's `openSource`/`sourceBytes` can expose stored original bytes for a source ID. The prototype's page reader does not yet call them. The host should bind original-source navigation after resolving authorization and URL/IPC behavior.
- `src/api.js` owns all requests. A host can inject the same named methods over HTTP or IPC. The feature never calls Core, Supabase, another prototype server or a DB from its components.

## Missing and duplicate responsibilities

| Type | Resolution |
|---|---|
| Missing: workspace-scoped article/source list, projects, Claim/Evidence, source chunks | Core owners define and expose a named read contract, with matching HTTP/IPC semantics |
| Missing: UUID alias/migration for legacy 32hex/16hex IDs | Core owns mapping; UI preserves originals until it exists |
| Undefined: Source revision, upload/delete, original viewer, graph pagination | Keep demo controls isolated; agree contract before live writes |
| Duplicate: Data Map's synthetic ranking and cross-project links | Demo only; do not store or treat as Core KnowledgeEdge |
| Duplicate: separate archive/verification/RAG persistence | Read shared Source/Claim/Evidence records from Core, with no second official DB |

Validation: `npm run check` runs lint, domain/API tests and build. A real Core round trip and IPC handoff remain integration gates.
