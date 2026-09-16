# Content pipeline

1. Install the development extractor with `python3 -m pip install -r requirements-content.txt`.
2. Run `python3 scripts/build_question_bank.py --pdf "tn-pdfs/<subject>/tests/<file>.pdf"`.
3. Merge partials with `python3 scripts/merge_question_bank.py`.
4. Inspect `content/review-report.json`; unresolved PDFs remain disabled.
5. Retain `sourceAnswer`; add `verifiedAnswer` only after review and document it with `answerNote`.
6. Run `npm run audit:explanations` to identify explanation shapes and questions missing an explanation. The generated `content/explanation-audit.json` is a review artifact and is not runtime content.
7. Format source explanations through the renderer or add reviewed entries to `src/content/explanationEnrichment.json`. For an item without a source rationale, draft and review a static explanation during development, mark it `ai_draft_reviewed`, and never introduce a runtime AI call.
8. Run `npm run validate:content`, `npm test`, and `npm run build`.

The source PDFs are authoritative. The UI deliberately disables quizzes until their content has undergone this review.
