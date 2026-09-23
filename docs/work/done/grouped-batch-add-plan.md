# Grouped batch add for the JSON admin panel

## Completion (2026-09-23)

Implemented version-2 grouped `content.add` operations, retained version-1 change-set imports, added bulk templates for a new subject, a new quiz under a selected subject, and items under a selected quiz, and documented the grouped Pearls workflow. The admin expands grouped entries through the existing atomic CRUD processor; canonical exports remain flat and the grouped companion change set replays to the same bank. Added coverage for nested creation, inherited IDs, ownership/duplicate errors, final answer and Markdown validation, ordering, version-1 compatibility, replay, and undo.

Verification passed: `npm test` (92 tests), `npm run validate:content` (10,196 questions / 98 quizzes and the existing 32 review warnings), `npm run build`, and `git diff --check`. The first full-suite run timed out on the existing full-bank Markdown test while build and validation ran concurrently; rerunning the test suite alone passed.

## Goal

Let an admin add a subject, its quizzes, and their items in one JSON document without repeating `subjectId` on every quiz or `quizId` on every item. Also support adding a quiz under an existing subject and adding items to an existing quiz. Keep the canonical question bank in its current flat schema-v4 format; nesting is an authoring convenience only.

The current bulk editor accepts a version-1 change set with one `quiz.create` operation followed by one `question.create` operation per item. The quiz record itself is already written once, but each item repeats its `quizId`. This plan changes the input format and the admin workflow, not the stored question-bank schema.

## Proposed authoring format

Add a grouped `content.add` operation to a version-2 admin change set. `subject` and `quiz` each say explicitly whether they are new or already present. Items omit `quizId`; new quiz records omit `subjectId`. The parent IDs come from their containing block.

```json
{
  "changeSetVersion": 2,
  "base": {
    "bankSchemaVersion": 4,
    "revision": "COPY_THE_CURRENT_REVISION_FROM_THE_ADMIN_PANEL"
  },
  "reason": "Add Pearls subject and initial quizzes",
  "operations": [
    {
      "op": "content.add",
      "subject": {
        "create": { "id": "s13", "name": "Pearls", "accent": "#bc531e" }
      },
      "quizzes": [
        {
          "quiz": { "create": { "id": "q99", "name": "Pearls Practice Test 1" } },
          "items": [
            {
              "id": "i10197",
              "stem": "First question stem",
              "choices": [
                { "id": "A", "text": "First choice" },
                { "id": "B", "text": "Second choice" }
              ],
              "answer": "A",
              "rationale": "Why A is correct"
            },
            {
              "id": "i10198",
              "stem": "Second question stem",
              "choices": [
                { "id": "A", "text": "First choice" },
                { "id": "B", "text": "Second choice" }
              ],
              "answer": "B",
              "rationale": "Why B is correct"
            }
          ]
        },
        {
          "quiz": { "create": { "id": "q100", "name": "Pearls Practice Test 2" } },
          "items": [
            {
              "id": "i10199",
              "stem": "Another question stem",
              "choices": [
                { "id": "A", "text": "First choice" },
                { "id": "B", "text": "Second choice" }
              ],
              "answer": "A",
              "rationale": "Why A is correct"
            }
          ]
        }
      ]
    }
  ]
}
```

For an existing subject, use `"subject": { "existingId": "s3" }`. For an existing quiz inside that subject, use `"quiz": { "existingId": "q20" }` and list only the new items. The editor should offer downloadable or copyable templates for all three common cases: new subject with quizzes, new quiz in existing subject, and new items in existing quiz. IDs in examples are illustrative; the editor must suggest unused IDs from the current snapshot.

## Contract and behavior

- Version 2 accepts the existing create/update/delete operations alongside `content.add`. Version-1 change sets remain importable and retain their present behavior. No one-time rewrite of saved version-1 files is required.
- Each `content.add` has exactly one subject reference and a nonempty `quizzes` array. Each quiz block has exactly one quiz reference and a nonempty `items` array. Subject-only creation continues to use `subject.create`.
- `create` and `existingId` are mutually exclusive. Creating an already used ID, referencing a missing parent, or placing an existing quiz under the wrong subject fails with a path-specific error.
- Every item has an explicit, globally unique stable ID. It contains all the current stored question fields except `quizId`; the processor supplies `quizId` from the containing quiz. The processor supplies `subjectId` on newly created quizzes. Reject nested `quizId` or `subjectId` fields so contradictory parent data cannot be silently ignored.
- Preserve `answer`, optional `verifiedAnswer`, choice order, rationale metadata, Markdown, and sparse metadata exactly as authored. Do not generate question content or silently correct it.
- Process grouped entries in document order: subject, then each quiz, then its items in listed order. New quizzes follow their subject's existing quizzes; new items follow existing items in their quiz. Unrelated subjects, quizzes, and questions keep their order.
- The complete change set remains atomic against its `base.revision`. The normal final-bank validator checks the expanded bank before staging or export. Warnings remain nonblocking; errors prevent apply.
- A grouped operation counts each created subject, quiz, and item in the existing impact summary. Error messages identify a nested location such as `operations[0].quizzes[1].items[3]`.
- The canonical export remains `src/content/questionBank.generated.json` with flat `subjects`, `quizzes`, and `questions` arrays. The companion change-set export retains the grouped version-2 operation so a reviewer sees the concise authored structure. Replaying it against the recorded base must reproduce the exported bank exactly.

## Implementation steps

1. Add version-2 change-set types and a discriminated `content.add` type under `src/admin/core/types.ts`. Keep the stored schema types unchanged. Define a typed item input as the stored question without `quizId` and a new-quiz input without `subjectId`.
2. Extend `src/admin/core/changeSetSchema.ts` to parse both change-set versions and reject unknown nested fields, incorrect types, empty groups, or conflicting parent fields. Return nested JSON paths in diagnostics. Preserve parsing for all version-1 operations.
3. In the admin core, expand each grouped operation into existing `subject.create`, `quiz.create`, and `question.create` operations after parsing, then pass the resulting ordered operations through the current atomic mutation and final-bank validation path. Keep expansion pure so the same logic can run behind a future backend gateway.
4. Update `InMemoryQuestionBankGateway` and export bookkeeping to accept version 2 and retain enough information to export a valid, replayable companion change set when single edits, grouped additions, and other bulk operations are staged in one session. Confirm undo removes exactly the last staged batch.
5. Update the bulk tab in `AdminApp.tsx` to start with a useful grouped template and offer the three common templates above. Show the current revision automatically. Keep the plain JSON editor and the existing validation/staging flow.
6. Add fixture tests for one new subject with multiple quizzes and items, existing-subject/new-quiz, existing-subject/existing-quiz, duplicate IDs across groups, wrong quiz ownership, forbidden nested parent IDs, Markdown/answer validation, item order, stale revisions, atomic rollback, undo, and export replay.
7. Update `docs/question-schema.md`, `docs/content-management.md`, and `docs/testing.md` with the new authoring format and an end-to-end Pearls example. Move this tracker to `docs/work/done/` after implementation and verification.

## Verification and completion

Run `npm test`, `npm run validate:content`, `npm run build`, and `git diff --check`. On a disposable snapshot, paste the Pearls example with real unused IDs, stage it, export both files, and replay the companion change set against the original bank. Confirm the resulting canonical bank matches the downloaded bank byte for byte and that every item appears under the intended quiz in the authored order. Existing version-1 batch files must still parse and apply.

This task is complete when an admin can state a subject once, each quiz once, and each quiz's items as a list, with no repeated parent IDs inside those items and no change to the learner-facing bank schema.
