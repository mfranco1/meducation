# Flashcards implementation audit

Status: corrective audit complete. Identified feature and verification gaps are fixed; limitations below remain explicit.

The previous completion report was too strong: passing happy-path tests did not cover navigation races, all authoring operations, or every documented persistence guarantee.

- [x] Prevent stale/concurrent deck launches and show launch/restart persistence errors.
- [x] Replace full-text checkpoint signatures with a bounded digest computed once per launch; preserve existing checkpoint compatibility.
- [x] Align API/local ordering and tighten catalog identity/cancellation checks; index lookups and local setup.
- [x] Make admin staged operations, reorder, undo/reset, export/import and draft guards consistent, including subject changes.
- [x] Enforce rich-content validation during admin staging/replay; warn on duplicate sibling names.
- [x] Guard quiz undo/reset against removing subjects referenced by staged flashcards.
- [x] Add regression tests and exercise full admin update/move/reorder/delete workflows.
- [x] Run relevant frontend/backend/browser/content/build checks and record actual coverage limitations.

Manual assistive-technology testing was not performed in the previous implementation; role/label queries and keyboard tests verify semantics, but do not replace a screen-reader session.

## Corrective findings and evidence

- Study launches now cancel on navigation/unmount and serialize competing selections; failures preserve checkpoints and expose retryable errors. Checkpoint signatures are bounded SHA-256 digests computed once per launch, with legacy checkpoint compatibility. Storage validates timestamps/ownership, preserves corrupt data, retries temporary failures, and exposes immutable stable snapshots.
- Indexed repositories preserve canonical deck order across interleaved topics. Runtime decoders verify exact catalog identity and empty-deck metadata; canceled transport responses cannot replace a successful retry. Empty or removed decks do not appear as active study.
- Admin staging and replay use the same operation engine and full Markdown validation. Reorder, imported-history undo, draft protection, stale preview rejection, cascading counts, and shared-subject undo/reset guards are tested. Coordinated bundles now support subject removal/topic relocation without an invalid intermediate state, committing both validated snapshots together.
- The default topic control visibly shows All Topics. Desktop dashboard/subject and mobile study captures were inspected; screenshots wait for screen animations to settle. Keyboard, reduced motion, math, reload/resume, and retry behavior have browser coverage.
- Verification: 332 frontend tests in 58 files; 40 backend tests; 11 learner browser tests; 1 expanded admin browser workflow. The learner flashcard workflow was rerun after its final topic-control correction. Both default and admin-enabled builds/type-checks, lint, formatting, canonical content validation, Ruff, mypy, and diff whitespace checks pass. Canonical quiz bytes are unchanged. CI now includes admin browser checks and both build modes; remote CI execution was not performed during this local audit.

## Limits of the completion claim

- Manual VoiceOver/NVDA testing remains unperformed release QA; automated semantic/focus tests do not prove live announcements work in each assistive technology.
- No instrumented line/branch coverage percentage or production-scale performance benchmark was measured. Tests exercise observed failure paths and cross-feature invariants. Indexes and bounded per-launch digests address demonstrated lookup/storage costs.
- Existing large-chunk build warnings remain, including the explicitly enabled local admin bundle that embeds the question bank. Default production builds exclude admin.
- The canonical flashcard bank intentionally contains no reviewed medical decks. Content population and a live PostgreSQL adapter/database were explicitly outside this infrastructure implementation; the normalized contract and repository boundaries support the future migration.
