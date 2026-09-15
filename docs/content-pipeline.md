# Content pipeline

1. Install the development extractor with `python3 -m pip install -r requirements-content.txt`.
2. Run `python3 scripts/build_question_bank.py --pdf "tn-pdfs/<subject>/tests/<file>.pdf"`.
3. Merge partials with `python3 scripts/merge_question_bank.py`.
4. Inspect `content/review-report.json`; unresolved PDFs remain disabled.
5. Retain `sourceAnswer`; add `verifiedAnswer` only after review and document it with `answerNote`.
6. Run `npm run validate:content`, `npm test`, and `npm run build`.

The source PDFs are authoritative. The UI deliberately disables quizzes until their content has undergone this review.
