# Simplify the bulk add JSON editor

## Objective

Make the bulk add editor show only fields an admin should author. The current grouped template exposes `changeSetVersion`, `base.bankSchemaVersion`, a SHA-256 revision, `reason`, `operations`, `op`, `create`/`existingId`, and subject, quiz, and item IDs. Those fields are required by the internal change-set protocol, but editing them is unnecessary for the content authoring task and creates opportunities for stale revisions, incorrect references, and ID collisions.

Keep the canonical schema-v4 bank and the version-2 change-set format. This change adds a small **bulk add draft** format for the editor and compiles it into the existing `content.add` operation before preview and apply. The admin still downloads the full canonical bank and a replayable technical change set for review.

## Proposed editable JSON

For **New subject with quizzes**, the panel shows a template like this:

```json
{
  "subject": { "name": "Pearls" },
  "quizzes": [
    {
      "name": "Pearls Practice Test 1",
      "items": [
        {
          "stem": "Question stem",
          "choices": ["First choice", "Second choice"],
          "answer": "A",
          "rationale": "Why A is correct"
        }
      ]
    }
  ]
}
```

For **New quiz in selected subject**, the subject is selected in the hierarchy outside the JSON editor. The draft contains only `quizzes` with `name` and `items`. For **Items in selected quiz**, the draft contains only an `items` array. Show the selected destination's name in a read-only label above the editor; the admin should not type its ID.

The default template shows the required content fields only. The draft parser may accept these optional, content-bearing item fields when needed: `verifiedAnswer`, `answerNote`, `rationaleMeta`, `choiceExplanations`, `pearls`, and `metadata`. Keep their existing provenance and sparse-metadata rules; do not prefill empty optional objects or claim that a provided answer has been verified. `rationaleMeta.sources` remains editable because citations are content. Additional optional content fields should be documented beside the template or offered as an **Insert optional fields** action, without exposing internal metadata.

## Fields the editor should manage

- Fix the change-set version, bank schema version, and operation type in admin code.
- Capture the base revision when the draft starts. Keep the change reason in its existing separate input.
- Take an existing subject or quiz ID from the selected destination in the hierarchy.
- Allocate new subject, quiz, and item IDs in document order; derive each new quiz's `subjectId` and item's `quizId` from its parent.
- Give a new subject a documented accent default matching the current theme.
- Generate choice IDs `A`, `B`, `C`, … from the ordered choice text array.

The admin may see generated IDs in a read-only preview and in exported files, where they support review and references. They must not be editable in the bulk add draft. Preserve the source answer in `answer`; `verifiedAnswer` remains a distinct optional reviewed value. Both must refer to a generated choice label. Limit the compact choice-array form to a clearly documented maximum of 26 choices unless the mapping is extended deliberately.

## Processing rules

1. Define a separate `BulkAddDraft` type and runtime parser for each of the three contexts. Allow only the content fields listed above; reject `id`, `subjectId`, `quizId`, `base`, `revision`, `op`, and any unknown field with its JSON path. Do not silently strip attempted technical fields.
2. Capture the current snapshot revision and destination selection when the draft is created. Keep that context outside the JSON text. If another staged change makes the draft stale, explain that the admin must reload the template or explicitly review it against the new snapshot; do not silently attach it to a new parent or revision.
3. On **Validate and stage**, parse the draft, allocate unused compact IDs in one pass over the entire batch, expand ordered choice strings to `{ id, text }` records, add inherited parent IDs and the default subject accent, and produce a version-2 `AdminChangeSet` with grouped `content.add` operations.
4. Compile the draft once per staging attempt and use that exact change set for both preview and apply. Keep ID allocation deterministic from the captured base snapshot, skip already used IDs, and reject any collision before applying. No ID should be consumed by a failed draft or preview.
5. Run the existing full-bank structural and Markdown validation after compilation. Show errors against draft paths such as `quizzes[1].items[3].answer`, alongside the affected item text or generated ID in the read-only preview. A bad item rejects the entire batch.
6. Show a read-only confirmation summary with destination, new subject/quiz/item counts, generated IDs, answer-key review warnings, and the final item order before staging. Export the resulting flat bank plus the full version-2 change set, including allocated IDs and recorded base revision, so replay produces identical bytes.
7. Continue accepting saved version-1 and version-2 change sets through a separate **Import change set** action with a read-only preview. Keep the technical change-set JSON out of the bulk add editor. Do not merge an imported file into an unrelated draft without a fresh preview.

## Implementation sequence

1. Add the draft types, strict parser, and pure draft-to-change-set compiler under `src/admin/core/`. Reuse the existing stored entity and change-set validators after compilation rather than creating a second set of canonical content rules.
2. Add a batch ID allocator that scans the current bank once and assigns subject, quiz, and item IDs in authored order. Ensure multiple quizzes and items in the same draft receive distinct IDs. Isolate this allocator so a future backend can replace it without changing the draft format.
3. Replace `groupedAddTemplate` with three content-only draft templates. Update `AdminApp.tsx` to keep the selected destination and captured revision outside the JSON editor, show the destination read-only, and compile the draft on validation.
4. Keep the gateway's atomic preview/apply/undo behavior and replayable export. Add a separate import path for existing raw change sets rather than showing their envelope in the content editor.
5. Add focused tests for all three contexts; multiple quizzes/items; generated IDs and choice labels; provided versus verified answers; optional rationale metadata; stale context; forbidden fields; malformed JSON; invalid answers and Markdown; atomic rollback; undo; and exact export replay. Include a regression fixture proving that an existing version-1 or version-2 change set can still be imported.
6. Update `docs/content-management.md`, `docs/question-schema.md`, and `docs/testing.md` with the new draft format, its generated fields, and the Pearls example. Move this tracker to `docs/work/done/` when implementation and verification pass.

## Verification and completion

Run `npm test`, `npm run validate:content`, `npm run build`, and `git diff --check`. In a disposable snapshot, create a Pearls subject with several quizzes and items from the content-only draft. Confirm that generated IDs are unique, each item keeps its authored choice order and answer provenance, and the exported change set replays to the exact canonical JSON download. Confirm that changing the selected destination or snapshot after opening a draft cannot silently redirect or apply it.

The work is complete when the bulk add JSON editor shows only editable content, the panel handles all technical identifiers and revisions, existing change-set files remain importable, and the canonical bank's schema and contents are unaffected until an admin intentionally exports and replaces the file.

## Completion

Implemented the content-only draft parser/compiler, generated IDs and choice labels, destination/revision capture, explicit validation-then-stage flow, and separate read-only change-set import preview. Updated content-management, schema, and testing documentation. Verification passed: `npm test` (97 tests), `npm run validate:content` (10,196 questions), `npm run build`, and `git diff --check`. The production build reports the existing large validation chunk warning.
