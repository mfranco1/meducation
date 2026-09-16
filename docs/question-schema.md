# Question schema

Each `Question` has a stable ID, subject/quiz IDs, source-faithful `stem` and ordered `choices`, source provenance, answer provenance (`sourceAnswer`, `verifiedAnswer`, `answerSource`, and optional note), separate enrichment, and structured metadata. Runtime scoring prefers `verifiedAnswer`, then `sourceAnswer`.

Question text and choice order must be copied exactly from the PDF. Do not use enrichment to alter content.

## Explanation enrichment

`rationale` is the unmodified, PDF-derived source explanation. It is never edited for readability. `src/content/explanationEnrichment.json` is a separate, ID-keyed static enrichment file. An entry contains restricted Markdown (`paragraphs`, `-` lists, `1.` lists, one nested list level, `**bold**`, and `*italic*`), a provenance value, review date, and review note.

Use `source_formatted` only when the entry formats an existing source rationale. Use `ai_draft_reviewed` only when the source rationale is absent and a development-time AI draft has been reviewed against the question, choices, answer provenance, and source PDF. The app never generates explanations at runtime. Entries may not contain raw HTML.

`src/content/aiExplanations.json` holds the development-time AI explanations approved for questions without source rationales. Its `approvedAt` date applies to every keyed entry. When the source key or extracted context is uncertain, an entry carries `answerReviewNote`. The learner sees that note and the feedback status says the key is under review; the original `sourceAnswer` remains unchanged. Such entries still require answer verification before their quiz scores can be treated as final.
