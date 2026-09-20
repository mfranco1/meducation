# Question schema

`src/content/questionBank.generated.json` has `schemaVersion: 1` and top-level `subjects`, `quizzes`, and `questions` collections. Each `Question` has a stable ID, subject/quiz IDs, canonical `stem` and ordered `choices`, answer provenance (`sourceAnswer`, `verifiedAnswer`, `answerSource`, and optional note), optional rationale and reviewed explanation content, and structured metadata. Runtime scoring prefers `verifiedAnswer`, then `sourceAnswer`.

Question text and choice order are canonical once recorded. Make content corrections directly in the record, review them carefully, and preserve their rationale in the relevant provenance or review field. Never regenerate IDs casually.

## Explanation enrichment

`rationale` is canonical plain-text explanation content. A question may also contain an embedded `explanation` object with restricted Markdown (`paragraphs`, `-` lists, `1.` lists, one nested list level, `**bold**`, and `*italic*`), a provenance value, review date, and review note. It is part of the same question record, not a separate runtime overlay.

Use `source_formatted` only when the entry formats an existing rationale. Use `ai_draft_reviewed` only when the rationale is absent and a development-time AI draft has been reviewed against the question, choices, and answer provenance. The app never generates explanations at runtime. Entries may not contain raw HTML.

When the answer key or question context is uncertain, the embedded explanation carries `answerReviewNote`. The learner sees that note and the feedback status says the key is under review; the original `sourceAnswer` remains unchanged. Such entries still require answer verification before their quiz scores can be treated as final.
