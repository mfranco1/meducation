# JSON question bank source-of-truth migration plan

## Completion (2026-09-20)

Implemented the migration. `src/content/questionBank.generated.json` is now schema version 1 and contains the final corrected choices plus all 121 reviewed explanations and 32 answer-review notes directly on question records. It no longer contains PDF paths or PDF-ingestion status. `questionBank.ts` is the sole JSON repository adapter and builds indexes plus derived question counts.

Removed the PDF ingestion scripts, their package commands and Python dependency list, and the correction/enrichment overlay files. Updated domain types, validation, QA, explanation lookup, tests, repository documentation, and `AGENTS.md` to use canonical JSON content. Ignored local PDF and extracted archives were intentionally left untouched.

Verification passed: `npm test` (46 tests), `npm run validate:content` (10,196 questions across 98 quizzes; 32 existing answer-review warnings), `npm run build`, `npm run audit:explanations`, and `git diff --check`. Vite retains its existing large-bundle warning because the complete local question bank is bundled.

## Objective

Make `src/content/questionBank.generated.json` the only runtime and authoring source for subjects, quizzes, questions, displayed choices, answers, rationales, explanation content, and review flags. Remove the application's architectural and tooling dependency on PDFs, extracted intermediates, and the PDF ingestion pipeline.

This is an intermediate storage architecture: the JSON file acts as the database today, while the existing `QuizRepository` boundary remains the seam for a future persistent database or API.

The filename is retained during this migration to minimize churn even though the file will no longer be generated. A later, mechanical rename to `questionBank.json` can be done separately if desired.

## Scope decisions

- Preserve every established subject, quiz, and question ID. Existing attempts in local storage depend on quiz and question IDs.
- Preserve question order, stems, choices, answer values, rationales, explanations, and medical metadata during the migration. This is a storage/provenance change, not a content-editing pass.
- Bake the six current `choiceCorrections.json` values into the corresponding questions. The corrected text becomes the canonical text; the extracted spillover is not kept in the runtime bank.
- Move reviewed explanation entries from `explanationEnrichment.json` and `aiExplanations.json` into their corresponding question records so no runtime content overlay remains.
- Preserve useful answer provenance (`sourceAnswer`, `verifiedAnswer`, `answerSource`, `answerNote`, and answer-review notes) inside the bank. These fields describe review history even after PDFs cease to be authoritative.
- Remove PDF-specific runtime fields (`Quiz.sourcePdf` and `Question.source.pdfFile/page`) and replace any still-useful audit information with storage-neutral metadata only if it has a concrete ongoing use.
- Remove `needs_review` as a PDF-ingestion state. Any content readiness or answer-review state that is still needed should be explicit, storage-neutral, and question/quiz based.
- Do not add a backend, database server, ORM, or runtime content generation in this phase.
- Do not delete ignored local PDFs automatically. They are about 1.7 GB of untracked local data and can be archived or removed separately after explicit confirmation.

## Target architecture

```text
src/content/questionBank.generated.json
        |
        v
src/content/questionBank.ts
  - imports and validates the one data file
  - exposes QuizRepository reads
  - derives indexes/counts as needed
        |
        v
src/domain + src/app
  - know nothing about PDFs or extraction
  - consume typed subjects, quizzes, and questions
```

`questionBank.generated.json` should have a versioned, database-like top-level shape:

```json
{
  "schemaVersion": 1,
  "subjects": [],
  "quizzes": [],
  "questions": []
}
```

Each question should contain its complete runtime record, including its canonical choices, answer provenance, rationale, reviewed explanation (when present), review flags, pearls, and metadata. Runtime code must not join another JSON file to construct a quiz question.

## Step-by-step implementation

### 1. Freeze and verify the current effective runtime dataset

1. Run `npm test`, `npm run validate:content`, and `npm run build` and record the baseline results.
2. Produce a temporary, read-only snapshot of the **effective** runtime records after applying choice corrections and explanation lookup. Record counts for subjects, quizzes, questions, corrections, reviewed explanations, missing answers, answer-review flags, and quiz readiness.
3. Add a migration-only comparison script or test that compares old effective runtime records with the new consolidated bank by stable ID. Compare subject/quiz membership, question order, stem, canonical choices, effective answer, answer provenance, rationale, explanation content, review note, pearls, and metadata.
4. Record a checksum of the pre-migration bank and keep the migration script until the consolidation has been reviewed. Do not use the old PDFs as the parity oracle; the running application's effective data is the migration baseline.

**Gate:** The current application passes all checks, and the effective-data snapshot accounts for 12 subjects, 98 quizzes, 10,196 questions, 6 corrected question records, 1 enrichment entry, and 120 reviewed AI explanation entries.

### 2. Define the canonical JSON schema before moving data

5. Add `schemaVersion` to the top-level bank and define TypeScript types for the stored bank separately from repository-facing domain types where useful.
6. Decide whether `questionCount` is stored or derived. Prefer deriving it from indexed questions in `questionBank.ts` to avoid denormalized drift; if retained for display/performance, validation must require an exact match.
7. Remove PDF-only fields from the target types: `Quiz.sourcePdf`, `QuestionSource`, and `Question.source`. If historical origin labels are genuinely useful, replace them with an optional storage-neutral field such as `provenance.note`; do not retain file paths that imply runtime authority.
8. Replace the PDF-oriented quiz `status: 'ready' | 'needs_review'`. Recommended approach: all quizzes present in the canonical bank are available, while answer uncertainty remains represented at question level through answer provenance and `answerReviewNote`. Add a general `enabled` field only if product owners need to hide incomplete quizzes independently of ingestion.
9. Define an embedded, optional explanation object on `Question`, using the current enrichment shape (`markdown`, optional `sources`, provenance, review date/note, and optional `answerReviewNote`). Keep the raw `rationale` only when it remains useful as canonical content; the explanation renderer should prefer the embedded reviewed explanation and otherwise format the rationale.
10. Expand validation to cover top-level schema version, unique IDs, references, exact quiz/question relationships, deterministic order, answer-to-choice integrity, embedded explanation validity, allowed review states, and absence of PDF-only fields.

**Gate:** The proposed schema can represent every current effective runtime record without consulting any other file.

### 3. Perform a one-time, deterministic data consolidation

11. Write a one-time migration script that reads the current bank plus the three overlays and writes a candidate canonical bank to a temporary path. It must never mutate stems, reorder choices, regenerate IDs, or infer new answers.
12. Apply every `choiceCorrections.json` entry directly to its matching choice. Fail if a question/choice is missing, if an entry is unused, or if two inputs attempt to set the same field.
13. Embed all entries from `explanationEnrichment.json` and `aiExplanations.json` into matching questions, retaining provenance, reviewed dates, review notes, sources, and answer-review notes. Fail on orphaned or duplicate entries.
14. Remove `sourcePdf`, question `source`, and ingestion-only `status` values from the candidate. Add the new schema version and any selected neutral availability field.
15. Run the migration parity comparison against the old effective runtime view. Differences should be limited to the intentionally removed PDF metadata and the physical relocation of overlays.
16. Review a representative sample: corrected choices, source rationale fallback, the explicit enrichment entry, reviewed AI explanations, answer-under-review warnings, verified answers, and quizzes formerly marked `needs_review`.
17. Replace `questionBank.generated.json` only after the parity report is clean. Keep the migration script through code review, then either remove it or move it to a clearly labeled archival/migration location so it cannot become a second authoring path.

**Gate:** The canonical file alone reproduces all intended quiz behavior and content.

### 4. Simplify the runtime loader and domain model

18. Change `src/content/questionBank.ts` to import only `questionBank.generated.json`. Remove the correction mapping and expose subjects, quizzes, and questions from the canonical data.
19. Build in-memory indexes by subject ID and quiz ID once at module load rather than repeatedly filtering the full 10,196-question array. This keeps the JSON-as-database adapter efficient and mirrors repository queries that a future database will implement.
20. Update `Question`, `Quiz`, and related domain types to remove PDF-specific properties and use the embedded explanation shape.
21. Update `explanationFor` to read only the question record: return its embedded explanation when present, otherwise format its canonical rationale. Remove imports of separate explanation JSON files.
22. Update the subject screen so quiz availability no longer depends on an ingestion status. Preserve resume, completion, score, and question-count behavior.
23. Update the Content QA panel to show stable IDs, bank validation, answer provenance, and review flags rather than a PDF filename/page.
24. Update fixtures and tests that currently manufacture `sourcePdf` or `source.pdfFile` fields.

**Gate:** A repository-wide search shows no runtime import or reference to correction files, explanation data files, PDF fields, or extraction status.

### 5. Make the JSON file the only supported authoring path

25. Replace the PDF pipeline instructions with a JSON editing workflow: edit the canonical record, preserve stable IDs, validate, test, and build.
26. Add a small content-maintenance command if needed for safe mechanical tasks such as schema validation, formatting, duplicate detection, and deterministic ordering. It may read and validate the bank but must not regenerate content from PDFs.
27. Make `npm run validate:content` import or read only the canonical bank and validate embedded explanations in the same pass.
28. Update `audit:explanations` to use embedded question data and remove `sourcePdf` from its report. If the audit no longer provides ongoing value, remove the command rather than preserving a dead workflow.
29. Document an edit protocol: never change established IDs; distinguish canonical answer changes from explanation edits; attach an answer note/review record to corrections; run validation/tests/build; review the diff for accidental mass changes.
30. Add a format-stability test so loading and serializing the canonical data does not reorder records or silently rewrite content.

**Gate:** A contributor can add or update a quiz using only the canonical JSON and documented validation commands.

### 6. Remove the ingestion pipeline and obsolete artifacts

31. Remove `extract:pdf` and `build:content` from `package.json`.
32. Remove the tracked PDF tooling: `scripts/build_question_bank.py`, `scripts/extract-pdf.ts`, `scripts/extract-pdf.swift`, `scripts/extract_batch.py`, `scripts/extract_review.py`, `scripts/merge_question_bank.py`, and `scripts/question_bank_output.py`.
33. Remove `requirements-content.txt` if none of its packages are used elsewhere.
34. Remove `choiceCorrections.json`, `choiceCorrections.test.ts`, `explanationEnrichment.json`, and `aiExplanations.json` after their contents have been embedded and parity-tested.
35. Remove or rewrite PDF-specific source-formatting names and comments. `sourceRationale.ts` can become a storage-neutral rationale formatter if its behavior is still needed.
36. Clean `.gitignore` entries and comments that exist only for the extraction pipeline. Keep `tn-pdfs/` and `content/` ignored until the team intentionally decides what to do with local archives; removing ignore rules could accidentally stage gigabytes of private material.
37. Remove ignored generated intermediates (`content/extracted`, review reports, caches) only as an explicit local cleanup action. Do not make their deletion necessary for the application to build or run.

**Gate:** A clean checkout can install, test, validate, build, and run without Python, Poppler, PDFKit, `tn-pdfs`, or `content/extracted`.

### 7. Align documentation and repository invariants

38. Rewrite `docs/architecture.md` to identify the canonical JSON as the current data store and `QuizRepository` as the future database seam.
39. Replace `docs/content-pipeline.md` with a content maintenance and validation guide, or rename it to `docs/content-management.md` and update references.
40. Rewrite `docs/question-schema.md` around canonical JSON records rather than PDF fidelity. Preserve the invariants that stable IDs do not change silently and answer corrections remain auditable.
41. Update `docs/testing.md` to remove extraction-parity requirements and add canonical-data migration, schema, relationship, and serialization checks.
42. Update `AGENTS.md`: remove “the PDF is the source of truth” and replace it with “the canonical question-bank JSON is the source of truth.” Explicitly require changes to questions, choices, ordering, answers, and explanations to be made and reviewed in that file.
43. Reconcile the ongoing explanation-formatting tracker, which currently assumes PDF comparison and separate enrichment files. Rewrite its remaining work for embedded explanations or close/supersede it with a linked tracker.

**Gate:** No active documentation instructs contributors or agents to regenerate or verify content from PDFs.

### 8. Prepare the repository boundary for a future database

44. Keep quiz/session/domain code dependent on `QuizRepository`, not on JSON imports. Only the JSON repository/adapter should know the file shape.
45. Consider adding direct lookup methods such as `getQuiz(id)` and `getQuestion(id)` when there is a demonstrated use; do not introduce a database-shaped abstraction speculatively.
46. Keep attempts behind `AttemptRepository`. Question-bank migration and attempt persistence are separate concerns, and local-storage keys/shapes should remain unchanged in this phase.
47. Document the eventual replacement point: a future API/database adapter must preserve stable IDs and implement the same repository behavior. React screens and quiz logic should require no storage-specific changes.
48. Avoid database-specific concepts such as migrations, transactions, or remote fetching in runtime code until a real database is selected.

## Recommended review/commit sequence

1. Schema and validation changes, initially backward-compatible.
2. One-time data consolidation plus parity tests.
3. Runtime loader, explanation lookup, UI, and fixture updates.
4. Removal of overlays and ingestion tooling.
5. Documentation and agent-instruction updates.
6. Optional local archival cleanup in a separate, explicitly approved operation.

Each reviewable step should leave the application buildable. Run `npm test`, `npm run validate:content`, `npm run build`, and `git diff --check` at every gate.

## Completion criteria

- `questionBank.generated.json` is the only JSON imported for runtime quiz content.
- The bank contains the final displayed choices and all explanation/review data needed by the application.
- No application or validation code references PDF files, PDF pages, extracted artifacts, or correction/enrichment overlays.
- No package script or tracked tool ingests PDFs or rebuilds the bank from them.
- Stable IDs and existing local attempts remain compatible.
- The effective question count, quiz membership/order, displayed choices, answers, rationales, explanations, and review warnings match the pre-migration application except for explicitly approved content changes.
- A clean checkout does not need local PDFs, Python content dependencies, or extraction artifacts.
- Documentation and `AGENTS.md` name the canonical JSON—not PDFs—as the source of truth.
- The `QuizRepository` boundary remains ready for a future database-backed implementation.

When these criteria are met, move this tracker to `docs/work/done/` with the final verification results.
