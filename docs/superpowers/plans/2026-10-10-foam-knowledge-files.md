# Foam-style Knowledge Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import Markdown into the encrypted workspace and show resolved links, missing targets, and backlinks in DataMap.

**Architecture:** Python core owns paths, parsing, resolution, storage, and graph facts. SQLite stores file content and parsed links. React uses the existing Core transport and projects only explicit relations.

**Tech Stack:** Python 3, SQLCipher, React 19, Vite, existing DataMap CSS.

**Spec:** `docs/superpowers/specs/2026-10-10-foam-knowledge-files-design.md`

## Global Constraints

- Preserve article/source/snapshot IDs and current `knowledge-map` fields.
- Store imported Markdown and link rows in SQLCipher.
- No external folder watcher, inferred edges, or new runtime dependency.
- Keep DataMap within its existing visual system and support keyboard access.

## Review Focus

- A `../` import path must be rejected before any database write.
- A code-fenced `[[link]]` must not create a graph edge.
- Importing a previously missing target must update the source's backlink relationship.
- Reimporting a changed file must keep its ID and replace stale outgoing links.
- Deleting a target must leave a visible unresolved reference, not a dangling edge.

---

### Task 1: Storage and Markdown link parser

**Files:** Create `article_editor/app/core/knowledge_files.py`; modify `article_editor/app/core/vault.py`; test `article_editor/dev/tests/test_knowledge_files.py`.

**Interfaces:** `import_files(payload: dict) -> dict`, `get_file(file_id: str) -> dict`, `delete_file(file_id: str) -> dict`, `parse_links(content: str) -> list[dict]`.

- [x] Write failing tests for path rejection, file ID retention, encrypted content, and code-fence/link extraction.
- [x] Run `python -m unittest article_editor.dev.tests.test_knowledge_files` and observe the expected failures.
- [x] Add schema and minimal parser/import implementation.
- [x] Run the same tests and confirm pass.

### Task 2: Resolution and backlinks

**Files:** Modify `article_editor/app/core/knowledge_files.py`; test `article_editor/dev/tests/test_knowledge_files.py`.

**Interfaces:** `resolve_links(db) -> None`, `map_items(db) -> tuple[list, list, list]`.

- [x] Write failing tests for basename ambiguity, directory indexes, placeholders, incoming links, reimport, and delete.
- [x] Run the focused tests and observe failures.
- [x] Implement deterministic resolution and reverse lookup, then run the tests to pass.

### Task 3: Core API and DataMap read model

**Files:** Modify `article_editor/app/core/read_models.py`, `article_editor/app/core/managers/storage_manager.py`, `article_editor/app/core/api.py`; test `article_editor/dev/tests/test_knowledge_files.py` and relevant API tests.

**Interfaces:** `knowledge_map() -> dict` adds `files`, `unresolved`, `file_links`; StorageManager delegates import/get/delete.

- [x] Write failing tests for response compatibility and route behavior.
- [x] Run focused tests and observe failures.
- [x] Wire endpoints and read model, then run focused tests to pass.

### Task 4: DataMap interaction

**Files:** Modify `src/api/core-api.js`, `src/features/data-map/api.js`, `src/features/data-map/domain/coreProjection.js`, `DataMapView.jsx`, `components/ContextPanel.jsx`, `components/ResourceTable.jsx`, `components/KnowledgeGraph.jsx`, `constants.js`, `data-map.css`; test `article_editor/web` DataMap tests.

**Interfaces:** Core transport imports/gets/deletes files; projection adds note and placeholder nodes and directed `links_to` edges.

- [x] Write failing projection and interaction tests.
- [x] Run focused tests and observe failures.
- [x] Add import controls, explicit link sections, missing-target treatment, and refresh behavior.
- [x] Run `npm run lint` and `npm run build` in `article_editor/web`.

### Task 5: End-to-end verification

**Files:** Modify tests or docs only where a measured failure requires it.

- [x] Run Python knowledge-file and existing DataMap read-model tests.
- [x] Run JavaScript tests and frontend build.
- [x] Inspect changed files for plaintext writes, dangling edges, and UI accessibility regressions.
- [x] Record test results and any limits in the handoff.

This checkout has no `.git` directory, so commit steps are unavailable here.
