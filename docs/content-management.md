# Content management

`src/content/questionBank.generated.json` is the canonical content store for the application. It is a schema-v4 JSON database containing compact subject, quiz, and question identifiers, final choice text, answer provenance, display-ready GFM stems and rationales, rationale metadata, and answer-review notes.

Flashcard content lives in the separate schema-v2 `src/content/flashcardBank.generated.json` file. Read [the flashcard schema](flashcard-schema.md) before editing it. Decks reference existing subject IDs directly; do not copy or recreate subjects in the flashcard bank. `npm run validate:content` checks both banks and their shared-subject references. The local-only Flashcards section in `/admin.html` stages single-record edits and bulk JSON additions for cards, decks, or decks with nested cards. All additions are previewed and staged atomically in memory; the editor exports the bank plus a reasoned version-2 change set. It does not write repository files or provide access control. Review exports before replacing the canonical file and restart the content service after replacement.

Flashcard staging and replay use the same structural, Markdown/HTML/image/math validation as canonical validation. Duplicate sibling names are warnings; IDs remain authoritative. Unstaged record edits are protected when changing selection or leaving the page. Export retains the staged workspace: use Reset or Undo before importing another change set. Undo and reset in either authoring section refuse to create dangling shared-subject references.

When quiz changes are also staged, exporting from Flashcards downloads both canonical banks, both operation change sets, a replacement manifest, and `content-change-set-bundle.json`. Import that bundle through Flashcards to preview and stage the final pair atomically. This allows moving decks to another subject together with removing their old subject without an invalid intermediate state. Start paired imports from reset workspaces; stale base/result revisions or invalid final references reject the entire pair. Review the paired quiz operation preview as well as the resulting flashcard bank before staging. Keep canonical bank replacements together and restart the read-only content service afterwards.

When editing content:

1. Preserve established subject, quiz, and question IDs, canonical question ordering, and choice IDs. Subject IDs use `s*`, quiz IDs use `q*`, and question IDs use `i*`. Question display numbers are derived from one-based position within a quiz; do not add a stored question number.
2. Make intentional question, choice, answer, stem, or rationale changes directly in the matching record. Stems and rationales support GFM, the limited HTML documented in `question-schema.md`, and KaTeX math. Use `$...$` for inline formulas and a separate-line `$$` block for display formulas. Escape ambiguous literal money with `\$`; the validator catches malformed or unsupported math. Use meaningful alt text for every image. Use app-local paths such as `![Nerve diagram](/content/figures/nerve.png)` today; add a future S3 or CloudFront HTTPS origin to both `VITE_CONTENT_IMAGE_ORIGINS` and `CONTENT_IMAGE_ORIGINS` before referencing it in canonical content. Choices, choice explanations, and sources remain restricted Markdown.
3. Keep answer provenance explicit: retain `answer`, add `verifiedAnswer` only after review, and use `answerNote` or `rationaleMeta.answerReviewNote` when a key is uncertain. Do not add `sourceAnswer` or `answerSource`; verification state is derived from whether a verified answer exists.
4. Keep provenance, sources, review data, and answer-review notes in `question.rationaleMeta`; do not create a second explanation body or JSON overlay. The application never calls an LLM at runtime.
5. Run `npm run validate:content`, `npm test`, and `npm run build` before handoff.

## Local JSON admin workflow

In local development, open `/admin.html` to stage JSON edits to subjects, quizzes, questions, decks, and flashcards. The flashcard navigator scopes browsing by subject and deck, then searches front text, back text, or ID and shows up to 25 cards per page. Pickers and actions stay visible while the card list scrolls. The panel is deliberately not a rich content editor and does not write to the checked-in file. Use a complete single-record JSON edit or a content-only bulk-add draft. Bulk drafts expose only authorable content fields; the panel captures the destination and bank revision, generates IDs and choice labels, and compiles the draft to a version-2 grouped change set. Version-2 change-set files can be loaded separately through **Import change set**, where their technical JSON is read-only. All operations are previewed and applied atomically to an in-memory snapshot, then rejected if the final bank fails structural or Markdown validation.

The quiz editor offers **Record** and **Add** modes, and both editors use a labelled **JSON** field. Their navigators grow to fit the available controls and bound only the record list when it becomes long. The flashcard navigator scopes browsing by subject and deck, searches front text, back text, or ID, and shows up to 25 cards per page. Bulk flows use one action that changes from **Preview** to **Stage** after a successful current preview. Editing JSON, changing the destination, or changing the relevant bank snapshot requires a new preview. Modal workflows do not expose a Reason field; the established workspace reason remains in the version-2 change set, including for grouped bulk operations. Bulk drafts accept `stem`, 2–26 choice strings, an answer label, and rationale; optional fields are `verifiedAnswer`, `answerNote`, `rationaleMeta`, `choiceExplanations`, `pearls`, and `metadata`. Bulk drafts expose only authorable content fields; the panel captures the destination and bank revision, generates IDs and choice labels, and compiles the draft to a version-2 grouped change set. Version-2 change-set files can be loaded separately through **Import change set**, where their technical JSON is read-only. All operations are previewed and applied atomically to an in-memory snapshot, then rejected if the final bank fails structural or Markdown validation.

The editor keeps at most ten staged batches available for **Undo** to bound memory use with the full bank; **Reset** discards all staged work regardless of that limit. Editing a draft while a preview is pending invalidates that preview. Stage, import, undo, and reset commands run one at a time. A successful preview is reused when applying the same change set to the same revision, avoiding a second full-bank validation. Export continues to serialize the whole canonical bank in its established deterministic format.

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

The workspace reason is recorded with the operation. Choose **Preview**, inspect generated IDs and validation feedback, then choose **Stage** on the same button. The panel assigns stable IDs above the current maximum, choice labels from array order, and the default subject accent. Add more quizzes as entries in `quizzes`, and more questions as entries in each quiz's `items` list. Editing the draft, changing the destination, or changing the staged snapshot invalidates the preview.

The active section's header export downloads its canonical bank and reasoned change set. When quiz and flashcard operations are both staged, Flashcards exports both banks and change sets, a replacement manifest, and the combined content bundle. Subject deletion stages quiz and flashcard descendants together, validates both candidate banks, and supports one Undo across both banks. The deletion dialog lists complete affected counts and pages through record identities. Saved browser attempts and checkpoints remain stored, but references to deleted content may become inaccessible. Delete a quiz, deck, item, or card from its parent or record actions; parent operations carry explicit cascade intent in the exported change sets. Exports download files only and do not replace canonical records. Review the downloads, replace canonical files through normal review, retain the companion change sets with their rationale, then run `npm run validate:content`, `npm test`, `npm run build`, and `npm run audit:explanations`. **Import change set** in Flashcards opens an existing flashcard or paired change set for read-only preview before **Stage import**.

Use **Record actions → New subject / New quiz / New item** in Quizzes or **New deck / New card** in Flashcards for a single JSON record. Parent selection controls which actions are available. Flashcard Record actions also move cards or decks in canonical sibling order; boundary moves are disabled. **Add** remains the content-only batch flow.

Use **Select** above an item/card list, then **Select this page** or individual checkboxes and **Delete selected…**. Selection survives page changes within the same parent, and clears when changing parent/search. The review stages the selected IDs as one atomic batch with one Undo; validation rejects an invalid final bank, including removing every item from a quiz. Cancel and stale-review failures preserve all records. Undo later quiz edits before undoing a paired transaction. Drafts are preserved when a context change or coordinated deletion is declined; stage or discard a changed quiz/flashcard record before exporting. Diagnostics in both sections show complete error/warning totals, severity filters, and ten issues per page.

The local tool is enabled only for development by default. It is not authentication or authorization and must not be exposed as a production write surface before the separate backend/security work.

The current schema version is `4`. Add a deliberate migration, semantic parity check, and validation coverage before changing the stored shape. Compatibility code is temporary and should be removed after every in-scope browser profile has migrated.

## Local source material and generated output

The tracked `src/content/questionBank.generated.json` and `src/content/flashcardBank.generated.json` are authoritative, versioned records. Their `.generated` suffix is historical: do not treat them as disposable output or replace them from old extraction artifacts. The repository includes everything needed to validate and serve these banks.

Other content folders are intentionally ignored by Git and are not included in a clone or Git-based backup:

- Root `content/` contains historical extracted records and review reports, plus the current `content/explanation-audit.json` output from `npm run audit:explanations`. That command runs from the repository root and overwrites its audit report. The audit is reproducible from canonical content; historical extraction/review material has no current tracked regeneration pipeline, so retain it separately if needed for provenance or future source review.
- `tn-pdfs/` holds private original PDF sources and ancillary material. Current runtime code does not read it. Keep an appropriate separate backup before moving or deleting these files; a canonical bank does not replace its source documents.

`public/` contains tracked assets copied into production builds. The unused legacy question-bank manifest and quiz shards formerly under `public/content/` were removed after the owner confirmed they had no external consumers. The current local/API adapters read the canonical banks directly; do not recreate a parallel manifest/shard store. New media under `public/content/` is trackable and must follow the reviewed asset workflow below.

New runtime media referenced by canonical rich content should have an explicit tracked asset or publishing workflow, rather than being placed among ignored historical extraction files. Record its URL and lifecycle in the reviewed content change.

Build/test outputs (`dist/`, coverage, browser results), virtual environments, Python caches, and `*.egg-info/` package metadata are also ignored. They can be regenerated through the documented install, build, and test workflows. Back up irreplaceable private sources and review history separately; Git protects only tracked files.

## Read-only content API

The [L3 paired-release decision](decisions/0005-paired-content-releases-and-postgres-schema.md) defines the upcoming Postgres import/read mode, deterministic exports and durable ID allocation. Migration `0001_content` and private transaction primitives now implement the release/draft/allocation schema. The [operator file workflow](../backend/README.md#paired-content-import-activation-and-export) now validates captured paired inputs, imports without activation, explicitly activates with a publication precondition, and exports into new files plus an external manifest. The learner Postgres adapter remains pending. These jobs do not provide an authoring workflow. Both JSON banks remain authoritative through L3; L4's authenticated editing, tooling and backup gates must pass before the explicit DB-authority cutover.

The FastAPI service reads `src/content/questionBank.generated.json` directly; the checked-in file remains canonical. Start it from the repository root using the project-root `.venv` as described in `backend/README.md`. On startup it validates schema-v4 records and keeps an indexed read snapshot. It exposes subject and quiz catalogs plus ordered per-quiz questions. Content responses include a SHA-256 bank revision; the learner pins its catalog revision while it runs and asks for matching question content. A changed bank returns a conflict so reload can fetch a consistent catalog. Restart the service after replacing canonical JSON. The service does not edit the file, accept admin change sets, or persist attempts. Keep the existing reviewed export, JSON replacement, and `npm run validate:content` workflow.

Follow [frontend setup](../README.md#install-and-run) for default API delivery, [local-content mode](../README.md#local-content-mode) for offline development, and [local editor setup](../README.md#local-content-editor) for authoring entry/build flags. [Architecture](architecture.md#content-api-and-loading) owns request caching and recovery behavior; [.env.example](../.env.example) lists retry defaults. Retry limits must be 0–5; delays must be positive and at most 30 seconds, with the base no greater than the cap. Restart Vite or rebuild after changing these build-time settings. API mode needs the service when fetching content that is not already loaded. Answering, scoring, checkpoints, completion, and history remain in the browser.

When shared-subject changes make independent resets invalid, use **Reset both banks** in Flashcards. It explicitly confirms discarding both sections' staged changes and editor drafts, validates the bundled flashcard snapshot against the original subject catalog, then resets both banks together. A failed reset preserves both workspaces. Independent Undo/Reset retains its reference guards.

## Maintenance tool ownership

`npm run validate:content` runs `scripts/content/validate-question-bank.ts`; `npm run audit:explanations` runs `scripts/content/audit-explanations.ts` and still writes the ignored `content/explanation-audit.json`. Run these commands from the repository root. Stored contracts live under `src/content/schema`, validators under `src/content/validation`, and shared sanitization/math policies under `src/content/richText`. Local JSON adapters and API delivery live under `src/content/local` and `src/content/api`.

The schema-v1 flashcard migration CLI and legacy import/read paths have been retired after the owner verified that backward compatibility is no longer needed. Current authoring imports require version-2 change sets. Future schema changes still require deliberate candidate/parity validation.
