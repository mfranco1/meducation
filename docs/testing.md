# Testing

Pick checks by the contract you changed. Do not add tests that mirror implementation or incidental styling. Assert observable outcomes and safety invariants. CI (`.github/workflows/checks.yml`) runs the host gates, browser suites and the container smoke.

## Suites and commands

Setup: `npm ci`, `npm run build:content-policy`, the backend venv from [operations](operations.md#prerequisites), `npx playwright install chromium`. Browser suites need Docker.

| Suite | Command |
| --- | --- |
| Unit (Vitest) | `npm test` (`npm run test:ci` uses two workers; `npm run test:watch` while developing) |
| Lint + import boundaries | `npm run lint` |
| Formatting | `npm run format:check` |
| Typecheck / build | `npm run typecheck`, `npm run build` (learner `build:learner`, admin `build:admin`) |
| Content validation | `npm run validate:content -- tests/fixtures/question-bank.json tests/fixtures/empty-flashcard-bank.json` |
| Backend | `.venv/bin/ruff check backend scripts`, `.venv/bin/mypy backend/src`, `.venv/bin/python -m pytest backend/tests -q` |
| Real PostgreSQL backend cases | `.venv/bin/python scripts/containers/test-postgres-content.py` (`--keyword` to focus; `--restartable` for outage drills) |
| Learner browser (Chromium; includes progress backup) | `npm run test:e2e` (builds with content retries off) |
| Admin browser | `npm run test:e2e:admin` |
| Everything | `npm run verify:full` (stops at the first failure) |
| Container smoke | `npm run test:containers` |

Pytest skips real-PostgreSQL cases unless an isolated test database exists; a skip is not database acceptance. Run `test-postgres-content.py` for that gate.

Learner and admin browser suites share ports and `dist`; run them sequentially, and never rebuild `dist` while one is running. Playwright starts `scripts/testing/serve-postgres-fixture.py`, which seeds synthetic fixtures into a disposable PG17 tmpfs container with generated credentials (API port 8765 for learner, 8766 for admin; override with `MEDUCATION_E2E_API_PORT`). It never reads authority credentials or content.

## What to run

- Any code change: focused tests, `npm run lint`, `npm run format:check`, `npm run build`.
- Learner UI, navigation, sessions, loaders: affected learner browser flows on a fresh learner build; the full learner suite for shared navigation or loading.
- Admin UI, record store, authoring: admin browser suite and `build:admin`.
- Shared UI, content rendering, entry points, lazy boundaries: build both entries and run affected flows in both apps. The ordinary build must omit `admin.html`; the admin build must include it.
- Persistence and backup: codec validation, restore rollback and dialog-flow unit tests plus the learner browser suite.
- Backend, stored contracts, policy, shared fixtures: Ruff, mypy, pytest and the real-PostgreSQL gate. Run `npm run build:content-policy` first.
- Schema, serialization or content changes: validate and compare a fresh selected export (`validate-export`, `audit-export`); fixtures never certify live content.
- Container, database, recovery or release changes: `npm run test:containers`.
- Boundary policy changes: `npm run lint` after adding a temporary violating import.
- Documentation only: check links and commands and run `git diff --check`.

## Fixtures and ownership

- `tests/fixtures/`: `bank-contract-cases.json` (shared by TypeScript and Python stored-bank validators), `paired-authoring-cases.json` (rich content, limits and edit cases), `api-response-cases.json`, `storage-boundary-cases.json`, `question-bank.json`, `empty-flashcard-bank.json`, `draft-roundtrip-pair.json` (every optional field and non-canonical key order), `flashcard-bank-contract.json`, `progress-backups/`.
- `src/test/`: Vitest setup (`setup.ts`), `contentFixtures.ts` (admin banks) and `runtimeContentFixtures.ts` (API DTOs). Fixture IDs must stay valid under the API decoders.
- `e2e/`: learner and `admin-http` specs plus `e2e/fixtures` banks seeded into disposable PostgreSQL. `backend/tests`: backend and PostgreSQL tests (`test_postgres_content.py`, `test_draft_records.py`) with fixtures in `fixture_content.py`.
- Unit tests live beside their modules.
- Do not assert production record counts or individual authored records; use small versioned fixtures.

## Behavioral invariants to keep covered

- Authored text, choice order, IDs, optional-field presence and answers survive every round trip (save, publish, export).
- Progress reads use only current v2 keys; malformed stored state is preserved and surfaced; failed writes never advance to a success screen; a stale tab must reload.
- Changed content never silently resumes an old attempt or checkpoint.
- Backup restore replaces both progress stores and restores both original values if a write fails.
- Saving a draft record never publishes; protected writes need session, Origin, CSRF and freshness; stale versions return 409 and rejected writes leave no change row; unsaved editor text survives expiry, conflict and cancel.
- Draft IDs are never reused after delete or restore; an unchanged draft rebuilds byte-identical release artifacts.
- Learner content loading retries and times out within bounds, ignores stale responses, and shows recoverable states without altering saved progress.
- Keyboard shortcuts pause for dialogs and drawers and keep native behavior in form controls; reduced motion is honored.
- Layouts have no horizontal overflow at 390, 1048 and 1440 px.
- Recovery restores exact tables, sequences and grants, quarantines restored sessions, and advances ID sequences.

Automated role, focus and layout checks do not replace manual VoiceOver or NVDA review.
