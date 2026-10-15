# Meducation

For current local database authoring, follow the [local authority runbook](docs/local-authoring.md). Legacy JSON-editor instructions below apply only to explicit development fixtures.

Content authoring uses the designated local PostgreSQL database through the authenticated paired HTTP editor. Published learner content remains read-only and learner progress remains in the browser. Repository JSON/local-content mode is an explicitly labeled read-only export/archive fallback; it cannot overwrite later database-only work. Hosted provider acceptance remains a separate gate. See [the recovery runbook](docs/L4-authoritative-recovery.md).

Meducation is a browser-based study platform built with React, TypeScript, Vite, and Material UI. It offers subject-based quizzes with Fast Feedback or Exam Mode, resumable attempts, score history, and flashcard decks with saved study progress.

The app runs locally without an account. By default, the existing read-only FastAPI service delivers the canonical quiz and flashcard content. Attempts, scores, and flashcard checkpoints are stored in your browser's `localStorage`; the API does not persist learner progress. An explicit local-content mode also loads the repository's JSON banks without the API.

## Install and run

### Requirements

- Node.js 22.12.0+ on the Node 22 line used by CI, or another version supported by the locked Vite release
- npm
- Python 3.14 for the default API mode; see [backend setup](backend/README.md)
- A modern desktop or mobile browser

### Steps

1. Clone or download this repository and open its folder in a terminal.
2. Install the locked dependencies:

   ```bash
   npm ci
   ```

3. In a separate terminal, follow [backend setup](backend/README.md) to install and start the content API on `127.0.0.1:8000`. Keep it running while using API mode.

4. Start the frontend development server:

   ```bash
   npm run dev
   ```

5. Open the local URL printed by Vite, usually `http://localhost:5173/`. Vite proxies `/api` requests to the local content service.

### API content delivery

The learner always loads quizzes and flashcards through the content API. The
frontend-only JSON mode and `/#content-qa` bank viewer have been retired. Remove
`VITE_CONTENT_SOURCE` from local configuration; selecting the old mode now fails
at startup/build instead of silently loading archived content. Follow the
[local authority runbook](docs/local-authoring.md) to run the PostgreSQL-backed
API and editor. See [.env.example](.env.example) for retry settings.

Your progress stays in the browser and origin you use. Use **Progress backup** to download a private copy or explicitly restore it in another browser; see [backup and recovery](docs/progress-backup.md). Clearing site data removes local progress, and switching browsers/devices does not transfer it automatically. The app has no cloud sync.

## Build and check

```bash
npm run lint
npm run format:check
npm run validate:content -- tests/fixtures/question-bank.json tests/fixtures/empty-flashcard-bank.json
npm test
npm run build
```

`npm run build` type-checks the project and creates a production build in `dist/`. To view that build locally, run `npx vite preview` and open the URL it prints. API-mode preview also needs the content API running. Production API-mode hosting must route `/api` to the service. See [testing guidance](docs/testing.md) for backend and browser checks.

For a local production preview through the actual static server and API reverse proxy, use the [container runbook](docs/local-containers.md). It retains the host Vite development path and browser-local progress. The stack includes an optional independent PG17 service and matching recovery tools; application database integration remains future work.

### Local content editor

Open `/admin.html` through the development server with the [local PostgreSQL authoring service](docs/local-authoring.md) running. Sign in to edit the paired quiz/flashcard draft. Saving writes to PostgreSQL; publication is a separate reviewed action. The editor has no offline or file-backed authoring mode.

Normal production builds omit the admin entry. To build the authenticated HTTP editor alongside the learner:

```bash
npm run build:admin
```

These build flags do not grant API access. The [HTTP editor guide](docs/L4-http-editor.md) describes sessions, server-reserved IDs, paired undo, publication, activation, and database-derived exports. Production identity provider acceptance remains pending; no hosted access is enabled.

## Working with study content

PostgreSQL is the only writable authority for quiz and flashcard content. Edit the paired draft through the authenticated editor, preserve stable IDs and answer provenance, and publish explicitly. Browser-local learner progress remains separate.

For a content check, export the selected current draft/release and run `validate-export`/`audit-export` as described in [content management](docs/content-management.md). The npm validator requires two explicit file paths and checks their structure and rendering policy; it cannot establish live database currency. Small synthetic fixtures keep CI independent of private content.

Repository JSON archives are pending final removal with their remaining backend/container consumers. They must never replace database-only changes.

## Project layout

- `src/app/` — composition, navigation, lazy screens, and learner drawer
- `src/features/` — quiz and flashcard screens, components, sessions, and selectors
- `src/shared/` — theme and reusable shell, loading, catalog, study, notification, and rich-content presentation
- `src/admin/` — authenticated paired PostgreSQL draft editor
- `src/domain/` — quiz types and rules
- `src/content/` — stored schema, validation, API loading, and rich-text modules; historical bank archives await final removal
- `src/persistence/` — browser storage implementation
- `src/analytics/` — score summaries
- `scripts/content/` — explicit paired-file validation and packaged content policy
- `scripts/architecture/` — dependency policy, graph checks, and tooling regression tests
- `backend/` — FastAPI published content delivery, authenticated authoring, and PostgreSQL maintenance
- `tests/fixtures/` — shared content/storage contracts
- `e2e/` — learner and admin browser tests
- `docs/` — architecture, product, content, design, and testing guidance

Start with the [documentation index](docs/README.md) for contributor workflows. Ignored private sources and audit reports have distinct lifecycles; see [local-file guidance](docs/content-management.md#local-source-material-and-generated-output).

The app does not call a generative AI service at runtime. Explanations are authored content delivered from PostgreSQL.
