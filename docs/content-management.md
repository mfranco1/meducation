# Content management

PostgreSQL is the only writable authority for the paired content: schema-v4 quizzes and shared subjects ([question schema](question-schema.md)) with schema-v2 flashcard decks and cards ([flashcard schema](flashcard-schema.md)). Edit through the authenticated HTTP editor, review the server preview, save the draft, then publish explicitly. Saving never publishes. Exports are inspection and recovery artifacts, never a source. Setup and jobs are in [operations](operations.md).

## Editing rules

1. Preserve established subject (`s*`), quiz (`q*`) and question (`i*`) IDs, canonical order and choice IDs. Display numbers derive from position; do not store them. New IDs come only from server reservations.
2. Make intentional corrections directly in the record. Stems and rationales support GFM, the limited HTML subset and KaTeX (`$...$`, `$$` blocks; escape ambiguous money as `\$`). Images need meaningful alt text and an app-local path (for example `/content/figures/nerve.png`) or a configured HTTPS origin. Choices, choice explanations and sources are restricted Markdown.
3. Keep answer provenance explicit: retain `answer`, add `verifiedAnswer` only after review, and explain uncertain keys in `answerNote` or `rationaleMeta.answerReviewNote`. Verification state is derived from whether a verified answer exists.
4. Keep sources, review data and answer-review notes in `question.rationaleMeta`. Explanations are development-time content; the app never calls an LLM.
5. Validate before relying on content: for the live database, export the draft or release and run `validate-export` and `audit-export`; for fixtures, `npm run validate:content -- <quiz-file> <flashcard-file>`. File checks cannot establish live currency.

## Editor workflow

- Open `/admin.html`. Quizzes and Flashcards are tabs; select a subject, then a quiz or deck, then a record. Item and card lists show 25 per page with search by text or ID.
- Single records have Edit, Preview and JSON views over one JSON draft. Forms patch only intentional edits and preserve untouched strings, optional presence and order. Existing IDs, relationships and source answers are read-only in forms; corrections use JSON.
- **Manage subjects** edits a shared subject from either tab without discarding other unsaved text.
- Batch adds take content-only JSON and no IDs. A new subject uses `subject.name` and `quizzes` (each with `name` and `items`); adding to a subject uses `quizzes`; adding to a quiz uses `items`. An item has `stem`, `choices` (strings, labels assigned A to Z, at most 26), `answer` (`A`, `B`, ...), `rationale`, and optionally `verifiedAnswer`, `answerNote`, `rationaleMeta`, `choiceExplanations`, `pearls`, `metadata`. Flashcard batches use `{ "cards": [...] }` for a deck (`front`, `back`, optional `sources`, `reviewNote`) or `{ "decks": [...] }` for a subject (`name`, optional `description`, `cards`). A batch is limited to 10,000 new records.

```json
{
  "subject": { "name": "Pearls" },
  "quizzes": [
    {
      "name": "Pearls Practice Test 1",
      "items": [
        { "stem": "Question stem", "choices": ["First choice", "Second choice"], "answer": "A", "rationale": "Why A is correct" }
      ]
    }
  ]
}
```

- Every write is Preview, then Review save, then Save draft with a required reason. Changing text, destination, reason or server context invalidates the preview. Unsaved text survives section switches and failures; leaving uses **Discard unsaved edits?** with Keep editing preselected.
- **Undo saved batch** and **Reset paired draft** use server history. Deleting a parent shows the full cascade across both banks, and one Undo restores both.
- **Review & publish** finalizes the draft as a new release; retained releases can be activated again (activation keeps the draft). Browser attempts that reference deleted content may become inaccessible.
- **Export paired ZIP** exports the saved draft (marked unpublished), the current publication or a retained release.

## Authoring contract

The server validates every draft and publication regardless of browser checks.

- Request and candidate pair: 64 MiB UTF-8, no compression. Depth 32, arrays 32,768, object fields 64, strings and keys 65,536 bytes, 1,000,000 visited values. Explicit `null`, unknown fields, duplicate or dangerous keys, non-finite numbers, invalid UTF-8, lone surrogates and NUL are rejected. Limits live in `src/content/validation/authoringLimits.json`.
- Rich-content validation runs a packaged Node worker (2 concurrent, 120 s, 512 MiB heap) using the same remark, GFM, math and parse5 rules as the frontend. Diagnostics report at most 200 errors with field paths and never echo authored values. Saturation or worker failure returns a safe 503.
- Preview binds exact artifacts, policy version, actor, reason, reservations and draft/publication context; save and publish re-check them. Replaying a completed operation returns its original outcome.
- Raw HTML tokens are checked before tree repair. Image dimensions are positive and at most four digits. KaTeX expansion is bounded (1,000) and trusted extensions are rejected. Image URLs allow only app-local paths or configured HTTPS origins; `VITE_CONTENT_IMAGE_ORIGINS` is the public allowlist and API validation currently permits local images only.
- Retry limits for the learner are 0 to 5 with delays of at most 30 seconds (`.env.example`).

## Local source material

Git tracks only application assets. Root `content/` (historical extraction and review files) and `tn-pdfs/` (original PDFs) are ignored, are not read by the app and are not part of any database backup; retain them separately if provenance matters. Tracked media under `public/content/` must have an explicit publishing workflow; record new media URLs and lifecycle in the content change. Build and test output (`dist/`, browser results, virtual environments) is ignored.

## Maintenance tools

Stored contracts live in `src/content/schema`, validators in `src/content/validation`, sanitization and math policy in `src/content/richText`, delivery in `src/content/api`. Future schema changes need candidate and parity validation against a fresh export.
