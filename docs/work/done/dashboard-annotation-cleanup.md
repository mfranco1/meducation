# Dashboard annotation cleanup

## Status

Implementation complete; build verification pending

## Scope

Apply the five dashboard annotations from the browser review without changing quiz behavior, persistence, question content, or subject navigation.

## Annotation checklist

- [x] Remove the completed-attempt chip from the header.
- [x] Replace the three-part dashboard introduction with one short line: “Choose a subject and start practicing.”
- [x] Remove the “ready to study” subtitle from every subject card.
- [x] Remove each subject card’s accent dot and move the quiz-count chip below the subject title, left-aligned.
- [x] Capitalize the app name to “Meducation” and add Material UI’s open-book icon to its left.

## Implementation checklist

- [x] Update the header markup and icon import in `src/app/App.tsx`.
- [x] Simplify the dashboard introduction and adjust its spacing.
- [x] Restructure subject-card content while preserving click, hover, best-score, and responsive behavior.
- [x] Check keyboard focus and the accessible app-name label.
- [x] Verify the dashboard at the reviewed narrow viewport against the annotations.
- [ ] Run `npm run build` (command exceeded its normal completion window in this environment).
- [x] Run `npm test` (3 tests passed).
- [x] Record verification results and move this tracker to `docs/work/done`.

## Acceptance criteria

- The header contains only the “Meducation” home action with an open-book icon.
- The dashboard introduction is one concise line.
- Subject cards show the subject title followed by a left-aligned quiz-count chip, with no accent dot or readiness subtitle.
- Existing dashboard statistics, subject navigation, saved progress, and best-score behavior continue to work.
