# Explanation formatting plan

## Goal and current state

Make stored question explanations easier to scan without changing their medical claims, source answers, question stems, choices, or stable IDs. Keep the PDF-derived `rationale` as an unchanged source record and store editorial formatting separately. For questions with no source explanation, have the AI agent draft an explanation during development and review it before it becomes static quiz content.

The bank contains 10,196 questions, 10,075 with a source `rationale` and 121 without one. The median source rationale is about 556 characters; 1,390 exceed 1,000 characters. Most contain PDF line breaks, and many contain bullets, choice-by-choice discussions, or flattened tables. The source strings remain unchanged; formatting, AI explanations, and choice extraction corrections are stored separately so a content rebuild retains them.

## Progress (2026-09-16)

- The feedback UI converts source rationales into semantic paragraphs and lists at render time, retaining the source strings. Trailing source lists render in a separate disclosure collapsed by default.
- All 121 items without source rationales now have approved static AI explanations: one in `src/content/explanationEnrichment.json` and 120 in `src/content/aiExplanations.json`. No runtime AI call is used.
- Six PDF extraction spillovers in answer choices have separate corrections in `src/content/choiceCorrections.json`, while raw extracted strings remain available for provenance.
- `npm run audit:explanations` generates `content/explanation-audit.json`; it reports zero items without an explanation and checks that source formatting preserves the original text.
- Enrichment validation checks stable IDs, review metadata, provenance, raw-HTML exclusion, and whether an AI-authored explanation is eligible for a question with no source rationale.
- Browser checks covered a choice-by-choice rationale, a collapsed source disclosure, a generated explanation, and the corrected “Thermal burn edge” choice.

Thirty-two items have answer-key review notes because the PDF-provided key conflicts with the stem, choices, or reference evidence. The quiz displays an amber “Answer key under review” message for these items, and the results page warns that their source keys affect the score. Resolving these keys with verified answers remains open in this tracker.

## Steps

1. **Inventory and classify the source explanations.** Produce a repeatable, read-only report keyed by stable question ID, subject, quiz, PDF, length, and detected patterns. Classify plain prose, existing bullets, choice-by-choice text, nested lists, tables, diagrams, and possible extraction damage. Sample each subject and review the longest explanations. Flag content that appears to include the next question or missing table structure for source-PDF review; do not silently repair it as formatting.

2. **Set the editorial rules and storage contract.** Document a small supported format: paragraphs, headings where the source supplies a heading, ordered and unordered lists with one nesting level, and restrained bold/italics. When formatting an existing explanation, preserve every substantive word, number, unit, choice label, and medical claim. Do not change answer provenance or turn uncertain source text into a confident claim. Keep source `rationale` intact; place formatted and newly authored explanations in a separate, ID-keyed, version-controlled enrichment file with provenance such as `source_formatted` or `ai_draft_reviewed`, so extraction and merge runs cannot erase them. Prefer a restricted Markdown subset if a pilot shows it can represent the actual source patterns; otherwise use typed blocks for tables or other cases Markdown cannot faithfully express.

3. **Build and validate the rendering path.** Load the optional formatted or newly authored explanation by stable question ID. Render only the supported syntax as React/MUI elements with semantic paragraphs and lists; show the original rationale when no enrichment exists. Avoid raw HTML. Check narrow screens, long medical terms, list indentation, readable line length, screen-reader order, and immediate feedback. Keep scoring and question rendering unchanged.

4. **Prove the workflow with a representative pilot.** Format a small set from several subjects: one short paragraph, one long prose explanation, a bulleted explanation, nested bullets, choice-by-choice text, and a flattened table. Compare each result with its PDF and raw rationale. Use the pilot to settle rules for PDF soft line breaks, `A`/`B`/`C`/`D` labels, leading answer labels, and cases that must remain plain text pending source review.

5. **Add preservation and provenance checks.** Validate that every enrichment entry refers to an existing stable question ID, uses supported syntax, declares its provenance, and renders without empty blocks. For formatted source explanations, compare extracted visible text with the raw rationale after only documented layout normalization (for example, line wrapping and list markers); flag any changed words, digits, units, or punctuation for human review. For AI-authored explanations, require an absent source rationale, a documented evidence/review status, and consistency with the question, choices, and verified answer when one exists. Keep an explicit exception record for source defects rather than relaxing checks globally. Add fixture tests for nested lists, literal medical symbols, and table or extraction edge cases.

6. **Work through the bank in reviewable batches.** Start with long and frequently structured explanations, then cover the remaining subjects or quizzes in stable-ID order. For each batch, use mechanical formatting only where the pattern is unambiguous, then manually review every transformed item against the source text. Track counts of formatted, unchanged, missing, and source-review-needed explanations. Review diffs for wording changes and avoid formatting a table as prose when its row relationships are unclear.

7. **Generate explanations for items with none.** For each question lacking a source rationale, the AI agent drafts a concise, structured explanation during development, using the stem, choices, answer provenance, and source PDF as context. Check the answer key rather than assuming it is correct; if the evidence is ambiguous or conflicts with the key, flag the item for answer review instead of presenting a confident explanation. Review medical accuracy and wording before adding the draft to the static enrichment file. Record that it was AI-authored and reviewed; never call an LLM from the running app.

8. **Verify and close each batch.** Run `npm run validate:content`, `npm test`, and `npm run build`. Visually inspect representative explanations at desktop and mobile widths. Confirm that a fresh content build retains the separate enrichment file and that questions without formatted content still display their raw rationale. Move this tracker to `docs/work/done` when coverage and source-review decisions are documented and all relevant checks pass.

## Completion criteria

- Every available source explanation is either formatted and reviewed, intentionally left as source text, or flagged for source-PDF review with a reason. Every item without a source explanation has a reviewed AI-authored explanation or an explicit answer/source-review flag.
- Source rationales and answer provenance remain unchanged; formatted text has no unreviewed substantive differences.
- The feedback UI presents paragraphs and lists as actual structure, with a readable fallback for unformatted explanations.
- Content validation, tests, build, and mobile/desktop visual checks pass.
