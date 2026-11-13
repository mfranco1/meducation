# Content management

Edit records in the draft through the authenticated HTTP editor, then publish explicitly. Saving a record never publishes. Exports are inspection and recovery artifacts, never a source. The rules for canonical content are in [AGENTS.md](../AGENTS.md#content-invariants), the contracts in [question schema](question-schema.md) and [flashcard schema](flashcard-schema.md), and setup and jobs in [operations](operations.md).

## Editing rules

1. The server assigns IDs when a record is created and never reuses them. Display numbers derive from position; do not store them.
2. Put the explanation of the correct answer, including why other choices are wrong, in the `rationale`, and sources in `rationaleMeta.sources`.
3. Validate before relying on content. For the live database, export the draft or a release and run `validate-export` and `audit-export`. For fixtures, run `npm run validate:content -- <quiz-file> <flashcard-file>`. File checks cannot establish live currency.

## Editor workflow

Open `/admin.html`. Quizzes and Flashcards are tabs over shared subjects and topics.

- Names are unique within their parent, ignoring case and surrounding spaces: subjects overall, topics within a subject, quizzes within a topic and decks within a topic (a quiz and a deck may share a name). A create, rename, move or revert that would duplicate a name is rejected.
- A record has Edit, Preview and JSON views over one JSON draft. Forms patch only intentional edits and preserve untouched strings, optional presence and order. IDs and relationships are read-only in forms; editing a record's parent ID in JSON moves it.
- **Save** sends one create or patch for the open record. A change made elsewhere to the same record returns a version conflict: the editor keeps your text beside the server's copy and lets you choose. Validation problems are listed with field paths and never discard text.
- **Delete** cascades to children after showing the affected records.
- **More > Changes** lists recent draft changes. **Revert** restores one record to its state before that change and is itself recorded; reverting a deleted parent restores only that record, not its children. **Discard unpublished changes** resets the draft to the active release.
- **Review & publish** lists the records that differ from the published version. **Publish** creates an immutable release from the draft and activates it. Browser attempts that reference deleted content may become inaccessible.
- **Export paired ZIP** exports the draft or a retained release. It is not a backup.

### Bulk add

Bulk adds take content-only JSON with no IDs; the editor's Add view shows a template with every optional field.

- Quizzes: `{ "topics": [...] }` under a subject, `{ "quizzes": [...] }` under a topic, `{ "items": [...] }` in a quiz. Topics and quizzes have `name` and optional `description`. An item has `stem`, `choices` (strings, lettered A to Z by position), `answer` (a letter), `rationale` and optional `rationaleMeta`, `pearls` and `metadata`.
- Flashcards: `{ "topics": [...] }`, `{ "decks": [...] }` or `{ "cards": [...] }` in the same way. A card has `front`, `back` and optional `sources`.
- A topic, quiz or deck whose name matches an existing sibling receives the new children instead of being created again; its own fields are left unchanged.
- One request creates up to 1,000 children of one parent. The editor sends each parent and each bulk separately, so a failure part-way keeps what was already saved and says so.

### Release retention

Publish keeps the active release, the draft's base and the most recently active other release; that one can be activated again. Every other release is pruned: its history row stays, its content is deleted, and it cannot be activated or exported. Older versions come from database backups. The API does not start until a release at the current schema is active, so after a schema upgrade publish with `meducation-db publish-draft`, then start the API.

## Agent authoring

The `write-quizzes` skill (`.agents/skills/write-quizzes/`) writes new quizzes and stages them in the draft with `meducation-db stage-quizzes`, through the same validation, versions and change history as the editor. Staging never publishes; review and publish in the editor.

## Record API and publication

Routes are under `/api/admin/draft` (`backend/src/meducation_api/admin/http.py`; the API serves `/docs` in local mode).

- Every route needs a session, exact Origin and the CSRF header. Publish, discard, activate and export also need a recent authentication factor.
- Every change except create sends `expectedVersion`; a stale version returns 409 with the current record. A duplicate name returns 409 `duplicate_name`.
- Every write is one transaction: it validates the record with the shared content policy, bumps `version` and appends a change row with before and after JSON. A rejected write changes nothing.
- Publish validates the full pair, stores and activates a release and prunes older ones in one transaction. An unchanged draft is a no-op, because draft and release documents are built identically.
- Body and JSON limits live in `src/content/validation/authoringLimits.json`. Explicit `null` (except to remove a field in a patch), unknown fields and duplicate keys are rejected.
- Rich-content validation runs a packaged Node worker with the same rules as the frontend. Diagnostics give field paths and never echo authored values.

## Local source material

Git tracks only application assets. Root `content/` (historical extraction and review files) and `tn-pdfs/` (original PDFs) are ignored, are not read by the app and are not in any database backup; retain them separately. No content media is tracked yet; app-local image paths such as `/content/figures/...` would be served from `public/content/`, and adding media needs an explicit publishing workflow.

Schema changes need candidate and parity validation against a fresh export.
