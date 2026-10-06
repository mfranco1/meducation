# Content management

`src/content/questionBank.generated.json` is the canonical content store for the application. It is a schema-v4 JSON database containing compact subject, quiz, and question identifiers, final choice text, answer provenance, display-ready GFM stems and rationales, rationale metadata, and answer-review notes.

Flashcard content lives in the separate versioned `src/content/flashcardBank.generated.json` file. Read [the flashcard schema](flashcard-schema.md) before editing it. Topics reference the existing subject IDs; do not copy or recreate subjects in the flashcard bank. `npm run validate:content` checks both banks and their shared-subject references. The local-only Flashcards section in `/admin.html` stages topic, deck, and card CRUD in memory and exports the bank plus a reasoned change set. It does not write repository files or provide access control. Review exports before replacing the canonical file and restart the content service after replacement.

Flashcard staging and replay use the same structural, Markdown/HTML/image/math validation as canonical validation. Duplicate sibling names are warnings; IDs remain authoritative. Unstaged record edits are protected when changing selection or leaving the page. Export retains the staged workspace: use Reset or Undo before importing another change set. Undo and reset in either authoring section refuse to create dangling shared-subject references.

When quiz changes are also staged, exporting from Flashcards downloads both canonical banks, both operation change sets, a replacement manifest, and `content-change-set-bundle.json`. Import that bundle through Flashcards to preview and stage the final pair atomically. This allows moving/deleting topics together with removing their old subject without an invalid intermediate state. Start paired imports from reset workspaces; stale base/result revisions or invalid final references reject the entire pair. Review the paired quiz operation preview as well as the resulting flashcard bank before staging. Keep canonical bank replacements together and restart the read-only content service afterwards.

When editing content:

1. Preserve established subject, quiz, and question IDs, canonical question ordering, and choice IDs. Subject IDs use `s*`, quiz IDs use `q*`, and question IDs use `i*`. Question display numbers are derived from one-based position within a quiz; do not add a stored question number.
2. Make intentional question, choice, answer, stem, or rationale changes directly in the matching record. Stems and rationales support GFM, the limited HTML documented in `question-schema.md`, and KaTeX math. Use `$...$` for inline formulas and a separate-line `$$` block for display formulas. Escape ambiguous literal money with `\$`; the validator catches malformed or unsupported math. Use meaningful alt text for every image. Use app-local paths such as `![Nerve diagram](/content/figures/nerve.png)` today; add a future S3 or CloudFront HTTPS origin to both `VITE_CONTENT_IMAGE_ORIGINS` and `CONTENT_IMAGE_ORIGINS` before referencing it in canonical content. Choices, choice explanations, and sources remain restricted Markdown.
3. Keep answer provenance explicit: retain `answer`, add `verifiedAnswer` only after review, and use `answerNote` or `rationaleMeta.answerReviewNote` when a key is uncertain. Do not add `sourceAnswer` or `answerSource`; verification state is derived from whether a verified answer exists.
4. Keep provenance, sources, review data, and answer-review notes in `question.rationaleMeta`; do not create a second explanation body or JSON overlay. The application never calls an LLM at runtime.
5. Run `npm run validate:content`, `npm test`, and `npm run build` before handoff.

## Local JSON admin workflow

In local development, open `/admin.html` to stage JSON edits to subjects, quizzes, and questions. The panel is deliberately not a rich content editor and does not write to the checked-in file. Use a complete single-record JSON edit or a content-only bulk-add draft. Bulk drafts expose only authorable content fields; the panel captures the destination and bank revision, generates IDs and choice labels, and compiles the draft to a version-2 grouped change set. Existing version-1 and version-2 change-set files can be loaded separately through **Import change set**, where their technical JSON is read-only. All operations are previewed and applied atomically to an in-memory snapshot, then rejected if the final bank fails structural or Markdown validation.

The editor keeps at most ten staged batches available for **Undo** to bound memory use with the full bank; **Reset** discards all staged work regardless of that limit. Editing a draft while a preview is pending invalidates that preview. Stage, import, undo, and reset commands run one at a time. A successful preview is reused when applying the same change set to the same revision, avoiding a second full-bank validation. Export continues to serialize the whole canonical bank in its established deterministic format.

The bulk editor provides three context-specific shapes. Creating a new subject uses `subject.name` and a `quizzes` list; each quiz has a `name` and an `items` list. Adding quizzes to a selected subject uses only `quizzes`. Adding items to a selected quiz uses only `items`. Each item contains `stem`, a compact list of choice text strings, an answer label (`A`, `B`, …), and `rationale`. Optional editable fields are `verifiedAnswer`, `answerNote`, `rationaleMeta`, `choiceExplanations`, `pearls`, and `metadata`. Choice labels are assigned in list order, up to 26 choices. No IDs, parent IDs, operation names, schema versions, base revisions, or change-set envelopes belong in this draft.

In **Bulk add**, choose **Add quizzes**, then select the existing subject. Add one entry to `quizzes` for every new quiz; each entry needs a non-empty `items` array, so a single batch can add any number of quizzes with any number of items in each. Choose **Add items**, then select the subject and existing quiz, to use the `items` shape and append any number of items to that quiz. Changing either destination replaces the current draft and requires validation again.

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

Enter the change reason in the **Reason** field. Choose **Validate**, inspect the generated-ID and validation preview, then choose **Stage**. The panel assigns stable IDs above the current maximum, choice labels from array order, and the default subject accent. Add more quizzes as entries in `quizzes`, and more questions as entries in each quiz's `items` list. Changing the destination or staged snapshot requires reloading the template and validating again.

**Export** downloads both `questionBank.generated.json` and `question-bank-change-set.json`. Replace the canonical repository file through normal review, retain the companion change set with the change rationale, then run `npm run validate:content`, `npm test`, `npm run build`, and `npm run audit:explanations`. **Import** opens an existing change set for read-only preview before **Stage import**. Parent deletion requires explicit `cascade: true`; it can make saved browser attempts inaccessible and does not delete those attempts.

The local tool is enabled only for development by default. It is not authentication or authorization and must not be exposed as a production write surface before the separate backend/security work.

The current schema version is `4`. Add a deliberate migration, semantic parity check, and validation coverage before changing the stored shape. Compatibility code is temporary and should be removed after every in-scope browser profile has migrated.

## Read-only content API

The FastAPI service reads `src/content/questionBank.generated.json` directly; the checked-in file remains canonical. Start it from the repository root using the project-root `.venv` as described in `backend/README.md`. On startup it validates schema-v4 records and keeps an indexed read snapshot. It exposes subject and quiz catalogs plus ordered per-quiz questions. Content responses include a SHA-256 bank revision; the learner pins its catalog revision while it runs and asks for matching question content. A changed bank returns a conflict so reload can fetch a consistent catalog. Restart the service after replacing canonical JSON. The service does not edit the file, accept admin change sets, or persist attempts. Keep the existing reviewed export, JSON replacement, and `npm run validate:content` workflow.

The learner uses `VITE_CONTENT_SOURCE=api` by default and Vite proxies `/api` to the local FastAPI server. Set `VITE_CONTENT_SOURCE=local` to select the existing bundled JSON adapter for offline development. API requests allow 3 automatic retries by default; configure the build-time limit with `VITE_CONTENT_MAX_RETRIES` (0–5), the initial delay with `VITE_CONTENT_RETRY_BASE_DELAY_MS`, and the backoff cap with `VITE_CONTENT_RETRY_MAX_DELAY_MS` (each delay is at most 30 seconds). Delay values must be positive, and the base cannot exceed the cap. Restart Vite or rebuild after changing these settings. Once a quiz's questions are loaded, answering, scoring, checkpoints, completion, and history remain in the browser. Fetching a quiz not yet loaded requires the API in API mode. `/admin.html` remains available through the development server and is omitted from a normal production build. Set `VITE_BUILD_ADMIN=true` when building only when an explicitly bundled admin editor is needed.
