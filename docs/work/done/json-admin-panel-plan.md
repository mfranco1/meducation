# JSON question-bank admin panel plan

## Completion (2026-09-23)

Implemented a separate `/admin.html` local-development entry with a plain JSON single-record editor and atomic bulk change-set editor. The shared admin core validates change sets and final schema-v4 banks, preserves canonical ordering, requires explicit cascade deletes, computes SHA-256 snapshot revisions, stages changes in memory, supports undo/reset, and downloads both the deterministic replacement bank and companion change set. The learner `QuizRepository` remains read-only, and the production admin entry renders disabled unless explicitly enabled at build time.

Added operation-core fixture tests and updated the architecture, content-management, schema, and testing documentation. Verification passed: `npm test` (including 4 admin-core tests), `npm run validate:content` (10,196 questions and 98 quizzes with the existing 32 review warnings), `npm run audit:explanations`, `npm run build`, and `git diff --check`.

## Objective

Add a separate, local-only admin panel for creating, editing, and deleting subjects, quizzes, and questions (called “items” in the admin UI). Keep authoring JSON-first: the panel provides navigation, a plain JSON editor, validation, impact previews, and deterministic export rather than a field-heavy content-management GUI.

Support both one-record changes and atomic bulk changes. Preserve the current schema-v4 canonical bank, stable IDs, question ordering, answer provenance, Markdown rules, and the learner application's read-only `QuizRepository` boundary. Do not add a backend, runtime AI, or production authentication in this task.

The current bank contains 12 subjects, 98 quizzes, and 10,196 questions in `src/content/questionBank.generated.json`. Despite its filename, that file is the authoritative authoring source and must remain the only committed question bank after this feature is added.

## Product decisions

### Separate admin entry point

- Add a Vite multi-page entry at `/admin.html`, with its own `src/admin/main.tsx` and admin component tree. Do not add admin routes or admin state to the learner application.
- Keep the existing `/#content-qa` screen read-only. It may link to the admin entry in development, but it should not become the editor.
- Enable the panel in local development. A production build must keep it disabled unless an explicit admin-build flag is set. This is exposure control, not authentication; real authentication and authorization belong to the future backend task.
- Reuse the existing Material UI theme and small shared presentation components where useful, but do not couple admin state to learner screens.

### Browser-safe save model

A normal browser cannot reliably rewrite a checked-in source file. The first version therefore uses this workflow:

1. Load the bundled canonical bank as the base snapshot.
2. Stage edits in memory without changing learner data or `localStorage` attempts.
3. Validate and preview the entire resulting bank.
4. Download a deterministically serialized replacement named `questionBank.generated.json`.
5. Download the applied change set as a companion review/audit artifact.
6. Replace the repository file through the normal code-review workflow, then run the repository checks.

Do not pretend that a browser download has saved the repository. Show a persistent “not exported” state and a clear final instruction. A later backend adapter will replace the in-memory/export adapter; the admin UI and change-set semantics should remain usable.

### JSON-first interaction

Use a simple three-area layout rather than individual form controls for every schema field:

- A searchable subject → quiz → item navigator with entity counts and stable IDs.
- A monospaced multiline JSON editor using an existing Material UI input; do not add Monaco or another large editor dependency initially.
- A validation and change-summary area showing errors, warnings, creates, updates, deletes, moves, and cascade impact.

Provide two modes:

- **Single change:** selecting an entity loads its complete stored JSON. “New” inserts a valid template with a suggested unused compact ID. Applying an edit or confirming a delete creates one operation in the staged change set.
- **Bulk change:** the admin pastes or imports a JSON change-set document containing any number of operations. The whole batch is parsed, previewed, and applied atomically.

The single-change mode must call the same command processor as bulk mode. It is only a convenience layer, not a second CRUD implementation.

## Change-set contract

Define transport-neutral TypeScript types under `src/admin/core/`; keep them free of React, browser APIs, and the concrete JSON import. Version the change-set format independently from the question-bank schema.

An illustrative document is:

```json
{
  "changeSetVersion": 1,
  "base": {
    "bankSchemaVersion": 4,
    "revision": "sha256-of-canonical-base"
  },
  "reason": "Add the first cardiology review quiz and retire a duplicate item",
  "operations": [
    {
      "op": "quiz.create",
      "value": { "id": "q99", "subjectId": "s3", "name": "Cardiology Review" },
      "afterId": "q20"
    },
    {
      "op": "question.create",
      "value": {
        "id": "i10197",
        "quizId": "q99",
        "stem": "Question stem",
        "choices": [
          { "id": "A", "text": "Choice A" },
          { "id": "B", "text": "Choice B" }
        ],
        "answer": "A",
        "rationale": "Rationale"
      }
    },
    {
      "op": "question.delete",
      "id": "i400"
    }
  ]
}
```

Supported operations:

- `subject.create`, `subject.update`, `subject.delete`
- `quiz.create`, `quiz.update`, `quiz.delete`
- `question.create`, `question.update`, `question.delete`

Rules for the contract:

- Create and update operations carry complete stored entities, not partial patches. An update's `value.id` must equal its target ID. This keeps JSON review self-contained and avoids ambiguous merge semantics.
- The operation list is ordered. The processor applies it to a clone in listed order, validates the final bank, and either accepts every operation or none of them.
- Bulk add, update, and delete are represented by multiple operations in one document. Do not create separate code paths for each bulk verb.
- `afterId` is optional and is valid only for an entity in the same collection or parent. Without it, a subject or quiz is appended to its collection and a question is appended to its quiz. Existing entities retain their position unless explicitly moved.
- Changing a quiz's `subjectId` or a question's `quizId` is a move. With no valid `afterId`, it appends within the destination parent.
- Parent deletes default to non-cascading and fail when children exist. `cascade: true` is required to delete a subject with quizzes/questions or a quiz with questions. The preview must list exact affected counts and IDs before confirmation.
- Stable IDs are never renamed. A rename is modeled as create plus explicit delete and must receive the same destructive warning; the UI should not encourage this.
- A local ID helper may suggest the next unused `sN`, `qN`, or `iN`, but validation—not the suggestion—remains authoritative. Keep numeric-ID parsing isolated so a future backend can allocate opaque IDs.
- `reason` is required for an exported change set. It documents intentional content changes without adding audit-only fields to canonical learner records.
- `base.revision` is a SHA-256 fingerprint of deterministic canonical serialization. Reject a change set made against another base instead of silently applying stale edits. This maps cleanly to an API version/ETag later.

## Architecture

### Pure admin core

Add a framework-independent core with responsibilities split by behavior rather than UI screen:

```text
src/admin/
  core/
    types.ts                 # snapshots, revisions, operations, results
    changeSetSchema.ts       # runtime parsing of change-set JSON
    applyChangeSet.ts        # immutable, atomic operation processor
    impact.ts                # cascade/move/change summaries
    serializeBank.ts         # deterministic JSON and SHA-256 input
    templates.ts             # new-entity JSON with suggested IDs
  data/
    AdminQuestionBankGateway.ts
    InMemoryQuestionBankGateway.ts
  components/
  AdminApp.tsx
  main.tsx
admin.html
```

Exact filenames may be consolidated when a module would only forward one function. Keep these boundaries:

- The operation processor knows the stored schema and hierarchy but not React, downloads, or the imported singleton bank.
- The gateway owns snapshot/revision/load/apply behavior. The local implementation stages an in-memory bank. A future authenticated HTTP implementation can use the same interface and expected-revision behavior.
- Export is an adapter concern. The canonical serializer must not depend on browser download APIs.
- The learner-facing `QuizRepository` stays read-only. Do not add mutation methods to it merely to support administration.

A suitable asynchronous boundary is conceptually:

```ts
interface AdminQuestionBankGateway {
  load(): Promise<AdminBankSnapshot>;
  preview(changeSet: AdminChangeSet): Promise<AdminChangePreview>;
  apply(changeSet: AdminChangeSet): Promise<AdminBankSnapshot>;
}
```

The local gateway can resolve immediately, but the UI must treat it as asynchronous so moving to an API does not require redesigning event flow.

### Runtime schema and validation

Strengthen validation before making the editor writable. TypeScript casts alone do not validate pasted JSON.

- Add runtime parsing for a stored bank, each stored entity, and the change-set envelope. Prefer a small explicit validator consistent with the existing code unless a measured implementation shows that a portable JSON Schema validator meaningfully reduces complexity.
- Refactor current validation so CLI validation, Content QA, admin previews, and export all call the same pure final-bank validation entry point.
- Validate required and unknown fields, primitive types, compact unique IDs, foreign keys, canonical collection ordering, contiguous questions by quiz, unique choice IDs, answer and verified-answer references, sparse metadata rules, provenance requirements, and Markdown safety.
- Validate positional commands and operation conflicts with operation-indexed errors so an admin can find the failing JSON entry.
- Preserve warnings separately from errors. Existing answer-review warnings do not block export; any structural, referential, provenance, or Markdown error does.
- Never normalize or “fix” stems, choices, answers, rationales, Markdown, or medical terms during parsing or serialization.

### Ordering and deterministic output

- Preserve untouched subject and quiz array order exactly.
- Preserve untouched per-quiz question order exactly. Questions remain grouped contiguously by quiz in the top-level array because their position is the learner display number and future database position.
- A question create or move is inserted only in its target quiz segment. A quiz move changes its parent reference and requested relative position without renaming it.
- Serialize with one documented indentation/newline policy and a trailing newline. Repeated export of an unchanged staged bank must be byte-identical.
- Compute revisions from that canonical serialization, not from browser object key iteration or formatted editor text.

## Safety and review behavior

- Keep edits staged until the admin explicitly applies a valid operation or batch. Keep export separate from apply.
- Provide reset-to-bundled-bank and undo-last-applied-batch actions. Warn before discarding unexported work and on page unload while dirty.
- Show a before/after summary by stable ID. For updates, show changed JSON paths without reformatting or rewriting unchanged values.
- Require a second confirmation for cascade deletes and show the subject/quiz/question IDs affected. Never infer cascade from a missing parent.
- Do not mutate or purge current-browser attempts when content is deleted. Warn that hard-deleted quizzes/questions can leave old attempt records inaccessible. Production archival/retention policy is deferred to the backend transition.
- Export the resulting full bank and the complete ordered change set. Do not export a partially valid bank.
- Imported full-bank JSON may be offered as a recovery/review path, but it must go through the same whole-bank validator and diff preview. It must not bypass change-set auditing for normal edits.
- No LLM calls, auto-generated rationales, automatic medical corrections, or silent answer changes.

## Implementation phases

### 0. Record the baseline and fixtures

1. Record the schema version, entity counts, canonical file checksum, ordered IDs per collection/quiz, and current validation warnings.
2. Run `npm run validate:content`, `npm test`, `npm run build`, `npm run audit:explanations`, and `git diff --check`.
3. Add small stored-bank fixtures covering nested dependencies, reviewed answers, Markdown, sparse metadata, and canonical quiz ordering. Do not use the 14 MB production bank for every operation-unit test.

**Gate:** the current bank is valid, its learner-visible data is unchanged, and the fixtures represent the risky invariants.

### 1. Build the runtime schemas and atomic mutation core

1. Define and parse change-set version 1 and all nine operation kinds.
2. Implement immutable create, update, move, delete, explicit cascade, and relative insertion behavior.
3. Refactor final-bank validation into a shared pure path and add operation-indexed diagnostics.
4. Implement deterministic serialization, revision calculation, impact summaries, and changed-path diffs.
5. Unit-test every operation for success and failure, including mixed batches, stale revisions, duplicate IDs, invalid foreign keys, invalid answers, ordering, rollback on the last failing operation, and cascades.

**Gate:** the core can apply a valid mixed batch without React or browser APIs; invalid batches leave the input snapshot byte-for-byte unchanged.

### 2. Add the local admin gateway and export workflow

1. Implement the asynchronous gateway around a cloned canonical snapshot.
2. Track base revision, current revision, applied batches, dirty/exported state, and undo history for the current session only.
3. Add deterministic downloads for the full canonical bank and companion change set.
4. Verify that loading and immediately exporting produces a byte-identical bank.

**Gate:** a staged snapshot can be edited, undone, validated, exported, and re-imported with no semantic or ordering drift.

### 3. Build the separate JSON admin UI

1. Add `admin.html`, the admin React entry, and Vite multi-page configuration without changing learner navigation.
2. Build the searchable hierarchy and summary counts. Render only the visible/selected branch; do not mount 10,196 item rows or editors at once.
3. Build single-change JSON editing with new templates, validation, apply, delete preview, and delete confirmation.
4. Build bulk change-set paste/import with parse diagnostics, final-bank preview, and atomic apply.
5. Add changed-path/impact panels, warning/error filters, undo/reset, dirty-state protection, and export actions.
6. Cover keyboard labels, focus after errors, screen-reader status announcements, narrow layouts, and large JSON text behavior.

**Gate:** an admin can perform every CRUD verb for every entity type, both singly and in one mixed bulk batch, using JSON as the authored input.

### 4. Enforce local-only exposure and document the workflow

1. Default the admin entry to development-only and document the explicit build flag if a private static admin build is needed. Do not describe this as secure access control.
2. Update `docs/architecture.md`, `docs/content-management.md`, `docs/question-schema.md`, and `docs/testing.md` with the implemented admin boundary, change-set contract, export/replace steps, and checks.
3. Document review guidance for stable IDs, destructive changes, answer provenance, and companion change-set retention.
4. Keep backend endpoints, user accounts, roles, databases, and deployment authorization out of this task.

**Gate:** a new maintainer can make and review a safe edit without learning implementation internals or accidentally editing learner state.

### 5. End-to-end verification

1. On a disposable snapshot, create and edit a subject, create and move a quiz, create/edit/move/delete questions, perform explicit cascade deletes, undo, reapply as bulk, and export.
2. Run the exported bank through the CLI validator and compare the UI diagnostics with CLI results.
3. Temporarily use the exported file in a test/build checkout and verify learner listing, quiz order, scoring, and Markdown rendering; do not overwrite the real canonical bank during automated tests.
4. Test malformed JSON, unknown operations/fields, stale revisions, duplicate IDs, orphan references, bad answers, unsafe Markdown, a failing final operation, reload with dirty edits, and large bulk batches.
5. Run `npm run validate:content`, `npm test`, `npm run build`, `npm run audit:explanations`, and `git diff --check`.

**Gate:** all checks pass, the unedited bank round-trips byte-identically, invalid changes cannot be exported, and the learner app has no admin-code dependency.

## Future backend mapping

The production transition is deliberately separate, but this design leaves explicit seams:

- Replace `InMemoryQuestionBankGateway` with an authenticated HTTP gateway; keep the admin components and operation documents.
- Map the snapshot revision to an API version or ETag and reject stale writes with optimistic concurrency.
- Execute each change set as one database transaction and write its `reason`, actor, timestamp, before revision, and after revision to an audit log.
- Allocate IDs server-side when the production identifier strategy changes; keep existing IDs stable.
- Store question position explicitly in the database while presenting the same ordered JSON/domain view.
- Enforce referential integrity and decide whether UI “delete” becomes archive/soft-delete. Do not make that policy silently in the local tool.
- Add real identity, admin roles, CSRF protection, authorization checks, backups, and recovery before enabling remote writes.
- Keep validation on the server even if the browser already previewed the same change set.

## Explicit non-goals

- No backend, API server, database, ORM, cloud storage, or deployment work.
- No production authentication or claim that a hidden URL/build flag is security.
- No field-by-field WYSIWYG content forms, rich Markdown editor, drag-and-drop hierarchy, or collaborative editing.
- No learner-facing content or schema migration, medical-content correction, ID regeneration, or automatic reordering.
- No runtime generative AI.
- No direct edits to attempt history or automatic cleanup of orphaned historical attempts.

## Completion criteria

- `/admin.html` is a separate, local-only JSON admin application and the learner bundle remains independent of its UI and mutation code.
- Subjects, quizzes, and questions can each be created, fully edited, moved where applicable, and deleted through single or atomic bulk JSON changes.
- Stable IDs, source/verified answers, choice order, Markdown, rationale metadata, sparse metadata, relationships, and question order are validated before apply and export.
- Parent deletion requires an explicit, previewed cascade; invalid or stale batches never partially apply.
- An untouched bank round-trips byte-for-byte, and every valid export is deterministic and accompanied by its change set.
- The mutation gateway is asynchronous and transport-neutral so a later authenticated API adapter can replace the local implementation without redesigning the admin UI.
- Documentation and all repository validation, tests, audit, build, and diff checks pass.
- Move this tracker to `docs/work/done/` only after the feature and documentation are implemented and verified.
