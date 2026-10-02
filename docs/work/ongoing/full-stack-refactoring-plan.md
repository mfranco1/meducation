# Full-stack code quality review and staged refactoring plan

Reviewed: 2026-10-02.
Status: Stages 1–5 complete; paused before Stage 6.

## Scope and conclusion

Reviewed learner composition, session/domain boundaries, browser persistence and analytics, API loading/retries, content validation and contracts, admin editing, FastAPI routes/repository/settings, tests, CI, and architecture documentation. This is a source review with automated baseline checks, not a browser UX audit or a production performance benchmark.

The current architecture is worth preserving: pure quiz rules, repository-backed persistence, progressive content delivery, one canonical bank, explicit answer provenance, static rich content, and an isolated local admin tool. Improve the weak boundaries incrementally. Do not add a database, authentication, runtime AI, or a new state-management framework as part of this plan.

## Findings, in priority order

### 1. High: persistence needs validated, failure-aware, idempotent operations

Evidence: `src/persistence/localRepository.ts:11` casts parsed JSON to arbitrary types; valid JSON with the wrong shape passes through. Some reads bypass that catch entirely. Writes can throw without a domain-level result. `saveCompleted` writes history, count, lowest score, latest score, and activity separately; `useQuizSession.finishQuiz` clears the active attempt in a further operation. A failed write can leave partial completion state. Repeating `saveCompleted` with the same attempt increments totals again.

Recommendation: introduce a versioned storage codec and injected storage port, return actionable persistence failures, and expose one completion operation that commits history, durable summaries, and active-attempt removal together. A single validated localStorage envelope is a reasonable first option, but measure rewrite size and retain old keys during migration until verification succeeds. Make completion idempotent by attempt ID, including after history pruning. Define multi-tab behavior explicitly; a single envelope alone does not prevent competing tabs from overwriting changes.

### 2. High: content contracts differ across validation layers

Evidence: `src/content/runtimeQuestionBank.ts:300` checks revision, non-empty questions, IDs, ownership, and whether choices are an array, but does not fully validate text, choices, answer references, uniqueness, or exact catalog membership/order. The catalog validators similarly do not reconcile returned quiz IDs with subject membership. `src/content/validate.ts:45` validates the resolved answer, whereas the Python `Bank` also validates the provided answer separately. Python uses broad dictionaries for metadata and rationale metadata while TypeScript describes narrower shapes. These differences can allow locally accepted records to fail API startup, or malformed API data to reach scoring/rendering.

Recommendation: distinguish stored records, API DTOs, and hydrated domain objects; parse unknown data at each entry point. Share structural fixtures and invariant expectations between Python and TypeScript, including invalid provided answers with valid verified answers, choice labels, metadata, duplicate IDs, count/membership mismatches, and canonical order. Keep Markdown safety checks in the authoring/CI workflow and sanitization in the renderer rather than importing the whole authoring validator into startup. Add shared revision-hash fixtures for Unicode and serialization edge cases.

### 3. High before publishing content updates: attempts are not tied to content versions

Evidence: `src/domain/types.ts` has no content revision or question-set fingerprint on attempts. `useQuizSession.resumeQuiz` and `finishQuiz` use whichever canonical questions are currently loaded. Request revision pinning protects one running content session, but not a saved attempt resumed after the API restarts with an edited bank. Stable IDs alone do not describe changed choices, answers, or quiz membership.

Recommendation: define a policy for changed-content resumes before changing persistence. Store the revision and ordered question membership, or a per-quiz fingerprint, on new attempts. Preserve legacy attempts; identify incompatible resumes and offer a deliberate recovery path. Do not silently regrade or discard historical results. Pinning a hash without access to the old snapshot is not sufficient to resume the old content.

### 4. Medium: repeated storage parsing makes progress selection unnecessarily expensive

Evidence: `src/app/progress.ts` calls per-quiz repository methods inside loops, and those methods repeatedly parse entire active/latest/count/activity maps. Sorting progress invokes further activity lookups. Some repository reads lazily write migrations, so selectors described as pure can trigger persistence changes during rendering. The bank currently contains 111 quizzes.

Recommendation: migrate explicitly when initializing the repository, expose a stable progress snapshot, read each stored collection once per refresh, and group completed attempts once. Subscribe to writes/storage events so React invalidation does not depend on page navigation. Measure storage reads and selector time before/after; no user-visible latency improvement is claimed yet.

### 5. Medium: loading and application coordination have overlapping responsibilities

Evidence: `src/content/runtimeQuestionBank.ts` owns fetch deadlines, retry handling, DTO checks, normalization, caches, subscriptions, source configuration, and resource states. `src/app/App.tsx` separately owns in-flight action sets, loading IDs, retry closures, navigation generations, cancellation, and direct singleton access. Tests exist for many of these behaviors, so this is a controlled extraction opportunity rather than a rewrite.

Recommendation: separate transport, response decoding, and observable resource cache; then extract a quiz-launch/navigation coordinator. Keep synchronous `QuizRepository` reads for domain consumers. Inject concrete instances at the application composition root. Define one resource state representation and use request identity/generation checks for all cache updates, particularly reconfiguration and stale catalog completions.

### 6. Medium: backend repository abstraction is incomplete

Evidence: `backend/src/meducation_api/main.py:54` constructs the JSON adapter directly, and route helpers annotate that concrete type. `QuestionBankRepository` exists but omits `subject_quiz_summary`, which routes require. Storage models, validation, protocol, and JSON adapter share one module. `get_quiz` and subject existence checks scan lists. Routes build and dump payloads before conditional-response checks, so even a 304 request does unnecessary serialization preparation. Returning `JSONResponse` directly also means declared response models are not themselves enforcing response validation.

Recommendation: complete the protocol, inject a repository factory, separate stored models/API DTOs/adapter where ownership is useful, add subject and quiz indexes, construct validated DTOs explicitly, and check revision/cache conditions before producing bodies. Preserve canonical ordering, omitted optional fields, and current client conflict behavior. Pre-serialize responses only if measurement justifies the memory cost.

### 7. Medium: admin state extraction has not yet extracted the workflows

Evidence: `src/admin/useAdminEditor.ts` mostly exports state setters; `AdminApp.tsx` still coordinates selection, drafts, preview, staging, import, and export. `stageSingle` has no encompassing error recovery while bulk staging does. The in-memory gateway clones full banks for snapshots/history and repeats revision/validation work, with unbounded undo history.

Recommendation: expose commands and explicit editing states from a controller/reducer, unify asynchronous error/busy handling, and extract selection/editor/preview panels around real responsibilities. Add stale-preview and overlapping-command tests. Profile full-bank operations with the current 11,687-question bank before choosing bounded history, structural sharing, or a worker. Preserve deterministic export, atomic change-set validation, and provenance.

### 8. Medium: initial learner code includes rich quiz rendering

Evidence: the default production build emits an App chunk of 805.34 kB minified / 243.98 kB gzip and a learner chunk of 326.18 kB / 104.49 kB gzip. `App.tsx` eagerly imports quiz, browse, and results screens, which pull in Markdown/KaTeX rendering before the dashboard needs it. Vite reports a chunk-size warning.

Recommendation: lazy-load quiz/browse/results presentation at screen boundaries with deliberate fallbacks and load-failure recovery. Measure initial transferred JS, parse cost, and first-quiz latency. Keep local KaTeX assets and rich-content safety. Merely splitting vendor files or raising the warning limit does not establish an improvement. `main.tsx` currently only logs boot failures; provide a visible retry/reload state there as well.

### 9. Medium/low: standards and integration checks can better protect the architecture

Evidence: strict TypeScript, Ruff, mypy, unit/component tests, and CI already exist. Frontend scripts have no lint/format check. Dense inline handlers and hardcoded feedback colors remain in screens despite a shared MUI theme. Backend coverage consists of four broad tests, with several documented invalid-data and HTTP paths not explicitly covered. There is no checked-in browser E2E suite; the existing progressive-loading tracker explicitly leaves responsive/accessibility/live recovery checks pending.

Recommendation: add a scoped frontend lint baseline, hooks checks, and formatting in isolated changes; move repeated semantic colors to theme tokens. Add targeted API failure/contract cases and a small real-browser path through the actual API, answering, reload/resume, completion, Browse Answers, and failure recovery. Reorganize architecture docs around stable boundaries and clarify that a future database adapter is an option rather than a committed dependency.

## Staged implementation

Each stage should be independently reviewable. Retain canonical JSON unchanged throughout these refactors. Add or update the tests for the behavior changed, then run the relevant baseline checks below. Avoid combining formatting-only work with behavior changes.

- [x] Stage 0 — inspect implementation and document baseline/findings.
- [x] Stage 1 — establish boundary regression fixtures. Add malformed storage, interrupted completion, repeated completion, API DTO/membership, and cross-language validation fixtures. Record unsupported cases as deliberate expected failures until their implementing stage, while keeping CI green. Establish the storage/content compatibility policy. Exit: fixtures and migration/recovery design recorded; no production behavior change.
- [x] Stage 2 — strengthen contracts and backend seams. Add decoders and shared fixture parity, type nested metadata, complete/inject the Python protocol, add indexes and explicit response DTO construction, move conditional checks before body assembly. Exit: malformed data rejected consistently; API fields, revisions, ordering, and optional-field behavior preserved.
- [x] Stage 3 — harden persistence and attempt compatibility. Add codecs/migrations and error results, implement idempotent completion with active removal, attach content identity to new attempts, and implement the agreed legacy/changed-content recovery. Exit: simulated storage failures preserve prior valid state; repeat completion does not inflate totals; migrated history and durable summaries match; incompatible content is not silently scored.
- [x] Stage 4 — optimize progress reads. Expose cached immutable snapshots and subscriptions; remove migration writes from getters; aggregate attempts and activity once per refresh. Exit: dashboard and subject statistics retain current behavior, storage reads stop scaling per quiz, and invalidation/multi-tab behavior is tested.
- [x] Stage 5 — simplify frontend loading and screen composition. Extract HTTP transport/decoders/cache and quiz-launch coordinator, inject dependencies, retain cancellation/deduplication/retry semantics, then lazy-load rich screens and add visible boot/chunk failure recovery. Exit: existing loading tests plus stale-request/reconfiguration cases pass; initial transfer improves without unacceptable first-quiz delay.
- [ ] Stage 6 — modularize admin editing. Move workflows behind commands, unify busy/error states, split cohesive panels, profile and then optimize snapshot/undo costs where justified. Exit: preview/stage/undo/import/export integration tests pass, stale work cannot apply, and unedited export remains byte-identical.
- [ ] Stage 7 — enforce standards and close integration gaps. Introduce scoped lint/format enforcement, semantic theme tokens, backend negative tests and browser smoke coverage; finish the existing progressive-loading browser checks; update architecture/testing docs and record measured changes. Exit: all checks pass, pending manual checks are explicitly resolved, and this tracker moves to `docs/work/done` only after implementation is complete.

Suggested sequencing: stages 1–3 first for correctness; stages 4–5 for learner efficiency; stage 6 for authoring maintainability; stage 7 for final enforcement. Add narrowly relevant regression tests throughout, not only at the end.

## Baseline verification

Executed successfully during this review:

- `npm test`: 30 files, 172 tests passed.
- `npm run build`: TypeScript and Vite passed; large App chunk warning described above.
- `npm run validate:content`: 11,687 questions / 111 quizzes valid; existing answer-review warnings remain.
- `.venv/bin/python -m pytest backend/tests -q`: 4 passed; a Starlette TestClient/httpx deprecation warning remains.
- `.venv/bin/ruff check backend/src backend/tests`: passed.
- `.venv/bin/mypy backend/src`: passed for 5 source files.

No application behavior or canonical content was changed for this review. Browser behavior and performance remain unmeasured; treat performance recommendations as hypotheses except for observed bundle sizes and repeated operations visible in code.

## Stage 1 result: fixtures and decisions

Added `tests/fixtures/bank-contract-cases.json` and executed every case from both TypeScript (`src/content/bankContract.test.ts`) and Python (`backend/tests/test_bank_contract.py`). The fixture covers valid Unicode/provenance, duplicate IDs, unknown ownership, unsupported schema version, invalid provided answer despite a valid verified answer, invalid choice label, and incomplete review provenance. Both languages assert the same Unicode revision hash. Three frontend cases use Vitest `it.fails` because the current validator accepts them; Python rejects them. When Stage 2 fixes a case, replace its expected-failure marker with an ordinary test. A changed failure reason must not be counted as completing the case.

Added `tests/fixtures/api-response-cases.json` and `src/content/apiContract.test.ts`. One positive path verifies catalog, quiz, and questions. Four expected failures specify rejection of duplicate membership, quiz catalog disagreement, invalid answer reference, and question ID disagreement. Stage 2 must also expand fixtures to cover missing/blank text, duplicate choice IDs, malformed metadata, count mismatch, order mismatch, and optional-field compatibility before considering the API decoder complete.

Added `tests/fixtures/storage-boundary-cases.json` and `src/persistence/storageBoundary.test.ts`. Legacy active attempt reading and malformed JSON fallback are passing behavior. Three expected failures specify safe handling of valid JSON with the wrong shape, a later write failing after history was written, and repeated completion of the same attempt. Stage 3 must remove these expected-failure markers after implementing the behavior, and extend tests to pruning, migration, and concurrent tabs.

### Storage and content compatibility policy for Stage 3

1. Read the current six `meducation.*.v1` keys as legacy input. Decode and validate before deriving a new state. Preserve valid historical attempts and durable summaries; a malformed key must not silently erase valid data from another key. Keep the legacy keys untouched until the replacement state has been written and read back successfully. A failed migration leaves the old data usable on the next startup. Use a versioned envelope or another one-write commit format for the new state; decide after measuring size with realistic 200-attempt data.
2. Treat completion as one idempotent repository command keyed by attempt ID. It must update history, durable count/score summaries, activity, and removal of the matching active attempt as one recoverable state transition. It must handle a repeat even if the attempt has fallen out of the 200-entry history window; retain a bounded or durable completion-ID index as needed. A storage failure must leave the previously committed state readable and keep the quiz screen able to report the failure instead of showing success.
3. New active attempts store a per-quiz content fingerprint over ordered question IDs and scoring-relevant canonical fields, plus the bank revision for diagnostics. The fingerprint must detect changed stem/choices/choice order/answers as well as changed question membership; do not rely on the whole-bank revision alone, since an unrelated quiz edit should not block a resume. Keep completed attempts' stored scores and answer provenance unchanged when content changes later.
4. A legacy active attempt has no provable content identity. Present it as recoverable but require an explicit restart against current content before it can be scored. If a new attempt fingerprint differs from the loaded quiz, block automatic resume and offer the same explicit restart. Preserve the old active record until the learner chooses to replace/discard it; explain that its old question snapshot is unavailable. Do not silently regrade old answers or imply that matching stable IDs proves the content is unchanged.
5. For multiple tabs, publish repository state changes to other tabs and detect stale state before saving. Define the product behavior as one editing tab per active quiz: if another tab changes that quiz, pause the stale tab and require reload/recovery. A read-then-write check alone is not atomic across tabs; Stage 3 must either serialize writers with an available browser lock or document and test the supported fallback. Stage 4 adds reactive cross-tab progress updates.

### Stage 1 verification

The focused frontend suite passed 18 tests across three files, including 10 deliberately marked expected failures. The shared backend contract suite passed eight tests. The complete frontend suite passed 192 tests across 33 files; the backend suite passed 12 tests. TypeScript/build, content validation, Ruff, and mypy passed. The build retains its existing large-chunk warning, and backend tests retain their existing TestClient deprecation warning. The expected failures specify future behavior; they do not mean the current production code already satisfies it.

## Stage 2 result: content contracts and backend seam

`src/content/apiDecoders.ts` now checks subject membership, quiz and question order/counts, compact IDs, ownership, choice labels, answer references, and sparse nested metadata before API content is cached. `RuntimeQuestionBank` keeps revision conflicts separate from invalid payloads. Its existing retry and cancellation behavior is unchanged. The authoring validator now checks source and verified answers independently, choice labels, reviewed-draft provenance, nested value types, and unknown stored fields. The shared stored-bank cases run as ordinary passing assertions in TypeScript and Python; the seven Stage 1 content expected failures have been removed. The three storage expected failures remain for Stage 3.

The Python bank has typed rationale/question metadata, rejects explicit null optional fields and blank names, and indexes subjects and quizzes. Routes use the complete `QuestionBankRepository` protocol through an injected factory. They construct Pydantic response DTOs explicitly, preserve omitted optional fields, and check revision/ETag conditions before building bodies. A repository spy confirms that 304 and 409 responses do not enumerate subjects. The JSON adapter remains read-only and preserves canonical array order and revision calculation.

Contract coverage now includes Unicode revision parity, answer provenance, duplicate/unknown IDs, malformed metadata and explanations, noncontiguous questions, exact API membership, response counts/order, and sparse optional-field output. The frontend API DTO suite also covers blank stems and duplicate choices. No canonical question record or browser attempt data was changed. Stage 3 begins with the still-unresolved storage fixtures and the compatibility policy above.

Stage 2 verification: `npm test` passed 210 tests across 33 files; `npm run build` and `npm run validate:content` passed; backend pytest passed 27 tests; Ruff and mypy passed. The existing build chunk-size warning, content answer-review warnings, and TestClient deprecation warning remain. `git diff --check` passed. The three Stage 3 storage tests remain marked as expected failures.

## Stage 3 result: recoverable browser progress

`LocalAttemptRepository` now writes one validated `meducation.progress.v2` envelope. It reads the six legacy keys, preserves valid records and durable summaries, and leaves those keys untouched. A failed first write leaves legacy progress readable. Completion removes the matching active attempt in the same write as history and summaries; a durable attempt-ID index makes repeat completion idempotent after the 200-entry history is pruned. Corrupt v2 data is not overwritten, and storage/quota errors leave the quiz open with a visible message.

New active attempts capture ordered scoring-content identity and the bank revision. Legacy or changed-content attempts require the learner to choose whether to restart; cancellation preserves the saved attempt. A repository instance detects an intervening write from another tab and refuses its stale save. Browser storage events naturally publish the new envelope to other tabs, but this stage does not subscribe to them or provide an atomic lock. The simultaneous read/write race remains a documented limit; Stage 4 handles reactive updates.

A synthetic worst-case history of 200 completed attempts with 300 answered questions each serialized to 5,957,653 bytes in the current envelope. Browser storage limits vary, and a nearly full v1 store may not have room for a retained v2 copy during migration. The repository reports quota failure without partial state or deleting legacy keys. Storage footprint and read amplification deserve attention in Stage 4; do not silently discard historical responses to fit a quota.

Stage 3 verification: `npm test` passed 219 tests across 34 files; `npm run build`, `npm run validate:content`, and `git diff --check` passed. The build retains its existing large-chunk warning and content validation retains its existing answer-review warnings. Backend code was unchanged, so backend checks were not repeated in this stage.

## Stage 4 result: cached progress reads

`LocalAttemptRepository` now exposes a stable, deeply frozen progress snapshot and a subscription. Its getters share the cached state instead of rereading and parsing the storage envelope for each quiz. Reads do not write migration data. Successful local commits publish a new snapshot; relevant cross-tab `storage` events invalidate the cache and notify subscribers. React consumes it with `useSyncExternalStore`. A cross-tab refresh changes displayed progress but retains the original editing revision, so the stale tab still refuses its next write.

`createProgressView` groups retained scores by quiz and subject and derives activity fallbacks once per snapshot. Dashboard and subject selectors read the grouped view and durable summaries. This removes repeated history filters and per-quiz storage reads while preserving subject membership, trends, activity ordering, and resume position. The session no longer keeps a second completed-history state.

Stage 4 verification: `npm test` passed 221 tests across 35 files; `npm run build`, `npm run validate:content`, and `git diff --check` passed. Snapshot tests verify stable identity, no reads or migration writes across repeated getters, local and cross-tab invalidation, and stale-save rejection. The existing large-chunk and answer-review warnings remain. The Stage 3 simultaneous cross-tab write race and worst-case browser quota limit remain; neither is solved by read caching.

## Stage 5 result: loading boundaries and deferred rich screens

`contentTransport.ts` now owns HTTP timeout, retry, cancellation, and safe diagnostics; `RuntimeQuestionBank` accepts an injected transport. The existing API decoders remain the unknown-data boundary, and `runtimeContentCache.ts` indexes loaded subjects, quizzes, and ordered questions. A generation guard prevents late subject, quiz, or question responses from an earlier revision/source from replacing current content. `useQuizLaunch` owns question-load deduplication, navigation cancellation, and retry behavior through an injected loader.

Quiz, Browse Answers, and Results screens now load on demand. Quiz and Browse chunks begin preloading alongside their question request, and Results preloads while a quiz is active. The app shows a loading state and a reload action if a screen chunk fails; bootstrap also shows a reload action if the App import fails. No canonical content, attempts, scoring rules, or backend code changed.

The preceding build's initial `learner` + `App` JavaScript was about 351.60 kB gzip (105.24 + 246.36). Stage 5 builds emit about 155.58 kB gzip initially (118.91 + 36.67), a 56% reduction. The rich common chunk is 189.86 kB gzip and QuizScreen is 6.98 kB gzip when needed. Functional tests confirm the first quiz appears after its questions load and the attempt is saved; real-browser first-quiz timing under slower networks remains for Stage 7, so bundle sizes alone are not treated as a latency benchmark.

Stage 5 verification: `npm test` passed 229 tests across 37 files; `npm run validate:content`, `npm run build`, and `git diff --check` passed. Tests cover reconfiguration races at all three content levels, launch cancellation/deduplication/retry, lazy quiz integration, and visible boot/chunk recovery. The build still warns about the deferred rich common chunk, and content validation retains existing answer-review warnings.
