# Testing

Dashboard active-subject work must cover empty, single-subject, filtering, recent-activity ordering, wraparound navigation, and card selection states.

Run `npm test` for domain, question-bank, Markdown rendering, persistence, and validation tests; run `npm run validate:content` for structural, schema-v4, and Markdown safety validation; and run `npm run build` before handoff. Add fixture-based tests for every question-bank schema, content edge case, Markdown feature, or scoring behavior. When changing session behavior, cover start, resume, checkpoint, leave, abort, and finish using repository interfaces. When changing canonical content, verify compact stable IDs, the `question.quizId -> quiz.subjectId` relationship, answer references, GFM stems/rationales, rationale metadata, and deterministic per-quiz array ordering. For a future schema migration, add a dedicated, one-time candidate and parity check rather than reviving an old migration script.

For admin tooling, add core fixture tests for every change-set operation, stale revisions, relative insertion, moves, explicit cascades, rollback of an invalid mixed batch, and deterministic serialization. Verify an unedited bank round-trips byte-for-byte, exported JSON passes `npm run validate:content` when substituted in a disposable checkout, and the separate `/admin.html` entry remains disabled in a normal production build.

Grouped version-2 `content.add` tests must cover new subjects with multiple quizzes and item lists, additions under existing subjects/quizzes, inherited parent IDs, duplicate IDs, ownership mismatches, nested-field diagnostics, item ordering, version-1 compatibility, rollback, undo, and replay of the exported grouped change set to the same flat canonical bank.
