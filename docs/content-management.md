# Content management

`src/content/questionBank.generated.json` is the canonical content store for the application. It is a schema-v4 JSON database containing compact subject, quiz, and question identifiers, final choice text, answer provenance, display-ready GFM stems and rationales, rationale metadata, and answer-review notes.

When editing content:

1. Preserve established subject, quiz, and question IDs, canonical question ordering, and choice IDs. Subject IDs use `s*`, quiz IDs use `q*`, and question IDs use `i*`. Question display numbers are derived from one-based position within a quiz; do not add a stored question number.
2. Make intentional question, choice, answer, stem, or rationale changes directly in the matching record. Stems and rationales are GitHub Flavored Markdown, rendered by the shared UI component.
3. Keep answer provenance explicit: retain `answer`, add `verifiedAnswer` only after review, and use `answerNote` or `rationaleMeta.answerReviewNote` when a key is uncertain. Do not add `sourceAnswer` or `answerSource`; verification state is derived from whether a verified answer exists.
4. Keep provenance, sources, review data, and answer-review notes in `question.rationaleMeta`; do not create a second explanation body or JSON overlay. The application never calls an LLM at runtime.
5. Run `npm run validate:content`, `npm test`, and `npm run build` before handoff.

## Local JSON admin workflow

In local development, open `/admin.html` to stage JSON edits to subjects, quizzes, and questions. The panel is deliberately not a rich content editor and does not write to the checked-in file. Use a complete single-record JSON edit or a content-only bulk-add draft. Bulk drafts expose only authorable content fields; the panel captures the destination and bank revision, generates IDs and choice labels, and compiles the draft to a version-2 grouped change set. Existing version-1 and version-2 change-set files can be loaded separately through **Import change set**, where their technical JSON is read-only. All operations are previewed and applied atomically to an in-memory snapshot, then rejected if the final bank fails structural or Markdown validation.

The bulk editor provides three context-specific shapes. Creating a new subject uses `subject.name` and a `quizzes` list; each quiz has a `name` and an `items` list. Adding quizzes to a selected subject uses only `quizzes`. Adding items to a selected quiz uses only `items`. Each item contains `stem`, a compact list of choice text strings, an answer label (`A`, `B`, …), and `rationale`. Optional editable fields are `verifiedAnswer`, `answerNote`, `rationaleMeta`, `choiceExplanations`, `pearls`, and `metadata`. Choice labels are assigned in list order, up to 26 choices. No IDs, parent IDs, operation names, schema versions, base revisions, or change-set envelopes belong in this draft.

Example content-only draft for a new subject and quiz:

```json
{
  "subject": { "name": "Pearls" },
  "quizzes": [{
    "name": "Pearls Practice Test 1",
    "items": [{
      "stem": "Question stem",
      "choices": ["First choice", "Second choice"],
      "answer": "A",
      "rationale": "Why A is correct"
    }]
  }]
}
```

Enter the change reason in its separate field. Choose **Validate draft**, inspect the generated-ID and validation preview, then choose **Stage validated add**. The panel assigns stable IDs above the current maximum, choice labels from array order, and the default subject accent. Add more quizzes as entries in `quizzes`, and more questions as entries in each quiz's `items` list. Changing the destination or staged snapshot requires reloading the template and validating again.

Export downloads both `questionBank.generated.json` and `question-bank-change-set.json`. Replace the canonical repository file through normal review, retain the companion change set with the change rationale, then run `npm run validate:content`, `npm test`, `npm run build`, and `npm run audit:explanations`. Parent deletion requires explicit `cascade: true`; it can make saved browser attempts inaccessible and does not delete those attempts.

The local tool is enabled only for development by default. It is not authentication or authorization and must not be exposed as a production write surface before the separate backend/security work.

The current schema version is `4`. Add a deliberate migration, semantic parity check, and validation coverage before changing the stored shape. Compatibility code is temporary and should be removed after every in-scope browser profile has migrated.
