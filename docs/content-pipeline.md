# Content pipeline

1. Install the development extractor with `python3 -m pip install -r requirements-content.txt`.
2. Run `python3 scripts/build_question_bank.py --pdf "tn-pdfs/<subject>/tests/<file>.pdf"`.
3. Merge partials with `python3 scripts/merge_question_bank.py`.
4. Inspect `content/review-report.json`; unresolved PDFs remain disabled.
5. Retain `sourceAnswer`; add `verifiedAnswer` only after review and document it with `answerNote`.
6. Run `npm run audit:explanations` to identify explanation shapes and questions missing an explanation. The generated `content/explanation-audit.json` is a review artifact and is not runtime content.
7. Format source explanations through the renderer or add reviewed entries to `src/content/explanationEnrichment.json`. Development-time AI explanations for items without a source rationale live in `src/content/aiExplanations.json`; the loader marks them `ai_draft_reviewed`. Record unresolved answer-key conflicts with `answerReviewNote`. The running app never calls an LLM.
8. Run `npm run validate:content`, `npm test`, and `npm run build`.

The source PDFs are authoritative. The UI deliberately disables quizzes until their content has undergone this review.

The Legal Medicine Practice Test 1 PDF has repeated page headers and watermarks embedded in four extracted choice D strings. Two Internal Medicine choice D strings include the next case vignette. `src/content/choiceCorrections.json` records the intended choice text for these six stable IDs; the generated extraction remains intact for provenance. Review any new correction against its PDF before adding it.
