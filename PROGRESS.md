# Meducation progress

## Implemented

- [x] Vite + React + TypeScript + MUI application foundation and autumn light theme
- [x] Domain models, pure scoring rules, analytics aggregation, and repository abstraction
- [x] localStorage attempt persistence (active and completed attempts)
- [x] Dashboard, subject navigation, setup, one-at-a-time quiz UI, flags, stopwatch, immediate/exam modes, results
- [x] Content validation and development-only extraction command
- [x] Developer inspection screen at `/#content-qa`
- [x] Initial unit tests and architecture/content documentation
- [x] Cataloged all discovered practice-test PDFs by subject/test

## Content status

No PDF questions have been marked ready: extracting text is not the same as validating source-faithful questions and answer keys. The app intentionally keeps these quizzes unavailable until reviewed content is added. Follow `docs/content-pipeline.md` to import each quiz without silently altering source material.

## Next work

1. Install Poppler and extract each PDF.
2. Populate reviewed question data and verified-answer provenance.
3. Expand test coverage as content is imported, including analytics across tagged questions.
