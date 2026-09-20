# Canonical Markdown content migration

## Objective

Store display-ready GitHub Flavored Markdown directly in the canonical question bank, render it through one safe shared React component, and remove runtime rationale-formatting and custom Markdown-parsing code.

## Guardrails

- Preserve stable IDs, question/choice order, answer provenance, and medical wording.
- Treat canonical JSON as the only authoring source.
- Allow only CommonMark/GFM at runtime; raw HTML and MDX remain disabled.
- Use deterministic migration tooling and content-equivalence checks before replacing the bank.

## Progress

- [x] Add schema-v2 types and content validation.
- [x] Add shared Markdown renderer and rendering tests.
- [x] Add deterministic migration and baseline comparison tooling.
- [x] Migrate and validate the canonical JSON.
- [x] Switch all learner and QA surfaces.
- [x] Remove the legacy runtime formatting/parser/catalog modules.
- [x] Update documentation and complete verification.

## Completion (2026-09-20)

The canonical bank is now schema version 2. All 10,196 records have a required GFM `rationale`; 121 formerly embedded explanation bodies were moved into that field, 227 source disclosures were retained in `rationaleMeta.sources`, and all 32 answer-review notes remain in `rationaleMeta.answerReviewNote`. Stems were normalized from extraction line wraps into canonical Markdown prose. IDs, question/choice order, answer provenance, metadata, and normalized visible text passed the migration comparison.

The app renders Markdown through `react-markdown` plus `remark-gfm` and does not enable raw HTML. Content validation parses every Markdown field and rejects raw HTML, images, and unsafe URLs. The runtime explanation formatter, fallback catalog, and custom parser were removed.

Verification passed: `npm test` (41 tests), `npm run validate:content` (10,196 questions with 32 pre-existing answer-review warnings), `npm run audit:explanations`, `npm run build`, and `git diff --check`.
