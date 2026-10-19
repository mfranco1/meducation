# Content management

PostgreSQL is the only writable authority for the paired content: schema-v5 quizzes with the shared subjects and topics ([question schema](question-schema.md)) and schema-v3 flashcard decks and cards ([flashcard schema](flashcard-schema.md)). Edit records in the draft through the authenticated HTTP editor, then publish explicitly. Saving a record never publishes. Exports are inspection and recovery artifacts, never a source. Setup and jobs are in [operations](operations.md).

## Editing rules

1. Preserve established subject (`s*`), topic (`t*`), quiz (`q*`) and question (`i*`) IDs, canonical order and choice IDs. Display numbers derive from position; do not store them. New IDs are assigned by the server when a record is created and are never reused.
2. Make intentional corrections directly in the record. Stems and rationales support GFM, the limited HTML subset and KaTeX (`$...$`, `$$` blocks; escape ambiguous money as `\$`). Images need meaningful alt text and an app-local path (for example `/content/figures/nerve.png`) or a configured HTTPS origin. Choices, choice explanations and sources are restricted Markdown.
3. Keep answer provenance explicit: retain `answer`, add `verifiedAnswer` only after review, and explain uncertain keys in `answerNote` or `rationaleMeta.answerReviewNote`. Verification state is derived from whether a verified answer exists.
4. Keep sources, review data and answer-review notes in `question.rationaleMeta`. Explanations are development-time content; the app never calls an LLM.
5. Validate before relying on content: for the live database, export the draft or release and run `validate-export` and `audit-export`; for fixtures, `npm run validate:content -- <quiz-file> <flashcard-file>`. File checks cannot establish live currency.

## Editor workflow

- Open `/admin.html`. Quizzes and Flashcards are tabs; select a subject, then a topic, then a quiz or deck, then a record. **New topic** under a subject creates a topic; topics are shared by both tabs. Item and card lists show 25 per page with search by text or ID.
- Single records have Edit, Preview and JSON views over one JSON draft. Forms patch only intentional edits and preserve untouched strings, optional presence and order. Existing IDs, relationships and source answers are read-only in forms; corrections use JSON.
- **Manage subjects** edits a shared subject from either tab without discarding other unsaved text.
- Batch adds take content-only JSON and no IDs. A new topic (under the selected subject) uses `topic.name` (optional `topic.description`) and `quizzes` (each with `name`, optional `description` and `items`); adding to a topic uses `quizzes` (same shape); adding to a quiz uses `items`. An item has `stem`, `choices` (strings, labels assigned A to Z, at most 26), `answer` (`A`, `B`, ...), `rationale`, and optionally `verifiedAnswer`, `answerNote`, `rationaleMeta`, `choiceExplanations`, `pearls`, `metadata`. Flashcard batches use `{ "cards": [...] }` for a deck (`front`, `back`, optional `sources`, `reviewNote`) or `{ "decks": [...] }` for a topic (`name`, optional `description`, `cards`). A bulk request creates up to 1,000 children of one parent; the editor sends the topic, each quiz or deck and each bulk of questions or cards as separate requests, so a failure part-way keeps what was already saved and says so.

```json
{
  "topic": { "name": "Pearls" },
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

- **Save** sends one create or patch for the open record and shows the record the server returns; nothing is saved until then. Another editor's change to the same record returns a version conflict: the editor keeps your text, shows the server's copy, and lets you keep your text (written over the server version) or take the server version. Server validation problems are listed with their field paths and never discard text.
- **Delete** shows the affected records (computed from the loaded draft) and sends a cascading delete per selected record. Move up and Move down reorder a record among its siblings; editing a record's parent ID in JSON moves it to another parent.
- **More > Changes** lists recent draft changes; **Revert** restores one record to its state before that change and is itself recorded. Reverting a deleted parent restores only that record; its children are separate changes. **Discard unpublished changes** resets the draft to the active release.
- **Publish** creates a new immutable release from the draft and activates it; retained releases can be activated again (activation keeps the draft). Browser attempts that reference deleted content may become inaccessible.
- **Export paired ZIP** exports the draft (marked unpublished) or a retained release.

## Record API and publication

The draft lives in per-record tables (`content.draft_subjects`, `draft_topics`, `draft_quizzes`, `draft_questions`, `draft_decks`, `draft_flashcards`) ordered by a global `position`. All routes are under `/api/admin/draft` and need a session, exact Origin and the CSRF header; publish, discard, activate and export also need a factor from the last 15 minutes.

- `GET /api/admin/draft` returns every record by kind in order, each with its `version`, plus `changed` (draft differs from the active release) and the latest change ID.
- Kinds are `subjects`, `topics`, `quizzes`, `questions`, `decks`, `cards`. `POST /{kind}` creates (`parentId`, optional `afterId`), `PUT /{kind}/{id}` patches fields, `DELETE /{kind}/{id}` deletes (`cascade` for parents with children), `POST /{kind}/{id}/move` changes parent or place. Every change except create sends `expectedVersion`; a stale version returns 409 with the current record. `POST /quizzes/{id}/questions/bulk` and `/decks/{id}/cards/bulk` create up to 1,000 children in one transaction.
- Every write is one transaction: it validates the record with the shared content policy (on the record plus its ancestors), bumps `version` and appends a row to `content.draft_changes` with before/after JSON. A rejected write changes nothing. `GET /changes?since=` lists history; `POST /changes/{id}/revert` restores a record's earlier state; changes recorded before migration `0009_topics` cannot be reverted (`change_obsolete`).
- `POST /discard` replaces the draft with the active release. `POST /publish` builds both documents from the draft, validates the full pair and stores and activates an immutable release; an unchanged draft is a no-op. Documents are serialized exactly like release artifacts, so an unchanged draft is byte-identical to its release.
- Bodies are limited to 1 MiB (16 MiB for bulk). JSON limits: depth 32, arrays 32,768, object fields 64, strings and keys 65,536 bytes. Explicit `null` (except to remove a field in a patch), unknown fields, duplicate or dangerous keys, non-finite numbers, invalid UTF-8, lone surrogates and NUL are rejected. Limits live in `src/content/validation/authoringLimits.json`.
- Rich-content validation runs a packaged Node worker (2 concurrent, 120 s, 512 MiB heap) with the same remark, GFM, math and parse5 rules as the frontend. Diagnostics report at most 200 errors with field paths (`$.record...`, `$.records[n]...` for bulk) and never echo authored values. Raw HTML tokens are checked before tree repair; image dimensions are positive and at most four digits; KaTeX expansion is bounded (1,000) and trusted extensions are rejected. Image URLs allow only app-local paths or configured HTTPS origins; `VITE_CONTENT_IMAGE_ORIGINS` is the public allowlist and API validation currently permits local images only.
- Retry limits for the learner are 0 to 5 with delays of at most 30 seconds (`.env.example`).

## Local source material

Git tracks only application assets. Root `content/` (historical extraction and review files) and `tn-pdfs/` (original PDFs) are ignored, are not read by the app and are not part of any database backup; retain them separately if provenance matters. Tracked media under `public/content/` must have an explicit publishing workflow; record new media URLs and lifecycle in the content change. Build and test output (`dist/`, browser results, virtual environments) is ignored.

## Maintenance tools

Stored contracts live in `src/content/schema`, validators in `src/content/validation`, sanitization and math policy in `src/content/richText`, delivery in `src/content/api`. Future schema changes need candidate and parity validation against a fresh export.
