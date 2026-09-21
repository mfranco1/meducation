# Content management

`src/content/questionBank.generated.json` is the canonical content store for the application. It is a schema-v4 JSON database containing compact subject, quiz, and question identifiers, final choice text, answer provenance, display-ready GFM stems and rationales, rationale metadata, and answer-review notes.

When editing content:

1. Preserve established subject, quiz, and question IDs, canonical question ordering, and choice IDs. Subject IDs use `s*`, quiz IDs use `q*`, and question IDs use `i*`. Question display numbers are derived from one-based position within a quiz; do not add a stored question number.
2. Make intentional question, choice, answer, stem, or rationale changes directly in the matching record. Stems and rationales are GitHub Flavored Markdown, rendered by the shared UI component.
3. Keep answer provenance explicit: retain `answer`, add `verifiedAnswer` only after review, and use `answerNote` or `rationaleMeta.answerReviewNote` when a key is uncertain. Do not add `sourceAnswer` or `answerSource`; verification state is derived from whether a verified answer exists.
4. Keep provenance, sources, review data, and answer-review notes in `question.rationaleMeta`; do not create a second explanation body or JSON overlay. The application never calls an LLM at runtime.
5. Run `npm run validate:content`, `npm test`, and `npm run build` before handoff.

The current schema version is `4`. Add a deliberate migration, semantic parity check, and validation coverage before changing the stored shape. Compatibility code is temporary and should be removed after every in-scope browser profile has migrated.
