# Simplification audit and plan

Date: 2026-10-16. Status: completed; approved simplifications implemented and local checks passed.

## Scope and conclusion

Reduce cognitive load and maintenance cost while preserving behavior, public HTTP contracts, saved progress, exact authored content, stable IDs, answer provenance, and recovery safeguards. Phase 1 made no application changes. Phase 2 was approved on 2026-10-16; implementation and verification are recorded below. The existing uncommitted Engineering Philosophy addition in `AGENTS.md` belongs to the user and is preserved.

There is demonstrable cleanup available, but a broad architectural rewrite is not justified. The biggest opportunities are stale guidance, unused runtime bookkeeping, editor compatibility branches, duplicated editor state, and verification ceremony. Moving everything into fewer giant files or building a generic repository/editor framework would exchange one maintenance problem for another.

## Evidence and limits

Inventory used tracked files and physical text lines, including comments and blank lines; these are size indicators, not complexity scores. Counts precede this tracker and exclude dependencies, generated build output, private material, and lockfiles from application totals:

- Frontend application: 185 TypeScript files, 17,007 lines. Of these, 47 files have at most 20 lines; small size alone does not justify consolidation.
- Frontend tests/setup: 105 files, 9,576 lines.
- Backend Python application: 41 files, 5,981 lines, including package initializers and migrations. SQL migration bodies are outside this count.
- Backend Python tests: 17 files, 5,504 lines.
- Browser tests/support: 16 TypeScript files, 3,594 lines.
- Maintenance scripts and their tests: 52 code files, 8,113 lines.
- Work records: 158 tracked text artifacts, 49,636 lines. These include ongoing and completed Markdown, JSON evidence, and a patch; they are not runtime application code.

Inspected representative learner navigation → launch → content loading → progress paths, paired editor → gateway → HTTP client paths, server delivery/auth/authoring boundaries, test configurations, native acceptance orchestration, current documentation, and all four repository skills. Searched callers and exported identifiers. The identifier scan was candidate discovery, not proof of dead code: an export used internally or only by meaningful tests is not automatically dead.

This is a repository audit, not live database, security, production-performance, or public-launch certification. No authority database or personal progress was accessed. Estimates below are planning ranges, not measured savings or deletion quotas; they overlap and must not be summed.

## Ranked opportunities

### 1. Make guidance current and proportional

Impact: high across future work. Confidence: high. Risk: low for factual corrections; medium for changing required verification. Estimated reduction: roughly 100–250 lines of repeated active guidance, plus fewer unnecessary tasks and documents.

**Unnecessary complexity.** `AGENTS.md` already has the requested simplicity policy; appending another policy would duplicate it. Its opening also encourages preparation for hypothetical cloud/public use. `docs/architecture.md:16` still describes root JSON archives and `content/local` adapters although the authority is PostgreSQL and that frontend directory is gone. The architecture-review, refactor, and completion-audit skills still describe the backend as read-only. `docs/testing.md:131` broadly requires both browser suites for feature/shared UI changes and canonical hashes for source/config moves, regardless of whether those surfaces or content can change. Later sections recount L0–L6 implementation steps rather than presenting a short current workflow.

**Simpler alternative.** Retain one concise policy in `AGENTS.md`; have skills link to it and owner documents. Correct stale architecture/backend descriptions. Make the default workflow extend existing code, justify new moving parts, preserve safeguards, and perform a final deletion pass. Replace blanket verification language with affected-contract selection; keep comprehensive release/recovery acceptance documented separately. Retain the existing boundary checker rather than redesigning policy enforcement.

**Benefit and verification.** Fewer conflicting instructions and less process generated for routine work. Review current links, scripts, paths, and commands against implementation. Clearly distinguish a new approved verification policy from the existing one; do not silently skip current required checks before that edit is approved. Preserve PostgreSQL authority, provenance, authentication, allocation/recovery, progress compatibility, and build requirements.

### 2. Delete confirmed unused code and narrow unnecessary exports

Impact: small individually, worthwhile together. Confidence: high for listed dead symbols. Risk: low. Estimated reduction: 30–80 application lines, one file initially, and a smaller exported surface.

**Unnecessary complexity.** Repository-wide caller searches found no consumers of `src/shared/ui/shell/AppHeader.tsx`, `flashcardContentRevision` in `src/admin/core/flashcardSerialization.ts`, `AppliedAdminChange` in `src/admin/core/types.ts`, `recoverBrowserProgressPair` in `src/persistence/progressRestore.ts`, or `LocalAttemptRepository.hasActiveAttempts`. The active recovery path uses the existing admitted storage/lease flow, not that browser convenience wrapper. Several types/constants are exported only for use within their own module.

**Simpler alternative.** Delete the confirmed unused symbols and header file. Make internally used declarations private when they are not a supported contract. Keep the actual `recoverProgressPair` implementation and its coverage. Check imports, dynamic entry references, and script consumers immediately before deleting; do not use the scan to remove test-supported logic wholesale.

**Benefit and verification.** Less misleading API surface and fewer files to navigate. Run typecheck/build, architecture/lint, and affected persistence/authoring tests. Preserve Python revision-parity tests that consume `revisionForBank`; that helper is not dead. Do not remove serialized progress fields such as `timeMs` merely because current UI does not display them: they are stored/backup contracts.

### 3. Remove loading telemetry that no product surface reads

Impact: medium. Confidence: high. Risk: low to medium around notification timing. Estimated reduction: 25–60 application lines and several state containers.

**Unnecessary complexity.** `src/content/api/runtimeQuestionBank.ts` stores question resource states and question/quiz retry counters. `getQuestionRetryAttempt` and `getQuizRetryAttempt` have no callers; `getQuestionState` and `getCatalogRetryAttempt` are consumed only by tests. Actual launch/loading UI uses `useQuizLaunch` and catalog recovery state. In `runtimeFlashcardBank.ts`, `generation` never changes, yet requests repeatedly capture and compare it. `ensureCards` repeats an aborted-signal check after already checking the same signal without an intervening await.

**Simpler alternative.** Delete counters, getters, writes, and notifications used solely to expose that telemetry. Replace corresponding tests with assertions about retry requests, cancellation, final results, and visible recovery. Remove the static flashcard generation comparison while retaining abort-controller checks. Keep the question-bank generation fence: `configureApi` really increments it.

**Benefit and verification.** Fewer mutable values and fewer incidental rerenders to reason about. Exercise deduplication, cancelled old requests resolving/rejecting after replacements, bounded retry, Retry-After, revision/membership rejection, launch freshness, and launch cancellation. Catalog state/recovery/countdowns, transport diagnostics, and freshness admission remain necessary behavior.

### 4. Specialize editor components to the sole supported HTTP workflow

Impact: medium. Confidence: high for the current caller topology. Risk: low to medium. Estimated reduction: 30–100 application lines and fewer optional branches/props.

**Unnecessary complexity.** `AdminWorkspace` is the only production caller of `FlashcardAdminPanel` and always supplies `reviewBeforeSave`, shared-subject management, and server snapshots. The panel still supports alternate save labels, missing management callbacks, and an optional quiz-bank fallback. `AdminNavigatorPanel` similarly retains subject-management fallbacks despite the workspace supplying that behavior. `AdminQuestionBankGateway` makes subscription/invalidation optional although the production HTTP gateway implements both. Some component tests preserve omitted-prop modes rather than the shipped composition.

**Simpler alternative.** Make invariant production behavior explicit and remove unsupported fallback branches. Remove `reviewBeforeSave` and use the current Review save wording. For the quiz-bank fallback, first decide whether the deletion dialog actually needs the real paired bank; pass the existing snapshot directly if needed. Keep the small gateway contract: it has a concrete HTTP implementation and useful test implementations. Update those test implementations rather than removing injection.

**Benefit and verification.** Fewer combinations and clearer required inputs. Check single/bulk save review, cancellation, subject management from both tabs, paired cascades, hidden drafts, and HTTP failures. Preserve the visible labels and behavior of the shipped workspace. Do not delete a fallback until all production callers and documented contracts have been checked.

### 5. Trim implementation-coupled tests and duplicate executions

Impact: medium. Confidence: high for coupling; medium for deletion amounts. Risk: medium. Estimated reduction: 100–250 test lines initially; runtime savings unmeasured.

**Unnecessary complexity.** Dashboard tests query `.MuiSkeleton-wave`/`.MuiContainer-root`; `StatCard.test.tsx` asserts caller CSS and exact wrapping styles; `ResultsScoreHero.test.tsx` combines useful animation/reduced-motion checks with exact color/style internals. Removing loader telemetry from opportunity 3 also removes reasons to assert private bookkeeping. `progress-backup.spec.ts` runs in the ordinary learner suite and again for Chromium in the dedicated accepted-engine suite.

**Simpler alternative.** Retain assertions about observable values, loading versus zero/error, accessible names, actions, final animation result, reduced motion, and cleanup. Drop or consolidate assertions about incidental MUI classes and style spelling where browser layout checks already protect the requirement. Run the backup workflow once per intended host engine, retaining its dedicated evidence output. Do not count host and container execution as interchangeable: they test different deployment boundaries.

**Benefit and verification.** Presentation refactors stop breaking unrelated implementation assertions. Map each removed scenario to retained behavior coverage before deleting it. Keep request-count tests when they protect deduplication, and SVG identity tests when they prevent cross-instance rendering defects. Preserve storage interruption, stale-tab, failed-write, content safety, authentication, and authoring conflict regressions.

### 6. Reduce overlapping editor snapshots and synchronization

Impact: high. Confidence: medium. Risk: medium to high. Estimated reduction: 100–300 application lines if the existing receipts/subscriptions can replace duplicate state without new machinery.

**Unnecessary complexity.** The main editor spans `HttpAdminApp` (514 lines), `AdminWorkspace` (553), `useAdminEditor` (528), `FlashcardAdminPanel` (879), and `FlashcardBulkAddDialog` (419). Size itself is not the finding. The gateway owns the saved pair; `useAdminEditor` loads/clones it into a snapshot and reloads on notifications; the flashcard panel mirrors `serverBank` into local state through an effect and also installs successful save receipts. Dirty/busy/review state travels across multiple parents, refs, subscriptions, and edit-version counters.

**Simpler alternative.** First trace exactly which values represent saved server state versus unsaved text or a captured review. Use the existing gateway snapshot/receipt as the saved source and remove one redundant mirror at a time. Consolidate repeated browse/reset code locally where conditions match. Retain independent quiz/flashcard unsaved text and the captured-version guards. Keep existing component ownership; do not extract a generic editor controller, introduce global state, or split files merely to reduce line counts.

**Benefit and verification.** Fewer synchronization effects and fewer paths to an inconsistent display. Verify typing during save, newer text after success, stale discard decisions, hidden-tab drafts, subject edits/deletes across both banks, preview invalidation, cancellation, Undo/reset, expired sessions, and uncertain-write reconciliation. If removing a mirror needs a new state framework or complex adapter, stop and retain it. Implement after safer deletions, in separate quiz/flashcard batches.

### 7. Consolidate only modules that add no useful boundary

Impact: small to medium. Confidence: high for trivial wrappers, medium for broader consolidation. Risk: low to medium. Estimated reduction: 2–4 files initially and roughly 10–30 net lines; most value is fewer navigation hops.

**Unnecessary complexity.** `AdminAddSubjectButton.tsx` only forwards one callback to an ordinary MUI button. `selectors/dashboard.ts` and `selectors/quizProgress.ts` hold small functions immediately adjacent to the cohesive progress selector module. `RuntimeContentCache` is a 35-line class used only by `RuntimeQuestionBank`, whose methods mostly forward to it.

**Simpler alternative.** Inline the two button uses if they remain clearer. Consider moving the two ordering functions into the existing progress selector module, updating imports/tests together. Consider keeping cache maps directly in the runtime bank rather than a separate class; do this only if it makes the bank easier to read. Preserve lazy screen boundaries and retain useful shared policies/components such as `LoadingSkeleton`, `LaunchFreshness`, Markdown sanitization, and responsive study navigation.

**Benefit and verification.** Fewer files and no new abstraction. Check ordering/tie behavior, catalog invalidation, membership lookups, and admin labels/actions. Run graph checks and both build modes when imports change. Do not consolidate all 47 small files: many own a real policy, reusable layout, or deliberate lazy entry.

### 8. Reduce repeated validation only at already-typed internal boundaries

Impact: medium. Confidence: medium. Risk: high if applied broadly. Estimated reduction: 30–100 lines, conditional on preserving exact accepted inputs and diagnostics.

**Unnecessary complexity.** Stored question fields appear in schema types, `changeSetSchema.ts`, `bulkAddDraft.ts`, `pairedAuthoringValidation.ts`, and API decoders. `useAdminEditor` and `AdminWorkspace` parse change-set envelopes they themselves construct before the gateway previews a complete pair. Some repetitions protect distinct external formats, but internal envelope revalidation and repeated field-type declarations create additional places to update.

**Simpler alternative.** Use the existing `AdminChangeSet` type for internally constructed envelopes after user fields are validated. Reuse existing field types only where their semantics match. Retain distinct bulk-input rules (generated choices, required answer, permitted metadata), external JSON/API decoders, shared paired policy, and server enforcement. Do not build a schema DSL, code generator, or new validation library to remove a few checks.

**Benefit and verification.** Fewer parallel definitions without weaker trust boundaries. Compare accepted/rejected fixtures, unknown-field handling, optional-field preservation, empty strings, provenance, Unicode/resource limits, rich content, and Python/TypeScript revision parity. Defer any candidate whose smaller replacement would change error behavior or accepted content. This is not an initial low-risk batch.

### 9. Separate ordinary CI from full native release acceptance

Impact: high on maintenance/feedback cost. Confidence: high that work is repeated; medium on which repetitions are redundant. Risk: medium as a verification-policy change. Estimated reduction: no reliable code-line saving yet; fewer repeated builds and routine CI executions.

**Unnecessary complexity.** `.github/workflows/checks.yml` runs `acceptance.py` on every push/PR for both native architectures. Each invocation performs two no-cache API/frontend builds, repeated API/learner smoke runs, load testing, historical-image rollback, recovery drills, and full browser/editor checks. These are concrete release requirements, but repeating all of them for every minor change is a disproportionate default. `verify-full.mjs` also builds admin production output before running an admin suite configured to use the development server; that browser pass does not establish production-admin behavior.

**Simpler alternative.** Keep a straightforward ordinary frontend/backend/browser gate. Retain the full native acceptance command and recovery tooling for explicit release/infrastructure verification, with automatic coverage selected for relevant infrastructure/contract changes. Initially use explicit existing workflow jobs/conditions rather than writing a custom affected-test graph. Document separately what admin build checks and dev-server browser checks prove; retain production-admin container checks for that boundary.

**Benefit and verification.** Quicker routine feedback and clearer evidence. Before changing CI, inventory existing required branch checks and protected release gates. Exercise ordinary jobs and the retained full native path on representative changes. Do not delete migrations, recovery scripts, allocation fencing, native support, or the historic rollback drill merely to shorten CI. Scheduling or changing external branch protection requires its own explicit action; none was done here.

## Complexity justified by current requirements

- PostgreSQL-only authority, paired saves/publications, server reservations, allocation fencing, retained journals, stable IDs, and restore quarantine protect current content. They are not speculative infrastructure under today's requirements.
- Authentication, origin/CSRF checks, fresh authentication, operation IDs, and uncertain-write reconciliation prevent unauthorized or duplicate edits. The local target does not justify weakening them. Production identity acceptance remains deferred, not silently certified or removed.
- Progress repositories, codecs, revisions, Web Locks, and the paired restore journal protect existing browser data. Similar-looking repositories have different mutation/statistics semantics; a generic base repository would likely add complexity.
- Content decoders, membership/order checks, pinned revisions, and 30-second launch freshness protect actual documented behavior. Retain them while simplifying their bookkeeping.
- Rich Markdown/HTML/math sanitization and the packaged shared authoring policy solve real compatibility/safety requirements. Do not replace them with ad hoc rendering or duplicated Python policy.
- No Redux, generic dependency-injection container, workspace-package architecture, or runtime LLM was found to remove. The current small interfaces generally support meaningful isolation/testing.
- Dependency inspection found real callers for Embla, parse5, esbuild, Authlib, joserfc, cryptography, and httpx2. MUI's Emotion dependencies must be checked as peers, not judged unused by import search. No dependency removal is currently proven safe; do not replace working libraries with homemade code just to lower the dependency count.
- Completed trackers are historical records, not live instructions. Preserve their frozen evidence. Reduce active-document repetition and default search noise rather than deleting 49,636 lines and claiming the application became simpler.

## Proposed documentation and skill edits after approval

Use existing files; do not add another simplicity skill, rules directory, architectural layer, or process checklist.

- `AGENTS.md`: preserve the user's Engineering Philosophy. Reword the speculative future-cloud sentence to require current scope and explicit authorization for infrastructure. Make extending existing code and removing obsolete code the default. Clarify that a sustained task uses one concise tracker; avoid evidence files for routine edits unless they establish a necessary contract or acceptance result.
- `docs/architecture.md`: correct retired paths/backend descriptions and retain the compact ownership rules. State that ownership boundaries do not require one file per function or one abstraction per noun. Update descriptions only when an approved cleanup changes them.
- `docs/testing.md` and `docs/testing-regressions.md`: put current commands and change-based verification first; link rather than repeat detailed behavior obligations and historical acceptance records. Keep full release/recovery instructions discoverable.
- `docs/work/README.md`: retain historical evidence, use this single tracker for the cleanup, and record commands/results concisely without new JSON snapshots unless necessary.
- Four `.agents/skills/meducation-*/SKILL.md` files: replace stale read-only-service claims; link to the central simplicity policy instead of copying it four times. Refactor guidance should explicitly allow deletion/inlining/consolidation; review should identify unsupported abstractions without forcing arbitrary file-size rules. Completion checks must match authorized scope and actual affected contracts.

Proposed concise implementation instruction (integrate with existing guidance rather than append a duplicate):

> Use the simplest approach that fits the current codebase. Before adding a file, component, utility, interface, dependency, or configuration, check whether existing code can be extended. Add a new boundary only for a current responsibility or demonstrated reuse. Keep the diff focused, remove code made obsolete, and add tests only for meaningful uncovered regression risks. Preserve content, storage, public contracts, and security safeguards. Run affected checks and the required typecheck/build. Finish by deleting, inlining, or consolidating anything the change does not need.

Proposed concise review instruction:

> Look for code that can be deleted, simplified, inlined, consolidated, or implemented with existing functionality. Challenge abstractions, helpers, components, tests, and configuration that have no current requirement. Explain the concrete maintenance cost and smaller alternative; do not flag short files, small duplication, or necessary safety checks merely on principle. Prefer a smaller understandable implementation while preserving correctness, readability, security, and meaningful coverage.

## Phase 2 sequence and acceptance

1. Approve this plan, including the intended documentation/verification-policy changes. Keep this tracker ongoing through implementation; approval does not authorize content changes, deployment, commits, or publication.
2. Correct guidance and dead code (opportunities 1–2), separating factual documentation fixes from verification-policy changes. Keep the existing user edit intact.
3. Remove unused loader bookkeeping (3), then specialize invariant admin options (4), as separate behavior-preserving batches.
4. Simplify the directly affected tests (5) and only the clearly trivial modules (7). Review the net diff before proceeding.
5. Reduce editor mirrors (6) one workflow at a time. Attempt internal validation consolidation (8) only where the same behavior is demonstrably preserved. Defer any change that needs a replacement framework or disproportionate compatibility machinery.
6. Adjust CI execution policy (9) separately after checking required-check expectations. Retain full native release/recovery coverage.

After each coherent code batch: inspect callers and diff, run focused meaningful tests plus lint/architecture as affected, and run typecheck/production build. Under the existing rules, source/UI/loading changes also require the applicable learner/admin builds and browser suites; implement any approved narrowing in documentation before relying on it. Shared schema/policy/backend changes require corresponding Python/parity checks. Run content validation against explicit fixtures or fresh selected exports when content contracts are affected; never substitute a stale export for authority data.

Stop expanding a batch if it changes public DTOs, storage formats, source content, recovery guarantees, or user-visible workflow. Report that separately. Report actual net deletions/consolidations and remaining risks after each batch, without a percentage target. Move this tracker to done only after approved implementation and its relevant checks pass.

## Audit verification

- `npm run check:architecture`: passed; 307 modules / 1,297 imports, no forbidden edges or runtime cycles.
- `npm run test:architecture`: passed; 10 tests.
- `npm run typecheck`: passed.
- `npm run test:ci`: passed; 102 files / 630 tests, 101.05 seconds. Vitest reported repeated jsdom setup cost; changing test isolation is not proposed without evidence that it preserves isolation.
- `npm run build:learner`: passed; Vite reported a chunk above 500 kB. No bundling change is proposed merely to silence that advisory. Together with the passing typecheck, this establishes the learner build baseline.
- `git diff --check`: passed. At the Phase 1 handoff, tracked status contained only the user's existing `AGENTS.md` edit and this new tracker.
- Browser, backend, live-content validation, and full native acceptance were not run for this diagnostic-only stage. Phase 2 verification is specified above; no implementation acceptance is claimed.

## Implementation log

- Started Phase 2 with guidance corrections, proportional verification, and confirmed unused-symbol deletion. Preserved the user's Engineering Philosophy and all historical trackers.

- Batch 1: removed five unused symbols (including the obsolete header file), corrected current ownership/backend guidance, centralized simplicity in the existing policy, and reduced testing guidance by linking detailed runbooks. Build/typecheck, 31 focused persistence/authoring tests, and architecture check passed. Skill validator uses the repository Python environment (system Python lacks PyYAML).
- Batch 2: removed unused question/quiz retry counters, test-only question state, redundant notifications, and the flashcard generation fence that never changed. Kept real cancellation, revision, membership, retry, and launch-freshness safeguards.

- Batch 2 verification: 54 loader/freshness/session tests and build/typecheck passed.
- Batch 3: specialized flashcard/subject-management props to the shipped review workflow, removed the trivial Add subject wrapper, passed the real paired quiz snapshot to deletion review, and removed the flashcard panel's saved-bank mirror/effect. Its parent now supplies the only saved snapshot; unsaved text and held-save version fences remain independent. All 23 focused editor/navigator/subject tests and build/typecheck passed, including newer record/batch text during held saves and refresh/discard preservation.
- Batch 4: consolidated two progress selector modules and their ordering tests; removed incidental MUI class, DOM placement, and CSS assertions while retaining visible recovery/actions, animation values/reduced motion, and browser layout checks. Consolidated the quiz editor's initial/subscribed snapshot-loading lifecycles with one cleanup/error path.

- Conditional items retained after inspection: the compact runtime cache still isolates indexed content from request coordination; removing it would mostly relocate code into a larger loader. Remaining quiz saved snapshots adapt an asynchronous gateway shared with independent subject dialogs; replacing that seam needs new snapshot machinery. Optional gateway notification methods support small test adapters without no-op boilerplate. External/record/bulk validators retain distinct accepted-input rules and error behavior; deleting internal envelope checks would require replacing their required-reason diagnostics. No dependency removal was justified.
- Batch 5: removed duplicate host Chromium progress-backup execution by keeping backup in its dedicated accepted-engine suite (and adding that suite to verify:full). Native matrix names and ordinary host gates remain unchanged; full native acceptance is selected by existing Git paths, always runs for manual/tag/unknown-base events, and remains available as the same explicit release command. GitHub CLI/connector access is unavailable, so branch-protection settings could not be inspected; no external settings or check names were changed.

- Batch 4 verification: 57 focused selector/editor/dashboard/stat/animation tests and build/typecheck passed. Final lint/architecture and formatting checks passed; graph size is 302 modules / 1,283 imports (audit baseline: 307 / 1,297).
- Current workflow selection was exercised in an isolated temporary Git fixture: 14 changed-path cases and manual/tag/unknown-base fallback cases passed. Ordinary learner and backup suite listings are disjoint (18 learner cases, 25 backup cases per accepted engine); native container backup coverage is unchanged.
- The first overlapping broad unit/browser runs hit timing limits (three unit cases at 5 seconds; one learner case at 30 seconds). With no source/assertion/timeout changes, a sequential full unit run passed all 630 cases in 101 files, and a sequential learner run passed all 18 cases. Dedicated Chromium/WebKit backup passed all 50 cases; the optional admin production build passed. The complete editor browser suite subsequently passed all 36 cases.

## Completion and final verification

Completed the approved cleanup without a broader rewrite. Removed four production modules and consolidated one test file. The application diff has 63 added / 162 deleted lines (99 net removed); tests have 67 added / 80 deleted lines while retaining all 630 unit cases. The testing guide is 192 lines shorter. These counts exclude this tracker and distinguish application code from guidance, tooling, and the user's pre-existing policy addition.

Simplified unused loader state/notifications, unsupported editor options, saved-flashcard snapshot mirroring, initial/subscribed quiz snapshot loading, progress-selector fragmentation, incidental styling assertions, duplicate host backup execution, and routine native acceptance selection. Updated current documentation and all four existing skills. No runtime dependency, application module, backend infrastructure, content/storage schema, or public HTTP contract was added. Canonical content, original/verified answers, progress bytes, stable IDs, authentication and recovery safeguards were not changed. Conditional candidates retained for their demonstrated purpose are explained above; no remaining blocking finding was identified in the implemented scope.

Final local evidence:

- `npm run typecheck`: passed after all source/config changes.
- `npm run build` after each code batch, fresh `build:learner:smoke`, and `build:admin`: passed. Existing large-chunk advisory remains.
- `npm run test:ci`: 101 files / 630 cases passed in 88.10 seconds on the final standard two-worker run. The preceding one-worker full run also passed. The initial timing-limit failures did not require source, assertion, timeout, isolation, or CI-worker changes.
- Learner `test:e2e:prepared`: 18 passed on a current retries-disabled production bundle.
- Dedicated progress-backup browser suite: 50 passed across Chromium and WebKit; Firefox remains previously user-deferred.
- `test:e2e:admin`: 36 passed against the real disposable PostgreSQL HTTP editor fixture. This tests the development-server composition; the separate admin production build passed compilation.
- Lint / architecture graph, format check, and all 10 architecture tests: passed.
- Explicit synthetic paired-content validation: zero errors, one existing fixture warning. Shared policy build passed. No authority-content validation is claimed or required for these code-only changes.
- Backend Ruff and mypy: passed (41 Python source files). Backend application/schema code and fixtures were unchanged; standalone Python/real-PG suites were not rerun. Browser suites exercised the existing service with disposable databases.
- All four skill validators passed using the repository Python environment. Current relative-document file links and final diff whitespace checks passed.
- Native CI selection passed 14 isolated changed-path scenarios plus manual, tag, and unknown-base fallbacks; workflow job names were preserved. Full native images/load/recovery acceptance and hosted GitHub execution were not run. Branch protection could not be inspected without a connected GitHub client; no external settings were changed. Full native acceptance is still required for release certification.

No commit, merge, deployment, publication, authority access, or personal-progress mutation was performed. Historical trackers and the user's existing Engineering Philosophy were preserved. This tracker closes the local simplification task, not public-launch acceptance.
