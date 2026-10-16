# Content management

PostgreSQL is the sole writable paired content authority. Use the authenticated HTTP editor to preview and durably save drafts, then explicitly review/publish a paired release. Reset/Undo change drafts; retained-release activation preserves later content and allocation history. Export current draft/release context and run `validate-export`/`audit-export`. Explicit paired-file checks are for captured exports or synthetic fixtures; they cannot establish current database currency. Trusted file import is restricted to reviewed recovery/migration. See [the recovery runbook](L4-authoritative-recovery.md).

The designated local PostgreSQL database stores schema-v4 quiz content and the
shared subject catalog, paired with schema-v2 flashcard decks/cards. Decks
reference existing subject IDs directly; do not recreate subjects in the flashcard
bank. Read [the question schema](question-schema.md) and
[flashcard schema](flashcard-schema.md) before changing stored content.

## Editing content

The authenticated editor is the only normal CRUD workflow. Local JSON fixture
authoring, change-set file import/replay, per-section file replacement exports,
and browser-local content history have been removed. Repository JSON databases are removed. Captured database exports are inspection/recovery artifacts, not a runtime source.

When editing content:

1. Preserve established subject, quiz, and question IDs, canonical question ordering, and choice IDs. Subject IDs use `s*`, quiz IDs use `q*`, and question IDs use `i*`. Question display numbers are derived from one-based position within a quiz; do not add a stored question number.
2. Make intentional question, choice, answer, stem, or rationale changes directly in the matching record. Stems and rationales support GFM, the limited HTML documented in `question-schema.md`, and KaTeX math. Use `$...$` for inline formulas and a separate-line `$$` block for display formulas. Escape ambiguous literal money with `\$`; the validator catches malformed or unsupported math. Use meaningful alt text for every image. Use app-local paths such as `![Nerve diagram](/content/figures/nerve.png)` today; a future remote HTTPS image origin requires the public `VITE_CONTENT_IMAGE_ORIGINS` allowlist and matching trusted backend validator configuration before canonical authoring. `CONTENT_IMAGE_ORIGINS` configures maintenance validators, not API runtime configuration. Choices, choice explanations, and sources remain restricted Markdown.
3. Keep answer provenance explicit: retain `answer`, add `verifiedAnswer` only after review, and use `answerNote` or `rationaleMeta.answerReviewNote` when a key is uncertain. Do not add `sourceAnswer` or `answerSource`; verification state is derived from whether a verified answer exists.
4. Keep provenance, sources, review data, and answer-review notes in `question.rationaleMeta`; do not create a second explanation body or JSON overlay. The application never calls an LLM at runtime.
5. For fixture changes run `npm run validate:content -- <quiz-file> <flashcard-file>`, `npm test`, and `npm run build`. Canonical HTTP changes instead require a fresh selected export and its validation/audit; repository archive checks cannot certify the live database.

## Authenticated paired editor

Open `/admin.html` with the [local authoring service](local-authoring.md) running.
The quiz editor offers **Record** and **Add** modes; both sections use labelled
**JSON** content fields. Navigators grow to fit the controls and bound only the
record list. Flashcards browse by subject/deck, search front/back/ID, and show up
to 25 cards per page.

Bulk flows require **Preview**, followed by **Save draft**. Changing text,
destination, reason, or server context invalidates the preview. New IDs come from
owned server reservations; the complete valid pair saves in one transaction.
Unsaved record text is protected when changing context or leaving the page and
remains mounted across section switches. Failed writes preserve text and never
fall back to local storage.

**Undo saved batch** and **Reset paired draft** operate on PostgreSQL history.
Saving, undo, and reset do not publish. Shared-subject deletion reviews its quiz
and flashcard cascades, asks before discarding hidden drafts, and commits one
paired revision. Explicit publication makes the reviewed pair available to
learners. **Export paired ZIP** exports a captured database draft/release for
inspection or recovery; it is not a repository-file replacement workflow or a
full database backup.

The bulk editor provides three context-specific shapes. Creating a new subject uses `subject.name` and a `quizzes` list; each quiz has a `name` and an `items` list. Adding quizzes to a selected subject uses only `quizzes`. Adding items to a selected quiz uses only `items`. Each item contains `stem`, a compact list of choice text strings, an answer label (`A`, `B`, …), and `rationale`. Optional editable fields are `verifiedAnswer`, `answerNote`, `rationaleMeta`, `choiceExplanations`, `pearls`, and `metadata`. Choice labels are assigned in list order, up to 26 choices. No IDs, parent IDs, operation names, schema versions, base revisions, or change-set envelopes belong in this draft.

In quiz **Add**, choose **Add quizzes**, then select the existing subject. Add one entry to `quizzes` for every new quiz; each entry needs a non-empty `items` array, so a single batch can add any number of quizzes with any number of items in each. Choose **Add items**, then select the subject and existing quiz, to use the `items` shape and append any number of items to that quiz. Changing either destination replaces the current draft and requires previewing again.

Example content-only draft for a new subject and quiz:

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

The workspace reason is recorded with the paired save. Choose **Preview**, inspect reserved IDs and validation feedback, then choose **Save draft**. The server owns durable ID reservations; the panel assigns choice labels from array order and the default subject accent. Add more quizzes as entries in `quizzes`, and more questions as entries in each quiz's `items` list. Editing the draft, changing the destination, or changing the current snapshot invalidates the preview.

The shared header provides PostgreSQL draft history and database-derived exports.
Deletion review lists complete affected counts and pages through record identities.
Saved browser attempts and checkpoints remain stored, but references to deleted
content may become inaccessible. Use parent or record actions to delete a quiz,
deck, item, or card; parent deletion requires explicit cascade review.

## Local source material and generated output

The former repository quiz/flashcard JSON databases and frontend local adapters
are removed. PostgreSQL and protected recovery artifacts preserve current
content. Never import an old snapshot over database-only edits.

Other content folders are intentionally ignored by Git and are not included in a clone or Git-based backup:

- Root `content/` contains historical extracted records and review reports, plus historical `content/explanation-audit.json` output. The implicit repository audit command has been removed; use a fresh selected database export and `audit-export` for a current report. historical extraction/review material has no current tracked regeneration pipeline, so retain it separately if needed for provenance or future source review.
- `tn-pdfs/` holds private original PDF sources and ancillary material. Current runtime code does not read it. Keep an appropriate separate backup before moving or deleting these files; a canonical bank does not replace its source documents.

`public/` contains tracked assets copied into production builds. The unused legacy question-bank manifest and quiz shards formerly under `public/content/` were removed after the owner confirmed they had no external consumers. The frontend reads the PostgreSQL-backed API; do not recreate a parallel manifest/shard store. New media under `public/content/` is trackable and must follow the reviewed asset workflow below.

New runtime media referenced by canonical rich content should have an explicit tracked asset or publishing workflow, rather than being placed among ignored historical extraction files. Record its URL and lifecycle in the reviewed content change.

Build/test outputs (`dist/`, coverage, browser results), virtual environments, Python caches, and `*.egg-info/` package metadata are also ignored. They can be regenerated through the documented install, build, and test workflows. Back up irreplaceable private sources and review history separately; Git protects only tracked files.

## Read-only content API

The [paired-release design](decisions/0005-paired-content-releases-and-postgres-schema.md) defines normalized paired releases, deterministic exports and durable ID allocation. Packaged head `0006_allocation_fence` includes authenticated draft/history/publication operations and protected allocation admission. Both learner adapters read one request-pinned published PostgreSQL release; publication changes subsequent requests without restart. HTTP paired authoring owns normal edits. The [trusted operator file workflow](../backend/README.md#paired-content-import-activation-and-export) is for reviewed recovery/migration: capture and validate selected files, import without activation, explicitly activate with a publication precondition, then independently export/compare. It never replaces database-only work with a repository archive. The [isolated parity/recovery workflow](../backend/README.md#actual-bank-parity-and-isolated-recovery-acceptance) uses disposable fixtures and does not certify that repository archives equal today's authority.

JSON service mode is removed. Published reads always use PostgreSQL and fail
closed on database errors. Stored models, deterministic exports, and reviewed
recovery imports remain; JSON cannot select a runtime database. Learner
answering/scoring/checkpoints and history remain browser-local.

Follow [frontend setup](../README.md#install-and-run) for default API delivery, [API delivery](../README.md#api-content-delivery) for learner setup, and [local editor setup](../README.md#local-content-editor) for authoring entry/build flags. [Architecture](architecture.md#content-api-and-loading) owns request caching and recovery behavior; [.env.example](../.env.example) lists retry defaults. Retry limits must be 0–5; delays must be positive and at most 30 seconds, with the base no greater than the cap. Restart Vite or rebuild after changing these build-time settings. API mode needs the service when fetching content that is not already loaded. Answering, scoring, checkpoints, completion, and history remain in the browser.

## Maintenance tool ownership

`npm run validate:content -- <quiz-file> <flashcard-file>` checks explicitly
selected files for structure, shared-subject relationships and rendering policy.
It has no default repository database and does not verify live currency or export
identity. CI passes small synthetic fixture paths explicitly. For current content,
prefer `validate-export` and `audit-export`, which also check the captured export's
manifest and identity. The old implicit explanation audit command is removed.
Stored contracts live under `src/content/schema`, validators under
`src/content/validation`, and shared sanitization/math policies under
`src/content/richText`. Runtime API delivery lives under `src/content/api`.

The schema-v1 flashcard migration CLI and legacy import/read paths have been retired after the owner verified that backward compatibility is no longer needed. Routine authoring file imports have also been retired. Future schema changes still require deliberate candidate/parity validation.

L4 Step 6 adds explicit selected-export validation/audit commands for operator
release directories and extracted HTTP draft/release ZIPs. They verify captured
bytes, content revisions and (for HTTP exports) ordered identity inventories,
then run paired content policy checks. Reports retain selected publication or
unpublished draft context and do not claim current database currency. The npm validator checks only explicitly selected file paths. Follow [the authoritative recovery preparation runbook](L4-authoritative-recovery.md#explicit-export-validation-and-audit).
These tools do not change canonical authority or replace a retained full backup.
