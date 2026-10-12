# Foam-style knowledge files for DataMap

## Goal

Let a journalist import Markdown into the app-managed encrypted workspace and follow explicit file links in either direction from DataMap. Foam is the behavioral reference for file identity, short-link resolution, missing targets, and incremental graph updates; the implementation belongs to the existing Python App Core.

## Boundaries

- The user explicitly imports one or more Markdown files, including a folder selection that carries relative paths. No external folder watcher or arbitrary filesystem traversal.
- Imported content and index rows remain inside the existing SQLCipher database. An import updates a file at the same normalized workspace path while retaining its UUID. A new path receives a UUID v4. Existing article and source IDs remain unchanged.
- The existing `knowledge-map` response keeps its article/source/snapshot fields and adds `files[]`, `unresolved[]`, `file_links[]`, and `links_to` edges. Only resolved links become graph edges. Unresolved references become explicitly labeled placeholders, never inferred Source records.
- The UI extends the current DataMap visual language and exposes file import, file list, outgoing links, incoming mentions, unresolved targets, loading, and actionable errors.

## Storage model

- `knowledge_files(id, workspace_id, path, path_key, title, content, sha256, created_at, updated_at)`. `path_key` is a case-folded normalized POSIX path, unique within the one workspace. A path must be relative, end in `.md`, contain no `.`/`..` segments or control characters, and be at most 512 characters.
- `knowledge_links(source_id, ordinal, kind, raw_text, target_ref, fragment, target_id, target_key, line)`. `source_id` references a file and `target_id` is nullable. The unique `(source_id, ordinal)` preserves repeated links in source order. `target_key` makes a missing target stable across reads. Indices support outgoing and incoming lookup.
- A placeholder ID is deterministic UUID v5 from the normalized missing target key. It disappears when no link refers to it; adding a matching file resolves it without changing the source file ID.
- Delete removes a file and its outgoing rows, then re-resolves incoming links to a remaining candidate or placeholder. Import/reimport re-parses only changed files and re-resolves links that may now target a different file. For the expected hundreds of documents, a single transaction may re-resolve the link rows; content parsing remains incremental by hash.

## Parsing and resolution

- Parse `[[name]]`, `[[folder/name]]`, `[[name|label]]`, `![[embed]]`, `[label](path.md)`, and Markdown images. Ignore external URI schemes, code fences, inline code, and empty targets. Retain the raw text, line number, fragment, and embed flag.
- Wikilinks resolve in this order: exact relative path from the source folder; exact workspace path; shortest matching path suffix/basename, ordered deterministically. `.md` is optional. Directory links resolve to `index.md` before `README.md`. Markdown links resolve relative to the source folder, or from the workspace root for `/path.md`.
- Fragment identifiers select a section or block within a resolved file for future reading; the graph relation is between files. Link labels never rename targets. Paths escaping the managed workspace stay unresolved and cannot read outside it.
- Duplicate names, case-only collisions, percent-encoded paths, and Unicode file names must resolve deterministically. Repeated links remain distinct in `file_links[]`; the graph may deduplicate source→target edges for legibility.

## API and user flow

- `POST /api/knowledge-files/import` accepts `{files:[{path,content}]}` and returns per-file IDs plus imported/updated/unchanged counts. The request has a bounded size; malformed entries fail atomically with a specific `RequestError`.
- `GET /api/knowledge-files/{id}` returns the encrypted-store-backed Markdown text and link details. `POST /api/knowledge-files/{id}/delete` removes a file and recomputes impacted resolutions. The existing local Origin/Host guard applies.
- `GET /api/knowledge-map` includes file summaries and directed links. Each file includes stable ID, title, path, updated time, outgoing count, and backlink count. Each link states source, target or placeholder, relation, resolved state, kind, raw text, fragment, and line. Client projection uses only these facts.
- File-list import control accepts `.md` files and folders. Import shows progress and refreshes the graph. The selected file panel separates “나가는 링크” and “이 파일을 언급한 문서”; empty and missing states explain the next action. Keyboard users can reach the same list and details.

## Verification

- Python tests cover encrypted storage, path validation, Markdown parsing, deterministic ambiguous resolution, placeholder→file and file→placeholder transitions, updates, deletion, duplicate links, and existing article/source edges.
- API tests cover payload and size rejection. JavaScript tests cover projection and file import adapter. Build, lint, and the relevant unit tests pass.
- No new runtime dependency or UI library is required. The Foam source remains a reference; its TypeScript code is not copied into the Python runtime.
