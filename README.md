# Meducation

A browser-based study platform (React, TypeScript, Vite, Material UI) with subject quizzes in Fast Feedback or Exam Mode, resumable attempts, score history and flashcard decks. Content is a versioned, paired quiz/flashcard bank stored in PostgreSQL and delivered by a FastAPI service. Learner attempts, scores and checkpoints stay in the browser's `localStorage`; there is no learner account and no runtime generative AI.

## Run locally

Requirements: Node 22, npm, Python 3.14, Docker (for PostgreSQL 17).

1. Install, set up PostgreSQL and start the content API on `127.0.0.1:8000`: [operations](docs/operations.md).
2. Start the frontend and open the printed URL (usually `http://localhost:5173/`); Vite proxies `/api` to the API:

   ```bash
   npm run dev
   ```

Use **Progress** in the app to back up or restore progress; clearing site data removes it.

## Content editor

Open `/admin.html` on the development server with the authoring API running and sign in. Saving writes a draft record; publishing is a separate action. See [content management](docs/content-management.md).

## Check and build

`npm run build` type-checks and writes `dist/`. All suites and which to run are in [testing](docs/testing.md).

## Layout

- `src/app`, `src/features`, `src/shared`: learner composition, quiz and flashcard features, shared UI
- `src/domain`, `src/analytics`, `src/persistence`, `src/content`: rules, aggregation, browser storage, schemas and validation
- `src/admin`: authenticated draft editor
- `backend/`: FastAPI delivery, authoring services, PostgreSQL migrations and jobs
- `scripts/`, `ops/`, `e2e/`, `tests/fixtures/`: tooling, container config, browser tests, shared fixtures
- `docs/`: listed in [AGENTS.md](AGENTS.md#documentation), which also holds the repository rules
