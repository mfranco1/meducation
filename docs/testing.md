# Testing

Pick checks by the contract you changed. Do not add tests that mirror implementation or incidental styling. Assert observable outcomes and safety invariants. CI (`.github/workflows/checks.yml`) runs the host gates, the real-PostgreSQL backend cases and both browser suites, plus an Nginx check against the built learner image.

## Suites and commands

Setup: `npm ci`, `npm run build:content-policy`, the backend venv from [operations](operations.md#prerequisites), `npx playwright install chromium`. Browser suites need Docker.

| Suite | Command |
| --- | --- |
| Unit (Vitest) | `npm test` (`npm run test:ci` uses two workers; `npm run test:watch` while developing) |
| Lint + import boundaries | `npm run lint` |
| Formatting | `npm run format:check` (`npm run format` fixes) |
| Typecheck / build | `npm run typecheck`, `npm run build` (learner `build:learner`, admin `build:admin`) |
| Content validation | `npm run validate:content -- tests/fixtures/question-bank.json tests/fixtures/empty-flashcard-bank.json` |
| New quiz batch (before staging) | `npm run report:quiz-batch -- <batch.json> [--outline <outline.json>] [--blueprint <blueprint.json>]` |
| Backend | `.venv/bin/ruff check backend scripts`, `.venv/bin/mypy backend/src`, `.venv/bin/python -m pytest backend/tests -q` |
| Real PostgreSQL backend cases | `.venv/bin/python scripts/testing/test-postgres-content.py` (runs `backend/tests/test_pg_*.py`; `--keyword` to focus) |
| Learner browser (Chromium; includes progress backup) | `npm run test:e2e` (builds with content retries off) |
| Admin browser | `npm run test:e2e:admin` |
| Learner image (Nginx) | `docker build --target learner -t meducation-learner:ci .`, `docker run -d -p 127.0.0.1:8088:8080 meducation-learner:ci`, then `MEDUCATION_E2E_NGINX_URL=http://127.0.0.1:8088 npx playwright test -g nginx` |

To replay the streak and Perfect Test cards and the perfect-score results animation without taking a quiz, run `npm run dev` and open `/celebrations.html`. The page is dev only and is not part of any build.

Pytest skips real-PostgreSQL cases unless an isolated test database exists; a skip is not database acceptance. Run `test-postgres-content.py` for that gate.

Learner and admin browser suites share ports and `dist`; run them sequentially, and never rebuild `dist` while one is running. Playwright starts `scripts/testing/serve-postgres-fixture.py`, which seeds synthetic fixtures into a disposable PG17 tmpfs container with generated credentials (API port 8765 for learner, overridable with `MEDUCATION_E2E_API_PORT`; 8766 for admin). It never reads authority credentials or content.

## What to run

- Any code change: focused tests, `npm run lint`, `npm run format:check`, `npm run build`.
- Learner UI, navigation, sessions, loaders: affected learner browser flows on a fresh learner build; the full learner suite for shared navigation or loading.
- Admin UI, record store, authoring: admin browser suite and `build:admin`.
- Shared UI, content rendering, entry points, lazy boundaries: build both entries and run affected flows in both apps. The ordinary build must omit `admin.html`; the admin build must include it.
- Persistence and backup: codec validation, restore rollback and dialog-flow unit tests plus the learner browser suite.
- Backend, stored contracts, policy, shared fixtures: Ruff, mypy, pytest and the real-PostgreSQL gate. Run `npm run build:content-policy` first.
- Schema, serialization or content changes: validate and compare a fresh selected export (`validate-export`, `audit-export`); fixtures never certify live content.
- Container or Nginx changes: build the learner (and if relevant admin) image and run the Nginx check.
- Database, recovery or release changes: the real-PostgreSQL gate.
- Boundary policy changes: `npm run lint` after adding a temporary violating import.
- Documentation only: check links and commands and run `git diff --check`.

## Marketing videos

The isolated video workspace uses `npm --prefix marketing run typecheck`, `npm --prefix marketing test` and `npm --prefix marketing run format:check`. Verify a real capture and render, run media validation, and inspect representative frames and a complete preview. Audio changes also require a real `audio:generate` run, `audio:validate` for the master and encoded video, and listening review. See [marketing](../marketing/README.md) for setup and commands. Cached footage is a production artifact, never a content authority.

## Icon studio

Run `npm test -- scripts/branding/iconStudio.test.ts`, `npm run icons -- validate`, `npm run icons -- sheet` and `npm run icons -- preview`, then review the sheet image and gallery as described in the [icon skill](../.agents/skills/meducation-icons/SKILL.md). Automated checks do not establish medical accuracy, license truth or visual approval. Studio code changes also need lint, format check and `npm run build`.

## Fixtures

- `tests/fixtures/` holds contracts shared by the TypeScript and Python validators and the browser suites; `src/test/` holds Vitest setup and admin and API fixtures (IDs must stay valid under the API decoders); the `tests/fixtures/e2e-*` banks are seeded into disposable PostgreSQL for the browser suites; backend fixtures are in `backend/tests/fixture_content.py`.
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
- Layouts have no horizontal overflow at the [design-system](design-system.md#foundations) widths.
- Recovery re-applies grants and revokes restored sessions.

Automated role, focus and layout checks do not replace manual VoiceOver or NVDA review.
