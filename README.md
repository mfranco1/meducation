# Meducation

A browser-based study platform (React, TypeScript, Vite, Material UI) with subject quizzes in Fast Feedback or Exam Mode, resumable attempts, score history and flashcard decks. Content is a versioned, paired quiz/flashcard bank stored in PostgreSQL and delivered by a FastAPI service. Learner attempts, scores and checkpoints stay in the browser's `localStorage`; there is no learner account and no runtime generative AI.

## Run locally

Requirements: Node 22, npm, Python 3.14, Docker (for PostgreSQL 17).

```bash
npm ci
```

1. Set up and start PostgreSQL and the content API: [operations](docs/operations.md) and [backend/README.md](backend/README.md). The API listens on `127.0.0.1:8000`.
2. Start the frontend and open the printed URL (usually `http://localhost:5173/`); Vite proxies `/api` to the API:

   ```bash
   npm run dev
   ```

Retry settings for content loading are in [.env.example](.env.example). Remove any old `VITE_CONTENT_SOURCE`; it is rejected.

Use **Progress backup** in the app to download or restore progress; clearing site data removes it.

## Content editor

Open `/admin.html` on the development server with the authoring API running and sign in. Saving writes a paired draft to PostgreSQL; publishing is a separate reviewed action. A production build omits the editor unless you run `npm run build:admin`. See [operations](docs/operations.md#editor-login-and-sessions) and [content management](docs/content-management.md).

## Check and build

```bash
npm run lint
npm run format:check
npm test
npm run validate:content -- tests/fixtures/question-bank.json tests/fixtures/empty-flashcard-bank.json
npm run build
```

`npm run build` type-checks and writes `dist/`. Backend and browser suites are described in [testing](docs/testing.md). Containers: [operations](docs/operations.md#containers).

## Layout

- `src/app`, `src/features`, `src/shared`: learner composition, quiz and flashcard features, shared UI
- `src/domain`, `src/analytics`, `src/persistence`, `src/content`: rules, aggregation, browser storage, schemas and validation
- `src/admin`: authenticated paired-draft editor
- `backend/`: FastAPI delivery, authoring services, PostgreSQL migrations and jobs
- `scripts/`, `ops/`, `e2e/`, `tests/fixtures/`: tooling, container config, browser tests, shared fixtures
- `docs/`: see the [documentation index](docs/README.md); repository rules are in [AGENTS.md](AGENTS.md)
