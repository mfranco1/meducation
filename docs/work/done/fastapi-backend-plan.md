# FastAPI backend implementation plan

> Historical record: paths and check results below describe their implementation stage. See [current architecture](../../architecture.md) for present ownership; retain these historical claims.

Created: 2026-10-01. Status: complete (2026-10-01).

## Goal and scope

Introduce a Python/FastAPI backend in stages while retaining
`src/content/questionBank.generated.json` as the authoritative schema-v4 question
database. Keep React, TypeScript, Vite, Material UI, existing quiz behavior, stable
IDs, answer provenance, and the prohibition on runtime generative AI. Postgres is
a later storage migration, not a prerequisite for the first backend release.

The current milestone moves only quiz content delivery to the backend. Attempt
persistence stays in browser localStorage through `LocalAttemptRepository`;
scoring and session rules stay in the existing TypeScript domain code. Timers,
responses, flags, celebrations, history, and progress summaries remain browser
responsibilities. No attempt API, server-side scoring, browser-data upload, or
JSON attempt store belongs in this milestone. Backend admin authoring/publication
is also deferred; retain the existing reviewed JSON export/replacement workflow.

This document is also the implementation tracker. Check a stage only after its
acceptance gate passes, record relevant commands/results below, and move this file
to `docs/work/done/` after the content-only milestone (stages 1–5) is complete.
The future Postgres and attempt migrations need separate trackers when started.

## Existing implementation and decisions

- `src/content/schema.ts` defines the stored bank; `questionBank.ts` hydrates
  sparse metadata, indexes records, and derives question counts.
- `src/domain/types.ts` defines synchronous `QuizRepository` and
  `AttemptRepository` contracts. Content needs an asynchronous loading boundary
  that exposes hydrated snapshots to existing synchronous selectors. Keep the
  attempt interface and its browser implementation unchanged.
- `LocalAttemptRepository` stores active attempts, 200 completed attempts, and
  separate lifetime completion counts, lowest/latest scores, and activity times.
  Retain these stores and their existing behavior throughout this milestone.
- `useQuizSession` owns start/resume/checkpoint/leave/abort/finish and page-hide
  persistence. These remain local operations and do not require network saves.
- `AdminQuestionBankGateway` already has asynchronous load/preview/apply/undo/reset
  methods. Its current apply operation stages changes in memory; it does not
  publish to the canonical file. Keep this workflow local; an HTTP admin gateway
  and backend publication endpoints are outside the current scope.
- `serializeBank.ts` defines revision hashing as SHA-256 of JavaScript's
  two-space JSON serialization plus a final newline. Cross-language compatibility
  needs fixtures; Python's default JSON serialization is not an equivalent.

Initial operating model: one private local installation with a read-only content
API bound to loopback. Begin with one Uvicorn worker for simplicity. The bank
remains at its existing path; do not introduce a second authoritative copy or
move it as part of this delivery migration. No learner identity, accounts,
database server, backend write store, queues, or cloud services are needed.

## Target boundaries

Content request flow: React content-loading adapter → versioned FastAPI router
→ content service → question-bank repository protocol → read-only JSON adapter.
The eventual Postgres content adapter implements the same read operations.

Attempt flow remains: React session orchestration → TypeScript domain rules and
scoring → `LocalAttemptRepository` → browser localStorage. Fetching questions
must not make checkpoints, completion, analytics, or page-hide saves depend on
backend persistence. The backend returns the answer/provenance and explanation
fields needed for existing browser scoring and feedback.

Proposed layout, added incrementally rather than creating empty modules:

```text
.venv/                   # ignored Python environment at the project root
backend/
  pyproject.toml
  requirements.lock
  requirements-dev.lock
  .python-version
  .env.example
  README.md
  src/meducation_api/
    main.py
    settings.py
    api/                 # routers, dependencies, error mapping
    schemas/             # Pydantic storage and request/response models
    services/            # content lookup, validation, snapshot lifecycle
    repositories/        # read protocols and canonical JSON adapter
  tests/                 # content fixtures, contracts, API and reload tests
```

Use Pydantic v2 models with explicit aliases for existing camelCase fields,
strict content validation, and preservation of omitted optional fields. API
payloads must not silently introduce stored defaults or normalize content.
Use `APIRouter` and dependency injection to supply repositories rather than
global file access in endpoints. FastAPI supports this modular structure through
[routers and dependencies](https://fastapi.tiangolo.com/tutorial/bigger-applications/).

## Stage 1 — Isolated Python development foundation

- [x] Complete stage 1.

1. Use the latest available stable Python interpreter supported by the dependency
   set; verify compatibility and pin the tested minor version in `.python-version`
   and CI. Document installing that version if absent. Inspect any existing root
   `.venv` for interpreter and dependency compatibility
   before reusing it; preserve dependencies needed by content-extraction scripts.
2. Create `backend/pyproject.toml` with package/build configuration and runtime
   dependencies: FastAPI, Uvicorn, Pydantic, and pydantic-settings. Add a development
   extra for pytest, HTTPX, Ruff, mypy, and pip-tools. Resolve compatible versions
   at implementation time and commit pinned runtime/development lock files.
3. Create or reuse `.venv` at the project root without system site packages.
   Point the editor, tests,
   terminal tasks, and CI at its interpreter. Never use `sudo pip` or global
   application package installs. Virtual environments isolate dependencies;
   activation is optional when invoking their interpreter explicitly.
   See [Python venv](https://docs.python.org/3/library/venv.html).
4. Add settings for bank path and allowed origins, plus a frontend content-source
   mode. Resolve defaults from a known project location rather than the shell's
   current directory. Add `.env.example` and ignore tool caches. Existing
   `.gitignore` already excludes `.venv/` and `.env`.
5. Add an app factory, `/health/live`, `/health/ready`, and a backend README.
   Liveness indicates the process is running; readiness requires a valid loaded
   bank snapshot to be usable.

Proposed bootstrap after the package definition exists, from the repository root.
Run the environment creation command only if `.venv` does not already exist:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e './backend[dev]'
python -m piptools compile backend/pyproject.toml --output-file backend/requirements.lock
python -m piptools compile backend/pyproject.toml --extra dev --output-file backend/requirements-dev.lock
python -m pip install -r backend/requirements-dev.lock
python -m pip install --no-deps -e backend
python -c 'import sys; assert sys.prefix != sys.base_prefix; print(sys.executable)'
python -m uvicorn meducation_api.main:app --reload --host 127.0.0.1 --port 8000
```

The initial editable install bootstraps dependency resolution; routine setup and
CI install the committed lock instead. For a clean development environment, use
`.venv/bin/python -m pip install -r backend/requirements-dev.lock` followed
by `.venv/bin/python -m pip install --no-deps -e backend`. Keep these commands at
the project root. Avoid dependency synchronization that removes packages used by
existing Python scripts; validate compatibility when sharing this environment.
Update locks
deliberately, never on every start. Server startup and checks always use this
environment's Python. Windows activation uses `.venv\Scripts\Activate.ps1`.

**Gate:** clean installation from committed locks, interpreter-isolation check,
health endpoint tests, Ruff, mypy, pytest, and existing frontend build pass.

## Stage 2 — Read-only canonical JSON repository

- [x] Complete stage 2. Depends on stage 1.

1. Define Pydantic schema-v4 models and a `QuestionBankRepository` protocol for
   subjects, quizzes, ordered questions, snapshots, and revisions. Keep content
   schema version separate from API version and content revision.
2. Implement one JSON adapter reading the exact existing canonical path. Validate
   unique IDs, references, choice IDs, answer references, provenance requirements,
   and schema version; reject malformed content without rewriting it.
3. Load a validated immutable snapshot and indexes using FastAPI's
   [lifespan mechanism](https://fastapi.tiangolo.com/advanced/events/). Serve all
   reads in a request from a consistent snapshot. Do not repeatedly parse the
   entire bank for each question request or block the event loop on disk work.
4. Derive quiz counts and per-quiz question positions from canonical array order.
   Preserve stems, choice order, rationale markup, sparse metadata, and both
   answer fields exactly. Keep learner hydration separate from stored models.
5. Establish revision/serialization fixtures covering Unicode, omitted fields,
   property order, whitespace, and numeric edge cases. Reuse the existing revision
   algorithm through a compatibility utility until Python parity is proven.
6. Define a controlled reload: validate a complete candidate before swapping the
   snapshot. Invalid reloads retain the last valid snapshot and report a degraded
   readiness state; invalid initial load prevents readiness. Direct file edits
   require this reload or a restart.

**Gate:** full-bank structural load, read parity with the current TS adapter,
matching revisions, unchanged canonical bytes, and invalid-load/reload tests.
Existing TS Markdown validation remains authoritative until parity is established.

## Stage 3 — Versioned content API

- [x] Complete stage 3. Depends on stage 2.

1. Implement `GET /api/v1/subjects`, `GET /api/v1/subjects/{id}/quizzes`,
   `GET /api/v1/quizzes/{id}`, and `GET /api/v1/quizzes/{id}/questions`.
   Return ordered questions per quiz; avoid a whole-bank learner download.
2. Include the bank revision in content responses/ETags; document conditional
   reads and cache invalidation. Use stable error codes for 404, validation,
   unsupported revisions, and content-load failures without exposing paths or
   internals. Do not add mutation endpoints.
3. Publish OpenAPI as the API contract and generate/check frontend DTO types.
   Keep storage DTOs distinct from hydrated learner models.
4. Configure a Vite `/api` proxy for development. If direct cross-origin access
   is needed, allow only configured frontend origins. Add timeouts and request
   IDs; avoid logging question bodies, credentials, or learner responses.
5. Return answers and rationales as the private study app does today. This preserves
   Browse answers and Fast Feedback; it is not an anti-cheating exam service.

**Gate:** API response/order/provenance fixtures, ETag and error tests, OpenAPI
contract checks, and a local React-to-API smoke test. The learner still works in
the existing local mode while this API is built.

## Stage 4 — Frontend content integration

- [x] Complete stage 4. Depends on stage 3.

1. Add a typed HTTP client and asynchronous content-loading layer at the app
   composition boundary. Keep screens dependent on hydrated data and callbacks.
   Retain pure domain logic and synchronous selectors over loaded snapshots.
2. Add explicit loading, unavailable-content, and retry states. Select local or
   API mode through configuration; never silently fall back to a different bank
   after an API failure.
3. Cache loaded content by bank revision and hold a consistent in-memory snapshot
   during an open quiz. A backend reload must not replace its questions or answers
   mid-session. Keep attempt records and localStorage keys unchanged. A resumed
   attempt after a page reload continues to use available canonical content as it
   does today; historical revision pinning across browser restarts is future work.
   Surface missing quizzes/questions without deleting saved browser attempts.
4. In API mode, remove the canonical-bank import from the learner dependency path
   so the frontend bundle cannot carry stale competing content. Keep the existing
   local adapter for the deliberately selected offline/local mode.
5. Verify dashboard, subjects, quiz setup, browsing, Markdown/images, both feedback
   modes, and existing celebrations. Serve app-local figures through the frontend
   as today; document their URL origin when frontend/API hosts differ.
6. Keep `LocalAttemptRepository`, browser scoring, and `useQuizSession` persistence
   synchronous. No remote attempt adapter, save outbox, server result verification,
   ownership model, or localStorage import is needed. Verify content loading does
   not record activity or create attempts just from browsing.
7. Keep the development admin editor's in-memory staging and reviewed exports.
   Isolate its canonical JSON import from the API-mode learner bundle. Continue
   editing the existing canonical file through the documented review workflow,
   then validate and restart/reload the backend to serve the new content.

**Gate:** existing frontend tests and build pass, mode/error tests pass, and
API-mode quiz/browse flows match current behavior without touching bank content.
Browser attempts, scoring, history, lifetime summaries, and page-hide saves retain
their current behavior; content retrieval is the only new network dependency.

## Stage 5 — Verify and document the content-only milestone

- [x] Complete stage 5. Depends on stages 1–4.

1. Document virtual environment setup, locked installs, interpreter selection,
   frontend/backend startup, content-source configuration, canonical file path,
   validation, and safe content reload. Keep Docker optional; it does not replace
   the required development virtual environment.
2. Add backend lint/type/test checks, frontend checks, OpenAPI/type drift checks,
   and shared content-schema/revision fixtures. Use temporary read-only fixture
   banks and lifespan-aware API clients; FastAPI documents
   [pytest/TestClient testing](https://fastapi.tiangolo.com/tutorial/testing/).
3. Verify subject/quiz listing, question ordering, answers/provenance, Markdown,
   rationales, sources, images, Browse answers, both feedback modes, and content
   unavailable/retry states. Verify the learner bundle in API mode does not embed
   a competing canonical bank.
4. Exercise start → answer/checkpoint → page reload → resume → finish → history.
   Confirm localStorage remains the persistence mechanism, scores still come from
   the TypeScript quiz engine, and lifetime summaries survive history pruning.
   After content is loaded, API failure must not block local answer selection,
   scoring, checkpointing, or completion of that open quiz. Fetching uncached
   content still requires the API; retain explicit local mode as the existing
   offline option rather than promise full offline API mode.
5. Test backend restart and valid/invalid content reload, including an open quiz
   retaining its loaded snapshot. Validate admin-exported replacements before
   the backend loads them; there is no backend publication workflow at this stage.
6. Update `docs/architecture.md`, `docs/testing.md`, `docs/content-management.md`,
   and relevant product docs to state the boundary: backend content reads,
   browser attempt persistence and scoring. Measure bank load and per-quiz reads
   to establish practical limits without adding a database prematurely.

**Gate:** backend checks, `npm test`, `npm run validate:content`, and
`npm run build` pass; content API integration and browser persistence regression
flows pass. FastAPI serves canonical JSON content. The browser owns attempts,
scoring, timers, progress, and history. No Postgres, server-side learner storage,
admin write endpoints, or runtime LLM calls are introduced.

## Future work — Postgres, then a separate learner-state migration

These are follow-up projects, not acceptance requirements for stages 1–5.

### A. Move canonical content storage to Postgres

1. Add SQLAlchemy, a Postgres driver, and Alembic when the database phase starts.
   Implement the content repository protocol with unchanged read API contracts.
2. Preserve established IDs as text primary keys, subject/quiz relationships,
   explicit per-quiz question position, ordered choice positions, exact markup,
   provided/verified answers, and sparse rationale metadata. Maintain bank revisions.
3. Build a repeatable importer from the canonical JSON, verify semantic/revision
   parity, and run the same repository contract fixtures against both adapters.
4. Rehearse cutover and recovery. Make Postgres authoritative only at explicit
   cutover; JSON becomes a deterministic export/seed. Avoid two independent sources
   of truth. Keep attempts and scoring in the browser during this content migration.
5. Plan authenticated admin authoring/publication separately against transactional
   database storage, with reviewed change sets, revision conflicts, and audit history.

### B. Migrate attempts and scoring after Postgres is in place

1. Create a separate design and tracker for identity/ownership, attempt lifecycle
   endpoints, database transactions, concurrency control, and idempotent completion.
   Decide scoring authority and offline behavior explicitly at that time.
2. Preserve stable attempt IDs, responses, timer/session behavior, celebrations,
   completed score history, all six browser stores, and lifetime aggregates beyond
   the retained 200 attempts. Do not infer all-time counts from truncated history.
3. Design explicit export/import with preview, validation, deduplication, migration
   receipts, and retained browser backups. Do not silently upload learner history.
4. If scoring moves to Python, prove parity with TypeScript for verified answers,
   unanswered items, rounding, immediate-answer locking, and timing compatibility.
   Preserve historical results and define content-revision behavior without silent
   rescoring of legacy attempts.
5. Introduce asynchronous attempt persistence and recovery only in this migration,
   with clear save failures, retry/conflict handling, and reliable critical actions.
   Public deployment additionally requires appropriate identity, authorization,
   secrets, TLS, and backup/retention decisions.

## Execution record

- 2026-10-01: reviewed architecture, schema, content/admin workflows, synchronous
  learner repositories, session persistence, scoring, and current test/build scripts.
  Created the original plan only; no backend packages, environment, or infrastructure added.
- Original planning verification: `npm test` passed (25 files, 131 tests);
  `npm run build` passed, including TypeScript checking, with the existing large
  bundle warning. Canonical content was not changed.
- 2026-10-01: narrowed the current milestone to content-only FastAPI delivery.
  Removed JSON-backed attempts, server scoring, learner identity, browser uploads,
  and backend admin publication from current stages. Retained isolated Python
  development and deferred learner-state migration until after Postgres.
- Revised-plan verification: reviewed stage dependencies and scope; whitespace
  check passed; `npm run build` passed, including TypeScript checking, with the
  existing large bundle warning. Only this planning document changed; application
  code and canonical content were untouched. Tests were not rerun for this revision.
- 2026-10-01: moved the planned Python environment to project-root `.venv`,
  updated interpreter/install commands, and kept bootstrap commands at the root.
  This changes the plan only; no environment was created or moved. Whitespace and
  path consistency checks passed; application checks were not rerun for this edit.
- 2026-10-01: implemented the content-only API with Python 3.14.7 in the root
  `.venv`, pinned runtime/development requirements, read-only indexed JSON
  repository, versioned endpoints, OpenAPI response models, ETags, and a GitHub
  Actions workflow. The learner loads the catalog from FastAPI and fetches quiz
  questions on demand. Attempts, scoring, timers, and progress remain in browser
  localStorage and TypeScript. The normal production build omits the admin entry
  and canonical bank bundle; opt-in builds can include the local admin tool.
- Implementation checks passed: backend pytest (4 tests), Ruff, mypy, frontend
  Vitest (26 files, 139 tests), canonical content validation (11,687 questions),
  TypeScript/build, and `git diff --check`. The Python bank revision matched the
  TypeScript serializer (`sha256-11b3fd084f4462c16805069883f53defd538a4d0bcd4d3537ab4c101bd7a3901`).
  The passing frontend build retains Vite's chunk-size warning. Backend TestClient
  emits a Starlette deprecation warning for its current HTTPX integration.
