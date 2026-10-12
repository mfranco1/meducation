# Admin completeness audit

Date: 2026-10-12. Status: completed for the admin scope.

Scope: review admin task trackers against the actual implementation, repair the reported responsive width regression, finish missing authoring behavior, and verify the full relevant suite.

- [x] Identify width regression: start alignment removed implicit full-width stretching below `lg`.
- [x] Apply shared responsive width rules to both navigators, editors, and quiz status.
- [x] Restore single-record creation and deck reordering through contextual record actions.
- [x] Complete consistent deletion reviews, stale-review protection, and selected-record batch deletion.
- [x] Protect quiz drafts and coordinated Undo; add tests for cancellation and atomic failure.
- [x] Repair outdated test selectors and run complete admin coverage, frontend gates, and browser/build checks.
- [x] Reconcile task trackers with verified behavior and record remaining learner browser findings separately.

Initial audit: the prior filtered tests hid seven stale flashcard component failures. The older ongoing UX plan still lists multi-selection, full deletion review, and regression verification as unfinished. Earlier completion reports apply only to their recorded checks, not the complete admin suite.

## Findings repaired

- Start alignment removed implicit horizontal stretching. Both sections and quiz status now share explicit responsive sizing; browser assertions measure the width rather than checking only page overflow.
- Single-record creation and deck reordering had lost their UI entry points. Record actions restore them with parent availability and sibling-boundary guards; Add remains the batch workflow.
- Flashcard deletions previously used native confirmation only for nonempty decks. Both sections now use one shared impact review, Cancel focus, paged affected identities, busy gating, and captured-content stale guards.
- Selected-record deletion was unfinished. Scoped selection persists across pages, clears on parent/search changes and record removal, and stages one atomic validated batch with one Undo. Invalid empty quizzes and wrong-parent selections mutate nothing.
- Quiz browsing and mode/destination changes could overwrite a draft. Guards now retain declined drafts and protect them before unload and export. Shared-subject deletion also checks an unstaged draft in the hidden flashcard section.
- Paired Undo validated the old quiz bank against the wrong flashcard snapshot and could advance the flashcard history after a rejected quiz Undo. The gateway validates the saved pair; guarded callbacks reject later quiz operations and retain the current pair on failure.
- Imported quiz reasons were lost. They now become the workspace reason and restore through Undo/reset.
- Flashcard diagnostics were unbounded and quiz bulk destination pickers were long selects. Both sections share severity totals/filtering and ten-issue pagination; bulk destinations use searchable pickers.

## Architecture decisions

Keep changes under admin ownership. Pure navigation/deletion/validation logic remains independent of React, and the gateway remains the atomic paired-bank authority. Retain existing section histories with explicit paired-operation barriers instead of replacing working controllers with a new generalized journal. Direct context actions, bounded JSON/disclosures, and the existing MUI primitives remain. No backend, new dependency, schema migration, canonical-content edit, or learner-storage change is introduced.

## Verification

- Complete frontend suite: **84 files, 474 tests passed**. The learner lazy-study initial ready wait was extended after it failed under suite load and passed unchanged alone; all behavioral assertions remain.
- Complete admin suite: **15 files, 72 tests passed**; final focused rerun covers the controlled picker text restoration.
- Admin browser suite: **12 tests passed**, covering CRUD/export/replay, single-action Preview/Stage, layout widths, selected deletion/Undo, paired transaction barriers, and draft cancellation in both visible and hidden sections.
- Lint and the complete dependency graph passed; **10 architecture-policy tests passed**. Formatting and `git diff --check` passed.
- Normal build with TypeScript checking passed and omitted `admin.html`. Enabled admin build passed and included it.
- Actual-bank validation passed; both canonical bank files are byte-identical to HEAD. Existing answer-review warnings and the Vite large-chunk advisory remain.
- Live browser review confirmed full-width quiz and flashcard panels at 1048×739. The fixture screenshot is `/private/tmp/meducation-admin-width-fixed.png`.
- Broader learner browser verification: **13 passed, 3 failed**. Track the obsolete dashboard selectors and mobile quiz role-locator failure in [Learner browser regression findings](../ongoing/learner-browser-regression-findings.md). They are outside the admin implementation and are not claimed as passing checks.

Automated tests do not establish manual screen-reader behavior. The earlier UX proposal is completed with the smaller architecture decisions recorded above; it is not a claim that a new global history framework was introduced.
