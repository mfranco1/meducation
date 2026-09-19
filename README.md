# Meducation

Meducation is a browser-based practice-test app built with React, TypeScript, Vite, and Material UI. It offers subject-based multiple-choice quizzes, immediate feedback or exam mode, a stopwatch, saved in-progress attempts, and score history.

The app runs locally. Quiz content is bundled with the repository, and your attempts are stored in your browser's `localStorage`. You do not need an account to use it.

## Install and run

### Requirements

- Node.js `20.19.0+` or `22.12.0+` (as required by the installed Vite version)
- npm
- A modern desktop or mobile browser

### Steps

1. Clone or download this repository and open its folder in a terminal.
2. Install the locked dependencies:

   ```bash
   npm ci
   ```

3. Start the local development server:

   ```bash
   npm run dev
   ```

4. Open the local URL printed by Vite, usually `http://localhost:5173/`.

Your progress stays in the browser and origin you use. Clearing browser site data or switching browsers/devices will not carry attempts over. The app has no cloud sync.

## Build and check

```bash
npm run validate:content
npm test
npm run build
```

`npm run build` type-checks the project and creates a production build in `dist/`. To view that build locally, run `npx vite preview` and open the URL it prints.

## Working with question content

The app loads the tracked `src/content/questionBank.generated.json`, so a normal install does **not** require rebuilding the question bank.

Contributors working on PDF ingestion need Python 3, the dependencies in `requirements-content.txt`, and access to the relevant source PDFs. See [docs/content-pipeline.md](docs/content-pipeline.md) for extraction, merging, and review steps. Do not run `npm run build:content` as part of normal installation: it rebuilds the generated question bank from local PDFs and can replace the tracked data.

Question text and choice order must match the PDFs. Original answer keys and reviewed corrections remain separate, and quizzes with unresolved content stay disabled. See [docs/question-schema.md](docs/question-schema.md) and [AGENTS.md](AGENTS.md) before changing content.

## Project layout

- `src/app/` — screens and session flow
- `src/domain/` — quiz types and rules
- `src/content/` — bundled question bank, validation, and static explanations
- `src/persistence/` — browser storage implementation
- `src/analytics/` — score summaries
- `scripts/` — content extraction and validation tools
- `docs/` — architecture, product, content, design, and testing guidance

The app does not call a generative AI service at runtime. Explanations are bundled static content.
