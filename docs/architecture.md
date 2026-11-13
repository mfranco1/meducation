# Architecture

PostgreSQL holds the only writable paired quiz/flashcard bank. The FastAPI service serves the active release to learners and, behind authentication, the editor. Learner progress lives in browser `localStorage`. Nothing falls back to content files. Operations are in [operations](operations.md).

## Repository ownership

One frontend package and one Python package. Root HTML entries and tool configuration stay at the root. Use relative imports.

- `src/app`: learner composition, navigation, lazy screens, landing page, progress backup wiring.
- `src/features/quizzes`, `src/features/flashcards`: screens, session coordination, selectors.
- `src/shared`: theme, brand and reusable presentation under `ui/`.
- `src/domain`: pure rules, types, repository interfaces. `src/persistence`: storage repositories and codecs.
- `src/content`: `schema` (stored contracts), `api` (transport, decoders, runtime repositories), `validation`, `richText`.
- `src/admin`: authoring composition and presentation, with `core` (pure operations) and `data` (HTTP gateway) kept free of UI.
- `backend/src/meducation_api`: `main.py` learner routes, `content` (draft records, releases, export), `repositories` (release-pinned readers), `db` (engines, migrations, recovery, the `meducation-db` CLI), `auth` (OIDC and sessions), `admin` (editor API and service), `content_policy` (packaged validator), `observability.py`.
- `scripts/`: maintenance tooling outside the application graph.
- Tests sit beside their modules; `src/test` has setup and fixtures, `tests/fixtures` shared contracts, `e2e` browser workflows.
- `marketing/`: separate package for ad videos. It adds nothing to the app build; see its README and AGENTS files.

Extend existing modules before adding files. Avoid barrels, forwarding modules and speculative shared layers.

## Dependency boundaries

`npm run lint` enforces the import boundaries defined in `eslint.config.mjs`. In short:

- `domain`, `persistence` and `content` import only `domain` and themselves.
- `domain`, `persistence`, `content`, `admin/core` and `admin/data` are free of React, MUI and Emotion.
- `shared` imports no application layer. `features` never import `app`, `admin` or sibling features, and only their `session/` modules use concrete persistence.
- `app` is the composition root. Production code never imports tests, fixtures, `e2e` or `scripts`.

Cycles are not checked. The learner build fails if it ships admin or bank modules (`scripts/containers/check-learner-artifacts.mjs`).

## Content flow

1. Editors change draft records; publication builds both documents from the draft, stores an immutable release and moves the active pointer.
2. Each API content request reads the active pointer once and pins that release for both quiz and flashcard readers. A database failure returns a sanitized 503; nothing falls back to files or stale caches.
3. The learner loads content in stages and revalidates at launch ([product](product.md#loading-and-freshness)). `src/content/api` validates every response before it enters a revision-scoped cache.

Worker startup checks schema and publication once. Workers never migrate or bootstrap, and health routes do not query Postgres.

## Releases

- A release is an immutable pair of banks stored as normalized rows. Draft, release and export documents are rebuilt from rows in canonical key order, so the same content always serializes identically. Quiz and flashcard revisions are `sha256-` digests of those documents.
- A singleton pointer holds the active release and a publication sequence. Every activation, including rollback, gets a new sequence; rollback never deletes newer releases.
- Publication history and draft change history are append-only.
- Database roles are narrow: the reader sees only published views; the editor writes only draft tables and calls the release functions; owner and migrator are maintenance roles.
- Subject, topic, quiz and question IDs come from sequences that never move backward; decks and cards use UUID-based IDs. A restored database can rewind sequences, so recovery advances them ([operations](operations.md#backup-and-restore)).
- Alembic migrations live in `backend/src/meducation_api/migrations`: a baseline plus later revisions. Destructive downgrade is refused.

## Learner progress

Progress repositories live in `src/persistence` and are exposed through `useSyncExternalStore`. Invariants:

- Only current storage keys are read. Malformed stored data is preserved and reported, never replaced.
- Getters never write. A write is rejected as a conflict when the stored value differs from what the tab last read, so a stale tab must reload.
- A quiz completion commits history, counts, scores and completed IDs in one write. History is capped; when storage is full the oldest attempts are dropped, while completed IDs, counts and scores stay.
- Active attempts and checkpoints carry a content signature, so changed content forces an explicit restart.
- Restore writes both progress keys and rolls both back if either write fails. There is no cross-tab lock.

## Rich content

The policy is defined in [question schema](question-schema.md#markdown-and-rationale-metadata) and implemented in `src/content/richText`. `MarkdownContent` is the only renderer and lazy-loads the Markdown and KaTeX pipeline so the landing page and shell load without it. Content is validated at authoring time (`src/content/validation`, packaged as a Node worker for the API) and sanitized again at render time. The browser never rewrites authored text, and the learner and admin bundles import nothing from `src/content/validation` beyond its limit constants.

## Admin and editor

- `admin.html` is a separate optional entry (`npm run build:admin`); learner builds omit it. Static assets and build flags grant nothing: the API authorizes the whole `/api/admin` prefix. Public learner routes use the reader role and ignore admin cookies.
- `PairedHttpClient` (`src/admin/data`) owns session, CSRF and request admission. `DraftStore` is the only record gateway: every write is one record call, and the server assigns IDs and runs validation. The client sends only the fields the author changed and never rebuilds or remaps a bank.
- `useRecordEditor` is the one editing hook for every record kind. Search, pagination and reorder logic stay in `admin/core`.
- The server owns the draft, its change history, revert and discard. The editor keeps only unsaved text locally.
- Hook, panel and app tests run the real store over a fake record API (`src/test/adminGateway.ts`).
- The record API and publication are described in [content management](content-management.md#record-api-and-publication).
