# Content management

`src/content/questionBank.generated.json` is the canonical content store for the application. It is a schema-v2 JSON database containing subjects, quizzes, questions, final choice text, answer provenance, display-ready GFM stems and rationales, rationale metadata, and answer-review notes.

When editing content:

1. Preserve existing subject, quiz, and question IDs, question ordering, and choice IDs.
2. Make intentional question, choice, answer, stem, or rationale changes directly in the matching record. Stems and rationales are GitHub Flavored Markdown, rendered by the shared UI component.
3. Keep answer provenance explicit: retain `sourceAnswer`, add `verifiedAnswer` only after review, and use `answerNote` or `explanation.answerReviewNote` when a key is uncertain.
4. Keep provenance, sources, review data, and answer-review notes in `question.rationaleMeta`; do not create a second explanation body or JSON overlay. The application never calls an LLM at runtime.
5. Run `npm run validate:content`, `npm test`, and `npm run build` before handoff.

The current schema version is `1`. Add a deliberate migration and validation coverage before changing the stored shape.
