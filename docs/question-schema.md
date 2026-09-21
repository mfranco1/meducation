# Question schema

`src/content/questionBank.generated.json` has `schemaVersion: 4` and top-level `subjects`, `quizzes`, and `questions` collections. IDs are compact, type-prefixed strings: subjects use `s*`, quizzes use `q*`, and questions use `i*`. `Quiz.subjectId` is the only stored subject relationship; a question stores `quizId` but not a redundant subject ID. Questions are grouped by quiz in canonical array order, which is their one-based learner display number and the future database `position` value.

Each question has a stable ID, canonical GFM `stem`, ordered `choices`, answer provenance (`answer`, optional `verifiedAnswer`, and optional note), a required GFM `rationale`, optional `rationaleMeta`, and sparse optional metadata. Runtime scoring prefers `verifiedAnswer`, then `answer`. `answerSource` is not stored: a verified answer indicates verified provenance, otherwise the provided answer is used. `questionCount` is derived from the indexed questions and is not stored on a quiz.

Question text and choice order are canonical once recorded. Make content corrections directly in the record, review them carefully, and preserve their rationale in the relevant provenance or review field. Never regenerate IDs casually. IDs are opaque database identifiers; do not derive subject, quiz, ordering, or display meaning from them.

## Markdown and rationale metadata

`stem` and `rationale` are canonical GitHub Flavored Markdown. Supported learner-facing features include paragraphs, headings, emphasis, ordered and nested lists, blockquotes, tables, code, links, and GFM footnotes. Raw HTML, images, MDX, and unsafe link protocols are forbidden. Markdown is validated at development time and rendered through one shared component; it is never rewritten by the browser.

Use `rationaleMeta.provenance: 'source_migrated'` when a stored source rationale was normalized during a one-time content migration. Use `ai_draft_reviewed` only for a reviewed development-time AI draft. Such entries require `reviewedAt` and `reviewNote`. `rationaleMeta.sources` is shown in a disclosure below the rationale. The app never generates explanations at runtime.

When the answer key or question context is uncertain, `rationaleMeta.answerReviewNote` carries the explanation. The learner sees that note and the feedback status says the key is under review; the original `answer` remains unchanged. Such entries still require answer verification before their quiz scores can be treated as final.

`metadata` is omitted when no classification is known. Do not store default `difficulty: 'unknown'`, a duplicate discipline label, or an empty metadata object.
