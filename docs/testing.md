# Testing

Run checks appropriate to the change and follow the [regression requirements](testing-regressions.md) for affected behavior. CI executes frontend, backend, and browser checks in [checks.yml](../.github/workflows/checks.yml). Do not hand off a change while relevant gates fail.

## Commands

From the repository root, run the frontend checks:

```sh
npm run lint
npm run format:check
npm run test:architecture
npm test
npm run validate:content
npm run build
```

The build includes TypeScript checking for browser and maintenance code. Test the optional admin build when changing entries, shared UI, authoring, or bundle boundaries, using the [enabled production editor command](../README.md#local-content-editor).

The ordinary build must omit `admin.html`; the optional build must include it. Both flags are needed to preview an enabled production editor. Verify initial and quiz-route chunk composition when changing lazy imports: API startup must not eagerly load canonical banks or the validation pipeline.

For the existing content service and shared stored-bank contracts:

```sh
.venv/bin/python -m pytest backend/tests -q
.venv/bin/ruff check backend/src backend/tests
.venv/bin/mypy backend/src
```

Follow [backend setup](../backend/README.md) to install the locked environment. For browser flows, install Chromium once and run the suites sequentially:

```sh
npx playwright install chromium
npm run test:e2e
npm run test:e2e:admin
```

The learner npm pretest builds production output with automatic retries disabled. Playwright starts FastAPI with `e2e/fixtures/bank.json` and the separate flashcard fixture on port 8765, and Vite preview proxies `/api` there. Override that port with `MEDUCATION_E2E_API_PORT`; this fixture service is separate from development API port 8000. The admin suite starts its own Vite development server. Fixtures never replace authored canonical files.

## Suite ownership and fixtures

- Vitest tests stay beside their domain, persistence, content, shared UI, feature, and authoring modules. App tests cover composition/navigation/drawer policy; quiz-to-subject lookup tests live with the quiz session contract.
- `src/test/setup.ts` mocks both canonical JSON imports, including transitive adapter imports, with `tests/fixtures/question-bank.json` and `tests/fixtures/flashcard-bank-contract.json`. The flashcard admin panel overrides its initial catalog with `tests/fixtures/empty-flashcard-bank.json`; backend quiz request tests use the same explicit empty baseline.
- `tests/fixtures/bank-contract-cases.json` is shared by TypeScript and Python stored-bank validators. Add cross-runtime edge cases there. `src/content/api/apiContract.test.ts` owns the separate API DTO contract.
- `backend/tests` uses explicit fixture paths for repository/request behavior; it must never mutate canonical banks.
- `e2e` covers production learner flows and the separate development authoring flow. Its populated flashcard fixture is selected through `MEDUCATION_FLASHCARD_BANK_PATH`.
- Architecture tests under `scripts/architecture` use Node's test runner and are excluded from Vitest to avoid duplicate execution.

Use small versioned fixtures for schema, relationships, canonical ordering, sparse metadata, provenance, rendering safety, revision/serialization parity, scoring, and persistence. Do not assert production record counts or individual authored records in unit tests. Adding canonical flashcards must not change fixture-based starting catalogs.

`npm run validate:content` is the actual-data gate outside Vitest: it reads both authoritative JSON files and checks the full corpus once for structure, shared-subject references, Markdown/HTML/URL/LaTeX safety, and review metadata. Keep focused rendering cases in unit tests instead of duplicating this full-corpus scan. Intentional content changes follow [content management](content-management.md) and the schema guides.

## Architecture and formatting

`npm run lint` checks source, maintenance scripts, and ESLint/Vite/Playwright configurations, then runs the whole dependency graph. `npm run check:architecture` runs the graph alone. `npm run test:architecture` checks adversarial normalized/type/dynamic imports, alias resolution, peer-feature/presentation restrictions, storage access, transitive cycles, and eager learner banks/validators. [Architecture](architecture.md#checked-dependency-boundaries) defines the policy and its limits.

`npm run format:check` covers root JSON/tool configurations, TypeScript browser tests, maintenance TypeScript/JavaScript, and `src/shared/theme.ts`. Application-wide formatting remains incremental. `.prettierignore` protects canonical banks, fixture bytes, dependency locks, private source material, and generated output. Keep formatting-only work separate from behavior and dependency changes. A future alias must resolve consistently in TypeScript, Vite, tests, scripts, and architecture checks.

## Selecting verification

For source/config moves, run frontend gates and compare protected canonical hashes. For shared UI, feature, content-loader, or entry changes, also run both browser suites and both build modes; retain saved-attempt/checkpoint behavior, lazy screen imports, KaTeX assets, and accessible desktop/mobile layouts. Exercise explicit local mode and `/#content-qa` when their imports change. For backend packaging, stored contracts, or shared fixture changes, run Python checks as well.

Before handoff, confirm affected obligations in [the regression reference](testing-regressions.md), run `git diff --check`, and record results and existing advisories in the work tracker. Preserve stable IDs, ordering, answer provenance, current storage contracts, and export/replay behavior. Use a dedicated candidate/parity check for future schema migrations.

Automated role/label, keyboard/focus, reduced-motion, and mobile/desktop checks do not establish real VoiceOver/NVDA behavior; manual assistive-technology testing remains release QA. No line/branch coverage percentage or broad production-load benchmark is claimed. Browser first-quiz timings characterize the specified fixtures; measure production latency separately before making performance claims.
