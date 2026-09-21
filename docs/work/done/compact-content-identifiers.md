# Compact content identifiers

## Completion (2026-09-21)

Implemented schema version 4 with compact type-prefixed identifiers: `s1` through `s12` for subjects, `q1` through `q98` for quizzes, and `i1` through `i10196` for questions. All stored foreign-key values now use the compact IDs, and `answer` replaces `sourceAnswer` while `verifiedAnswer` continues to preserve review provenance.

No composite question key was introduced: question positions are display/order data and would change if items are reordered, whereas the compact global item ID remains stable. A one-time browser-local migration maps pre-v4 attempts, active attempts, and quiz score summaries to the new identifiers.

Schema-v4 parity against the version-3 snapshot passed for all 12 subjects, 98 quizzes, and 10,196 questions. The canonical JSON decreased from 14,020,303 bytes to 12,998,304 bytes (1,021,999 bytes; 7.29%).

Verification passed: `npm run validate:content` (32 existing answer-review warnings), `npm test` (59 tests), `npm run audit:explanations`, `npm run build`, and `git diff --check`. The Vite large-bundle warning remains expected because the full local bank is bundled.

## Objective

Replace verbose canonical IDs with compact type-prefixed identifiers and rename `sourceAnswer` to `answer`, while preserving browser-local attempts through a one-time compatibility migration.

## Completion criteria

- Subjects, quizzes, and questions use `s*`, `q*`, and `i*` IDs respectively.
- `quizId` and `subjectId` foreign-key values use the new compact IDs.
- `answer` replaces `sourceAnswer` everywhere in canonical content and runtime types.
- Existing local attempts, active attempts, and score summaries migrate to the new IDs.
- Validation, tests, and build pass.
