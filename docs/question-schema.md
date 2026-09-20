# Question schema

`src/content/questionBank.generated.json` has `schemaVersion: 2` and top-level `subjects`, `quizzes`, and `questions` collections. Each `Question` has a stable ID, subject/quiz IDs, canonical GFM `stem`, ordered `choices`, answer provenance (`sourceAnswer`, `verifiedAnswer`, `answerSource`, and optional note), a required GFM `rationale`, optional `rationaleMeta`, and structured metadata. Runtime scoring prefers `verifiedAnswer`, then `sourceAnswer`.

Question text and choice order are canonical once recorded. Make content corrections directly in the record, review them carefully, and preserve their rationale in the relevant provenance or review field. Never regenerate IDs casually.

## Markdown and rationale metadata

`stem` and `rationale` are canonical GitHub Flavored Markdown. Supported learner-facing features include paragraphs, headings, emphasis, ordered and nested lists, blockquotes, tables, code, links, and GFM footnotes. Raw HTML, images, MDX, and unsafe link protocols are forbidden. Markdown is validated at development time and rendered through one shared component; it is never rewritten by the browser.

Use `rationaleMeta.provenance: 'source_migrated'` when a stored source rationale was normalized during the one-time schema-v2 migration. Use `ai_draft_reviewed` only for a reviewed development-time AI draft. Such entries require `reviewedAt` and `reviewNote`. `rationaleMeta.sources` is shown in a disclosure below the rationale. The app never generates explanations at runtime.

When the answer key or question context is uncertain, `rationaleMeta.answerReviewNote` carries the explanation. The learner sees that note and the feedback status says the key is under review; the original `sourceAnswer` remains unchanged. Such entries still require answer verification before their quiz scores can be treated as final.
