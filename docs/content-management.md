# Content management

`src/content/questionBank.generated.json` is the canonical content store for the application. It is a versioned JSON database containing subjects, quizzes, questions, final choice text, answer provenance, rationales, embedded reviewed explanations, and answer-review notes.

When editing content:

1. Preserve existing subject, quiz, and question IDs, question ordering, and choice IDs.
2. Make intentional question, choice, answer, rationale, or explanation changes directly in the matching record.
3. Keep answer provenance explicit: retain `sourceAnswer`, add `verifiedAnswer` only after review, and use `answerNote` or `explanation.answerReviewNote` when a key is uncertain.
4. Keep reviewed explanation data in `question.explanation`; do not create a second JSON overlay. The application never calls an LLM at runtime.
5. Run `npm run validate:content`, `npm test`, and `npm run build` before handoff.

The current schema version is `1`. Add a deliberate migration and validation coverage before changing the stored shape.
