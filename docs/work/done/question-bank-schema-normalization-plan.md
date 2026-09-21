# Question-bank schema normalization plan

## Completion (2026-09-21)

Implemented schema version 3. The canonical bank now stores the minimal relationship chain (`question.quizId -> quiz.subjectId`), derives quiz counts and answer provenance in the adapter, and uses one-based array position as the learner display number. Stable IDs, content, choices, answers, rationale Markdown, and review metadata were preserved by a deterministic migration and parity check.

The pretty-printed canonical file decreased from 16,034,277 bytes to 14,020,303 bytes (2,013,974 bytes; 12.56%). Its compact representation decreased from 13,041,122 bytes to 11,629,592 bytes (1,411,530 bytes; 10.82%).

Verification passed: schema-v3 parity (12 subjects, 98 quizzes, 10,196 questions), `npm run validate:content` (32 existing answer-review warnings), `npm test` (55 tests), `npm run audit:explanations`, `npm run build`, and `git diff --check`. The existing Vite large-bundle warning remains because the full local bank is bundled.

## Objective

Move the canonical question bank from schema version 2 to a smaller, more normalized schema that maps cleanly to PostgreSQL later, without changing any question text, choice text/order, stable IDs, answers, rationales, or provenance. Question display numbers will intentionally become their one-based positions within each quiz.

This phase changes only the static JSON schema and its local adapter. It does not add PostgreSQL, an API, an ORM, or runtime content generation.

## Baseline findings

- The bank contains 12 subjects, 98 quizzes, and 10,196 questions in a 16,034,277-byte pretty-printed JSON file.
- Every question repeats `subjectId`, although it is derivable through `question.quizId -> quiz.subjectId`; all 10,196 relationships currently agree.
- Every quiz stores `questionCount`, although the adapter already derives the count; all 98 stored counts currently agree.
- Every question has `metadata.discipline`, which duplicates its subject name, and `metadata.difficulty: "unknown"`. No question currently has any other metadata field.
- `answerSource` is `provided_key` for 10,194 questions and `verified` for two. It is derivable from the presence of `verifiedAnswer`; answer uncertainty is separately represented by `rationaleMeta.answerReviewNote`.
- All 12 subject descriptions are the same generic sentence and convey no subject-specific information.
- Every question has four ordered choices with stable IDs `A` through `D`. Keep the explicit choice objects: their IDs and order are canonical, and converting them to positional strings would weaken integrity for a modest additional saving.
- `questionNumber` is redundant once array position is authoritative. One quiz currently has 100 records labeled 1-48 and 50-101; after migration those records will display as positions 1-100 while their stable IDs remain unchanged.
- Documentation is inconsistent: the bank and `docs/question-schema.md` say schema version 2, while `docs/content-management.md` still says the current version is 1.

Removing the approved redundancies (`question.subjectId`, `question.questionNumber`, `quiz.questionCount`, `question.answerSource`, empty/default metadata, and the generic subject description) reduces the compact JSON representation by approximately 1.41 MB, or 10.82%. Compact formatting itself would save a further 2.99 MB relative to the current pretty-printed file, but formatting should be treated as a separate readability decision rather than a schema improvement.

## Recommended schema version 3

Keep the JSON as a set of top-level entity collections. Use foreign keys only where the relationship is not derivable.

```json
{
  "schemaVersion": 3,
  "subjects": [
    {
      "id": "anat_histo",
      "name": "Anatomy & Histology",
      "accent": "#b9511b"
    }
  ],
  "quizzes": [
    {
      "id": "anat_histo-5-anatomy-practice-test-1-handout-october-2026",
      "subjectId": "anat_histo",
      "name": "Practice Test 1"
    }
  ],
  "questions": [
    {
      "id": "anat_histo-5-anatomy-practice-test-1-handout-october-2026-q-1",
      "quizId": "anat_histo-5-anatomy-practice-test-1-handout-october-2026",
      "stem": "...",
      "choices": [
        { "id": "A", "text": "..." },
        { "id": "B", "text": "..." }
      ],
      "sourceAnswer": "B",
      "verifiedAnswer": "B",
      "answerNote": "...",
      "rationale": "...",
      "rationaleMeta": {
        "sources": "...",
        "answerReviewNote": "...",
        "provenance": "ai_draft_reviewed",
        "reviewedAt": "2026-09-16",
        "reviewNote": "..."
      }
    }
  ]
}
```

Optional fields in the example remain absent unless meaningful. In particular, most records should contain only `sourceAnswer` and should not contain `verifiedAnswer`, `answerNote`, or `rationaleMeta`.

### Remove in version 3

- `questions[].subjectId`: transitively derived from the referenced quiz.
- `questions[].questionNumber`: derived as the one-based position of the question within its quiz's canonical array order.
- `quizzes[].questionCount`: derived from the question index/query.
- `questions[].answerSource`: derived as verified when `verifiedAnswer` exists, otherwise provided; an answer-review note continues to represent uncertainty.
- `questions[].metadata.discipline`: duplicates `subjects[].name`.
- `questions[].metadata.difficulty` when its value is `unknown`: absence means unclassified.
- Empty `questions[].metadata` objects. Reintroduce a sparse optional classification object only when real topic, system, difficulty, question-type, or tag data exists.
- `subjects[].description` while all values are the same generic placeholder. Add a description back only when it is subject-specific and used by the product.

### Keep in version 3

- All existing subject, quiz, question, and choice IDs.
- `quizId` on each question and `subjectId` on each quiz as the minimal relationship chain.
- Ordered choice objects with explicit IDs and text.
- Both `sourceAnswer` and optional `verifiedAnswer`; they are separate provenance facts, not duplicates.
- `answerNote`, rationale content, review notes, review timestamps, citations, and provenance.
- Array order as the authoritative quiz order and display numbering source. Stable question IDs remain opaque identifiers even when their historical suffix no longer matches the displayed number.

## Eventual PostgreSQL mapping

The version-3 JSON should map mechanically to these logical relations:

- `subjects(id primary key, name, accent)`
- `quizzes(id primary key, subject_id foreign key, name)`
- `questions(id primary key, quiz_id foreign key, position, stem, rationale)`
- `choices(question_id, choice_id, position, text, primary key(question_id, choice_id))`
- `question_answer_keys(question_id primary key, source_choice_id, verified_choice_id, answer_note)` with composite foreign keys back to `choices`
- `question_reviews(question_id primary key, answer_review_note, provenance, reviewed_at, review_note)` for the sparse review extension
- `sources(id primary key, citation)` and `question_sources(question_id, source_id, position)` only after the current free-form source strings have been audited and split without loss
- Future classifications should use lookup/junction tables such as `topics`, `tags`, and `question_tags`; do not restore repeated display labels on every question.

`position` in PostgreSQL is populated from the question's one-based position within its quiz's canonical JSON order. It is both the ordering key and the displayed question number.

## Step-by-step implementation

### 1. Freeze the version-2 baseline

1. Run `npm run validate:content`, `npm test`, `npm run build`, `npm run audit:explanations`, and `git diff --check`.
2. Add a migration snapshot/report containing entity counts, per-quiz ordered question IDs, every stable ID, answers, choice order/text, Markdown content, review metadata, and a checksum of the source file.
3. Record the existing question IDs and order so removing the old printed number cannot rename IDs or reorder records.

**Gate:** The existing bank passes all checks, and the parity report fully describes the effective learner-facing data.

### 2. Specify schema version 3 before converting data

1. Add storage-only TypeScript types for version 2 and version 3 instead of casting imported JSON directly to domain `Question` objects.
2. Define required, optional, and forbidden fields for each entity.
3. Document that missing difficulty means unclassified; do not serialize `"unknown"` as a default.
4. Document the derivation rules for subject membership, quiz counts, and effective answers.
5. Decide separately whether the canonical file remains pretty-printed or uses a deterministic compact/one-record-per-line form. Do not mix this choice with semantic migration review.

**Gate:** Every current record can be represented without content loss, and every removed field has one unambiguous derivation rule.

### 3. Strengthen validation while still on version 2

1. Validate the top-level schema version and reject unknown versions.
2. Validate unique subject, quiz, question, and per-question choice IDs.
3. Validate the foreign-key chain and explicitly verify the soon-to-be-removed question `subjectId` against its quiz during migration.
4. Validate that source and verified answers reference choices.
5. Validate deterministic quiz order and derive one-based display numbers from each quiz's indexed question array.
6. Validate sparse review metadata as a unit: reviewed AI provenance requires its review date and note.
7. Add negative fixtures for orphaned references, duplicate IDs, invalid answers, accidental default metadata, and reintroduced derived fields.

**Gate:** The validator detects drift that the current TypeScript cast cannot detect.

### 4. Build a deterministic version-2-to-version-3 migration

1. Write a one-time migration that reads version 2 and writes a candidate version-3 file; never edit the canonical file in place.
2. Remove only the approved redundant fields.
3. Preserve record order, IDs, Markdown strings, choice order/text, answers, and sparse provenance byte-for-byte.
4. Fail if a question-to-quiz subject relationship is inconsistent, a stored quiz count is wrong, an `answerSource` cannot be derived, or metadata contains a non-default value that would be lost.
5. Serialize deterministically so repeated runs produce identical output.

**Gate:** Two runs are byte-identical, and no warning is ignored.

### 5. Prove semantic parity before replacing the canonical bank

1. Compare version 2 and the candidate by stable ID rather than by raw JSON shape.
2. Compare ordered quiz membership, stems, choices, source and verified answers, effective answers, rationales, citations, and review flags; separately assert the approved display-number mapping from array position.
3. Assert that the only differences are the approved removed fields and schema version.
4. Manually inspect the two verified-answer records, the two answer-note records, all answer-under-review cases, representative citation metadata, and the quiz whose former labels skipped 49.

**Gate:** The parity report is clean and records zero learner-visible changes.

### 6. Introduce a storage adapter that hydrates domain models

1. Update `questionBank.ts` to parse version 3 into storage types, build indexes once, and expose the existing `QuizRepository` API.
2. Derive `Quiz.questionCount` in the adapter.
3. Derive any domain-level subject relationship needed by a `Question` from its quiz rather than storing it twice.
4. Replace `answerSource` consumers with a small domain helper for effective answer and review state. Do not scatter fallback rules across UI components.
5. Keep React screens and quiz logic independent of the stored JSON shape.

**Gate:** Application behavior and the repository interface remain stable even though the stored schema changed.

### 7. Replace the canonical file and update documentation

1. Promote the candidate only after parity passes, and increment `schemaVersion` to 3.
2. Update domain fixtures and tests without regenerating IDs or altering content.
3. Update `docs/question-schema.md`, `docs/content-management.md`, `docs/architecture.md`, and `docs/testing.md` together.
4. Correct the current schema-version contradiction in `docs/content-management.md`.
5. Keep the migration and parity tool through review, then archive it as a one-time migration or remove it so it cannot become a competing authoring path.

**Gate:** A repository-wide search finds no runtime dependency on removed fields and no documentation describing an obsolete version.

### 8. Verify and measure the result

1. Run `npm run validate:content`, `npm test`, `npm run build`, `npm run audit:explanations`, and `git diff --check`.
2. Record before/after raw and compact byte sizes and the production bundle effect.
3. Confirm 12 subjects, 98 quizzes, 10,196 questions, unchanged per-quiz order, and unchanged answer/review counts.
4. Confirm existing local attempts still resolve their stable quiz and question IDs.

**Gate:** All checks pass, the measured reduction matches expectations, and no existing attempt or learner-visible content changes.

### 9. Defer deeper normalization until it has a clear payoff

1. Audit `rationaleMeta.sources` before creating source and citation entities; current strings may combine multiple citations and must not be split heuristically.
2. Add normalized tags/topics only when curated classifications exist.
3. Introduce a `quiz_questions` junction table only if questions genuinely need reuse across quizzes. The current one-question-to-one-quiz model does not need a verbose JSON junction collection.
4. Create the actual PostgreSQL schema, migrations, API, and database-backed `QuizRepository` only as a separate explicitly requested project.

## Explicit non-goals

- No question, answer, rationale, citation, or medical-content correction.
- No stable-ID or choice-ID regeneration.
- No question reordering or stable-ID renaming. Display numbering intentionally becomes contiguous one-based array position.
- No backend, PostgreSQL instance, ORM, or API in this migration.
- No runtime generative AI.
- No lossy tuple/string encoding solely to reduce bytes.

## Completion criteria

- Version 3 contains no transitively duplicated subject IDs, stored question counts, derived answer-source labels, placeholder subject descriptions, or all-default metadata objects.
- Content and provenance parity is demonstrated by an automated report.
- The runtime continues to depend on `QuizRepository`, not the JSON structure.
- The JSON-to-PostgreSQL mapping is deterministic, preserves canonical order, and derives display numbers from the SQL `position` column.
- Validation, tests, audit, build, and diff checks all pass.
