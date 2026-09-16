# Maintainability and reuse refactor plan

## Completion (2026-09-16)

Implemented the application and content-module restructuring described below. `App.tsx` is now a composition layer; screens, reusable feedback and quiz components, and the session coordinator own their respective responsibilities. Explanation loading, parsing, and source-preserving formatting are separate modules. The PDF builder delegates output writing to a dedicated module. Source-derived content, answer provenance, stable IDs, and localStorage keys were not changed.

Verification passed: `npm test` (23 tests), `npm run validate:content` (10,196 questions and 98 quizzes; 32 pre-existing answer-review warnings), `npm run build`, Python compilation for the builder modules, and `git diff --check`.

## Objective and constraints

Make the application easier to change by separating screens, reusable presentation, attempt orchestration, explanation processing, and PDF extraction. Preserve the current UI, quiz behavior, localStorage data, source questions, answer provenance, and stable IDs. This is a code and repository structure refactor; each phase should be a small reviewable change with its own verification.

The repository already separates `src/domain`, `src/content`, `src/persistence`, `src/analytics`, and `src/app`. Keep those boundaries. Do not introduce a backend, runtime AI, a generic component framework, or new state management solely for this refactor.

## Current hotspots

- `src/app/App.tsx` (about 24 KB, 205 dense lines) owns navigation, repository writes, quiz timing effects, five screens, the exit dialog, result summaries, stopwatch, and explanation rendering. Several components are declared inside `App`, so their identities change on each parent render. Its large one-line JSX blocks make small edits difficult to review.
- `src/content/explanations.ts` (about 12 KB) combines enrichment loading, source splitting and formatting, Markdown parsing, source-preservation normalization, and explanation selection. The UI renderer for these parsed blocks lives in `App.tsx`.
- `scripts/build_question_bank.py` (about 160 dense lines) combines PDF parsing heuristics, source-specific exceptions, metadata construction, review reporting, and file output. It is a second priority because extraction is a development-time path and changes carry source-fidelity risk.
- `src/content/validate.ts`, `src/domain/types.ts`, `src/persistence/localRepository.ts`, and several tests are short in line count but compressed into long statements. Formatting and focused helpers would improve reviewability without creating extra modules.
- `src/content/questionBank.generated.json` is about 16 MB of generated source-derived data. Its size is not a reason to hand-split or edit it. Any future loading optimization needs its own measured performance task.

## Step-by-step implementation

### 0. Establish a behavior baseline

1. Record the existing behavior for dashboard counts and subject cards; new, resumed, and completed quizzes; immediate and exam feedback; flags; previous/next navigation; leave, abort, and finish; stopwatch pause/resume; answer-key review warnings; results; and `/#content-qa`.
2. Capture representative desktop and narrow-screen screenshots before moving JSX. Include a long explanation, nested list, source disclosure, and answer key under review. Use these for visual comparison, not brittle pixel tests.
3. Add a few behavior-focused tests where the existing suite is thin: repository compatibility with saved active and completed attempts, transition order for leave/abort/finish, and a screen-level flow for both feedback modes. Do not duplicate tests for pure functions already covered by `quizEngine.test.ts`.
4. Run `npm test`, `npm run validate:content`, and `npm run build`; record their baseline outcomes. Keep a diff or checksum of source-derived question data and correction files so later steps can prove they were untouched.

Baseline on 2026-09-16: all 20 tests pass; content validation passes for 10,196 questions across 98 quizzes with 32 existing answer-review warnings; TypeScript and Vite build pass. Vite reports an existing large-chunk warning for the bundled question bank.

### 1. Extract presentation without changing state ownership

5. Move each screen out of `App.tsx` into `src/app/screens/`: `DashboardScreen`, `SubjectScreen`, `SetupScreen`, `QuizScreen`, and `ResultsScreen`. Move the header and exit dialog into `src/app/components/` if they still have a clear single purpose after extraction. Define explicit props for data and callbacks; keep repository reads and writes in the current parent for this step. Do not import the concrete repository from screen components.
6. Move `Stopwatch`, `FeedbackPanel`, `ExplanationContent`, and its inline/list renderers into small feature components under `src/app/components/feedback/` and `src/app/components/quiz/`. Keep explanation parsing in `src/content`. Preserve the current MUI props, text, element order, spacing, colors, accessibility labels, and choice highlighting while moving markup.
7. Extract the repeated label/value card markup used by dashboard and results into a small `StatCard` only if the shared API remains simple. Use data descriptors for repeated cards; avoid a generic card abstraction for subject and quiz cards, whose behavior differs.
8. Move all screen components to module scope. Check the setup-mode and quiz-state behavior when the parent rerenders: this is the main risk when changing component identity. Prefer explicit state ownership and remount keys over relying on nested component remounting. Compare the same navigation and screenshot baseline after each screen move.

### 2. Isolate attempt workflow from presentation

9. Put the discriminated `View` type and navigation helpers in `src/app/navigation.ts`. Keep the same five views and the same back destinations. Resolve a quiz's subject in one helper rather than repeating `listSubjects().find(...)` in setup, leave, abort, and results.
10. Consolidate `openQuiz`, `start`, response/checkpoint updates, finish, leave, and abort into a focused `useQuizSession` hook or application controller under `src/app/session/`. Inject `QuizRepository` and `AttemptRepository` through its constructor or hook arguments. It should call the existing pure domain functions; scoring and timer math stay in `src/domain/quizEngine.ts`.
11. Keep `pagehide` pause and legacy response normalization in the quiz session boundary. Make effect cleanup and the latest attempt explicit so rapid navigation or closure cannot save an older checkpoint. Preserve the existing localStorage keys and object shapes; do not add a migration for a structural move.
12. Replace the current `useMemo(..., [view])` dashboard statistic dependency with a clear attempt-state update or a fresh repository read on navigation. Confirm the same visible counts after completing a quiz. Avoid introducing a broad global store for this small app.
13. Test the controller with an in-memory implementation of the existing repository interfaces. Cover the ordered writes for start, resume, checkpoint, leave, abort, and finish, including elapsed time and the current question ID. Then repeat the end-to-end UI flow from step 0.

### 3. Split explanation responsibilities along existing boundaries

14. Split `src/content/explanations.ts` by responsibility: `explanationCatalog.ts` for static enrichment loading and `explanationFor`, `sourceRationale.ts` for source splitting/formatting and preservation checks, and `explanationParser.ts` for the restricted Markdown parser and block types. Keep a small compatibility barrel only if existing imports make it useful.
15. Keep formatting transformations source-preserving. Move regexes next to the function that owns them, but do not adjust their matching behavior in the same commit as the file move. Keep `explanationValidation.ts` and the audit script consuming the same public functions and provenance values.
16. Add fixture tests for representative actual shapes before any later parser cleanup: choice-by-choice rationale, nested bullets, citations inside prose, source lists, and text with medical symbols. Compare parsed blocks and normalized visible text. Leave the raw `rationale`, `explanationEnrichment.json`, and `aiExplanations.json` unchanged.

### 4. Improve small modules and the development-time pipeline

17. Reformat compressed domain, analytics, persistence, validation, QA, theme, entry point, and test files for readable diffs. Extract a helper only where a repeated rule or meaningful invariant exists. Keep `AttemptRepository` as the persistence boundary and do not add direct localStorage calls to React components.
18. In a separate pipeline change, split `scripts/build_question_bank.py` into narrowly named extraction, assembly, and CLI/output modules. Keep source-specific overrides with comments or a dedicated data module, and preserve their exact behavior. Do not combine this with changes to extraction heuristics.
19. For pipeline verification, run the extractor on representative PDFs into a temporary output location and compare parsed question IDs, order, stems, choices, answers, rationales, quiz statuses, and review entries against the pre-refactor output. Only replace generated artifacts when output is equivalent. This requires explicit support for an alternate output directory or a wrapper that does not overwrite committed source data.
20. Update `docs/architecture.md` with the resulting app/session/component and content-processing boundaries. Update `docs/testing.md` with the new behavior and extraction parity checks. Keep source-of-truth rules in `docs/question-schema.md` and `docs/content-pipeline.md` aligned if module paths change.

## Suggested target layout

```text
src/app/
  App.tsx                    # composition and top-level navigation
  navigation.ts              # View type and route helpers
  screens/                   # dashboard, subject, setup, quiz, results
  components/
    StatCard.tsx
    quiz/                     # stopwatch, question/choice display, exit dialog
    feedback/                 # feedback panel and explanation renderer
  session/                   # attempt workflow, repository coordination, effects
src/content/
  explanationCatalog.ts      # static enrichment and lookup
  sourceRationale.ts         # PDF-derived formatting and preservation
  explanationParser.ts       # restricted Markdown to typed blocks
  explanationValidation.ts
  questionBank.ts            # generated bank adapter and corrections
src/domain/                  # unchanged pure rules and model types
src/persistence/             # unchanged repository contract and local adapter
scripts/                     # extraction, assembly, CLI/output entry point
```

The names are suggested boundaries, not a requirement to create every file. If a module would only forward one function with no clearer ownership, keep it together.

## Review gates and completion criteria

- Keep phases 1, 2, 3, and 4 as separate reviewable changes. At each gate, run `npm test`, `npm run validate:content`, and `npm run build`; compare the relevant baseline flows and screenshots. Pipeline changes also need output parity on representative PDFs.
- No user-visible wording, layout, behavior, localStorage key, persisted shape, source-derived question content, answer provenance, or stable ID changes. Any discovered bug or content discrepancy gets a separate issue or change rather than being silently folded into this refactor.
- `App.tsx` becomes a small composition/navigation entry point. Screens own presentation, the session boundary owns writes and effects, domain functions remain pure, and content modules own parsing and provenance.
- Repetition is reduced where the same behavior or presentation appears more than once, while feature-specific components remain easy to read. The new boundaries should allow a second persistence adapter later without editing screen components.
- Once all phases pass and architecture/testing docs reflect the final structure, move this tracker to `docs/work/done`.
