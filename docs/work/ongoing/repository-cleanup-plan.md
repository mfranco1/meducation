# Repository cleanup plan

Created: 2026-10-07. Status: Stage 5 complete; awaiting authorization for Stage 6. Stop after every stage and wait for the user's go signal before starting the next stage.

## Goal and scope

Remove demonstrably unused files, exports, dependencies, generated residue, and repeated implementation. Reduce maintenance and build payload without changing product behavior, canonical content, stored progress, or supported authoring workflows. Follow the existing ownership boundaries rather than reorganizing the repository again.

This is the step-by-step implementation tracker. Execute stages in order, with one reviewable change per stage (split larger stages by concern). Record actual removals, verification, and remaining candidates here. The user authorized starting cleanup, then explicitly required a stop between stages on 2026-10-07. The user subsequently authorized Stages 1, 2, 3, 4, and 5 individually. For Stage 5 the user explicitly confirmed manual verification that legacy/backward compatibility is no longer needed. Wait for authorization before Stage 6. Follow the stage-gate convention in [work tracking](../README.md).

## Findings from the initial inspection

- Clean Git working tree before planning; 312 tracked files totaling 18,727,913 bytes. The canonical question bank alone is 16,456,246 bytes, about 88% of tracked bytes. Its size is authored content, not evidence that it can be deleted or minified.
- No exact duplicates among nonempty tracked files, using SHA-256 comparisons. Repeated logic still exists within different files.
- Approximate local disk usage from `du -sh`: `tn-pdfs/` 1.7 GB, `node_modules/` 418 MB, `.venv/` 160 MB, root `content/` 19 MB, and `public/content/` 14 MB. These are ignored local material/dependencies, not tracked source size. `.git/` is approximately 41 MB; history rewriting is outside this cleanup.
- `public/content/` contains ignored legacy runtime assets. Current adapters do not read its manifest, but Vite copies it into builds. This is a concrete build-payload candidate; external consumers and provenance still need review.
- `docs/work/done/` occupies about 976 KB. Completed records and frozen snapshots are deliberately preserved under the existing documentation policy. Deleting them would sacrifice history for modest savings.
- Confirmed repeated logic: JSON downloads in `src/admin/useAdminEditor.ts` and `src/admin/FlashcardAdminPanel.tsx`; SHA-256 encoding in `src/admin/core/serializeBank.ts` and `src/domain/contentDigest.ts`; primitive guards in the two API decoder modules.
- Quiz and flashcard runtime repositories have similar request bookkeeping but different retry/recovery contracts. Similar appearance alone does not justify merging their state machines.
- The existing FastAPI service is the default content source. It is active infrastructure, despite the high-level local-first description; keep it and explicit local mode.

These measurements describe the initial checkout, not promised savings. Refresh them before implementation. Relevant references: [architecture](../../architecture.md), [content management](../../content-management.md), [testing](../../testing.md), and the completed [organization plan](../done/repository-organization-plan.md).

## Stage 0 — Establish the removal baseline

Risk: low. Dependency: none.

- [x] Record the starting revision, working-tree changes, SHA-256 hashes of both canonical banks, tracked byte/file totals, ignored directory sizes, and default/optional-admin build sizes. Keep verbose logs outside the repository.
- [x] Run the frontend baseline: lint, formatting, architecture tests, unit tests, content validation, and TypeScript/build. Run Python checks and both browser suites to establish the baseline before behavioral refactors.
- [x] Build a candidate list grouped as confirmed removable, consolidation, retain, or unresolved. Record each candidate's consumers, evidence, proposed replacement, expected benefit, and verification.
- [x] Inspect reachability from learner, optional admin, QA, maintenance scripts, tests, Python service, and CI. Include dynamic imports, package/config strings, HTML references, CSS/fonts, and canonical image URLs. A text search with no matches is supporting evidence, not proof of dead code.
- [x] Record any existing failures separately; do not attribute them to cleanup or silently weaken their checks.

Exit gate: reproducible baseline and a specific candidate list. No code deletion based solely on file size or an automated unused-code warning.

### Stage 0 execution record

Starting revision: `aaaefa47342f8e6cc3ddd314dcbc286f4e964468`. The only initial working-tree addition was this ongoing plan. Tracked baseline remains 312 files / 18,727,913 bytes. Verbose logs and the baseline inventory are under `/private/tmp/meducation-cleanup/`; temporary evidence is not a durable backup of private content.

Protected SHA-256 hashes:

- Question bank: `11b3fd084f4462c16805069883f53defd538a4d0bcd4d3537ab4c101bd7a3901`.
- Flashcard bank: `cbec278cddfd655fe4f01d1112ac62fd94e1de090ddbffaf7159d640b5f98b04`.

Reachability inspection used the existing TypeScript resolver/import parser across source, maintenance scripts, browser tests, and tool configurations. No application implementation module lacked incoming imports. The apparent roots were the Vite declaration file and three package-script CLIs, which are intentional. Enabling TypeScript's unused-local and unused-parameter diagnostics in a temporary program found no unused declarations in the app compilation. These checks do not establish that every exported method is necessary.

Candidate decisions for subsequent stages:

1. **Confirmed reproducible output:** build/browser reports, Python caches, and package metadata are ignored and regenerable through documented commands. Preserve failures needed for diagnosis; deleting these is disk housekeeping rather than tracked-source reduction. Keep active installed environments. Verify regeneration and a scoped path inventory before removal in Stage 1.
2. **Unresolved legacy payload:** `public/content/` contains exactly 99 JSON files totaling 14,533,514 bytes: the old manifest and quiz shards. There are no media files in this tree and no `/content/` URLs in either canonical bank. Current local/API code has no manifest/shard consumer. Known runtime modes do not need these files, but external consumers and a durable backup are not established. Stage 1 must resolve that disposition before removing the served tree. Expected build-payload reduction is up to 14,533,514 bytes; this is not tracked Git savings.
3. **Confirmed redundant direct dependency candidate:** `remark-rehype` has no repository import/config consumer; `react-markdown` already declares it as a dependency (`^11.0.0`). Stage 2 can remove the direct declaration after checking the resolved lockfile relationship and rendering/build regressions. The package remains needed transitively, so installed-byte savings may be zero. Emotion dependencies remain required MUI peers despite the absence of a direct `@emotion/styled` import.
4. **Forwarding-export cleanup:** `runtimeQuestionBank.ts` forwards `ContentLoadError` and `getJsonWithRetry` to two test consumers; move those imports to `contentTransport.ts` before deleting the forwarding exports. Its `ContentErrorKind` and `SubjectSummary` type re-exports have no consumers. Verify imports, full frontend checks, and transport/repository tests in Stage 2.
5. **Confirmed consolidation:** reuse `sha256Text` in `revisionForBank`; share the identical JSON downloader between the two admin callers; share the four identical decoder primitives within content API. Preserve serialized bytes/revisions, download injection, and each decoder's contract. Verify cross-runtime bank revision parity, export/replay, API contract tests, and admin browser flows in Stage 3.
6. **Retain distinct runtime behavior:** quiz and flashcard repository retries, state machines, and lifecycle bookkeeping are not interchangeable. Keep them separate unless a narrow, behavior-preserving helper earns its place. Keep fixture suites with distinct schema, transport, storage, and browser obligations; no duplicate test is yet confirmed removable.
7. **Retain protected content/history:** both canonical banks, PDF/extraction/review source material, completed trackers/snapshots, existing service and local mode, migration CLI, legacy storage readers, and supported change-set import versions. No browser-profile migration evidence exists to retire compatibility branches in Stage 5.

Baseline verification completed:

- Frontend lint and formatting passed; all 10 architecture tests passed; all 62 frontend test files / 363 tests passed.
- All 39 Python tests, Ruff, and mypy passed.
- Content validation passed for 11,687 questions / 111 quizzes and 674 flashcards / 13 decks, with 32 existing answer-review warnings.
- All 11 learner browser tests and both admin browser tests passed. Learner fixture timings were 412 ms locally and 1,871 ms with the suite's 150 ms latency / 200 kB/s network settings; these are baseline fixture observations, not production performance claims.
- Default production build (the learner suite's `VITE_CONTENT_MAX_RETRIES=0` prebuild) passed, including TypeScript: 175 files / 16,878,968 bytes; no `admin.html`. Optional-admin production build with both flags passed: 179 files / 31,144,430 bytes; `admin.html` present. Both builds include 14,533,514 bytes of legacy public JSON. Mode/config differences are recorded in the temporary snapshot for like-for-like later comparisons.
- Canonical hashes remain unchanged. Documentation links resolve. Tracked diff whitespace checks passed; the added plan also has no whitespace errors when checked against `/dev/null` (the no-index command exits 1 because the file is new).

Initial sandbox attempts at `tsx` IPC and learner server binding failed with `EPERM`; the same content/browser commands passed after escalation. No outstanding baseline failures remain. Existing advisories include large Vite chunks, Vitest environment cost, Starlette TestClient deprecation, and browser `NO_COLOR`/`FORCE_COLOR` warnings.

Stage 0 changed only this tracker; checks regenerated ignored build/test outputs. No application code, dependencies, canonical content, or private material was removed. Stage 1 has not started. Waiting for the user's go signal.

## Stage 1 — Remove generated residue and legacy build payload

Risk: low for reproducible output; medium for legacy assets. Dependency: Stage 0.

- [x] Inventory explicit generated paths: `dist/`, `test-results/`, coverage/browser reports, Python caches, TypeScript build information, and generated package metadata. Remove only disposable outputs no longer needed for diagnosis. Do not use a broad `git clean -fdx`.
- [x] Review root ignore rules. Scope root historical `content/` separately from source/script directories if this simplifies the existing exception list; prove canonical banks, validators, and rich-content components remain tracked. Consider an explicit `.ruff_cache/` rule after checking its existing nested ignore behavior.
- [x] Inventory `public/content/` files against canonical rich-content URLs, runtime references, documentation, and known external URL consumers. Separate any live media from obsolete manifests/shards.
- [x] Resolve obsolete public-file disposition. The user confirmed they are unused and explicitly instructed deletion instead of the offered archive. That instruction supersedes the plan's precautionary backup step for these 99 files; no archive was created. See the execution record. Ignored assets are not recoverable from Git.
- [x] Verify a local build and a clean-checkout build have the same intended public asset inventory. Check referenced media, favicon, and bundled KaTeX assets.
- [x] Retain `node_modules/` and `.venv/` for active development. Reinstalling them does not reduce ongoing source complexity. Treat optional relocation of the 1.7 GB private PDF archive as separate local storage housekeeping after a backup location is established; preserve historical extraction/review files as documented.

Exit gate: no required media lost; production output excludes reviewed obsolete payload; ignore checks pass. Record actual output bytes removed, distinct from cache space reclaimed. Potential legacy public savings are approximately 14 MB only if the entire inventory is confirmed obsolete.

### Stage 1 execution record

The user authorized continuation, then answered the external-consumer question with “delete them, they are unused.” Removed exactly the inventoried 99 legacy JSON files / 14,533,514 bytes from `public/content/`, after verifying every path, size, and SHA-256 against the Stage 1 inventory. No media or tracked file was in that tree. The user chose deletion rather than archiving, so no duplicate archive was introduced.

Removed nine explicit disposable directories: root `test-results/`, `.mypy_cache/`, `.ruff_cache/`, backend pytest/Ruff caches, the stale scripts bytecode cache, and the three backend source/test bytecode directories. Their initial inventory totaled 31 files / 9,417,402 bytes. No tracked file was included. Browser checks regenerated 61,321 bytes of source bytecode, leaving 9,356,081 fewer disposable file bytes at verification. Generated caches may return during future development.

Scoped the private-source Git exclusions to root `/content/` and `/tn-pdfs/`, removing five source-directory exceptions. Added `.ruff_cache/` explicitly, rather than relying on Ruff's internal ignore file. Removed the obsolete `public/content/` Git/Prettier exclusion so new runtime media there can be tracked and reviewed. Verified seven existing tracked source/content paths, seven future source/media paths, and six private/generated paths with `git ls-files` and `git check-ignore --no-index`; all checks pass.

Preserved both canonical banks, the private PDF/extraction/review material, active `node_modules/` and `.venv/`, installed editable-package metadata, and active TypeScript build information under `node_modules/`. Package metadata remains part of the installed development environment, not an unnecessary second source copy. Updated current content-management guidance to describe tracked public media and retirement of the obsolete shard store, and removed stale references to ignored legacy public assets from README/architecture; historical completed trackers remain untouched.

Build verification: the default learner build with `VITE_CONTENT_MAX_RETRIES=0` passed, including TypeScript, at 76 files / 2,345,454 bytes, down exactly 14,533,514 bytes from Stage 0 (about 86%). It omits `admin.html` and the legacy public tree. All output paths and SHA-256 hashes match a tracked-file snapshot build that excludes ignored local material; installed dependencies were shared, while the snapshot used fresh separate TypeScript build metadata. This verifies checkout-output parity, not a fresh dependency installation. The favicon and all 59 KaTeX assets remain present.

The optional-admin build with both flags also passed at 80 files / 16,610,916 bytes, down the same 14,533,514 bytes from Stage 0 (about 47%). It includes `admin.html`, the favicon, and all 59 KaTeX assets, with no legacy public tree. No chunking or source behavior was changed; the existing large-chunk advisory remains.

Lint/architecture, formatting, all 39 backend tests, Ruff, and mypy passed. Python tests disabled local bytecode/pytest cache writes; Ruff used `--no-cache`, and mypy regenerated its cache under the temporary evidence directory. All 11 learner and both admin browser tests passed. Content validation passed with the same 32 answer-review warnings and unchanged corpus counts. Test artifacts are directed to the temporary evidence directory. Canonical hashes, documentation links, and diff whitespace checks passed. Existing chunk-size, TestClient, and browser environment advisories remain. Evidence is under `/private/tmp/meducation-cleanup/stage-1/`.

Stage 1 is complete with no deferred items or failing checks. Stage 2 has not started. Waiting for the user's go signal.

## Stage 2 — Delete verified dead code and unused dependencies

Risk: low to medium. Dependency: Stage 0; independent of unresolved archival items.

- [x] Trace unused modules, symbols, forwarding exports, styles, fixtures, and scripts against every entry point. Check `runtimeQuestionBank.ts` forwarding exports as candidates; remove only exports with no supported consumers or update callers to the owning module where that simplifies dependencies.
- [x] Audit every package against application imports, side-effect imports, tooling, config, and CI. Markdown, sanitization, math, Emotion/MUI, and carousel dependencies require consumer checks before removal.
- [x] Remove confirmed unused declarations and files in small batches. Delete an associated test only when its behavior has ceased to exist or equivalent coverage is demonstrated elsewhere.
- [x] Remove confirmed unused direct package declarations using the package manager and update the lockfile together. Keep runtime and development dependency categories accurate; avoid unrelated upgrades or lockfile churn.
- [x] Review the flashcard v1 migration CLI only after locating remaining v1 source/export workflows. Retain it unless retirement is established; do not confuse an infrequently used migration with dead code.

Exit gate: each deletion has recorded reachability evidence; frontend checks and affected browser/Python checks pass. A scan finding no removable dependency is an acceptable result.

### Stage 2 execution record

Re-ran the resolver/import inventory across application, maintenance, and browser code, plus unused-local/parameter diagnostics for the app compilation; no orphaned implementation module or unused local declaration was found. An AST export inventory plus source/script/browser/documentation consumer searches identified eight runtime implementation names with no outside references. Type contracts describing component props, stored/API payloads, and public return values were retained. No fixture or test was deleted.

Removed the unreferenced `initialFlashcardCardId` function: it had no caller or test, and `resolveFlashcardLaunch` already owns first-card selection. Made six implementation details private to their modules: `flashcardBulkPreviewKey`, `approvedImageOrigins`, `STREAK_MILESTONES`, `celebrationProgressFor`, the default `flashcardProgressRepository` instance, and `screenTransitionEasing`. Their behavior and consumers within each module are unchanged.

Removed the redundant `remarkMathWithCurrency` export/alias by exposing the same named plugin function directly as the existing `remarkMathPlugin` contract. Removed four forwarding exports from `runtimeQuestionBank.ts`: `ContentLoadError`, `getJsonWithRetry`, `ContentErrorKind`, and `SubjectSummary`. Both affected tests now import transport members from `contentTransport.ts`; production callers already used the owning module. In total, 12 unnecessary export names were removed while preserving every consumed contract.

Removed the direct `remark-rehype` dependency using `npm uninstall remark-rehype --ignore-scripts --no-audit --no-fund --offline`. Only one root declaration in each of `package.json` and `package-lock.json` changed. Every resolved dependency entry remains identical, including `remark-rehype@11.1.2` required by `react-markdown`. This reduces redundant dependency ownership rather than installed bytes. Other dependencies have source, tooling, type, or peer consumers and were retained.

The v1 flashcard migration CLI remains supported by the documented v1 bank/change-set recovery workflow in the flashcard schema and content-management guide. No evidence establishes that all legacy source/export workflows are retired, so the CLI, helper, and existing migration tests remain.

Verification completed: lint/architecture, formatting, all 10 architecture tests, all 62 frontend test files / 363 tests, full content validation, and all 11 learner plus both admin browser tests passed. Content validation has the same 32 review warnings and unchanged canonical hashes/corpus counts. Both TypeScript/production build modes passed: default at 76 files / 2,345,448 bytes, optional admin at 80 files / 16,610,910 bytes. Both retain the favicon and all 59 KaTeX assets; only the optional mode includes `admin.html`. Output totals are six bytes below Stage 1 in each mode; this stage's benefit is smaller maintenance/API surface, not material bundle savings. AST comparison confirms exactly 12 removed export names, and the follow-up static scan has no remaining unreferenced runtime implementation export candidates. Resolved-package parity, canonical hashes, tracker links, and diff whitespace checks pass. Existing Vite chunk, Vitest environment-cost, and browser environment advisories remain. Evidence is under `/private/tmp/meducation-cleanup/stage-2/`.

Stage 2 is complete with no failing checks. Supported type contracts and legacy migration tooling were retained intentionally. Stage 3 has not started. Waiting for the user's go signal.

## Stage 3 — Consolidate small, proven implementation duplicates

Risk: medium. Dependency: Stage 2.

- [x] Make `revisionForBank` reuse `sha256Text(serializeBank(bank))` from the existing domain digest helper. Preserve the serialized bytes, trailing newline, hexadecimal format, and `sha256-` prefix; verify TypeScript/Python revision parity.
- [x] Replace the two identical browser JSON download implementations with one admin-owned helper. Preserve filenames, bytes, MIME type, URL cleanup, and the injectable download function used by editor tests. Keep browser side effects outside admin core.
- [x] Share identical primitive API guards (`record`, `nonempty`, `unique`, `onlyKeys`) within `src/content/api` if doing so removes meaningful repetition. Preserve each response contract's existing strictness and ordering rules; quiz and flashcard envelope validation currently differ.
- [x] Review repeated bulk-draft/editor logic only for truly identical pure operations. Keep distinct quiz/flashcard data models and coordinated export rules explicit.
- [x] Leave the two runtime repositories separate unless a narrow helper demonstrably reduces complexity while preserving cancellation, stale-generation rejection, request deduplication, retry-now behavior, and revision pinning. Avoid a generic repository framework.

Exit gate: fewer duplicated implementations and no extra speculative layers; relevant contract, export/replay, race/retry tests and browser suites pass. Keep this stage separate from formatting-only changes.

### Stage 3 execution record

`revisionForBank` now delegates to the existing domain `sha256Text` helper using the unchanged `serializeBank(bank)` string. The serializer, property order, indentation, trailing newline, UTF-8 input, hexadecimal format, and `sha256-` prefix remain unchanged. The shared Unicode revision fixture retains its fixed TypeScript/Python digest.

Added `src/admin/downloadJson.ts` and replaced the two browser download implementations with it. The helper preserves JSON MIME type, filenames, payload bytes, anchor click, and object-URL revocation. Quiz editor tests can still inject `options.download`; browser side effects remain in admin presentation, outside core/data.

Added `src/content/api/jsonGuards.ts` with the four identical decoder primitives. Both API decoders import these while retaining their own payload validation, metadata, IDs, ordering, counts, and envelope strictness. Four duplicated guard definitions, one duplicate downloader, and one duplicate digest implementation now each have a single owner. The five original files plus the two new helpers contain 590 fewer source bytes in total.

Reviewed the quiz/flashcard bulk parsers and editors. They differ in draft shapes, ID allocation (compact numeric quiz IDs versus flashcard UUIDs), error accumulation, empty-deck support, subject guards, and coordinated export/import behavior. The reused downloader is the demonstrated common operation; no generic editor/parser layer was introduced. Runtime repositories already share the transport but expose different retry/recovery contracts, so their lifecycle state machines remain separate.

Verification completed: lint/architecture, formatting (including both new helper files), all 10 architecture tests, content validation, all 39 backend tests/Ruff/mypy, and all 11 learner plus both admin browser tests passed. The initial full unit run passed 360 tests and timed out on three tests at the existing five-second limit while other heavy verification jobs were active; no assertion failures occurred. An isolated rerun of the same `npm test` command and unchanged test configuration passed all 62 files / 363 tests. Both attempts are retained in the temporary evidence directory. No timeout settings or tests were changed.

Both TypeScript/production build modes passed: default at 76 files / 2,345,345 bytes, optional admin at 81 files / 16,611,093 bytes. Compared with Stage 2, the default output is 103 bytes smaller and optional-admin output is 183 bytes larger, including a new 199-byte shared digest chunk. The benefit is fewer implementation owners, not meaningful bundle savings. Both modes preserve the favicon and all 59 KaTeX assets, exclude obsolete public content, and include admin only in the optional mode. Content validation retains the same corpus counts and 32 review warnings. Both canonical hashes, the fixed Unicode revision contract, and diff whitespace checks pass. Existing chunk-size, Vitest environment-cost, TestClient, and browser environment advisories remain. Evidence is under `/private/tmp/meducation-cleanup/stage-3/`.

Stage 3 is complete with no outstanding failing checks. Stage 4 has not started. Waiting for the user's go signal.

## Stage 4 — Reduce redundant tests, configuration, and current documentation

Risk: medium for test removal; low for documentation. Dependency: Stages 2–3.

- [x] Map overlapping tests to the behavior each uniquely proves before combining cases. Keep schema/API/storage boundaries and cross-runtime parity tests even when their fixture data looks similar.
- [x] Reuse fixture builders only within valid ownership boundaries. Keep meaningful differences between unit fixtures, shared Python/TypeScript contracts, and browser workflow fixtures.
- [x] Check Vite, Playwright, package scripts, and CI for repeated setup with identical semantics. Consolidate only where it reduces work; retain the separate production learner and development admin workflows and required build modes.
- [x] Remove stale current-document statements and link to the owning guide instead of repeating specifications. `DESIGN.md` is already a short pointer, so it offers little cleanup value.
- [x] Preserve completed trackers and frozen snapshots under the existing work-history policy. Keep new measurements concise in this tracker rather than creating another large checked-in audit dump.

Exit gate: documented commands match scripts/CI; no regression obligation lost; links resolve. Record which duplicate assertion/setup was removed and where its behavior remains covered.

### Stage 4 execution record

Reviewed overlap at the stored-schema, API DTO, local-adapter, retry-policy/runtime, persistence boundary/snapshot, and unit/browser workflow layers. Stored-bank TypeScript/Python cases exercise independent implementations; API cases additionally check hydrated DTO membership/order; local adapters prove indexing and sparse metadata; retry-policy tests prove calculations while runtime tests prove scheduling/cancellation; storage boundary tests prove migration/atomicity while snapshot tests prove identity, notification, and invalidation. Browser workflows retain production loading and real authoring interactions. No complete test was shown redundant. A TypeScript AST inventory of 65 test files found 357 directly declared `it`/`test` callback bodies and no repeated bodies after whitespace normalization; parameterized cases are not counted as individual callbacks by that scan. This supplements manual obligation review rather than proving semantic uniqueness.

Removed one identical `unknown subject` matcher repeated within the same flashcard validation assertion. `arrayContaining` checks membership, so the repeated matcher did not require a second diagnostic. The remaining matcher preserves the unknown-subject obligation alongside the distinct unknown-field, orphan-deck, empty-field, and ID-prefix checks. All test cases and shared fixture bytes remain intact. Existing small test-local builders have different transport/storage semantics; sharing them would add indirection without demonstrated savings.

Reviewed Vite, both Playwright configs, package scripts, ESLint/TypeScript setup, and CI. Learner production preview uses fixture FastAPI and a retry-disabled prebuild; admin uses a separate development server and browser-device setup. Separate CI jobs each require an isolated Python install. These are intentional boundaries, so no shared config layer, extra setup script, or workflow abstraction was introduced.

Consolidated frontend mode/editor setup guidance in the root README by linking to it from architecture, testing, content management, and backend setup. Kept unique retry constraints and content replacement instructions. Corrected stale references to `VITE_ENABLE_ADMIN`: `AdminApp.tsx` actually reads `VITE_ENABLE_LOCAL_ADMIN`, and the README already gives the correct command. Earlier cleanup-stage builds used the unrecognized variable; they established bundling/type-checking and included `admin.html`, but did not establish an enabled production editor. Their historical measurements remain intact; Stage 4 verifies the correct runtime gate. CI intentionally checks admin bundling alone, while the development admin browser suite bypasses the production gate. Completed trackers and frozen snapshots were not edited.

Verification completed: lint, formatting, all 10 architecture tests, and all 62 frontend test files / 363 tests passed. Ordinary TypeScript/production build passed at 76 files / 2,345,317 bytes with no admin entry (normal retry defaults, unlike the learner-suite retry-disabled builds recorded earlier). The enabled production admin build used the README command with `VITE_BUILD_ADMIN=true VITE_ENABLE_LOCAL_ADMIN=true` and passed at 82 files / 16,728,020 bytes. The enabled output is a different runtime mode from earlier disabled-editor measurements, so its size is not a cleanup regression comparison. Both retain all 59 KaTeX assets; the enabled output also verified the favicon.

A temporary Chromium check against production preview confirmed the preceding unrecognized-flag build displays the disabled-editor warning and no Record tab. The correctly enabled build displays the Record tab and Flashcards deck controls, has no disabled warning, and produces no page errors. The temporary preview servers were stopped after checks. No runtime module, configuration, backend implementation, fixture, or canonical content changed in this stage; full development-browser/Python/corpus reruns were unnecessary for the removed matcher and documentation edits. Both canonical SHA-256 hashes remain unchanged. All 31 relative documentation links and anchors resolve, and diff whitespace checks pass. Four current guides contain 563 fewer bytes in total; the repeated test matcher removes a further 49 bytes. This stage's main benefit is removing conflicting setup guidance while retaining regression obligations. Existing Vite chunk-size and Vitest environment-cost advisories remain. Evidence is under `/private/tmp/meducation-cleanup/stage-4/`.

Stage 4 is complete with no failing checks. Stage 5 has not started. Waiting for the user's go signal.

## Stage 5 — Conditional compatibility retirement

Risk: high. Dependency: evidence of migration, not merely preceding stages passing.

- [x] Inventory persisted quiz keys, flashcard v1 checkpoints/signatures, legacy quiz timing/response handling, and supported authoring change-set versions.
- [x] The user explicitly verified manually that legacy/backward compatibility is no longer needed and authorized removal. This supersedes the earlier requirement to retain compatibility without migration evidence. Retire only the identified older formats and tooling; retain current-format validation and recovery.
- [x] Remove retired readers, signature/timing/response fallback paths, v1 authoring imports, and migration tooling. Update current fixtures, tests, and guides to the supported contracts.

Exit gate: separately verify the authorized retirement. No storage resets, ID changes, or canonical migrations. Current v2 progress and v2 authoring/replay must remain supported; older formats are intentionally no longer read/imported.

### Stage 5 execution record

Authorization: the user said “assume no need for legacy or backward compatibility anymore since I've verified that manually.” The repository cannot independently verify browser-profile/export history; this owner confirmation supplies the retirement decision. No further migration or archive was requested, and no browser data was purged. Earlier stages' retain decisions describe the evidence available then and remain in this history.

Removed the six quiz v1 storage keys, their decoder/derived-summary reconstruction, legacy storage-event handling, and the fallback to old keys when current v2 storage is absent or malformed. Missing v2 storage now produces a fresh empty state; corrupt current bytes still block writes and remain untouched. Removed activity fallbacks to start/latest timestamps in both repository and selectors; current writes populate the activity summary.

Removed flashcard v1 key reads and in-memory checkpoint conversion, legacy key subscriptions, and acceptance of copied serialized card content as a signature. Current v2 checkpoints and bounded SHA-256 signatures remain. Kept missing-card/changed-content restart, frozen snapshots, storage recovery, stale-writer protection, and independent quiz/flashcard progress.

Removed quiz response normalization and its session effect, elapsed-time reconstruction from `startedAt`, default celebration-state reconstruction, and the legacy-specific restart dialog branch. Current attempt types require elapsed time and celebration state; the storage boundary requires those fields, response flags/lock/time, and an active content signature. Selected Fast Feedback responses must already be locked. Paused timers, unanswered responses, optional bank revisions, and completed records without active content signatures are current behavior and remain supported. Changed-content restart/cancel and timer pause/resume remain covered.

Quiz authoring now produces and imports change-set version 2 only, including single-record edits/deletes and coordinated imports. Both individual operations and grouped `content.add` remain supported within v2. Removed the v1-only grouped-operation branch and obsolete flashcard migration-message special case; unsupported versions are rejected by current envelope validation. Bundle/manifest version 1 and `/api/v1` are the current contracts, not retired compatibility, and remain unchanged. `source_migrated` rationale provenance remains authoritative content.

Deleted the flashcard-v1 CLI, pure migration helper, and five retired migration tests; removed its package script and now-empty directory. Removed remaining tests that existed solely for retired compatibility, and moved current fixtures to explicit current attempt/envelope shapes. Strengthened the two learner cancellation/failure browser assertions to inspect the current flashcard v2 key instead of the retired v1 key. Updated current schema, architecture, testing, authoring, and layout guidance. Completed trackers and canonical bank bytes remain unchanged.

Verification completed: all 61 frontend files / 356 tests passed in the final full run. Eleven tests solely for retired contracts were removed (including the five-test migration file), and four current-boundary rejection cases were added. Current replay, cancellation, changed-content restart/cancel, timing, scoring, corruption preservation, quota atomicity, pruning/idempotence, snapshots, and stale-writer obligations remain covered. The first intermediate unit run also passed; the full suite was rerun after adding the final Fast Feedback lock guard.

Lint, formatting, all 10 architecture tests, full content validation, and all 39 backend tests/Ruff/mypy passed. Validation has the unchanged 11,687 questions / 111 quizzes and 674 cards / 13 decks, with the same 32 review warnings. Both canonical hashes are unchanged. All 11 learner browser tests passed; the two strengthened current-key checks additionally passed in a focused rerun. Both TypeScript/production build modes passed: retry-disabled learner at 76 files / 2,342,987 bytes and enabled admin at 82 files / 16,725,445 bytes. Both retain the favicon and all 59 KaTeX assets; only the optional mode contains `admin.html`. The enabled admin output is 2,575 bytes below Stage 4 in the same enabled mode. Reviewed implementation/tooling/package-script changes remove 10,800 bytes; tests/fixtures remove a net 5,790 bytes; current guides remove 1,610 bytes, excluding this execution tracker. Three tracked migration files were deleted. All 43 relative documentation links/anchors resolve, retired-symbol consumer searches have no matches, and diff whitespace checks pass. Existing Vite, Vitest, TestClient, and browser environment advisories remain.

Both admin browser tests passed, covering current authoring CRUD, bulk import/staging, one-step undo, and exported change-set replay. Evidence is under `/private/tmp/meducation-cleanup/stage-5/`.

Stage 5 is complete with no failing checks. Retired formats are intentionally unsupported under the owner's explicit authorization; current v2 progress and authoring contracts remain supported. Stage 6 has not started. Waiting for the user's go signal.

## Stage 6 — Final verification and closeout

Risk: low. Dependency: all applicable stages complete or explicitly retained/deferred.

- [ ] Run `npm run lint`, `npm run format:check`, `npm run test:architecture`, `npm test`, `npm run validate:content`, and `npm run build`.
- [ ] Run `VITE_BUILD_ADMIN=true VITE_ENABLE_LOCAL_ADMIN=true npm run build`; confirm the default build omits admin and the optional build includes it.
- [ ] For changed runtime/shared/admin code, run learner and admin browser suites sequentially. Exercise explicit local mode and development content QA if their imports/assets changed. Follow `docs/testing-regressions.md` for affected flows.
- [ ] For backend/shared contract/revision changes, run `.venv/bin/python -m pytest backend/tests -q`, `.venv/bin/ruff check backend/src backend/tests`, and `.venv/bin/mypy backend/src`.
- [ ] Compare canonical hashes, export/revision parity, media inventory, lazy chunks, tracked bytes/files, source duplication removed, and production output sizes against Stage 0. Rebuild the same mode for comparisons; cache deletion and minification are not source-code reduction.
- [ ] Run `git diff --check`, review every deletion, record failures/advisories and deferred items, and move this tracker to `docs/work/done/` only after the implementation scope and checks are complete.

Success means verified unnecessary material is gone, repeated behavior has fewer owners, and supported workflows still work. It does not require an arbitrary file-count target or a large rewrite.

## Planning verification

- [x] Inspected repository ownership, content lifecycle, testing instructions, recent organization work, scripts/configuration, local sizes, and representative duplicated code.
- [x] Compared nonempty tracked files for exact byte duplication; none found.
- [x] Planning-only change verified: `npm run build` passed, including TypeScript checking; Vite reported the existing large-chunk advisory. All five relative document links resolve. `git diff --check` passed for tracked changes; the only added file is this plan. Full implementation baseline suites remain Stage 0 work.
