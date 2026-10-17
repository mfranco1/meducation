# Architecture

PostgreSQL holds the only writable paired quiz/flashcard bank. The FastAPI service publishes a request-pinned release to the learner and, behind authentication, serves the editor. Learner progress lives in browser `localStorage`. There is no runtime generative AI. See [ADR 0006](decisions/0006-postgres-only-content.md); operations are in [operations](operations.md).

## Repository ownership

One frontend package and one Python package. Root HTML entries and tool configuration stay at the root. Use relative imports; add aliases only when TypeScript, Vite, tests, scripts and the boundary check all resolve them.

- `src/app`: learner composition, navigation identity, lazy screens, drawer, progress backup wiring.
- `src/features/quizzes`, `src/features/flashcards`: screens, session coordination, selectors.
- `src/shared`: theme, brand and reusable presentation under `ui/` (shell, loading, transitions, notifications, content, study, catalog).
- `src/domain`: pure rules, types, repository interfaces. `src/analytics`: pure aggregation. `src/persistence`: storage repositories and codecs.
- `src/content`: `schema` (stored contracts), `api` (transport, decoders, runtime repositories), `validation`, `richText`.
- `src/admin`: authoring composition and presentation, with `core` (pure operations) and `data` (HTTP gateway) kept free of UI.
- `backend/src/meducation_api`: `main.py` routes, `repositories` (PostgreSQL readers), `db` (engines, migrations, jobs, transfer), `auth` (OIDC and sessions), `admin` (paired editor services), `content_policy` (packaged validator).
- `scripts/content`, `scripts/architecture`, `scripts/containers`, `scripts/local-authoring`, `scripts/testing`: maintenance tooling outside the application graph.
- Tests sit beside their modules; `src/test` has setup and fixtures, `tests/fixtures` shared contracts, `e2e` browser workflows.

Extend existing modules before adding files. Avoid barrels, forwarding modules and speculative shared layers.

## Checked dependency boundaries

`npm run lint` applies the `architecture/boundaries` ESLint rule and a whole-graph check (`npm run check:architecture`); policy lives in `scripts/architecture/boundaries.mjs` and is tested by `npm run test:architecture`. Static, type-only, `require` and literal dynamic imports are resolved with TypeScript resolution; non-literal paths are rejected.

- `domain` imports only `domain`. `analytics` imports `domain`, `analytics`. `persistence` imports `domain`, `persistence`.
- `content` imports `domain`, `content`. Production code never imports tests, fixtures, `e2e` or `scripts`.
- `domain`, `analytics`, `persistence`, `content` and `admin/core`, `admin/data` cannot import React, MUI or Emotion.
- `shared` imports `domain`, `analytics`, `content`, `shared`.
- `features` import their own feature plus `domain`, `analytics`, `content`, `shared`, `persistence`; never `app`, `admin` or sibling features. Only `session/` modules use concrete persistence; selectors and components use contracts or types.
- `admin/core` and `admin/data` do not import admin presentation or browser layers. `app` is the composition root.
- Runtime cycles (including dynamic edges) are rejected. The learner entry graph must not reach bundled banks, QA viewers or the validation pipeline.

## Content flow

1. Authors edit draft records through the editor; publication builds both documents from the draft, creates an immutable release and moves the active pointer ([schema decision](decisions/0005-paired-content-releases-and-postgres-schema.md)).
2. Each API content request reads the active pointer once and pins that finalized release for both quiz and flashcard readers. Immutable catalogs are cached per release (two latest per worker). Database failure returns a sanitized `content_unavailable` 503; nothing falls back to files or stale caches.
3. The learner loads a lightweight subject catalog first, a subject's quiz or deck list when selected, and question or card bodies only when a session starts. `src/content/api` validates every DTO (membership, order, ownership, answer references) before it enters a revision-scoped cache; `contentTransport` owns timeouts, retries and cancellation.
4. Launching a quiz or deck revalidates the catalog and requires evidence younger than 30 seconds (`launchFreshness.ts`). Active study keeps the content it loaded. See [product](product.md#content-freshness-at-launch).
5. Quiz and flashcard revisions are `sha256` digests of deterministic serializations and are separate from the publication sequence.

Worker startup checks schema and publication once; workers never migrate, import or bootstrap, and health routes do not query Postgres.

## Learner progress

`LocalAttemptRepository` stores quiz progress under `meducation.progress.v2`; flashcard checkpoints use `meducation.flashcards.progress.v2`. Only current keys are read. Malformed current data is preserved and reported, never replaced. Quiz completions commit history, durable counts, scores, activity and completed IDs in one write; history is capped at 200 while completed IDs stay durable. Active attempts carry a content signature so changed content forces an explicit restart.

Repositories cache frozen snapshots exposed through `useSyncExternalStore`; getters never write, and writes or `storage` events invalidate. Revisions are optimistic edit tokens: a stale tab must reload. Paired restore writes both keys and rolls both back if either write fails; there is no cross-tab lock ([ADR 0002](decisions/0002-progress-backup-and-restore.md)).

## Rich content

Stems, rationales and card faces use the rich policy (GFM, a limited HTML subset, KaTeX math, images); choices, explanations, pearls and sources use restricted Markdown. `src/content/richText` defines the policy; `MarkdownContent` is the only renderer and sanitizes with `rehype-sanitize`. Math renders locally with KaTeX. Image URLs must be app-local or from configured HTTPS origins. Content is validated at authoring time (`src/content/validation`, packaged as a Node worker for the API) and sanitized again at render time; the browser never rewrites authored text.

## Admin and editor

- `admin.html` is a separate optional entry (`npm run build:admin`); learner builds omit it. Static assets and build flags grant nothing.
- `PairedHttpClient` (`src/admin/data`) owns session, CSRF, one-attempt requests, one-command-at-a-time admission and the sign-in requirement. `DraftStore` is the only record gateway: it loads the draft once, and every write is one record call (create, patch with `expectedVersion`, move, delete with `cascade`, bulk create, revert, discard, publish, activate). An edit replaces the local record with the server's response; creates, moves, deletes, bulk adds and reverts reload the draft. The server assigns IDs and runs validation; the client sends only the fields the author changed and never rebuilds or remaps a bank.
- `useRecordEditor` is the one editing hook for every record kind (subject, quiz, question, deck, card): unsaved JSON text, Save, version-conflict handling (the author's text is kept beside the server's copy) and following server changes. `QuizAdminPanel`, `FlashcardAdminPanel` and `SubjectEditorDialog` use it; `AdminWorkspace` owns the shared delete dialog, whose impact counts come from the loaded draft. Bulk adds compile content-only JSON into a plan (`core/bulkAddDraft.ts`, `core/flashcardBulkAddDraft.ts`) that `DraftStore.addTree` runs as creates plus bulk calls. Search, pagination (`core/navigator.ts`) and reorder targets (`core/reorder.ts`) stay in `admin/core`. Hook, panel and app tests run the real store over a fake record API (`src/test/adminGateway.ts`).
- The server owns the draft, its change history, per-record revert and discard. The editor shows unpublished changes from the draft's `changed` flag, lists recent changes with Revert, and keeps only unsaved text locally.
- `backend/.../auth` verifies OIDC identity, stores sessions in `admin_auth`, and authorizes the whole `/api/admin` prefix. `backend/.../admin` implements the per-record draft API, publish, activate and export under the editor role, which may write only the draft tables and change log and calls the release store/activate functions. Details: [content management](content-management.md#record-api-and-publication), [operations](operations.md#editor-login-and-sessions).
- Public learner routes use the reader role and ignore admin cookies.

## Entry points

`src/main.tsx` boots the learner through `index.html`; Vite proxies `/api` to the API in development, and production hosting must route `/api` to FastAPI. Container packaging: pinned non-root API and Nginx images ([operations](operations.md#containers)).
