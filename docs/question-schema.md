# Question schema

Each `Question` has a stable ID, subject/quiz IDs, source-faithful `stem` and ordered `choices`, source provenance, answer provenance (`sourceAnswer`, `verifiedAnswer`, `answerSource`, and optional note), separate enrichment, and structured metadata. Runtime scoring prefers `verifiedAnswer`, then `sourceAnswer`.

Question text and choice order must be copied exactly from the PDF. Do not use enrichment to alter content.
