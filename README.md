# Meducation

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

### Local-content mode

For frontend-only development, create `.env.local` at the repository root with:

```dotenv
VITE_CONTENT_SOURCE=local
```

Run `npm run dev`; this mode loads both canonical JSON banks directly and needs no API. Use `VITE_CONTENT_SOURCE=api` to return to API delivery. Restart the development server after changing environment values; production builds capture these settings at build time. See [.env.example](.env.example) for retry settings.

Your progress stays in the browser and origin you use. Clearing browser site data or switching browsers/devices will not carry attempts over. The app has no cloud sync.

## Build and check

```bash
npm run lint
npm run format:check
npm run validate:content
npm test
npm run build
```

`npm run build` type-checks the project and creates a production build in `dist/`. To view that build locally, run `npx vite preview` and open the URL it prints. API-mode preview also needs the content API running. Production API-mode hosting must route `/api` to the service. See [testing guidance](docs/testing.md) for backend and browser checks.

### Local content editor

Open `/admin.html` through the development server to edit quiz or flashcard records in a local staged workspace. The editor exports reviewed JSON and change sets; it does not write canonical repository files. Follow [content management](docs/content-management.md) to review and apply exports.

Normal production builds omit the admin entry. For a local production-build preview of the editor, explicitly enable both bundling and the editor UI:

```bash
VITE_BUILD_ADMIN=true VITE_ENABLE_LOCAL_ADMIN=true npm run build
npx vite preview
```

`VITE_BUILD_ADMIN=true` alone includes the HTML entry but does not enable the production editor. These flags are not authentication; keep this authoring surface local.

## Working with study content

Both JSON banks are tracked canonical content, even though their names end in `.generated.json`. A normal install does not require rebuilding them.

Quiz content and the shared subject catalog live in [questionBank.generated.json](src/content/questionBank.generated.json). Flashcard decks and cards live in [flashcardBank.generated.json](src/content/flashcardBank.generated.json). See [content management](docs/content-management.md) for editing/validation and [flashcard schema](docs/flashcard-schema.md) for the shared-subject relationship.

Question text, choice order, answer provenance, rationales, and reviewed explanations are canonical in the JSON bank. Preserve stable IDs and record answer uncertainty explicitly. See [docs/question-schema.md](docs/question-schema.md) and [AGENTS.md](AGENTS.md) before changing content.

## Project layout

- `src/app/` — screens and session flow
- `src/admin/` — local staged content editor
- `src/domain/` — quiz types and rules
- `src/content/` — canonical banks, validation, local/API adapters, and rich-content policies
- `src/persistence/` — browser storage implementation
- `src/analytics/` — score summaries
- `scripts/` — content validation and audit tools
- `backend/` — read-only FastAPI content delivery
- `tests/fixtures/` — shared content/storage contracts
- `e2e/` — learner and admin browser tests
- `docs/` — architecture, product, content, design, and testing guidance

Start with the [documentation index](docs/README.md) for contributor workflows. Ignored private sources, audit reports, and legacy public assets have distinct lifecycles; see [local-file guidance](docs/content-management.md#local-source-material-and-generated-output).

The app does not call a generative AI service at runtime. Explanations are bundled static content.
