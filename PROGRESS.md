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

- 98 actual test PDFs are enabled, containing 10,196 source-derived questions.
- The Microbiology & Parasitology flashcard PDF under `tests/` is intentionally excluded.
- Layout variants handled include inline columns, punctuation variants, numbering without periods, duplicated numbering artifacts, repeated discussion blocks, and 300-question Supersamplex files.
- Two missing printed answer labels are represented as verified-answer overrides with provenance notes based on their source discussions.

## Next work

1. Continue editorial review of extracted rationales and metadata enrichment.
2. Add page-level source references during future content audits.
3. Expand analytics metadata beyond subject-level discipline tags.
