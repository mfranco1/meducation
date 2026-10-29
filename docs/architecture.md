# Architecture

PostgreSQL holds the only writable paired quiz/flashcard bank. The FastAPI service publishes a request-pinned release to the learner and, behind authentication, serves the editor. Learner progress lives in browser `localStorage`. There is no runtime generative AI, and nothing falls back to content files. Operations are in [operations](operations.md).

## Repository ownership

One frontend package and one Python package. Root HTML entries and tool configuration stay at the root. Use relative imports; add aliases only when TypeScript, Vite, tests, scripts and the lint boundary patterns all resolve them.

- `src/app`: learner composition, navigation identity, lazy screens, drawer, progress backup wiring.
- `src/features/quizzes`, `src/features/flashcards`: screens, session coordination, selectors.
- `src/shared`: theme, brand and reusable presentation under `ui/` (shell, loading, transitions, notifications, content, study, catalog).
- `src/domain`: pure rules, types, repository interfaces. `src/analytics`: pure aggregation. `src/persistence`: storage repositories and codecs.
- `src/content`: `schema` (stored contracts), `api` (transport, decoders, runtime repositories), `validation`, `richText`.
- `src/admin`: authoring composition and presentation, with `core` (pure operations) and `data` (HTTP gateway) kept free of UI.
- `backend/src/meducation_api`: `main.py` routes, `repositories` (PostgreSQL readers), `db` (engines, migrations, jobs, draft records, exports), `auth` (OIDC and sessions), `admin` (paired editor services), `content_policy` (packaged validator).
- `scripts/content`, `scripts/containers`, `scripts/local-authoring`, `scripts/testing`: maintenance tooling outside the application graph.
- Tests sit beside their modules; `src/test` has setup and fixtures, `tests/fixtures` shared contracts, `e2e` browser workflows.

Extend existing modules before adding files. Avoid barrels, forwarding modules and speculative shared layers.

## Checked dependency boundaries

`npm run lint` enforces these with `@typescript-eslint/no-restricted-imports` blocks in `eslint.config.mjs` (one per directory; tests keep only the UI-library rule). Cycles are not checked, and the learner bundle's exclusion of admin and bank modules is checked on the built output (`scripts/containers/check-learner-artifacts.mjs`).

- `domain`, `analytics`, `persistence` and `content` import only `domain` (plus themselves) and no application layers.
- `domain`, `analytics`, `persistence`, `content` and `admin/core`, `admin/data` cannot import React, MUI or Emotion. Production code never imports tests, fixtures, `e2e` or `scripts`.
- `shared` never imports `app`, `features`, `admin` or `persistence`.
- `features` never import `app`, `admin` or sibling features. Only `session/` modules use concrete persistence; elsewhere import types only.
- `admin/core` and `admin/data` do not import admin presentation, `app`, `features` or `shared`. `app` is the composition root.

## Content flow

1. Authors edit draft records through the editor; publication builds both documents from the draft, creates an immutable release and moves the active pointer (see Releases).
2. Each API content request reads the active pointer once and pins that finalized release for both quiz and flashcard readers. Immutable catalogs are cached per release (two latest per worker). Database failure returns a sanitized `content_unavailable` 503; nothing falls back to files or stale caches.
3. The learner loads content in stages and revalidates at launch ([product](product.md#loading-and-freshness)). The API gzips responses (Starlette `GZipMiddleware`). `src/content/api` validates every DTO (membership, order, ownership, answer references) before it enters a revision-scoped cache; `contentTransport` owns timeouts, retries and cancellation; `launchFreshness.ts` owns the launch check.

Worker startup checks schema and publication once; workers never migrate, import or bootstrap, and health routes do not query Postgres.

## Releases

- A release is an immutable, finalized pair of banks identified by a UUID. It stores both validated documents as TEXT artifacts plus normalized `content` rows keyed `(release_id, id)` with composite foreign keys and a zero-based global `position`. SQL NULL means an omitted optional field. Nothing is trimmed, normalized or regenerated. Quiz and flashcard revisions are `sha256-` digests of the deterministic serialization, separate from the publication sequence; storing a pair that matches an existing release reuses it.
- A singleton pointer holds `(release_id, publication_sequence)`. Activation locks it, checks the expected sequence and appends an event; every activation, including rollback, gets a new sequence. Rollback never deletes newer releases or resets counters.
- A global operation ledger with fingerprints makes store and activation replayable; audit, import and publication histories are append-only.
- Release writes go through fixed-search-path, narrowly granted SQL functions. The reader sees only published views; the editor writes only draft tables and calls the release functions; owner and migrator are trusted maintenance roles.
- Subject, topic, quiz and question IDs come from sequences that never move backward; decks and cards use UUID-based IDs. A restored database can rewind sequences, so recovery advances them ([operations](operations.md#backup-and-restore)).
- Alembic migrations live in `backend/src/meducation_api/migrations`; destructive downgrade is refused.

## Learner progress

`src/main.tsx` checks `hasStartedStudying` (`persistence/visitorStart.ts`) before the first render and either boots the app or lazy-loads the landing page (`src/app/landing`), so returning learners never see it. `LocalAttemptRepository` stores quiz progress under `meducation.progress.v2`; flashcard checkpoints use `meducation.flashcards.progress.v2`. Only current keys are read. Malformed current data is preserved and reported, never replaced. Quiz completions commit history, durable counts, scores, activity and completed IDs in one write; history is capped at 200 while completed IDs stay durable. Active attempts carry a content signature so changed content forces an explicit restart.

Repositories cache frozen snapshots exposed through `useSyncExternalStore`; getters never write, and writes or `storage` events invalidate. Revisions are optimistic edit tokens: a stale tab must reload. Paired restore writes both keys and rolls both back if either write fails; there is no cross-tab lock ([product](product.md#progress-backup-restore-and-reset)).

## Rich content

The policy is defined in [question schema](question-schema.md#markdown-and-rationale-metadata). `src/content/richText` implements it; `MarkdownContent` is the only renderer and sanitizes with `rehype-sanitize`. Content is validated at authoring time (`src/content/validation`, packaged as a Node worker for the API) and sanitized again at render time; the browser never rewrites authored text.

## Admin and editor

- `admin.html` is a separate optional entry (`npm run build:admin`); learner builds omit it. Static assets and build flags grant nothing.
- `PairedHttpClient` (`src/admin/data`) owns session, CSRF, one-attempt requests, one-command-at-a-time admission and the sign-in requirement. `DraftStore` is the only record gateway: it loads the draft once, and every write is one record call (create, patch with `expectedVersion`, move, delete with `cascade`, bulk create, revert, discard, publish, activate). An edit replaces the local record with the server's response; creates, moves, deletes, bulk adds and reverts reload the draft. The server assigns IDs and runs validation; the client sends only the fields the author changed and never rebuilds or remaps a bank.
- `useRecordEditor` is the one editing hook for every record kind (subject, topic, quiz, question, deck, card): unsaved JSON text, Save, version-conflict handling (the author's text is kept beside the server's copy) and following server changes. `QuizAdminPanel`, `FlashcardAdminPanel` and `SubjectEditorDialog` use it; `AdminWorkspace` owns the shared delete dialog, whose impact counts come from the loaded draft. Bulk adds compile content-only JSON into a plan (`core/bulkAddDraft.ts`, `core/flashcardBulkAddDraft.ts`) that `DraftStore.addTree` runs as creates plus bulk calls; topics, quizzes and decks whose names match existing siblings are reused rather than created. Unique sibling names are enforced by indexes on the draft tables. Search, pagination (`core/navigator.ts`) and reorder targets (`core/reorder.ts`) stay in `admin/core`. Hook, panel and app tests run the real store over a fake record API (`src/test/adminGateway.ts`).
- The server owns the draft, its change history, per-record revert and discard. The editor shows unpublished changes from the draft's `changed` flag, lists recent changes with Revert, and keeps only unsaved text locally.
- `backend/.../auth` verifies OIDC identity, stores sessions in `admin_auth`, and authorizes the whole `/api/admin` prefix ([operations](operations.md#editor-login-and-sessions)). `backend/.../admin` implements the per-record draft API, publish, activate and export under the editor role, which may write only the draft tables and change log and calls the release store/activate functions. Details: [content management](content-management.md#record-api-and-publication).
- Public learner routes use the reader role and ignore admin cookies.

## Entry points

`src/main.tsx` boots the learner through `index.html`; Vite proxies `/api` to the API in development, and production hosting must route `/api` to FastAPI. Container packaging: pinned non-root API and Nginx images ([operations](operations.md#containers)).
