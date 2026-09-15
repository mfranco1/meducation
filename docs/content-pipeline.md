# Content pipeline

1. Run `npm run extract:pdf -- "tn-pdfs/<subject>/tests/<file>.pdf"` (install Poppler first).
2. Preserve raw extracted text in `content/raw/`; do not use it directly at runtime.
3. Transcribe questions into `src/content/questionBank.ts` with the stem and choices exactly as in the PDF, stable IDs, and source page.
4. Retain `sourceAnswer`, add `verifiedAnswer` only after review, and document disagreements with `answerNote`.
5. Add enrichment/metadata separately; then mark the quiz `ready` and set its question count.
6. Run `npm run validate:content`, `npm test`, and `npm run build`.

The source PDFs are authoritative. The UI deliberately disables quizzes until their content has undergone this review.
