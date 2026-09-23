# Question schema

`src/content/questionBank.generated.json` has `schemaVersion: 4` and top-level `subjects`, `quizzes`, and `questions` collections. IDs are compact, type-prefixed strings: subjects use `s*`, quizzes use `q*`, and questions use `i*`. `Quiz.subjectId` is the only stored subject relationship; a question stores `quizId` but not a redundant subject ID. Questions are grouped by quiz in canonical array order, which is their one-based learner display number and the future database `position` value.

Each question has a stable ID, canonical GFM `stem`, ordered `choices`, answer provenance (`answer`, optional `verifiedAnswer`, and optional note), a required GFM `rationale`, optional `rationaleMeta`, and sparse optional metadata. Runtime scoring prefers `verifiedAnswer`, then `answer`. `answerSource` is not stored: a verified answer indicates verified provenance, otherwise the provided answer is used. `questionCount` is derived from the indexed questions and is not stored on a quiz.

Question text and choice order are canonical once recorded. Make content corrections directly in the record, review them carefully, and preserve their rationale in the relevant provenance or review field. Never regenerate IDs casually. IDs are opaque database identifiers; do not derive subject, quiz, ordering, or display meaning from them.

## Markdown and rationale metadata

`stem` and `rationale` are canonical GitHub Flavored Markdown. Supported learner-facing features include paragraphs, headings, emphasis, ordered and nested lists, blockquotes, tables, code, links, and GFM footnotes. Raw HTML, images, MDX, and unsafe link protocols are forbidden. Markdown is validated at development time and rendered through one shared component; it is never rewritten by the browser.

Use `rationaleMeta.provenance: 'source_migrated'` when a stored source rationale was normalized during a one-time content migration. Use `ai_draft_reviewed` only for a reviewed development-time AI draft. Such entries require `reviewedAt` and `reviewNote`. `rationaleMeta.sources` is shown in a disclosure below the rationale. The app never generates explanations at runtime.

When the answer key or question context is uncertain, `rationaleMeta.answerReviewNote` carries the explanation. The learner sees that note and the feedback status says the key is under review; the original `answer` remains unchanged. Such entries still require answer verification before their quiz scores can be treated as final.

`metadata` is omitted when no classification is known. Do not store default `difficulty: 'unknown'`, a duplicate discipline label, or an empty metadata object.

## Admin change sets

The local admin panel accepts version-1 legacy and version-2 JSON change sets separately from the schema-v4 bank. A change set names its base bank revision, a non-empty change reason, and ordered `subject.*`, `quiz.*`, or `question.*` create/update/delete operations. Version 2 also supports grouped `content.add` operations: the subject is declared or referenced once, each quiz is declared or referenced once, and each quiz contains an `items` array whose records omit the inherited `quizId`. New quizzes omit the inherited `subjectId`. Grouped adds do not change the canonical flat bank schema; the processor expands them into the canonical subject, quiz, and question collections.

The bulk-add editor does not accept a change set. It accepts a strict content-only draft scoped to one of three destinations: a new subject, an existing subject, or an existing quiz. Item choice text is an ordered string array; the admin compiler assigns A–Z choice IDs and sequential stable entity IDs from the current snapshot, then records the captured base revision and change reason in the internal version-2 change set. The technical change set is previewed before staging and remains available in the export. Existing version-1 and version-2 files use a separate read-only import-and-preview flow.

Creates and updates in ordinary CRUD operations contain complete stored entities; IDs cannot be renamed. Batches apply atomically, and their final bank must pass the same validation as the canonical file. Optional `afterId` controls relative insertion; question order remains canonical array order within a quiz. Deleting a subject or quiz with children requires `cascade: true`.
