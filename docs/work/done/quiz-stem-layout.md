# Quiz stem paragraph layout fix

Status: complete; implementation and verification finished on 2026-10-07.

## Findings

- `QuizScreen` renders `MarkdownContent` directly inside a horizontal MUI `Stack` beside the flag button. Markdown block nodes become separate flex items and appear side by side.
- `QuizReviewScreen` has the same structure, including when the question is unflagged.
- `QuizBrowseScreen` uses normal block flow and is unaffected.
- `FlashcardStudyCard` already wraps front content in a full-width `Box`; its flag is positioned absolutely. Its answer content also has a wrapper. These faces are unaffected by this horizontal layout bug.
- A single newline is a Markdown soft break, normally displayed as whitespace. Blank lines create separate paragraphs. The layout fix preserves these existing Markdown semantics.

## Implementation plan

- [x] Inspect affected quiz and flashcard layouts and repository testing guidance.
- [x] Reproduce with fixture stems containing multiple paragraphs and a paragraph followed by a list.
- [x] In `QuizScreen` and `QuizReviewScreen`, wrap each stem renderer in a `Box` with `flex: 1` and `minWidth: 0`. Keep the flag as the adjacent, non-shrinking flex item.
- [x] Remove the hover background change and click ripple from the interactive flag `IconButton`s in `QuizScreen` and `FlashcardStudyCard`, using `disableRipple` and a transparent hover background. Preserve an explicit visible keyboard focus indicator, accessible labels, and flag toggling. The quiz review flag is a static indicator and has neither effect.
- [x] Add focused screen regression coverage for multi-block stems and flag behavior. Verify review with and without a flag.
- [x] Add browser layout assertions showing that the second paragraph starts below the first at desktop and narrow widths, with no page overflow. Exercise a list and rich math/image content using fixtures.
- [x] Confirm multi-paragraph flashcard fronts and answers remain centered, vertically ordered, and compatible with flagging and reveal/hide interactions. Flashcard layout required no change.
- [x] Run frontend gates from `docs/testing.md`: lint, format check, architecture tests, unit tests, content validation, and the type-checking production build; run both learner/admin browser suites and both build modes required for feature UI changes.
- [x] Run `git diff --check` and move this tracker to `docs/work/done`.

## Verification

- `npm run lint` — passed; architecture graph valid (189 modules, 836 imports).
- `npm run format:check` — passed.
- `npm test` — passed (61 files, 359 tests).
- `npm run validate:content` — passed (11,687 questions and 1,072 flashcards).
- `npm run build` — passed with the existing large-chunk advisory.
- `npm run test:e2e` — passed (11 tests); the quiz fixture checks paragraph and list positions at desktop/mobile widths and mobile horizontal overflow.
- Focused learner browser rerun after adding direct hover-background and ripple assertions for quiz and flashcard flags — passed (2 flows).
- `VITE_BUILD_ADMIN=true VITE_ENABLE_LOCAL_ADMIN=true npm run build` — passed with the existing large-chunk advisory.
- `npm run test:e2e:admin` — passed (2 tests).
- `git diff --check` — passed.

## Scope and acceptance

This is a quiz screen layout correction plus a visual interaction adjustment to quiz and flashcard flag buttons. Do not alter canonical content, IDs, answer provenance, Markdown parsing, or persistence.

All rendered stem blocks occupy one vertical content area beside the flag. Multi-paragraph stems render in reading order on desktop and mobile. Interactive flag buttons show no hover background change or click ripple, retain a visible keyboard focus indicator, and continue to toggle normally. Browsing and flashcard rich-content rendering remain intact.

Rendering every single newline as a visible line break would be a separate Markdown behavior change and is not included in this plan.
