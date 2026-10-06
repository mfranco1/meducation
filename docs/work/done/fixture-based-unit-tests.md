# Keep unit tests independent from production banks

- [x] Inspect test imports, adapter behavior, and performance findings.
- [x] Replace all Vitest production JSON imports, including transitive imports, with small fixtures in shared setup.
- [x] Retain adapter coverage for ordered membership, empty catalogs, sparse metadata, and answer provenance.
- [x] Remove full-corpus Markdown and backend canonical-load tests; keep the standalone content gate.
- [x] Update testing guidance and run all relevant checks.
- [x] Compare elapsed frontend time and record the results.

The shared question fixture has two subjects, three quizzes with interleaved subject membership, and four questions grouped contiguously by quiz. It satisfies stored and hydrated question-bank validation. Flashcard tests default to the existing small populated contract fixture; the authoring panel retains its explicit empty baseline. Runtime code, bank contents, and the test pool remain unchanged.

## Verification

- Frontend: 61 files and 363 tests passed. The final local run took 54.64 seconds versus the investigation baseline of 105.37 seconds; elapsed time varies between runs.
- The duplicated full-bank Markdown test previously took 34.201 seconds. The six focused Markdown tests now take approximately 42 milliseconds of test time.
- Backend: all 39 tests passed in 0.71 seconds.
- ESLint, formatting, backend Ruff and mypy, TypeScript, learner build, and optional admin build passed.
- Standalone `npm run validate:content` passed against the actual 11,687 questions and 674 flashcards. Existing answer-review warnings remain.
- Existing backend dependency deprecation and Vite chunk-size warnings remain.
- Canonical question and flashcard files were not modified. CI retains the standalone full-bank validation gate.
